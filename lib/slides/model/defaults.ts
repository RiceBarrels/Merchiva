// Default values for element fields: what the validator falls back to for a missing or invalid field, and what the
// layouts and inserts start from. Theme references everywhere, so defaults follow the deck theme.
import type { Stroke, TableStyle, TextBox, TextDefaults } from "@/lib/slides/model/types";

/** PowerPoint's default text insets: 0.1 in left/right, 0.05 in top/bottom. `inset` is [left, top, right, bottom]. */
export const DEFAULT_TEXT_BOX: TextBox = Object.freeze({
  vAlign: "top",
  inset: Object.freeze([7.2, 3.6, 7.2, 3.6]) as readonly [number, number, number, number],
  autofit: "none",
  fontScale: 1,
  wrap: true,
  vertical: false,
});

export const DEFAULT_TEXT_DEFAULTS: TextDefaults = Object.freeze({
  font: "theme:body",
  size: 18,
  color: "theme:text",
  bold: false,
  align: "left",
  lineHeight: 1.2,
});

export const DEFAULT_STROKE: Stroke = Object.freeze({ color: "theme:text", width: 2, dash: "solid" });

export const DEFAULT_TABLE_STYLE: TableStyle = Object.freeze({
  border: Object.freeze({ color: "theme:muted", width: 1 }),
  headerRow: true,
  banded: false,
  textStyle: Object.freeze({ ...DEFAULT_TEXT_DEFAULTS, size: 14 }),
});

/** Default row height and column width of a new table (pt). */
export const DEFAULT_TABLE_ROW_H = 32;
export const DEFAULT_TABLE_COL_W = 120;

/** Transition durations (ms). */
export const DEFAULT_TRANSITION_MS = 300;
export const MAX_TRANSITION_MS = 10_000;
