// pptxtojson HTML → slide text JSON (slides.md §10.1 step 4). Nothing from the file is ever rendered as HTML:
//
// 1. When a DOM is available, DOMPurify first reduces the markup to p/span/a/ul/ol/li/br/sub/sup with style and href
//    (defence in depth; its own URI check already drops `javascript:` and friends).
// 2. ./html-tokens.ts + ./html-blocks.ts read the markup as data (entities decoded, CDATA-born tags dropped, `script`
//    and `style` dropped with their content).
// 3. Here, run styles become marks (only where they differ from the element's text defaults, so the element stays
//    editable as a whole), paragraph styles become attributes, lists nest, and links survive only as http(s) URLs.
// 4. The result goes through sanitizeTextJson, the model's single choke point for untrusted text.
import type { JSONContent } from "@tiptap/core";
import DOMPurify from "dompurify";

import { safeHref } from "@/lib/slides/model/safe-values";
import type { ColorValue, FontRef, TextDefaults } from "@/lib/slides/model/types";
import { sanitizeTextJson } from "@/lib/slides/model/validate";
import { paragraphLineHeight, paragraphSpace } from "@/lib/slides/text/paragraph-attrs";

import type { ParsedColor } from "./colors";
import { mapFontFamily } from "./fonts";
import { readPptxHtml, type CssLength, type ListKind, type PptxParagraph, type PptxRun, type RunStyle } from "./html-blocks";
import type { ImportReportBuilder } from "./report";

export interface PurifiedHtml { html: string; removedLinks: number }
export type HtmlPurifier = (html: string) => PurifiedHtml;

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "span", "a", "ul", "ol", "li", "br", "sub", "sup"],
  ALLOWED_ATTR: ["style", "href"],
};

/** DOMPurify with the pptxtojson profile, or null without a DOM (the worker, SSR, Bun tests). */
export function domPurifier(): HtmlPurifier | null {
  if (typeof window === "undefined" || !DOMPurify.isSupported || typeof DOMPurify.sanitize !== "function") return null;
  return (html) => {
    const clean = DOMPurify.sanitize(html, PURIFY_CONFIG);
    const removed = (DOMPurify.removed ?? []) as Array<{ attribute?: { name?: string } | null }>;
    const removedLinks = removed.filter((entry) => entry.attribute?.name === "href").length;
    return { html: String(clean), removedLinks };
  };
}

/** A link an imported deck may keep: an absolute http(s) URL (normalized), else "". */
export function importHref(raw: string): string {
  const href = safeHref(raw);
  return href.startsWith("https://") || href.startsWith("http://") ? href : "";
}

/** Maps a pptxtojson `font-family` value to a font reference (a stack, or a theme font); null = no family. */
export type FontResolver = (css: string) => FontRef | null;

/** The plain resolver: mapFontFamily, reporting each unknown family once. */
export function reportingFontResolver(report: ImportReportBuilder): FontResolver {
  const seen = new Set<string>();
  return (css) => {
    const mapped = mapFontFamily(css);
    if (mapped.substituted !== null && !seen.has(mapped.substituted.toLowerCase())) {
      seen.add(mapped.substituted.toLowerCase());
      report.add("fontSubstituted", 1, mapped.substituted);
    }
    return mapped.stack === "" ? null : mapped.stack;
  };
}

export interface PptxTextContext {
  report: ImportReportBuilder;
  /** The element's text defaults: runs that match them carry no mark. */
  defaults: TextDefaults;
  fonts?: FontResolver;
  /** Maps a literal colour to the stored form (a theme reference when it is the theme's text colour). */
  color?: (hex: `#${string}`) => ColorValue;
  /** Replaces DOMPurify (tests); null = no purifier. Defaults to domPurifier(). */
  purify?: HtmlPurifier | null;
}

/** DOMPurify (when available) and then the paragraph reader; purifier link removals are reported. */
export function readImportHtml(html: string, report: ImportReportBuilder, purify: HtmlPurifier | null | undefined): PptxParagraph[] {
  const source = typeof html === "string" ? html : "";
  const purifier = purify === undefined ? domPurifier() : purify;
  if (!purifier || source === "") return readPptxHtml(source);
  const clean = purifier(source);
  if (clean.removedLinks > 0) report.add("linkRemoved", clean.removedLinks);
  return readPptxHtml(clean.html);
}

/**
 * The paragraphs with a table cell's style colour and weight given to every run that sets none (pptxtojson reports
 * those per cell, not per run).
 */
export function withRunDefaults(paragraphs: readonly PptxParagraph[], defaults: { color?: ParsedColor | null; bold?: boolean }): PptxParagraph[] {
  if (!defaults.color && !defaults.bold) return [...paragraphs];
  const fill = (style: RunStyle): RunStyle => ({ ...style, color: style.color ?? defaults.color ?? null, bold: style.bold || defaults.bold === true });
  return paragraphs.map((p) => ({ ...p, runs: p.runs.map((run) => ({ ...run, style: fill(run.style) })) }));
}

type Json = Record<string, unknown>;

function runColor(style: RunStyle, ctx: Pick<PptxTextContext, "color">): ColorValue | null {
  if (!style.color) return null;
  return ctx.color ? ctx.color(style.color.hex) : style.color.hex;
}

function runFont(style: RunStyle, ctx: Pick<PptxTextContext, "fonts">): FontRef | null {
  if (!style.font) return null;
  return ctx.fonts ? ctx.fonts(style.font) : (mapFontFamily(style.font).stack || null);
}

function runMarks(run: Extract<PptxRun, { kind: "text" }>, ctx: PptxTextContext): Json[] {
  const d = ctx.defaults;
  const s = run.style;
  const marks: Json[] = [];
  if (s.bold && !d.bold) marks.push({ type: "bold" });
  if (s.italic) marks.push({ type: "italic" });
  if (s.underline) marks.push({ type: "underline" });
  if (s.strike) marks.push({ type: "strike" });
  if (s.script === "sup") marks.push({ type: "superscript" });
  else if (s.script === "sub") marks.push({ type: "subscript" });
  const color = runColor(s, ctx);
  const font = runFont(s, ctx);
  const attrs = {
    color: color !== null && color !== d.color ? color : null,
    fontFamily: font !== null && font !== d.font ? font : null,
    fontSize: s.size !== null && s.size !== d.size ? s.size : null,
  };
  if (attrs.color !== null || attrs.fontFamily !== null || attrs.fontSize !== null) marks.push({ type: "textStyle", attrs });
  if (run.href !== null && run.href.trim() !== "") {
    const href = importHref(run.href);
    if (href !== "") marks.push({ type: "link", attrs: { href } });
  }
  return marks;
}

/** The size a paragraph's em lengths and point line heights are relative to: its first sized run, else the default. */
function paragraphSize(p: PptxParagraph, d: TextDefaults): number {
  for (const run of p.runs) if (run.style.size !== null) return run.style.size;
  return d.size;
}

function lengthPt(value: CssLength | null, size: number): number | null {
  if (!value) return null;
  if ("pt" in value) return paragraphSpace(value.pt);
  // pptxtojson 2.2.0 writes spcPct as `val / 1000` em, 100× too large ("50em" for half a line), and is the only
  // producer of these strings.
  return paragraphSpace((value.em / 100) * size);
}

/** Line height as a multiple, or null. */
function lineHeightMult(p: PptxParagraph, size: number): number | null {
  if (!p.lineHeight) return null;
  return paragraphLineHeight("mult" in p.lineHeight ? p.lineHeight.mult : p.lineHeight.pt / size);
}

/** A paragraph whose only content is the one space pptxtojson writes for an empty line. */
function isEmptyLine(p: PptxParagraph): boolean {
  return p.runs.length > 0 && p.runs.every((r) => r.kind === "text") && p.runs.map((r) => (r.kind === "text" ? r.text : "")).join("") === " ";
}

function paragraphJson(p: PptxParagraph, ctx: PptxTextContext): Json {
  const d = ctx.defaults;
  const size = paragraphSize(p, d);
  const lineHeight = lineHeightMult(p, size);
  const attrs = {
    textAlign: p.align !== null && p.align !== d.align ? p.align : null,
    dir: null,
    spaceBefore: lengthPt(p.spaceBefore, size) || null,
    spaceAfter: lengthPt(p.spaceAfter, size) || null,
    lineHeight: lineHeight !== null && lineHeight !== d.lineHeight ? lineHeight : null,
  };
  const content: Json[] = [];
  if (!isEmptyLine(p)) {
    for (const run of p.runs) {
      if (run.kind === "break") {
        content.push({ type: "hardBreak" });
        continue;
      }
      const marks = runMarks(run, ctx);
      if (run.href !== null && run.href.trim() !== "" && !marks.some((m) => m.type === "link")) ctx.report.add("linkRemoved");
      const prev = content[content.length - 1];
      if (prev && prev.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(marks)) prev.text = `${String(prev.text)}${run.text}`;
      else content.push(marks.length > 0 ? { type: "text", text: run.text, marks } : { type: "text", text: run.text });
    }
  }
  return content.length > 0 ? { type: "paragraph", attrs, content } : { type: "paragraph", attrs };
}

interface OpenList { kind: ListKind; node: { type: string; attrs?: Json; content: Json[] } }

function listNode(kind: ListKind): OpenList["node"] {
  return kind === "ul" ? { type: "bulletList", content: [] } : { type: "orderedList", attrs: { start: 1, type: null }, content: [] };
}

/** Paragraphs → blocks, nesting list paragraphs by their list path (a nested list lives in the previous item). */
export function paragraphsToBlocks(paragraphs: readonly PptxParagraph[], ctx: PptxTextContext): Json[] {
  const blocks: Json[] = [];
  const stack: OpenList[] = [];
  const lastItem = (list: OpenList): Json[] => {
    if (list.node.content.length === 0) list.node.content.push({ type: "listItem", content: [{ type: "paragraph" }] });
    return list.node.content[list.node.content.length - 1].content as Json[];
  };
  for (const p of paragraphs) {
    const json = paragraphJson(p, ctx);
    const path = p.list;
    if (path.length === 0) {
      stack.length = 0;
      blocks.push(json);
      continue;
    }
    let keep = 0;
    while (keep < stack.length && keep < path.length && stack[keep].kind === path[keep]) keep++;
    stack.length = keep;
    let fresh = false;
    while (stack.length < path.length) {
      const list: OpenList = { kind: path[stack.length], node: listNode(path[stack.length]) };
      if (stack.length === 0) blocks.push(list.node);
      else lastItem(stack[stack.length - 1]).push(list.node);
      stack.push(list);
      fresh = true;
    }
    const top = stack[stack.length - 1];
    if (p.newItem || fresh || top.node.content.length === 0) top.node.content.push({ type: "listItem", content: [json] });
    else lastItem(top).push(json);
  }
  return blocks;
}

/** Weighted vote: the value with the most weight (ties keep the first seen). */
function vote<T>(entries: ReadonlyArray<[T | null, number]>): T | null {
  const totals = new Map<T, number>();
  let best: T | null = null;
  let bestWeight = 0;
  for (const [value, weight] of entries) {
    if (value === null || weight <= 0) continue;
    const total = (totals.get(value) ?? 0) + weight;
    totals.set(value, total);
    if (total > bestWeight) {
      best = value;
      bestWeight = total;
    }
  }
  return best;
}

/** The text defaults most of the text uses (by characters; alignment and line height by paragraphs). */
export function dominantTextDefaults(paragraphs: readonly PptxParagraph[], base: TextDefaults, ctx: Pick<PptxTextContext, "fonts" | "color">): TextDefaults {
  const runs = paragraphs.flatMap((p) => p.runs.filter((r): r is Extract<PptxRun, { kind: "text" }> => r.kind === "text" && r.text.trim() !== ""));
  const weight = (r: { text: string }) => r.text.length;
  const font = vote(runs.map((r) => [runFont(r.style, ctx), weight(r)] as [FontRef | null, number]));
  const size = vote(runs.map((r) => [r.style.size, weight(r)] as [number | null, number]));
  const color = vote(runs.map((r) => [runColor(r.style, ctx), weight(r)] as [ColorValue | null, number]));
  const align = vote(paragraphs.map((p) => [p.align, 1] as [TextDefaults["align"] | null, number]));
  const lineHeight = vote(paragraphs.map((p) => [lineHeightMult(p, paragraphSize(p, base)), 1] as [number | null, number]));
  return {
    font: font ?? base.font,
    size: size ?? base.size,
    color: color ?? base.color,
    bold: runs.length > 0 && runs.every((r) => r.style.bold),
    align: align ?? base.align,
    lineHeight: lineHeight ?? base.lineHeight,
  };
}

/** Paragraphs → sanitized slide text JSON. */
export function paragraphsToText(paragraphs: readonly PptxParagraph[], ctx: PptxTextContext): JSONContent {
  const blocks = paragraphsToBlocks(paragraphs, ctx);
  return sanitizeTextJson({ type: "doc", content: blocks.length > 0 ? blocks : [{ type: "paragraph" }] });
}

/** PURE (no DOM unless DOMPurify has one): pptxtojson HTML → sanitized slide text JSON. */
export function parsePptxHtml(html: string, ctx: PptxTextContext): JSONContent {
  const fonts = ctx.fonts ?? reportingFontResolver(ctx.report);
  return paragraphsToText(readImportHtml(html, ctx.report, ctx.purify), { ...ctx, fonts });
}
