// Y ⇄ plain model: buildDeckState → apply to a fresh doc → readDeckSnapshot returns the input for every element
// type; readers skip (and never delete) invalid keys, unknown element types and wrong Y types.
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as Y from "yjs";

import {
  SLIDES_DECK_MAP, SLIDES_READ_MAX_ELEMENTS, SLIDES_READ_MAX_SLIDES, SLIDES_SCHEMA_VERSION, SLIDES_SLIDES_MAP,
} from "@/lib/slides/constants";
import { buildDeckState, deckStateMaxBytes, elementToY, masterToY, slideToY, writeDeckSnapshot } from "@/lib/slides/model/build";
import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import { collectImageSrcs, deckMaps, readDeckMeta, readDeckSnapshot, readElement, readSlide } from "@/lib/slides/model/read";
import { tableCellKey } from "@/lib/slides/model/sanitize-table";
import type { DeckSnapshot, SlideElement } from "@/lib/slides/model/types";
import { DEFAULT_THEME_ID, STARTER_THEMES } from "@/lib/slides/themes/themes";
import { sampleDeck, sampleElements, sampleSlide } from "./helpers/fixtures";

function load(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}

let warnSpy: ReturnType<typeof spyOn>;
let logSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  warnSpy = spyOn(console, "warn");
  logSpy = spyOn(console, "log");
});
afterEach(() => {
  // Yjs warns "Invalid access: Add Yjs type to a document before reading data." on any read of a prelim type.
  const calls = [...warnSpy.mock.calls, ...logSpy.mock.calls].map((args) => args.join(" "));
  warnSpy.mockRestore();
  logSpy.mockRestore();
  expect(calls.filter((line) => line.includes("Invalid access"))).toEqual([]);
});

describe("build → read round trip", () => {
  test("every element type, masters, notes, theme and meta come back equal", () => {
    const deck = sampleDeck();
    const doc = load(buildDeckState(deck));
    expect(readDeckSnapshot(doc)).toEqual(deck);
    doc.destroy();
  });

  test("each element alone survives elementToY → read", () => {
    const doc = new Y.Doc();
    const host = doc.getMap<Y.Map<unknown>>("host");
    for (const el of sampleElements()) {
      doc.transact(() => host.set(el.id, elementToY(el)));
      expect(readElement(el.id, host.get(el.id) as Y.Map<unknown>)).toEqual(el);
    }
    doc.destroy();
  });

  test("the state is written with SLIDES_SCHEMA_VERSION and a blank text is one bare paragraph", () => {
    const doc = load(buildDeckState(sampleDeck()));
    expect(doc.getMap(SLIDES_DECK_MAP).get("schemaVersion")).toBe(SLIDES_SCHEMA_VERSION);
    const slide = deckMaps(doc).slides.get("slideA") as Y.Map<unknown>;
    const elements = slide.get("elements") as Y.Map<Y.Map<unknown>>;
    const blank = elements.get("path1")?.get("text") as Y.XmlFragment;
    expect(blank.toArray().map((n) => (n instanceof Y.XmlElement ? [n.nodeName, n.getAttributes()] : "text"))).toEqual([["paragraph", {}]]);
    doc.destroy();
  });

  test("tables get every cell of the grid, missing ones empty", () => {
    const [table] = sampleElements().filter((el): el is Extract<SlideElement, { type: "table" }> => el.type === "table");
    const partial = { ...table, cells: table.cells.slice(0, 1) };
    const doc = new Y.Doc();
    const host = doc.getMap<Y.Map<unknown>>("host");
    doc.transact(() => host.set("tbl1", elementToY(partial)));
    const read = readElement("tbl1", host.get("tbl1") as Y.Map<unknown>);
    expect(read?.type === "table" ? read.cells.map((c) => `${c.rowId}:${c.colId}`) : null).toEqual(["r1:c1", "r1:c2", "r2:c1", "r2:c2"]);
    doc.destroy();
  });

  test("writeDeckSnapshot refuses a doc that already holds a deck", () => {
    const doc = load(buildDeckState(sampleDeck()));
    expect(() => writeDeckSnapshot(doc, sampleDeck())).toThrow("empty doc");
    doc.destroy();
  });

  test("elementToY throws for an invalid element", () => {
    expect(() => elementToY({ id: "bad id!" } as unknown as SlideElement)).toThrow();
  });

  test("deckStateMaxBytes is the same every call and bounds a build under any client id", () => {
    const deck = sampleDeck();
    const sizeUnder = (clientID: number) => {
      const doc = new Y.Doc();
      doc.clientID = clientID;
      writeDeckSnapshot(doc, deck);
      const bytes = Y.encodeStateAsUpdate(doc).byteLength;
      doc.destroy();
      return bytes;
    };
    const max = deckStateMaxBytes(deck);
    expect(deckStateMaxBytes(deck)).toBe(max);
    // One client id per varint width (1–5 bytes): the size grows with it, and the widest is the bound.
    const sizes = [0, 128, 16_384, 2_097_152, 268_435_456, 0xffffffff].map(sizeUnder);
    expect(sizes[0]).toBeLessThan(sizes[4]);
    for (const bytes of sizes) expect(bytes).toBeLessThanOrEqual(max);
    expect(sizes[5]).toBe(max);
    for (let i = 0; i < 20; i++) expect(buildDeckState(deck).byteLength).toBeLessThanOrEqual(max);
  });
});

describe("readers skip bad input and never delete it", () => {
  test("keys failing SLIDES_ID_RE are skipped for slides, elements, masters, rows, columns and cells", () => {
    const bad = ['a"b', "x)", "k".repeat(41), ""];
    const doc = load(buildDeckState(sampleDeck()));
    const { slides, masters } = deckMaps(doc);
    const [el] = sampleElements();
    const table = sampleElements().find((e) => e.type === "table");
    doc.transact(() => {
      for (const key of bad) {
        slides.set(key, slideToY(sampleSlide("ok", "Z", [])));
        masters.set(key, masterToY({ id: "ok", name: "", background: null, elements: [] }));
        ((slides.get("slideA") as Y.Map<unknown>).get("elements") as Y.Map<Y.Map<unknown>>).set(key, elementToY(el));
      }
      const tableMap = ((slides.get("slideA") as Y.Map<unknown>).get("elements") as Y.Map<Y.Map<unknown>>).get(table!.id)!;
      (tableMap.get("rows") as Y.Map<unknown>).set("x)", { order: "Z", h: 20 });
      (tableMap.get("cols") as Y.Map<unknown>).set('a"b', { order: "Z", w: 20 });
      const cells = tableMap.get("cells") as Y.Map<unknown>;
      for (const key of ["x):c1", "r1:a\"b", "r1", "r1:c1:c2", "zz:c1"]) cells.set(key, new Y.Map());
    });
    expect(readDeckSnapshot(doc)).toEqual(sampleDeck());
    // Still stored: readers never delete.
    expect(bad.every((key) => slides.has(key) && masters.has(key))).toBe(true);
    doc.destroy();
  });

  test("an unknown element type or a non-map value is skipped, not deleted", () => {
    const doc = load(buildDeckState(sampleDeck()));
    const elements = (deckMaps(doc).slides.get("slideA") as Y.Map<unknown>).get("elements") as Y.Map<unknown>;
    doc.transact(() => {
      const hologram = new Y.Map<unknown>();
      hologram.set("type", "hologram");
      hologram.set("z", "zz");
      elements.set("holo1", hologram);
      elements.set("plain1", { type: "text" });
    });
    expect(readDeckSnapshot(doc)).toEqual(sampleDeck());
    expect(elements.has("holo1") && elements.has("plain1")).toBe(true);
    expect(readElement("holo1", elements.get("holo1") as Y.Map<unknown>)).toBeNull();
    doc.destroy();
  });

  test("garbage scalar fields read as safe defaults", () => {
    const doc = new Y.Doc();
    const host = doc.getMap<Y.Map<unknown>>("host");
    doc.transact(() => {
      const m = new Y.Map<unknown>();
      m.set("type", "image");
      m.set("x", Number.NaN);
      m.set("w", 1e9);
      m.set("rot", -90);
      m.set("src", "javascript:alert(1)");
      m.set("link", "data:text/html,x");
      m.set("crop", { l: 0.9, r: 0.9 });
      host.set("img", m);
    });
    const el = readElement("img", host.get("img") as Y.Map<unknown>);
    expect(el).toMatchObject({ type: "image", x: 0, w: 20_000, rot: 270, src: "", link: "", crop: { l: 0, t: 0, r: 0, b: 0 } });
    doc.destroy();
  });

  test("an empty doc reads as an empty deck with default meta", () => {
    const doc = new Y.Doc();
    expect(readDeckSnapshot(doc)).toEqual({
      meta: { schemaVersion: 1, size: { w: 960, h: 540 }, theme: STARTER_THEMES[DEFAULT_THEME_ID], source: null },
      masters: [],
      slides: [],
    });
    doc.destroy();
  });

  test("a newer schemaVersion is reported as is", () => {
    const doc = new Y.Doc();
    doc.getMap(SLIDES_DECK_MAP).set("schemaVersion", SLIDES_SCHEMA_VERSION + 1);
    expect(readDeckMeta(doc.getMap(SLIDES_DECK_MAP)).schemaVersion).toBe(SLIDES_SCHEMA_VERSION + 1);
    doc.destroy();
  });

  test("readSlide keeps text from a newer schema as JSON instead of dropping it", () => {
    const doc = load(buildDeckState(sampleDeck()));
    const slide = doc.getMap<Y.Map<unknown>>(SLIDES_SLIDES_MAP).get("slideA") as Y.Map<unknown>;
    const notes = slide.get("notes") as Y.XmlFragment;
    doc.transact(() => {
      const future = new Y.XmlElement("callout");
      const inner = new Y.XmlText();
      inner.insert(0, "future text");
      future.insert(0, [inner]);
      notes.insert(notes.length, [future]);
    });
    const read = readSlide("slideA", slide);
    expect(JSON.stringify(read?.notes)).toContain("future text");
    doc.destroy();
  });
});

describe("hostile remote content", () => {
  /** Replaces the fragment's content with `depth` nested elements around one text node. */
  function nestDeep(fragment: Y.XmlFragment, depth: number, text: string): void {
    fragment.delete(0, fragment.length);
    let parent: Y.XmlFragment = fragment;
    for (let i = 0; i < depth; i++) {
      const child = new Y.XmlElement("paragraph");
      parent.insert(0, [child]);
      parent = child;
    }
    const leaf = new Y.XmlText();
    leaf.insert(0, text);
    parent.insert(0, [leaf]);
  }
  const plain = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

  test("a text fragment nested 20,000 deep, in an element or a table cell, reads as its plain text", () => {
    const doc = load(buildDeckState(sampleDeck()));
    const elements = (deckMaps(doc).slides.get("slideA") as Y.Map<unknown>).get("elements") as Y.Map<Y.Map<unknown>>;
    const cell = (elements.get("tbl1")?.get("cells") as Y.Map<Y.Map<unknown>>).get(tableCellKey("r2", "c1"));
    doc.transact(() => {
      nestDeep(elements.get("txt1")?.get("text") as Y.XmlFragment, 20_000, "deep text");
      nestDeep(cell?.get("text") as Y.XmlFragment, 20_000, "deep cell");
    });
    const text = readElement("txt1", elements.get("txt1") as Y.Map<unknown>);
    expect(text && "text" in text ? text.text : null).toEqual(plain("deep text"));
    const table = readElement("tbl1", elements.get("tbl1") as Y.Map<unknown>);
    expect(table?.type === "table" ? table.cells.find((c) => c.rowId === "r2" && c.colId === "c1")?.text : null).toEqual(plain("deep cell"));
    // A peer receiving it as an update reads the whole deck without throwing.
    const peer = load(Y.encodeStateAsUpdate(doc));
    expect(readDeckSnapshot(peer).slides.map((s) => s.elements.length)).toEqual(readDeckSnapshot(doc).slides.map((s) => s.elements.length));
    peer.destroy();
    doc.destroy();
  });

  test("a hook, an embed or loose top-level text in a fragment never makes a reader throw", () => {
    const doc = load(buildDeckState(sampleDeck()));
    const slide = deckMaps(doc).slides.get("slideA") as Y.Map<unknown>;
    const notes = slide.get("notes") as Y.XmlFragment;
    doc.transact(() => {
      notes.insert(notes.length, [new Y.XmlHook("hook")]);
    });
    expect(readSlide("slideA", slide)?.notes).toEqual(plain("Say hello"));
    doc.transact(() => {
      notes.delete(0, notes.length);
      const para = new Y.XmlElement("paragraph");
      notes.insert(0, [para]);
      const run = new Y.XmlText();
      para.insert(0, [run]);
      run.insert(0, "ab");
      run.insertEmbed(1, { evil: true });
    });
    expect(readSlide("slideA", slide)?.notes).toEqual(plain("ab"));
    doc.transact(() => {
      notes.delete(0, notes.length);
      const loose = new Y.XmlText();
      notes.insert(0, [loose]);
      loose.insert(0, "loose", { bold: {} });
    });
    expect(readSlide("slideA", slide)?.notes).toEqual({ type: "doc", content: [{ type: "text", text: "loose", marks: [{ type: "bold", attrs: {} }] }] });
    doc.destroy();
  });

  test("read ceilings: the first SLIDES_READ_MAX_SLIDES slides and SLIDES_READ_MAX_ELEMENTS elements by order", () => {
    const doc = new Y.Doc();
    const { slides } = deckMaps(doc);
    const slideKeys = sequentialKeys(SLIDES_READ_MAX_SLIDES + 3);
    const [line] = sampleElements().filter((el) => el.type === "line");
    const zKeys = sequentialKeys(SLIDES_READ_MAX_ELEMENTS + 3);
    doc.transact(() => {
      // Inserted last-first, so the result is the first by order, not by insertion.
      for (let i = slideKeys.length - 1; i >= 0; i--) slides.set(`s${i}`, slideToY(sampleSlide(`s${i}`, slideKeys[i], [])));
      const elements = (slides.get("s0") as Y.Map<unknown>).get("elements") as Y.Map<Y.Map<unknown>>;
      for (let i = zKeys.length - 1; i >= 0; i--) elements.set(`e${i}`, elementToY({ ...line, id: `e${i}`, z: zKeys[i] }));
    });
    const snap = readDeckSnapshot(doc);
    expect(snap.slides.map((s) => s.id)).toEqual(Array.from({ length: SLIDES_READ_MAX_SLIDES }, (_, i) => `s${i}`));
    expect(snap.slides[0].elements.map((el) => el.id)).toEqual(Array.from({ length: SLIDES_READ_MAX_ELEMENTS }, (_, i) => `e${i}`));
    // What lies past a ceiling stays in the doc.
    expect(slides.size).toBe(SLIDES_READ_MAX_SLIDES + 3);
    doc.destroy();
  });
});

describe("collectImageSrcs", () => {
  test("image elements, image fills and backgrounds, deduped", () => {
    const deck: DeckSnapshot = sampleDeck();
    expect(collectImageSrcs(deck)).toEqual([
      "https://cdn.example.com/bg.png",
      "https://cdn.example.com/logo.png",
      "https://cdn.example.com/fill.png",
      "https://cdn.example.com/photo.jpg",
    ]);
    const twice = { ...deck, slides: [...deck.slides, { ...deck.slides[0], id: "slideC" }] };
    expect(collectImageSrcs(twice)).toHaveLength(4);
  });
});
