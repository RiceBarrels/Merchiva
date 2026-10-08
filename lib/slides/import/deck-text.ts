// Deck-wide text handling of an import (slides.md §10.1 steps 3–5): the heading and body fonts (the most common font
// in title placeholders and in all other text; `usedFonts` is only the embedded-font list, F12), the dominant text
// colour, and the text context every element's HTML goes through. Each HTML string is purified and read once.
import type { JSONContent } from "@tiptap/core";

import type { ColorValue, FontRef, TextDefaults } from "@/lib/slides/model/types";

import { parseCssColor } from "./colors";
import { mapFontFamily } from "./fonts";
import type { PptxParagraph } from "./html-blocks";
import {
  domPurifier, dominantTextDefaults, paragraphsToText, readImportHtml, reportingFontResolver, withRunDefaults,
  type FontResolver, type HtmlPurifier,
} from "./html-to-text";
import { arr, records, str } from "./lean";
import { placeholderRoleFromName } from "./map-element";
import type { ImportReportBuilder } from "./report";

export interface TextStats {
  /** Raw font-family value most used in title placeholders ("" = none). */
  headingFont: string;
  /** Raw font-family value most used elsewhere ("" = none). */
  bodyFont: string;
  /** The text colour most used (by characters), or null. */
  textColor: `#${string}` | null;
}

export interface DeckText {
  read(html: unknown): PptxParagraph[];
  /** Every text-bearing HTML string under `elements` (groups, diagrams and tables included). */
  stats(elementLists: ReadonlyArray<readonly unknown[]>): TextStats;
}

/** Nesting deeper than any real file; below it nothing is read. */
const MAX_DEPTH = 16;

function top(weights: ReadonlyMap<string, number>): string {
  let best = "";
  let bestWeight = 0;
  for (const [value, weight] of weights) if (weight > bestWeight) [best, bestWeight] = [value, weight];
  return best;
}

export function createDeckText(report: ImportReportBuilder, purify: HtmlPurifier | null | undefined): DeckText {
  const purifier = purify === undefined ? domPurifier() : purify;
  const cache = new Map<string, PptxParagraph[]>();
  const read = (html: unknown): PptxParagraph[] => {
    const source = str(html);
    if (source === "") return [];
    let paragraphs = cache.get(source);
    if (!paragraphs) {
      paragraphs = readImportHtml(source, report, purifier);
      cache.set(source, paragraphs);
    }
    return paragraphs;
  };
  const stats = (elementLists: ReadonlyArray<readonly unknown[]>): TextStats => {
    const heading = new Map<string, number>();
    const body = new Map<string, number>();
    const colors = new Map<string, number>();
    const count = (html: unknown, title: boolean) => {
      for (const p of read(html)) {
        for (const run of p.runs) {
          if (run.kind !== "text" || run.text.trim() === "") continue;
          const weights = title ? heading : body;
          if (run.style.font) weights.set(run.style.font, (weights.get(run.style.font) ?? 0) + run.text.length);
          if (run.style.color) colors.set(run.style.color.hex, (colors.get(run.style.color.hex) ?? 0) + run.text.length);
        }
      }
    };
    const walk = (elements: readonly unknown[], depth: number) => {
      if (depth > MAX_DEPTH) return;
      for (const el of records(elements)) {
        if (el.type === "group" || el.type === "diagram") walk(arr(el.elements), depth + 1);
        else if (el.type === "text" || el.type === "shape") count(el.content, placeholderRoleFromName(str(el.name)) === "title");
        else if (el.type === "table") for (const row of arr(el.data)) for (const cell of records(row)) count(cell.text, false);
      }
    };
    for (const list of elementLists) walk(list, 0);
    const color = parseCssColor(top(colors));
    return { headingFont: top(heading), bodyFont: top(body), textColor: color ? color.hex : null };
  };
  return { read, stats };
}

/** A font resolver that, when the heading and body fonts are the same stack, prefers one of the two references. */
export type DeckFontResolver = (css: string, prefer?: "heading" | "body") => FontRef | null;

/** The deck's font resolver: mapFontFamily (unknown families reported once), with the theme fonts as references. */
export function deckFontResolver(report: ImportReportBuilder, headingStack: string, bodyStack: string): DeckFontResolver {
  const base = reportingFontResolver(report);
  return (css, prefer = "body") => {
    const stack = base(css);
    if (stack === null) return null;
    const heading = stack === headingStack;
    const body = stack === bodyStack;
    if (heading && (!body || prefer === "heading")) return "theme:heading";
    if (body) return "theme:body";
    return stack as FontRef;
  };
}

/** The CSS stack of a raw font-family value, or "" (no report: the theme fonts are reported when text uses them). */
export function fontStack(css: string): string {
  return css === "" ? "" : mapFontFamily(css).stack;
}

export interface ElementTextContext {
  text(html: unknown, base: TextDefaults): { text: JSONContent; style: TextDefaults };
  texts(items: ReadonlyArray<{ html: unknown; color?: unknown; bold?: boolean }>, base: TextDefaults): { texts: JSONContent[]; style: TextDefaults };
}

/**
 * Text of elements: the text defaults are what most of the element's text uses (marks then hold only the
 * differences), and a literal colour equal to the theme's text colour is stored as `theme:text`.
 */
export function elementTextContext(deck: DeckText, report: ImportReportBuilder, resolve: DeckFontResolver, themeText: string): ElementTextContext {
  const color = (hex: `#${string}`): ColorValue => (hex === themeText ? "theme:text" : hex);
  const texts: ElementTextContext["texts"] = (items, base) => {
    // Title text prefers the heading font where the deck uses one font for both.
    const prefer = base.font === "theme:heading" ? "heading" : "body";
    const fonts: FontResolver = (css) => resolve(css, prefer);
    const baked = items.map((item) => {
      const cellColor = parseCssColor(item.color);
      return withRunDefaults(deck.read(item.html), { color: cellColor, bold: item.bold === true });
    });
    const style = dominantTextDefaults(baked.flat(), base, { fonts, color });
    return { texts: baked.map((paragraphs) => paragraphsToText(paragraphs, { report, defaults: style, fonts, color })), style };
  };
  return {
    texts,
    text(html, base) {
      const { texts: [text], style } = texts([{ html }], base);
      return { text, style };
    },
  };
}
