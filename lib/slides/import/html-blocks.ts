// pptxtojson HTML → a flat list of styled paragraphs (slides.md §10.1 step 4). The tokens come from
// ./html-tokens.ts; this walks them with a whitelist: `p` (and a few block tags) start paragraphs, `ul` / `ol` / `li`
// give list context, `span` / `sub` / `sup` carry run styles, `a` carries a link target, `br` is a hard break. Any
// other tag is dropped and its text kept. Nothing here decides what is safe to keep: ./html-to-text.ts filters links
// and every value again through the model validators.
import { slideFontSizePt } from "@/lib/slides/text/slide-font-size";

import { firstColorIn, parseCssColor, type ParsedColor } from "./colors";
import { parseStyle, tokenizeHtml } from "./html-tokens";

export type ParagraphAlign = "left" | "center" | "right" | "justify";
export type ListKind = "ul" | "ol";
export type CssLength = { pt: number } | { em: number };

export interface RunStyle {
  color: ParsedColor | null;
  /** The raw CSS font-family value (mapped by the caller). */
  font: string | null;
  size: number | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  script: "sup" | "sub" | null;
}

export type PptxRun = { kind: "text"; text: string; style: RunStyle; href: string | null } | { kind: "break"; style: RunStyle };

export interface PptxParagraph {
  align: ParagraphAlign | null;
  lineHeight: { mult: number } | { pt: number } | null;
  spaceBefore: CssLength | null;
  spaceAfter: CssLength | null;
  /** Enclosing list kinds, outermost first ([] = not in a list). */
  list: ListKind[];
  /** First paragraph of a list item. */
  newItem: boolean;
  runs: PptxRun[];
}

export const PLAIN_STYLE: RunStyle = Object.freeze({
  color: null, font: null, size: null, bold: false, italic: false, underline: false, strike: false, script: null,
});

const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"]);
const STYLE_TAGS = new Set(["span", "sup", "sub", "b", "strong", "i", "em", "u", "s", "strike", "del", "font"]);
const ALIGNS: Readonly<Record<string, ParagraphAlign>> = { left: "left", start: "left", center: "center", right: "right", end: "right", justify: "justify" };
/** A control character a text run may not keep (tabs and newlines already became spaces in pptxtojson). */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function length(value: string | undefined): CssLength | null {
  const match = value ? /^(-?[\d.]+)\s*(pt|px|em)?$/i.exec(value.trim()) : null;
  const n = match ? Number.parseFloat(match[1]) : NaN;
  if (!match || !Number.isFinite(n) || n <= 0) return null;
  return match[2]?.toLowerCase() === "em" ? { em: n } : { pt: n };
}

function lineHeight(value: string | undefined): PptxParagraph["lineHeight"] {
  if (!value) return null;
  const match = /^([\d.]+)\s*(pt|px|%)?$/i.exec(value.trim());
  const n = match ? Number.parseFloat(match[1]) : NaN;
  if (!match || !Number.isFinite(n) || n <= 0) return null;
  const unit = match[2]?.toLowerCase();
  if (unit === "%") return { mult: n / 100 };
  return unit ? { pt: n } : { mult: n };
}

/** `base` with the declarations of one inline style attribute applied. */
export function applyRunStyle(base: RunStyle, style: string | undefined, tag = "span"): RunStyle {
  const next: RunStyle = { ...base };
  if (tag === "sup") next.script = "sup";
  else if (tag === "sub") next.script = "sub";
  else if (tag === "b" || tag === "strong") next.bold = true;
  else if (tag === "i" || tag === "em") next.italic = true;
  else if (tag === "u") next.underline = true;
  else if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  const css = parseStyle(style);
  const clip = css.get("background-clip") ?? css.get("-webkit-background-clip");
  const gradient = clip?.includes("text") ? (css.get("background") ?? css.get("background-image")) : undefined;
  const color = gradient ? firstColorIn(gradient) : parseCssColor(css.get("color"));
  if (color && color.alpha > 0) next.color = color;
  const size = slideFontSizePt(css.get("font-size"));
  if (size !== null) next.size = size;
  const font = css.get("font-family");
  if (font) next.font = font;
  const weight = css.get("font-weight")?.toLowerCase();
  if (weight) next.bold = weight === "bold" || weight === "bolder" || Number.parseInt(weight, 10) >= 600;
  const fontStyle = css.get("font-style")?.toLowerCase();
  if (fontStyle) next.italic = fontStyle === "italic" || fontStyle === "oblique";
  const decoration = `${css.get("text-decoration") ?? ""} ${css.get("text-decoration-line") ?? ""}`.toLowerCase();
  if (decoration.includes("underline")) next.underline = true;
  if (decoration.includes("line-through")) next.strike = true;
  const vertical = css.get("vertical-align")?.toLowerCase();
  if (vertical === "super") next.script = "sup";
  else if (vertical === "sub") next.script = "sub";
  return next;
}

function newParagraph(style: string | undefined, list: ListKind[], newItem: boolean): PptxParagraph {
  const css = parseStyle(style);
  return {
    align: ALIGNS[css.get("text-align")?.toLowerCase() ?? ""] ?? null,
    lineHeight: lineHeight(css.get("line-height")),
    spaceBefore: length(css.get("margin-top")),
    spaceAfter: length(css.get("margin-bottom")),
    list: [...list],
    newItem,
    runs: [],
  };
}

/** The paragraphs of one pptxtojson HTML string (element content, a table cell, speaker notes). */
export function readPptxHtml(html: string): PptxParagraph[] {
  const paragraphs: PptxParagraph[] = [];
  const styles: Array<{ tag: string; style: RunStyle }> = [];
  const links: Array<string | null> = [];
  const lists: ListKind[] = [];
  let pendingItem = false;
  let current: PptxParagraph | null = null;
  const style = () => styles[styles.length - 1]?.style ?? PLAIN_STYLE;
  const start = (attr: string | undefined): PptxParagraph => {
    const para = newParagraph(attr, lists, pendingItem && lists.length > 0);
    pendingItem = false;
    paragraphs.push(para);
    return para;
  };
  for (const token of tokenizeHtml(typeof html === "string" ? html : "")) {
    if (token.t === "text") {
      const text = token.text.replace(CONTROL_RE, "");
      if (text === "") continue;
      // Whitespace between block tags (pretty-printed markup) is not content.
      if (current === null && text.trim() === "") continue;
      current ??= start(undefined);
      current.runs.push({ kind: "text", text, style: style(), href: links[links.length - 1] ?? null });
      continue;
    }
    const name = token.name;
    if (token.t === "open") {
      if (BLOCK_TAGS.has(name)) {
        current = token.selfClosing ? null : start(token.attrs.style);
      } else if (name === "br") {
        current ??= start(undefined);
        current.runs.push({ kind: "break", style: style() });
      } else if (name === "ul" || name === "ol") {
        current = null;
        if (!token.selfClosing) lists.push(name);
      } else if (name === "li") {
        current = null;
        pendingItem = true;
      } else if (STYLE_TAGS.has(name) && !token.selfClosing) {
        styles.push({ tag: name, style: applyRunStyle(style(), token.attrs.style, name) });
      } else if (name === "a" && !token.selfClosing) {
        links.push(typeof token.attrs.href === "string" ? token.attrs.href : null);
      }
      continue;
    }
    if (BLOCK_TAGS.has(name) || name === "li") current = null;
    else if (name === "ul" || name === "ol") {
      current = null;
      const at = lists.lastIndexOf(name);
      if (at >= 0) lists.splice(at);
    } else if (STYLE_TAGS.has(name)) {
      const at = styles.map((s) => s.tag).lastIndexOf(name);
      if (at >= 0) styles.splice(at);
    } else if (name === "a") links.pop();
  }
  return paragraphs;
}
