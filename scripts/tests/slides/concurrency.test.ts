// Two (or more) Y.Docs editing one deck and exchanging updates: the ops converge, the documented races resolve the
// documented way, and the DeckStore follows remote changes, repairs only when allowed, and a read-only store never
// writes. Presence travels through y-protocols awareness and is validated on read.
import { describe, expect, spyOn, test } from "bun:test";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

import { REMOTE_ORIGIN } from "@/lib/docs/spacetime-provider";
import { SLIDES_SILENT_ORIGIN } from "@/lib/slides/constants";
import { buildDeckState } from "@/lib/slides/model/build";
import { DeckStore } from "@/lib/slides/model/deck-store";
import { deleteElements, setElementText, updateElements } from "@/lib/slides/model/ops-elements";
import { deleteSlides, insertSlide, moveSlides, seedFirstSlide } from "@/lib/slides/model/ops-slides";
import { insertTableCols, insertTableRows } from "@/lib/slides/model/ops-table";
import { deckMaps, readDeckSnapshot } from "@/lib/slides/model/read";
import type { TableElement } from "@/lib/slides/model/types";
import { readPeerSlides, setLocalSlidesAwareness, SLIDES_AWARENESS_FIELD } from "@/lib/slides/presence";
import { textJsonToPlain } from "@/lib/slides/text/plain";
import { sampleDeck } from "./helpers/fixtures";

const STATE = buildDeckState(sampleDeck());

function peers(n = 2): Y.Doc[] {
  return Array.from({ length: n }, () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, STATE);
    return doc;
  });
}
function sync(...docs: Y.Doc[]): void {
  for (const from of docs) {
    for (const to of docs) if (from !== to) Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)), REMOTE_ORIGIN);
  }
}
const ids = (doc: Y.Doc) => readDeckSnapshot(doc).slides.map((s) => s.id);
const orders = (doc: Y.Doc) => readDeckSnapshot(doc).slides.map((s) => s.order);
const els = (doc: Y.Doc) => readDeckSnapshot(doc).slides.find((s) => s.id === "slideA")!.elements;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function expectConverged(docs: Y.Doc[]): void {
  for (const doc of docs.slice(1)) expect(readDeckSnapshot(doc)).toEqual(readDeckSnapshot(docs[0]));
}
function updates(doc: Y.Doc): Array<unknown> {
  const origins: unknown[] = [];
  doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));
  return origins;
}

describe("ops under concurrency", () => {
  test("concurrent slide moves converge without duplicates", () => {
    const [a, b] = peers();
    const c = insertSlide(a, { afterSlideId: "slideB", layout: "blank" });
    sync(a, b);
    moveSlides(a, ["slideA"], null);
    moveSlides(b, ["slideA", c], "slideB");
    moveSlides(b, ["slideB"], null);
    sync(a, b);
    expect(ids(a)).toEqual(ids(b));
    expect(new Set(ids(a)).size).toBe(3);
    expectConverged([a, b]);
  });

  test("inserts into the same gap get distinct keys and one agreed order", () => {
    const [a, b] = peers();
    // Two random jitter digits collide once in ~3,800 runs; a counter keeps this test deterministic, while an
    // insert without jitter would still give both peers the very same key.
    let counter = 0;
    const random = spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint32Array) for (let i = 0; i < array.length; i++) array[i] = ++counter;
      return array;
    });
    const x = insertSlide(a, { afterSlideId: "slideA", layout: "blank" });
    const y = insertSlide(b, { afterSlideId: "slideA", layout: "blank" });
    random.mockRestore();
    sync(a, b);
    expect(new Set(orders(a)).size).toBe(4);
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)[0]).toBe("slideA");
    expect(ids(a).slice(1, 3).sort()).toEqual([x, y].sort());
  });

  test("fill and stroke edited at once both survive; a delete beats a concurrent text edit", () => {
    const [a, b] = peers();
    updateElements(a, "slideA", [{ id: "shp1", patch: { fill: { t: "solid", color: "#00ff00" } } }]);
    updateElements(b, "slideA", [{ id: "shp1", patch: { stroke: { color: "#0000ff", width: 1, dash: "dot" } } }]);
    sync(a, b);
    expect(els(a).find((el) => el.id === "shp1")).toMatchObject({ fill: { color: "#00ff00" }, stroke: { color: "#0000ff", dash: "dot" } });
    deleteElements(a, "slideA", ["txt1"]);
    setElementText(b, "slideA", "txt1", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "late edit" }] }] });
    sync(a, b);
    expect(els(b).some((el) => el.id === "txt1")).toBe(false);
    expectConverged([a, b]);
  });

  test("a row insert and a column insert leave one cell missing, shown empty and created on the first edit", () => {
    const [a, b] = peers();
    const [row] = insertTableRows(a, "slideA", "tbl1", "r2", "after");
    const [col] = insertTableCols(b, "slideA", "tbl1", "c2", "after");
    sync(a, b);
    const table = (doc: Y.Doc) => els(doc).find((el) => el.id === "tbl1") as TableElement;
    expect(table(a).rows).toHaveLength(3);
    expect(table(a).cols).toHaveLength(3);
    expect(table(a).cells.find((c) => c.rowId === row && c.colId === col)).toBeUndefined();
    setElementText(b, "slideA", "tbl1", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "filled" }] }] }, `${row}:${col}`);
    sync(a, b);
    expect(textJsonToPlain(table(a).cells.find((c) => c.rowId === row && c.colId === col)!.text)).toBe("filled");
    expectConverged([a, b]);
  });

  test("deleting the last two slides at once empties the deck; one seed brings both back to one slide", () => {
    const [a, b] = peers();
    deleteSlides(a, ["slideA"]);
    deleteSlides(b, ["slideB"]);
    sync(a, b);
    expect(ids(a)).toEqual([]);
    const seeded = seedFirstSlide(a, readDeckSnapshot(a).meta);
    sync(a, b);
    expect(ids(b)).toEqual([seeded]);
    expect(readDeckSnapshot(b).slides[0].elements.map((el) => el.placeholder)).toEqual(["title", "subtitle"]);
    expectConverged([a, b]);
  });
});

describe("DeckStore", () => {
  test("follows remote adds, deletes and edits, re-reading only what changed", async () => {
    const [a, b] = peers();
    const store = new DeckStore(b);
    const first = store.getSnapshot();
    expect(first.slideIds).toEqual(["slideA", "slideB"]);
    expect({ ...first, slides: [...first.slides.values()], masters: [...first.masters.values()] })
      .toEqual({ meta: readDeckSnapshot(b).meta, slideIds: ids(b), slides: readDeckSnapshot(b).slides, masters: readDeckSnapshot(b).masters, schemaTooNew: false });

    const added = insertSlide(a, { afterSlideId: "slideA", layout: "title" });
    sync(a, b);
    await settle();
    const second = store.getSnapshot();
    expect(second.slideIds).toEqual(["slideA", added, "slideB"]); // top-level add: keysChanged
    expect(second.slides.get("slideA")).toBe(first.slides.get("slideA"));

    setElementText(a, "slideA", "shp1", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Now" }] }] });
    sync(a, b);
    await settle();
    const third = store.getSnapshot();
    const [before, after] = [second.slides.get("slideA")!, third.slides.get("slideA")!];
    expect(after).not.toBe(before);
    expect(after.elements.filter((el, i) => el === before.elements[i]).map((el) => el.id)).toEqual(["txt1", "path1", "ln1", "img1", "tbl1", "cht1"]);
    expect(third.slides.get(added)).toBe(second.slides.get(added));

    deleteSlides(a, [added]);
    sync(a, b);
    await settle();
    expect(store.getSnapshot().slideIds).toEqual(["slideA", "slideB"]); // top-level delete
    expect([...store.getSnapshot().slides.values()]).toEqual(readDeckSnapshot(b).slides);
    store.destroy();
  });

  test("a read-only store publishes duplicate keys and an empty deck but never writes", async () => {
    const [doc] = peers(1);
    const slides = deckMaps(doc).slides;
    doc.transact(() => slides.get("slideB")!.set("order", slides.get("slideA")!.get("order")));
    const seen = updates(doc);
    const store = new DeckStore(doc, { readOnly: true });
    store.setCanRepair(true);
    let published = 0;
    store.subscribe(() => published++);
    doc.transact(() => slides.delete("slideA"), REMOTE_ORIGIN);
    doc.transact(() => slides.delete("slideB"), REMOTE_ORIGIN);
    await settle();
    await settle();
    expect(published).toBe(1);
    expect(store.getSnapshot().slideIds).toEqual([]);
    expect(seen).toEqual([REMOTE_ORIGIN, REMOTE_ORIGIN]); // only the two deletes: no repair, no seed
    store.destroy();
  });

  test("an editable store repairs duplicate keys silently and seeds an empty deck once; concurrent repairs agree", async () => {
    const [a, b] = peers();
    const { slides } = deckMaps(a);
    const elements = slides.get("slideA")!.get("elements") as Y.Map<Y.Map<unknown>>;
    a.transact(() => {
      slides.get("slideB")!.set("order", slides.get("slideA")!.get("order"));
      elements.get("shp1")!.set("z", elements.get("txt1")!.get("z"));
      elements.get("img1")!.set("z", "not a key!");
    });
    sync(a, b);
    const seen = updates(a);
    const [storeA, storeB] = [new DeckStore(a), new DeckStore(b)];
    storeA.setCanRepair(true);
    storeB.setCanRepair(true);
    await settle();
    expect(seen).toEqual([SLIDES_SILENT_ORIGIN]);
    sync(a, b);
    expect(new Set(orders(a)).size).toBe(2);
    expect(new Set(els(a).map((el) => el.z)).size).toBe(els(a).length);
    expectConverged([a, b]);

    storeB.destroy();
    a.transact(() => [...slides.keys()].forEach((id) => slides.delete(id)), REMOTE_ORIGIN);
    await settle();
    await settle();
    expect(storeA.getSnapshot().slideIds).toHaveLength(1);
    a.transact(() => [...slides.keys()].forEach((id) => slides.delete(id)), REMOTE_ORIGIN);
    await settle();
    await settle();
    expect(storeA.getSnapshot().slideIds).toEqual([]); // once per store
    storeA.destroy();
  });
});

describe("presence", () => {
  test("slides awareness reaches peers validated, and an unchanged state is not re-sent", () => {
    const [a, b] = peers();
    const [awA, awB] = [new Awareness(a), new Awareness(b)];
    awA.setLocalStateField("user", { name: " Ana ", color: "#AABBCC", memberId: "0b6a2c1e-7d4f-4a1b-9c2d-3e4f5a6b7c8d" });
    let changes = 0;
    awA.on("change", () => changes++);
    setLocalSlidesAwareness(awA, { v: 1, slideId: "slideA", sel: ["shp1", "shp1", "bad id"], edit: "tbl1/r1:c2" });
    setLocalSlidesAwareness(awA, { v: 1, slideId: "slideA", sel: ["shp1"], edit: "tbl1/r1:c2" });
    expect(changes).toBe(1);
    applyAwarenessUpdate(awB, encodeAwarenessUpdate(awA, [a.clientID]), REMOTE_ORIGIN);
    expect(readPeerSlides(awB, b.clientID)).toEqual([
      { v: 1, slideId: "slideA", sel: ["shp1"], edit: "tbl1/r1:c2", yClientId: a.clientID, memberId: "0b6a2c1e-7d4f-4a1b-9c2d-3e4f5a6b7c8d", name: "Ana", color: "#aabbcc" },
    ]);
    expect(readPeerSlides(awA, a.clientID)).toEqual([]); // never yourself

    const c = new Y.Doc();
    const awC = new Awareness(c);
    awC.setLocalState({ user: { name: "Eve", color: "red;" }, [SLIDES_AWARENESS_FIELD]: { v: 1, slideId: "x)", sel: Array.from({ length: 80 }, (_, i) => `e${i}`), edit: "a/b" } });
    applyAwarenessUpdate(awB, encodeAwarenessUpdate(awC, [c.clientID]), REMOTE_ORIGIN);
    const eve = readPeerSlides(awB, b.clientID).find((p) => p.name === "Eve")!;
    expect(eve).toMatchObject({ slideId: null, edit: null, color: "#6b7280", memberId: "" });
    expect(eve.sel).toHaveLength(50);
    [awA, awB, awC].forEach((aw) => aw.destroy());
  });
});
