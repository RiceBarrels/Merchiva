import { describe, expect, test } from "bun:test";
import {
  SCROLL_ROOT_OVERFLOW_SLACK_PX,
  SWIPE_AXIS_LOCK_PX,
  SWIPE_AXIS_RATIO,
  SWIPE_CLAIM_PX,
  SWIPE_COMMIT_VELOCITY,
  blocksHorizontalPan,
  claimReached,
  hasHorizontalScroller,
  lockAxis,
  releaseVelocity,
  shouldCommit,
  swipeDirection,
  swipeStartAllowed,
} from "@/lib/gestures/page-swipe";

/** A minimal Element stand-in: parentElement, closest() by attribute/tag, scroll metrics. */
interface FakeNode {
  tagName: string;
  attrs: Record<string, string>;
  parentElement: FakeNode | null;
  scrollWidth: number;
  clientWidth: number;
  style: { touchAction: string; overflowX: string };
  type?: string;
  closest(selector: string): FakeNode | null;
  hasAttribute(name: string): boolean;
}

function matches(node: FakeNode, selector: string): boolean {
  return selector.split(",").some((part) => {
    const s = part.trim();
    if (s === "input") return node.tagName === "INPUT";
    if (s === "textarea" || s === "select") return node.tagName === s.toUpperCase();
    if (s.startsWith("[contenteditable]")) return "contenteditable" in node.attrs && node.attrs.contenteditable !== "false";
    const attr = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(s);
    if (!attr) return false;
    if (!(attr[1] in node.attrs)) return false;
    return attr[2] === undefined || node.attrs[attr[1]] === attr[2];
  });
}

function node(tagName: string, parent: FakeNode | null, init: Partial<FakeNode> & { touchAction?: string; overflowX?: string } = {}): FakeNode {
  const n: FakeNode = {
    tagName,
    attrs: init.attrs ?? {},
    parentElement: parent,
    scrollWidth: init.scrollWidth ?? 100,
    clientWidth: init.clientWidth ?? 100,
    style: { touchAction: init.touchAction ?? "auto", overflowX: init.overflowX ?? "visible" },
    type: init.type,
    hasAttribute(name) {
      return name in n.attrs;
    },
    closest(selector) {
      for (let cur: FakeNode | null = n; cur; cur = cur.parentElement) if (matches(cur, selector)) return cur;
      return null;
    },
  };
  return n;
}

const styleOf = (element: Element) => (element as unknown as FakeNode).style as CSSStyleDeclaration;
const el = (n: FakeNode) => n as unknown as Element;

describe("axis lock and direction", () => {
  test("stays pending under the lock distance", () => {
    expect(lockAxis(SWIPE_AXIS_LOCK_PX - 1, 0)).toBe("pending");
    expect(lockAxis(0, -(SWIPE_AXIS_LOCK_PX - 1))).toBe("pending");
  });

  test("a horizontal-looking drag is decided inside Chrome's ~8px straight-line touch slop", () => {
    // The longest move still pending that would lock horizontal: just under the lock, at the ratio.
    const dx = SWIPE_AXIS_LOCK_PX - 0.01;
    expect(lockAxis(dx, dx / SWIPE_AXIS_RATIO)).toBe("pending");
    expect(Math.hypot(SWIPE_AXIS_LOCK_PX, SWIPE_AXIS_LOCK_PX / SWIPE_AXIS_RATIO)).toBeLessThan(8);
  });

  test("needs clearly more horizontal than vertical movement", () => {
    expect(lockAxis(20, 5)).toBe("horizontal");
    expect(lockAxis(-20, 5)).toBe("horizontal");
    expect(lockAxis(12, 11)).toBe("vertical");
    expect(lockAxis(2, 30)).toBe("vertical");
  });

  test("a decided swipe takes over only past the claim distance, so a rolling tap still clicks", () => {
    expect(SWIPE_CLAIM_PX).toBeGreaterThan(SWIPE_AXIS_LOCK_PX);
    expect(claimReached(SWIPE_CLAIM_PX - 1)).toBe(false);
    expect(claimReached(-(SWIPE_CLAIM_PX - 1))).toBe(false);
    expect(claimReached(SWIPE_CLAIM_PX)).toBe(true);
    expect(claimReached(-SWIPE_CLAIM_PX)).toBe(true);
  });

  test("toStart is leftward in LTR and rightward in RTL", () => {
    expect(swipeDirection(-30, "ltr")).toBe("toStart");
    expect(swipeDirection(30, "ltr")).toBe("toEnd");
    expect(swipeDirection(30, "rtl")).toBe("toStart");
    expect(swipeDirection(-30, "rtl")).toBe("toEnd");
  });
});

describe("release", () => {
  test("commits past 40% or on a fast flick toward open", () => {
    expect(shouldCommit(0.39, 0)).toBe(false);
    expect(shouldCommit(0.4, 0)).toBe(true);
    expect(shouldCommit(0.1, SWIPE_COMMIT_VELOCITY)).toBe(true);
  });

  test("a fast flick back cancels even when far out", () => {
    expect(shouldCommit(0.9, -SWIPE_COMMIT_VELOCITY)).toBe(false);
  });

  test("velocity uses only the last 80ms", () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ t: 0, x: 0 }])).toBe(0);
    // A slow start then a fast finish: only the finish counts.
    const samples = [
      { t: 0, x: 0 },
      { t: 200, x: 10 },
      { t: 240, x: 30 },
      { t: 280, x: 70 },
    ];
    expect(releaseVelocity(samples)).toBeCloseTo(60 / 80);
  });
});

describe("touch-action", () => {
  test("auto and manipulation leave horizontal pans to the browser", () => {
    expect(blocksHorizontalPan("auto")).toBe(false);
    expect(blocksHorizontalPan("manipulation")).toBe(false);
    expect(blocksHorizontalPan("")).toBe(false);
  });

  test("none and vertical-only values hand horizontal drags to the page", () => {
    expect(blocksHorizontalPan("none")).toBe(true);
    expect(blocksHorizontalPan("pan-y")).toBe(true);
    expect(blocksHorizontalPan("pan-y pinch-zoom")).toBe(true);
    expect(blocksHorizontalPan("pan-x")).toBe(false);
    expect(blocksHorizontalPan("pan-left pan-y")).toBe(false);
  });
});

describe("where a swipe may start", () => {
  const root = node("DIV", null);
  const page = node("DIV", root);

  test("plain page content starts a swipe", () => {
    expect(swipeStartAllowed(el(node("P", page)), el(root), styleOf)).toBe(true);
  });

  test("outside the swipe surface (portaled layers) never starts one", () => {
    const elsewhere = node("DIV", node("BODY", null));
    expect(swipeStartAllowed(el(elsewhere), el(root), styleOf)).toBe(false);
    expect(swipeStartAllowed(null, el(root), styleOf)).toBe(false);
  });

  test("opt-out markers keep the drag for the page", () => {
    for (const marker of ["data-no-sidebar-swipe", "data-no-shell-swipe", "data-no-swipe"]) {
      const region = node("DIV", page, { attrs: { [marker]: "" } });
      expect(swipeStartAllowed(el(node("SPAN", region)), el(root), styleOf)).toBe(false);
    }
  });

  test("text fields, selects, sliders and rich text are exempt; buttons and checkboxes are not", () => {
    expect(swipeStartAllowed(el(node("INPUT", page, { type: "text" })), el(root), styleOf)).toBe(false);
    expect(swipeStartAllowed(el(node("INPUT", page, { type: "range" })), el(root), styleOf)).toBe(false);
    expect(swipeStartAllowed(el(node("TEXTAREA", page)), el(root), styleOf)).toBe(false);
    const editor = node("DIV", page, { attrs: { contenteditable: "true" } });
    expect(swipeStartAllowed(el(node("P", editor)), el(root), styleOf)).toBe(false);
    expect(swipeStartAllowed(el(node("DIV", page, { attrs: { role: "slider" } })), el(root), styleOf)).toBe(false);
    expect(swipeStartAllowed(el(node("INPUT", page, { type: "checkbox" })), el(root), styleOf)).toBe(true);
    const readOnly = node("DIV", page, { attrs: { contenteditable: "false" } });
    expect(swipeStartAllowed(el(readOnly), el(root), styleOf)).toBe(true);
  });

  test("an ancestor that keeps horizontal pans for script (canvas, slide stage) blocks it", () => {
    const stage = node("DIV", page, { touchAction: "pan-y" });
    expect(swipeStartAllowed(el(node("DIV", stage)), el(root), styleOf)).toBe(false);
  });
});

describe("horizontal scrollers keep the drag", () => {
  const root = node("DIV", null);

  test("an overflowing auto/scroll ancestor wins, at its edge too", () => {
    const table = node("DIV", root, { overflowX: "auto", scrollWidth: 900, clientWidth: 360 });
    expect(hasHorizontalScroller(el(node("TD", table)), el(root), styleOf)).toBe(true);
  });

  test("hidden overflow and content that fits do not", () => {
    const clipped = node("DIV", root, { overflowX: "hidden", scrollWidth: 900, clientWidth: 360 });
    expect(hasHorizontalScroller(el(node("SPAN", clipped)), el(root), styleOf)).toBe(false);
    const fits = node("DIV", root, { overflowX: "auto", scrollWidth: 361, clientWidth: 360 });
    expect(hasHorizontalScroller(el(node("SPAN", fits)), el(root), styleOf)).toBe(false);
  });

  test("a page scroll root only counts when it really scrolls sideways", () => {
    const attrs = { "data-tab-scroll-root": "" };
    const slightlyWide = node("MAIN", root, { attrs, overflowX: "auto", scrollWidth: 360 + SCROLL_ROOT_OVERFLOW_SLACK_PX, clientWidth: 360 });
    expect(hasHorizontalScroller(el(node("P", slightlyWide)), el(root), styleOf)).toBe(false);
    const reallyWide = node("MAIN", root, { attrs, overflowX: "auto", scrollWidth: 920, clientWidth: 360 });
    expect(hasHorizontalScroller(el(node("P", reallyWide)), el(root), styleOf)).toBe(true);
  });
});
