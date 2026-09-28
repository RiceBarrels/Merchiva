// What the text controls show (slides.md §6.2, §7.3): marks, font, size, colours, paragraph settings and link, read
// from the live editor while something is being typed in, else from the stored text of the selected elements. Pure:
// the live editor is reached through a two-method adapter, so both paths are tested without a DOM.
//
// A mark counts as on only when all of the text has it (then the command turns it off, as format-json.ts toggles);
// values (font, size, colours, paragraph settings) come from the first run or paragraph, falling back to the
// element's text defaults, which is what an unstyled run renders with.
import type { JSONContent } from "@tiptap/core";

import type { TextFormatCommand, TextMark } from "@/lib/slides/editor/text-format";
import { safeColor, safeHref } from "@/lib/slides/model/safe-values";
import type { ColorValue, SlideElement, TextDefaults } from "@/lib/slides/model/types";
import { hasMarkEverywhere, type SimpleMark } from "@/lib/slides/text/format-json";
import { paragraphDir, paragraphLineHeight } from "@/lib/slides/text/paragraph-attrs";
import { slideFontSizePt } from "@/lib/slides/text/slide-font-size";

export type TextListKind = "bullet" | "ordered" | "none";

export interface TextFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  superscript: boolean;
  subscript: boolean;
  /** A FontRef (`theme:heading`, `theme:body` or a CSS stack). */
  font: string;
  size: number;
  color: ColorValue;
  highlight: ColorValue | null;
  align: TextDefaults["align"];
  list: TextListKind;
  lineHeight: number;
  dir: "ltr" | "rtl" | null;
  link: string | null;
}

export const TEXT_MARKS: readonly SimpleMark[] = ["bold", "italic", "underline", "strike", "superscript", "subscript"];

/** The live editor as the text controls read it. */
export interface TextEditorReader {
  isActive(name: string): boolean;
  attrs(type: "textStyle" | "highlight" | "link" | "paragraph"): Record<string, unknown>;
}

const ALIGNS: ReadonlySet<string> = new Set(["left", "center", "right", "justify"]);

function align(value: unknown, fallback: TextDefaults["align"]): TextDefaults["align"] {
  return typeof value === "string" && ALIGNS.has(value) ? (value as TextDefaults["align"]) : fallback;
}

function font(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function href(value: unknown): string | null {
  return typeof value === "string" && safeHref(value) !== "" ? value : null;
}

/** State of the text being typed in; `defaults` are the element's (a table's for a cell). */
export function editorTextState(reader: TextEditorReader, defaults: TextDefaults): TextFormatState {
  const style = reader.attrs("textStyle");
  const paragraph = reader.attrs("paragraph");
  return {
    bold: defaults.bold || reader.isActive("bold"),
    italic: reader.isActive("italic"),
    underline: reader.isActive("underline"),
    strike: reader.isActive("strike"),
    superscript: reader.isActive("superscript"),
    subscript: reader.isActive("subscript"),
    font: font(style.fontFamily, defaults.font),
    size: slideFontSizePt(style.fontSize) ?? defaults.size,
    color: safeColor(style.color) ?? defaults.color,
    highlight: safeColor(reader.attrs("highlight").color),
    align: align(paragraph.textAlign, defaults.align),
    list: reader.isActive("bulletList") ? "bullet" : reader.isActive("orderedList") ? "ordered" : "none",
    lineHeight: paragraphLineHeight(paragraph.lineHeight) ?? defaults.lineHeight,
    dir: paragraphDir(paragraph.dir),
    link: href(reader.attrs("link").href),
  };
}

interface TextSource { json: JSONContent; defaults: TextDefaults }

function firstTextNode(node: JSONContent): JSONContent | null {
  if (node.type === "text" && typeof node.text === "string" && node.text.length > 0) return node;
  for (const child of node.content ?? []) {
    const found = firstTextNode(child);
    if (found) return found;
  }
  return null;
}

function firstParagraph(node: JSONContent): JSONContent | null {
  if (node.type === "paragraph") return node;
  for (const child of node.content ?? []) {
    const found = firstParagraph(child);
    if (found) return found;
  }
  return null;
}

function markAttrs(node: JSONContent | null, type: string): Record<string, unknown> {
  return node?.marks?.find((m) => m.type === type)?.attrs ?? {};
}

/** The texts of the selected text boxes and shapes, and of every visible cell of a selected table. */
export function textSources(els: readonly SlideElement[]): TextSource[] {
  return els.flatMap((el): TextSource[] => {
    if (el.type === "text" || el.type === "shape") return [{ json: el.text, defaults: el.textStyle }];
    if (el.type === "table") return el.cells.filter((cell) => !cell.covered).map((cell) => ({ json: cell.text, defaults: el.style.textStyle }));
    return [];
  });
}

/** State of the selected elements' whole text; null when none of them holds text. */
export function elementsTextState(els: readonly SlideElement[]): TextFormatState | null {
  const sources = textSources(els);
  if (sources.length === 0) return null;
  const { json, defaults } = sources[0];
  const run = firstTextNode(json);
  const style = markAttrs(run, "textStyle");
  const paragraph = firstParagraph(json)?.attrs ?? {};
  const all = (mark: SimpleMark) => sources.every((s) => (mark === "bold" && s.defaults.bold) || hasMarkEverywhere(s.json, mark));
  const block = json.content?.[0]?.type;
  return {
    bold: all("bold"),
    italic: all("italic"),
    underline: all("underline"),
    strike: all("strike"),
    superscript: all("superscript"),
    subscript: all("subscript"),
    font: font(style.fontFamily, defaults.font),
    size: slideFontSizePt(style.fontSize) ?? defaults.size,
    color: safeColor(style.color) ?? defaults.color,
    highlight: safeColor(markAttrs(run, "highlight").color),
    align: align(paragraph.textAlign, defaults.align),
    list: block === "bulletList" ? "bullet" : block === "orderedList" ? "ordered" : "none",
    lineHeight: paragraphLineHeight(paragraph.lineHeight) ?? defaults.lineHeight,
    dir: paragraphDir(paragraph.dir),
    link: href(markAttrs(run, "link").href),
  };
}

/**
 * What a mark button sends: the opposite of what it shows, spelled out. A mark shown as on (bold defaults included)
 * is turned off, never toggled by a second reading of the text that could disagree with the button.
 */
export function markToggle(state: TextFormatState, mark: TextMark): TextFormatCommand {
  return { kind: "mark", mark, on: !state[mark] };
}

export function sameTextState(a: TextFormatState | null, b: TextFormatState | null): boolean {
  if (a === null || b === null) return a === b;
  return (Object.keys(a) as (keyof TextFormatState)[]).every((key) => a[key] === b[key]);
}

/**
 * The href a typed link stands for: an http(s) or mailto URL as is, a bare domain or path as https, an e-mail
 * address as mailto; "" when it is none of these (safeHref decides what is allowed).
 */
export function linkHrefFromInput(raw: string): string {
  const value = raw.trim();
  if (value === "") return "";
  const direct = safeHref(value);
  if (direct !== "") return direct;
  if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(value)) return safeHref(`mailto:${value}`);
  if (/^[^\s/:@]+\.[^\s/:@]{2,}(?:[/?#]\S*)?$/.test(value)) return safeHref(`https://${value}`);
  return "";
}
