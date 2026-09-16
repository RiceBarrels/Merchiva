import { describe, expect, test } from "bun:test";
import {
  contentFootprint,
  expandedFootprint,
  minimizedFootprint,
  untransformedRect,
  type FootprintInputs,
} from "../../../lib/browser-shell/mobile/geometry";
import { CLICK_SUPPRESS_MS, createClickSuppressor } from "../../../lib/browser-shell/mobile/use-pill-swipe";

const BASE: FootprintInputs = { immersive: false, docked: false, keyboardOpen: false, keyboardInset: 0, bottomInset: 34 };

describe("content footprint (spec §9, E3 item 27)", () => {
  test("overlay routes keep the minimized reserve, even while typing", () => {
    expect(contentFootprint(BASE)).toBe(minimizedFootprint(34));
    expect(contentFootprint({ ...BASE, keyboardOpen: true, keyboardInset: 336 })).toBe(minimizedFootprint(34));
  });

  test("docked routes reserve the expanded chrome with no keyboard", () => {
    expect(contentFootprint({ ...BASE, docked: true })).toBe(expandedFootprint(34));
  });

  test("docked routes end at the keyboard: 0 where the webview resizes, the keyboard height where it doesn't", () => {
    // Android native: the webview shrinks, inset 0.
    expect(contentFootprint({ ...BASE, docked: true, keyboardOpen: true, keyboardInset: 0 })).toBe(0);
    // iOS native (resize "body") or visualViewport on the web: the viewport keeps its height.
    expect(contentFootprint({ ...BASE, docked: true, keyboardOpen: true, keyboardInset: 336 })).toBe(336);
    expect(contentFootprint({ ...BASE, docked: true, keyboardOpen: true, keyboardInset: -5 })).toBe(0);
  });

  test("immersive pages take the whole viewport", () => {
    expect(contentFootprint({ ...BASE, immersive: true, docked: true, keyboardOpen: true, keyboardInset: 336 })).toBe(0);
    expect(contentFootprint({ ...BASE, immersive: true })).toBe(0);
  });
});

describe("untransformedRect (tab overview over a dialog page)", () => {
  test("uses layout offsets, so a translate/scale on the box does not move the rect", () => {
    // #mobile-content at the top of a frame that starts 20px down; 390 × 700 layout box.
    expect(
      untransformedRect({ left: 0, top: 20 }, { offsetLeft: 0, offsetTop: 0, offsetWidth: 390, offsetHeight: 700 }),
    ).toEqual({ left: 0, top: 20, width: 390, height: 700 });
    expect(
      untransformedRect({ left: 8, top: 0 }, { offsetLeft: 4, offsetTop: 6, offsetWidth: 300, offsetHeight: 500 }),
    ).toEqual({ left: 12, top: 6, width: 300, height: 500 });
  });

  test("null for an unsized box", () => {
    expect(untransformedRect({ left: 0, top: 0 }, { offsetLeft: 0, offsetTop: 0, offsetWidth: 0, offsetHeight: 700 })).toBeNull();
    expect(untransformedRect({ left: 0, top: 0 }, { offsetLeft: 0, offsetTop: 0, offsetWidth: 390, offsetHeight: 0 })).toBeNull();
  });
});

describe("pill swipe click suppression", () => {
  function clock() {
    let t = 1000;
    return { now: () => t, advance: (ms: number) => void (t += ms) };
  }

  test("swallows the click that follows the gesture", () => {
    const c = clock();
    const clicks = createClickSuppressor(c.now);
    clicks.arm();
    clicks.release();
    c.advance(30);
    expect(clicks.consume()).toBe(true);
    // Only once.
    expect(clicks.consume()).toBe(false);
  });

  test("a later keyboard or trackpad activation goes through", () => {
    const c = clock();
    const clicks = createClickSuppressor(c.now);
    clicks.arm();
    clicks.release();
    c.advance(CLICK_SUPPRESS_MS + 1);
    expect(clicks.consume()).toBe(false);
  });

  test("a click while the gesture's touch is still down is swallowed", () => {
    const clicks = createClickSuppressor(clock().now);
    clicks.arm();
    expect(clicks.consume()).toBe(true);
  });

  test("a plain tap (never armed) and a new touch are not suppressed", () => {
    const c = clock();
    const clicks = createClickSuppressor(c.now);
    clicks.release();
    expect(clicks.consume()).toBe(false);
    clicks.arm();
    clicks.release();
    clicks.reset();
    expect(clicks.consume()).toBe(false);
  });
});
