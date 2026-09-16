/**
 * Fonts and font sizes offered by the docs toolbar (docs-editor-ui spec §4.6).
 *
 * Only system-safe families: next/font families get hashed names that don't survive DOCX/HTML export.
 * `css` is stored verbatim in the `fontFamily` text-style attribute.
 */

export interface DocFont {
  /** Display label (font names are not translated). */
  readonly label: string;
  readonly css: string;
}

export const DOC_FONTS: readonly DocFont[] = [
  { label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", css: "Georgia, serif" },
  { label: "Times New Roman", css: "\"Times New Roman\", Times, serif" },
  { label: "Courier New", css: "\"Courier New\", Courier, monospace" },
  { label: "Verdana", css: "Verdana, Geneva, sans-serif" },
];

/** Sentinel select value for "Default" (no fontFamily mark). */
export const DEFAULT_FONT_VALUE = "__default";

/** First family of a CSS font-family list, without quotes (`"Times New Roman", Times` → `Times New Roman`). */
export function firstFontFamily(css: string | null | undefined): string | null {
  if (!css) return null;
  const first = css.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return first || null;
}

/** Matches a stored `fontFamily` value to one of `DOC_FONTS` (by first family, case-insensitive). */
export function findDocFont(css: string | null | undefined): DocFont | null {
  const family = firstFontFamily(css)?.toLowerCase();
  if (!family) return null;
  return DOC_FONTS.find((font) => firstFontFamily(font.css)?.toLowerCase() === family) ?? null;
}

/** Toolbar step list for the − / + font size buttons (points). */
export const FONT_SIZE_STEPS: readonly number[] = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];

export const FONT_SIZE_MIN = 1;
export const FONT_SIZE_MAX = 400;

export type BlockStyle = "normal" | "title" | "subtitle" | "h1" | "h2" | "h3";

export const BLOCK_STYLES: readonly BlockStyle[] = ["normal", "title", "subtitle", "h1", "h2", "h3"];

/** Default size (pt) of each block style, matching the `.doc-prose` CSS in app/globals.css. */
export const BLOCK_DEFAULT_PT: Readonly<Record<BlockStyle, number>> = {
  normal: 11,
  title: 26,
  subtitle: 15,
  h1: 20,
  h2: 16,
  h3: 14,
};

/** i18n key of each block style's label. */
export const BLOCK_STYLE_LABEL_KEYS: Readonly<Record<BlockStyle, string>> = {
  normal: "docs.format.normal",
  title: "docs.format.title",
  subtitle: "docs.format.subtitle",
  h1: "docs.format.heading1",
  h2: "docs.format.heading2",
  h3: "docs.format.heading3",
};

/** Parses a `fontSize` attribute (`"14pt"`, `"18px"`, `"12"`) to points, or null. */
export function parseFontSizePt(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(pt|px)?\s*$/i.exec(String(value));
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const pt = match[2]?.toLowerCase() === "px" ? n * 0.75 : n;
  return Math.round(pt * 10) / 10;
}

export function clampFontSize(pt: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(pt)));
}

/** Next step up/down from `current` in `FONT_SIZE_STEPS`, clamped to the list bounds. */
export function stepFontSize(current: number, dir: 1 | -1): number {
  if (dir > 0) return FONT_SIZE_STEPS.find((s) => s > current) ?? Math.min(FONT_SIZE_MAX, current + 1);
  for (let i = FONT_SIZE_STEPS.length - 1; i >= 0; i--) {
    if (FONT_SIZE_STEPS[i] < current) return FONT_SIZE_STEPS[i];
  }
  return Math.max(FONT_SIZE_MIN, current - 1);
}

export type LineSpacing = "1" | "1.15" | "1.5" | "2";
export const LINE_SPACINGS: readonly LineSpacing[] = ["1", "1.15", "1.5", "2"];

export type DocZoom = number | "fit";
export const ZOOM_LEVELS: readonly number[] = [50, 75, 90, 100, 125, 150, 200];
