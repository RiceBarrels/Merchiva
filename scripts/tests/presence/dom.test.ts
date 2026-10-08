// The DOM side of page presence (lib/presence/dom.ts) on fake element trees: what a click is
// anchored to, and where a colleague's cursor lands on this viewer's screen. `document` and
// `getComputedStyle` are stubbed per test and restored after it.

import { afterEach, describe, expect, test } from "bun:test";
import { decodeAnchor, type AnchorNode } from "@/lib/presence/anchor";
import { clippingAncestors, createAnchorCache, describeClick, locatePersonCursor } from "@/lib/presence/dom";
import type { Box } from "@/lib/presence/geometry";

/** A minimal laid-out element: the AnchorNode surface plus the few DOM calls dom.ts makes. */
class El implements AnchorNode {
  readonly tagName: string;
  parentElement: El | null = null;
  readonly children: El[];
  readonly style = { transform: "" };
  readonly isConnected = true;
  rect: Box;
  overflow: readonly [string, string] = ["visible", "visible"];
  private readonly attrs: Record<string, string>;

  constructor(tag: string, attrs: Record<string, string>, rect: Box, children: El[]) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.rect = rect;
    this.children = children;
    for (const child of children) child.parentElement = this;
  }

  getAttribute(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  querySelectorAll(selector: string): El[] {
    const m = /^(\w*)(?:\[([\w-]+)\])?$/.exec(selector);
    if (!m) throw new Error(`unsupported selector ${selector}`);
    const [, tag, attr] = m;
    const out: El[] = [];
    const walk = (el: El) => {
      for (const child of el.children) {
        if ((!tag || child.tagName === tag.toUpperCase()) && (!attr || child.getAttribute(attr) !== null)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  contains(other: El): boolean {
    for (let node: El | null = other; node; node = node.parentElement) if (node === this) return true;
    return false;
  }

  getBoundingClientRect() {
    const { left, top, width, height } = this.rect;
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height };
  }

  getClientRects() {
    return [this.getBoundingClientRect()];
  }
}

function h(tag: string, attrs: Record<string, string>, rect: Box, ...children: El[]): El {
  return new El(tag, attrs, rect, children);
}

const REGION: Box = { left: 0, top: 0, width: 1000, height: 800 };
const LIST: Box = { left: 40, top: 100, width: 300, height: 224 };

/**
 * One page with a short scrolling list of 12 approve buttons (`max-h-56 overflow-y-auto`), as a
 * client lays it out with its list scrolled to `scrollTop`. `slot` wraps the page in a browser-shell
 * tab slot; without it the page sits straight in the region (the legacy / store-machine shell).
 */
function page(opts: { scrollTop?: number; slot?: boolean; listClips?: boolean } = {}) {
  const scrollTop = opts.scrollTop ?? 0;
  const buttons = Array.from({ length: 12 }, (_, i) =>
    h("button", { "aria-label": `Approve request ${i + 1}` }, { left: 48, top: 104 + i * 40 - scrollTop, width: 280, height: 32 }, h("span", {}, { left: 60, top: 110 + i * 40 - scrollTop, width: 120, height: 20 })),
  );
  const list = h("div", {}, LIST, ...buttons);
  if (opts.listClips !== false) list.overflow = ["auto", "auto"];
  const below = h("section", {}, { left: 0, top: 340, width: 1000, height: 400 });
  const main = h("main", {}, REGION, h("h1", {}, { left: 40, top: 40, width: 300, height: 40 }), list, below);
  main.overflow = ["hidden", "auto"];
  const slot = opts.slot ? h("div", { "data-tab-slot": "t_1", "data-tab-active": "true" }, REGION, main) : null;
  const region = h("div", { id: "desktop-content" }, REGION, slot ?? main);
  return { region, slot, main, list, buttons };
}

type Globals = { document?: unknown; getComputedStyle?: unknown };
const scope = globalThis as Globals;
const saved: Globals = { document: scope.document, getComputedStyle: scope.getComputedStyle };

/** Puts `tree` on screen as the whole document. */
function show(tree: ReturnType<typeof page>): void {
  scope.document = {
    getElementById: (id: string) => (id === "desktop-content" ? tree.region : null),
    querySelector: () => tree.slot,
  };
  scope.getComputedStyle = (el: El) => ({ overflowX: el.overflow[0], overflowY: el.overflow[1] });
}

afterEach(() => {
  scope.document = saved.document;
  scope.getComputedStyle = saved.getComputedStyle;
});

function click(tree: ReturnType<typeof page>, index: number) {
  const target = tree.buttons[index].children[0];
  const r = target.getBoundingClientRect();
  return describeClick(
    target as unknown as Element,
    r.left + 10,
    r.top + 10,
    false,
    tree.region as unknown as HTMLElement,
    false,
  );
}

describe("describeClick", () => {
  test("anchors clicks in the legacy shell too, where there is no tab slot", () => {
    const clicker = page();
    show(clicker);
    const spot = click(clicker, 2);
    expect(spot.anchor).not.toBe("");
    expect(decodeAnchor(spot.anchor)[0]).toStartWith("aria:");

    const viewer = page();
    show(viewer);
    const placed = locatePersonCursor(spot, false, createAnchorCache());
    const r = viewer.buttons[2].getBoundingClientRect();
    expect(placed).toEqual({ x: r.left + spot.anchorX * r.width, y: r.top + spot.anchorY * r.height, dim: false });
  });

  test("anchors inside the active tab slot in the browser shell", () => {
    const clicker = page({ slot: true });
    show(clicker);
    const spot = click(clicker, 0);
    expect(decodeAnchor(spot.anchor).at(-1)).toBe("path:main:1>div:1>button:1");
  });
});

describe("locatePersonCursor in a scrolled inner list", () => {
  test("a row scrolled out of the viewer's list pins to the list's edge, dimmed", () => {
    // The colleague scrolled their list and clicked the 12th request.
    const clicker = page({ scrollTop: 250 });
    show(clicker);
    const spot = click(clicker, 11);

    // The viewer's list is at the top: that row is ~250 px below the list, still inside the region.
    const viewer = page();
    show(viewer);
    const row = viewer.buttons[11].getBoundingClientRect();
    expect(row.top).toBeGreaterThan(LIST.top + LIST.height);
    expect(row.bottom).toBeLessThan(REGION.top + REGION.height);
    const placed = locatePersonCursor(spot, false, createAnchorCache());
    expect(placed?.dim).toBe(true);
    expect(placed?.y).toBe(LIST.top + LIST.height - 4);
  });

  test("the same row is drawn in place when nothing clips it", () => {
    const clicker = page({ scrollTop: 250 });
    show(clicker);
    const spot = click(clicker, 11);
    const viewer = page({ listClips: false });
    show(viewer);
    const row = viewer.buttons[11].getBoundingClientRect();
    expect(locatePersonCursor(spot, false, createAnchorCache())).toEqual({
      x: row.left + spot.anchorX * row.width,
      y: row.top + spot.anchorY * row.height,
      dim: false,
    });
  });
});

describe("clippingAncestors", () => {
  test("collects every non-visible overflow ancestor below the root, innermost first", () => {
    const tree = page({ slot: true });
    const overflowOf = (el: Element) => (el as unknown as El).overflow;
    const button = tree.buttons[0] as unknown as Element;
    expect(clippingAncestors(button, tree.slot as unknown as Element, overflowOf)).toEqual([
      tree.list as unknown as Element,
      tree.main as unknown as Element,
    ]);
    // The root itself is never included; the region box stands for it.
    expect(clippingAncestors(button, tree.main as unknown as Element, overflowOf)).toEqual([tree.list as unknown as Element]);
    tree.list.overflow = ["clip", "visible"];
    expect(clippingAncestors(button, tree.main as unknown as Element, overflowOf)).toEqual([tree.list as unknown as Element]);
    tree.list.overflow = ["visible", "visible"];
    expect(clippingAncestors(button, tree.main as unknown as Element, overflowOf)).toEqual([]);
  });
});
