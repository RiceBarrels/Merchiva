// The owner of a deck's UndoManager (slides.md §4.5), one per Y.Doc. The manager is created on the first
// subscription (after commit, so a StrictMode double render never makes one) and lives as long as the doc, not as
// long as its subscribers: a hidden <Activity> (a background browser-shell tab) unsubscribes without unmounting, and
// the history must still be there when the tab is shown again. The session cache destroys the doc (after 30 s
// parked), which disposes the manager.
//
// The same doc can be open in two tabs (the session cache shares it). Each mounted editor binds how it records and
// restores the selection a step was made with; the latest binding, or the one that pressed undo, is used.
import type * as Y from "yjs";

import { createSlidesUndoManager, type UndoSelectionMeta } from "@/lib/slides/model/undo";

export interface UndoFlags {
  canUndo: boolean;
  canRedo: boolean;
}

export const NO_UNDO: UndoFlags = Object.freeze({ canUndo: false, canRedo: false });

/** How one mounted editor records and restores the selection an undo step was made with. */
export interface UndoSelectionBinding {
  get(): UndoSelectionMeta;
  restore(meta: UndoSelectionMeta): void;
}

const NO_SELECTION: UndoSelectionMeta = Object.freeze({ slideId: null, elementIds: [] });

const STACK_EVENTS = ["stack-item-added", "stack-item-popped", "stack-cleared", "stack-item-updated"] as const;

export class UndoHolder {
  private handle: ReturnType<typeof createSlidesUndoManager> | null = null;
  private flags: UndoFlags = NO_UNDO;
  private readonly listeners = new Set<() => void>();
  private readonly bindings: UndoSelectionBinding[] = [];

  constructor(private readonly doc: Y.Doc) {}

  private get binding(): UndoSelectionBinding | undefined {
    return this.bindings[this.bindings.length - 1];
  }

  private ensure(): void {
    if (this.handle || this.doc.isDestroyed) return;
    this.handle = createSlidesUndoManager(this.doc, () => this.binding?.get() ?? NO_SELECTION, (meta) => this.binding?.restore(meta));
    for (const event of STACK_EVENTS) this.handle.undo.on(event, this.refresh);
    this.doc.on("destroy", this.dispose);
    this.refresh();
  }

  private readonly dispose = (): void => {
    this.handle?.dispose();
    this.handle = null;
    this.refresh();
  };

  /** useSyncExternalStore subscribe: creates the manager if needed; unsubscribing only removes the listener. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.ensure();
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): UndoFlags => this.flags;

  private readonly refresh = (): void => {
    const undo = this.handle?.undo;
    const next = { canUndo: undo ? undo.canUndo() : false, canRedo: undo ? undo.canRedo() : false };
    if (next.canUndo === this.flags.canUndo && next.canRedo === this.flags.canRedo) return;
    this.flags = next;
    for (const listener of [...this.listeners]) listener();
  };

  /** Registers `binding` as the latest; the returned function removes it. */
  bind(binding: UndoSelectionBinding): () => void {
    this.bindings.push(binding);
    return () => {
      const at = this.bindings.lastIndexOf(binding);
      if (at >= 0) this.bindings.splice(at, 1);
    };
  }

  /** Makes `binding` (when bound) the latest, so the step it pops restores into its own editor. */
  private promote(binding: UndoSelectionBinding): void {
    const at = this.bindings.lastIndexOf(binding);
    if (at < 0 || at === this.bindings.length - 1) return;
    this.bindings.splice(at, 1);
    this.bindings.push(binding);
  }

  undo(binding: UndoSelectionBinding): void {
    this.promote(binding);
    this.handle?.undo.undo();
  }

  redo(binding: UndoSelectionBinding): void {
    this.promote(binding);
    this.handle?.undo.redo();
  }

  /** Ends the current capture group, so the next tracked edit is its own step. */
  stopCapturing(): void {
    this.handle?.undo.stopCapturing();
  }
}

const holders = new WeakMap<Y.Doc, UndoHolder>();

/** The one holder of `doc` (created on first use). */
export function undoHolderFor(doc: Y.Doc): UndoHolder {
  let holder = holders.get(doc);
  if (!holder) {
    holder = new UndoHolder(doc);
    holders.set(doc, holder);
  }
  return holder;
}
