// applyDeckSnapshot (version restore as a diff) and lib/slides/versions.ts: ids and untouched Y items are kept,
// the result reads back as the target, restoring the current state writes nothing, the restore is one undo step,
// and a collaborator receives it as a normal update without losing their own concurrent edit.
import { describe, expect, test } from "bun:test";
import * as Y from "yjs";

import { REMOTE_ORIGIN } from "@/lib/docs/spacetime-provider";
import type { DocVersionKind } from "@/lib/docs/types";
import { SLIDES_SCHEMA_VERSION } from "@/lib/slides/constants";
import { applyDeckSnapshot } from "@/lib/slides/model/apply-snapshot";
import { buildDeckState } from "@/lib/slides/model/build";
import { addElements, deleteElements, setElementText, updateElements } from "@/lib/slides/model/ops-elements";
import { applyTheme, deleteSlides, insertSlide } from "@/lib/slides/model/ops-slides";
import { deleteTableRows, insertTableCols } from "@/lib/slides/model/ops-table";
import { deckMaps, readDeckSnapshot } from "@/lib/slides/model/read";
import { createSlidesUndoManager } from "@/lib/slides/model/undo";
import { loadVersionDoc, restoreSlidesVersion, SLIDES_VERSION_DOC_CACHE_SIZE } from "@/lib/slides/versions";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import { canonical, sampleDeck } from "./helpers/fixtures";

const STATE = buildDeckState(sampleDeck());
function load(state: Uint8Array = STATE): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}
function sync(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)), REMOTE_ORIGIN);
}
const elementMaps = (doc: Y.Doc, slideId = "slideA") => deckMaps(doc).slides.get(slideId)!.get("elements") as Y.Map<Y.Map<unknown>>;
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

/** Every kind of change a restore has to undo, made to `doc`. */
function scramble(doc: Y.Doc): void {
  updateElements(doc, "slideA", [{ id: "shp1", patch: { x: 500, fill: { t: "none" } } }]);
  deleteElements(doc, "slideA", ["img1"]);
  addElements(doc, "slideA", [{ ...canonical({ id: "x", type: "line", x1: 0, y1: 0, x2: 9, y2: 9 }), id: undefined }]);
  setElementText(doc, "slideA", "txt1", { type: "doc", content: [para("Replaced title")] });
  insertTableCols(doc, "slideA", "tbl1", "c2", "after");
  deleteTableRows(doc, "slideA", "tbl1", ["r2"]);
  insertSlide(doc, { afterSlideId: "slideA", layout: "twoColumn" });
  deleteSlides(doc, ["slideB"]);
  applyTheme(doc, STARTER_THEMES.market);
  const elements = elementMaps(doc);
  doc.transact(() => {
    elements.delete("cht1");
    elements.set("cht1", new Y.Map<unknown>([["type", "image"], ["z", "Z"]])); // same id, another type
  });
}

describe("applyDeckSnapshot", () => {
  test("restores the target exactly and keeps the ids and Y maps of what survived", () => {
    const doc = load();
    const target = readDeckSnapshot(doc);
    const slideA = deckMaps(doc).slides.get("slideA");
    const shape = elementMaps(doc).get("shp1");
    scramble(doc);
    applyDeckSnapshot(doc, target);
    expect(readDeckSnapshot(doc)).toEqual(target);
    expect(deckMaps(doc).slides.get("slideA")).toBe(slideA);
    expect(elementMaps(doc).get("shp1")).toBe(shape);
  });

  test("texts are diff-updated: an untouched paragraph keeps its Y item", () => {
    const doc = load();
    const fragment = elementMaps(doc).get("txt1")!.get("text") as Y.XmlFragment;
    const target = readDeckSnapshot(doc);
    const [first, second] = [fragment.get(0), fragment.get(1)];
    doc.transact(() => ((fragment.get(1) as Y.XmlElement).get(0) as Y.XmlElement).insert(0, [new Y.XmlElement("paragraph")]));
    setElementText(doc, "slideA", "shp1", { type: "doc", content: [para("changed")] });
    applyDeckSnapshot(doc, target);
    expect(readDeckSnapshot(doc)).toEqual(target);
    expect([fragment.get(0), fragment.get(1)]).toEqual([first, second]);
    expect(fragment.get(0)).toBe(first);
  });

  test("restoring the current state writes nothing", () => {
    const doc = load();
    let updates = 0;
    doc.on("update", () => updates++);
    applyDeckSnapshot(doc, readDeckSnapshot(doc));
    expect(updates).toBe(0);
  });

  test("a restore is one undo step, and a peer receives it as a normal update next to its own edit", () => {
    const [doc, peer] = [load(), load()];
    const target = readDeckSnapshot(doc);
    scramble(doc);
    sync(doc, peer);
    const scrambled = readDeckSnapshot(doc);
    const manager = createSlidesUndoManager(doc, () => ({ slideId: null, elementIds: [] }), () => {});
    applyDeckSnapshot(doc, target);
    setElementText(peer, "slideA", "path1", { type: "doc", content: [para("peer edit")] }); // concurrent, elsewhere
    sync(doc, peer);
    sync(peer, doc);
    const expected = readDeckSnapshot(doc);
    expect(readDeckSnapshot(peer)).toEqual(expected);
    expect(expected.slides[0].elements.find((el) => el.id === "path1")).toMatchObject({ text: { content: [para("peer edit")] } });
    expect({ ...expected, slides: expected.slides.map((s) => ({ ...s, elements: s.elements.filter((el) => el.id !== "path1") })) })
      .toEqual({ ...target, slides: target.slides.map((s) => ({ ...s, elements: s.elements.filter((el) => el.id !== "path1") })) });
    expect(manager.undo.undoStack).toHaveLength(1);
    manager.undo.undo();
    const undone = readDeckSnapshot(doc);
    expect(undone.meta).toEqual(scrambled.meta);
    expect(undone.slides.map((s) => s.id)).toEqual(scrambled.slides.map((s) => s.id));
    manager.dispose();
  });
});

describe("versions", () => {
  const version = (id: string, state: Uint8Array = STATE) => ({ id, state });

  test("loadVersionDoc decodes once per id (LRU) and rejects a corrupt state", async () => {
    const first = await loadVersionDoc(version("v1"));
    expect(await loadVersionDoc(version("v1"))).toBe(first);
    expect(readDeckSnapshot(first)).toEqual(readDeckSnapshot(load()));
    for (let i = 2; i <= SLIDES_VERSION_DOC_CACHE_SIZE + 1; i++) await loadVersionDoc(version(`v${i}`));
    expect(await loadVersionDoc(version("v1"))).not.toBe(first); // evicted, decoded again
    expect(readDeckSnapshot(await loadVersionDoc(version("empty", new Uint8Array(0)))).slides).toEqual([]);
    await expect(loadVersionDoc(version("bad", new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0x01])))).rejects.toThrow();
  });

  test("restoreSlidesVersion saves a safety version first, then applies; bad versions change nothing", async () => {
    const doc = load();
    const target = readDeckSnapshot(doc);
    scramble(doc);
    const saved: Array<[DocVersionKind, string | undefined]> = [];
    const provider = { saveVersion: async (kind: DocVersionKind, name?: string) => void saved.push([kind, name]) };
    await restoreSlidesVersion({ ydoc: doc, provider, version: version("r1"), safetyName: "  Before   restore \n" });
    expect(saved).toEqual([["restore", "Before restore"]]);
    expect(readDeckSnapshot(doc)).toEqual(target);

    const tooNew = load();
    deckMaps(tooNew).deck.set("schemaVersion", SLIDES_SCHEMA_VERSION + 1);
    const cases = [version("corrupt", new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0x01])), version("none", new Uint8Array(0)), version("new", Y.encodeStateAsUpdate(tooNew))];
    const before = Y.encodeStateAsUpdate(doc);
    for (const bad of cases) await expect(restoreSlidesVersion({ ydoc: doc, provider, version: bad, safetyName: "x" })).rejects.toThrow();
    expect(saved).toHaveLength(1);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);

    const closed = load();
    closed.destroy();
    await expect(restoreSlidesVersion({ ydoc: closed, provider, version: version("r1"), safetyName: "" })).rejects.toThrow();
    expect(saved.at(-1)).toEqual(["restore", undefined]);
  });
});
