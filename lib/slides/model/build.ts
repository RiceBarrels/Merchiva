// Plain model → Y structures (slides.md §4.1). Every element goes through sanitizeElement and every text through
// sanitizeTextJson first, so a deck built here holds nothing a reader would reject and nothing y-tiptap would
// delete. The *ToY functions return PRELIM maps (not yet in a doc) with their text fragments already seeded;
// inserting one into a live map integrates it in the same transaction.
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import {
  DEFAULT_SLIDE_SIZE, SLIDES_ID_RE, SLIDES_MAX_ELEMENTS_PER_SLIDE, SLIDES_MAX_SLIDES, SLIDES_SCHEMA_VERSION,
  SLIDES_SILENT_ORIGIN,
} from "@/lib/slides/constants";
import { isOrderKey } from "@/lib/slides/model/fractional-index";
import { deckMaps } from "@/lib/slides/model/read";
import { cleanLabel } from "@/lib/slides/model/safe-values";
import {
  sanitizeDeckSource, sanitizeFill, sanitizeSize, sanitizeTheme, sanitizeTransition, sanitizeVAlign,
} from "@/lib/slides/model/sanitize-parts";
import { tableCellKey } from "@/lib/slides/model/sanitize-table";
import type { DeckSnapshot, MasterSnapshot, SlideElement, SlideSnapshot, TableCellSnapshot } from "@/lib/slides/model/types";
import { sanitizeElement, sanitizeTextJson } from "@/lib/slides/model/validate";
import { isLayoutKind } from "@/lib/slides/themes/layouts";
import { DEFAULT_THEME_ID, STARTER_THEMES } from "@/lib/slides/themes/themes";
import { prelimTextFragment, seedBlankParagraph } from "@/lib/slides/text/fragment";

/** Keys an element map stores as nested Y types (everything else is a JSON value). */
const NESTED_KEYS = new Set(["id", "text", "rows", "cols", "cells"]);

function isBlankCanonical(json: JSONContent): boolean {
  const only = json.content?.length === 1 ? json.content[0] : null;
  return only !== null && only.type === "paragraph" && only.attrs === undefined && only.content === undefined;
}

/** A prelim fragment holding already-sanitized text; a blank text is seeded yjs-only (one bare paragraph). */
function textFragment(clean: JSONContent): Y.XmlFragment {
  if (!isBlankCanonical(clean)) return prelimTextFragment(clean);
  const fragment = new Y.XmlFragment();
  seedBlankParagraph(fragment);
  return fragment;
}

/** An empty table cell (text seeded with one paragraph). */
export function blankTableCell(rowId: string, colId: string): TableCellSnapshot {
  return {
    rowId,
    colId,
    text: { type: "doc", content: [{ type: "paragraph" }] },
    fill: null,
    rowSpan: 1,
    colSpan: 1,
    covered: false,
    vAlign: "top",
  };
}

/** Prelim map of one table cell: { text, fill, rowSpan, colSpan, covered, vAlign }. */
export function tableCellToY(cell: TableCellSnapshot): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("text", textFragment(sanitizeTextJson(cell.text)));
  map.set("fill", cell.fill);
  map.set("rowSpan", cell.rowSpan);
  map.set("colSpan", cell.colSpan);
  map.set("covered", cell.covered);
  map.set("vAlign", sanitizeVAlign(cell.vAlign));
  return map;
}

/** Prelim element map (the id is the key it is stored under, not a field). Throws for an invalid element. */
export function elementToY(el: SlideElement): Y.Map<unknown> {
  const clean = sanitizeElement(el);
  if (!clean) throw new Error("[slides] elementToY: not a valid slide element");
  return cleanElementToY(clean);
}

function cleanElementToY(clean: SlideElement): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(clean)) if (!NESTED_KEYS.has(key)) map.set(key, value);
  if (clean.type === "text" || clean.type === "shape") map.set("text", textFragment(clean.text));
  if (clean.type === "table") {
    const rows = new Y.Map<unknown>();
    for (const row of clean.rows) rows.set(row.id, { order: row.order, h: row.h });
    const cols = new Y.Map<unknown>();
    for (const col of clean.cols) cols.set(col.id, { order: col.order, w: col.w });
    // Cells are created eagerly for the whole grid; missing ones start empty.
    const given = new Map(clean.cells.map((cell) => [tableCellKey(cell.rowId, cell.colId), cell]));
    const cells = new Y.Map<Y.Map<unknown>>();
    for (const row of clean.rows) {
      for (const col of clean.cols) {
        const key = tableCellKey(row.id, col.id);
        cells.set(key, tableCellToY(given.get(key) ?? blankTableCell(row.id, col.id)));
      }
    }
    map.set("rows", rows);
    map.set("cols", cols);
    map.set("cells", cells);
  }
  return map;
}

/** Prelim map of element maps keyed by id; invalid and over-cap elements are dropped. */
function elementsToY(elements: readonly SlideElement[]): Y.Map<Y.Map<unknown>> {
  // A prelim map can't be read (Yjs warns), so the cap is counted here.
  const map = new Y.Map<Y.Map<unknown>>();
  const ids = new Set<string>();
  for (const el of elements) {
    const clean = sanitizeElement(el);
    if (!clean || (ids.size >= SLIDES_MAX_ELEMENTS_PER_SLIDE && !ids.has(clean.id))) continue;
    ids.add(clean.id);
    map.set(clean.id, cleanElementToY(clean));
  }
  return map;
}

/** Prelim slide map (the slide id is its key in "slides:slides"). */
export function slideToY(s: SlideSnapshot): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("order", isOrderKey(s.order) ? s.order : "");
  map.set("layout", isLayoutKind(s.layout) ? s.layout : "blank");
  map.set("masterId", typeof s.masterId === "string" && (s.masterId === "" || SLIDES_ID_RE.test(s.masterId)) ? s.masterId : "");
  map.set("hidden", s.hidden === true);
  map.set("background", s.background === null ? null : sanitizeFill(s.background));
  map.set("transition", sanitizeTransition(s.transition));
  map.set("notes", textFragment(sanitizeTextJson(s.notes)));
  map.set("elements", elementsToY(s.elements));
  return map;
}

/** Prelim master map (imported layout/master decor). */
export function masterToY(m: MasterSnapshot): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("name", cleanLabel(m.name, 200));
  map.set("background", m.background === null ? null : sanitizeFill(m.background));
  map.set("elements", elementsToY(m.elements));
  return map;
}

/** Writes a whole deck into an EMPTY doc (create/import), in one silent transaction. Throws if the doc has a deck. */
export function writeDeckSnapshot(doc: Y.Doc, snap: DeckSnapshot): void {
  const { deck, slides, masters } = deckMaps(doc);
  if (deck.size > 0 || slides.size > 0 || masters.size > 0) throw new Error("[slides] writeDeckSnapshot needs an empty doc");
  doc.transact(() => {
    deck.set("schemaVersion", SLIDES_SCHEMA_VERSION);
    deck.set("size", sanitizeSize(snap.meta.size, DEFAULT_SLIDE_SIZE));
    deck.set("theme", sanitizeTheme(snap.meta.theme, STARTER_THEMES[DEFAULT_THEME_ID]));
    deck.set("source", sanitizeDeckSource(snap.meta.source));
    for (const master of snap.masters) if (SLIDES_ID_RE.test(master.id)) masters.set(master.id, masterToY(master));
    let count = 0;
    for (const slide of snap.slides) {
      if (count >= SLIDES_MAX_SLIDES) break;
      if (!SLIDES_ID_RE.test(slide.id)) continue;
      slides.set(slide.id, slideToY(slide));
      count += 1;
    }
  }, SLIDES_SILENT_ORIGIN);
}

/** `Y.encodeStateAsUpdate` of a fresh doc holding `snap` (the initial state of a new deck). */
export function buildDeckState(snap: DeckSnapshot): Uint8Array {
  const doc = new Y.Doc();
  try {
    writeDeckSnapshot(doc, snap);
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

/** The largest Yjs client id (a random one is a uint32), whose varint takes the most bytes (5). */
const WIDEST_CLIENT_ID = 0xffffffff;

/**
 * The most bytes buildDeckState(snap) can produce. An update writes the doc's client id as a varint wherever it
 * names an item, so a build's size depends on its random client id (1–5 bytes each time); this encodes the same
 * deck under the widest one, an upper bound that is the same on every call.
 */
export function deckStateMaxBytes(snap: DeckSnapshot): number {
  const doc = new Y.Doc();
  doc.clientID = WIDEST_CLIENT_ID;
  try {
    writeDeckSnapshot(doc, snap);
    return Y.encodeStateAsUpdate(doc).byteLength;
  } finally {
    doc.destroy();
  }
}
