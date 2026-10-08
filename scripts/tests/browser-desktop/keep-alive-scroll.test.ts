import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { slotReveal } from "@/lib/browser-shell/keep-alive";
import { cancelScrollRestore, installSlotScrollMemory, scheduleScrollRestore } from "@/lib/browser-shell/scroll";

// Scroll across a kept-alive slot's hide / show (lib/browser-shell/scroll.ts, TabSlot): the slot
// memory must not keep replaced pages alive, and a slot shown again on another entry of its tab
// must let that entry's restore reach the page it shows.

type Listener = (event: { target: unknown }) => void;

class FakeEl {
  readonly attrs: Record<string, string>;
  readonly children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  scrollTop = 0;
  scrollLeft = 0;
  scrollHeight = 800;
  clientHeight = 800;
  /** `display: none` (a hidden slot): no layout box for it or anything inside. */
  hidden = false;
  private readonly listeners: Listener[] = [];

  constructor(attrs: Record<string, string> = {}, children: FakeEl[] = []) {
    this.attrs = attrs;
    for (const child of children) this.append(child);
  }

  append(child: FakeEl): void {
    child.parentElement = this;
    this.children.push(child);
  }

  remove(): void {
    const parent = this.parentElement;
    if (parent) parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
  }

  get isConnected(): boolean {
    return this === body || (this.parentElement?.isConnected ?? false);
  }

  get displayed(): boolean {
    return !this.hidden && (this.parentElement?.displayed ?? true);
  }

  getClientRects(): number[] {
    return this.isConnected && this.displayed ? [1] : [];
  }

  descendants(): FakeEl[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  contains(el: FakeEl): boolean {
    return el === this || this.descendants().includes(el);
  }

  matches(selector: string): boolean {
    if (selector === "[data-tab-scroll-root]") return "data-tab-scroll-root" in this.attrs;
    if (selector === "[data-tab-slot]") return "data-tab-slot" in this.attrs;
    return false;
  }

  querySelectorAll(selector: string): FakeEl[] {
    return this.descendants().filter((el) => el.matches(selector));
  }

  addEventListener(type: string, listener: Listener): void {
    if (type === "scroll") this.listeners.push(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    const index = this.listeners.indexOf(listener);
    if (type === "scroll" && index >= 0) this.listeners.splice(index, 1);
  }

  /** A scroll event from `target` reaching this element in the capture phase. */
  scrolled(target: FakeEl): void {
    for (const listener of this.listeners) listener({ target });
  }
}

let body = new FakeEl();
let content = new FakeEl();

function root(scrollHeight = 3000): FakeEl {
  const el = new FakeEl({ "data-tab-scroll-root": "" });
  el.scrollHeight = scrollHeight;
  return el;
}

/** A TabSlot: slot element > <main data-tab-scroll-root> (never overflows) > the page's root. */
function slot(tabId: string, page: FakeEl, extra: FakeEl[] = []): FakeEl {
  const el = new FakeEl({ "data-tab-slot": tabId, "data-tab-active": "true" }, [root(800)]);
  el.children[0].append(page);
  for (const child of extra) el.children[0].append(child);
  content.append(el);
  return el;
}

function setShown(el: FakeEl, shown: boolean): void {
  el.attrs["data-tab-active"] = shown ? "true" : "false";
  el.hidden = !shown;
}

function slots(): FakeEl[] {
  return content.children.filter((el) => el.matches("[data-tab-slot]"));
}

/** Answers the selectors lib/browser-shell/scroll.ts uses. */
const fakeDocument = {
  querySelector(selector: string): FakeEl | null {
    const byId = /data-tab-slot="([^"]+)"/.exec(selector);
    if (byId) return slots().find((el) => el.attrs["data-tab-slot"] === byId[1]) ?? null;
    if (selector.includes('[data-tab-active="true"]')) return slots().find((el) => el.attrs["data-tab-active"] === "true") ?? null;
    if (selector.includes("[data-tab-slot]")) return slots()[0] ?? null;
    if (selector.includes("#desktop-content")) return content;
    return null;
  },
};

const globals = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  for (const key of ["window", "document", "Element", "requestAnimationFrame", "cancelAnimationFrame"]) saved[key] = globals[key];
  body = new FakeEl();
  content = new FakeEl();
  body.append(content);
  Object.assign(globals, {
    window: {},
    document: fakeDocument,
    Element: FakeEl,
    requestAnimationFrame: (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 1),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
});

afterEach(() => {
  cancelScrollRestore();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globals[key];
    else globals[key] = value;
  }
});

describe("slot scroll memory holds scrollers weakly", () => {
  /** Scrolls a page in `el`, then replaces it (an in-tab navigation), leaving no reference to it. */
  function scrollThenReplace(el: FakeEl): WeakRef<FakeEl> {
    const page = root();
    el.children[0].append(page);
    page.scrollTop = 700;
    el.scrolled(page);
    page.remove();
    return new WeakRef(page);
  }

  test("a page replaced in the tab is not kept alive by the slot that stays on screen", async () => {
    const el = slot("t_a", root());
    const memory = installSlotScrollMemory(el as unknown as HTMLElement);
    const replaced = scrollThenReplace(el);
    for (let i = 0; i < 10 && replaced.deref(); i++) {
      await sleep(1);
      Bun.gc(true);
    }
    expect(replaced.deref()).toBeUndefined();
    memory.uninstall();
  });

  test("scrollers that are still there keep coming back", () => {
    const page = root();
    const list = new FakeEl();
    const el = slot("t_a", page, [list]);
    const memory = installSlotScrollMemory(el as unknown as HTMLElement);
    page.scrollTop = 500;
    el.scrolled(page);
    scrollThenReplace(el);
    list.scrollLeft = 40;
    el.scrolled(list);
    page.scrollTop = 520;
    el.scrolled(page);

    setShown(el, false);
    page.scrollTop = 0;
    list.scrollLeft = 0;
    setShown(el, true);
    memory.restore();
    expect(page.scrollTop).toBe(520);
    expect(list.scrollLeft).toBe(40);
    memory.uninstall();
  });
});

describe("a slot shown again on another entry of its tab", () => {
  // Tab B showed /manager/sales, scrolled; the user switched to A, then went back (from A) to an
  // older entry of B, skipping the one B was hidden on. The bridge schedules that entry's restore
  // for B while B's slot is still hidden; the commit that renders the entry reveals B's slot.
  function hiddenTabB(page: FakeEl, extra: FakeEl[] = []) {
    slot("t_a", root());
    const b = slot("t_b", page, extra);
    const memory = installSlotScrollMemory(b as unknown as HTMLElement);
    page.scrollTop = 640;
    b.scrolled(page);
    setShown(b, false);
    page.scrollTop = 0;
    return { b, memory };
  }

  for (const bridgeReusedRoot of [false, true]) {
    test(`another page: the restore waits for the new page's root (bridge reuseRoot ${bridgeReusedRoot})`, async () => {
      const oldPage = root();
      const { b, memory } = hiddenTabB(oldPage);
      scheduleScrollRestore(1200, bridgeReusedRoot, { tabId: "t_b" });
      await sleep(10);
      expect(oldPage.scrollTop).toBe(0);

      setShown(slots()[0], false);
      setShown(b, true);
      expect(slotReveal({ urlKey: "/manager/sales", pathname: "/manager/sales" }, { urlKey: "/manager/inventory", pathname: "/manager/inventory" })).toBe("page");
      memory.restore({ tabId: "t_b", samePathname: false });
      await sleep(10);
      // The exiting page belongs to the entry that was left: neither its own offset nor the new one.
      expect(oldPage.scrollTop).toBe(0);

      oldPage.remove();
      const newPage = root();
      b.children[0].append(newPage);
      await sleep(20);
      expect(newPage.scrollTop).toBe(1200);
      memory.uninstall();
    });
  }

  test("the same page with other search params: the restore applies to the root it kept", async () => {
    const page = root();
    const list = new FakeEl();
    const { b, memory } = hiddenTabB(page, [list]);
    list.scrollLeft = 90;
    b.scrolled(list);
    list.scrollLeft = 0;
    scheduleScrollRestore(900, false, { tabId: "t_b" });

    setShown(slots()[0], false);
    setShown(b, true);
    memory.restore({ tabId: "t_b", samePathname: true });
    expect(list.scrollLeft).toBe(90);
    await sleep(20);
    expect(page.scrollTop).toBe(900);
    memory.uninstall();
  });

  test("with no restore pending for it (the entry was at the top), the kept root is not put back on the old entry's offset", () => {
    const page = root();
    const { b, memory } = hiddenTabB(page);
    setShown(slots()[0], false);
    setShown(b, true);
    memory.restore({ tabId: "t_b", samePathname: true });
    expect(page.scrollTop).toBe(0);
    memory.uninstall();
  });

  test("the page it was hidden with: its own offsets come back and the pending restore is dropped", async () => {
    const page = root();
    const { b, memory } = hiddenTabB(page);
    scheduleScrollRestore(1500, false, { tabId: "t_b" });
    setShown(slots()[0], false);
    setShown(b, true);
    memory.restore();
    expect(page.scrollTop).toBe(640);
    await sleep(20);
    expect(page.scrollTop).toBe(640);
    memory.uninstall();
  });
});

describe("slotReveal", () => {
  const sales = { urlKey: "/manager/sales", pathname: "/manager/sales" };
  test("compares what the slot shows with what it was hidden with", () => {
    expect(slotReveal(null, sales)).toBe("fresh");
    expect(slotReveal(sales, { ...sales })).toBe("same");
    expect(slotReveal(sales, { urlKey: "/manager/sales?range=week", pathname: "/manager/sales" })).toBe("entry");
    expect(slotReveal(sales, { urlKey: "/manager/inventory", pathname: "/manager/inventory" })).toBe("page");
  });
});
