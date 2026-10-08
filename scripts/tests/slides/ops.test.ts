// Model operations (lib/slides/model/ops-*.ts): slides, elements and tables, plus the clipboard payload they paste.
// Every op is one transaction, checks before it writes (a refused op leaves the doc untouched) and writes only
// what changes.
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as Y from "yjs";

import { decodeClipboard, encodeClipboard, SLIDES_CLIPBOARD_MIME, type SlidesClipboardPayload } from "@/lib/slides/clipboard";
import { SLIDES_MAX_ELEMENTS_PER_SLIDE, SLIDES_MAX_SLIDES } from "@/lib/slides/constants";
import { unionBounds } from "@/lib/slides/geometry/arrange";
import { buildDeckState } from "@/lib/slides/model/build";
import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import {
  addElements, deleteElements, duplicateElements, pasteElements, reorderElements, setElementText, updateElements,
} from "@/lib/slides/model/ops-elements";
import {
  applyTheme, deleteSlides, duplicateSlides, insertSlide, moveSlides, pasteSlides, setSlidesProps, SlidesOpError,
} from "@/lib/slides/model/ops-slides";
import {
  deleteTableCols, deleteTableRows, distributeTableCols, insertTableCols, insertTableRows, setCellsFill, setTableStyle,
} from "@/lib/slides/model/ops-table";
import { deckMaps, readDeckSnapshot } from "@/lib/slides/model/read";
import type { ElementPatchEntry, NewElement, ShapeElement, SlideElement, SlideSnapshot, TableElement } from "@/lib/slides/model/types";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import { textJsonToPlain } from "@/lib/slides/text/plain";
import { canonical, sampleDeck, sampleElements } from "./helpers/fixtures";

let warnSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  warnSpy = spyOn(console, "warn");
});
afterEach(() => {
  const calls = warnSpy.mock.calls.map((args) => args.join(" "));
  warnSpy.mockRestore();
  expect(calls.filter((line) => line.includes("Invalid access"))).toEqual([]); // no read of a prelim Y type
});

function sample(): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, buildDeckState(sampleDeck()));
  return doc;
}
const ids = (doc: Y.Doc) => readDeckSnapshot(doc).slides.map((s) => s.id);
const slide = (doc: Y.Doc, id: string): SlideSnapshot => readDeckSnapshot(doc).slides.find((s) => s.id === id)!;
const els = (doc: Y.Doc, id = "slideA") => slide(doc, id).elements;
const table = (doc: Y.Doc) => els(doc).find((el) => el.id === "tbl1") as TableElement;
function updates(doc: Y.Doc, fn: () => void): number {
  let n = 0;
  const count = () => n++;
  doc.on("update", count);
  try {
    fn();
  } finally {
    doc.off("update", count);
  }
  return n;
}
function refused(doc: Y.Doc, code: SlidesOpError["code"], fn: () => void): void {
  const before = Y.encodeStateAsUpdate(doc);
  expect(fn).toThrow(SlidesOpError);
  try {
    fn();
  } catch (error) {
    expect((error as SlidesOpError).code).toBe(code);
  }
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
}
/** A doc holding `n` bare slides (only an order key each): enough for the caps. */
function bareDeck(n: number): Y.Doc {
  const doc = new Y.Doc();
  const keys = sequentialKeys(n);
  doc.transact(() => keys.forEach((key, i) => deckMaps(doc).slides.set(`s${i}`, new Y.Map<unknown>([["order", key]]))));
  return doc;
}
const textBox = (text: string, x = 10): NewElement => ({
  ...(canonical({ id: "tmp", type: "text", x, y: 20, w: 100, h: 40, text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } }) as NewElement),
  id: undefined,
});

describe("slides", () => {
  test("insertSlide places the layout's placeholders between its neighbours; null means first, a gone id last", () => {
    const doc = sample();
    const id = insertSlide(doc, { afterSlideId: "slideA", layout: "titleBody" });
    expect(ids(doc)).toEqual(["slideA", id, "slideB"]);
    const added = slide(doc, id);
    expect(added.elements.map((el) => el.placeholder)).toEqual(["title", "body"]);
    expect(added.masterId).toBe("theme"); // copied from slideA
    const first = insertSlide(doc, { afterSlideId: null, layout: "blank" });
    expect(ids(doc)[0]).toBe(first);
    const last = insertSlide(doc, { afterSlideId: "gone", layout: "title", masterId: "" });
    expect(ids(doc).at(-1)).toBe(last);
    refused(doc, "invalid", () => insertSlide(doc, { afterSlideId: null, layout: "bogus" as never }));
    const full = bareDeck(SLIDES_MAX_SLIDES);
    refused(full, "tooManySlides", () => insertSlide(full, { afterSlideId: null, layout: "blank" }));
    refused(full, "tooManySlides", () => duplicateSlides(full, ["s0"]));
  });

  test("duplicateSlides copies right after the last source with new slide and element ids", () => {
    const doc = sample();
    const [copy] = duplicateSlides(doc, ["slideA", "missing"]);
    expect(ids(doc)).toEqual(["slideA", copy, "slideB"]);
    const [a, b] = [slide(doc, "slideA"), slide(doc, copy)];
    expect(b.elements.map((el) => el.type)).toEqual(a.elements.map((el) => el.type));
    expect(b.elements.some((el) => a.elements.some((o) => o.id === el.id))).toBe(false);
    const withoutId = (el: SlideElement) => ({ ...el, id: "" });
    expect(b.elements.map(withoutId)).toEqual(a.elements.map(withoutId));
    expect(duplicateSlides(doc, ["nope"])).toEqual([]);
  });

  test("deleteSlides never empties the deck locally", () => {
    const doc = sample();
    refused(doc, "lastSlide", () => deleteSlides(doc, ["slideA", "slideB"]));
    deleteSlides(doc, ["slideB", "ghost"]);
    expect(ids(doc)).toEqual(["slideA"]);
    refused(doc, "lastSlide", () => deleteSlides(doc, ["slideA"]));
  });

  test("moveSlides keeps relative order and re-keys only the moved slides", () => {
    const doc = sample();
    const c = insertSlide(doc, { afterSlideId: "slideB", layout: "blank" });
    const orderB = slide(doc, "slideB").order;
    moveSlides(doc, [c, "slideA"], null);
    expect(ids(doc)).toEqual(["slideB", "slideA", c]);
    expect(slide(doc, "slideB").order).toBe(orderB);
    moveSlides(doc, [c], "slideB");
    expect(ids(doc)).toEqual([c, "slideB", "slideA"]);
    expect(updates(doc, () => moveSlides(doc, ["slideB"], "slideB"))).toBe(0); // onto itself
    expect(updates(doc, () => moveSlides(doc, [c], "slideB"))).toBe(0); // already there
  });

  test("moveSlides lands between two slides whose order keys tie (before the store's repair)", () => {
    const doc = sample();
    const c = insertSlide(doc, { afterSlideId: "slideB", layout: "blank" });
    const { slides } = deckMaps(doc);
    doc.transact(() => slides.get("slideB")!.set("order", slides.get("slideA")!.get("order")));
    expect(ids(doc)).toEqual(["slideA", "slideB", c]);
    moveSlides(doc, [c], "slideB");
    expect(ids(doc)).toEqual(["slideA", c, "slideB"]);
    expect(new Set(readDeckSnapshot(doc).slides.map((s) => s.order)).size).toBe(3); // the tie is repaired in the same write
  });

  test("setSlidesProps validates first and writes only changed keys; applyTheme sanitizes", () => {
    const doc = sample();
    setSlidesProps(doc, ["slideA", "slideB"], { hidden: true, background: { t: "solid", color: "theme:accent1" }, transition: { type: "fade", durationMs: 500 } });
    expect(readDeckSnapshot(doc).slides.map((s) => [s.hidden, s.background, s.transition?.durationMs])).toEqual([
      [true, { t: "solid", color: "theme:accent1" }, 500],
      [true, { t: "solid", color: "theme:accent1" }, 500],
    ]);
    expect(updates(doc, () => setSlidesProps(doc, ["slideA"], { hidden: true }))).toBe(0);
    refused(doc, "invalid", () => setSlidesProps(doc, ["slideA"], { hidden: false, background: { t: "solid", color: "url(x)" } as never }));
    applyTheme(doc, { ...STARTER_THEMES.paper, fonts: { heading: "x; y", body: "Georgia" } });
    const theme = readDeckSnapshot(doc).meta.theme;
    expect(theme.colors).toEqual(STARTER_THEMES.paper.colors);
    expect(theme.fonts).toEqual({ heading: STARTER_THEMES.coastal.fonts.heading, body: "Georgia" }); // bad stack → current
    expect(updates(doc, () => applyTheme(doc, theme))).toBe(0);
  });

  test("pasteSlides resolves theme colours from another deck and drops unknown masters", () => {
    const doc = sample();
    const source = { ...slide(doc, "slideB"), background: { t: "solid" as const, color: "theme:accent1" as const } };
    const payload: SlidesClipboardPayload = { v: 1, kind: "slides", size: { w: 960, h: 540 }, theme: STARTER_THEMES.market, slides: [source] };
    const [pasted] = pasteSlides(doc, "slideA", payload);
    expect(ids(doc)).toEqual(["slideA", pasted, "slideB"]);
    expect(slide(doc, pasted).background).toEqual({ t: "solid", color: STARTER_THEMES.market.colors.accent1 });
    expect(slide(doc, pasted).masterId).toBe("m_0123456789abcdef"); // this deck has that master
    const other = new Y.Doc();
    Y.applyUpdate(other, buildDeckState({ ...sampleDeck(), masters: [] }));
    expect(slide(other, pasteSlides(other, null, payload)[0]).masterId).toBe("");
    expect(pasteSlides(doc, null, { ...payload, kind: "elements" })).toEqual([]);
  });
});

describe("elements", () => {
  test("addElements stacks on top in order, keeps a free id, and refuses invalid input or the cap", () => {
    const doc = sample();
    const [a, b] = addElements(doc, "slideA", [textBox("one"), { ...textBox("two"), id: "mine" }]);
    expect(b).toBe("mine");
    expect(els(doc).slice(-2).map((el) => el.id)).toEqual([a, "mine"]);
    expect(addElements(doc, "slideA", [{ ...textBox("x"), id: "mine" }])[0]).not.toBe("mine");
    refused(doc, "invalid", () => addElements(doc, "slideA", [textBox("ok"), { type: "video" } as never]));
    refused(doc, "notFound", () => addElements(doc, "nope", [textBox("x")]));
    const full = Array.from({ length: SLIDES_MAX_ELEMENTS_PER_SLIDE - els(doc).length + 1 }, () => textBox("x"));
    refused(doc, "tooManyElements", () => addElements(doc, "slideA", full));
  });

  test("updateElements sanitizes per type and sets only the changed keys", () => {
    const doc = sample();
    const text = deckMaps(doc).slides.get("slideA")!.get("elements") as Y.Map<Y.Map<unknown>>;
    const changed: string[] = [];
    text.get("shp1")!.observe((event) => changed.push(...event.keysChanged));
    updateElements(doc, "slideA", [
      { id: "shp1", patch: { x: 1e9, fill: { t: "solid", color: "#ABC" }, stroke: { color: "#112233", width: 3, dash: "dash", alpha: 0.8 } } },
      { id: "ln1", patch: { x: 5, x2: 50 } },
      { id: "gone", patch: { x: 1 } },
    ]);
    expect(changed.sort()).toEqual(["fill", "x"]);
    const byId = new Map(els(doc).map((el) => [el.id, el]));
    expect(byId.get("shp1")).toMatchObject({ x: 20_000, fill: { t: "solid", color: "#aabbcc" } });
    expect(byId.get("ln1")).toMatchObject({ x2: 50 });
    expect(byId.get("ln1")).not.toHaveProperty("x");
    refused(doc, "invalid", () => updateElements(doc, "slideA", [{ id: "shp1", patch: { y: Number.NaN } }]));
  });

  test("updateElements refuses a value its sanitizer would replace instead of erasing the stored one", () => {
    const doc = sample();
    const shape = els(doc).find((el) => el.id === "shp1") as ShapeElement;
    const bad: ElementPatchEntry[] = [
      { id: "shp1", patch: { fill: { t: "solid", color: "red" } as never } },
      { id: "shp1", patch: { stroke: { color: "nope", width: 2, dash: "solid" } as never } },
      { id: "shp1", patch: { shadow: { x: 1, y: 1, blur: 1, color: "url(x)", alpha: 1 } as never } },
      { id: "shp1", patch: { textStyle: { ...shape.textStyle, font: "x; y" } } },
      { id: "shp1", patch: { box: { ...shape.box, vAlign: "centre" as never } } },
      { id: "shp1", patch: { geom: { kind: "preset", preset: "blob" } as never } },
      { id: "shp1", patch: { x: "5" as never } },
      { id: "img1", patch: { src: "javascript:alert(1)" } },
      { id: "img1", patch: { src: "http://cdn.example.com/a.png" } },
      { id: "img1", patch: { crop: { l: 0.6, t: 0, r: 0.6, b: 0 } } },
      { id: "txt1", patch: { link: "javascript:alert(1)" } },
    ];
    for (const entry of bad) refused(doc, "invalid", () => updateElements(doc, "slideA", [{ id: "txt1", patch: { x: 1 } }, entry]));
    expect(els(doc).find((el) => el.id === "shp1")).toEqual(shape);
    // null clears a nullable key and "" a link; undefined is no value; a line has no "no stroke", so it keeps its own
    const line = els(doc).find((el) => el.id === "ln1");
    updateElements(doc, "slideA", [
      { id: "shp1", patch: { shadow: null, fill: undefined, stroke: { ...shape.stroke!, color: "#ABC" } } },
      { id: "txt1", patch: { link: "" } },
      { id: "ln1", patch: { stroke: null } },
    ]);
    const byId = new Map(els(doc).map((el) => [el.id, el]));
    expect(byId.get("shp1")).toMatchObject({ shadow: null, fill: shape.fill, stroke: { ...shape.stroke, color: "#aabbcc" } });
    expect(byId.get("txt1")).toMatchObject({ link: "" });
    expect(byId.get("ln1")).toEqual(line);
  });

  test("delete, duplicate (+12 pt, on top) and z-order", () => {
    const doc = sample();
    deleteElements(doc, "slideA", ["cht1", "ghost"]);
    const [line, image] = duplicateElements(doc, "slideA", ["img1", "ln1"]);
    const list = els(doc);
    expect(list.slice(-2).map((el) => el.id)).toEqual([line, image]); // z order of the sources is kept
    expect(list.at(-2)).toMatchObject({ type: "line", x1: 22, y1: 32, x2: 412, y2: 32 });
    expect(list.at(-1)).toMatchObject({ type: "image", x: 52, y: 62 });
    const order = () => els(doc).map((el) => el.id);
    const start = order();
    reorderElements(doc, "slideA", ["txt1"], "front");
    expect(order()).toEqual([...start.filter((id) => id !== "txt1"), "txt1"]);
    reorderElements(doc, "slideA", ["txt1", "shp1"], "back");
    expect(order().slice(0, 2)).toEqual(["shp1", "txt1"]);
    reorderElements(doc, "slideA", ["shp1"], "forward");
    expect(order().slice(0, 3)).toEqual(["txt1", "shp1", "path1"]);
    reorderElements(doc, "slideA", ["path1"], "backward");
    expect(order().slice(0, 3)).toEqual(["txt1", "path1", "shp1"]);
    expect(updates(doc, () => reorderElements(doc, "slideA", ["txt1"], "back"))).toBe(0);
  });

  test("reorderElements steps between two elements whose z keys tie (before the store's repair)", () => {
    const doc = sample();
    const map = deckMaps(doc).slides.get("slideA")!.get("elements") as Y.Map<Y.Map<unknown>>;
    doc.transact(() => map.get("path1")!.set("z", map.get("shp1")!.get("z")));
    const order = () => els(doc).map((el) => el.id);
    expect(order().slice(0, 4)).toEqual(["txt1", "path1", "shp1", "ln1"]); // a tie sorts by id
    reorderElements(doc, "slideA", ["ln1"], "backward");
    expect(order().slice(0, 4)).toEqual(["txt1", "path1", "ln1", "shp1"]);
    expect(new Set(els(doc).map((el) => el.z)).size).toBe(els(doc).length);
  });

  test("setElementText writes sanitized text, creates a missing table cell, and refuses other types", () => {
    const doc = sample();
    setElementText(doc, "slideA", "shp1", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "New", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] });
    expect(els(doc).find((el) => el.id === "shp1")).toMatchObject({ text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "New" }] }] } });
    const cells = (deckMaps(doc).slides.get("slideA")!.get("elements") as Y.Map<Y.Map<unknown>>).get("tbl1")!.get("cells") as Y.Map<unknown>;
    cells.delete("r2:c2");
    setElementText(doc, "slideA", "tbl1", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "4.00" }] }] }, "r2:c2");
    expect(textJsonToPlain(table(doc).cells.find((c) => c.rowId === "r2" && c.colId === "c2")!.text)).toBe("4.00");
    refused(doc, "invalid", () => setElementText(doc, "slideA", "img1", { type: "doc" }));
    refused(doc, "notFound", () => setElementText(doc, "slideA", "tbl1", { type: "doc" }, "r9:c1"));
  });

  test("pasteElements moves the group to `at`, resolves foreign theme colours and uses new ids", () => {
    const doc = sample();
    const copied = els(doc).filter((el) => el.id === "ln1" || el.id === "shp1");
    const payload: SlidesClipboardPayload = { v: 1, kind: "elements", size: { w: 960, h: 540 }, theme: STARTER_THEMES.mono, elements: copied };
    const pasted = pasteElements(doc, "slideA", payload, { x: 0, y: 0 });
    const list = els(doc).filter((el) => pasted.includes(el.id));
    expect(list.map((el) => el.type)).toEqual(["shape", "line"]);
    expect(list[1]).toMatchObject({ stroke: { color: STARTER_THEMES.mono.colors.accent1 } });
    expect(pasted.some((id) => id === "ln1" || id === "shp1")).toBe(false);
    const bounds = unionBounds(list)!; // rotated bounding boxes
    expect([bounds.x, bounds.y].map((n) => Math.round(n * 1000) / 1000)).toEqual([0, 0]);
  });
});

describe("clipboard", () => {
  const payload = (): SlidesClipboardPayload => ({ v: 1, kind: "elements", size: { w: 960, h: 540 }, theme: STARTER_THEMES["simple-light"], elements: sampleElements().slice(0, 2) });
  const clip = (entries: Record<string, string>, types?: string[]) => ({ getData: (type: string) => entries[type] ?? "", types });

  test("round trip through our MIME type, and the in-memory copy only while the clipboard text matches", () => {
    const { json, plain, html } = encodeClipboard(payload());
    expect(plain).toBe("Bold colour\nlink2\n• one\n• two\n  3. nested\nSale");
    expect(html.startsWith("<p>Bold colour</p>")).toBe(true);
    expect(decodeClipboard(clip({ [SLIDES_CLIPBOARD_MIME]: json }), null)).toEqual(payload());
    expect(decodeClipboard(clip({ "text/plain": plain }), json)).toEqual(payload());
    expect(decodeClipboard(null, json)).toEqual(payload());
    expect(decodeClipboard(clip({ "text/plain": "something else" }), json)).toBeNull();
    expect(decodeClipboard(clip({ "text/plain": plain }, ["Files", "text/plain"]), json)).toBeNull();
    expect(decodeClipboard(clip({ [SLIDES_CLIPBOARD_MIME]: "{nope" }), null)).toBeNull();
  });

  test("a hostile payload is sanitized like any remote input", () => {
    const hostile = JSON.stringify({
      v: 1, kind: "elements", size: { w: -5 }, theme: { colors: { bg: "red; x" } },
      elements: [{ id: 'a"b', type: "text" }, { id: "ok", type: "image", x: 0, y: 0, w: 10, h: 10, src: "javascript:alert(1)", link: "data:text/html,x" }],
    });
    const decoded = decodeClipboard(clip({ [SLIDES_CLIPBOARD_MIME]: hostile }), null);
    expect(decoded?.elements?.map((el) => el.id)).toEqual(["ok"]);
    expect(decoded?.elements?.[0]).toMatchObject({ src: "", link: "" });
    expect(decoded?.size).toEqual({ w: 1, h: 540 });
    expect(decoded?.theme.colors.bg).toBe(STARTER_THEMES["simple-light"].colors.bg);
  });
});

describe("tables", () => {
  test("rows and columns are inserted with every cell, and the frame grows", () => {
    const doc = sample();
    const before = table(doc);
    const [row] = insertTableRows(doc, "slideA", "tbl1", "r1", "after");
    expect(table(doc).rows.map((r) => r.id)).toEqual(["r1", row, "r2"]);
    expect(table(doc).cells.filter((c) => c.rowId === row).map((c) => c.colId)).toEqual(["c1", "c2"]);
    expect(table(doc).h).toBe(before.h + 30);
    const cols = insertTableCols(doc, "slideA", "tbl1", "c1", "before", 2);
    expect(table(doc).cols.map((c) => c.id)).toEqual([...cols, "c1", "c2"]);
    expect(table(doc).cells).toHaveLength(12);
    refused(doc, "notFound", () => insertTableRows(doc, "slideA", "tbl1", "zz", "after"));
    refused(doc, "invalid", () => insertTableRows(doc, "slideA", "tbl1", "r1", "after", 0));
  });

  test("merges grow over inserted lines and hand over when their anchor's line is deleted", () => {
    const doc = sample(); // r1:c1 spans two columns, r1:c2 is covered
    const [mid] = insertTableCols(doc, "slideA", "tbl1", "c1", "after");
    const cell = (r: string, c: string) => table(doc).cells.find((x) => x.rowId === r && x.colId === c)!;
    expect(cell("r1", "c1").colSpan).toBe(3);
    expect([cell("r1", mid).covered, cell("r2", mid).covered]).toEqual([true, false]);
    deleteTableCols(doc, "slideA", "tbl1", ["c1"]);
    expect(cell("r1", mid)).toMatchObject({ covered: false, colSpan: 2 });
    deleteTableRows(doc, "slideA", "tbl1", ["r1"]);
    expect(table(doc).cells.map((c) => `${c.rowId}:${c.colId}`)).toEqual([`r2:${mid}`, "r2:c2"]);
    deleteTableRows(doc, "slideA", "tbl1", ["r2"]);
    expect(els(doc).some((el) => el.id === "tbl1")).toBe(false); // no rows left: the table goes
  });

  test("a vertical merge keeps its kept rows when its anchor row and a middle row go", () => {
    const doc = sample();
    const cell = (rowId: string, rowSpan: number, covered: boolean) => ({ rowId, colId: "x", text: { type: "doc", content: [{ type: "paragraph" }] }, fill: null, rowSpan, colSpan: 1, covered, vAlign: "top" });
    const tall = canonical({
      id: "tall", type: "table", x: 0, y: 0, w: 100, h: 120, rows: ["a", "b", "c", "d"].map((id, i) => ({ id, order: sequentialKeys(4)[i], h: 30 })),
      cols: [{ id: "x", order: "V", w: 100 }], cells: [cell("a", 4, false), cell("b", 1, true), cell("c", 1, true), cell("d", 1, true)],
    });
    addElements(doc, "slideB", [{ ...tall, id: "tall" }]);
    deleteTableRows(doc, "slideB", "tall", ["a", "c"]);
    const after = slide(doc, "slideB").elements[0] as TableElement;
    expect(after.cells.map((c) => [c.rowId, c.rowSpan, c.covered])).toEqual([["b", 2, false], ["d", 1, true]]);
    expect(after.h).toBe(60);
  });

  test("style, cell fill and even columns", () => {
    const doc = sample();
    setTableStyle(doc, "slideA", "tbl1", { banded: false, border: { color: "#FF0000", width: 999 } });
    expect(table(doc).style).toMatchObject({ banded: false, headerRow: true, border: { color: "#ff0000", width: 50 } });
    refused(doc, "invalid", () => setTableStyle(doc, "slideA", "tbl1", { border: { color: "nope" as never, width: 2 } }));
    refused(doc, "invalid", () => setTableStyle(doc, "slideA", "tbl1", { textStyle: { ...table(doc).style.textStyle, color: "red" as never } }));
    setTableStyle(doc, "slideA", "tbl1", { banded: undefined, headerRow: false });
    expect(table(doc).style).toMatchObject({ banded: false, headerRow: false, border: { color: "#ff0000" } });
    setCellsFill(doc, "slideA", "tbl1", ["r1:c2", "r2:c2", "bad", "r9:c1"], "theme:accent3");
    expect(table(doc).cells.filter((c) => c.fill === "theme:accent3").map((c) => c.rowId)).toEqual(["r1", "r2"]);
    refused(doc, "invalid", () => setCellsFill(doc, "slideA", "tbl1", ["r1:c1"], "red; x" as never));
    distributeTableCols(doc, "slideA", "tbl1");
    expect(table(doc).cols.map((c) => c.w)).toEqual([150, 150]); // the frame is 300 pt wide
    refused(doc, "notFound", () => setTableStyle(doc, "slideA", "img1", { banded: true }));
  });
});
