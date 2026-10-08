"use client";

// Moving Drive entries by drag and drop: cards, tiles and rows are drag sources; folders, the
// breadcrumbs and the nav roots (My files, Store) are drop targets. The payload is the dragged
// keys as JSON under DRIVE_DND_MIME — the selection when the dragged entry is part of one,
// else the entry alone — so the page drop zone (components/drive/upload/drop-zone.tsx, which
// owns the constant) can tell a move from files arriving from the computer.
//
// A drop target can't read the payload before the drop (dataTransfer is protected until
// then), so the drag in progress is also kept here, for this document only; a drag from
// another window is never accepted. Whether a target accepts is asked once per drag, on
// enter, through the caller's canAccept (canDropOn over the entries); the highlight shows only
// then. Drags need a fine pointer: on touch a long press opens the entry's menu instead.

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { DRIVE_DND_MIME } from "@/components/drive/upload/drop-zone";
import type { DriveEntry, DriveMoveTarget } from "@/components/drive/model/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useFinePointer, type DriveSelection } from "./use-selection";

export { DRIVE_DND_MIME };

/** Most keys a payload may carry (a select-all of the largest flat listing). */
const MAX_DRAG_KEYS = 5_000;

interface ActiveDrag {
  readonly token: number;
  readonly keys: readonly string[];
  readonly keySet: ReadonlySet<string>;
}

let activeDrag: ActiveDrag | null = null;
let nextToken = 1;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const dragListeners = new Set<() => void>();

function notifyDrag(): void {
  for (const listener of [...dragListeners]) listener();
}

/**
 * Handlers read the drag at once; components re-render a tick later, so the browser's drag
 * image is taken before a card dims itself.
 */
function setActiveDrag(next: ActiveDrag | null): void {
  activeDrag = next;
  if (notifyTimer !== null) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    notifyDrag();
  }, 0);
}

function subscribeDrag(onChange: () => void): () => void {
  dragListeners.add(onChange);
  return () => {
    dragListeners.delete(onChange);
  };
}

const readDrag = (): ActiveDrag | null => activeDrag;
const serverDrag = (): ActiveDrag | null => null;

/** The drag of Drive entries in progress in this document, or null. */
export function useActiveDrag(): ActiveDrag | null {
  return useSyncExternalStore(subscribeDrag, readDrag, serverDrag);
}

/** The keys of a DRIVE_DND_MIME payload, or null when it is not one. */
export function parseDragKeys(raw: string): string[] | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DRAG_KEYS) return null;
  return value.every((key): key is string => typeof key === "string" && key !== "") ? value : null;
}

function carriesEntries(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(DRIVE_DND_MIME);
}

/** A small "3 selected" label as the drag image of a multi-entry drag. */
function setCountDragImage(event: React.DragEvent, label: string): void {
  if (typeof document === "undefined" || typeof event.dataTransfer.setDragImage !== "function") return;
  const ghost = document.createElement("div");
  ghost.textContent = label;
  ghost.dir = "auto";
  ghost.className = "fixed -top-96 start-0 rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground";
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 12, 12);
  setTimeout(() => ghost.remove(), 0);
}

export interface EntryDrag {
  draggable: boolean;
  /** This entry is part of the drag in progress (shown dimmed). */
  dragging: boolean;
  onDragStart(event: React.DragEvent): void;
  onDragEnd(): void;
}

/** Drag source props for one entry: movable folders, files and documents, with a fine pointer. */
export function useEntryDrag(entry: DriveEntry, selection: DriveSelection): EntryDrag {
  const t = useT();
  const fine = useFinePointer();
  const drag = useActiveDrag();
  const draggable = fine && entry.type !== "virtual" && entry.access.canMove;
  const dragging = drag !== null && drag.keySet.has(entry.key);

  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      if (!draggable) {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      const keys = selection.isSelected(entry.key) && selection.keys.size > 1 ? [...selection.keys] : [entry.key];
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DRIVE_DND_MIME, JSON.stringify(keys));
      if (keys.length > 1) setCountDragImage(event, fmt(t("drive.list.selected"), { count: keys.length }));
      setActiveDrag({ token: nextToken++, keys, keySet: new Set(keys) });
    },
    [draggable, selection, entry.key, t],
  );
  const onDragEnd = useCallback(() => setActiveDrag(null), []);

  return { draggable, dragging, onDragStart, onDragEnd };
}

export interface EntryDropTarget {
  /** A drag the target accepts is over it. */
  isOver: boolean;
  handlers: Pick<React.HTMLAttributes<HTMLElement>, "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop">;
}

/**
 * Drop target props. `target` null = not a target (the handlers do nothing). `canAccept` is asked once per drag,
 * when it enters, and again with the payload on drop.
 */
export function useEntryDropTarget(
  target: DriveMoveTarget | null,
  onDropKeys: (keys: string[], target: DriveMoveTarget) => void,
  canAccept: (keys: string[]) => boolean,
): EntryDropTarget {
  const drag = useActiveDrag();
  const [over, setOver] = useState<{ token: number; ok: boolean } | null>(null);
  // Enter/leave pairs of child elements, per drag; only handlers touch it.
  const depthRef = useRef({ token: 0, depth: 0 });

  const onDragEnter = useCallback(
    (event: React.DragEvent) => {
      const current = readDrag();
      if (!target || !current || !carriesEntries(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (depthRef.current.token !== current.token) {
        depthRef.current = { token: current.token, depth: 0 };
        setOver({ token: current.token, ok: canAccept([...current.keys]) });
      }
      depthRef.current.depth += 1;
    },
    [target, canAccept],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      const current = readDrag();
      if (!target || !current || !carriesEntries(event)) return;
      event.stopPropagation();
      const ok = over !== null && over.token === current.token && over.ok;
      if (!ok) {
        event.dataTransfer.dropEffect = "none";
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [target, over],
  );

  const onDragLeave = useCallback(
    (event: React.DragEvent) => {
      if (!target || !carriesEntries(event)) return;
      const depth = depthRef.current;
      depth.depth = Math.max(0, depth.depth - 1);
      if (depth.depth === 0) {
        depthRef.current = { token: 0, depth: 0 };
        setOver(null);
      }
    },
    [target],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (!target || !carriesEntries(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depthRef.current = { token: 0, depth: 0 };
      setOver(null);
      const active = readDrag();
      const keys = parseDragKeys(event.dataTransfer.getData(DRIVE_DND_MIME)) ?? (active ? [...active.keys] : null);
      setActiveDrag(null);
      if (keys && keys.length > 0 && canAccept(keys)) onDropKeys(keys, target);
    },
    [target, canAccept, onDropKeys],
  );

  const isOver = target !== null && drag !== null && over !== null && over.token === drag.token && over.ok;
  return { isOver, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

/** How a list, the breadcrumbs or the nav hands moves to the page. */
export interface DriveDropHandlers {
  /** Whether these keys may move to `target` (canDropOn over the entries). */
  canDrop(keys: readonly string[], target: DriveMoveTarget): boolean;
  onDrop(keys: readonly string[], target: DriveMoveTarget): void;
}

const NEVER = (): boolean => false;
const IGNORE = (): void => {};

/** useEntryDropTarget over the page's handlers; `drop` null turns the target off. */
export function useDriveDropTarget(target: DriveMoveTarget | null, drop: DriveDropHandlers | null | undefined): EntryDropTarget {
  const canAccept = useCallback((keys: string[]) => (drop && target ? drop.canDrop(keys, target) : false), [drop, target]);
  const onDropKeys = useCallback((keys: string[], to: DriveMoveTarget) => drop?.onDrop(keys, to), [drop]);
  return useEntryDropTarget(drop ? target : null, drop ? onDropKeys : IGNORE, drop ? canAccept : NEVER);
}
