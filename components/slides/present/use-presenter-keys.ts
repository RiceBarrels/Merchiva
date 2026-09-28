"use client";

// Slideshow keys (slides.md §9): one capture-phase keydown listener per Window the show is in, the main window and,
// while it is open, the speaker popup, so keys typed in either drive the same show. The key map is
// lib/slides/present/input.ts.
//
// A handled key is prevented. Keys typed into a text field are left alone, and Enter / Space on a button or link
// that has keyboard focus activate it instead of moving the show; a mouse or touch press never gives a show control
// focus (keepKeysWithShow), so after a click Space still goes to the next slide. Nodes are checked with nodeType,
// never instanceof: the popup is another realm.
//
// A handled key is also kept from the page's own key handlers (a device panel closes on Escape), but only on its
// way back up, after the document: the device's idle timer counts keydown on the document, and a presenter using a
// keyboard or a clicker must not be logged out mid-show. A key aimed at something outside the show (focus that
// escaped into the editor behind) is stopped at once, so the editor never acts on it.
import { useEffect, useEffectEvent, useRef } from "react";

import { REPEATABLE_PRESENTER_ACTIONS, presenterKeyAction, type PresenterKeyAction } from "@/lib/slides/present/input";

export interface PresenterKeyHandlers {
  onAction(action: PresenterKeyAction, event: KeyboardEvent): void;
}

/** Marks the show's own UI (the overlay, the speaker view): keys aimed inside it travel on to the document. */
export const PRESENT_SHOW_ATTR = "data-slides-show";

/** What a mouse press must not focus, and what keeps Enter / Space while it has keyboard focus. */
const ACTIVATES = "button, a[href], [role='button'], [role='link'], [role='menuitem']";

function elementOf(target: EventTarget | null): Element | null {
  const node = target as Node | null;
  return node && node.nodeType === 1 ? (node as Element) : null;
}

/** True when the key belongs to the focused control: a text field, or Enter / Space on a button or link. */
function keyBelongsToTarget(event: KeyboardEvent): boolean {
  const el = elementOf(event.target);
  if (!el) return false;
  if (el.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return true;
  const activates = event.key === "Enter" || event.key === " " || event.key === "Spacebar";
  return activates && el.closest(ACTIVATES) !== null;
}

/** Keeps a handled key from the page's other handlers without hiding it from the document (see the header). */
function shield(event: KeyboardEvent): void {
  const el = elementOf(event.target);
  if (!el) return;
  const doc = el.ownerDocument;
  if (el !== doc.body && el !== doc.documentElement && !el.closest(`[${PRESENT_SHOW_ATTR}]`)) {
    event.stopPropagation();
    return;
  }
  // Added during dispatch, so it runs after every document listener already there; `once` drops it with the next
  // keydown if this one never gets that far.
  doc.addEventListener(
    "keydown",
    (e) => {
      if (e === event) e.stopPropagation();
    },
    { once: true },
  );
}

/**
 * onMouseDown for the show's UI: a press on a button or link does not focus it (it would then take Enter / Space,
 * the presenter's "next"), and a control focused earlier with Tab hands focus back to `home` (or lets go of it).
 */
export function keepKeysWithShow(event: { target: EventTarget | null; preventDefault(): void }, home: HTMLElement | null): void {
  const control = elementOf(event.target)?.closest(ACTIVATES);
  if (!control) return;
  event.preventDefault();
  const doc = control.ownerDocument;
  const active = doc.activeElement as HTMLElement | null;
  if (!active || active === home || active === doc.body || !active.closest(ACTIVATES)) return;
  if (home) home.focus({ preventScroll: true });
  else active.blur();
}

/** A stable id per Window object, so the effect re-subscribes only when the set of windows changes. */
const windowIds = new WeakMap<Window, number>();
let nextWindowId = 1;
function windowId(win: Window): number {
  let id = windowIds.get(win);
  if (id === undefined) {
    id = nextWindowId++;
    windowIds.set(win, id);
  }
  return id;
}

export function usePresenterKeys(targets: readonly Window[], handlers: PresenterKeyHandlers): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const action = presenterKeyAction(event);
    if (!action || keyBelongsToTarget(event)) return;
    event.preventDefault();
    shield(event);
    if (event.repeat && !REPEATABLE_PRESENTER_ACTIONS.has(action.type)) return;
    handlers.onAction(action, event);
  });

  const latestTargets = useRef(targets);
  useEffect(() => {
    latestTargets.current = targets;
  });
  const key = targets.map(windowId).join(",");

  useEffect(() => {
    const wins = latestTargets.current.filter((win, i, list) => list.indexOf(win) === i);
    const listener = (event: Event) => onKeyDown(event as KeyboardEvent);
    for (const win of wins) win.addEventListener("keydown", listener, true);
    return () => {
      for (const win of wins) {
        try {
          win.removeEventListener("keydown", listener, true);
        } catch {
          // A closed popup: its listeners went with it.
        }
      }
    };
  }, [key]);
}
