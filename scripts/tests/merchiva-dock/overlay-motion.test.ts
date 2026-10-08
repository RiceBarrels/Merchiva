import { describe, expect, test } from "bun:test";
import {
  closeSwipeReveal,
  overlayPresence,
  revealTranslate,
  towardEnd,
  type OverlayState,
} from "@/components/merchiva-dock/overlay-motion";

function state(over: Partial<OverlayState> = {}): OverlayState {
  return { open: false, revealing: false, offscreen: true, loaded: false, ...over };
}

describe("revealTranslate", () => {
  test("hides toward the inline end: right in LTR, left in RTL", () => {
    expect(revealTranslate(0, false)).toBe("100%");
    expect(revealTranslate(0, true)).toBe("-100%");
    expect(revealTranslate(0.25, false)).toBe("75%");
    expect(revealTranslate(0.25, true)).toBe("-75%");
  });

  test("fully revealed is 0% in both directions (no -0)", () => {
    expect(revealTranslate(1, false)).toBe("0%");
    expect(revealTranslate(1, true)).toBe("0%");
  });

  test("spring overshoot is clamped, so no gap opens at the end edge", () => {
    expect(revealTranslate(1.08, false)).toBe("0%");
    expect(revealTranslate(-0.05, false)).toBe("100%");
    expect(revealTranslate(1.08, true)).toBe("0%");
  });
});

describe("overlayPresence", () => {
  test("closed and never opened: not mounted", () => {
    expect(overlayPresence(state())).toEqual({ mounted: false, visible: false, interactive: false });
  });

  test("a finger pulling it in mounts it, visible but inert", () => {
    expect(overlayPresence(state({ revealing: true }))).toEqual({ mounted: true, visible: true, interactive: false });
  });

  test("open: mounted, visible and interactive, even while it is still sliding in", () => {
    expect(overlayPresence(state({ open: true, loaded: true }))).toEqual({ mounted: true, visible: true, interactive: true });
    expect(overlayPresence(state({ open: true, loaded: true, offscreen: false }))).toEqual({
      mounted: true,
      visible: true,
      interactive: true,
    });
  });

  test("sliding away after a close or a let-go pull: visible but inert until off-screen", () => {
    expect(overlayPresence(state({ offscreen: false }))).toEqual({ mounted: true, visible: true, interactive: false });
    expect(overlayPresence(state({ offscreen: false, loaded: true }))).toEqual({ mounted: true, visible: true, interactive: false });
  });

  test("a pull let go before the dock ever opened unmounts once off-screen", () => {
    expect(overlayPresence(state({ offscreen: true, loaded: false })).mounted).toBe(false);
  });

  test("once the chat loaded it stays mounted while closed, hidden and inert", () => {
    expect(overlayPresence(state({ loaded: true }))).toEqual({ mounted: true, visible: false, interactive: false });
  });
});

describe("close swipe", () => {
  test("towardEnd measures rightward in LTR and leftward in RTL", () => {
    expect(towardEnd(30, false)).toBe(30);
    expect(towardEnd(30, true)).toBe(-30);
    expect(towardEnd(-30, true)).toBe(30);
  });

  test("the reveal follows the finger toward the end edge", () => {
    expect(closeSwipeReveal(1, 100, 400, false)).toBe(0.75);
    expect(closeSwipeReveal(1, -100, 400, true)).toBe(0.75);
    expect(closeSwipeReveal(1, 400, 400, false)).toBe(0);
    expect(closeSwipeReveal(1, 900, 400, false)).toBe(0);
  });

  test("starts from wherever the overlay was when the swipe was claimed", () => {
    expect(closeSwipeReveal(0.5, 100, 400, false)).toBe(0.25);
  });

  test("dragging back toward the start never pulls it past where it was", () => {
    expect(closeSwipeReveal(1, -80, 400, false)).toBe(1);
    expect(closeSwipeReveal(0.6, -80, 400, false)).toBe(0.6);
    expect(closeSwipeReveal(1, 80, 400, true)).toBe(1);
  });

  test("a zero width (not laid out) leaves the reveal where it was", () => {
    expect(closeSwipeReveal(1, 100, 0, false)).toBe(1);
  });
});
