// Canonical sample decks for the Slides model tests. Every element and text goes through the validator, so the
// fixtures are exactly what a reader returns after a build (the round-trip currency).
import type { JSONContent } from "@tiptap/core";

import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import type { DeckSnapshot, MasterSnapshot, SlideElement, SlideSnapshot } from "@/lib/slides/model/types";
import { sanitizeElement, sanitizeTextJson } from "@/lib/slides/model/validate";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";

export const RICH_TEXT: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { textAlign: "center", dir: "rtl", spaceBefore: 6, spaceAfter: 4, lineHeight: 1.5 },
      content: [
        { type: "text", text: "Bold ", marks: [{ type: "bold" }, { type: "italic" }] },
        { type: "text", text: "colour", marks: [{ type: "textStyle", attrs: { color: "theme:accent1", fontFamily: "theme:heading", fontSize: 24 } }] },
        { type: "hardBreak" },
        { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com/a" } }, { type: "underline" }] },
        { type: "text", text: "2", marks: [{ type: "superscript" }, { type: "highlight", attrs: { color: "#ffee00" } }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one", marks: [{ type: "strike" }] }] }] },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "two", marks: [{ type: "subscript" }] }] },
            { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "nested" }] }] }] },
          ],
        },
      ],
    },
    { type: "paragraph" },
  ],
};

export function canonicalText(json: JSONContent): JSONContent {
  return sanitizeTextJson(json);
}

export function canonical(raw: Record<string, unknown>): SlideElement {
  const el = sanitizeElement(raw);
  if (!el) throw new Error(`fixture element ${String(raw.id)} is invalid`);
  return el;
}

const box = { x: 40, y: 50, w: 300, h: 120, rot: 15 };
const common = { locked: false, name: "", link: "", placeholder: "" };

/** One element of every type, z keys ascending in the given order. */
export function sampleElements(): SlideElement[] {
  const z = sequentialKeys(7);
  return [
    canonical({
      ...common, ...box, id: "txt1", z: z[0], type: "text", placeholder: "title", link: "https://merchiva.example/x",
      geom: { kind: "preset", preset: "rect" }, fill: { t: "none" }, stroke: null, shadow: null,
      box: { vAlign: "middle", inset: [7.2, 3.6, 7.2, 3.6], autofit: "grow", fontScale: 1, wrap: true, vertical: false },
      textStyle: { font: "theme:heading", size: 32, color: "theme:text", bold: true, align: "center", lineHeight: 1.1 },
      flipH: false, flipV: false, text: RICH_TEXT,
    }),
    canonical({
      ...common, ...box, id: "shp1", z: z[1], type: "shape", name: "Star",
      geom: { kind: "preset", preset: "star5" },
      fill: { t: "linear", angle: 90, stops: [{ pos: 0, color: "#ff0000" }, { pos: 1, color: "theme:accent2", alpha: 0.5 }] },
      stroke: { color: "#112233", width: 3, dash: "dash", alpha: 0.8 },
      shadow: { x: 2, y: 3, blur: 4, color: "#000000", alpha: 0.3 },
      box: { vAlign: "bottom", inset: [1, 2, 3, 4], autofit: "none", fontScale: 0.8, wrap: false, vertical: true },
      textStyle: { font: "Georgia, serif", size: 18, color: "#333333", bold: false, align: "right", lineHeight: 1.4 },
      flipH: true, flipV: true, text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Sale" }] }] },
    }),
    canonical({
      ...common, ...box, id: "path1", z: z[2], type: "shape",
      geom: { kind: "path", d: "M0 0 L100 0 L50 80 Z", vw: 100, vh: 80, srcPreset: "flowChartMerge" },
      fill: { t: "image", src: "https://cdn.example.com/fill.png", mode: "stretch" },
      stroke: null, shadow: null, box: {}, textStyle: {}, flipH: false, flipV: false,
      text: { type: "doc", content: [{ type: "paragraph" }] },
    }),
    canonical({
      ...common, id: "ln1", z: z[3], type: "line", x1: 10, y1: 20, x2: 400, y2: 20,
      stroke: { color: "theme:accent1", width: 2, dash: "solid", head: "arrow", tail: "oval" },
    }),
    canonical({
      ...common, ...box, id: "img1", z: z[4], type: "image", src: "https://cdn.example.com/photo.jpg",
      crop: { l: 0.1, t: 0, r: 0.2, b: 0.05 }, mask: "ellipse", alt: "A photo", stroke: null, flipH: false, flipV: true,
    }),
    canonical({
      ...common, ...box, id: "tbl1", z: z[5], type: "table",
      rows: [{ id: "r1", order: "A", h: 30 }, { id: "r2", order: "B", h: 40 }],
      cols: [{ id: "c1", order: "A", w: 100 }, { id: "c2", order: "B", w: 120 }],
      cells: [
        { rowId: "r1", colId: "c1", text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }, fill: "#eeeeee", rowSpan: 1, colSpan: 2, covered: false, vAlign: "middle" },
        { rowId: "r1", colId: "c2", text: { type: "doc", content: [{ type: "paragraph" }] }, fill: null, rowSpan: 1, colSpan: 1, covered: true, vAlign: "top" },
        { rowId: "r2", colId: "c1", text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tea", marks: [{ type: "bold" }] }] }] }, fill: null, rowSpan: 1, colSpan: 1, covered: false, vAlign: "top" },
        { rowId: "r2", colId: "c2", text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "3.50" }] }] }, fill: "theme:surface", rowSpan: 1, colSpan: 1, covered: false, vAlign: "bottom" },
      ],
      style: { border: { color: "#cccccc", width: 1 }, headerRow: true, banded: true, textStyle: { font: "theme:body", size: 14, color: "theme:text", bold: false, align: "left", lineHeight: 1.2 } },
    }),
    canonical({
      ...common, ...box, id: "cht1", z: z[6], type: "chart",
      chart: { kind: "bar", title: "Sales", categories: ["Mon", "Tue"], series: [{ name: "Tea", values: [3, 5] }], colors: ["#2563eb"] },
    }),
  ];
}

export function sampleSlide(id: string, order: string, elements: readonly SlideElement[] = sampleElements()): SlideSnapshot {
  return {
    id,
    order,
    layout: "titleBody",
    masterId: "theme",
    hidden: false,
    background: { t: "solid", color: "#fafafa" },
    transition: { type: "fade", durationMs: 300 },
    notes: canonicalText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Say hello" }] }] }),
    elements,
  };
}

export function sampleMaster(): MasterSnapshot {
  return {
    id: "m_0123456789abcdef",
    name: "Imported master",
    background: { t: "image", src: "https://cdn.example.com/bg.png", mode: "cover" },
    elements: [canonical({ ...common, ...box, id: "logo", z: "V", type: "image", src: "https://cdn.example.com/logo.png", crop: {}, mask: "", alt: "", stroke: null, flipH: false, flipV: false })],
  };
}

export function sampleDeck(): DeckSnapshot {
  const [o1, o2] = sequentialKeys(2);
  return {
    meta: { schemaVersion: 1, size: { w: 960, h: 540 }, theme: STARTER_THEMES.coastal, source: { kind: "pptx", fileName: "menu.pptx", importedAt: 1_700_000_000_000 } },
    masters: [sampleMaster()],
    slides: [
      sampleSlide("slideA", o1),
      { ...sampleSlide("slideB", o2, []), masterId: "m_0123456789abcdef", layout: "imported", hidden: true, background: null, transition: null },
    ],
  };
}
