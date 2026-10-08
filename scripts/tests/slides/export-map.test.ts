// .pptx export mapping (slides.md §10.2, §15): every element type through a recording slide, the text runs, the
// pptxgenjs quirks the mapper works around, and the paragraph clean-up of the written file.
import { describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";
import PptxGenJS from "pptxgenjs";

import { exportImageDataUrl, type SlidesExportImage } from "@/lib/slides/export/image-data";
import {
  addElementToSlide, coverCrop, custGeomPoints, inch, pptxLength, pptxShadow, pptxTextMargin, type PptxExportContext, type PptxSlideLike,
} from "@/lib/slides/export/pptx-elements";
import { dataUrlExtension, dedupeParagraphProps, fetchDeckImages, fillPptxSlide } from "@/lib/slides/export/pptx";
import { SINGLE_LINE_HEIGHT, firstStrongIsRtl, pptxFontFace, pptxLineSpacing, textJsonToRuns } from "@/lib/slides/export/pptx-text";
import { ReportCounter, exportWarningCount } from "@/lib/slides/export/report";
import { firstFontFamily } from "@/lib/slides/export/render-rules";
import { DEFAULT_TEXT_DEFAULTS } from "@/lib/slides/model/defaults";
import type { SlideElement } from "@/lib/slides/model/types";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import { canonical, sampleDeck, sampleElements } from "./helpers/fixtures";

type Call = { kind: "text" | "shape" | "image" | "table" | "notes"; a: unknown; b?: unknown };

function recorder(): PptxSlideLike & { calls: Call[] } {
  const calls: Call[] = [];
  const self = {} as PptxSlideLike & { calls: Call[] };
  const slide = () => self as unknown as PptxGenJS.Slide;
  Object.assign(self, {
    calls,
    addText: (a: unknown, b: unknown) => (calls.push({ kind: "text", a, b }), slide()),
    addShape: (a: unknown, b: unknown) => (calls.push({ kind: "shape", a, b }), slide()),
    addImage: (a: unknown) => (calls.push({ kind: "image", a }), slide()),
    addTable: (a: unknown, b: unknown) => (calls.push({ kind: "table", a, b }), slide()),
    addNotes: (a: unknown) => (calls.push({ kind: "notes", a }), slide()),
  });
  return self;
}

const JPEG: SlidesExportImage = { dataUrl: "data:image/jpeg;base64,/9j/4AAQ", width: 400, height: 200 };
const SHAPE_NAMES = new Set<string>(Object.values(new PptxGenJS().ShapeType));
const theme = STARTER_THEMES["simple-light"];

function context(images: Record<string, SlidesExportImage | null> = {}): PptxExportContext {
  return { theme, images: new Map(Object.entries(images)), shapeNames: SHAPE_NAMES, report: new ReportCounter() };
}

const common = { locked: false, name: "", link: "", placeholder: "", rot: 0 };
const para = (text: string, attrs?: Record<string, unknown>, marks?: JSONContent["marks"]): JSONContent => ({
  type: "paragraph",
  ...(attrs ? { attrs } : {}),
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

function textBox(extra: Record<string, unknown> = {}): SlideElement {
  return canonical({
    ...common, id: "t1", z: "a", type: "text", x: 72, y: 144, w: 288, h: 72,
    geom: { kind: "preset", preset: "rect" }, fill: { t: "none" }, stroke: null, shadow: null,
    box: { vAlign: "middle", inset: [7.2, 3.6, 10, 5], autofit: "none", fontScale: 1, wrap: true, vertical: false },
    textStyle: DEFAULT_TEXT_DEFAULTS, flipH: false, flipV: false, text: doc(para("Hello")),
    ...extra,
  });
}

type RunList = PptxGenJS.TextProps[];
const opts = (r: PptxGenJS.TextProps) => r.options ?? {};

describe("units and text boxes", () => {
  test("positions are inches, margins stay pt in pptxgenjs's [l, r, b, t] order", () => {
    const slide = recorder();
    addElementToSlide(slide, textBox(), context());
    const [call] = slide.calls;
    expect(call.kind).toBe("text");
    const o = call.b as PptxGenJS.TextPropsOptions;
    expect([o.x, o.y, o.w, o.h]).toEqual([1, 2, 4, 1]);
    expect(o.margin).toEqual([7.2, 10, 5, 3.6]);
    expect(o.valign).toBe("middle");
    expect(o.shape).toBe("rect");
    expect(o.hyperlink).toBeUndefined();
    expect(pptxTextMargin([1, 2, 3, 4])).toEqual([1, 3, 4, 2]);
  });

  test("an empty text box is written as a shape (so an element link survives)", () => {
    const slide = recorder();
    addElementToSlide(slide, textBox({ text: doc({ type: "paragraph" }), link: "https://example.com/", fill: { t: "solid", color: "#ff0000", alpha: 0.5 } }), context());
    expect(slide.calls.map((c) => c.kind)).toEqual(["shape"]);
    const o = slide.calls[0].b as PptxGenJS.ShapeProps;
    expect(o.hyperlink).toEqual({ url: "https://example.com/" });
    expect(o.fill).toEqual({ color: "FF0000", transparency: 50 });
  });

  test("an element link goes onto the runs, never onto addText's own options", () => {
    const slide = recorder();
    addElementToSlide(slide, textBox({ link: "https://example.com/a" }), context());
    const runs = slide.calls[0].a as RunList;
    expect(opts(runs[0]).hyperlink).toEqual({ url: "https://example.com/a" });
    expect(opts(runs[0]).underline).toEqual({ style: "none" });
    expect((slide.calls[0].b as PptxGenJS.TextPropsOptions).hyperlink).toBeUndefined();
  });
});

describe("text runs", () => {
  test("marks, breakLine per paragraph, and paragraph options on the first run only", () => {
    const runs = textJsonToRuns(
      doc(
        { type: "paragraph", content: [{ type: "text", text: "Big", marks: [{ type: "bold" }] }, { type: "text", text: " tea", marks: [{ type: "italic" }, { type: "strike" }] }] },
        para("Centre", { textAlign: "center", spaceBefore: 6, lineHeight: 1.8 }),
      ),
      DEFAULT_TEXT_DEFAULTS,
      theme,
    );
    expect(runs.map((r) => r.text)).toEqual(["Big", " tea", "Centre"]);
    expect(opts(runs[0])).toMatchObject({ bold: true, align: "left", fontSize: 18, color: "1F2937", fontFace: "Arial" });
    expect(opts(runs[0]).breakLine).toBeUndefined();
    expect(opts(runs[1])).toMatchObject({ italic: true, strike: "sngStrike", breakLine: true });
    expect(opts(runs[1]).align).toBeUndefined();
    expect(opts(runs[2])).toMatchObject({ align: "center", paraSpaceBefore: 6, lineSpacingMultiple: 1.5, breakLine: true });
    // Every paragraph states its spacing; the default line height (1.2) is PowerPoint's single spacing, 1.
    expect(opts(runs[0]).lineSpacingMultiple).toBe(1);
    expect(opts(runs[1]).lineSpacingMultiple).toBeUndefined();
  });

  test("line spacing: L / 1.2, precise enough that the import's two-decimal line heights come back exactly", () => {
    expect(SINGLE_LINE_HEIGHT).toBe(1.2);
    for (const lineHeight of [0.8, 0.9, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.33, 1.5, 1.75, 2, 2.35, 3]) {
      // pptxgenjs writes spcPct val = round(multiple × 100000); the import multiplies by 1.2 and keeps 2 decimals.
      const val = Math.round(pptxLineSpacing(lineHeight) * 100_000);
      expect(Math.round((val / 100_000) * SINGLE_LINE_HEIGHT * 100) / 100).toBe(lineHeight);
    }
  });

  test("bullets, numbering and list levels", () => {
    const runs = textJsonToRuns(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [para("one")] },
          {
            type: "listItem",
            content: [para("two"), { type: "orderedList", attrs: { start: 3, type: "a" }, content: [{ type: "listItem", content: [para("nested")] }] }],
          },
        ],
      }),
      DEFAULT_TEXT_DEFAULTS,
      theme,
    );
    expect(runs.map((r) => r.text)).toEqual(["one", "two", "nested"]);
    expect(opts(runs[0]).bullet).toBe(true);
    expect(opts(runs[0]).indentLevel).toBeUndefined();
    expect(opts(runs[2]).bullet).toEqual({ type: "number", numberStartAt: 3, style: "alphaLcPeriod" });
    expect(opts(runs[2]).indentLevel).toBe(1);
  });

  test("RTL per paragraph: explicit dir, or the first strong character", () => {
    const runs = textJsonToRuns(doc(para("abc", { dir: "rtl" }), para("مرحبا"), para("123 abc"), para("שלום", { dir: "ltr" })), DEFAULT_TEXT_DEFAULTS, theme);
    expect(runs.map((r) => opts(r).rtlMode ?? false)).toEqual([true, true, false, false]);
    expect(firstStrongIsRtl("٣ مرحبا")).toBe(true);
    expect(firstStrongIsRtl("  hello مرحبا")).toBe(false);
  });

  test("hard breaks become soft line breaks, also at a paragraph's start and end", () => {
    const runs = textJsonToRuns(
      doc({ type: "paragraph", content: [{ type: "hardBreak" }, { type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b\nc" }, { type: "hardBreak" }] }),
      DEFAULT_TEXT_DEFAULTS,
      theme,
    );
    expect(runs.map((r) => [r.text, opts(r).softBreakBefore ?? false])).toEqual([
      ["", false],
      ["a", true],
      ["b", true],
      ["c", true],
      ["", true],
    ]);
    expect(opts(runs[4]).breakLine).toBe(true);
  });

  test("font sizes, faces and colours: marks over defaults, autofit scale baked in, theme refs resolved", () => {
    const runs = textJsonToRuns(
      doc(para("x", undefined, [{ type: "textStyle", attrs: { color: "theme:accent1", fontFamily: '"Trebuchet MS", sans-serif', fontSize: 30 } }, { type: "highlight", attrs: { color: null } }])),
      { ...DEFAULT_TEXT_DEFAULTS, font: "theme:heading" },
      theme,
      { fontScale: 0.5 },
    );
    expect(opts(runs[0])).toMatchObject({ fontSize: 15, fontFace: "Trebuchet MS", color: "2563EB", highlight: "FFFF00" });
    expect(firstFontFamily("sans-serif")).toBe("Arial");
    expect(firstFontFamily('"Noto Sans, Bold", serif')).toBe("Noto Sans, Bold");
  });

  test("a font name with a quote (valid for the model) never reaches pptxgenjs's unescaped typeface attribute", () => {
    const runs = textJsonToRuns(doc(para("x")), { ...DEFAULT_TEXT_DEFAULTS, font: `'Foo"Bar', sans-serif` }, theme);
    expect(opts(runs[0]).fontFace).toBe("FooBar");
    expect(pptxFontFace('"A&B<C>D", serif')).toBe("ABCD");
    expect(pptxFontFace('""')).toBe("Arial");
    expect(pptxFontFace("'Noto  Sans\tSC\u0007'")).toBe("Noto Sans SC");
  });

  test("unsafe links are dropped; an empty text is one empty paragraph", () => {
    const runs = textJsonToRuns(doc(para("x", undefined, [{ type: "link", attrs: { href: "javascript:alert(1)" } }])), DEFAULT_TEXT_DEFAULTS, theme);
    expect(opts(runs[0]).hyperlink).toBeUndefined();
    const empty = textJsonToRuns({ type: "doc", content: [] }, DEFAULT_TEXT_DEFAULTS, theme);
    expect(empty).toHaveLength(1);
    expect(empty[0].text).toBe("");
    expect(opts(empty[0]).breakLine).toBe(true);
  });
});

describe("lengths of 100 in and more", () => {
  test("pptxgenjs reads any number ≥ 100 as EMU, so those lengths go in as whole EMU", () => {
    expect(inch(72)).toBe(1);
    expect(inch(7199)).toBe(99.9861);
    expect(inch(7200)).toBe(91_440_000);
    expect(inch(8000)).toBe(101_600_000);
    expect(inch(-8000)).toBe(-111.1111);
    // 99.99996 in rounds to 100: EMU, never the ambiguous 100.
    expect(pptxLength(99.99996)).toBe(91_439_963);
    expect(custGeomPoints([{ c: "L", x: 120, y: 1 }])).toEqual([{ x: 109_728_000, y: 1 }]);
  });
});

describe("shapes, lines, pictures, tables, charts", () => {
  test("a custom path becomes custGeom points in inches; with text, a shape plus a transparent text box", () => {
    const el = canonical({
      ...common, id: "p1", z: "a", type: "shape", x: 0, y: 0, w: 144, h: 72,
      geom: { kind: "path", d: "M0 0 L100 0 L50 80 Z", vw: 100, vh: 80, srcPreset: "custom" },
      fill: { t: "solid", color: "#00ff00" }, stroke: { color: "#000000", width: 2, dash: "dot" }, shadow: null,
      box: {}, textStyle: {}, flipH: true, flipV: false, text: doc(para("Hi")),
    });
    const ctx = context();
    const slide = recorder();
    addElementToSlide(slide, el, ctx);
    expect(slide.calls.map((c) => [c.kind, c.kind === "text" ? "runs" : c.a])).toEqual([["shape", "custGeom"], ["text", "runs"]]);
    const shape = slide.calls[0].b as PptxGenJS.ShapeProps;
    expect(shape.points).toEqual([{ x: 0, y: 0, moveTo: true }, { x: 2, y: 0 }, { x: 1, y: 1 }, { close: true }]);
    expect(shape.line).toEqual({ color: "000000", width: 2, dashType: "sysDot" });
    expect(shape.flipH).toBe(true);
    const text = slide.calls[1].b as PptxGenJS.TextPropsOptions;
    expect([text.x, text.y, text.w, text.h, text.flipH]).toEqual([0, 0, 2, 1, true]);
    expect(text.fill).toBeUndefined();
    expect(text.line).toBeUndefined();
    expect(ctx.report.count("pathTextSplit")).toBe(1);
  });

  test("a path imported from a known preset is written as that preset", () => {
    const [, , path] = sampleElements();
    const slide = recorder();
    addElementToSlide(slide, path, context({ "https://cdn.example.com/fill.png": JPEG }));
    expect(slide.calls.map((c) => c.kind)).toEqual(["image", "shape"]);
    expect(slide.calls[1].a).toBe("flowChartMerge");
    expect(custGeomPoints([{ c: "Q", x1: 1, y1: 2, x: 3, y: 4 }])).toEqual([{ x: 3, y: 4, curve: { type: "quadratic", x1: 1, y1: 2 } }]);
  });

  test("gradients become their first stop and are reported; shadows use the non-default fallbacks", () => {
    const [, star] = sampleElements();
    const ctx = context();
    const slide = recorder();
    addElementToSlide(slide, star, ctx);
    const o = slide.calls[0].b as PptxGenJS.TextPropsOptions;
    expect(o.shape).toBe("star5");
    expect(o.fill).toEqual({ color: "FF0000", transparency: undefined });
    expect(o.rotate).toBe(15);
    expect([o.flipH, o.flipV]).toEqual([true, true]);
    expect(o.vert).toBe("eaVert");
    expect(ctx.report.count("gradientSolid")).toBe(1);
    expect(o.shadow).toMatchObject({ type: "outer", color: "000000", opacity: 0.3, blur: 4, angle: 56 });
    expect(pptxShadow({ x: 5, y: 0, blur: 0, color: "#000000", alpha: 1 }, theme)).toMatchObject({ angle: 1, blur: 0.01 });
    expect(pptxShadow({ x: 0, y: 0, blur: 2, color: "#000000", alpha: 0 }, theme)).toBeUndefined();
  });

  test("lines: endpoint order becomes flips, head and tail become begin and end arrows", () => {
    const el = canonical({ ...common, id: "l1", z: "a", type: "line", x1: 400, y1: 20, x2: 40, y2: 92, stroke: { color: "#112233", width: 3, dash: "dash", head: "triangle", tail: "oval" } });
    const slide = recorder();
    addElementToSlide(slide, el, context());
    expect(slide.calls[0].a).toBe("line");
    expect(slide.calls[0].b).toMatchObject({
      x: 0.5556, y: 0.2778, w: 5, h: 1, flipH: true, flipV: undefined,
      line: { color: "112233", width: 3, dashType: "dash", beginArrowType: "triangle", endArrowType: "oval" },
    });
  });

  test("pictures: crop maths, ellipse mask, rounded corners reported, missing pictures skipped", () => {
    const [, , , , img] = sampleElements();
    const ctx = context({ "https://cdn.example.com/photo.jpg": JPEG });
    const slide = recorder();
    addElementToSlide(slide, img, ctx);
    const o = slide.calls[0].a as PptxGenJS.ImageProps;
    // 300 × 120 pt shown, crop l .1 r .2 t 0 b .05: full picture 428.57 × 126.32 pt.
    expect(o.data).toBe(JPEG.dataUrl);
    expect(o.w).toBeCloseTo(428.5714 / 72, 3);
    expect(o.h).toBeCloseTo(126.3158 / 72, 3);
    expect(o.sizing).toMatchObject({ type: "crop", w: 4.1667, h: 1.6667 });
    expect((o.sizing as { x: number }).x).toBeCloseTo(42.857 / 72, 3);
    expect(o).toMatchObject({ rounding: true, altText: "A photo", flipV: true, rotate: 15 });
    const rounded = recorder();
    addElementToSlide(rounded, { ...img, mask: "roundRect" } as SlideElement, ctx);
    expect(ctx.report.count("maskApprox")).toBe(1);
    const missing = recorder();
    const empty = context({ "https://cdn.example.com/photo.jpg": null });
    addElementToSlide(missing, img, empty);
    expect(missing.calls).toHaveLength(0);
    expect(empty.report.count("imageMissing")).toBe(1);
    expect(coverCrop(400, 100, 100, 100)).toEqual({ l: 0.375, t: 0, r: 0.375, b: 0 });
  });

  test("tables: merges, covered cells left out, header and banding look, borders and pt margins", () => {
    const [, , , , , table] = sampleElements();
    const slide = recorder();
    addElementToSlide(slide, table, context());
    const [call] = slide.calls;
    expect(call.kind).toBe("table");
    const rows = call.a as PptxGenJS.TableRow[];
    expect(rows.map((r) => r.length)).toEqual([1, 2]);
    const head = rows[0][0];
    expect(head.options).toMatchObject({ colspan: 2, valign: "middle", margin: [3.6, 7.2, 3.6, 7.2], fill: { color: "EEEEEE" } });
    expect(head.options?.border).toEqual([
      { type: "solid", color: "CCCCCC", pt: 1 },
      { type: "solid", color: "CCCCCC", pt: 1 },
      { type: "solid", color: "CCCCCC", pt: 1 },
      { type: "solid", color: "CCCCCC", pt: 1 },
    ]);
    const headRuns = head.text as PptxGenJS.TableCell[];
    expect(headRuns[0]).toMatchObject({ text: "Item", options: { bold: true } });
    expect(headRuns[0].options?.color).toBe("FFFFFF");
    // Banded first body row: the surface tint (simple-light #F3F4F6) unless the cell has its own fill.
    expect(rows[1][0].options?.fill).toEqual({ color: "F3F4F6" });
    expect((rows[1][0].text as PptxGenJS.TableCell[])[0]).toMatchObject({ text: "Tea", options: { bold: true } });
    // Sizes scaled to the 300 × 120 frame.
    expect(call.b).toMatchObject({ x: 0.5556, y: 0.6944, w: 4.1667 });
    const tableOpts = call.b as PptxGenJS.TableProps;
    expect((tableOpts.colW as number[]).map((w) => Math.round(w * 72))).toEqual([136, 164]);
    expect((tableOpts.rowH as number[]).map((h) => Math.round(h * 72))).toEqual([51, 69]);
  });

  test("charts are left out and reported", () => {
    const [, , , , , , chart] = sampleElements();
    const ctx = context();
    const slide = recorder();
    addElementToSlide(slide, chart, ctx);
    expect(slide.calls).toHaveLength(0);
    expect(ctx.report.toReport().items).toEqual([{ code: "chartSkipped", count: 1 }]);
  });
});

describe("slides and files", () => {
  test("a slide: background, theme decor flattened first, elements, notes, hidden flag", () => {
    const deck = sampleDeck();
    const ctx = { ...context({ "https://cdn.example.com/bg.png": { ...JPEG, dataUrl: "data:image/png;base64,iVBOR" } }), theme: deck.meta.theme };
    const first = recorder();
    fillPptxSlide(first, deck, deck.slides[0], ctx);
    expect(first.background).toEqual({ color: "FAFAFA", transparency: undefined });
    // coastal has a top band: the first shape is the decor rectangle, in accent1.
    expect(first.calls[0]).toMatchObject({ kind: "shape", a: "rect", b: { x: 0, y: 0, w: 13.3333, fill: { color: "0E7490" } } });
    expect(first.calls.at(-1)).toEqual({ kind: "notes", a: "Say hello" });
    expect(first.hidden).toBeUndefined();
    const second = recorder();
    fillPptxSlide(second, deck, deck.slides[1], ctx);
    expect(second.hidden).toBe(true);
    expect(second.background).toEqual({ data: "data:image/png;base64,iVBOR", path: "preencoded.png" });
    expect(ctx.report.count("decorFlattened")).toBe(2);
    expect(exportWarningCount(ctx.report.toReport())).toBe(ctx.report.toReport().items.filter((i) => i.code !== "decorFlattened").reduce((s, i) => s + i.count, 0));
    expect(dataUrlExtension("data:image/jpeg;base64,xx")).toBe("jpeg");
  });

  test("pictures are fetched once per src, a few at a time, failures as null", async () => {
    let running = 0;
    let peak = 0;
    const seen: string[] = [];
    const images = await fetchDeckImages(["a", "b", "c", "d", "e", "f"], async (src) => {
      seen.push(src);
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      if (src === "c") throw new Error("boom");
      return src === "d" ? null : JPEG;
    }, 3);
    expect(seen.sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(peak).toBe(3);
    expect(images.get("c")).toBeNull();
    expect(images.get("d")).toBeNull();
    expect(images.get("a")).toEqual(JPEG);
  });

  test("dedupeParagraphProps keeps only each paragraph's leading <a:pPr>", () => {
    const xml =
      '<p:txBody><a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r><a:t>a</a:t></a:r><a:pPr indent="0"><a:buNone/></a:pPr><a:r><a:t>b</a:t></a:r></a:p>' +
      '<a:p><a:pPr lvl="1"/><a:r><a:t>c</a:t></a:r></a:p><a:p><a:r><a:t>d</a:t></a:r><a:pPr/></a:p></p:txBody>';
    expect(dedupeParagraphProps(xml)).toBe(
      '<p:txBody><a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r><a:t>a</a:t></a:r><a:r><a:t>b</a:t></a:r></a:p>' +
        '<a:p><a:pPr lvl="1"/><a:r><a:t>c</a:t></a:r></a:p><a:p><a:r><a:t>d</a:t></a:r></a:p></p:txBody>',
    );
  });

  test("exportImageDataUrl labels the sniffed type (jpg → image/jpeg, gif → image/gif)", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
    expect(exportImageDataUrl({ data: bytes, type: "jpg" })).toBe("data:image/jpeg;base64,/9j/4A==");
    expect(exportImageDataUrl({ data: new Uint8Array([0x47, 0x49, 0x46, 0x38]).buffer, type: "gif" })).toBe("data:image/gif;base64,R0lGOA==");
    // Large buffers are encoded in chunks without overflowing the argument list.
    const big = new Uint8Array(200_000).fill(65);
    expect(exportImageDataUrl({ data: big.buffer, type: "png" }).length).toBe("data:image/png;base64,".length + Math.ceil(200_000 / 3) * 4);
  });
});
