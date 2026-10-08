// Transform gestures as data (lib/slides/editor/gestures.ts) and the S6 undo acceptance: one gesture is one undo
// step (frames → one updateElements between two stopCapturing fences), text typed through y-tiptap and object edits
// share one stack in order, and an arrow-key burst merges into one step.
import { afterEach, describe, expect, test } from "bun:test";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import {
  endpointFrame, frameAfterDrag, frameAfterResize, frameAfterRotate, gesturePatch, gesturePatches, snapLineAngle, startFrame,
  type GestureFrame,
} from "@/lib/slides/editor/gestures";
import { newLine, newShape } from "@/lib/slides/editor/elements";
import { elementTextFragment } from "@/lib/slides/editor/text-target";
import { nudgePatches } from "@/lib/slides/geometry/arrange";
import { addElements, updateElements } from "@/lib/slides/model/ops-elements";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import type { LineElement, SlideElement } from "@/lib/slides/model/types";
import { createSlidesUndoManager } from "@/lib/slides/model/undo";
import { textJsonToPlain } from "@/lib/slides/text/plain";
import { SIZE, sampleDoc } from "./helpers";

const PAD = 6;
const disposers: Array<() => void> = [];
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

function elementsOf(doc: Y.Doc, slideId = "slideA"): SlideElement[] {
  return [...(readDeckSnapshot(doc).slides.find((s) => s.id === slideId)?.elements ?? [])];
}

function setup() {
  const doc = sampleDoc();
  const [shapeId, lineId] = addElements(doc, "slideA", [newShape("rect", SIZE), newLine(false, SIZE)]);
  const manager = createSlidesUndoManager(doc, () => ({ slideId: "slideA", elementIds: [] }), () => undefined);
  disposers.push(manager.dispose);
  const undo = manager.undo;
  undo.clear();
  const el = (id: string) => elementsOf(doc).find((e) => e.id === id)!;
  const boxEl = (id: string) => {
    const e = el(id);
    if (e.type === "line") throw new Error("not a box element");
    return e;
  };
  const textOf = (id: string) => {
    const e = el(id);
    return e.type === "text" || e.type === "shape" ? textJsonToPlain(e.text) : "";
  };
  /** What the editor does at a gesture's end: one write between two fences (use-element-actions `patch`). */
  const commit = (frames: Map<string, GestureFrame>) => {
    undo.stopCapturing();
    updateElements(doc, "slideA", gesturePatches(elementsOf(doc), frames));
    undo.stopCapturing();
  };
  return { doc, undo, shapeId, lineId, el, boxEl, textOf, commit };
}

describe("frames", () => {
  const box: GestureFrame = { x: 10, y: 20, w: 100, h: 50, rot: 30 };

  test("drag moves the frame to the wrapper translate; a line's wrapper sits one pad outside its box", () => {
    expect(frameAfterDrag(box, [40, 60], false, PAD)).toEqual({ ...box, x: 40, y: 60 });
    expect(frameAfterDrag(box, [40, 60], true, PAD)).toEqual({ ...box, x: 46, y: 66 });
    expect(frameAfterDrag(box, [Number.NaN, 1], false, PAD)).toBe(box);
  });

  test("resize keeps a minimum size; rotate normalizes to [0, 360)", () => {
    expect(frameAfterResize(box, 0, -5, [1, 2])).toEqual({ ...box, x: 1, y: 2, w: 1, h: 1 });
    expect(frameAfterRotate(box, -90, [10, 20]).rot).toBe(270);
    expect(frameAfterRotate(box, 405, [10, 20]).rot).toBe(45);
  });

  test("a patch holds only what moved, rounded to 0.01 pt; nothing moved → null", () => {
    const { el, shapeId } = setup();
    const shape = el(shapeId);
    expect(gesturePatch(shape, startFrame(shape))).toBeNull();
    const moved = gesturePatch(shape, { ...startFrame(shape), x: 100.123456, rot: 12.3456 });
    expect(moved).toEqual({ id: shapeId, patch: { x: 100.12, rot: 12.35 } });
    expect(gesturePatch({ ...shape, locked: true }, { ...startFrame(shape), x: 1 })).toBeNull();
  });

  test("a line moves by its endpoints; an endpoint frame wins over the box", () => {
    const { el, lineId } = setup();
    const line = el(lineId) as LineElement;
    const start = startFrame(line);
    expect(gesturePatch(line, { ...start, x: start.x + 10, y: start.y - 5 })?.patch).toEqual({ x1: line.x1 + 10, y1: line.y1 - 5, x2: line.x2 + 10, y2: line.y2 - 5 });
    const end = endpointFrame(line, "end", { x: 700, y: 400 }, false);
    expect(gesturePatch(line, end)?.patch).toEqual({ x2: 700, y2: 400 });
  });

  test("Shift snaps a dragged line end to 45° steps, keeping its length", () => {
    const p = snapLineAngle({ x: 0, y: 0 }, { x: 100, y: 10 });
    expect(p.x).toBeCloseTo(Math.hypot(100, 10));
    expect(p.y).toBeCloseTo(0);
    const d = snapLineAngle({ x: 0, y: 0 }, { x: 50, y: 60 });
    expect(d.x).toBeCloseTo(d.y);
  });
});

describe("undo (S6 acceptance)", () => {
  test("one gesture is one undo step, even two gestures within the capture timeout", () => {
    const { undo, shapeId, el, boxEl, commit } = setup();
    const x0 = boxEl(shapeId).x;
    const frame = startFrame(el(shapeId));
    // A drag emits many frames; only the last one is committed.
    const steps = [1, 2, 3, 4, 5].map((dx) => new Map([[shapeId, { ...frame, x: frame.x + dx * 10 }]]));
    commit(steps[steps.length - 1]);
    const afterFirst = boxEl(shapeId).x;
    commit(new Map([[shapeId, { ...startFrame(el(shapeId)), y: 7 }]]));
    expect(undo.undoStack.length).toBe(2);
    undo.undo();
    expect(boxEl(shapeId).x).toBe(afterFirst);
    undo.undo();
    expect(boxEl(shapeId).x).toBe(x0);
  });

  test("a group gesture is one step for every element it moved", () => {
    const { undo, shapeId, lineId, el, commit } = setup();
    const before = [el(shapeId), el(lineId)];
    commit(new Map(before.map((e) => { const f = startFrame(e); return [e.id, { ...f, x: f.x + 30 }] as const; })));
    expect(undo.undoStack.length).toBe(1);
    undo.undo();
    expect([el(shapeId), el(lineId)]).toEqual(before);
  });

  test("text typed in the editor and object edits share one stack, undone in order", () => {
    const { doc, undo, shapeId, el, boxEl, textOf, commit } = setup();
    const fragment = elementTextFragment(doc, "slideA", shapeId);
    if (!fragment) throw new Error("no fragment");
    // y-tiptap writes typing with its plugin key as the transaction origin.
    doc.transact(() => {
      const paragraph = fragment.get(0) as Y.XmlElement;
      paragraph.insert(0, [new Y.XmlText("Hello")]);
    }, ySyncPluginKey);
    undo.stopCapturing();
    commit(new Map([[shapeId, { ...startFrame(el(shapeId)), x: 5 }]]));
    expect(textOf(shapeId)).toBe("Hello");
    undo.undo();
    expect(boxEl(shapeId).x).not.toBe(5);
    expect(textOf(shapeId)).toBe("Hello");
    undo.undo();
    expect(textOf(shapeId)).toBe("");
  });

  test("an arrow-key burst (no fences) merges into one step", () => {
    const { doc, undo, shapeId, el, boxEl } = setup();
    const x0 = boxEl(shapeId).x;
    for (let i = 0; i < 12; i++) updateElements(doc, "slideA", nudgePatches([el(shapeId)], 1, 0));
    expect(boxEl(shapeId).x).toBe(x0 + 12);
    expect(undo.undoStack.length).toBe(1);
    undo.undo();
    expect(boxEl(shapeId).x).toBe(x0);
  });
});
