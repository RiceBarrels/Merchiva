"use client";

// Selection on the Drive manager page, and the keyboard of its results region.
//
// A selection is a set of entry keys ("item:<uuid>", "doc:<uuid>", "v:…") plus the anchor of
// the last plain toggle (Shift extends from it) and, on touch, a selection mode in which a tap
// toggles instead of opening. It only ever holds keys the view shows: it is pruned to them
// during render (the adjust-state-on-prop-change pattern of rename-dialog.tsx) and cleared when
// the view's scope (section, folder, member) changes.
//
// Keyboard shortcuts belong to the results region alone (the grid or the list calls
// onDriveResultsKeyDown from its own onKeyDown), never to the document: Enter opens, Space
// previews, F2 renames, Delete / Backspace move to trash, Mod+A selects every visible entry
// and Escape clears the selection. Every action is checked against driveActionGroups, so a
// key never does what the menu would not offer.

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { driveActionGroups, type ActionContext, type DriveAction, type DriveBulkAction } from "@/components/drive/model/actions";
import type { DriveEntry } from "@/components/drive/model/types";
import { selectionActions } from "@/components/drive/toolbar/selection-actions";

export interface DriveSelection {
  keys: ReadonlySet<string>;
  anchor: string | null;
  /** Touch selection mode: a tap on an entry toggles it. Ends when nothing is selected any more. */
  mode: boolean;
  isSelected(key: string): boolean;
  /** Adds or removes one key; it becomes the anchor. */
  toggle(key: string): void;
  /** Shift+click: gives every key between the anchor and `key` (in `ordered`) the state `key` is toggled to. */
  extendTo(key: string, ordered: readonly string[]): void;
  /** Replaces the selection. */
  set(keys: readonly string[]): void;
  clear(): void;
  /** Starts touch selection mode with `key` selected. */
  enterMode(key: string): void;
}

export interface SelectionState {
  readonly keys: ReadonlySet<string>;
  readonly anchor: string | null;
  readonly mode: boolean;
}

const NO_KEYS: ReadonlySet<string> = new Set<string>();
export const EMPTY_SELECTION: SelectionState = Object.freeze({ keys: NO_KEYS, anchor: null, mode: false });

/** The state restricted to `visible`; the same object when nothing had to go. Mode ends with the last key. */
export function pruneSelection<S extends SelectionState>(state: S, visible: ReadonlySet<string>): S {
  let dropped = false;
  for (const key of state.keys) {
    if (!visible.has(key)) {
      dropped = true;
      break;
    }
  }
  const anchorGone = state.anchor !== null && !visible.has(state.anchor);
  if (!dropped && !anchorGone) return state;
  const keys = dropped ? new Set([...state.keys].filter((key) => visible.has(key))) : state.keys;
  return { ...state, keys, anchor: anchorGone ? null : state.anchor, mode: state.mode && keys.size > 0 };
}

export function toggleSelection<S extends SelectionState>(state: S, key: string): S {
  const keys = new Set(state.keys);
  if (keys.has(key)) keys.delete(key);
  else keys.add(key);
  return { ...state, keys, anchor: key, mode: state.mode && keys.size > 0 };
}

export function extendSelection<S extends SelectionState>(state: S, key: string, ordered: readonly string[]): S {
  const to = ordered.indexOf(key);
  const from = state.anchor === null ? -1 : ordered.indexOf(state.anchor);
  if (to < 0 || from < 0) return toggleSelection(state, key);
  const select = !state.keys.has(key);
  const keys = new Set(state.keys);
  for (const k of ordered.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    if (select) keys.add(k);
    else keys.delete(k);
  }
  return { ...state, keys, anchor: key, mode: state.mode && keys.size > 0 };
}

export function replaceSelection<S extends SelectionState>(state: S, next: readonly string[]): S {
  const keys = new Set(next);
  return { ...state, keys, anchor: next.length > 0 ? next[next.length - 1] : null, mode: state.mode && keys.size > 0 };
}

interface ScopedSelection extends SelectionState {
  readonly scope: string;
}

/**
 * The page's selection. `visibleKeys` are the keys the view shows (anything else is dropped);
 * `scope` names the view (section, folder, member): a new scope starts empty.
 */
export function useDriveSelection(visibleKeys: readonly string[], scope: string = ""): DriveSelection {
  const [stored, setStored] = useState<ScopedSelection>(() => ({ ...EMPTY_SELECTION, scope }));
  const scoped: ScopedSelection = stored.scope === scope ? stored : { ...EMPTY_SELECTION, scope };
  const empty = scoped.keys.size === 0 && scoped.anchor === null;
  const current = empty ? scoped : pruneSelection(scoped, new Set(visibleKeys));
  if (current !== stored) setStored(current);

  const toggle = useCallback((key: string) => setStored((s) => toggleSelection(s, key)), []);
  const extendTo = useCallback((key: string, ordered: readonly string[]) => setStored((s) => extendSelection(s, key, ordered)), []);
  const set = useCallback((keys: readonly string[]) => setStored((s) => replaceSelection(s, keys)), []);
  const clear = useCallback(
    () => setStored((s) => (s.keys.size === 0 && s.anchor === null && !s.mode ? s : { ...EMPTY_SELECTION, scope: s.scope })),
    [],
  );
  const enterMode = useCallback(
    (key: string) => setStored((s) => ({ ...s, keys: new Set([...s.keys, key]), anchor: key, mode: true })),
    [],
  );

  const { keys, anchor, mode } = current;
  return useMemo(
    () => ({ keys, anchor, mode, isSelected: (key: string) => keys.has(key), toggle, extendTo, set, clear, enterMode }),
    [keys, anchor, mode, toggle, extendTo, set, clear, enterMode],
  );
}

// ── Pointer ──────────────────────────────────────────────────────────────────

const FINE_POINTER = "(pointer: fine)";
let pointerQuery: MediaQueryList | null = null;

function finePointerQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  pointerQuery ??= window.matchMedia(FINE_POINTER);
  return pointerQuery;
}

function subscribePointer(onChange: () => void): () => void {
  const query = finePointerQuery();
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const readFinePointer = (): boolean => finePointerQuery()?.matches ?? false;
const serverFinePointer = (): boolean => false;

/** A mouse or trackpad drives the page: hover checkboxes, drag and drop and the marquee are offered. */
export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribePointer, readFinePointer, serverFinePointer);
}

// ── Results keyboard ─────────────────────────────────────────────────────────

export type DriveKeyCommand = "open" | "preview" | "rename" | "trash" | "selectAll" | "clear";

/** What has focus inside the results region. */
export type DriveKeyTarget = "text" | "control" | "link" | "other";

export interface DriveKeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  composing?: boolean;
}

/**
 * The command a key press asks for, or null. Typing in a field never triggers one; Enter on a
 * link or a button keeps its native activation (a folder or document link opens, a file link
 * previews), and Space on a checkbox or button keeps toggling / pressing it.
 */
export function driveKeyCommand(input: DriveKeyInput, target: DriveKeyTarget): DriveKeyCommand | null {
  if (input.composing || target === "text") return null;
  const mod = input.ctrlKey || input.metaKey;
  if (mod && !input.altKey && !input.shiftKey && input.key.toLowerCase() === "a") return "selectAll";
  if (mod || input.altKey) return null;
  switch (input.key) {
    case "Enter":
      return target === "other" ? "open" : null;
    case " ":
      return target === "control" ? null : "preview";
    case "F2":
      return "rename";
    case "Delete":
    case "Backspace":
      return "trash";
    case "Escape":
      return "clear";
    default:
      return null;
  }
}

function keyTargetOf(element: Element | null): DriveKeyTarget {
  if (!element) return "other";
  if (element.closest("textarea, select, [contenteditable=''], [contenteditable='true'], input:not([type=checkbox]):not([type=radio])")) {
    return "text";
  }
  if (element.closest("a[href]")) return "link";
  if (element.closest("button, input, [role=checkbox], [role=button], [role=menuitem], [role=radio]")) return "control";
  return "other";
}

const NO_MOVES = { toStore: false, toMy: false };

function offers(entry: DriveEntry, ctx: ActionContext, action: DriveAction): boolean {
  return driveActionGroups(entry, ctx, NO_MOVES).some((group) => group.includes(action));
}

export interface DriveResultsKeyOptions {
  /** The entries in display order. */
  entries: readonly DriveEntry[];
  selection: DriveSelection;
  ctx: ActionContext;
  onAction(entry: DriveEntry, action: DriveAction): void;
  onBulkAction(entries: readonly DriveEntry[], action: DriveBulkAction): void;
}

/** onKeyDown of the results region. Keys from portaled menus and dialogs (not DOM descendants) are ignored. */
export function onDriveResultsKeyDown(event: React.KeyboardEvent<HTMLElement>, opts: DriveResultsKeyOptions): void {
  if (event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !event.currentTarget.contains(target)) return;
  const command = driveKeyCommand(
    { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, composing: event.nativeEvent.isComposing },
    keyTargetOf(target),
  );
  if (!command) return;
  const { entries, selection, ctx } = opts;

  if (command === "selectAll") {
    event.preventDefault();
    selection.set(entries.map((entry) => entry.key));
    return;
  }
  if (command === "clear") {
    if (selection.keys.size === 0) return;
    event.preventDefault();
    selection.clear();
    return;
  }

  const key = target.closest("[data-drive-entry]")?.getAttribute("data-drive-entry") ?? null;
  const focused = key === null ? null : (entries.find((entry) => entry.key === key) ?? null);

  if (command === "trash") {
    const selected = entries.filter((entry) => selection.keys.has(entry.key));
    if (selected.length > 0 && (focused === null || selection.keys.has(focused.key))) {
      if (selectionActions(selected, ctx.section, ctx.offline).includes("trash")) {
        event.preventDefault();
        opts.onBulkAction(selected, "trash");
      }
      return;
    }
    if (focused && offers(focused, ctx, "trash")) {
      event.preventDefault();
      opts.onAction(focused, "trash");
    }
    return;
  }

  if (!focused) return;
  const wanted: DriveAction[] =
    command === "rename"
      ? ["rename"]
      : command === "preview"
        ? ["preview", "details"]
        : focused.type === "file" || focused.type === "virtual"
          ? ["preview"]
          : ["open"];
  const action = wanted.find((candidate) => offers(focused, ctx, candidate));
  if (!action) return;
  event.preventDefault();
  opts.onAction(focused, action);
}
