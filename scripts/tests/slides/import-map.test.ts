// .pptx import mapping (lib/slides/import/{map-deck,map-element,map-table,map-fill,flatten,deck-text,index}.ts;
// slides.md §10.1 step 3, §15). The fixtures are real pptxtojson output: pptx-basic.json is a pptxgenjs deck;
// pptx-crafted.json is the same deck with hand-written XML (a rotated, flipped, nested group; CDATA markup; a
// `javascript:` link; custom geometry; a connector; pattern and gradient fills; vertical text; EMF bytes behind a
// .png name; a BMP pptxtojson has no MIME type for; a push transition).
import { afterEach, describe, expect, test } from "bun:test";
import pptxgen from "pptxgenjs";
import * as Y from "yjs";

import type { DriveDocTarget } from "@/lib/drive/types";
import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";
import { SLIDES_MAX_PATH_CHARS, SLIDES_MAX_SLIDES } from "@/lib/slides/constants";
import { SLIDES_STATE_MAX_BYTES } from "@/lib/slides/create";
import {
  IMPORT_INFO_CODES, IMPORT_STATE_BYTES_PER_IMAGE_USE, assertImportFits, importSlidesFile, importWarningCount, takePendingImportReport,
} from "@/lib/slides/import";
import { checkPptxFile } from "@/lib/slides/import/constants";
import { extractDataUrls } from "@/lib/slides/import/dedupe-assets";
import { SlidesImportError, slidesImportErrorMessage } from "@/lib/slides/import/errors";
import { finalizeImportedDeck, mapPptxToSnapshot, orderDecor, type MapPptxContext } from "@/lib/slides/import/map-deck";
import { createImportReportBuilder } from "@/lib/slides/import/report";
import type { LeanParseResult } from "@/lib/slides/import/worker-protocol";
import { buildDeckState, deckStateMaxBytes } from "@/lib/slides/model/build";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import type { DeckSnapshot, SlideElement } from "@/lib/slides/model/types";
import { sanitizeElement } from "@/lib/slides/model/validate";
import type { DriveDeps } from "@/spacetimedb/src/drive/context";
import { defineDriveDocumentReducers } from "@/spacetimedb/src/drive/documents";
import type { DriveSchema } from "@/spacetimedb/src/drive/types";
import { FakeTimestamp, createDriveWorld, documentWithFile, loadModule, moduleStubs, type FakeDb, type FakeMember } from "../drive/fake-db";
import basic from "./fixtures/pptx-basic.json";
import crafted from "./fixtures/pptx-crafted.json";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function mapFixture(fixture: unknown, ctx: Partial<MapPptxContext> = {}) {
  const { lean, assets } = extractDataUrls(fixture);
  return mapPptxToSnapshot(lean as LeanParseResult, { fileName: "deck.pptx", now: 1_700_000_000_000, assets, purify: null, ...ctx });
}

function lean(slides: unknown[], extra: Record<string, unknown> = {}): LeanParseResult {
  return { slides, themeColors: [], usedFonts: [], size: { width: 960, height: 540 }, ...extra } as unknown as LeanParseResult;
}

function byName(elements: readonly SlideElement[], name: string): SlideElement {
  const el = elements.find((e) => e.name === name);
  if (!el) throw new Error(`no element "${name}"`);
  return el;
}

function textOf(el: SlideElement): string {
  const out: string[] = [];
  const walk = (n: { text?: string; content?: unknown[] }) => {
    if (typeof n.text === "string") out.push(n.text);
    for (const c of n.content ?? []) walk(c as { text?: string; content?: unknown[] });
  };
  if (el.type === "text" || el.type === "shape") walk(el.text as never);
  return out.join("");
}

function zOrdered(elements: readonly SlideElement[]): boolean {
  return elements.every((el, i) => i === 0 || elements[i - 1].z < el.z);
}

describe("a pptxgenjs deck (fixtures/pptx-basic.json)", () => {
  const { snapshot, assets, report } = mapFixture(basic, { driveItemId: "0B6A1F2E-1111-4222-8333-444455556666" });
  const [s1, s2] = snapshot.slides;

  test("deck meta: preset size, provenance, a theme from the file", () => {
    expect(snapshot.meta.size).toEqual({ w: 960, h: 540 });
    expect(snapshot.meta.source).toEqual({ kind: "pptx", fileName: "deck.pptx", importedAt: 1_700_000_000_000, driveItemId: "0b6a1f2e-1111-4222-8333-444455556666" });
    const theme = snapshot.meta.theme;
    expect(theme).toMatchObject({ id: "imported", decor: "none", background: { t: "solid", color: "theme:bg" } });
    expect([theme.colors.accent1, theme.colors.accent6, theme.colors.bg, theme.colors.text]).toEqual(["#4472c4", "#70ad47", "#f0f0f0", "#000000"]);
    expect(theme.fonts.body).toBe('Calibri, Carlito, "Segoe UI", Arial, Roboto, sans-serif');
    expect(mapFixture(basic, { driveItemId: "../../etc" }).snapshot.meta.source).not.toHaveProperty("driveItemId");
  });

  test("layout + master decor: one locked master shared by both slides, painted in document order", () => {
    expect(snapshot.masters).toHaveLength(1);
    const [master] = snapshot.masters;
    expect(master.id).toMatch(/^m_[0-9a-f]{16}$/);
    expect(s1.masterId).toBe(master.id);
    expect(s2.masterId).toBe(master.id);
    expect(master.elements.map((e) => e.type)).toEqual(["shape", "image"]);
    expect(master.elements.every((e) => e.locked)).toBe(true);
    expect(zOrdered(master.elements)).toBe(true);
  });

  test("slide 1: theme background, notes, elements in paint order", () => {
    expect(s1).toMatchObject({ layout: "imported", hidden: false, background: null, transition: null });
    expect(s1.notes).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Speaker <notes> & more" }] }] });
    expect(s1.elements.map((e) => e.type)).toEqual(["text", "text", "shape", "line", "image", "table"]);
    expect(zOrdered(s1.elements)).toBe(true);
  });

  test("text boxes: element defaults from the dominant run, marks for the rest, nested lists", () => {
    const hello = byName(s1.elements, "Text 0");
    if (hello.type !== "text") throw new Error("not text");
    expect(hello.textStyle).toMatchObject({ font: "theme:body", size: 32, color: "#ff0000" });
    expect(hello.box.vAlign).toBe("middle");
    expect(textOf(hello)).toBe("Hello world");
    const list = byName(s1.elements, "Text 1");
    if (list.type !== "text") throw new Error("not text");
    const blocks = list.text.content ?? [];
    expect(blocks.map((b) => b.type)).toEqual(["bulletList", "orderedList"]);
    expect(blocks[0].content?.[0].content?.map((b) => b.type)).toEqual(["paragraph", "bulletList"]);
  });

  test("shapes, lines and images keep geometry, fills, strokes, flips, arrowheads and masks", () => {
    expect(byName(s1.elements, "Shape 2")).toMatchObject({
      type: "shape", geom: { kind: "preset", preset: "rightArrow" }, rot: 30, fill: { t: "solid", color: "#00aa00" },
      stroke: { color: "#000000", width: 2, dash: "dash" },
    });
    expect(byName(s1.elements, "Shape 3")).toMatchObject({ type: "line", x1: 360, y1: 360, x2: 72, y2: 432, stroke: { color: "#333333", width: 3, tail: "triangle" } });
    const image = s1.elements.find((e) => e.type === "image");
    expect(image).toMatchObject({ x: 576, y: 216, w: 144, h: 144, mask: "ellipse", src: "" });
  });

  test("tables: grid, row heights from the frame when the file has none, merges, fills and bold runs", () => {
    const table = s1.elements.find((e) => e.type === "table");
    if (!table || table.type !== "table") throw new Error("no table");
    expect(table.rows.map((r) => r.h)).toEqual([36, 36]);
    expect(table.cols.map((c) => c.w)).toEqual([144, 144]);
    expect(table.cells.map((c) => [c.fill, c.colSpan, c.covered])).toEqual([["#dddddd", 1, false], [null, 1, false], [null, 2, false], [null, 1, true]]);
    expect(JSON.stringify(table.cells[0].text)).toContain('"bold"');
    expect(table.style).toMatchObject({ headerRow: false, banded: false, border: { width: 0 }, textStyle: { size: 12 } });
  });

  test("slide 2: image background, alpha fill + shadow, a chart placeholder with its data", () => {
    expect(s2.background).toEqual({ t: "image", src: "", mode: "stretch" });
    expect(byName(s2.elements, "Shape 1")).toMatchObject({ fill: { t: "solid", color: "#ffcc00", alpha: 0.502 }, shadow: { x: 2.83, y: 2.83, blur: 3, color: "#000000" } });
    const chart = s2.elements.find((e) => e.type === "chart");
    expect(chart).toMatchObject({ type: "chart", chart: { kind: "barChart", series: [{ name: "Sales", values: [1, 2] }] } });
    expect(report.build(2).items).toEqual([{ code: "chartPlaceholder", count: 1 }]);
  });

  test("each distinct image is one pending asset; its writers fill every use before the deck is built", () => {
    expect(assets.map((a) => [a.key, a.mime, a.uses.length])).toEqual([["a1", "image/png", 2], ["a2", "image/png", 1]]);
    const { snapshot: fresh, assets: pending } = mapFixture(basic);
    for (const asset of pending) for (const write of asset.uses) write(`https://cdn.example/${asset.key}.png`);
    const read = readDeckSnapshot(opened(buildDeckState(fresh)));
    expect(read.masters[0].elements.find((e) => e.type === "image")).toMatchObject({ src: "https://cdn.example/a1.png" });
    expect(read.slides[0].elements.find((e) => e.type === "image")).toMatchObject({ src: "https://cdn.example/a1.png" });
    expect(read.slides[1].background).toEqual({ t: "image", src: "https://cdn.example/a2.png", mode: "stretch" });
    expect(read.slides.map((s) => s.elements.length)).toEqual([6, 3]);
  });

  test("finalize: an image that did not upload becomes a placeholder and is reported once", () => {
    const { snapshot: fresh, assets: pending, report: r } = mapFixture(basic);
    for (const write of pending[1].uses) write("https://cdn.example/bg.png");
    const done = finalizeImportedDeck(fresh, new Map([["a1", "imageUploadFailed" as const]]), r);
    expect(done.slides[0].elements.find((e) => e.name === "")?.type).toBe("shape");
    expect(done.slides[0].elements.some((e) => e.type === "image")).toBe(false);
    expect(done.masters[0].elements.map((e) => e.type)).toEqual(["shape", "shape"]);
    expect(done.slides[1].background).toMatchObject({ t: "image", src: "https://cdn.example/bg.png" });
    expect(r.count("imageUploadFailed")).toBe(1);
    const noBg = finalizeImportedDeck(mapFixture(basic).snapshot, new Map(), createImportReportBuilder());
    expect(noBg.slides[1].background).toBeNull();
  });

  test("every HTML string passes the purifier exactly once", () => {
    const seen: string[] = [];
    mapFixture(basic, { purify: (html) => (seen.push(html), { html, removedLinks: 0 }) });
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
    expect(seen.some((h) => h.includes("Speaker &lt;notes&gt;"))).toBe(true);
  });
});

describe("a crafted deck (fixtures/pptx-crafted.json)", () => {
  const { snapshot, assets, report } = mapFixture(crafted);
  const [s1, s2] = snapshot.slides;

  test("a rotated, flipped, nested group is flattened into its children in paint order", () => {
    expect(byName(s1.elements, "G rect")).toMatchObject({ x: 175, y: 175, w: 100, h: 50, rot: 90, flipH: true, flipV: false });
    expect(byName(s1.elements, "G ellipse")).toMatchObject({ x: 125, y: 75, rot: 90, flipH: true, geom: { preset: "ellipse" } });
    expect(byName(s1.elements, "G triangle")).toMatchObject({ x: 125, y: 175, w: 100, h: 50, rot: 90, geom: { preset: "triangle" } });
    const names = s1.elements.map((e) => e.name);
    expect(names.indexOf("G rect")).toBeLessThan(names.indexOf("G ellipse"));
    expect(names.indexOf("G ellipse")).toBeLessThan(names.indexOf("G triangle"));
    expect(report.count("groupsFlattened")).toBe(2);
  });

  test("CDATA-born markup is dropped and the javascript: link is removed and counted", () => {
    expect(textOf(byName(s1.elements, "Text 0"))).toBe("Hi world");
    expect(JSON.stringify(snapshot)).not.toMatch(/javascript:|<script|onerror/i);
    expect(report.count("linkRemoved")).toBe(1);
  });

  test("custom geometry keeps its path; a shape outside our presets keeps its (compacted) path", () => {
    expect(byName(s1.elements, "Freeform 1")).toMatchObject({ type: "shape", geom: { kind: "path", d: "M0,100 L50,0 L100,100z", vw: 100, vh: 100, srcPreset: "custom" } });
    const cloud = byName(s1.elements, "Gradient 1");
    if (cloud.type !== "shape" || cloud.geom.kind !== "path") throw new Error("not a path shape");
    expect(cloud.geom.srcPreset).toBe("cloud");
    expect(cloud.geom.d.length).toBeLessThanOrEqual(SLIDES_MAX_PATH_CHARS);
    expect(cloud.fill).toEqual({ t: "linear", angle: 90, stops: [{ pos: 0, color: "#ff0000" }, { pos: 1, color: "#0000ff" }] });
    expect(sanitizeElement(cloud)).toEqual(cloud);
  });

  test("a straight connector becomes a line; a pattern fill becomes its foreground colour", () => {
    expect(byName(s1.elements, "Connector 1")).toMatchObject({ type: "line", x1: 10, y1: 70, x2: 110, y2: 20, stroke: { color: "#ff0000", width: 1.5, head: "oval", tail: "triangle" } });
    expect(byName(s1.elements, "Pattern 1")).toMatchObject({ fill: { t: "solid", color: "#112233" } });
    expect(report.count("patternApprox")).toBe(1);
  });

  test("a vertical title: placeholder role, vertical box, grow-to-fit, the heading font, an unknown font reported", () => {
    expect(byName(s1.elements, "Title 1")).toMatchObject({
      type: "text", placeholder: "title", box: { vertical: true, autofit: "grow" }, textStyle: { font: "theme:heading", size: 24 },
    });
    expect(snapshot.meta.theme.fonts.heading).toBe('"Mystery Sans", sans-serif');
    expect(report.build(2).items.find((i) => i.code === "fontSubstituted")).toEqual({ code: "fontSubstituted", count: 1, detail: ["Mystery Sans"] });
    expect(report.count("verticalText")).toBe(1);
  });

  test("images are typed by their bytes: EMF behind a .png name → placeholder; a BMP without MIME → pending", () => {
    const emf = s1.elements.find((e) => e.type === "shape" && e.x === 576 && e.y === 216);
    expect(emf).toMatchObject({ type: "shape", fill: { t: "solid", color: "#e5e7eb" }, stroke: { dash: "dash" } });
    expect(report.count("imageUnsupported")).toBe(1);
    // pptxtojson gives pictures no name; this one is the BMP at (10, 400).
    expect(s1.elements.find((e) => e.type === "image" && e.x === 10 && e.y === 400)).toMatchObject({ crop: { l: 0.1, t: 0, r: 0.2, b: 0 }, mask: "roundRect" });
    expect(assets.map((a) => a.mime)).toContain("image/bmp");
    expect(assets.some((a) => a.mime === "")).toBe(false);
  });

  test("a push transition becomes a fade and is reported; every element is a valid model element", () => {
    expect(s2.transition).toEqual({ type: "fade", durationMs: 800, srcType: "push" });
    expect(report.count("transitionApprox")).toBe(1);
    for (const el of [...s1.elements, ...s2.elements, ...snapshot.masters.flatMap((m) => m.elements)]) expect(sanitizeElement(el)).not.toBeNull();
  });

  test("the warning count leaves out the information codes", () => {
    const built = report.build(2);
    const expected = built.items.filter((i) => !IMPORT_INFO_CODES.has(i.code)).reduce((n, i) => n + i.count, 0);
    expect(importWarningCount(built)).toBe(expected);
    expect(importWarningCount(built)).toBe(built.items.reduce((n, i) => n + i.count, 0) - 2);
  });
});

describe("z-order and decor order (F27, R17)", () => {
  const box = { left: 0, top: 0, width: 10, height: 10, rotate: 0, borderWidth: 0, fill: { type: "color", value: "#ff0000" } };

  test("slide elements are painted by `order`, not by pptxtojson's node-key grouping", () => {
    const { snapshot } = mapPptxToSnapshot(lean([{ elements: [
      { ...box, type: "image", base64: "", order: 9, name: "pic" },
      { ...box, type: "shape", shapType: "rect", order: 3, name: "back" },
      { ...box, type: "group", order: 8, isFlipH: false, isFlipV: false, elements: [
        { ...box, type: "shape", shapType: "ellipse", order: 7, name: "g2" },
        { ...box, type: "shape", shapType: "ellipse", order: 6, name: "g1" },
      ] },
    ], layoutElements: [], fill: null, note: "" }]), { fileName: "z.pptx", now: 0, purify: null });
    const els = snapshot.slides[0].elements;
    expect(els.map((e) => e.name)).toEqual(["back", "g1", "g2", "pic"]);
    expect(zOrdered(els)).toBe(true);
  });

  test("orderDecor: master decor below layout decor when tagged, else by order (stable)", () => {
    const tagged = [
      { id: "l2", order: 20, source: "slideLayoutBg" }, { id: "l1", order: 10, source: "slideLayoutBg" },
      { id: "m2", order: 60, source: "slideMasterBg" }, { id: "m1", order: 50, source: "slideMasterBg" },
    ];
    expect(orderDecor(tagged).map((e) => e.id)).toEqual(["m1", "m2", "l1", "l2"]);
    const untagged = [{ id: "l", order: 10 }, { id: "m", order: 5 }, { id: "a", order: 7 }, { id: "b", order: 7 }];
    expect(orderDecor(untagged).map((e) => e.id)).toEqual(["m", "a", "b", "l"]);
  });

  test("equal decor on different layouts shares a master; different decor gets its own", () => {
    const decor = (color: string, order: number) => [{ ...box, type: "shape", shapType: "rect", order, fill: { type: "color", value: color } }];
    const slide = (layoutElements: unknown[]) => ({ elements: [], layoutElements, fill: null, note: "" });
    const { snapshot } = mapPptxToSnapshot(lean([slide(decor("#111111", 1)), slide(decor("#111111", 40)), slide(decor("#222222", 1)), slide([])]), { fileName: "m.pptx", now: 0, purify: null });
    const ids = snapshot.slides.map((s) => s.masterId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(ids[3]).toBe("");
    expect(snapshot.masters).toHaveLength(2);
  });
});

describe("caps, scan and the other element types", () => {
  const slide = (elements: unknown[] = []) => ({ elements, layoutElements: [], fill: null, note: "" });

  test(`slides past ${SLIDES_MAX_SLIDES} are left out and reported; hidden and animated slides come from the scan`, () => {
    const all = Array.from({ length: SLIDES_MAX_SLIDES + 2 }, () => slide());
    const { snapshot, report } = mapPptxToSnapshot(lean(all), {
      fileName: "big.pptx", now: 0, purify: null, scan: { hidden: [true, false, true], animated: [false, true, true] },
    });
    expect(snapshot.slides).toHaveLength(SLIDES_MAX_SLIDES);
    expect(snapshot.slides.slice(0, 3).map((s) => s.hidden)).toEqual([true, false, true]);
    expect(report.count("slidesTruncated")).toBe(2);
    expect(report.count("animationsDropped")).toBe(2);
  });

  test("maths → its picture (or its LaTeX as text); video and audio dropped; SmartArt flattened into its frame", () => {
    const { lean: withAssets, assets } = extractDataUrls(lean([slide([
      { type: "math", left: 10, top: 10, width: 50, height: 20, latex: "x^2", picBase64: `data:image/png;base64,${PNG}`, order: 1 },
      { type: "math", left: 10, top: 40, width: 50, height: 20, latex: "\\frac{a}{b} < 1", picBase64: "", order: 2 },
      { type: "video", left: 0, top: 0, width: 10, height: 10, order: 3 },
      { type: "audio", left: 0, top: 0, width: 10, height: 10, order: 4 },
      { type: "diagram", left: 100, top: 200, width: 300, height: 100, order: 5, elements: [
        { type: "shape", shapType: "roundRect", left: 10, top: 20, width: 50, height: 30, order: 1, content: "<p><span>Step</span></p>", fill: { type: "color", value: "#4472c4" }, borderWidth: 0 },
      ] },
    ])]));
    const { snapshot, report } = mapPptxToSnapshot(withAssets, { fileName: "m.pptx", now: 0, purify: null, assets });
    const els = snapshot.slides[0].elements;
    expect(els.map((e) => e.type)).toEqual(["image", "text", "shape"]);
    expect(textOf(els[1])).toBe("\\frac{a}{b} < 1");
    expect(els[2]).toMatchObject({ x: 110, y: 220, w: 50, h: 30, geom: { preset: "roundRect" } });
    expect([report.count("mathAsImage"), report.count("mediaDropped"), report.count("smartArtFlattened")]).toEqual([1, 2, 1]);
  });

  test("importWarningCount excludes info codes (IMPORT_INFO_CODES are not counted)", () => {
    const r = createImportReportBuilder();
    r.add("animationsDropped", 3);
    r.add("groupsFlattened", 2);
    r.add("linkRemoved");
    r.add("chartPlaceholder", 2);
    expect([...IMPORT_INFO_CODES].sort()).toEqual(["animationsDropped", "groupsFlattened"]);
    expect(importWarningCount(r.build(1))).toBe(3);
  });
});

// ── importSlidesFile, end to end through the module's createDriveDocument reducer ─────────────────────────────────

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const R = defineDriveDocumentReducers(moduleStubs().spacetimedb as unknown as DriveSchema, deps);
afterEach(() => clearConnection());

function connectAs(db: FakeDb, caller: FakeMember): void {
  setConnection({ reducers: { createDriveDocument: async (args: Record<string, unknown>) => db.run(R.createDriveDocument, caller, args) } } as never);
  setActiveOrgId(caller.organizationId);
}

function opened(state: unknown): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state as Uint8Array);
  return doc;
}

async function pptxFile(name = "Quarterly review.pptx"): Promise<File> {
  const pres = new pptxgen();
  const s = pres.addSlide();
  s.addText("Quarterly review", { x: 1, y: 1, w: 6, h: 1, fontSize: 36 });
  s.addTable([[{ text: "Q1" }, { text: "Q2" }]], { x: 1, y: 3, w: 4 });
  s.addNotes("Say hello");
  pres.addSlide().addText([{ text: "a link", options: { hyperlink: { url: "https://example.com" } } }], { x: 1, y: 1, w: 4, h: 1 });
  const buf = (await pres.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return new File([buf], name, { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

describe("importSlidesFile", () => {
  test("Drive's importSlidesFile(file, target) resolves { documentId, warnings } and creates a slides row", async () => {
    const { db, orgA } = createDriveWorld();
    connectAs(db, orgA.staff);
    const target: DriveDocTarget = { organizationId: orgA.organizationId, space: "my", folderId: "", actingMemberId: "" };
    const stages: string[] = [];
    const result = await importSlidesFile(await pptxFile(), target, { onProgress: (p) => stages.push(p.stage) });
    expect(result.warnings).toBe(0);
    expect(result.report.slides).toBe(2);
    expect(stages).toEqual(["checking", "parsing", "images", "creating"]);
    expect(documentWithFile(db, result.documentId)).toMatchObject({ fileType: "slides", templateId: "import:pptx", title: "Quarterly review", visibility: "private" });
    const deck: DeckSnapshot = readDeckSnapshot(opened(db.find("documentSnapshot", result.documentId)?.state));
    expect(deck.slides).toHaveLength(2);
    expect(deck.meta.source).toMatchObject({ kind: "pptx", fileName: "Quarterly review.pptx" });
    expect(String(db.find("documentSnapshot", result.documentId)?.plainText)).toContain("Quarterly review");
    expect(takePendingImportReport(result.documentId.toUpperCase())).toEqual(result.report);
    expect(takePendingImportReport(result.documentId)).toBeNull();
  });

  test("the file checks run before anything is read", async () => {
    expect(checkPptxFile({ name: "a.pptx", size: 50 * 1024 * 1024 + 1, type: "" })).toBe("tooLarge");
    expect(checkPptxFile({ name: "a.docx", size: 10, type: "application/msword" })).toBe("notPptx");
    expect(checkPptxFile({ name: "blob", size: 10, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })).toBeNull();
    const target: DriveDocTarget = { organizationId: "org", space: "my", folderId: "", actingMemberId: "" };
    const error = await importSlidesFile(new File(["x"], "notes.txt", { type: "text/plain" }), target).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SlidesImportError);
    expect((error as SlidesImportError).code).toBe("notPptx");
  });

  test("a deck over the state limit is refused before any image is uploaded, with room kept for each image's URL", () => {
    const mapped = mapFixture(basic);
    expect(() => assertImportFits(mapped)).not.toThrow();
    // The deck is measured under the widest Yjs client id: the same every time, never below a real build (whose
    // random client id made this boundary move from run to run).
    const base = deckStateMaxBytes(mapped.snapshot);
    expect(deckStateMaxBytes(mapped.snapshot)).toBe(base);
    for (let i = 0; i < 20; i++) expect(buildDeckState(mapped.snapshot).byteLength).toBeLessThanOrEqual(base);
    const fits = Math.floor((SLIDES_STATE_MAX_BYTES - base) / IMPORT_STATE_BYTES_PER_IMAGE_USE);
    const withUses = (n: number) => ({ snapshot: mapped.snapshot, assets: [{ ...mapped.assets[0], uses: new Array(n).fill(() => {}) }] });
    expect(() => assertImportFits(withUses(fits))).not.toThrow();
    expect(() => assertImportFits(withUses(fits + 1))).toThrow("[doc.too_large]");
  });

  test("errors map to their copy", () => {
    const t = (key: string) => (key === "slides.import.tooLarge" ? "max {mb} MB" : key);
    expect(slidesImportErrorMessage(new SlidesImportError("tooLarge"), t)).toBe("max 50 MB");
    expect(slidesImportErrorMessage(new SlidesImportError("unsafeFile", "x", "suspiciousRatio"), t)).toBe("slides.import.unsafeFile");
    expect(slidesImportErrorMessage(new Error("[doc.too_large] Presentation is too large"), t)).toBe("docs.errors.tooLarge");
    expect(slidesImportErrorMessage(new Error("boom"), t)).toBe("slides.import.failed");
  });
});
