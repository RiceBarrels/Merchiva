// The deck UndoManager (lib/slides/model/undo.ts): one stack for object edits and text typed through y-tiptap,
// nothing remote or silent on it, y-tiptap's capture and delete rules, and the selection each step was made with.
import { afterEach, describe, expect, test } from "bun:test";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { REMOTE_ORIGIN } from "@/lib/docs/spacetime-provider";
import { SLIDES_SILENT_ORIGIN } from "@/lib/slides/constants";
import { buildDeckState } from "@/lib/slides/model/build";
import { addElements, updateElements } from "@/lib/slides/model/ops-elements";
import { insertSlide, seedFirstSlide, transactSlides } from "@/lib/slides/model/ops-slides";
import { deckMaps, readDeckSnapshot } from "@/lib/slides/model/read";
import { createSlidesUndoManager, type UndoSelectionMeta } from "@/lib/slides/model/undo";
import { textJsonToPlain } from "@/lib/slides/text/plain";
import { canonical, sampleDeck } from "./helpers/fixtures";

/** One state for every doc: peers must start from the same Yjs items, not from two builds of the same deck. */
const STATE = buildDeckState(sampleDeck());
const disposers: Array<() => void> = [];
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

function setup(docs = 1) {
  const all = Array.from({ length: docs }, () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, STATE);
    return doc;
  });
  let selection: UndoSelectionMeta = { slideId: "slideA", elementIds: [] };
  const restored: UndoSelectionMeta[] = [];
  const manager = createSlidesUndoManager(all[0], () => selection, (m) => {
    restored.push(m);
    selection = m;
  });
  disposers.push(manager.dispose);
  return { doc: all[0], docs: all, undo: manager.undo, restored, select: (s: UndoSelectionMeta) => (selection = s) };
}
function sync(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)), REMOTE_ORIGIN);
}
const el = (doc: Y.Doc, id: string) => readDeckSnapshot(doc).slides[0].elements.find((e) => e.id === id);
const elementMaps = (doc: Y.Doc) => deckMaps(doc).slides.get("slideA")!.get("elements") as Y.Map<Y.Map<unknown>>;
const shapeText = (doc: Y.Doc) => elementMaps(doc).get("shp1")!.get("text") as Y.XmlFragment;
/** Types into the shape's first paragraph the way y-tiptap does (origin ySyncPluginKey). */
function typeText(doc: Y.Doc, text: string, meta?: [string, unknown]): void {
  doc.transact((tr) => {
    if (meta) tr.meta.set(meta[0], meta[1]);
    const paragraph = shapeText(doc).get(0) as Y.XmlElement;
    (paragraph.get(0) as Y.XmlText).insert(0, text);
  }, ySyncPluginKey);
}
const plain = (doc: Y.Doc, id = "shp1") => {
  const found = el(doc, id);
  return found && (found.type === "text" || found.type === "shape") ? textJsonToPlain(found.text) : null;
};

describe("deck undo", () => {
  test("one gesture is one step; stopCapturing separates gestures", () => {
    const { doc, undo } = setup();
    updateElements(doc, "slideA", [{ id: "shp1", patch: { x: 100, y: 100 } }, { id: "img1", patch: { x: 5 } }]); // one drag of two
    undo.stopCapturing();
    updateElements(doc, "slideA", [{ id: "shp1", patch: { x: 200 } }]);
    expect(undo.undoStack).toHaveLength(2);
    undo.undo();
    expect(el(doc, "shp1")).toMatchObject({ x: 100, y: 100 });
    undo.undo();
    expect(el(doc, "shp1")).toMatchObject({ x: 40, y: 50 });
    expect(el(doc, "img1")).toMatchObject({ x: 40 });
    undo.redo();
    expect(el(doc, "img1")).toMatchObject({ x: 5 });
  });

  test("text typed through y-tiptap and object edits share one stack, in order", () => {
    const { doc, undo } = setup();
    updateElements(doc, "slideA", [{ id: "shp1", patch: { rot: 45 } }]);
    undo.stopCapturing();
    typeText(doc, "Big ");
    expect(plain(doc)).toBe("Big Sale");
    undo.undo();
    expect(plain(doc)).toBe("Sale");
    expect(el(doc, "shp1")).toMatchObject({ rot: 45 });
    undo.undo();
    expect(el(doc, "shp1")).toMatchObject({ rot: 15 });
  });

  test("remote, silent and addToHistory: false transactions are never captured", () => {
    const { doc, docs, undo } = setup(2);
    const remote = docs[1];
    updateElements(remote, "slideA", [{ id: "shp1", patch: { x: 300 } }]);
    sync(remote, doc); // applied with REMOTE_ORIGIN
    seedFirstSlide(doc, readDeckSnapshot(doc).meta); // no-op here (the deck has slides), but silent anyway
    transactSlides(doc, () => deckMaps(doc).deck.set("source", null), SLIDES_SILENT_ORIGIN);
    typeText(doc, "x", ["addToHistory", false]);
    expect(undo.undoStack).toHaveLength(0);
    undo.undo();
    expect(el(doc, "shp1")).toMatchObject({ x: 300 });
    expect(plain(doc)).toBe("xSale");
  });

  test("undo keeps a paragraph someone else typed into, but still removes an added element", () => {
    const { doc, docs, undo } = setup(2);
    const remote = docs[1];
    doc.transact(() => shapeText(doc).insert(1, [new Y.XmlElement("paragraph")]), ySyncPluginKey);
    sync(doc, remote);
    remote.transact(() => (shapeText(remote).get(1) as Y.XmlElement).insert(0, [new Y.XmlText("theirs")]));
    sync(remote, doc);
    undo.undo(); // would delete the paragraph this step created, with their text in it
    expect(plain(doc)).toBe("Sale\ntheirs");

    undo.stopCapturing();
    const [added] = addElements(doc, "slideA", [{ ...(canonical({ id: "t", type: "text", x: 1, y: 1, w: 10, h: 10, text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "mine" }] }] } })), id: undefined }]);
    expect(plain(doc, added)).toBe("mine");
    undo.undo();
    expect(el(doc, added)).toBeUndefined();
  });

  test("each step hands back the selection it was made with, on undo and on redo", () => {
    const { doc, undo, restored, select } = setup();
    select({ slideId: "slideA", elementIds: ["shp1"] });
    updateElements(doc, "slideA", [{ id: "shp1", patch: { x: 1 } }]);
    undo.stopCapturing();
    select({ slideId: "slideB", elementIds: [] });
    const added = insertSlide(doc, { afterSlideId: "slideB", layout: "blank" });
    select({ slideId: added, elementIds: [] });
    undo.undo();
    undo.undo();
    expect(restored).toEqual([{ slideId: "slideB", elementIds: [] }, { slideId: "slideA", elementIds: ["shp1"] }]);
    undo.redo();
    expect(restored.at(-1)).toEqual({ slideId: "slideA", elementIds: ["shp1"] });
  });

  test("dispose removes the doc listener the UndoManager constructor leaves behind", () => {
    const doc = new Y.Doc();
    const count = () => doc._observers.get("destroy")?.size ?? 0;
    const before = count();
    const manager = createSlidesUndoManager(doc, () => ({ slideId: null, elementIds: [] }), () => {});
    expect(count()).toBeGreaterThan(before);
    manager.dispose();
    manager.dispose();
    expect(count()).toBe(before);
  });
});
