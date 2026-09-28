// Slideshow input (slides.md §9): the key map and the click / tap / swipe rules. Pure, so both are tested without a
// DOM; the presenter overlay and use-presenter-keys.ts feed them real events.
//
// Keys: → ↓ Space PageDown N = next; ← ↑ PageUp P = previous; Enter = next (or jump, after digits); Backspace =
// previous (or delete a typed digit); Home / End; digits; B or . = black screen, W or , = white screen; Esc exits;
// F toggles full screen; S toggles the speaker view. Chords with Ctrl, Cmd or Alt stay the browser's.
// Pointer: a mouse click = next; a tap on the left third = previous, elsewhere = next; a horizontal swipe longer than
// 48 px (more horizontal than vertical) = next to the left, previous to the right.

export type PresenterKeyAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "first" }
  | { type: "last" }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "digit"; digit: string }
  | { type: "blank"; screen: "black" | "white" }
  | { type: "exit" }
  | { type: "fullscreen" }
  | { type: "speaker" };

export interface PresenterKeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}

const KEY_ACTIONS: Readonly<Record<string, PresenterKeyAction>> = {
  ArrowRight: { type: "next" },
  ArrowDown: { type: "next" },
  " ": { type: "next" },
  Spacebar: { type: "next" },
  PageDown: { type: "next" },
  n: { type: "next" },
  N: { type: "next" },
  ArrowLeft: { type: "prev" },
  ArrowUp: { type: "prev" },
  PageUp: { type: "prev" },
  p: { type: "prev" },
  P: { type: "prev" },
  Enter: { type: "enter" },
  Backspace: { type: "backspace" },
  Home: { type: "first" },
  End: { type: "last" },
  b: { type: "blank", screen: "black" },
  B: { type: "blank", screen: "black" },
  ".": { type: "blank", screen: "black" },
  w: { type: "blank", screen: "white" },
  W: { type: "blank", screen: "white" },
  ",": { type: "blank", screen: "white" },
  Escape: { type: "exit" },
  Esc: { type: "exit" },
  f: { type: "fullscreen" },
  F: { type: "fullscreen" },
  s: { type: "speaker" },
  S: { type: "speaker" },
};

/** Actions that may repeat while the key is held (moving through slides); the rest fire once per press. */
export const REPEATABLE_PRESENTER_ACTIONS: ReadonlySet<PresenterKeyAction["type"]> = new Set(["next", "prev", "backspace"]);

export function presenterKeyAction(e: PresenterKeyLike): PresenterKeyAction | null {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (/^[0-9]$/.test(e.key)) return { type: "digit", digit: e.key };
  return Object.hasOwn(KEY_ACTIONS, e.key) ? KEY_ACTIONS[e.key] : null;
}

/** Longest movement that still counts as a tap or click (CSS px). */
export const TAP_SLOP_PX = 12;
/** Shortest horizontal movement that counts as a swipe (CSS px). */
export const SWIPE_MIN_PX = 48;

export interface PresenterPointer {
  pointerType: string;
  /** Movement from press to release (CSS px). */
  dx: number;
  dy: number;
}

/** A swipe that moves the show, or null (not a swipe: a tap, a scroll, a mouse drag). */
export function swipeAction(p: PresenterPointer): "next" | "prev" | null {
  if (p.pointerType === "mouse") return null;
  if (Math.abs(p.dx) <= SWIPE_MIN_PX || Math.abs(p.dx) <= Math.abs(p.dy)) return null;
  return p.dx < 0 ? "next" : "prev";
}

/**
 * What a click or tap does: next for a mouse click; for touch and pen, previous on the left third of the surface,
 * next elsewhere; null when the press moved (a swipe or a drag) or was not the primary button.
 */
export function tapAction(p: PresenterPointer & { x: number; width: number; button?: number }): "next" | "prev" | null {
  if ((p.button ?? 0) !== 0 || Math.hypot(p.dx, p.dy) > TAP_SLOP_PX) return null;
  if (p.pointerType === "mouse") return "next";
  return p.width > 0 && p.x < p.width / 3 ? "prev" : "next";
}
