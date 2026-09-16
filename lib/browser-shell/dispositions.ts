import type { OpenDisposition } from "./types";

/**
 * Where a pointer activation should open (plan D22, Chrome conventions):
 *   middle button            → new background tab
 *   Mod+Shift click          → new foreground tab
 *   Mod click                → new background tab
 *   Shift click (Tauri only) → new foreground tab (on the web the browser keeps plain Shift-click)
 *   anything else            → current tab
 * Mod is ⌘ on macOS and Ctrl elsewhere (macOS Ctrl-click is a context menu, so it is ignored).
 */
export function dispositionFromPointer(
  e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  isMac: boolean,
  isTauri: boolean,
): OpenDisposition {
  if (e.button === 1) return "new-background";
  if (e.button !== 0) return "current";
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod) return e.shiftKey ? "new-foreground" : "new-background";
  if (isTauri && e.shiftKey) return "new-foreground";
  return "current";
}

/**
 * Where an Enter in the omnibox / a result list should open:
 *   Enter                     → current tab
 *   Alt+Enter or Mod+Enter    → new foreground tab
 *   … plus Shift              → new background tab
 */
export function dispositionFromKeyboard(
  e: { altKey: boolean; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  isMac: boolean,
): OpenDisposition {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (e.altKey || mod) return e.shiftKey ? "new-background" : "new-foreground";
  return "current";
}
