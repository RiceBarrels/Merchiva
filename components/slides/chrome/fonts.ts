// Fonts the Slides font menu offers (slides.md §6.1, R15): each family is a stack that ends in fonts Android WebView
// ships, so staff phones fall back predictably, and every stack passes safeFontCss. Pure.
import { firstFontFamily } from "@/lib/docs/fonts";

export interface SlidesFont { readonly label: string; readonly css: string }

/** Family names are not translated. */
export const SLIDES_FONTS: readonly SlidesFont[] = [
  { label: "Arial", css: 'Arial, Helvetica, Roboto, "Noto Sans", sans-serif' },
  { label: "Georgia", css: 'Georgia, "Noto Serif", "DejaVu Serif", serif' },
  { label: "Times New Roman", css: '"Times New Roman", Times, "Noto Serif", serif' },
  { label: "Verdana", css: 'Verdana, "DejaVu Sans", "Noto Sans", Roboto, sans-serif' },
  { label: "Trebuchet MS", css: '"Trebuchet MS", "Noto Sans", Roboto, sans-serif' },
  { label: "Courier New", css: '"Courier New", "Liberation Mono", "Droid Sans Mono", "Noto Sans Mono", monospace' },
];

const sameFamily = (a: string, b: string) => firstFontFamily(a)?.toLowerCase() === firstFontFamily(b)?.toLowerCase();

/** The menu entry a stored font matches: a theme font, a listed family (by first family name), or null. */
export function matchSlidesFont(font: string): string | null {
  if (font === "theme:heading" || font === "theme:body") return font;
  return SLIDES_FONTS.find((f) => sameFamily(f.css, font))?.css ?? null;
}

/** The name a stored font is shown by. */
export function fontLabel(font: string, t: (key: string) => string): string {
  if (font === "theme:heading") return t("slides.format.fontHeading");
  if (font === "theme:body") return t("slides.format.fontBody");
  return SLIDES_FONTS.find((f) => sameFamily(f.css, font))?.label ?? firstFontFamily(font) ?? font;
}
