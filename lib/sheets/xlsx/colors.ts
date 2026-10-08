// Colour conversions between Excel and Univer (sheets.md §11.1). Excel colours are ARGB hex, a theme slot
// with an optional tint, or an index into the legacy 64-colour palette; Univer stores "#rrggbb" (or a CSS
// rgb()) and, rarely, a theme token. Theme colours resolve against the Office 2013+ default theme: a file's
// own theme part is not read, so a workbook with a custom theme keeps its explicit colours only.

import type { IColorStyle, ThemeColorType } from "@univerjs/presets";
import type { ExcelColorLike } from "./types";

/** The Office 2013+ default colour scheme, in <a:clrScheme> order (= Univer's ThemeColorType order). */
export const OFFICE_THEME_COLORS = {
  dk1: "000000",
  lt1: "FFFFFF",
  dk2: "44546A",
  lt2: "E7E6E6",
  accent1: "4472C4",
  accent2: "ED7D31",
  accent3: "A5A5A5",
  accent4: "FFC000",
  accent5: "5B9BD5",
  accent6: "70AD47",
  hlink: "0563C1",
  folHlink: "954F72",
} as const;

const T = OFFICE_THEME_COLORS;
/** Univer ThemeColorType (DARK1 = 0 … FOLLOWED_HYPERLINK = 11) → hex: the scheme order. */
const SCHEME_ORDER: readonly string[] = [
  T.dk1, T.lt1, T.dk2, T.lt2, T.accent1, T.accent2, T.accent3, T.accent4, T.accent5, T.accent6, T.hlink, T.folHlink,
];

/**
 * Excel's `theme` attribute → hex. Excel swaps the first two pairs of the scheme (0 = lt1 "background 1",
 * 1 = dk1 "text 1", 2 = lt2, 3 = dk2): a default black font is `theme="1"`, a white fill `theme="0"`.
 */
export const EXCEL_THEME_INDEX_COLORS: readonly string[] = [
  T.lt1, T.dk1, T.lt2, T.dk2, T.accent1, T.accent2, T.accent3, T.accent4, T.accent5, T.accent6, T.hlink, T.folHlink,
];

/** The legacy indexed palette (ECMA-376 §18.8.27), plus 64 = system foreground and 65 = system background. */
export const EXCEL_INDEXED_COLORS: readonly string[] = [
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
  "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
  "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF",
  "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
  "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696",
  "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
  "000000", "FFFFFF",
];

const HEX6_RE = /^[0-9a-f]{6}$/i;
const HEX8_RE = /^[0-9a-f]{8}$/i;
const CSS_HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_RGB_RE = /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

function toCssHex(hex6: string): string {
  return `#${hex6.toLowerCase()}`;
}

/** "FFrrggbb" or "rrggbb" → "#rrggbb" (Excel ignores the alpha byte of cell colours); anything else → null. */
export function argbToHex(argb: string | null | undefined): string | null {
  if (typeof argb !== "string") return null;
  const value = argb.trim();
  if (HEX8_RE.test(value)) return toCssHex(value.slice(2));
  if (HEX6_RE.test(value)) return toCssHex(value);
  return null;
}

function alphaIsZero(alpha: string | undefined): boolean {
  if (alpha === undefined) return false;
  const value = alpha.endsWith("%") ? Number(alpha.slice(0, -1)) : Number(alpha);
  return Number.isFinite(value) && value === 0;
}

/**
 * A CSS colour ("#rgb", "#rgba", "#rrggbb", "#rrggbbaa", "rgb(…)", "rgba(…)") → Excel "FFRRGGBB". A fully
 * transparent colour, a named colour or anything unparsable → null (no colour).
 */
export function hexToArgb(color: string | null | undefined): string | null {
  if (typeof color !== "string") return null;
  const value = color.trim();
  const hex = CSS_HEX_RE.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = digits.split("").map((d) => d + d).join("");
    if (digits.length === 8 && digits.slice(6) === "00") return null;
    return `FF${digits.slice(0, 6).toUpperCase()}`;
  }
  const rgb = CSS_RGB_RE.exec(value);
  if (!rgb) return null;
  const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
  if (channels.some((c) => c > 255) || alphaIsZero(rgb[4])) return null;
  return `FF${channels.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// ── Tint (ECMA-376 §18.8.19: lighten or darken the HSL luminance) ─────────────────────────────────

const HLS_MAX = 255;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

/** Applies an Excel tint (-1 … 1) to "rrggbb" or "#rrggbb"; returns "#rrggbb". */
export function applyTint(hex: string, tint: number): string {
  const digits = hex.replace(/^#/, "");
  if (!HEX6_RE.test(digits)) return toCssHex("000000");
  if (!Number.isFinite(tint) || tint === 0) return toCssHex(digits);
  const t = Math.max(-1, Math.min(1, tint));
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255);
  const [h, s, l] = rgbToHsl(r, g, b);
  const lum = t < 0 ? l * (1 + t) : l * (1 - t) + t;
  // The standard keeps luminance on a 0…HLSMAX (255) integer scale; rounding there lands within one step
  // per channel of every lighter / darker swatch Excel offers.
  const out = hslToRgb(h, s, Math.round(Math.max(0, Math.min(1, lum)) * HLS_MAX) / HLS_MAX);
  return toCssHex(out.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join(""));
}

/**
 * An ExcelJS colour → "#rrggbb": `argb`, else `theme` (+ `tint`) against `themeColors` (Excel attribute order,
 * default EXCEL_THEME_INDEX_COLORS), else `indexed`. null when there is no usable colour.
 */
export function resolveExcelColor(
  color: ExcelColorLike | null | undefined,
  themeColors: readonly string[] = EXCEL_THEME_INDEX_COLORS,
): string | null {
  if (!color || typeof color !== "object") return null;
  let hex: string | null = null;
  if (typeof color.argb === "string") hex = argbToHex(color.argb);
  else if (typeof color.theme === "number" && Number.isInteger(color.theme)) hex = themeColors[color.theme] ?? null;
  else if (typeof color.indexed === "number" && Number.isInteger(color.indexed)) hex = EXCEL_INDEXED_COLORS[color.indexed] ?? null;
  if (hex === null) return null;
  return typeof color.tint === "number" && color.tint !== 0 ? applyTint(hex, color.tint) : toCssHex(hex.replace(/^#/, ""));
}

/** A Univer theme token → "#rrggbb" of the default scheme. */
export function themeColorTypeToHex(th: ThemeColorType | number | null | undefined): string | null {
  if (typeof th !== "number" || !Number.isInteger(th)) return null;
  const hex = SCHEME_ORDER[th];
  return hex ? toCssHex(hex) : null;
}

/** A Univer colour (`rgb`, else theme token `th`) → Excel "FFRRGGBB", or null. */
export function univerColorToArgb(color: IColorStyle | null | undefined | void): string | null {
  if (!color || typeof color !== "object") return null;
  if (typeof color.rgb === "string" && color.rgb.trim() !== "") return hexToArgb(color.rgb);
  return hexToArgb(themeColorTypeToHex(color.th));
}
