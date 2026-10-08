// Deck → DocSerialized (slides.md §4.6): the html / plainText / wordCount the provider sends with every compaction
// and version, and the text the server derives the document excerpt from. Pure over the Y.Doc (it only reads), so
// it also runs headless for create and import.
//
// plainText: per slide in deck order, its title (the title placeholder, else the top-most text), then its other
// texts top to bottom and left to right, then its table cells row by row; slides are separated by a blank line.
// The speaker notes of all slides come last, so the 280-character excerpt starts with slide 1's title.
// html: one `<section data-slide="n">` per slide with `<h2>` title, `<p>` lines and an `<aside>` for its notes.
import type * as Y from "yjs";

import { escapeHtml } from "@/lib/docs/export/utils";
import { docWordCount } from "@/lib/docs/text";
import type { DocSerialized } from "@/lib/docs/types";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import type { DeckSnapshot, SlideElement, SlideSnapshot, TableElement, TextElement, ShapeElement } from "@/lib/slides/model/types";
import { isEmptyText, textJsonToPlain } from "@/lib/slides/text/plain";

/** The server clamps html to this many characters (DOC_HTML_MAX_CHARS); we stop at a section boundary before. */
export const SLIDES_HTML_MAX_CHARS = 1_000_000;
/** The server clamps plainText to this many characters (DOC_TEXT_MAX_CHARS). */
export const SLIDES_PLAIN_MAX_CHARS = 200_000;

export interface SlideTexts {
  /** The slide title ("" when the slide has no text). */
  title: string;
  /** Every other text of the slide, one entry per text box or table cell, in reading order. */
  lines: string[];
  /** The speaker notes as plain text. */
  notes: string;
}

type TextCapable = TextElement | ShapeElement;

function isTextCapable(el: SlideElement): el is TextCapable {
  return el.type === "text" || el.type === "shape";
}

/** Top to bottom, then left to right, then by id (a stable reading order). */
function byPosition(a: { x: number; y: number; id: string }, b: { x: number; y: number; id: string }): number {
  return a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function tableCellTexts(table: TableElement): string[] {
  const cells = new Map(table.cells.map((cell) => [`${cell.rowId}:${cell.colId}`, cell]));
  const out: string[] = [];
  for (const row of table.rows) {
    for (const col of table.cols) {
      const cell = cells.get(`${row.id}:${col.id}`);
      if (!cell || cell.covered) continue;
      const text = textJsonToPlain(cell.text).trim();
      if (text !== "") out.push(text);
    }
  }
  return out;
}

/** A slide's text in reading order (the input is reader or sanitizer output, so the text views are safe). */
export function slideTexts(slide: SlideSnapshot): SlideTexts {
  const texts = slide.elements.filter(isTextCapable).filter((el) => !isEmptyText(el.text)).sort(byPosition);
  const title = texts.find((el) => el.placeholder === "title") ?? texts[0] ?? null;
  const lines = texts.filter((el) => el !== title).map((el) => textJsonToPlain(el.text).trim()).filter((s) => s !== "");
  const tables = slide.elements.filter((el): el is TableElement => el.type === "table").sort(byPosition);
  for (const table of tables) lines.push(...tableCellTexts(table));
  return { title: title ? textJsonToPlain(title.text).trim() : "", lines, notes: textJsonToPlain(slide.notes).trim() };
}

/** At most `max` UTF-16 units, never ending inside a surrogate pair. */
function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

function plainOf(slides: readonly SlideTexts[]): string {
  const blocks = slides.map((s) => [s.title, ...s.lines].filter((line) => line !== "").join("\n")).filter((b) => b !== "");
  const notes = slides.map((s) => s.notes).filter((n) => n !== "");
  return clampText([...blocks, ...notes].join("\n\n"), SLIDES_PLAIN_MAX_CHARS);
}

function paragraphs(text: string): string {
  return text.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

/** The pieces of one slide's section, in order (each is well-formed html on its own). */
function sectionPieces(s: SlideTexts): string[] {
  const pieces: string[] = [];
  if (s.title !== "") pieces.push(`<h2>${escapeHtml(s.title.replace(/\s*\n\s*/g, " "))}</h2>`);
  for (const line of s.lines) pieces.push(paragraphs(line));
  if (s.notes !== "") pieces.push(`<aside>${paragraphs(s.notes)}</aside>`);
  return pieces;
}

function htmlOf(slides: readonly SlideTexts[]): string {
  const close = "</section>";
  const parts: string[] = [];
  let used = 0;
  for (let i = 0; i < slides.length; i++) {
    const open = `<section data-slide="${i + 1}">`;
    if (used + open.length + close.length > SLIDES_HTML_MAX_CHARS) break;
    parts.push(open);
    used += open.length;
    let full = false;
    for (const piece of sectionPieces(slides[i])) {
      if (used + piece.length + close.length > SLIDES_HTML_MAX_CHARS) {
        full = true;
        break;
      }
      parts.push(piece);
      used += piece.length;
    }
    parts.push(close);
    used += close.length;
    if (full) break;
  }
  return parts.join("");
}

/** DocSerialized of a deck snapshot (slides in the snapshot's order). */
export function serializeDeckSnapshot(snap: DeckSnapshot): DocSerialized {
  const texts = snap.slides.map(slideTexts);
  const plainText = plainOf(texts);
  return { html: htmlOf(texts), plainText, wordCount: docWordCount(plainText) };
}

/** DocSerialized of the deck in `doc`; registered with `provider.setSerializer(() => serializeDeck(ydoc))`. */
export function serializeDeck(doc: Y.Doc): DocSerialized {
  return serializeDeckSnapshot(readDeckSnapshot(doc));
}
