// The Slides editor keyboard map (slides.md §7.2), as data: a key event in, a command out. Checked against the
// browser shell's table (lib/browser-shell/shortcuts.ts): nothing here collides with it. "Mod" is ⌘ on macOS and
// Ctrl elsewhere; new slide is the literal Ctrl+M everywhere (⌘M minimises windows on macOS).
//
// Keys are never replayed: a printable key (or the first key of an IME composition, keyCode 229) with one text box
// selected becomes { kind: "type" }, and the caller moves focus into that box's editor during keydown WITHOUT
// preventDefault, so the browser's own input or composition lands there.

export type ArrangeOp = "front" | "forward" | "backward" | "back";

export type SlidesKeyCommand =
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "duplicate" }
  | { kind: "delete" }
  | { kind: "selectAll" }
  | { kind: "edit" }
  | { kind: "escape" }
  | { kind: "cycle"; dir: 1 | -1 }
  | { kind: "nudge"; dx: number; dy: number }
  | { kind: "newSlide" }
  | { kind: "slide"; dir: 1 | -1 }
  | { kind: "present"; fromStart: boolean }
  | { kind: "arrange"; op: ArrangeOp }
  | { kind: "moveSlides"; dir: 1 | -1 }
  | { kind: "type" };

export interface KeyLike {
  key: string;
  code?: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
}

export interface KeyEnv {
  isMac: boolean;
  /** Focus is in the slide rail (Mod+↑/↓ move the selected slides there). */
  inRail: boolean;
}

/** Arrow-key nudge distance (pt): 1, or 10 with Shift. */
export const NUDGE_PT = 1;
export const NUDGE_BIG_PT = 10;

/** True for the first key of an IME composition (Chrome and Safari report keyCode 229, key "Process"). */
export function isImeKey(e: KeyLike): boolean {
  return e.keyCode === 229 || e.key === "Process";
}

/** A key that types a character: one code point, no ⌘ and no Ctrl (except as AltGr, Ctrl+Alt); ⌥ characters count. */
export function isPrintableKey(e: KeyLike): boolean {
  if (e.metaKey || (e.ctrlKey && !e.altKey)) return false;
  return [...e.key].length === 1;
}

const ARROWS: Readonly<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The command for a keydown, or null (the key is left alone). Composition keys other than the first are null. */
export function slidesKeyCommand(e: KeyLike, env: KeyEnv): SlidesKeyCommand | null {
  if (e.isComposing) return null;
  const mod = env.isMac ? e.metaKey : e.ctrlKey;
  // A modifier the platform doesn't use as Mod (Ctrl on macOS, ⌘/Win elsewhere) only matters for Ctrl+M.
  const otherMod = env.isMac ? e.ctrlKey : e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.code === "KeyM" || key === "m")) return { kind: "newSlide" };
  if (isImeKey(e) || isPrintableKey(e)) return { kind: "type" };
  if (otherMod || e.altKey) return null;

  if (mod) {
    if (key === "z") return e.shiftKey ? { kind: "redo" } : { kind: "undo" };
    if (key === "y" && !e.shiftKey) return { kind: "redo" };
    if (key === "d" && !e.shiftKey) return { kind: "duplicate" };
    if (key === "a" && !e.shiftKey) return { kind: "selectAll" };
    if (key === "Enter") return { kind: "present", fromStart: e.shiftKey };
    if (key === "ArrowUp" || key === "ArrowDown") {
      const up = key === "ArrowUp";
      if (env.inRail) return e.shiftKey ? null : { kind: "moveSlides", dir: up ? -1 : 1 };
      if (e.shiftKey) return { kind: "arrange", op: up ? "front" : "back" };
      return { kind: "arrange", op: up ? "forward" : "backward" };
    }
    return null;
  }

  switch (key) {
    case "Delete":
    case "Backspace":
      return { kind: "delete" };
    case "Enter":
      return e.shiftKey ? null : { kind: "edit" };
    case "Escape":
      return { kind: "escape" };
    case "Tab":
      return { kind: "cycle", dir: e.shiftKey ? -1 : 1 };
    case "PageUp":
      return { kind: "slide", dir: -1 };
    case "PageDown":
      return { kind: "slide", dir: 1 };
  }
  const arrow = ARROWS[key];
  if (!arrow) return null;
  const step = e.shiftKey ? NUDGE_BIG_PT : NUDGE_PT;
  return { kind: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
}

/** macOS / iOS / iPadOS: Mod is ⌘. */
export function isApplePlatform(nav: { platform?: string; userAgent?: string } | undefined): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform ?? "") || /Mac OS X|iPhone|iPad/i.test(nav.userAgent ?? "");
}
