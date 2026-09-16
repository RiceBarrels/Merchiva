/**
 * One `w:p` → one or more HTML blocks.
 *
 * A paragraph becomes a `<p>`, an `<h1>`–`<h3>` or a list item, carrying the alignment, indent, line spacing and
 * shading from its own `w:pPr` *merged onto* whatever its `w:pStyle` chain contributes — which is where a Word
 * template keeps most of its formatting, and what the old mammoth-based reader threw away.
 *
 * It can produce more than one block because a page break is a block node in the editor: `w:pageBreakBefore` puts
 * one in front, and a `<w:br w:type="page"/>` in the middle of a run splits the paragraph in two. Which list (if
 * any) a paragraph belongs to is decided here but rendered by `blocks.ts`, because nesting needs its neighbours.
 */
import { warnOnce, type RenderContext } from "./context";
import { attributes, PAGE_BREAK_HTML, styleAttribute } from "./emit";
import type { ListEntry } from "./list";
import { numberingLevel } from "./numbering";
import {
  indentSteps,
  mergeParaProps,
  mergeRunProps,
  paragraphStyleString,
  readParaProps,
  readRunProps,
  type ParaProps,
  type RunProps,
} from "./props";
import { renderInline } from "./run";
import { blockKindForOutlineLevel, blockKindForStyle, resolveStyle, type DocxBlockKind } from "./styles";
import { attrAny, child, children, type XmlElement } from "./xml";

/** What a paragraph turned into, before the block walker decides how to join it up. */
export interface ParagraphResult {
  /** A page break the paragraph asked for with `w:pageBreakBefore`, else `""`. */
  readonly before: string;
  /** One finished block per page-break-delimited segment; always at least one. */
  readonly blocks: readonly string[];
  /** Set when the paragraph is a list item; the walker collects consecutive ones. */
  readonly list: Omit<ListEntry, "html"> | null;
}

interface CheckboxControl {
  /** The `w:sdt` whose runs are only the box glyph, so the inline renderer skips it. */
  readonly sdt: XmlElement;
  readonly checked: boolean;
}

/**
 * A Word checkbox content control: the legacy `w:checkBox` form field or the modern `w14:checkbox`. Its own runs
 * draw the box in Wingdings, so the paragraph consumes the control and becomes a task item instead.
 */
function findCheckbox(p: XmlElement): CheckboxControl | null {
  for (const sdt of children(p, "w:sdt")) {
    const props = child(sdt, "w:sdtPr") ?? sdt;
    const box = child(props, "w14:checkbox") ?? child(props, "w:checkBox");
    if (!box) continue;
    const checked = child(box, "w14:checked") ?? child(box, "w:checked");
    if (!checked) return { sdt, checked: false };
    const value = (attrAny(checked, "w14:val", "w:val", "val") ?? "1").trim().toLowerCase();
    return { sdt, checked: value !== "0" && value !== "false" && value !== "off" };
  }
  return null;
}

const HEADING_TAGS: Readonly<Record<string, string>> = { h1: "h1", h2: "h2", h3: "h3" };

/** Opening and closing tags for a paragraph of this kind, with its style and indent attributes. */
function openBlock(kind: DocxBlockKind | null, props: ParaProps, inList: boolean): { open: string; close: string } {
  // A list item takes its indent from the list markup; adding the paragraph's own would double it.
  const style = styleAttribute([paragraphStyleString(props, { skipIndent: inList })]);
  const steps = inList ? 0 : indentSteps(props.indentLeftTwips);
  const indent = steps > 0 ? attributes({ "data-indent": String(steps) }) : "";
  const tag = kind ? HEADING_TAGS[kind] : undefined;
  if (tag) return { open: `<${tag}${style}${indent}>`, close: `</${tag}>` };
  if (kind === "title") return { open: `<p class="doc-title" data-doc-style="title"${style}${indent}>`, close: "</p>" };
  if (kind === "subtitle") return { open: `<p class="doc-subtitle" data-doc-style="subtitle"${style}${indent}>`, close: "</p>" };
  return { open: `<p${style}${indent}>`, close: "</p>" };
}

/** Paragraph properties and the run properties its style contributes, with direct formatting on top. */
function resolveParagraph(p: XmlElement, ctx: RenderContext): { para: ParaProps; run: RunProps } {
  const pPr = child(p, "w:pPr");
  const direct = readParaProps(pPr);
  const fromStyle = resolveStyle(ctx.pkg.styles, direct.styleId);
  const para = mergeParaProps(fromStyle.paraProps, direct);
  // `w:pPr/w:rPr` is the paragraph mark's formatting, which Word also applies to the paragraph's own runs.
  const run = mergeRunProps(fromStyle.runProps, readRunProps(child(pPr, "w:rPr"), ctx.pkg.theme));
  return { para, run };
}

function blockKind(ctx: RenderContext, para: ParaProps): DocxBlockKind | null {
  const fromStyle = blockKindForStyle(ctx.pkg.styles, para.styleId);
  if (fromStyle) return fromStyle;
  // A template's own heading style carries an outline level even when its name says nothing. An *unstyled*
  // paragraph's outline level is not trusted: plenty of templates set one on ordinary body text.
  return para.styleId ? blockKindForOutlineLevel(para.outlineLevel) : null;
}

function listSpec(
  ctx: RenderContext,
  para: ParaProps,
  checkbox: CheckboxControl | null,
): Omit<ListEntry, "html"> | null {
  if (checkbox) {
    return { kind: "task", level: Math.max(0, para.ilvl ?? 0), numId: para.numId ?? 0, start: 1, checked: checkbox.checked };
  }
  if (para.numId === null || para.numId <= 0) return null;
  const ilvl = Math.max(0, para.ilvl ?? 0);
  const level = numberingLevel(ctx.pkg.numbering, para.numId, para.ilvl);
  // A numbered paragraph whose definition is missing is still a list; a bullet loses less than a wrong number.
  if (!level) return { kind: "bullet", level: ilvl, numId: para.numId, start: 1, checked: false };
  return { kind: level.format, level: ilvl, numId: para.numId, start: level.start, checked: level.checked };
}

/** The block a paragraph would become, without rendering it — used to find the document's Title paragraph. */
export function paragraphKind(p: XmlElement, ctx: RenderContext): DocxBlockKind | null {
  return blockKind(ctx, resolveParagraph(p, ctx).para);
}

export function renderParagraph(p: XmlElement, ctx: RenderContext): ParagraphResult {
  const { para, run } = resolveParagraph(p, ctx);
  const checkbox = findCheckbox(p);
  let list = listSpec(ctx, para, checkbox);
  if (list && ctx.zone !== "body") {
    // The header/footer schema has no lists: the text stays as a plain paragraph, the marker doesn't.
    warnOnce(ctx, "header-list");
    list = null;
  }

  const kind = ctx.zone === "body" ? blockKind(ctx, para) : null;
  const segments = renderInline(p, ctx, { base: run, skip: checkbox ? new Set([checkbox.sdt]) : undefined });
  const { open, close } = openBlock(kind, para, list !== null);
  return {
    before: para.pageBreakBefore === true && ctx.zone === "body" ? PAGE_BREAK_HTML : "",
    blocks: segments.map((segment) => `${open}${segment}${close}`),
    list,
  };
}
