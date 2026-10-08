// Slide text → pptxgenjs text runs (slides.md §10.2). One run per text node (split at "\n"), marks as run options,
// hard breaks as soft line breaks (`softBreakBefore` on the next run), and one paragraph per ProseMirror paragraph:
// its first run carries the paragraph options (align, spacing, bullet, list level, RTL) and its last run ends it
// with `breakLine`. Only the first run carries them because pptxgenjs starts a new paragraph at every run with a
// bullet; buildPptx then drops the per-run <a:pPr> copies pptxgenjs writes (normalizePptxParagraphs).
//
// Line spacing: CSS line-height 1.2 is what PowerPoint calls single spacing (pptxtojson's README says the same of its
// singleLineSpacingFactor), so a stored line height L is written as the multiple L / 1.2. The .pptx import must read
// it back with singleLineSpacingFactor: SINGLE_LINE_HEIGHT in its parse options (lib/slides/import/pipeline.ts);
// roundtrip.test.ts pins the pair. Every paragraph carries its spacing, also single: the import lets paragraphs
// without one inherit the text's most common spacing, which would move a default paragraph next to a 1.5 one.
//
// Font names go into a typeface="…" attribute that pptxgenjs does not escape (pptxFontFace).
import type { JSONContent } from "@tiptap/core";
import type PptxGenJS from "pptxgenjs";

import { firstFontFamily, pptxHex } from "@/lib/slides/export/render-rules";
import { safeColor, safeHref } from "@/lib/slides/model/safe-values";
import { sanitizeFontRef } from "@/lib/slides/model/sanitize-parts";
import type { ColorValue, TextDefaults, ThemeSpec } from "@/lib/slides/model/types";
import { resolveFont } from "@/lib/slides/themes/themes";
import { paragraphDir, paragraphLineHeight, paragraphSpace } from "@/lib/slides/text/paragraph-attrs";
import { textJsonToPlain } from "@/lib/slides/text/plain";
import { slideFontSizePt } from "@/lib/slides/text/slide-font-size";

type Run = PptxGenJS.TextProps;
type RunOptions = PptxGenJS.TextPropsOptions;

export interface TextRunOptions {
  /** Autofit shrink of the element (box.fontScale): baked into every font size. */
  fontScale?: number;
  /** The element's link: given to every run without a link of its own (a shape-level link on addText is broken in pptxgenjs 4.0.1). */
  link?: string;
  /** Overrides of the defaults' colour and weight (table header cells). */
  color?: ColorValue;
  bold?: boolean;
}

/** CSS line-height of PowerPoint's single line spacing. */
export const SINGLE_LINE_HEIGHT = 1.2;

/** A line height as PowerPoint's spacing multiple; 5 decimals, the precision pptxgenjs writes (spcPct val = × 100000). */
export function pptxLineSpacing(lineHeight: number): number {
  return Math.round((lineHeight / SINGLE_LINE_HEIGHT) * 100_000) / 100_000;
}

/** Characters that would break the unescaped typeface="…" attribute pptxgenjs writes. */
const XML_UNSAFE = /["&<>\p{Cc}]/gu;

/** The first family of a font stack as a pptxgenjs fontFace / theme font: never XML-special, never empty. */
export function pptxFontFace(stack: string): string {
  const name = firstFontFamily(stack).replace(/\s+/g, " ").replace(XML_UNSAFE, "").trim();
  return name === "" ? "Arial" : name;
}

const ALIGNS = new Set(["left", "center", "right", "justify"]);
const NUMBER_STYLES: Readonly<Record<string, string>> = {
  "1": "arabicPeriod",
  a: "alphaLcPeriod",
  A: "alphaUcPeriod",
  i: "romanLcPeriod",
  I: "romanUcPeriod",
};
/** Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, … and their presentation forms. */
const RTL_BLOCK = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LETTER = /\p{L}/u;

/** True when the first strongly directional character of `text` is right-to-left. */
export function firstStrongIsRtl(text: string): boolean {
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    return RTL_BLOCK.test(ch);
  }
  return false;
}

type Bullet = RunOptions["bullet"];

interface Ctx {
  defaults: TextDefaults;
  theme: ThemeSpec;
  opts: TextRunOptions;
  out: Run[];
}

function attrsOf(node: JSONContent): Record<string, unknown> {
  return node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {};
}

function childrenOf(node: JSONContent): JSONContent[] {
  return Array.isArray(node.content) ? node.content.filter((c): c is JSONContent => !!c && typeof c === "object") : [];
}

function markAttrs(marks: readonly unknown[], type: string): Record<string, unknown> | null {
  for (const mark of marks) {
    if (mark && typeof mark === "object" && (mark as { type?: unknown }).type === type) {
      const attrs = (mark as { attrs?: unknown }).attrs;
      return attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : {};
    }
  }
  return null;
}

/** Run options for a text node's marks on top of the element defaults. */
function runStyle(marks: readonly unknown[], ctx: Ctx): RunOptions {
  const { defaults, theme, opts } = ctx;
  const has = (type: string) => markAttrs(marks, type) !== null;
  const style = markAttrs(marks, "textStyle") ?? {};
  const color = safeColor(style.color) ?? opts.color ?? defaults.color;
  const font = sanitizeFontRef(style.fontFamily) ?? defaults.font;
  const size = (slideFontSizePt(style.fontSize) ?? defaults.size) * (opts.fontScale ?? 1);
  const run: RunOptions = {
    color: pptxHex(color, theme),
    fontFace: pptxFontFace(resolveFont(font, theme)),
    fontSize: Math.round(size * 10) / 10,
  };
  if (has("bold") || (opts.bold ?? defaults.bold)) run.bold = true;
  if (has("italic")) run.italic = true;
  if (has("strike")) run.strike = "sngStrike";
  if (has("subscript")) run.subscript = true;
  else if (has("superscript")) run.superscript = true;
  const highlight = markAttrs(marks, "highlight");
  if (highlight) run.highlight = pptxHex(safeColor(highlight.color) ?? "#ffff00", theme);
  const linkAttrs = markAttrs(marks, "link");
  const href = linkAttrs && typeof linkAttrs.href === "string" ? safeHref(linkAttrs.href) : safeHref(opts.link ?? "");
  if (href !== "") run.hyperlink = { url: href };
  // pptxgenjs underlines every linked run unless told otherwise; slides show links as the text is styled.
  if (has("underline")) run.underline = { style: "sng" };
  else if (href !== "") run.underline = { style: "none" };
  return run;
}

function paragraphOptions(node: JSONContent, ctx: Ctx, bullet: Bullet, level: number): RunOptions {
  const attrs = attrsOf(node);
  const options: RunOptions = {
    align: typeof attrs.textAlign === "string" && ALIGNS.has(attrs.textAlign) ? (attrs.textAlign as RunOptions["align"]) : ctx.defaults.align,
  };
  options.lineSpacingMultiple = pptxLineSpacing(paragraphLineHeight(attrs.lineHeight) ?? ctx.defaults.lineHeight);
  const before = paragraphSpace(attrs.spaceBefore);
  const after = paragraphSpace(attrs.spaceAfter);
  if (before) options.paraSpaceBefore = before;
  if (after) options.paraSpaceAfter = after;
  if (bullet) options.bullet = bullet;
  if (level > 0) options.indentLevel = level;
  const dir = paragraphDir(attrs.dir);
  if (dir === "rtl" || (dir === null && firstStrongIsRtl(textJsonToPlain(node)))) options.rtlMode = true;
  return options;
}

function emitParagraph(node: JSONContent, ctx: Ctx, bullet: Bullet, level: number): void {
  const runs: Run[] = [];
  let softBreak = false;
  for (const child of childrenOf(node)) {
    if (child.type === "hardBreak") {
      softBreak = true;
      continue;
    }
    const text = child.type === "text" ? (typeof child.text === "string" ? child.text : "") : textJsonToPlain(child);
    const style = runStyle(Array.isArray(child.marks) ? child.marks : [], ctx);
    text.split("\n").forEach((part, i) => {
      const breakBefore = softBreak || i > 0;
      softBreak = false;
      if (part === "" && !breakBefore) return;
      // pptxgenjs writes <a:br/> only before a paragraph's second or later run, so a leading break needs a carrier.
      if (breakBefore && runs.length === 0) runs.push({ text: "", options: { ...style } });
      runs.push({ text: part, options: breakBefore ? { ...style, softBreakBefore: true } : { ...style } });
    });
  }
  // An empty paragraph keeps its line with an empty run; a trailing hard break adds an empty line, as on screen.
  const plain = runStyle([], ctx);
  if (runs.length === 0) runs.push({ text: "", options: { ...plain } });
  if (softBreak) runs.push({ text: "", options: { ...plain, softBreakBefore: true } });
  // Empty runs write no <a:r>, so a link on them would only add an unused relationship.
  for (const run of runs) {
    if (run.text === "" && run.options?.hyperlink) {
      const options = { ...run.options };
      delete options.hyperlink;
      delete options.underline;
      run.options = options;
    }
  }
  runs[0].options = { ...runs[0].options, ...paragraphOptions(node, ctx, bullet, level) };
  runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: true };
  ctx.out.push(...runs);
}

function emitList(node: JSONContent, ctx: Ctx, level: number): void {
  const ordered = node.type === "orderedList";
  const attrs = attrsOf(node);
  const start = typeof attrs.start === "number" && Number.isFinite(attrs.start) ? Math.max(1, Math.floor(attrs.start)) : 1;
  const style = typeof attrs.type === "string" ? NUMBER_STYLES[attrs.type] : undefined;
  const bullet: Bullet = ordered ? { type: "number", numberStartAt: start, style: style ?? "arabicPeriod" } : true;
  for (const item of childrenOf(node)) {
    let first = true;
    for (const child of childrenOf(item)) {
      if (child.type === "bulletList" || child.type === "orderedList") emitList(child, ctx, level + 1);
      else emitBlock(child, ctx, first ? bullet : undefined, level);
      first = false;
    }
  }
}

function emitBlock(node: JSONContent, ctx: Ctx, bullet: Bullet, level: number): void {
  if (node.type === "paragraph") return emitParagraph(node, ctx, bullet, level);
  if (node.type === "bulletList" || node.type === "orderedList") return emitList(node, ctx, level);
  // Unknown (newer) block: its blocks when it has any, else its text as one paragraph.
  const children = childrenOf(node);
  if (children.some((c) => c.type !== "text" && c.type !== "hardBreak")) {
    for (const child of children) emitBlock(child, ctx, undefined, level);
    return;
  }
  emitParagraph({ type: "paragraph", content: [{ type: "text", text: textJsonToPlain(node) }] }, ctx, bullet, level);
}

/** The runs of a slide text for addText / a table cell; never empty (an empty text is one empty paragraph). */
export function textJsonToRuns(json: JSONContent, defaults: TextDefaults, theme: ThemeSpec, opts: TextRunOptions = {}): Run[] {
  const ctx: Ctx = { defaults, theme, opts, out: [] };
  const blocks = json && json.type === "doc" ? childrenOf(json) : json ? [json] : [];
  for (const block of blocks) emitBlock(block, ctx, undefined, 0);
  if (ctx.out.length === 0) emitParagraph({ type: "paragraph" }, ctx, undefined, 0);
  return ctx.out;
}

/** The same runs as table-cell text (pptxgenjs builds cell text with the same paragraph logic). */
export function runsToCellText(runs: readonly Run[]): PptxGenJS.TableCell[] {
  return runs.map((run) => ({ text: run.text, options: run.options }));
}
