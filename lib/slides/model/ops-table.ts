// Table operations (slides.md §4.3): rows and columns in and out, style, cell fill, even column widths. Cells are
// created eagerly for the whole new row or column in the same transaction. A concurrent row insert plus column
// insert can still leave one cell missing (R6): readers show it empty and ensureCell creates it on the first edit.
//
// Merged cells (imported; the editor cannot merge in Phase 1) stay consistent: an anchor cell spans `rowSpan` rows
// and `colSpan` columns, and the cells under it are `covered`. Inserting inside a merge grows it, and deleting
// rows or columns of a merge shrinks it (the first kept cell takes over when the anchor's own row or column goes).
// The table's frame grows and shrinks with its rows and columns.
import * as Y from "yjs";

import { SLIDES_COORD_LIMIT, SLIDES_ID_RE, SLIDES_MAX_TABLE_COLS, SLIDES_MAX_TABLE_ROWS } from "@/lib/slides/constants";
import { blankTableCell, tableCellToY } from "@/lib/slides/model/build";
import { DEFAULT_TABLE_COL_W, DEFAULT_TABLE_ROW_H } from "@/lib/slides/model/defaults";
import { compareKeyed, gapAround, isOrderKey, newSlidesId } from "@/lib/slides/model/fractional-index";
import {
  SlidesOpError, checkedEntries, isBoolean, isColor, isFiniteNumber, isTextDefaults, keysForInsert, recordOf, requireSlide,
  sameJson, setIfChanged, transactSlides, type PatchCheck,
} from "@/lib/slides/model/ops-slides";
import { asRecord, sanitizeTableStyle } from "@/lib/slides/model/sanitize-parts";
import { parseTableCellKey, tableCellKey } from "@/lib/slides/model/sanitize-table";
import { clampNumber, safeColor } from "@/lib/slides/model/safe-values";
import type { ColorValue, TableStyle } from "@/lib/slides/model/types";

type Axis = "row" | "col";
type AxisEntry = { id: string; key: string; size: number; order: unknown };
type CellMap = Y.Map<Y.Map<unknown>>;

interface TableParts {
  elements: Y.Map<unknown>;
  el: Y.Map<unknown>;
  rows: Y.Map<unknown>;
  cols: Y.Map<unknown>;
  cells: CellMap;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The cell map of (rowId, colId), created empty when it is missing (the R6 race). Call only inside write ops. */
export function ensureCell(cells: Y.Map<Y.Map<unknown>>, rowId: string, colId: string): Y.Map<unknown> {
  const key = tableCellKey(rowId, colId);
  const existing = cells.get(key);
  if (existing instanceof Y.Map) return existing;
  cells.set(key, tableCellToY(blankTableCell(rowId, colId)));
  return cells.get(key) as Y.Map<unknown>;
}

function tableParts(doc: Y.Doc, slideId: string, tableId: string): TableParts {
  const elements = requireSlide(doc, slideId).get("elements");
  const el = elements instanceof Y.Map && SLIDES_ID_RE.test(tableId) ? elements.get(tableId) : undefined;
  if (!(elements instanceof Y.Map) || !(el instanceof Y.Map) || el.get("type") !== "table") throw new SlidesOpError("notFound");
  const rows = el.get("rows");
  const cols = el.get("cols");
  const cells = el.get("cells");
  if (!(rows instanceof Y.Map) || !(cols instanceof Y.Map) || !(cells instanceof Y.Map)) throw new SlidesOpError("invalid");
  return { elements, el, rows, cols, cells: cells as CellMap };
}

/** The visible rows or columns (valid ids, sorted by order, capped like the reader caps them). */
function axisEntries(map: Y.Map<unknown>, axis: Axis): AxisEntry[] {
  const sizeKey = axis === "row" ? "h" : "w";
  const fallback = axis === "row" ? DEFAULT_TABLE_ROW_H : DEFAULT_TABLE_COL_W;
  const out: AxisEntry[] = [];
  map.forEach((value, id) => {
    const r = asRecord(value);
    if (!r || !SLIDES_ID_RE.test(id)) return;
    out.push({ id, key: isOrderKey(r.order) ? r.order : "", size: clampNumber(r[sizeKey], 1, SLIDES_COORD_LIMIT, fallback), order: r.order });
  });
  return out.sort(compareKeyed).slice(0, axis === "row" ? SLIDES_MAX_TABLE_ROWS : SLIDES_MAX_TABLE_COLS);
}

function span(cell: Y.Map<unknown>, field: "rowSpan" | "colSpan"): number {
  return Math.round(clampNumber(cell.get(field), 1, 1000, 1));
}

/** Grid access along `axis` (the primary axis is the one being changed). */
function grid(t: TableParts, axis: Axis) {
  const rows = axisEntries(t.rows, "row");
  const cols = axisEntries(t.cols, "col");
  const [primary, other] = axis === "row" ? [rows, cols] : [cols, rows];
  const keyAt = (p: string, o: string) => (axis === "row" ? tableCellKey(p, o) : tableCellKey(o, p));
  const cellAt = (p: string, o: string): Y.Map<unknown> | undefined => {
    const cell = t.cells.get(keyAt(p, o));
    return cell instanceof Y.Map ? cell : undefined;
  };
  const spanField: "rowSpan" | "colSpan" = axis === "row" ? "rowSpan" : "colSpan";
  const crossField: "rowSpan" | "colSpan" = axis === "row" ? "colSpan" : "rowSpan";
  return { rows, cols, primary, other, keyAt, cellAt, spanField, crossField };
}

function insertLines(doc: Y.Doc, slideId: string, tableId: string, axis: Axis, refId: string, where: "before" | "after", count: number): string[] {
  return transactSlides(doc, () => {
    const t = tableParts(doc, slideId, tableId);
    const g = grid(t, axis);
    const ref = g.primary.findIndex((e) => e.id === refId);
    if (ref < 0) throw new SlidesOpError("notFound");
    const max = axis === "row" ? SLIDES_MAX_TABLE_ROWS : SLIDES_MAX_TABLE_COLS;
    const n = Math.min(Number.isFinite(count) ? Math.floor(count) : 0, max - g.primary.length);
    if (n <= 0) throw new SlidesOpError("invalid");
    const after = where === "after" ? ref : ref - 1;
    const { a, b } = gapAround(g.primary, after);
    const size = g.primary[ref].size;
    const lines = t[axis === "row" ? "rows" : "cols"];
    const sizeKey = axis === "row" ? "h" : "w";
    const ids = keysForInsert(a, b, n).map((key) => {
      const id = newSlidesId();
      lines.set(id, { order: key, [sizeKey]: size });
      return id;
    });
    // Merges crossing the gap after `after` grow over the new lines, whose cells under them are covered.
    const covered = new Set<string>();
    for (let p = 0; p <= after; p++) {
      g.other.forEach((o, oi) => {
        const cell = g.cellAt(g.primary[p].id, o.id);
        if (!cell || cell.get("covered") === true) return;
        const s = span(cell, g.spanField);
        if (p + s - 1 <= after) return;
        cell.set(g.spanField, s + n);
        for (let k = oi; k < Math.min(g.other.length, oi + span(cell, g.crossField)); k++) covered.add(g.other[k].id);
      });
    }
    for (const id of ids) {
      for (const o of g.other) {
        const [rowId, colId] = axis === "row" ? [id, o.id] : [o.id, id];
        t.cells.set(tableCellKey(rowId, colId), tableCellToY({ ...blankTableCell(rowId, colId), covered: covered.has(o.id) }));
      }
    }
    const frameKey = axis === "row" ? "h" : "w";
    const frame = clampNumber(t.el.get(frameKey), 0, SLIDES_COORD_LIMIT, 0);
    t.el.set(frameKey, round(Math.min(SLIDES_COORD_LIMIT, frame + size * n)));
    return ids;
  });
}

function deleteLines(doc: Y.Doc, slideId: string, tableId: string, axis: Axis, ids: readonly string[]): void {
  transactSlides(doc, () => {
    const t = tableParts(doc, slideId, tableId);
    const g = grid(t, axis);
    const doomed = new Set(ids.filter((id) => g.primary.some((e) => e.id === id)));
    if (doomed.size === 0) return;
    if (doomed.size >= g.primary.length) {
      t.elements.delete(tableId); // a table without rows (or columns) is not a table
      return;
    }
    // Merges lose the deleted lines; when the anchor's own line goes, the first kept cell under it takes over.
    // Planned on the grid as it is, then written, so a new anchor is never re-read in post-delete units.
    const shrink: Array<{ cell: Y.Map<unknown>; span: number }> = [];
    const heirs: Array<{ rowId: string; colId: string; span: number; cross: number }> = [];
    g.primary.forEach((pe, p) => {
      for (const o of g.other) {
        const cell = g.cellAt(pe.id, o.id);
        if (!cell || cell.get("covered") === true) continue;
        const s = span(cell, g.spanField);
        if (s <= 1) continue;
        const kept = g.primary.slice(p, p + s).filter((e) => !doomed.has(e.id));
        if (kept.length === Math.min(s, g.primary.length - p)) continue;
        if (!doomed.has(pe.id)) shrink.push({ cell, span: Math.max(1, kept.length) });
        else if (kept.length > 0) {
          const [rowId, colId] = axis === "row" ? [kept[0].id, o.id] : [o.id, kept[0].id];
          heirs.push({ rowId, colId, span: kept.length, cross: span(cell, g.crossField) });
        }
      }
    });
    for (const { cell, span: s } of shrink) cell.set(g.spanField, s);
    for (const heir of heirs) {
      const cell = ensureCell(t.cells, heir.rowId, heir.colId);
      cell.set("covered", false);
      cell.set(g.spanField, heir.span);
      cell.set(g.crossField, heir.cross);
    }
    const lines = t[axis === "row" ? "rows" : "cols"];
    let removed = 0;
    for (const e of g.primary) {
      if (!doomed.has(e.id)) continue;
      removed += e.size;
      lines.delete(e.id);
    }
    for (const key of [...t.cells.keys()]) {
      const parsed = parseTableCellKey(key);
      if (parsed && doomed.has(axis === "row" ? parsed.rowId : parsed.colId)) t.cells.delete(key);
    }
    const frameKey = axis === "row" ? "h" : "w";
    const frame = clampNumber(t.el.get(frameKey), 0, SLIDES_COORD_LIMIT, 0);
    t.el.set(frameKey, round(Math.max(1, frame - removed)));
  });
}

/** Inserts `count` rows (default 1) before or after `refRowId`, as tall as it; returns their ids. */
export function insertTableRows(doc: Y.Doc, slideId: string, tableId: string, refRowId: string, where: "before" | "after", count = 1): string[] {
  return insertLines(doc, slideId, tableId, "row", refRowId, where, count);
}

/** Inserts `count` columns (default 1) before or after `refColId`, as wide as it; returns their ids. */
export function insertTableCols(doc: Y.Doc, slideId: string, tableId: string, refColId: string, where: "before" | "after", count = 1): string[] {
  return insertLines(doc, slideId, tableId, "col", refColId, where, count);
}

/** Deletes rows and their cells; deleting every row deletes the table. */
export function deleteTableRows(doc: Y.Doc, slideId: string, tableId: string, rowIds: readonly string[]): void {
  deleteLines(doc, slideId, tableId, "row", rowIds);
}

/** Deletes columns and their cells; deleting every column deletes the table. */
export function deleteTableCols(doc: Y.Doc, slideId: string, tableId: string, colIds: readonly string[]): void {
  deleteLines(doc, slideId, tableId, "col", colIds);
}

const STYLE_CHECKS: Readonly<Record<keyof TableStyle, PatchCheck>> = {
  border: recordOf({ color: isColor, width: isFiniteNumber }),
  headerRow: isBoolean,
  banded: isBoolean,
  textStyle: isTextDefaults,
};

/**
 * Merges `patch` into the table style (sanitized; each given part replaces the stored one). A part its sanitizer
 * would replace with the default (a bad border colour, an incomplete text style) throws invalid.
 */
export function setTableStyle(doc: Y.Doc, slideId: string, tableId: string, patch: Partial<TableStyle>): void {
  const given = Object.fromEntries(checkedEntries(patch, STYLE_CHECKS));
  transactSlides(doc, () => {
    const t = tableParts(doc, slideId, tableId);
    setIfChanged(t.el, "style", sanitizeTableStyle({ ...(asRecord(t.el.get("style")) ?? {}), ...given }));
  });
}

/** Sets (or clears, with null) the fill of the listed cells (`rowId:colId` keys of visible rows and columns). */
export function setCellsFill(doc: Y.Doc, slideId: string, tableId: string, cellKeys: readonly string[], fill: ColorValue | null): void {
  const color = fill === null ? null : safeColor(fill);
  if (fill !== null && color === null) throw new SlidesOpError("invalid");
  transactSlides(doc, () => {
    const t = tableParts(doc, slideId, tableId);
    const rowIds = new Set(axisEntries(t.rows, "row").map((e) => e.id));
    const colIds = new Set(axisEntries(t.cols, "col").map((e) => e.id));
    for (const key of cellKeys) {
      const ids = parseTableCellKey(key);
      if (!ids || !rowIds.has(ids.rowId) || !colIds.has(ids.colId)) continue;
      const cell = ensureCell(t.cells, ids.rowId, ids.colId);
      if (!sameJson(cell.get("fill"), color)) cell.set("fill", color);
    }
  });
}

/** Gives every column the same width, filling the table's frame. */
export function distributeTableCols(doc: Y.Doc, slideId: string, tableId: string): void {
  transactSlides(doc, () => {
    const t = tableParts(doc, slideId, tableId);
    const cols = axisEntries(t.cols, "col");
    const frame = clampNumber(t.el.get("w"), 0, SLIDES_COORD_LIMIT, 0);
    const total = frame > 0 ? frame : cols.reduce((sum, c) => sum + c.size, 0);
    const width = Math.max(1, round(total / cols.length));
    for (const col of cols) setIfChanged(t.cols, col.id, { order: isOrderKey(col.order) ? col.order : "", w: width });
  });
}
