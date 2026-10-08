// The deck UndoManager's owner (lib/slides/editor/undo-holder.ts): the history lives as long as the Y.Doc, not as
// long as its subscribers (a hidden <Activity> unsubscribes without unmounting), the doc's destroy disposes it, and
// selections go to the latest binding or to the one that pressed undo.
import { describe, expect, test } from "bun:test";

import { newTextBox } from "@/lib/slides/editor/elements";
import { NO_UNDO, UndoHolder, undoHolderFor, type UndoSelectionBinding } from "@/lib/slides/editor/undo-holder";
import { addElements, updateElements } from "@/lib/slides/model/ops-elements";
import type { UndoSelectionMeta } from "@/lib/slides/model/undo";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import { SIZE, sampleDoc } from "./helpers";

function binding(selection: UndoSelectionMeta, restored: UndoSelectionMeta[]): UndoSelectionBinding {
  return { get: () => selection, restore: (m) => restored.push(m) };
}

function xOf(doc: ReturnType<typeof sampleDoc>, id: string): number | undefined {
  const el = readDeckSnapshot(doc).slides[0].elements.find((e) => e.id === id);
  return el && el.type !== "line" ? el.x : undefined;
}

describe("undo holder", () => {
  test("one holder per doc", () => {
    const a = sampleDoc();
    expect(undoHolderFor(a)).toBe(undoHolderFor(a));
    expect(undoHolderFor(a)).not.toBe(undoHolderFor(sampleDoc()));
  });

  test("the history survives the last unsubscribe (a hidden tab) and a new subscription sees it", () => {
    const doc = sampleDoc();
    const holder = new UndoHolder(doc);
    const off = holder.subscribe(() => undefined);
    const [id] = addElements(doc, "slideA", [newTextBox(SIZE, { x: 100, y: 100 })]);
    holder.stopCapturing();
    const x0 = xOf(doc, id);
    updateElements(doc, "slideA", [{ id, patch: { x: 150 } }]);
    expect(holder.getSnapshot().canUndo).toBe(true);

    off();
    expect(holder.getSnapshot().canUndo).toBe(true);
    const off2 = holder.subscribe(() => undefined);
    expect(holder.getSnapshot().canUndo).toBe(true);
    holder.undo(binding({ slideId: null, elementIds: [] }, []));
    expect(xOf(doc, id)).toBe(x0);
    off2();
  });

  test("the doc's destroy disposes the manager and notifies subscribers", () => {
    const doc = sampleDoc();
    const holder = new UndoHolder(doc);
    let calls = 0;
    holder.subscribe(() => {
      calls += 1;
    });
    addElements(doc, "slideA", [newTextBox(SIZE)]);
    expect(holder.getSnapshot().canUndo).toBe(true);
    const before = calls;
    doc.destroy();
    expect(holder.getSnapshot()).toEqual(NO_UNDO);
    expect(calls).toBeGreaterThan(before);
    // Nothing is created again for a destroyed doc.
    holder.subscribe(() => undefined);
    expect(holder.getSnapshot()).toEqual(NO_UNDO);
  });

  test("the latest binding records the selection; undo restores into the binding that pressed it", () => {
    const doc = sampleDoc();
    const holder = new UndoHolder(doc);
    holder.subscribe(() => undefined);
    const firstRestored: UndoSelectionMeta[] = [];
    const secondRestored: UndoSelectionMeta[] = [];
    const first = binding({ slideId: "slideA", elementIds: ["first"] }, firstRestored);
    const second = binding({ slideId: "slideB", elementIds: ["second"] }, secondRestored);
    const unbindFirst = holder.bind(first);
    const unbindSecond = holder.bind(second);

    addElements(doc, "slideA", [newTextBox(SIZE)]);
    holder.undo(first);
    // The step was recorded with the latest binding's selection, and restored into the one that pressed undo.
    expect(firstRestored).toEqual([{ slideId: "slideB", elementIds: ["second"] }]);
    expect(secondRestored).toEqual([]);

    unbindFirst();
    unbindSecond();
    holder.stopCapturing();
    addElements(doc, "slideA", [newTextBox(SIZE)]);
    holder.undo(first);
    // Unbound: recorded with no selection, and nobody is told.
    expect(firstRestored).toHaveLength(1);
  });
});
