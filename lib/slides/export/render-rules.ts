// Rules the renderer (components/slides/canvas) and the exporters (.pptx, PDF, PNG) share, so a slide looks the same
// on screen, on paper and in another app: resolved colours, a font stack's first family, stroke dashes, gradient
// direction, the effective background, a shape's text area, image crop maths and the table grid with its header and
// banding look. Pure: no React, no DOM, no pptxgenjs.
import { DEFAULT_TEXT_BOX } from "@/lib/slides/model/defaults";
import { presetPath, presetTextInset } from "@/lib/slides/geometry/presets";
import { parsePath, scalePath, toSvgD } from "@/lib/slides/geometry/svg-path";
import { safeHex } from "@/lib/slides/model/safe-values";
import { tableCellKey } from "@/lib/slides/model/sanitize-table";
import type {
  ColorValue, DashStyle, Fill, ImageElement, MasterSnapshot, Pt, ShapeElement, ShapeGeom, SlideSnapshot, TableCellSnapshot,
  TableElement, TextElement, ThemeSpec,
} from "@/lib/slides/model/types";
import { resolveColor } from "@/lib/slides/themes/themes";

// ---------------------------------------------------------------------------------------------------------------
// Colours and fonts

/** The `#rrggbb` a stored colour stands for under `theme` (the theme's text colour if it is somehow not a hex). */
export function hexOf(value: ColorValue, theme: ThemeSpec): `#${string}` {
  return safeHex(resolveColor(value, theme)) ?? theme.colors.text;
}

/** A CSS colour: the hex itself when opaque, else `rgba(r, g, b, a)`. */
export function rgbaCss(hex: string, alpha?: number): string {
  if (alpha === undefined || alpha >= 1) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  const a = Math.round(Math.max(0, alpha) * 1000) / 1000;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function colorCssOf(value: ColorValue, theme: ThemeSpec, alpha?: number): string {
  return rgbaCss(hexOf(value, theme), alpha);
}

/** `RRGGBB` (no `#`), the colour form pptxgenjs writes. */
export function pptxHex(value: ColorValue, theme: ThemeSpec): string {
  return hexOf(value, theme).slice(1).toUpperCase();
}

/** pptxgenjs transparency (0 opaque … 100 clear), or undefined when opaque. */
export function pptxTransparency(alpha?: number): number | undefined {
  if (alpha === undefined || alpha >= 1) return undefined;
  return Math.round((1 - Math.max(0, alpha)) * 100);
}

const GENERIC_FAMILIES: Readonly<Record<string, string>> = {
  serif: "Times New Roman",
  "ui-serif": "Times New Roman",
  "sans-serif": "Arial",
  "ui-sans-serif": "Arial",
  "system-ui": "Arial",
  monospace: "Courier New",
  "ui-monospace": "Courier New",
  cursive: "Comic Sans MS",
  fantasy: "Impact",
};

/** The families of a CSS font stack, quotes removed (commas inside quotes kept). */
export function fontStackFamilies(stack: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of stack) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ",") {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  out.push(current.trim());
  return out.filter((name) => name !== "");
}

/** The first family of a stack, as another app names it (generic families become a common concrete font). */
export function firstFontFamily(stack: string): string {
  const first = fontStackFamilies(stack)[0] ?? "";
  return GENERIC_FAMILIES[first.toLowerCase()] ?? (first || "Arial");
}

// ---------------------------------------------------------------------------------------------------------------
// Strokes and fills

/** Dash and gap lengths as multiples of the stroke width (PowerPoint's sysDash / sysDot / dashDot proportions). */
export const DASH_MULTIPLES: Readonly<Record<DashStyle, readonly number[]>> = {
  solid: [],
  dash: [4, 3],
  dot: [1, 1],
  dashDot: [4, 3, 1, 3],
};

/** SVG `stroke-dasharray` for a dash style at `width`, or undefined for a solid line. */
export function dashArray(dash: DashStyle, width: Pt): string | undefined {
  const pattern = DASH_MULTIPLES[dash];
  if (pattern.length === 0 || width <= 0) return undefined;
  return pattern.map((m) => Math.round(m * width * 100) / 100).join(" ");
}

/**
 * Start and end of a linear gradient in a unit box. `angle` follows DrawingML (`a:lin ang`): 0° runs left → right,
 * 90° top → bottom, clockwise.
 */
export function gradientVector(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { x1: r(0.5 - dx), y1: r(0.5 - dy), x2: r(0.5 + dx), y2: r(0.5 + dy) };
}

/** A CSS `linear-gradient()` for a linear fill (CSS 0deg points up, so DrawingML 0° is CSS 90deg). */
export function cssLinearGradient(fill: Extract<Fill, { t: "linear" }>, theme: ThemeSpec): string {
  const stops = fill.stops.map((s) => `${colorCssOf(s.color, theme, s.alpha)} ${Math.round(s.pos * 10000) / 100}%`);
  return `linear-gradient(${Math.round((fill.angle + 90) * 100) / 100}deg, ${stops.join(", ")})`;
}

/** `url("…")` for a URL that already passed safeImageSrc (quotes and backslashes percent-encoded). */
export function cssUrl(src: string): string {
  return `url("${src.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
}

/** What a slide shows behind its elements: its own background, else its master's, else the theme's. */
export function slideBackground(slide: SlideSnapshot, master: MasterSnapshot | null | undefined, theme: ThemeSpec): Fill {
  return slide.background ?? master?.background ?? theme.background;
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry

/** SVG path data of a shape's geometry in a `w`×`h` box ("" for an unusable custom path). */
export function shapePathD(geom: ShapeGeom, w: Pt, h: Pt): string {
  if (geom.kind === "preset") return presetPath(geom.preset, w, h);
  const cmds = parsePath(geom.d);
  if (!cmds || geom.vw <= 0 || geom.vh <= 0) return "";
  return toSvgD(scalePath(cmds, w / geom.vw, h / geom.vh));
}

/** Where text sits inside a text or shape element: the preset's own text area plus the box insets, [l, t, r, b]. */
export function textAreaInsets(el: TextElement | ShapeElement, w: Pt, h: Pt): [Pt, Pt, Pt, Pt] {
  const geom = el.geom.kind === "preset" ? presetTextInset(el.geom.preset, w, h) : ([0, 0, 0, 0] as const);
  const box = el.box.inset;
  return [geom[0] + box[0], geom[1] + box[1], geom[2] + box[2], geom[3] + box[3]];
}

/** Corner radius of a roundRect (PowerPoint's default adjust value). */
export const ROUND_RECT_RATIO = 0.16667;

/**
 * An image's uncropped size and offset inside its `w`×`h` frame: crop fractions are cut off each side of the source,
 * so the full picture is w / (1 − l − r) wide and starts l of that to the left of the frame.
 */
export function cropFrame(w: Pt, h: Pt, crop: ImageElement["crop"]): { fullW: Pt; fullH: Pt; offX: Pt; offY: Pt } {
  const fullW = w / Math.max(0.01, 1 - crop.l - crop.r);
  const fullH = h / Math.max(0.01, 1 - crop.t - crop.b);
  return { fullW, fullH, offX: crop.l * fullW, offY: crop.t * fullH };
}

export function hasCrop(crop: ImageElement["crop"]): boolean {
  return crop.l > 0 || crop.t > 0 || crop.r > 0 || crop.b > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Tables

/** Cell padding, [l, t, r, b] pt: PowerPoint's default cell margins. */
export const TABLE_CELL_INSET: readonly [Pt, Pt, Pt, Pt] = DEFAULT_TEXT_BOX.inset;

export interface TableGridCell {
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  /** `rowId:colId`, the key of the cell map and of an editor target (`${tableId}/${key}`). */
  key: string;
  /** null = missing (the concurrent row + column insert race): shown empty. */
  cell: TableCellSnapshot | null;
  header: boolean;
  band: boolean;
}

export interface TableGrid {
  colWidths: Pt[];
  rowHeights: Pt[];
  /** Visible cells per row; cells under a merge are left out. */
  rows: TableGridCell[][];
}

/**
 * The table as a grid: column widths and row heights scaled to fill the `w`×`h` frame (a resized table stretches
 * its columns), and the visible cells. Merges come from the anchors' spans, clamped to the grid and to cells that
 * are still free, so the grid is always rectangular; a covered cell that no anchor covers shows as a normal cell.
 */
export function tableGrid(el: TableElement, w: Pt = el.w, h: Pt = el.h): TableGrid {
  const sumW = el.cols.reduce((sum, c) => sum + c.w, 0);
  const sumH = el.rows.reduce((sum, r) => sum + r.h, 0);
  const kx = sumW > 0 && w > 0 ? w / sumW : 1;
  const ky = sumH > 0 && h > 0 ? h / sumH : 1;
  const byKey = new Map(el.cells.map((c) => [tableCellKey(c.rowId, c.colId), c]));
  const nRows = el.rows.length;
  const nCols = el.cols.length;
  const taken = el.rows.map(() => el.cols.map(() => false));
  const bodyOffset = el.style.headerRow ? 1 : 0;
  const rows: TableGridCell[][] = [];
  for (let ri = 0; ri < nRows; ri++) {
    const line: TableGridCell[] = [];
    for (let ci = 0; ci < nCols; ci++) {
      if (taken[ri][ci]) continue;
      const key = tableCellKey(el.rows[ri].id, el.cols[ci].id);
      const cell = byKey.get(key) ?? null;
      const wantRows = cell && !cell.covered ? cell.rowSpan : 1;
      const wantCols = cell && !cell.covered ? cell.colSpan : 1;
      let colSpan = 1;
      while (colSpan < wantCols && ci + colSpan < nCols && !taken[ri][ci + colSpan]) colSpan++;
      let rowSpan = 1;
      while (rowSpan < wantRows && ri + rowSpan < nRows) {
        const next = taken[ri + rowSpan];
        let free = true;
        for (let c = ci; c < ci + colSpan; c++) free &&= !next[c];
        if (!free) break;
        rowSpan++;
      }
      for (let r = ri; r < ri + rowSpan; r++) for (let c = ci; c < ci + colSpan; c++) taken[r][c] = true;
      const body = ri - bodyOffset;
      line.push({
        rowIndex: ri,
        colIndex: ci,
        rowSpan,
        colSpan,
        key,
        cell,
        header: el.style.headerRow && ri === 0,
        band: el.style.banded && body >= 0 && body % 2 === 0,
      });
    }
    rows.push(line);
  }
  return {
    colWidths: el.cols.map((c) => c.w * kx),
    rowHeights: el.rows.map((r) => r.h * ky),
    rows,
  };
}

/** A cell's fill and text look: the header row is accent-filled bold text, banded body rows get the surface tint. */
export function tableCellLook(el: TableElement, gc: TableGridCell): { fill: ColorValue | null; bold: boolean; color: ColorValue } {
  const own = gc.cell?.fill ?? null;
  const text = el.style.textStyle;
  if (gc.header) return { fill: own ?? "theme:accent1", bold: true, color: "theme:bg" };
  if (gc.band) return { fill: own ?? "theme:surface", bold: text.bold, color: text.color };
  return { fill: own, bold: text.bold, color: text.color };
}
