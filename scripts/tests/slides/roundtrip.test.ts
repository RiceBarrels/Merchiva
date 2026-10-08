// Real round trip (slides.md §15, F17): buildPptx (real pptxgenjs, headless in Bun) → the written file → real
// pptxtojson parse with the .pptx import's own options (PPTX_PARSE_OPTIONS). Geometry comes back within 0.5 pt,
// text, line spacing and speaker notes survive, a JPEG stays a JPEG, and the file is well-formed where pptxgenjs
// alone is not. Line spacing only survives when the import reads spcPct with the exporter's convention
// (singleLineSpacingFactor = SINGLE_LINE_HEIGHT); the tests below fail loudly when the two drift apart.
import { beforeAll, describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";
import { strFromU8, unzipSync } from "fflate";
import { parse } from "pptxtojson";

import { PPTX_MIME, buildPptx } from "@/lib/slides/export/pptx";
import { SINGLE_LINE_HEIGHT } from "@/lib/slides/export/pptx-text";
import { PPTX_PARSE_OPTIONS } from "@/lib/slides/import/pipeline";
import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import { safeHref } from "@/lib/slides/model/safe-values";
import type { DeckSnapshot, SlideElement, ThemeSpec } from "@/lib/slides/model/types";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import { textJsonToPlain } from "@/lib/slides/text/plain";
import { canonical, canonicalText } from "./helpers/fixtures";

// A 1 × 1 baseline JPEG.
const JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

type Parsed = Awaited<ReturnType<typeof parse>>;
type ParsedElement = Parsed["slides"][number]["elements"][number];

const common = { locked: false, link: "", placeholder: "", rot: 0 };
const paragraph = (text: string, attrs?: Record<string, unknown>): JSONContent => ({ type: "paragraph", ...(attrs ? { attrs } : {}), content: [{ type: "text", text }] });
const text = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

function elements(): SlideElement[] {
  const z = sequentialKeys(6);
  return [
    canonical({
      ...common, ...box(60, 40, 840, 120), id: "title", z: z[0], type: "text", name: "Title",
      geom: { kind: "preset", preset: "rect" }, fill: { t: "none" }, stroke: null, shadow: null, box: {}, textStyle: { size: 28 },
      flipH: false, flipV: false,
      text: text(
        paragraph("Weekly specials"),
        paragraph("Fresh every morning", { lineHeight: 1.5 }),
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Tea 3.50")] }, { type: "listItem", content: [paragraph("Cake 4.00")] }] },
      ),
    }),
    canonical({
      ...common, ...box(100, 200, 200, 100), id: "badge", z: z[1], type: "shape", name: "Badge",
      geom: { kind: "preset", preset: "roundRect" }, fill: { t: "solid", color: "#2563eb" }, stroke: { color: "#1e3a8a", width: 2, dash: "solid" },
      shadow: null, box: { vAlign: "middle" }, textStyle: { color: "#ffffff", align: "center" }, flipH: false, flipV: false,
      text: text(paragraph("Sale")),
    }),
    canonical({ ...common, id: "arrow", z: z[2], type: "line", name: "Arrow", x1: 400, y1: 300, x2: 700, y2: 360, stroke: { color: "#111111", width: 3, dash: "solid", head: "oval", tail: "triangle" } }),
    canonical({ ...common, ...box(500, 100, 300, 150), id: "photo", z: z[3], type: "image", name: "Photo", src: "https://cdn.example.com/p.jpg", crop: {}, mask: "", alt: "Counter", stroke: null, flipH: false, flipV: false }),
    canonical({
      ...common, ...box(60, 400, 400, 100), id: "prices", z: z[4], type: "table", name: "Prices",
      rows: [{ id: "r1", order: "A", h: 50 }, { id: "r2", order: "B", h: 50 }],
      cols: [{ id: "c1", order: "A", w: 200 }, { id: "c2", order: "B", w: 200 }],
      cells: [
        { rowId: "r1", colId: "c1", text: text(paragraph("Item")), fill: null, rowSpan: 1, colSpan: 1, covered: false, vAlign: "top" },
        { rowId: "r1", colId: "c2", text: text(paragraph("Price")), fill: null, rowSpan: 1, colSpan: 1, covered: false, vAlign: "top" },
        { rowId: "r2", colId: "c1", text: text(paragraph("Tea")), fill: null, rowSpan: 1, colSpan: 1, covered: false, vAlign: "top" },
        { rowId: "r2", colId: "c2", text: text(paragraph("3.50")), fill: null, rowSpan: 1, colSpan: 1, covered: false, vAlign: "top" },
      ],
      style: {},
    }),
    canonical({
      ...common, ...box(720, 380, 150, 100), id: "tag", z: z[5], type: "shape", name: "Tag",
      geom: { kind: "path", d: "M0 0 L100 0 L100 60 L50 80 L0 60 Z", vw: 100, vh: 80, srcPreset: "" },
      fill: { t: "solid", color: "#f59e0b" }, stroke: null, shadow: null, box: {}, textStyle: {}, flipH: false, flipV: false,
      text: text(paragraph("Deal")),
    }),
  ];
}

function deck(): DeckSnapshot {
  const [o1, o2] = sequentialKeys(2);
  const notes = canonicalText(text(paragraph("Remember the discount")));
  return {
    meta: { schemaVersion: 1, size: { w: 960, h: 540 }, theme: STARTER_THEMES["simple-light"], source: null },
    masters: [],
    slides: [
      { id: "s1", order: o1, layout: "blank", masterId: "", hidden: false, background: { t: "solid", color: "#fafafa" }, transition: null, notes, elements: elements() },
      { id: "s2", order: o2, layout: "blank", masterId: "", hidden: true, background: null, transition: null, notes: canonicalText(text({ type: "paragraph" })), elements: [] },
    ],
  };
}

const ATTR_VALUE = String.raw`"(?:[^"<&]|&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)*"`;
const WELL_FORMED_TAG = new RegExp(String.raw`^<[\w:.-]+(?:\s+[\w:.-]+=${ATTR_VALUE})*\s*/?>$`);

/** Start tags of `xml` whose attributes are not well-formed (an unescaped quote closes a value early). */
function malformedTags(xml: string): string[] {
  return [...xml.matchAll(/<[^!?/][^>]*>/g)].map((m) => m[0]).filter((tag) => !WELL_FORMED_TAG.test(tag));
}

/** The XML parts of the file buildPptx writes for a one-slide deck around `elements`. */
async function writtenParts(elements: SlideElement[], theme: ThemeSpec = STARTER_THEMES["simple-light"]): Promise<Record<string, string>> {
  const base = deck();
  const snap: DeckSnapshot = { ...base, meta: { ...base.meta, theme }, slides: [{ ...base.slides[0], elements }] };
  const out = await buildPptx(snap, { title: 'A "quoted" & <odd> title', fetchImage: async () => ({ dataUrl: JPEG, width: 1, height: 1 }) });
  const parts = unzipSync(new Uint8Array(await out.blob.arrayBuffer()));
  return Object.fromEntries(Object.entries(parts).filter(([name]) => /\.(xml|rels)$/.test(name)).map(([name, data]) => [name, strFromU8(data)]));
}

/** Every paragraph of a text, list items included, in document order. */
function paragraphsOf(node: JSONContent): JSONContent[] {
  if (node.type === "paragraph") return [node];
  return (node.content ?? []).flatMap(paragraphsOf);
}

function plain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

let blob: Blob;
let files: Record<string, Uint8Array>;
let parsed: Parsed;
let first: ParsedElement[];

function named(name: string): ParsedElement & { content?: string } {
  const found = first.find((e) => "name" in e && e.name === name);
  if (!found) throw new Error(`no element named ${name}`);
  return found as ParsedElement & { content?: string };
}

function expectFrame(el: { left: number; top: number; width: number; height: number }, x: number, y: number, w: number, h: number) {
  expect(Math.abs(el.left - x)).toBeLessThan(0.5);
  expect(Math.abs(el.top - y)).toBeLessThan(0.5);
  expect(Math.abs(el.width - w)).toBeLessThan(0.5);
  expect(Math.abs(el.height - h)).toBeLessThan(0.5);
}

beforeAll(async () => {
  const out = await buildPptx(deck(), { title: "Specials", fetchImage: async () => ({ dataUrl: JPEG, width: 1, height: 1 }) });
  blob = out.blob;
  const buffer = await blob.arrayBuffer();
  files = unzipSync(new Uint8Array(buffer));
  parsed = await parse(buffer, PPTX_PARSE_OPTIONS);
  first = parsed.slides[0].elements;
});

describe("pptxgenjs → pptxtojson round trip", () => {
  test("the file: MIME, slide size, slide count, hidden slide", () => {
    expect(blob.type).toBe(PPTX_MIME);
    expect(Math.abs(parsed.size.width - 960)).toBeLessThan(0.5);
    expect(Math.abs(parsed.size.height - 540)).toBeLessThan(0.5);
    expect(parsed.slides).toHaveLength(2);
    expect(strFromU8(files["ppt/slides/slide2.xml"])).toContain('show="0"');
  });

  test("the import reads spcPct line spacing with the exporter's convention", () => {
    expect((PPTX_PARSE_OPTIONS as { singleLineSpacingFactor?: number }).singleLineSpacingFactor).toBe(SINGLE_LINE_HEIGHT);
  });

  test("text box: geometry, text, line spacing and bullets", () => {
    const title = named("Title");
    expectFrame(title, 60, 40, 840, 120);
    const body = title.content ?? "";
    expect(plain(body)).toContain("Weekly specials");
    expect(plain(body)).toContain("Fresh every morning");
    // Written: 1.5 / 1.2 = 125 %; every other paragraph single (100 %), stated rather than left to inheritance.
    const spacing = [...strFromU8(files["ppt/slides/slide1.xml"]).matchAll(/<a:lnSpc><a:spcPct val="(\d+)"\/><\/a:lnSpc>/g)].map((m) => m[1]);
    expect(spacing.slice(0, 4)).toEqual(["100000", "125000", "100000", "100000"]);
    expect(body).toContain("line-height: 1.5");
    expect(body).toMatch(/<ul><li>[\s\S]*Tea(&nbsp;| )3\.50[\s\S]*<\/li><li>[\s\S]*Cake(&nbsp;| )4\.00[\s\S]*<\/li><\/ul>/);
    expect(body).toContain("font-size: 28pt");
  });

  test("preset shape with text keeps its preset, fill and text", () => {
    const badge = named("Badge") as ParsedElement & { shapType?: string; fill?: { type: string; value: string }; content?: string };
    expectFrame(badge, 100, 200, 200, 100);
    expect(badge.shapType).toBe("roundRect");
    expect(badge.fill).toEqual({ type: "color", value: "#2563EB" });
    expect(plain(badge.content ?? "")).toBe("Sale");
  });

  test("line: endpoints and arrowheads", () => {
    const arrow = named("Arrow") as ParsedElement & { shapType?: string; headEnd?: { type: string }; tailEnd?: { type: string }; isFlipH?: boolean };
    expect(arrow.shapType).toBe("line");
    expectFrame(arrow, 400, 300, 300, 60);
    expect(arrow.isFlipH).toBe(false);
    expect(arrow.headEnd?.type).toBe("oval");
    expect(arrow.tailEnd?.type).toBe("triangle");
  });

  test("custom path with text: a custom shape plus a text box over the same frame", () => {
    const shapes = first.filter((e) => e.type === "shape" && Math.abs(e.left - 720) < 0.5 && Math.abs(e.top - 380) < 0.5) as Array<ParsedElement & { shapType?: string; content?: string }>;
    expect(shapes).toHaveLength(2);
    const custom = shapes.find((s) => s.shapType === "custom");
    const label = shapes.find((s) => plain(s.content ?? "") === "Deal");
    expect(custom).toBeDefined();
    expect(label).toBeDefined();
    expectFrame(custom as ParsedElement, 720, 380, 150, 100);
    expectFrame(label as ParsedElement, 720, 380, 150, 100);
  });

  test("picture: geometry and a JPEG kept as image/jpeg", () => {
    const photo = first.find((e) => e.type === "image") as ParsedElement & { base64?: string };
    expectFrame(photo, 500, 100, 300, 150);
    expect(photo.base64?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(Object.keys(files).some((name) => /^ppt\/media\/.+\.jpeg$/.test(name))).toBe(true);
    expect(strFromU8(files["[Content_Types].xml"])).toContain("image/jpeg");
  });

  test("table: frame and cell text", () => {
    const table = first.find((e) => e.type === "table") as ParsedElement & { data?: Array<Array<{ text: string }>> };
    expect(Math.abs(table.left - 60)).toBeLessThan(0.5);
    expect(Math.abs(table.top - 400)).toBeLessThan(0.5);
    expect(Math.abs(table.width - 400)).toBeLessThan(0.5);
    expect(Math.abs(table.height - 100)).toBeLessThan(0.5);
    expect(table.data?.map((row) => row.map((cell) => plain(cell.text)))).toEqual([["Item", "Price"], ["Tea", "3.50"]]);
  });

  test("speaker notes survive", () => {
    expect(plain(parsed.slides[0].note)).toBe("Remember the discount");
  });

  test("through the .pptx import mapper: geometry within 0.5 pt, text and notes survive", async () => {
    // The import's own path (slides.md §10.1): pptxtojson with the import's options → extractDataUrls → mapPptxToSnapshot.
    const { extractDataUrls } = await import("@/lib/slides/import/dedupe-assets");
    const { mapPptxToSnapshot } = await import("@/lib/slides/import/map-deck");
    const raw = await parse(await blob.arrayBuffer(), PPTX_PARSE_OPTIONS);
    const { lean } = extractDataUrls(raw);
    const { snapshot } = mapPptxToSnapshot(lean, { fileName: "specials.pptx", now: 1 });
    expect(snapshot.meta.size).toEqual({ w: 960, h: 540 });
    expect(snapshot.slides).toHaveLength(2);
    const source = deck().slides[0];
    const mapped = snapshot.slides[0];
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.5);
    for (const original of source.elements) {
      if (original.type === "line") {
        const line = mapped.elements.find((el) => el.type === "line");
        if (line?.type !== "line") throw new Error("line not mapped");
        [[line.x1, 400], [line.y1, 300], [line.x2, 700], [line.y2, 360]].forEach(([a, b]) => near(a, b));
        continue;
      }
      if (original.type === "chart") continue;
      // Every box element comes back at its frame (the custom path as a shape plus its text box).
      const matches = mapped.elements.filter((el) => el.type !== "line" && Math.abs(el.x - original.x) < 0.5 && Math.abs(el.y - original.y) < 0.5);
      expect(matches.length).toBeGreaterThan(0);
      for (const el of matches) {
        if (el.type === "line") continue;
        near(el.w, original.w);
        near(el.h, original.h);
      }
    }
    const texts = mapped.elements.map((el) => ("text" in el ? textJsonToPlain(el.text) : "")).join("\n");
    for (const expected of ["Weekly specials", "Fresh every morning", "Tea 3.50", "Cake 4.00", "Sale", "Deal"]) expect(texts).toContain(expected);
    expect(textJsonToPlain(mapped.notes)).toBe("Remember the discount");
    // Line spacing: the title's four paragraphs come back at 1.2, 1.5, 1.2, 1.2, the most common one as the default.
    const title = mapped.elements.find((el) => el.type === "text" && textJsonToPlain(el.text).includes("Weekly specials"));
    if (title?.type !== "text") throw new Error("title not mapped");
    expect(title.textStyle.lineHeight).toBe(1.2);
    const lineHeights = paragraphsOf(title.text).map((p) => (p.attrs?.lineHeight as number | null | undefined) ?? title.textStyle.lineHeight);
    expect(lineHeights).toEqual([1.2, 1.5, 1.2, 1.2]);
  });

  test("every part is well-formed, also with quotes in font names (pptxgenjs writes typeface unescaped)", async () => {
    for (const [name, xml] of Object.entries(files).filter(([n]) => /\.(xml|rels)$/.test(n))) {
      expect({ name, bad: malformedTags(strFromU8(xml)) }).toEqual({ name, bad: [] });
    }
    const quoted = `'Foo"Bar', sans-serif`;
    const theme: ThemeSpec = { ...STARTER_THEMES["simple-light"], fonts: { heading: `"He'a""d", serif`, body: quoted } };
    const box = canonical({
      ...common, x: 60, y: 40, w: 400, h: 100, id: "q", z: "a", type: "text", name: "Quoted", geom: { kind: "preset", preset: "rect" },
      fill: { t: "none" }, stroke: null, shadow: null, box: {}, textStyle: { font: quoted }, flipH: false, flipV: false, text: text(paragraph("x")),
    });
    const parts = await writtenParts([box], theme);
    expect(parts["ppt/slides/slide1.xml"]).toContain('<a:latin typeface="FooBar"');
    expect(parts["ppt/theme/theme1.xml"]).toContain(`<a:latin typeface="He'ad"/>`);
    for (const [name, xml] of Object.entries(parts)) expect({ name, bad: malformedTags(xml) }).toEqual({ name, bad: [] });
  });

  test("a picture's link is XML-escaped in the slide's relationships (pptxgenjs writes addImage link targets raw)", async () => {
    const query = "https://shop.example/menu?item=1&size=large";
    // A mailto: URL keeps `"`, `<` and `>`, so unescaped it closed the Target attribute and added relationships.
    const crafted = 'mailto:x"/><Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="file://attacker.example/share/run.exe" TargetMode="External"/><Relationship Id="rId98" Target="@b.c';
    expect(safeHref(crafted)).toBe(crafted);
    const picture = (id: string, z: string, link: string) => canonical({
      ...common, ...box(100, 100, 200, 100), id, z, type: "image", name: id, src: "https://cdn.example.com/p.jpg", crop: {}, mask: "", alt: "",
      stroke: null, flipH: false, flipV: false, link,
    });
    const parts = await writtenParts([picture("query", "a", query), picture("mailto", "b", crafted)]);
    for (const [name, xml] of Object.entries(parts)) expect({ name, bad: malformedTags(xml) }).toEqual({ name, bad: [] });
    const rels = parts["ppt/slides/_rels/slide1.xml.rels"];
    // Two pictures (image + link each), the layout and the notes: nothing the link added.
    expect(rels.match(/<Relationship /g)).toHaveLength(6);
    expect(rels).not.toContain('<Relationship Id="rId99"');
    expect(rels).not.toContain('Target="file:');
    const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const hyperlinks = [...rels.matchAll(/<Relationship Id="rId\d+" Type="[^"]*\/hyperlink" Target="([^"]*)" TargetMode="External"\/>/g)];
    expect(hyperlinks.map((m) => decode(m[1]))).toEqual([query, crafted]);
  });

  test("an element 100 in (7,200 pt) or more from the origin keeps its place (pptxgenjs reads numbers ≥ 100 as EMU)", async () => {
    const far = canonical({
      ...common, id: "far", z: "a", type: "shape", name: "Far", x: 8000, y: 40, w: 100, h: 50,
      geom: { kind: "path", d: "M0 0 L100 0 L100 50 Z", vw: 100, vh: 50, srcPreset: "" },
      fill: { t: "solid", color: "#ff0000" }, stroke: null, shadow: null, box: {}, textStyle: {}, flipH: false, flipV: false,
      text: text({ type: "paragraph" }),
    });
    const wide = canonical({ ...common, id: "wide", z: "b", type: "line", name: "Wide", x1: -100, y1: 10, x2: 9000, y2: 10, stroke: { color: "#000000", width: 1, dash: "solid" } });
    const xml = (await writtenParts([far, wide]))["ppt/slides/slide1.xml"];
    expect(xml).toMatch(/name="Far"[\s\S]*?<a:off x="101600000" y="508041"\/>/);
    expect(xml).toMatch(/name="Wide"[\s\S]*?<a:off x="-1270010" y="127010"\/><a:ext cx="115570000" cy="0"\/>/);
    for (const [, n] of xml.matchAll(/<a:(?:off|ext|pt) (?:x|cx)="([^"]+)"/g)) expect(Number.isInteger(Number(n))).toBe(true);
  });

  test("well-formed text: one leading <a:pPr> per paragraph, no unresolved relationships", () => {
    const xml = strFromU8(files["ppt/slides/slide1.xml"]);
    expect(xml).not.toContain("rIdundefined");
    const paragraphs = xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [];
    expect(paragraphs.length).toBeGreaterThan(5);
    for (const p of paragraphs) {
      const props = p.match(/<a:pPr\b/g) ?? [];
      expect(props.length).toBeLessThanOrEqual(1);
      if (props.length === 1) expect(p.startsWith("<a:p><a:pPr")).toBe(true);
    }
  });
});
