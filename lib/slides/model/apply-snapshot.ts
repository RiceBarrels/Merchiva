// Diff-apply of a whole deck (slides.md §4.9): version restore writes the target state into the live doc as one
// ordinary, undoable edit. Ids are kept: slides, masters, elements, rows, columns and cells missing from the target
// are deleted, new ones created, and existing ones patched key by key (a key is set only when its value differs).
// An element whose type changed is replaced. Texts are diff-updated with updateYFragment, and only when their
// content differs, so collaborators receive a normal (minimal) update and restoring the current state writes nothing.
// Entries under keys that fail SLIDES_ID_RE are left alone, as every reader leaves them.
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import {
  DEFAULT_SLIDE_SIZE, SLIDES_ID_RE, SLIDES_MAX_ELEMENTS_PER_SLIDE, SLIDES_MAX_SLIDES, SLIDES_SCHEMA_VERSION,
} from "@/lib/slides/constants";
import { blankTableCell, elementToY, masterToY, slideToY, tableCellToY } from "@/lib/slides/model/build";
import { isOrderKey } from "@/lib/slides/model/fractional-index";
import { sameJson, setIfChanged, transactSlides } from "@/lib/slides/model/ops-slides";
import { deckMaps } from "@/lib/slides/model/read";
import {
  sanitizeDeckSource, sanitizeFill, sanitizeSize, sanitizeTheme, sanitizeTransition, sanitizeVAlign,
} from "@/lib/slides/model/sanitize-parts";
import { parseTableCellKey, tableCellKey } from "@/lib/slides/model/sanitize-table";
import { cleanLabel } from "@/lib/slides/model/safe-values";
import type { DeckMeta, DeckSnapshot, MasterSnapshot, SlideElement, SlideSnapshot, TableElement } from "@/lib/slides/model/types";
import { sanitizeElement, sanitizeTextJson } from "@/lib/slides/model/validate";
import { isLayoutKind } from "@/lib/slides/themes/layouts";
import { DEFAULT_THEME_ID, STARTER_THEMES } from "@/lib/slides/themes/themes";
import { fragmentToJson, writeTextJson } from "@/lib/slides/text/fragment";

/** Keys of an element that are nested Y structures (synced separately) or identity. */
const NESTED_KEYS = new Set(["id", "text", "rows", "cols", "cells"]);

/** A Y.Map child of `parent` under `key`, created empty when missing or of the wrong type. */
function childMap(parent: Y.Map<unknown>, key: string): Y.Map<unknown> {
  const existing = parent.get(key);
  if (existing instanceof Y.Map) return existing;
  const map = new Y.Map<unknown>();
  parent.set(key, map);
  return map;
}

/** Deletes the entries under valid ids that `keep` does not list. */
function deleteOthers<T>(map: Y.Map<T>, keep: ReadonlySet<string>, isKey: (key: string) => boolean = (key) => SLIDES_ID_RE.test(key)): void {
  for (const key of [...map.keys()]) if (isKey(key) && !keep.has(key)) map.delete(key);
}

/** Makes the fragment under `key` hold `json` (sanitized), writing only when the content differs. */
function syncText(parent: Y.Map<unknown>, key: string, json: JSONContent): void {
  const clean = sanitizeTextJson(json);
  let fragment = parent.get(key);
  if (fragment instanceof Y.XmlFragment) {
    if (sameJson(fragmentToJson(fragment), clean)) return;
  } else {
    fragment = new Y.XmlFragment();
    parent.set(key, fragment);
  }
  writeTextJson(fragment as Y.XmlFragment, clean);
}

function syncAxis(parent: Y.Map<unknown>, key: "rows" | "cols", entries: ReadonlyArray<[string, Record<string, unknown>]>): void {
  const map = childMap(parent, key);
  deleteOthers(map, new Set(entries.map(([id]) => id)));
  for (const [id, value] of entries) setIfChanged(map, id, value);
}

function syncTable(y: Y.Map<unknown>, el: TableElement): void {
  syncAxis(y, "rows", el.rows.map((r) => [r.id, { order: r.order, h: r.h }]));
  syncAxis(y, "cols", el.cols.map((c) => [c.id, { order: c.order, w: c.w }]));
  const cells = childMap(y, "cells");
  const given = new Map(el.cells.map((cell) => [tableCellKey(cell.rowId, cell.colId), cell]));
  const grid = new Set<string>();
  for (const row of el.rows) {
    for (const col of el.cols) {
      const key = tableCellKey(row.id, col.id);
      grid.add(key);
      const target = given.get(key) ?? blankTableCell(row.id, col.id);
      const existing = cells.get(key);
      if (!(existing instanceof Y.Map)) {
        cells.set(key, tableCellToY(target));
        continue;
      }
      setIfChanged(existing, "fill", target.fill);
      setIfChanged(existing, "rowSpan", target.rowSpan);
      setIfChanged(existing, "colSpan", target.colSpan);
      setIfChanged(existing, "covered", target.covered);
      setIfChanged(existing, "vAlign", sanitizeVAlign(target.vAlign));
      syncText(existing, "text", target.text);
    }
  }
  deleteOthers(cells, grid, (key) => parseTableCellKey(key) !== null);
}

/** Makes an element map equal to `el` (already sanitized, same type). */
function patchElement(y: Y.Map<unknown>, el: SlideElement): void {
  for (const [key, value] of Object.entries(el)) if (!NESTED_KEYS.has(key)) setIfChanged(y, key, value);
  if (el.type === "text" || el.type === "shape") syncText(y, "text", el.text);
  if (el.type === "table") syncTable(y, el);
}

function syncElements(parent: Y.Map<unknown>, elements: readonly SlideElement[]): void {
  const map = childMap(parent, "elements");
  const wanted = new Map<string, SlideElement>();
  for (const raw of elements) {
    const el = sanitizeElement(raw);
    if (el && !wanted.has(el.id) && wanted.size < SLIDES_MAX_ELEMENTS_PER_SLIDE) wanted.set(el.id, el);
  }
  deleteOthers(map, new Set(wanted.keys()));
  for (const [id, el] of wanted) {
    const y = map.get(id);
    if (y instanceof Y.Map && y.get("type") === el.type) patchElement(y, el);
    else map.set(id, elementToY(el));
  }
}

function syncMeta(deck: Y.Map<unknown>, meta: DeckMeta): void {
  if (!deck.has("schemaVersion")) deck.set("schemaVersion", SLIDES_SCHEMA_VERSION);
  setIfChanged(deck, "size", sanitizeSize(meta.size, DEFAULT_SLIDE_SIZE));
  setIfChanged(deck, "theme", sanitizeTheme(meta.theme, STARTER_THEMES[DEFAULT_THEME_ID]));
  setIfChanged(deck, "source", sanitizeDeckSource(meta.source));
}

function syncMasters(masters: Y.Map<Y.Map<unknown>>, targets: readonly MasterSnapshot[]): void {
  const wanted = new Map(targets.filter((m) => SLIDES_ID_RE.test(m.id)).map((m) => [m.id, m]));
  deleteOthers(masters, new Set(wanted.keys()));
  for (const [id, m] of wanted) {
    const y = masters.get(id);
    if (!(y instanceof Y.Map)) {
      masters.set(id, masterToY(m));
      continue;
    }
    setIfChanged(y, "name", cleanLabel(m.name, 200));
    setIfChanged(y, "background", m.background === null ? null : sanitizeFill(m.background));
    syncElements(y, m.elements);
  }
}

function syncSlides(slides: Y.Map<Y.Map<unknown>>, targets: readonly SlideSnapshot[]): void {
  const wanted = new Map<string, SlideSnapshot>();
  for (const s of targets) if (SLIDES_ID_RE.test(s.id) && !wanted.has(s.id) && wanted.size < SLIDES_MAX_SLIDES) wanted.set(s.id, s);
  deleteOthers(slides, new Set(wanted.keys()));
  for (const [id, s] of wanted) {
    const y = slides.get(id);
    if (!(y instanceof Y.Map)) {
      slides.set(id, slideToY(s));
      continue;
    }
    setIfChanged(y, "order", isOrderKey(s.order) ? s.order : "");
    setIfChanged(y, "layout", isLayoutKind(s.layout) ? s.layout : "blank");
    setIfChanged(y, "masterId", typeof s.masterId === "string" && (s.masterId === "" || SLIDES_ID_RE.test(s.masterId)) ? s.masterId : "");
    setIfChanged(y, "hidden", s.hidden === true);
    setIfChanged(y, "background", s.background === null ? null : sanitizeFill(s.background));
    setIfChanged(y, "transition", sanitizeTransition(s.transition));
    syncText(y, "notes", s.notes);
    syncElements(y, s.elements);
  }
}

/** Writes `target` into the deck of `doc` as a diff, in one SLIDES_ORIGIN transaction (one undo step). */
export function applyDeckSnapshot(doc: Y.Doc, target: DeckSnapshot): void {
  transactSlides(doc, () => {
    const { deck, slides, masters } = deckMaps(doc);
    syncMeta(deck, target.meta);
    syncMasters(masters, target.masters);
    syncSlides(slides, target.slides);
  });
}
