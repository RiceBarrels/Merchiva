// Theme references in inline styles. Text marks and element fields may hold `theme:<slot>` colours and
// `theme:heading` / `theme:body` fonts, so a theme change recolours the deck without rewriting it. In HTML those
// become CSS custom properties; the element that hosts slide content sets them from the deck theme
// (themeCssVars in lib/slides/themes/themes.ts). No imports: the schema, the renderers and export share it.

const THEME_COLOR_RE = /^theme:([a-z0-9]+)$/;
const THEME_FONT_RE = /^theme:(heading|body)$/;
const COLOR_VAR_RE = /^var\(--slide-color-([a-z0-9]+)\)$/;
const FONT_VAR_RE = /^var\(--slide-font-(heading|body)\)$/;

/** Custom property holding a theme colour slot, e.g. `--slide-color-accent1`. */
export function slideColorVar(slot: string): string {
  return `--slide-color-${slot}`;
}

/** Custom property holding a theme font, `--slide-font-heading` or `--slide-font-body`. */
export function slideFontVar(role: "heading" | "body"): string {
  return `--slide-font-${role}`;
}

/** CSS value of a stored colour: `theme:accent1` → `var(--slide-color-accent1)`, a hex stays as is. */
export function colorCss(value: string): string {
  const slot = THEME_COLOR_RE.exec(value)?.[1];
  return slot ? `var(${slideColorVar(slot)})` : value;
}

/** CSS value of a stored font: `theme:body` → `var(--slide-font-body)`, a font stack stays as is. */
export function fontCss(value: string): string {
  const role = THEME_FONT_RE.exec(value)?.[1] as "heading" | "body" | undefined;
  return role ? `var(${slideFontVar(role)})` : value;
}

/** Inverse of colorCss for pasted/parsed HTML: `var(--slide-color-x)` → `theme:x`. */
export function colorFromCss(css: string): string {
  const slot = COLOR_VAR_RE.exec(css.trim())?.[1];
  return slot ? `theme:${slot}` : css.trim();
}

/** Inverse of fontCss: `var(--slide-font-body)` → `theme:body`. */
export function fontFromCss(css: string): string {
  const role = FONT_VAR_RE.exec(css.trim())?.[1];
  return role ? `theme:${role}` : css.trim();
}
