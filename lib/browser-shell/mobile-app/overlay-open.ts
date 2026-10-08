import { FOREIGN_OVERLAY_SELECTOR } from "@/lib/browser-shell/android-back";
import { inHiddenSubtree } from "@/lib/browser-shell/shell-dom";

/**
 * The overlays Android back closes, plus every open Base UI menu: the Drive and Docs entry menus
 * (doc-menu-content) and Mr. Merchiva's message menus open on a long press while the finger is
 * still down, so a swipe checks again when it decides and when it takes over.
 */
export const SWIPE_OVERLAY_SELECTOR = `${FOREIGN_OVERLAY_SELECTOR}, [role="menu"][data-open], [data-slot="doc-menu-content"][data-open]`;

/** A drawer, popover, menu or alert is open: the phone's page and panel swipes stand down. */
export function swipeOverlayOpen(): boolean {
  try {
    // Overlays of kept-alive background tabs stay in the document, hidden: they don't count.
    return Array.from(document.querySelectorAll(SWIPE_OVERLAY_SELECTOR)).some((el) => !inHiddenSubtree(el));
  } catch {
    return false;
  }
}
