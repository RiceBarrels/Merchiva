/*
 * The rules behind the Mr. Merchiva overlay's motion (overlay-panel.tsx). Pure so they are
 * testable without the React tree.
 *
 * `reveal` is merchivaReveal (dock-reveal.ts): 0 = off-screen at the inline-end edge, 1 = fully
 * in. The overlay sits at the end edge (`end-0`), which is the right in LTR and the left in RTL,
 * so it hides toward +100% of its own width in LTR and -100% in RTL.
 */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** translateX for a reveal, as a share of the overlay's own width. Overshoot never shows a gap. */
export function revealTranslate(reveal: number, rtl: boolean): string {
  const hidden = 1 - clamp01(reveal);
  return `${(rtl ? -hidden : hidden) * 100}%`;
}

export interface OverlayState {
  /** The dock is open (dock-state.ts). */
  readonly open: boolean;
  /** A finger is pulling the overlay in (dock-reveal.ts). */
  readonly revealing: boolean;
  /** merchivaReveal is at 0: nothing of the overlay is on screen. */
  readonly offscreen: boolean;
  /** The chat has mounted once in this overlay; from then on it stays mounted, hidden. */
  readonly loaded: boolean;
}

export interface OverlayPresence {
  /** Render the overlay at all. */
  readonly mounted: boolean;
  /** On screen; otherwise `visibility: hidden`, so it never paints, takes a tap or holds focus. */
  readonly visible: boolean;
  /** Takes taps and focus; otherwise inert (pulled in by a finger, or sliding away). */
  readonly interactive: boolean;
}

export function overlayPresence(state: OverlayState): OverlayPresence {
  const visible = state.open || state.revealing || !state.offscreen;
  return {
    mounted: visible || state.loaded,
    visible,
    interactive: state.open && !state.revealing,
  };
}

/** A horizontal distance or velocity measured toward the inline end (rightward in LTR). */
export function towardEnd(dx: number, rtl: boolean): number {
  return rtl ? -dx : dx;
}

/**
 * The reveal while the overlay's close swipe follows the finger: `from` is the reveal when the
 * swipe was claimed, `dx` the finger's travel since then, `width` the overlay's width in px.
 * Dragging back toward the start never pulls it past where it was.
 */
export function closeSwipeReveal(from: number, dx: number, width: number, rtl: boolean): number {
  if (!(width > 0)) return clamp01(from);
  return clamp01(from - Math.max(0, towardEnd(dx, rtl)) / width);
}
