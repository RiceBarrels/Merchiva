/**
 * DOCX export (docs-editor-ui spec §6.2) with `docx@9`: editor JSON (the Tiptap schema from
 * lib/docs/editor-extensions.ts) → a native OOXML document. Loaded on demand by `exportDocument("docx")`.
 *
 * Covered: page setup (paper size, orientation, margins) and headers/footers with page-number fields, paragraphs
 * (alignment, left / right / first-line indent, line spacing, title/subtitle), headings 1–3, bold / italic / underline /
 * strike / code / sub / superscript / text colour / font / size / highlight, links, hard breaks, bullet and numbered
 * lists (nested; every numbered list counts from its own `start`), task lists (checkbox content controls), tables (header row,
 * col/row spans, column widths), images (fetched first, scaled to the text width), horizontal rules, page breaks,
 * blockquotes and code blocks. Comment marks are dropped. Images that can't be fetched become a linked label.
 *
 * Pure apart from `fetchImage`, so it runs under Bun tests with JSON fixtures.
 */
import {
  AlignmentType,
  BorderStyle,
  CheckBox,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
  type IParagraphOptions,
  type ISectionOptions,
  type ParagraphChild,
} from "docx";
import type { JSONContent } from "@tiptap/core";

import { normalizeHex } from "@/lib/docs/colors";
import { firstFontFamily, parseFontSizePt } from "@/lib/docs/fonts";
import type { HeaderFooterVariant } from "@/lib/docs/header-footer";
import { EMPTY_HEADER_FOOTER, type HeaderFooterContent } from "@/lib/docs/header-footer-content";
import { defaultPageSetup, inToTwips, pageSizeIn, TWIPS_PER_INCH, type DocPageSetup } from "@/lib/docs/page-setup";

import type { DocxImage } from "./images";

export interface PmJsonToDocxOptions {
  title: string;
  /** Paper size, orientation and margins; defaults to Letter when omitted (tests, legacy callers). */
  pageSetup?: DocPageSetup;
  /** Header/footer content per variant; empty boxes are left out of the section. */
  headerFooter?: HeaderFooterContent;
  /** Resolves embeddable image bytes, or null when the image can't be read (CORS, network, format). */
  fetchImage(src: string): Promise<DocxImage | null>;
  /** Linked text written in place of an image that couldn't be embedded. Default `[image]`. */
  imageLabel?: string;
}

export interface PmJsonToDocxResult {
  blob: Blob;
  skippedImages: number;
}

/** Block `indent` attribute step (0.5in) and list level step. */
const INDENT_STEP_TWIPS = 720;
const TWIPS_PER_PX = 15;
const IMAGE_FETCH_CONCURRENCY = 4;

const BULLET_REFERENCE = "doc-bullet";
const DECIMAL_REFERENCE = "doc-decimal";
const LIST_LEVELS = 9;
/** Word's largest `w:start` value. */
const MAX_LIST_START = 32767;

const RTL_STRONG_RE = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
const LTR_STRONG_RE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ㐀-鿿가-힯]/;

type Mark = NonNullable<JSONContent["marks"]>[number];
type BlockChild = Paragraph | Table;
type Alignment = NonNullable<IParagraphOptions["alignment"]>;

const ALIGNMENT: Readonly<Record<string, Alignment>> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const HEADING: Readonly<Record<number, NonNullable<IParagraphOptions["heading"]>>> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  color?: string;
  font?: string;
  size?: number;
  shading?: string;
  link?: string;
}

interface NumberingRef {
  reference: string;
  instance: number;
}

interface WalkContext {
  /** List nesting depth of the current list item (0 = top level). */
  depth: number;
  /** Numbering for the next list paragraph; null outside numbered/bulleted lists. */
  numbering: NumberingRef | null;
  /** Instance shared by every list nested inside one top-level list. */
  listInstance: number | null;
  /** Extra left indent (blockquotes, list continuation paragraphs, task items). */
  indentLeft: number;
  /** Left border for blockquote paragraphs. */
  quote: boolean;
  /** Available text width in twips (shrinks inside table cells). */
  widthTwips: number;
}

interface WalkState {
  images: ReadonlyMap<string, DocxImage | null>;
  imageLabel: string;
  skippedImages: number;
  nextInstance: number;
  /** Numbering definitions (reference → levels): the shared bullet/decimal ones plus numbered-list variants. */
  numberingConfigs: Map<string, ILevelsOptions[]>;
}

function attr<T>(node: JSONContent | Mark, key: string): T | undefined {
  const attrs = node.attrs as Record<string, unknown> | undefined;
  return attrs ? (attrs[key] as T | undefined) : undefined;
}

function hexNoHash(value: unknown): string | undefined {
  const hex = normalizeHex(value);
  return hex ? hex.slice(1).toUpperCase() : undefined;
}

function safeLink(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  const trimmed = href.trim();
  return /^(https?:|mailto:|tel:)/i.test(trimmed) ? trimmed : undefined;
}

function runStyle(marks: JSONContent["marks"]): RunStyle {
  const style: RunStyle = {};
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        style.bold = true;
        break;
      case "italic":
        style.italics = true;
        break;
      case "underline":
        style.underline = true;
        break;
      case "strike":
        style.strike = true;
        break;
      case "superscript":
        style.superScript = true;
        break;
      case "subscript":
        style.subScript = true;
        break;
      case "code":
        style.font = "Courier New";
        style.shading = style.shading ?? "F5F5F5";
        break;
      case "highlight":
        style.shading = hexNoHash(attr(mark, "color")) ?? "FEF08A";
        break;
      case "link":
        style.link = safeLink(attr(mark, "href"));
        break;
      case "textStyle": {
        const color = hexNoHash(attr(mark, "color"));
        if (color) style.color = color;
        const font = firstFontFamily(attr<string>(mark, "fontFamily"));
        if (font) style.font = font;
        const pt = parseFontSizePt(attr(mark, "fontSize"));
        if (pt) style.size = Math.max(2, Math.round(pt * 2));
        break;
      }
      default:
        // comment and unknown marks carry no formatting
        break;
    }
  }
  return style;
}

/** Everything but the content, so a page-number field can carry the same formatting as ordinary text. */
function runOptions(style: RunStyle, rtl: boolean) {
  return {
    bold: style.bold,
    italics: style.italics,
    underline: style.underline ? {} : undefined,
    strike: style.strike,
    superScript: style.superScript,
    subScript: style.subScript,
    color: style.color ?? (style.link ? "1F3FAD" : undefined),
    font: style.font,
    size: style.size,
    shading: style.shading ? { type: ShadingType.CLEAR, color: "auto", fill: style.shading } : undefined,
    style: style.link ? "Hyperlink" : undefined,
    rightToLeft: rtl || undefined,
  };
}

function textRun(text: string, style: RunStyle, rtl: boolean): TextRun {
  return new TextRun({ text, ...runOptions(style, rtl) });
}

function plainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(plainText).join("");
}

function isRtl(text: string): boolean {
  for (const ch of text) {
    if (RTL_STRONG_RE.test(ch)) return true;
    if (LTR_STRONG_RE.test(ch)) return false;
  }
  return false;
}

type InlinePiece = { kind: "run"; run: ParagraphChild } | { kind: "link"; href: string; runs: TextRun[] };

function inlineChildren(nodes: readonly JSONContent[] | undefined, rtl: boolean, extra: RunStyle = {}): ParagraphChild[] {
  const pieces: InlinePiece[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "text") {
      const text = node.text ?? "";
      if (!text) continue;
      const style = { ...extra, ...runStyle(node.marks) };
      const lines = text.split("\n");
      lines.forEach((line, index) => {
        if (index > 0) pieces.push({ kind: "run", run: new TextRun({ break: 1 }) });
        if (!line) return;
        const run = textRun(line, style, rtl);
        const last = pieces[pieces.length - 1];
        if (style.link) {
          if (last && last.kind === "link" && last.href === style.link) last.runs.push(run);
          else pieces.push({ kind: "link", href: style.link, runs: [run] });
        } else {
          pieces.push({ kind: "run", run });
        }
      });
    } else if (node.type === "hardBreak") {
      pieces.push({ kind: "run", run: new TextRun({ break: 1 }) });
    } else if (node.type === "pageField") {
      // Word recomputes these on open, so the exported file numbers itself.
      const field = attr<string>(node, "kind") === "pages" ? PageNumber.TOTAL_PAGES : PageNumber.CURRENT;
      pieces.push({ kind: "run", run: new TextRun({ ...runOptions({ ...extra, ...runStyle(node.marks) }, rtl), children: [field] }) });
    } else if (node.content?.length) {
      // Unknown inline wrappers keep their text.
      for (const child of inlineChildren(node.content, rtl, extra)) pieces.push({ kind: "run", run: child });
    }
  }
  return pieces.map((piece) =>
    piece.kind === "run" ? piece.run : new ExternalHyperlink({ link: piece.href, children: piece.runs }),
  );
}

function lineSpacing(value: unknown): IParagraphOptions["spacing"] {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? { line: Math.round(240 * n) } : undefined;
}

function steps(value: unknown, min: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(8, n)) : 0;
}

function blockIndent(node: JSONContent, ctx: WalkContext): number {
  return ctx.indentLeft + steps(attr(node, "indent"), 0) * INDENT_STEP_TWIPS;
}

/** Left / right / first-line indent of a text block, in twips. Word spells a negative first line "hanging". */
function paragraphIndent(node: JSONContent, ctx: WalkContext): IParagraphOptions["indent"] {
  const left = blockIndent(node, ctx);
  const right = steps(attr(node, "indentRight"), 0) * INDENT_STEP_TWIPS;
  const first = steps(attr(node, "indentFirst"), -8) * INDENT_STEP_TWIPS;
  if (left <= 0 && right <= 0 && first === 0) return undefined;
  return {
    ...(left > 0 ? { left } : {}),
    ...(right > 0 ? { right } : {}),
    ...(first > 0 ? { firstLine: first } : first < 0 ? { hanging: -first } : {}),
  };
}

function quoteBorder(ctx: WalkContext): IParagraphOptions["border"] {
  return ctx.quote ? { left: { style: BorderStyle.SINGLE, size: 12, color: "D4D4D4", space: 8 } } : undefined;
}

function takeNumbering(ctx: WalkContext): NumberingRef | null {
  const numbering = ctx.numbering;
  // Only the first paragraph of a list item carries the bullet/number.
  ctx.numbering = null;
  return numbering;
}

function textParagraph(node: JSONContent, ctx: WalkContext, heading?: NonNullable<IParagraphOptions["heading"]>): Paragraph {
  const rtl = isRtl(plainText(node));
  const numbering = takeNumbering(ctx);
  const docStyle = attr<string>(node, "docStyle");
  return new Paragraph({
    children: inlineChildren(node.content, rtl),
    heading,
    style: heading ? undefined : docStyle === "title" ? "Title" : docStyle === "subtitle" ? "Subtitle" : undefined,
    alignment: ALIGNMENT[attr<string>(node, "textAlign") ?? ""],
    spacing: lineSpacing(attr(node, "lineSpacing")),
    indent: numbering ? undefined : paragraphIndent(node, ctx),
    numbering: numbering ? { reference: numbering.reference, level: Math.min(ctx.depth, LIST_LEVELS - 1), instance: numbering.instance } : undefined,
    border: quoteBorder(ctx),
    bidirectional: rtl || undefined,
  });
}

function scaleImage(image: DocxImage, node: JSONContent, maxWidthPx: number): { width: number; height: number } {
  const ratio = image.width > 0 ? image.height / image.width : 0.75;
  const requested = Number.parseFloat(String(attr(node, "width") ?? ""));
  let width = Number.isFinite(requested) && requested > 0 ? requested : image.width || maxWidthPx;
  width = Math.max(1, Math.min(width, maxWidthPx));
  const height = Math.max(1, Math.round(width * (ratio || 0.75)));
  return { width: Math.round(width), height };
}

function imageParagraph(node: JSONContent, ctx: WalkContext, state: WalkState): Paragraph {
  const src = attr<string>(node, "src") ?? "";
  const image = src ? state.images.get(src) : null;
  const alignment = ALIGNMENT[attr<string>(node, "textAlign") ?? ""];
  const indent = ctx.indentLeft > 0 ? { left: ctx.indentLeft } : undefined;
  if (!image) {
    state.skippedImages += 1;
    const label = new TextRun({ text: state.imageLabel, italics: true, style: safeLink(src) ? "Hyperlink" : undefined });
    const link = safeLink(src);
    return new Paragraph({ alignment, indent, children: [link ? new ExternalHyperlink({ link, children: [label] }) : label] });
  }
  const maxWidthPx = Math.max(48, Math.floor((ctx.widthTwips - ctx.indentLeft) / TWIPS_PER_PX));
  return new Paragraph({
    alignment,
    indent,
    children: [new ImageRun({ type: image.type, data: image.data, transformation: scaleImage(image, node, maxWidthPx) })],
  });
}

function codeParagraph(node: JSONContent, ctx: WalkContext): Paragraph {
  const text = plainText(node);
  const children: ParagraphChild[] = [];
  text.split("\n").forEach((line, index) => {
    children.push(
      new TextRun({ text: line, font: "Courier New", size: 20, break: index > 0 ? 1 : undefined }),
    );
  });
  return new Paragraph({
    children,
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "F5F5F5" },
    indent: ctx.indentLeft > 0 ? { left: ctx.indentLeft } : undefined,
    spacing: { after: 120, line: 240 },
  });
}

/** `orderedList.attrs.start` as a Word start value (default 1). */
function listStart(node: JSONContent): number {
  const start = Number(attr(node, "start"));
  return Number.isInteger(start) && start >= 0 ? Math.min(start, MAX_LIST_START) : 1;
}

/**
 * Numbering for one numbered list node. Every `<ol>` counts from its own `start`, as in the editor. Word restarts a
 * level only on a numbering instance that overrides it, and `docx` writes that override for level 0 alone, so:
 * - a top-level list starting at 1 gets a new instance of the shared decimal definition;
 * - a top-level list starting elsewhere gets a new instance of a definition whose level 0 starts there;
 * - a nested list gets its own definition with `start` on its level. Sharing one (as before) let sublists under
 *   different bullet items continue each other's count (a, b, c instead of a, b / a).
 */
function orderedNumbering(state: WalkState, level: number, start: number): NumberingRef {
  if (level === 0 && start === 1) return { reference: DECIMAL_REFERENCE, instance: state.nextInstance++ };
  const instance = state.nextInstance++;
  const reference = level === 0 ? `${DECIMAL_REFERENCE}-start-${start}` : `${DECIMAL_REFERENCE}-list-${instance}`;
  if (!state.numberingConfigs.has(reference)) state.numberingConfigs.set(reference, decimalLevels(level, start));
  return { reference, instance };
}

function listBlocks(node: JSONContent, ctx: WalkContext, state: WalkState, ordered: boolean): BlockChild[] {
  const topLevel = ctx.listInstance === null;
  const depth = topLevel ? 0 : ctx.depth + 1;
  const numbering: NumberingRef = ordered
    ? orderedNumbering(state, Math.min(depth, LIST_LEVELS - 1), listStart(node))
    : // Bullets have no counter: nested bullet lists can share the enclosing list's instance.
      { reference: BULLET_REFERENCE, instance: topLevel ? state.nextInstance++ : (ctx.listInstance as number) };
  const out: BlockChild[] = [];
  for (const item of node.content ?? []) {
    const itemCtx: WalkContext = {
      ...ctx,
      depth,
      listInstance: numbering.instance,
      numbering: { ...numbering },
      // Continuation paragraphs line up with the item text.
      indentLeft: ctx.indentLeft + INDENT_STEP_TWIPS * (depth + 1),
    };
    out.push(...blocks(item.content, itemCtx, state));
  }
  return out;
}

function taskListBlocks(node: JSONContent, ctx: WalkContext, state: WalkState, depth: number): BlockChild[] {
  const out: BlockChild[] = [];
  for (const item of node.content ?? []) {
    const checked = attr(item, "checked") === true;
    const left = ctx.indentLeft + 360 + 360 * depth;
    let first = true;
    for (const child of item.content ?? []) {
      if (first && child.type === "paragraph") {
        first = false;
        const rtl = isRtl(plainText(child));
        out.push(
          new Paragraph({
            children: [new CheckBox({ checked }), new TextRun({ text: " " }), ...inlineChildren(child.content, rtl, checked ? { color: "737373" } : {})],
            indent: { left },
            alignment: ALIGNMENT[attr<string>(child, "textAlign") ?? ""],
            spacing: lineSpacing(attr(child, "lineSpacing")),
            bidirectional: rtl || undefined,
          }),
        );
        continue;
      }
      first = false;
      if (child.type === "taskList") {
        out.push(...taskListBlocks(child, ctx, state, depth + 1));
      } else {
        out.push(...blocks([child], { ...ctx, numbering: null, indentLeft: left + 360 }, state));
      }
    }
  }
  return out;
}

function tableBlock(node: JSONContent, ctx: WalkContext, state: WalkState): Table | null {
  const rows = (node.content ?? []).filter((row) => row.type === "tableRow");
  if (rows.length === 0) return null;
  const columnCount = Math.max(
    1,
    ...rows.map((row) => (row.content ?? []).reduce((sum, cell) => sum + Math.max(1, Number(attr(cell, "colspan")) || 1), 0)),
  );
  const tableWidth = Math.max(TWIPS_PER_INCH, ctx.widthTwips - ctx.indentLeft);

  // Column widths from the first row's `colwidth` attributes (px) when every column has one; else equal columns.
  const firstRowWidths: number[] = [];
  for (const cell of rows[0].content ?? []) {
    const span = Math.max(1, Number(attr(cell, "colspan")) || 1);
    const widths = attr<unknown[]>(cell, "colwidth");
    for (let i = 0; i < span; i++) {
      const px = Array.isArray(widths) ? Number(widths[i]) : Number.NaN;
      firstRowWidths.push(Number.isFinite(px) && px > 0 ? px * TWIPS_PER_PX : Number.NaN);
    }
  }
  let columnWidths: number[];
  if (firstRowWidths.length === columnCount && firstRowWidths.every((w) => Number.isFinite(w))) {
    // Every column was resized in the editor: the table renders at the sum of the widths (capped to the text width).
    const total = firstRowWidths.reduce((sum, w) => sum + w, 0);
    const scale = total > tableWidth ? tableWidth / total : 1;
    columnWidths = firstRowWidths.map((w) => Math.max(240, Math.round(w * scale)));
  } else {
    columnWidths = Array.from({ length: columnCount }, () => Math.floor(tableWidth / columnCount));
  }
  const gridWidth = columnWidths.reduce((sum, w) => sum + w, 0);

  const headerRow = (rows[0].content ?? []).length > 0 && (rows[0].content ?? []).every((cell) => cell.type === "tableHeader");
  const tableRows = rows.map((row, rowIndex) => {
    let columnIndex = 0;
    const cells = (row.content ?? []).map((cell) => {
      const columnSpan = Math.max(1, Number(attr(cell, "colspan")) || 1);
      const rowSpan = Math.max(1, Number(attr(cell, "rowspan")) || 1);
      const width = columnWidths.slice(columnIndex, columnIndex + columnSpan).reduce((sum, w) => sum + w, 0);
      columnIndex += columnSpan;
      const cellCtx: WalkContext = {
        depth: 0,
        numbering: null,
        listInstance: null,
        indentLeft: 0,
        quote: false,
        widthTwips: Math.max(TWIPS_PER_INCH / 2, width - 216),
      };
      const children = blocks(cell.content, cellCtx, state);
      return new TableCell({
        children: children.length > 0 ? children : [new Paragraph({})],
        columnSpan: columnSpan > 1 ? columnSpan : undefined,
        rowSpan: rowSpan > 1 ? rowSpan : undefined,
        width: { size: width, type: WidthType.DXA },
        shading: cell.type === "tableHeader" ? { type: ShadingType.CLEAR, color: "auto", fill: "F5F5F5" } : undefined,
      });
    });
    return new TableRow({ children: cells, tableHeader: headerRow && rowIndex === 0 ? true : undefined });
  });

  return new Table({
    rows: tableRows,
    width: { size: gridWidth, type: WidthType.DXA },
    columnWidths,
    indent: ctx.indentLeft > 0 ? { size: ctx.indentLeft, type: WidthType.DXA } : undefined,
  });
}

function blocks(nodes: readonly JSONContent[] | undefined, ctx: WalkContext, state: WalkState): BlockChild[] {
  const out: BlockChild[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case "paragraph":
        out.push(textParagraph(node, ctx));
        break;
      case "heading": {
        const level = Math.max(1, Math.min(6, Math.trunc(Number(attr(node, "level")) || 1)));
        out.push(textParagraph(node, ctx, HEADING[level]));
        break;
      }
      case "bulletList":
        out.push(...listBlocks(node, ctx, state, false));
        break;
      case "orderedList":
        out.push(...listBlocks(node, ctx, state, true));
        break;
      case "taskList":
        out.push(...taskListBlocks(node, ctx, state, ctx.listInstance === null ? 0 : ctx.depth + 1));
        break;
      case "listItem":
      case "taskItem":
        out.push(...blocks(node.content, ctx, state));
        break;
      case "table": {
        const table = tableBlock(node, ctx, state);
        if (table) out.push(table, new Paragraph({ spacing: { after: 0 } }));
        break;
      }
      case "image":
        out.push(imageParagraph(node, ctx, state));
        break;
      case "horizontalRule":
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D4D4D4", space: 1 } } }));
        break;
      case "pageBreak":
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "blockquote":
        out.push(...blocks(node.content, { ...ctx, indentLeft: ctx.indentLeft + INDENT_STEP_TWIPS, quote: true }, state));
        break;
      case "codeBlock":
        out.push(codeParagraph(node, ctx));
        break;
      default:
        if (node.content?.length) {
          if (node.content.every((child) => child.type === "text" || child.type === "hardBreak")) {
            out.push(textParagraph(node, ctx));
          } else {
            out.push(...blocks(node.content, ctx, state));
          }
        }
        break;
    }
  }
  return out;
}

function collectImageSources(node: JSONContent, into: Set<string>): Set<string> {
  if (node.type === "image") {
    const src = attr<string>(node, "src");
    if (src) into.add(src);
  }
  for (const child of node.content ?? []) collectImageSources(child, into);
  return into;
}

async function fetchImages(sources: readonly string[], fetchImage: PmJsonToDocxOptions["fetchImage"]): Promise<Map<string, DocxImage | null>> {
  const results = new Map<string, DocxImage | null>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < sources.length) {
      const src = sources[cursor++];
      try {
        results.set(src, await fetchImage(src));
      } catch {
        results.set(src, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_FETCH_CONCURRENCY, sources.length) }, worker));
  return results;
}

function bulletLevels(): ILevelsOptions[] {
  const glyphs = ["•", "◦", "▪"];
  return Array.from({ length: LIST_LEVELS }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: glyphs[level % glyphs.length],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: INDENT_STEP_TWIPS * (level + 1), hanging: 360 } } },
  }));
}

/** Decimal / letter / roman levels; `startLevel` (when given) counts from `start`. */
function decimalLevels(startLevel = -1, start = 1): ILevelsOptions[] {
  const formats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  return Array.from({ length: LIST_LEVELS }, (_, level) => ({
    level,
    format: formats[level % formats.length],
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    ...(level === startLevel ? { start } : {}),
    style: { paragraph: { indent: { left: INDENT_STEP_TWIPS * (level + 1), hanging: 360 } } },
  }));
}

/**
 * Header/footer boxes for the section. They use the same walker as the body, so a bold run or a centred paragraph
 * in a header exports exactly like one in the text; only variants with content are emitted, because an empty
 * `w:hdr` would hide the inherited one in Word.
 */
function headerFooterSections(
  content: HeaderFooterContent,
  widthTwips: number,
  state: WalkState,
): Pick<ISectionOptions, "headers" | "footers"> {
  const build = (json: JSONContent | undefined): Paragraph[] | null => {
    if (!json) return null;
    const ctx: WalkContext = { depth: 0, numbering: null, listInstance: null, indentLeft: 0, quote: false, widthTwips };
    const out = blocks(json.type === "doc" ? json.content : [json], ctx, state).filter(
      (child): child is Paragraph => child instanceof Paragraph,
    );
    return out.length > 0 ? out : null;
  };
  const group = <T,>(
    source: Partial<Record<HeaderFooterVariant, JSONContent>>,
    make: (children: Paragraph[]) => T,
  ): Partial<Record<HeaderFooterVariant, T>> | undefined => {
    const out: Partial<Record<HeaderFooterVariant, T>> = {};
    let any = false;
    for (const variant of ["default", "first", "even"] as const) {
      const children = build(source[variant]);
      if (!children) continue;
      out[variant] = make(children);
      any = true;
    }
    return any ? out : undefined;
  };

  return {
    headers: group(content.headers, (children) => new Header({ children })),
    footers: group(content.footers, (children) => new Footer({ children })),
  };
}

/** Builds the `docx` Document (exported for tests; `pmJsonToDocx` packs it). */
export async function buildDocxDocument(
  json: JSONContent,
  o: PmJsonToDocxOptions,
): Promise<{ document: Document; skippedImages: number }> {
  const sources = [...collectImageSources(json, new Set())];
  const images = sources.length > 0 ? await fetchImages(sources, o.fetchImage) : new Map<string, DocxImage | null>();
  const state: WalkState = {
    images,
    imageLabel: o.imageLabel ?? "[image]",
    skippedImages: 0,
    nextInstance: 1,
    numberingConfigs: new Map([
      [BULLET_REFERENCE, bulletLevels()],
      [DECIMAL_REFERENCE, decimalLevels()],
    ]),
  };
  const setup = o.pageSetup ?? defaultPageSetup("en");
  const size = pageSizeIn(setup);
  const page = { width: inToTwips(size.width), height: inToTwips(size.height) };
  const margin = {
    top: inToTwips(setup.margins.top),
    right: inToTwips(setup.margins.right),
    bottom: inToTwips(setup.margins.bottom),
    left: inToTwips(setup.margins.left),
    header: inToTwips(setup.headerDistance),
    footer: inToTwips(setup.footerDistance),
  };
  const ctx: WalkContext = {
    depth: 0,
    numbering: null,
    listInstance: null,
    indentLeft: 0,
    quote: false,
    widthTwips: page.width - margin.left - margin.right,
  };
  const children = blocks(json.type === "doc" ? json.content : [json], ctx, state);
  const headerFooter = o.headerFooter ?? EMPTY_HEADER_FOOTER;
  const boxes = headerFooterSections(headerFooter, page.width - margin.left - margin.right, state);

  const document = new Document({
    creator: "Merchiva",
    title: o.title,
    styles: {
      default: {
        document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { after: 120, line: 276 } } },
        title: { run: { font: "Arial", size: 52, color: "0A0A0A" }, paragraph: { spacing: { after: 60 } } },
        heading1: { run: { font: "Arial", size: 40, color: "0A0A0A" }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true } },
        heading2: { run: { font: "Arial", size: 32, color: "0A0A0A" }, paragraph: { spacing: { before: 280, after: 100 }, keepNext: true } },
        heading3: { run: { font: "Arial", size: 28, bold: true, color: "0A0A0A" }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
        hyperlink: { run: { color: "1F3FAD", underline: {} } },
      },
      paragraphStyles: [
        {
          id: "Subtitle",
          name: "Subtitle",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 30, color: "525252" },
          paragraph: { spacing: { after: 240 } },
        },
      ],
    },
    numbering: {
      config: Array.from(state.numberingConfigs, ([reference, levels]) => ({ reference, levels })),
    },
    evenAndOddHeaderAndFooters: setup.differentOddEven || undefined,
    sections: [
      {
        properties: {
          page: {
            size: { width: page.width, height: page.height, orientation: setup.orientation },
            margin,
          },
          titlePage: setup.differentFirstPage || undefined,
        },
        ...boxes,
        children: children.length > 0 ? children : [new Paragraph({})],
      },
    ],
  });
  return { document, skippedImages: state.skippedImages };
}

export async function pmJsonToDocx(json: JSONContent, o: PmJsonToDocxOptions): Promise<PmJsonToDocxResult> {
  const { document, skippedImages } = await buildDocxDocument(json, o);
  const blob = await Packer.toBlob(document);
  return { blob, skippedImages };
}
