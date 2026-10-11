// components/device/app-swipe-close.ts: the swipe that closes an open app on /personal. Down or toward the
// inline end only; the app keeps drags it wants (a scroller off its top, a sideways scroller, touch-action,
// editables, opt-out regions, the Drive editors); the window shrinks about the finger and lets go cleanly.

import { describe, expect, test } from "bun:test";
import {
  CLOSE_SWIPE_SHARE,
  CLOSE_SWIPE_VELOCITY,
  DRAG_MIN_SCALE,
  appKeepsDrag,
  blocksVerticalPan,
  closeDistance,
  closeOnRelease,
  closePull,
  closeSwipeFor,
  closeSwipeStartAllowed,
  dragFrame,
  homeProgressAt,
} from "@/components/device/app-swipe-close";

interface FakeNode {
  tagName: string;
  attrs: Record<string, string>;
  parentElement: FakeNode | null;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  style: { touchAction: string; overflowX: string; overflowY: string };
  type?: string;
  matches(selector: string): boolean;
  closest(selector: string): FakeNode | null;
  hasAttribute(name: string): boolean;
}

function matchesOne(node: FakeNode, selector: string): boolean {
  return selector.split(",").some((part) => {
    const s = part.trim();
    if (/^[a-z]+$/.test(s)) return node.tagName === s.toUpperCase();
    if (s.startsWith("[contenteditable]")) return "contenteditable" in node.attrs && node.attrs.contenteditable !== "false";
    const attr = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(s);
    if (!attr || !(attr[1] in node.attrs)) return false;
    return attr[2] === undefined || node.attrs[attr[1]] === attr[2];
  });
}

type Init = Partial<Omit<FakeNode, "style">> & { touchAction?: string; overflowX?: string; overflowY?: string };

function node(tagName: string, parent: FakeNode | null, init: Init = {}): FakeNode {
  const n: FakeNode = {
    tagName,
    attrs: init.attrs ?? {},
    parentElement: parent,
    scrollWidth: init.scrollWidth ?? 100,
    clientWidth: init.clientWidth ?? 100,
    scrollHeight: init.scrollHeight ?? 100,
    clientHeight: init.clientHeight ?? 100,
    scrollTop: init.scrollTop ?? 0,
    style: { touchAction: init.touchAction ?? "auto", overflowX: init.overflowX ?? "visible", overflowY: init.overflowY ?? "visible" },
    type: init.type,
    matches: (selector) => matchesOne(n, selector),
    hasAttribute: (name) => name in n.attrs,
    closest(selector) {
      for (let cur: FakeNode | null = n; cur; cur = cur.parentElement) if (matchesOne(cur, selector)) return cur;
      return null;
    },
  };
  return n;
}

const styleOf = (element: Element) => (element as unknown as FakeNode).style as CSSStyleDeclaration;
const el = (n: FakeNode) => n as unknown as Element;

describe("which drags are close swipes", () => {
  test("down and from left to right are; up and right to left are not", () => {
    expect(closeSwipeFor(0, 3, "ltr")).toBe("pending");
    expect(closeSwipeFor(1, 20, "ltr")).toBe("down");
    expect(closeSwipeFor(1, -20, "ltr")).toBeNull();
    expect(closeSwipeFor(20, 1, "ltr")).toBe("toEnd");
    expect(closeSwipeFor(-20, 1, "ltr")).toBeNull();
  });

  test("RTL mirrors it: right to left", () => {
    expect(closeSwipeFor(-20, 1, "rtl")).toBe("toEnd");
    expect(closeSwipeFor(20, 1, "rtl")).toBeNull();
    expect(closeDistance("toEnd", -30, 5, "rtl")).toBe(30);
    expect(closeDistance("toEnd", 30, 5, "ltr")).toBe(30);
    expect(closeDistance("down", -30, 50, "ltr")).toBe(50);
  });
});

describe("release", () => {
  const phone = { w: 390, h: 844 };

  test("pull is the share of the screen along the swipe, clamped", () => {
    expect(closePull("down", 422, phone)).toBeCloseTo(0.5, 10);
    expect(closePull("toEnd", 195, phone)).toBeCloseTo(0.5, 10);
    expect(closePull("down", -40, phone)).toBe(0);
    expect(closePull("down", 2000, phone)).toBe(1);
    expect(closePull("down", 10, { w: 0, h: 0 })).toBe(0);
  });

  test("closes past the share or on a flick; a flick back always keeps it open", () => {
    expect(closeOnRelease(CLOSE_SWIPE_SHARE, 0)).toBe(true);
    expect(closeOnRelease(CLOSE_SWIPE_SHARE - 0.01, 0)).toBe(false);
    expect(closeOnRelease(0.05, CLOSE_SWIPE_VELOCITY)).toBe(true);
    expect(closeOnRelease(0.9, -CLOSE_SWIPE_VELOCITY)).toBe(false);
  });
});

describe("dragFrame", () => {
  const drag = { dx: -120, dy: 30, pull: 1 };

  test("under the finger the window follows it and shrinks, with the screen's corners", () => {
    const f = dragFrame(drag, 1, 40);
    expect(f).toEqual({ x: -120, y: 30, scale: DRAG_MIN_SCALE, radius: 40 });
  });

  test("let go, it eases back to an untouched window", () => {
    const rest = dragFrame(drag, 0, 40);
    expect(Math.abs(rest.x) + Math.abs(rest.y) + rest.radius).toBe(0);
    expect(rest.scale).toBe(1);
    const half = dragFrame(drag, 0.5, 40);
    expect(half.x).toBe(-60);
    expect(half.scale).toBeCloseTo(1 - (1 - DRAG_MIN_SCALE) / 2, 10);
  });

  test("the home screen comes forward with the pull", () => {
    expect(homeProgressAt(1, 0)).toBe(1);
    expect(homeProgressAt(1, 0.25)).toBeCloseTo(0.75, 10);
    expect(homeProgressAt(0, 0.5)).toBe(0);
    expect(homeProgressAt(1.1, 2)).toBe(0);
  });
});

describe("where a close swipe may start", () => {
  // The window opts its own surface out of page swipes; that must not stop its own close swipe.
  const win = node("DIV", null, { attrs: { "data-no-swipe": "" } });
  const content = node("DIV", win);

  test("plain app content starts one; outside the window does not", () => {
    expect(closeSwipeStartAllowed(el(node("P", content)), el(win))).toBe(true);
    expect(closeSwipeStartAllowed(el(node("P", node("BODY", null))), el(win))).toBe(false);
    expect(closeSwipeStartAllowed(null, el(win))).toBe(false);
  });

  test("opt-out regions, the Drive editors, canvases and editables keep their drags", () => {
    for (const attrs of [{ "data-no-swipe": "" }, { "data-no-sidebar-swipe": "" }, { "data-drive-editor": "sheet" }]) {
      expect(closeSwipeStartAllowed(el(node("SPAN", node("DIV", content, { attrs }))), el(win))).toBe(false);
    }
    expect(closeSwipeStartAllowed(el(node("CANVAS", content)), el(win))).toBe(false);
    expect(closeSwipeStartAllowed(el(node("INPUT", content, { type: "text" })), el(win))).toBe(false);
    expect(closeSwipeStartAllowed(el(node("INPUT", content, { type: "checkbox" })), el(win))).toBe(true);
  });
});

describe("the app keeps drags it wants", () => {
  const win = node("DIV", null);

  test("down yields to a scroller off its top, not to one at its top", () => {
    const scrolled = node("DIV", win, { overflowY: "auto", scrollHeight: 2000, clientHeight: 800, scrollTop: 40 });
    expect(appKeepsDrag("down", el(node("P", scrolled)), el(win), styleOf)).toBe(true);
    const atTop = node("DIV", win, { overflowY: "auto", scrollHeight: 2000, clientHeight: 800, scrollTop: 0 });
    expect(appKeepsDrag("down", el(node("P", atTop)), el(win), styleOf)).toBe(false);
  });

  test("toEnd yields to any sideways scroller, at its edge too", () => {
    const table = node("DIV", win, { overflowX: "auto", scrollWidth: 900, clientWidth: 360 });
    expect(appKeepsDrag("toEnd", el(node("TD", table)), el(win), styleOf)).toBe(true);
    expect(appKeepsDrag("down", el(node("TD", table)), el(win), styleOf)).toBe(false);
  });

  test("touch-action that keeps a pan for script keeps that axis", () => {
    const stage = node("DIV", win, { touchAction: "pan-y" });
    expect(appKeepsDrag("toEnd", el(node("DIV", stage)), el(win), styleOf)).toBe(true);
    expect(appKeepsDrag("down", el(node("DIV", stage)), el(win), styleOf)).toBe(false);
    expect(blocksVerticalPan("none")).toBe(true);
    expect(blocksVerticalPan("pan-x")).toBe(true);
    expect(blocksVerticalPan("manipulation")).toBe(false);
    expect(blocksVerticalPan("pan-x pan-down")).toBe(false);
  });
});
