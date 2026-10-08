// Y.Doc → plain model (slides.md §4.1). Readers never write and never throw on bad input: a key that fails
// SLIDES_ID_RE, a value of the wrong Y type or an unknown element type is skipped (never deleted, never rendered);
// scalar fields are validated like any untrusted input (colours, fonts, URLs, clamped numbers). Text is read
// without schema filtering, so content from a newer client still renders as text (§6.4); a text fragment nested
// past SLIDES_MAX_TEXT_DEPTH comes back as its plain text (fragmentToJson). Counts are bounded by the read
// ceilings (SLIDES_READ_MAX_SLIDES, SLIDES_READ_MAX_ELEMENTS): what lies past them stays in the doc, unread.
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import {
  DEFAULT_SLIDE_SIZE, SLIDES_DECK_MAP, SLIDES_ID_RE, SLIDES_MASTERS_MAP, SLIDES_READ_MAX_ELEMENTS,
  SLIDES_READ_MAX_SLIDES, SLIDES_SLIDES_MAP,
} from "@/lib/slides/constants";
import { compareKeyed, isOrderKey } from "@/lib/slides/model/fractional-index";
import {
  asRecord, sanitizeDeckSource, sanitizeFill, sanitizeSize, sanitizeTheme, sanitizeTransition,
} from "@/lib/slides/model/sanitize-parts";
import { parseTableCellKey } from "@/lib/slides/model/sanitize-table";
import { cleanLabel } from "@/lib/slides/model/safe-values";
import type { DeckMeta, DeckSnapshot, Fill, MasterSnapshot, SlideElement, SlideSnapshot } from "@/lib/slides/model/types";
import { sanitizeElementWith } from "@/lib/slides/model/validate";
import { isLayoutKind } from "@/lib/slides/themes/layouts";
import { DEFAULT_THEME_ID, STARTER_THEMES } from "@/lib/slides/themes/themes";
import { blankTextJson, fragmentToJson } from "@/lib/slides/text/fragment";

export function deckMaps(doc: Y.Doc): { deck: Y.Map<unknown>; slides: Y.Map<Y.Map<unknown>>; masters: Y.Map<Y.Map<unknown>> } {
  return {
    deck: doc.getMap<unknown>(SLIDES_DECK_MAP),
    slides: doc.getMap<Y.Map<unknown>>(SLIDES_SLIDES_MAP),
    masters: doc.getMap<Y.Map<unknown>>(SLIDES_MASTERS_MAP),
  };
}

/** Deck meta with defaults for missing keys (a deck without schemaVersion is version 1). */
export function readDeckMeta(deck: Y.Map<unknown>): DeckMeta {
  const version = deck.get("schemaVersion");
  return {
    schemaVersion: typeof version === "number" && Number.isInteger(version) && version >= 1 ? version : 1,
    size: sanitizeSize(deck.get("size"), DEFAULT_SLIDE_SIZE),
    theme: sanitizeTheme(deck.get("theme"), STARTER_THEMES[DEFAULT_THEME_ID]),
    source: sanitizeDeckSource(deck.get("source")),
  };
}

function readText(value: unknown): JSONContent {
  return value instanceof Y.XmlFragment ? fragmentToJson(value) : blankTextJson();
}

/** Text read from Y is already JSON; only guard the shape (no schema filtering on read). */
function keepText(json: unknown): JSONContent {
  return asRecord(json)?.type === "doc" ? (json as JSONContent) : blankTextJson();
}

function readAxis(value: unknown, sizeKey: "h" | "w"): Array<Record<string, unknown>> {
  if (!(value instanceof Y.Map)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const [id, entry] of value.entries()) {
    const r = asRecord(entry);
    if (r && SLIDES_ID_RE.test(id)) out.push({ id, order: r.order, [sizeKey]: r[sizeKey] });
  }
  return out;
}

function readCells(value: unknown): Array<Record<string, unknown>> {
  if (!(value instanceof Y.Map)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const [key, cell] of value.entries()) {
    const ids = parseTableCellKey(key);
    if (!ids || !(cell instanceof Y.Map)) continue;
    out.push({
      ...ids,
      text: readText(cell.get("text")),
      fill: cell.get("fill"),
      rowSpan: cell.get("rowSpan"),
      colSpan: cell.get("colSpan"),
      covered: cell.get("covered"),
      vAlign: cell.get("vAlign"),
    });
  }
  return out;
}

/** null = the id fails SLIDES_ID_RE, the value is not a map, or the type is unknown/invalid (skipped, never deleted). */
export function readElement(id: string, y: Y.Map<unknown>): SlideElement | null {
  if (!SLIDES_ID_RE.test(id) || !(y instanceof Y.Map)) return null;
  const raw: Record<string, unknown> = {};
  for (const [key, value] of y.entries()) if (!(value instanceof Y.AbstractType)) raw[key] = value;
  raw.id = id;
  if (raw.type === "text" || raw.type === "shape") raw.text = readText(y.get("text"));
  if (raw.type === "table") {
    raw.rows = readAxis(y.get("rows"), "h");
    raw.cols = readAxis(y.get("cols"), "w");
    raw.cells = readCells(y.get("cells"));
  }
  return sanitizeElementWith(raw, keepText);
}

function devWarn(message: string): void {
  if (process.env.NODE_ENV === "development") console.warn(`[slides] ${message}`);
}

type Keyed = { key: string; id: string; y: Y.Map<unknown> };

/** The maps under valid ids with their order key (`field`; "" when invalid), sorted by (key, id). */
function keyedEntries<T>(value: Y.Map<T>, field: "order" | "z"): Keyed[] {
  const out: Keyed[] = [];
  for (const [id, y] of value.entries()) {
    if (!SLIDES_ID_RE.test(id) || !(y instanceof Y.Map)) continue;
    const key = y.get(field);
    out.push({ key: isOrderKey(key) ? key : "", id, y });
  }
  return out.sort(compareKeyed);
}

/** The elements of a slide or master, sorted by (z, id); at most SLIDES_READ_MAX_ELEMENTS (the first by z). */
export function readElements(value: unknown): SlideElement[] {
  if (!(value instanceof Y.Map)) return [];
  const entries = keyedEntries(value, "z");
  const out: SlideElement[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (out.length >= SLIDES_READ_MAX_ELEMENTS) {
      devWarn(`read ceiling: ${entries.length - i} elements past the first ${SLIDES_READ_MAX_ELEMENTS} not shown`);
      break;
    }
    const el = readElement(entries[i].id, entries[i].y);
    if (el) out.push(el);
  }
  return out;
}

function readBackground(value: unknown): Fill | null {
  return value === null || value === undefined ? null : sanitizeFill(value);
}

/** null = the id fails SLIDES_ID_RE or the value is not a map (skipped, never deleted). */
export function readSlide(id: string, y: Y.Map<unknown>): SlideSnapshot | null {
  if (!SLIDES_ID_RE.test(id) || !(y instanceof Y.Map)) return null;
  const order = y.get("order");
  const layout = y.get("layout");
  const masterId = y.get("masterId");
  return {
    id,
    order: isOrderKey(order) ? order : "",
    layout: isLayoutKind(layout) ? layout : "blank",
    masterId: typeof masterId === "string" && (masterId === "" || SLIDES_ID_RE.test(masterId)) ? masterId : "",
    hidden: y.get("hidden") === true,
    background: readBackground(y.get("background")),
    transition: sanitizeTransition(y.get("transition")),
    notes: readText(y.get("notes")),
    elements: readElements(y.get("elements")),
  };
}

/** An imported master (layout/master decor); null when the id or value is invalid. */
export function readMaster(id: string, y: Y.Map<unknown>): MasterSnapshot | null {
  if (!SLIDES_ID_RE.test(id) || !(y instanceof Y.Map)) return null;
  return {
    id,
    name: cleanLabel(y.get("name"), 200),
    background: readBackground(y.get("background")),
    elements: readElements(y.get("elements")),
  };
}

function fillSrc(fill: Fill | null): string | null {
  return fill?.t === "image" ? fill.src : null;
}

/** Every image URL the deck shows (image elements, image fills, backgrounds), deduped in first-seen order. */
export function collectImageSrcs(snap: DeckSnapshot): string[] {
  const out = new Set<string>();
  const add = (src: string | null) => {
    if (src) out.add(src);
  };
  const addElements = (els: readonly SlideElement[]) => {
    for (const el of els) {
      if (el.type === "image") add(el.src);
      else if (el.type === "text" || el.type === "shape") add(fillSrc(el.fill));
    }
  };
  add(fillSrc(snap.meta.theme.background));
  for (const master of snap.masters) {
    add(fillSrc(master.background));
    addElements(master.elements);
  }
  for (const slide of snap.slides) {
    add(fillSrc(slide.background));
    addElements(slide.elements);
  }
  return [...out];
}

/** The whole deck: masters sorted by id, slides by (order, id); at most SLIDES_READ_MAX_SLIDES (the first by order). */
export function readDeckSnapshot(doc: Y.Doc): DeckSnapshot {
  const maps = deckMaps(doc);
  const masters: MasterSnapshot[] = [];
  for (const [id, y] of maps.masters.entries()) {
    const master = readMaster(id, y);
    if (master) masters.push(master);
  }
  masters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const entries = keyedEntries(maps.slides, "order");
  if (entries.length > SLIDES_READ_MAX_SLIDES) {
    devWarn(`read ceiling: ${entries.length - SLIDES_READ_MAX_SLIDES} slides past the first ${SLIDES_READ_MAX_SLIDES} not shown`);
  }
  const slides: SlideSnapshot[] = [];
  for (const entry of entries.slice(0, SLIDES_READ_MAX_SLIDES)) {
    const slide = readSlide(entry.id, entry.y);
    if (slide) slides.push(slide);
  }
  return { meta: readDeckMeta(maps.deck), masters, slides };
}
