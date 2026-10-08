import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { createDevToolsInstrumentedPromise } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { TabNavigationProvider, type TabNavigation } from "@/components/browser-shell/core/tab-navigation";
import {
  activeTabRoot,
  cancelScrollRestore,
  findScrollRoot,
  installSlotScrollMemory,
  scheduleScrollRestore,
} from "@/lib/browser-shell/scroll";
import { closeTopDialog, displayedDialogPage, inHiddenSubtree, lastShownDialogClose } from "@/lib/browser-shell/shell-dom";
import { useTabSlotId } from "@/lib/browser-shell/tab-slot-context";

// Keep-alive DOM contract (contract G): every mounted tab page sits in
// `[data-tab-slot][data-tab-active]`, lookups are scoped to the active slot, a slot remembers its
// scroll offsets across `display: none`, React-hidden overlays are ignored, and a slot's page
// reads its own (frozen) navigation through the very contexts next/navigation reads.

type Listener = (event: { target: unknown }) => void;

class FakeEl {
  readonly attrs: Record<string, string>;
  readonly children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  id = "";
  scrollTop = 0;
  scrollLeft = 0;
  scrollHeight = 800;
  clientHeight = 800;
  rendered = true;
  inlineDisplay: { value: string; priority: string } | null = null;
  clicks = 0;
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

  get style() {
    return {
      getPropertyValue: (name: string) => (name === "display" ? this.inlineDisplay?.value ?? "" : ""),
      getPropertyPriority: (name: string) => (name === "display" ? this.inlineDisplay?.priority ?? "" : ""),
    };
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  getClientRects(): number[] {
    return this.rendered ? [1] : [];
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
    if (selector === '[id^="mobile-dialog-"]') return this.id.startsWith("mobile-dialog-");
    if (selector === '[data-slot="dialog-close"]') return this.attrs["data-slot"] === "dialog-close";
    if (selector === "[data-dialog-back]") return "data-dialog-back" in this.attrs;
    return false;
  }

  querySelectorAll(selector: string): FakeEl[] {
    return this.descendants().filter((el) => el.matches(selector));
  }

  querySelector(selector: string): FakeEl | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  closest(selector: string): FakeEl | null {
    return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null;
  }

  click(): void {
    this.clicks++;
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

function slot(tabId: string, active: boolean, children: FakeEl[] = []): FakeEl {
  return new FakeEl({ "data-tab-slot": tabId, "data-tab-active": active ? "true" : "false" }, children);
}

function slots(): FakeEl[] {
  return content.children.filter((el) => el.matches("[data-tab-slot]"));
}

/** Answers the selectors lib/browser-shell/scroll.ts and shell-dom.ts use. */
const fakeDocument = {
  querySelector(selector: string): FakeEl | null {
    const byId = /data-tab-slot="([^"]+)"/.exec(selector);
    if (byId) return slots().find((el) => el.attrs["data-tab-slot"] === byId[1]) ?? null;
    if (selector.includes('[data-tab-active="true"]')) return slots().find((el) => el.attrs["data-tab-active"] === "true") ?? null;
    if (selector.includes("[data-tab-slot]")) return slots()[0] ?? null;
    if (selector.includes("#desktop-content")) return content;
    return body.querySelector(selector);
  },
  querySelectorAll: (selector: string) => body.querySelectorAll(selector),
};

const globals = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  for (const key of ["window", "document", "location", "Element", "requestAnimationFrame", "cancelAnimationFrame"]) saved[key] = globals[key];
  body = new FakeEl();
  content = new FakeEl();
  body.append(content);
  Object.assign(globals, {
    window: {},
    document: fakeDocument,
    location: { search: "" },
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

describe("scroll roots are scoped to the active slot", () => {
  test("activeTabRoot and findScrollRoot ignore a hidden slot's roots", () => {
    const hiddenRoot = root(9000);
    const activeRoot = root(3000);
    content.append(slot("t_a", false, [hiddenRoot]));
    content.append(slot("t_b", true, [activeRoot]));
    expect(activeTabRoot() as unknown).toBe(content.children[1]);
    expect(findScrollRoot() as unknown).toBe(activeRoot);
  });

  test("a restore for a tab waits for that tab's slot and never touches the one on screen", async () => {
    const shownRoot = root();
    content.append(slot("t_a", true, [shownRoot]));
    scheduleScrollRestore(1200, false, { tabId: "t_b" });
    await sleep(20);
    expect(shownRoot.scrollTop).toBe(0);

    // B's kept-alive slot exists but is hidden (no layout box): still waiting.
    const keptRoot = root();
    keptRoot.rendered = false;
    const kept = slot("t_b", false, [keptRoot]);
    content.append(kept);
    await sleep(20);
    expect(keptRoot.scrollTop).toBe(0);

    kept.attrs["data-tab-active"] = "true";
    content.children[0].attrs["data-tab-active"] = "false";
    keptRoot.rendered = true;
    await sleep(20);
    expect(keptRoot.scrollTop).toBe(1200);
    expect(shownRoot.scrollTop).toBe(0);
  });
});

describe("slot scroll memory", () => {
  test("offsets reset by display: none come back when the slot is shown; a pending entry restore is cancelled", async () => {
    const page = root();
    const list = new FakeEl();
    const gone = new FakeEl();
    const el = slot("t_a", true, [page, list, gone]);
    content.append(el);
    const memory = installSlotScrollMemory(el as unknown as HTMLElement);

    page.scrollTop = 640;
    el.scrolled(page);
    list.scrollLeft = 90;
    el.scrolled(list);
    gone.scrollTop = 50;
    el.scrolled(gone);

    // Hidden, then shown again: the browser dropped the offsets.
    page.scrollTop = 0;
    list.scrollLeft = 0;
    gone.remove();
    scheduleScrollRestore(2000, false, { tabId: "t_a" });
    memory.restore();
    expect(page.scrollTop).toBe(640);
    expect(list.scrollLeft).toBe(90);
    await sleep(20);
    expect(page.scrollTop).toBe(640);

    // Back at the start: forgotten.
    page.scrollTop = 0;
    el.scrolled(page);
    page.scrollTop = 30;
    memory.restore();
    expect(page.scrollTop).toBe(30);
    memory.uninstall();
  });
});

describe("React-hidden overlays", () => {
  test("inHiddenSubtree looks for React's inline display: none !important on an ancestor", () => {
    const portal = new FakeEl();
    const popup = new FakeEl();
    portal.append(popup);
    body.append(portal);
    expect(inHiddenSubtree(popup as unknown as Element)).toBe(false);
    portal.inlineDisplay = { value: "none", priority: "" };
    expect(inHiddenSubtree(popup as unknown as Element)).toBe(false);
    portal.inlineDisplay = { value: "none", priority: "important" };
    expect(inHiddenSubtree(popup as unknown as Element)).toBe(true);
  });

  test("closeTopDialog skips a background tab's dialog page and closes the one on screen", () => {
    const hiddenBack = new FakeEl({ "data-dialog-back": "" });
    const hiddenDialog = new FakeEl({}, [hiddenBack]);
    hiddenDialog.id = "mobile-dialog-0";
    const hiddenPortal = new FakeEl({}, [hiddenDialog]);
    hiddenPortal.inlineDisplay = { value: "none", priority: "important" };
    const back = new FakeEl({ "data-dialog-back": "" });
    const dialog = new FakeEl({}, [back]);
    dialog.id = "mobile-dialog-0";
    body.append(hiddenPortal);
    body.append(new FakeEl({}, [dialog]));

    expect(closeTopDialog()).toBe(true);
    expect(back.clicks).toBe(1);
    expect(hiddenBack.clicks).toBe(0);

    dialog.remove();
    expect(closeTopDialog()).toBe(false);
    expect(hiddenBack.clicks).toBe(0);
  });

  test("displayedDialogPage returns the on-screen page, never a hidden tab's page with the same id", () => {
    const hiddenPage = new FakeEl();
    hiddenPage.id = "mobile-dialog-0";
    const hiddenPortal = new FakeEl({}, [hiddenPage]);
    hiddenPortal.inlineDisplay = { value: "none", priority: "important" };
    body.append(hiddenPortal);
    expect(displayedDialogPage(0)).toBeNull();

    const page = new FakeEl();
    page.id = "mobile-dialog-0";
    const nested = new FakeEl();
    nested.id = "mobile-dialog-1";
    body.append(new FakeEl({}, [page, nested]));
    expect(displayedDialogPage(0) as unknown).toBe(page);
    expect(displayedDialogPage(1) as unknown).toBe(nested);
    expect(displayedDialogPage(2)).toBeNull();
  });

  test("lastShownDialogClose skips a hidden tab's close button even when it comes later in the document", () => {
    const close = new FakeEl({ "data-slot": "dialog-close" });
    body.append(new FakeEl({}, [close]));
    const hiddenClose = new FakeEl({ "data-slot": "dialog-close" });
    const hiddenPortal = new FakeEl({}, [hiddenClose]);
    hiddenPortal.inlineDisplay = { value: "none", priority: "important" };
    body.append(hiddenPortal);
    expect(lastShownDialogClose() as unknown).toBe(close);
    close.remove();
    expect(lastShownDialogClose()).toBeNull();
  });

  test("dynamic-ui-element.tsx finds its dialog pages and close buttons only through these helpers", () => {
    // A raw lookup there would pick up a kept-alive background tab's hidden copy.
    const src = readFileSync(join(import.meta.dir, "../../../components/ui/dynamic-ui-element.tsx"), "utf8");
    expect(src).not.toMatch(/getElementById\(`mobile-dialog-/);
    expect(src).not.toMatch(/querySelectorAll[^;]*(mobile-dialog-|dialog-close)/);
    expect(src).not.toMatch(/function (displayedDialogPage|lastShownDialogClose)\b/);
    expect(src).toMatch(/import \{[^}]*\bdisplayedDialogPage\b[^}]*\} from "@\/lib\/browser-shell\/shell-dom"/);
  });
});

describe("a slot's navigation", () => {
  function Probe() {
    const pathname = usePathname();
    const search = useSearchParams()?.toString();
    const params = useParams();
    const router = useRouter();
    return createElement(
      "output",
      null,
      [pathname, search, JSON.stringify(params), String(router === frozenRouter), useTabSlotId()].join("|"),
    );
  }

  const frozenRouter = {
    back: () => {},
    forward: () => {},
    prefetch: () => {},
    refresh: () => {},
    replace: () => {},
    push: () => {},
  };

  function navigation(promises: TabNavigation["promises"]): TabNavigation {
    return {
      layoutRouter: null,
      globalLayoutRouter: { tree: ["", {}], focusAndScrollRef: { apply: false, hashFragment: null, segmentPaths: [], onlyHashChange: false, scrollRef: null, forceScroll: false }, nextUrl: null, previousNextUrl: null } as unknown as TabNavigation["globalLayoutRouter"],
      router: frozenRouter,
      pathname: "/manager/inventory",
      searchParams: new URLSearchParams("view=grid"),
      params: { id: "42" },
      promises,
      urlKey: "/manager/inventory?view=grid",
    };
  }

  test("next/navigation hooks under the provider return the slot's navigation, not the live one", () => {
    const html = renderToStaticMarkup(
      createElement(TabNavigationProvider, { navigation: navigation(null), router: frozenRouter, tabId: "t_a" }, createElement(Probe)),
    );
    expect(html).toBe('<output>/manager/inventory|view=grid|{&quot;id&quot;:&quot;42&quot;}|true|t_a</output>');
  });

  test("in development the frozen NavigationPromisesContext (read first by the hooks) is provided too", () => {
    const promises = {
      pathname: createDevToolsInstrumentedPromise("usePathname", "/manager/sales"),
      searchParams: createDevToolsInstrumentedPromise(
        "useSearchParams",
        new URLSearchParams("q=1") as unknown as Parameters<typeof createDevToolsInstrumentedPromise>[1],
      ),
      params: createDevToolsInstrumentedPromise("useParams", {}),
    } as unknown as TabNavigation["promises"];
    const html = renderToStaticMarkup(
      createElement(TabNavigationProvider, { navigation: navigation(promises), router: frozenRouter, tabId: null }, createElement(Probe)),
    );
    expect(html).toBe("<output>/manager/sales|q=1|{}|true|</output>");
  });
});
