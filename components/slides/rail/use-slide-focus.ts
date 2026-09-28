"use client";

// Keyboard focus in the slide rail and the grid sorter (slides.md §7.3). The current slide's item stays in view when
// the current slide changes, and after a key command it keeps focus: moving slides moves their nodes and deleting
// the current slide removes its node, and either drops focus to the page. `holdFocus()` marks the next change as
// one a key made; the mark lapses after the task, so a command that changed nothing never pulls focus back later.
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/** The attribute naming the slide of a rail or sorter item. */
export const RAIL_SLIDE_ATTR = "data-rail-slide";

export function railItemSelector(slideId: string): string {
  return `[${RAIL_SLIDE_ATTR}="${slideId}"]`;
}

/** `focusOnMount`: focus the current slide's item as the list appears (the grid view opens with focus in it). */
export function useSlideFocus(
  list: RefObject<HTMLElement | null>,
  current: string | null,
  order: readonly string[],
  focusOnMount = false,
): () => void {
  const hold = useRef(false);
  const mountFocus = useRef(focusOnMount);
  const shown = useRef<string | null>(null);

  useLayoutEffect(() => {
    const root = list.current;
    const moved = shown.current !== current;
    shown.current = current;
    const item = current && root ? root.querySelector<HTMLElement>(railItemSelector(current)) : null;
    const held = hold.current;
    const mounting = mountFocus.current;
    hold.current = false;
    mountFocus.current = false;
    if (!root || !item) return;
    if (moved) item.scrollIntoView({ block: "nearest" });
    if (mounting) {
      item.focus({ preventScroll: true });
      return;
    }
    if (!held) return;
    // Only when focus is still in the list or was dropped to the page, never away from somewhere else.
    const active = item.ownerDocument.activeElement;
    if (!active || active === item.ownerDocument.body || root.contains(active)) item.focus({ preventScroll: true });
  }, [list, current, order]);

  return useCallback(() => {
    hold.current = true;
    window.setTimeout(() => {
      hold.current = false;
    }, 0);
  }, []);
}

/**
 * The keys the editor's shortcut hook turns into slide commands in the rail: they delete, add, move or switch slides,
 * which can move or remove the focused item.
 */
export function isRailCommandKey(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }, isMac: boolean): boolean {
  if (event.altKey) return false;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (!mod) return event.key === "Delete" || event.key === "Backspace" || event.key === "PageUp" || event.key === "PageDown";
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return key === "d" || key === "x" || key === "v" || key === "ArrowUp" || key === "ArrowDown";
}
