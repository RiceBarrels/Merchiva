// The deck's one undo stack (slides.md §4.5): object edits (SLIDES_ORIGIN) and text typed in the slide text editor
// (y-tiptap's ySyncPluginKey origin) land in the same Y.UndoManager, so Mod+Z walks back through both in order.
// Remote rows (REMOTE_ORIGIN) and silent repairs (SLIDES_SILENT_ORIGIN) are never tracked, so undo only reverts
// your own edits. Capture options match y-tiptap's own manager: a transaction flagged addToHistory: false is not
// captured, and undo never deletes a non-empty paragraph (or text) someone else typed into.
//
// Each stack item remembers the selection it was made with; popping it hands that back to restoreSelection.
import { defaultDeleteFilter, defaultProtectedNodes, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { SLIDES_ID_RE, SLIDES_ORIGIN } from "@/lib/slides/constants";
import { deckMaps } from "@/lib/slides/model/read";

export interface UndoSelectionMeta { slideId: string | null; elementIds: readonly string[] }

/** Consecutive tracked edits closer together than this merge into one step (Y.UndoManager's default). */
export const SLIDES_UNDO_CAPTURE_MS = 500;
const SELECTION_META = "slides:selection";

type DestroyListener = (doc: Y.Doc) => void;
type StackEvent = { stackItem: { meta: Map<unknown, unknown> } };

function destroyListeners(doc: Y.Doc): Set<unknown> {
  return new Set<unknown>(doc._observers.get("destroy") ?? []);
}

function isSelectionMeta(value: unknown): value is UndoSelectionMeta {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { slideId?: unknown; elementIds?: unknown };
  return (v.slideId === null || typeof v.slideId === "string") && Array.isArray(v.elementIds);
}

function copySelection(s: UndoSelectionMeta): UndoSelectionMeta {
  return {
    slideId: typeof s.slideId === "string" && SLIDES_ID_RE.test(s.slideId) ? s.slideId : null,
    elementIds: s.elementIds.filter((id) => typeof id === "string"),
  };
}

/**
 * The deck UndoManager over the three top-level maps. `dispose()` destroys it and also removes the `destroy`
 * listener its constructor adds to the doc (which UndoManager.destroy() leaves behind): the Y.Doc outlives the
 * editor in the session cache, and that listener would keep the manager alive with it.
 */
export function createSlidesUndoManager(
  doc: Y.Doc,
  getSelection: () => UndoSelectionMeta,
  restoreSelection: (m: UndoSelectionMeta) => void,
): { undo: Y.UndoManager; dispose(): void } {
  const { deck, slides, masters } = deckMaps(doc);
  const before = destroyListeners(doc);
  const undo = new Y.UndoManager([deck, slides, masters], {
    trackedOrigins: new Set<unknown>([SLIDES_ORIGIN, ySyncPluginKey]),
    captureTimeout: SLIDES_UNDO_CAPTURE_MS,
    captureTransaction: (tr) => tr.meta.get("addToHistory") !== false,
    deleteFilter: (item) => defaultDeleteFilter(item, defaultProtectedNodes),
  });
  const leaked = [...destroyListeners(doc)].filter((listener): listener is DestroyListener => !before.has(listener) && typeof listener === "function");

  const onAdded = ({ stackItem }: StackEvent) => {
    if (stackItem.meta.has(SELECTION_META)) return;
    // The redo item of an undo (and vice versa) keeps the selection of the edit itself, not the one at undo time.
    const inverse = undo.currStackItem?.meta.get(SELECTION_META);
    stackItem.meta.set(SELECTION_META, isSelectionMeta(inverse) ? inverse : copySelection(getSelection()));
  };
  const onPopped = ({ stackItem }: StackEvent) => {
    const meta = stackItem.meta.get(SELECTION_META);
    if (isSelectionMeta(meta)) restoreSelection(meta);
  };
  undo.on("stack-item-added", onAdded);
  undo.on("stack-item-popped", onPopped);

  let disposed = false;
  return {
    undo,
    dispose() {
      if (disposed) return;
      disposed = true;
      undo.off("stack-item-added", onAdded);
      undo.off("stack-item-popped", onPopped);
      undo.destroy();
      for (const listener of leaked) doc.off("destroy", listener);
    },
  };
}
