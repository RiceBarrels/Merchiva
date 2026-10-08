// pptxtojson tables and charts → model elements (slides.md §10.1 step 3). A table keeps its grid (row heights,
// column widths), merges (`rowSpan` / `colSpan`, merged-away cells `covered`), cell fills and text; the cells' style
// colour and weight become run styles, and the table's text defaults are what most of its text uses. A chart keeps
// its data and renders as a labelled placeholder (Phase 1).
import type { JSONContent } from "@tiptap/core";

import { SLIDES_MAX_TABLE_COLS, SLIDES_MAX_TABLE_ROWS } from "@/lib/slides/constants";
import { DEFAULT_TABLE_STYLE } from "@/lib/slides/model/defaults";
import { newSlidesId, sequentialKeys } from "@/lib/slides/model/fractional-index";
import type { ChartData, ColorValue, TableCellSnapshot, TableElement, TableStyle, TextDefaults, VAlign } from "@/lib/slides/model/types";

import { parseCssColor } from "./colors";
import type { Box } from "./flatten";
import { arr, flag, num, rec, records, str, type LeanRecord } from "./lean";
import type { FillContext } from "./map-fill";

/** What the table mapper needs from the deck: the text of many cells against one set of text defaults. */
export interface TableTextContext extends FillContext {
  texts(items: ReadonlyArray<{ html: unknown; color?: unknown; bold?: boolean }>, base: TextDefaults): { texts: JSONContent[]; style: TextDefaults };
}

const VALIGN: Readonly<Record<string, VAlign>> = { up: "top", mid: "middle", down: "bottom" };
const SIDES = ["top", "bottom", "left", "right"] as const;

/** The most common visible border (colour, width) of the table and its cells; width 0 when none is visible. */
function borderOf(table: LeanRecord, cells: readonly LeanRecord[], ctx: FillContext): TableStyle["border"] {
  const votes = new Map<string, { color: ColorValue; width: number; n: number }>();
  const add = (border: unknown) => {
    const b = rec(border);
    const width = num(b?.borderWidth, 0);
    const c = parseCssColor(b?.borderColor);
    if (!b || !c || width <= 0) return;
    const color = ctx.color(c.hex);
    const key = `${color}|${width}`;
    const entry = votes.get(key) ?? { color, width, n: 0 };
    entry.n += 1;
    votes.set(key, entry);
  };
  for (const side of SIDES) add(rec(table.borders)?.[side]);
  for (const cell of cells) for (const side of SIDES) add(rec(cell.borders)?.[side]);
  let best: { color: ColorValue; width: number; n: number } | null = null;
  for (const entry of votes.values()) if (!best || entry.n > best.n) best = entry;
  return best ? { color: best.color, width: best.width } : { color: DEFAULT_TABLE_STYLE.border.color, width: 0 };
}

export function mapTable(
  el: LeanRecord,
  box: Box,
  ctx: TableTextContext,
): Pick<TableElement, "type" | "x" | "y" | "w" | "h" | "rot" | "rows" | "cols" | "cells" | "style"> | null {
  const grid = arr(el.data).slice(0, SLIDES_MAX_TABLE_ROWS).map((row) => records(row));
  const colWidths = arr(el.colWidths).map((w) => num(w, 0));
  const rowHeights = arr(el.rowHeights).map((h) => num(h, 0));
  const rowCount = grid.length;
  const colCount = Math.min(SLIDES_MAX_TABLE_COLS, Math.max(colWidths.length, ...grid.map((row) => row.length), 0));
  if (rowCount === 0 || colCount === 0) return null;
  const rowKeys = sequentialKeys(rowCount);
  const colKeys = sequentialKeys(colCount);
  const rows = rowKeys.map((order, r) => ({ id: newSlidesId(), order, h: rowHeights[r] > 0 ? rowHeights[r] : Math.max(1, box.h / rowCount) }));
  const cols = colKeys.map((order, c) => ({ id: newSlidesId(), order, w: colWidths[c] > 0 ? colWidths[c] : Math.max(1, box.w / colCount) }));

  const placed: Array<{ r: number; c: number; cell: LeanRecord }> = [];
  grid.forEach((row, r) => row.slice(0, colCount).forEach((cell, c) => placed.push({ r, c, cell })));
  const base: TextDefaults = DEFAULT_TABLE_STYLE.textStyle;
  const { texts, style: textStyle } = ctx.texts(
    placed.map(({ cell }) => ({ html: cell.text, color: cell.fontColor, bold: flag(cell.fontBold) })),
    base,
  );
  const cells: TableCellSnapshot[] = placed.map(({ r, c, cell }, i) => {
    const fill = parseCssColor(cell.fillColor);
    return {
      rowId: rows[r].id,
      colId: cols[c].id,
      text: texts[i],
      fill: fill ? ctx.color(fill.hex) : null,
      rowSpan: Math.max(1, Math.round(num(cell.rowSpan, 1))),
      colSpan: Math.max(1, Math.round(num(cell.colSpan, 1))),
      covered: flag(cell.vMerge) || flag(cell.hMerge),
      vAlign: VALIGN[str(cell.vAlign)] ?? "top",
    };
  });
  const style: TableStyle = {
    border: borderOf(el, placed.map((p) => p.cell), ctx),
    // Header and banding colours are already in the cell fills pptxtojson resolved; ours would paint over them.
    headerRow: false,
    banded: false,
    textStyle,
  };
  return { type: "table", x: box.x, y: box.y, w: box.w, h: box.h, rot: box.rot, rows, cols, cells, style };
}

/** Chart data kept for a later chart renderer (the Phase 1 view is a placeholder). */
export function mapChart(el: LeanRecord): ChartData {
  const kind = str(el.chartType);
  const colors = arr(el.colors).flatMap((c) => {
    const parsed = parseCssColor(c);
    return parsed ? [parsed.hex] : [];
  });
  const data = arr(el.data);
  if (kind === "scatterChart" || kind === "bubbleChart") {
    const columns = data.map((column) => arr(column).map((v) => num(v, 0)));
    return {
      kind,
      title: "",
      categories: (columns[0] ?? []).map(String),
      series: columns.slice(1).map((values) => ({ name: "", values })),
      colors,
    };
  }
  const items = records(data);
  const firstValues = records(items[0]?.values);
  const labels = rec(items[0]?.xlabels);
  const categories = firstValues.map((v) => {
    const x = str(v.x) || String(num(v.x, 0));
    const label = labels?.[x];
    return typeof label === "string" && label !== "" ? label : x;
  });
  return {
    kind,
    title: "",
    categories,
    series: items.map((item) => ({ name: str(item.key), values: records(item.values).map((v) => num(v.y, 0)) })),
    colors,
  };
}
