// Table part of the element validator (slides.md §2.2, §4.2): rows and columns with valid ids and order keys,
// cells only for existing (row, column) pairs, spans that stay inside the grid. A table with no rows or no
// columns is not a table (deleting every row deletes it), so it sanitizes to null.
import type { JSONContent } from "@tiptap/core";

import { SLIDES_COORD_LIMIT, SLIDES_ID_RE, SLIDES_MAX_TABLE_COLS, SLIDES_MAX_TABLE_ROWS } from "@/lib/slides/constants";
import { DEFAULT_TABLE_COL_W, DEFAULT_TABLE_ROW_H } from "@/lib/slides/model/defaults";
import { compareKeyed, isOrderKey } from "@/lib/slides/model/fractional-index";
import { asRecord, bool, sanitizeTableStyle, sanitizeVAlign } from "@/lib/slides/model/sanitize-parts";
import { clampNumber, safeColor } from "@/lib/slides/model/safe-values";
import type { TableCellSnapshot, TableElement } from "@/lib/slides/model/types";

type Axis = { id: string; order: string; size: number };

function axis(raw: unknown, sizeKey: "h" | "w", fallback: number, max: number): Axis[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Axis[] = [];
  for (const entry of raw) {
    const r = asRecord(entry);
    if (!r || typeof r.id !== "string" || !SLIDES_ID_RE.test(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, order: isOrderKey(r.order) ? r.order : "", size: clampNumber(r[sizeKey], 1, SLIDES_COORD_LIMIT, fallback) });
  }
  return out.sort((a, b) => compareKeyed({ key: a.order, id: a.id }, { key: b.order, id: b.id })).slice(0, max);
}

/** The key of a cell in the table's `cells` map. */
export function tableCellKey(rowId: string, colId: string): string {
  return `${rowId}:${colId}`;
}

/** Splits a cell key into its ids, or null when either id is invalid. */
export function parseTableCellKey(key: string): { rowId: string; colId: string } | null {
  const [rowId, colId, ...rest] = key.split(":");
  if (rest.length > 0 || !rowId || !colId || !SLIDES_ID_RE.test(rowId) || !SLIDES_ID_RE.test(colId)) return null;
  return { rowId, colId };
}

export function sanitizeTable(
  r: Record<string, unknown>,
  text: (json: unknown) => JSONContent,
): Pick<TableElement, "rows" | "cols" | "cells" | "style"> | null {
  const rows = axis(r.rows, "h", DEFAULT_TABLE_ROW_H, SLIDES_MAX_TABLE_ROWS);
  const cols = axis(r.cols, "w", DEFAULT_TABLE_COL_W, SLIDES_MAX_TABLE_COLS);
  if (rows.length === 0 || cols.length === 0) return null;
  const rowIndex = new Map(rows.map((row, i) => [row.id, i]));
  const colIndex = new Map(cols.map((col, i) => [col.id, i]));
  const cells = new Map<string, { ri: number; ci: number; cell: TableCellSnapshot }>();
  for (const entry of Array.isArray(r.cells) ? r.cells : []) {
    const c = asRecord(entry);
    if (!c || typeof c.rowId !== "string" || typeof c.colId !== "string") continue;
    const ri = rowIndex.get(c.rowId);
    const ci = colIndex.get(c.colId);
    const key = tableCellKey(c.rowId, c.colId);
    if (ri === undefined || ci === undefined || cells.has(key)) continue;
    const cell: TableCellSnapshot = {
      rowId: c.rowId,
      colId: c.colId,
      text: text(c.text),
      fill: safeColor(c.fill),
      rowSpan: Math.round(clampNumber(c.rowSpan, 1, rows.length - ri, 1)),
      colSpan: Math.round(clampNumber(c.colSpan, 1, cols.length - ci, 1)),
      covered: bool(c.covered),
      vAlign: sanitizeVAlign(c.vAlign),
    };
    cells.set(key, { ri, ci, cell });
  }
  const sortedCells = [...cells.values()].sort((a, b) => a.ri - b.ri || a.ci - b.ci).map((entry) => entry.cell);
  return {
    rows: rows.map((row) => ({ id: row.id, order: row.order, h: row.size })),
    cols: cols.map((col) => ({ id: col.id, order: col.order, w: col.size })),
    cells: sortedCells,
    style: sanitizeTableStyle(r.style),
  };
}
