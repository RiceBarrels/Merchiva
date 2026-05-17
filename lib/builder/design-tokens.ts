/**
 * Builder design tokens — the user-pickable presets surfaced inside the
 * builder's color / spacing / text-size / radius pickers.
 *
 * The actual CSS values live in `app/globals.css` under `:root`. This file
 * is the TypeScript mirror that drives the picker UI: it tells the dropdown
 * what tokens exist, what label/category to show, and what sample value to
 * render so the user can preview without resolving the var() at runtime.
 *
 * When the user picks a token the builder writes `var(--mv-…)` into the
 * inline style, so the storefront and the builder iframe both resolve it
 * from globals.css (the iframe receives the same definitions via
 * buildTokenCss() injected into its srcdoc).
 */

export type TokenCategory = "color" | "space" | "text" | "radius";

export interface DesignToken {
  /** Stable id used in the dropdown key. */
  id: string;
  /** Human label shown next to the swatch / sample. */
  label: string;
  /** CSS custom property name (without the `var(...)`). */
  cssVar: string;
  /** The literal value defined in globals.css for the light theme — used
   *  to render the preview swatch / sample text. NOT inserted into the
   *  element style: the inserted value is always `var(--mv-…)`. */
  sample: string;
  category: TokenCategory;
}

// Shadcn-style semantic color tokens. CSS values live in app/globals.css
// under `:root` (light) and `.dark` (dark). The sample values here are the
// light-mode RGB so the picker swatches preview a sensible color even when
// the editor canvas is light.
export const COLOR_TOKENS: DesignToken[] = [
  { id: "background",             label: "Background",             cssVar: "--background",             sample: "rgb(245, 247, 250)", category: "color" },
  { id: "foreground",             label: "Foreground",             cssVar: "--foreground",             sample: "rgb(26, 34, 56)",    category: "color" },
  { id: "card",                   label: "Card",                   cssVar: "--card",                   sample: "rgb(227, 234, 242)", category: "color" },
  { id: "card-foreground",        label: "Card Foreground",        cssVar: "--card-foreground",        sample: "rgb(26, 34, 56)",    category: "color" },
  { id: "popover",                label: "Popover",                cssVar: "--popover",                sample: "rgb(255, 251, 230)", category: "color" },
  { id: "popover-foreground",     label: "Popover Foreground",     cssVar: "--popover-foreground",     sample: "rgb(26, 34, 56)",    category: "color" },
  { id: "primary",                label: "Primary",                cssVar: "--primary",                sample: "rgb(58, 91, 160)",   category: "color" },
  { id: "primary-foreground",     label: "Primary Foreground",     cssVar: "--primary-foreground",     sample: "rgb(255, 251, 230)", category: "color" },
  { id: "secondary",              label: "Secondary",              cssVar: "--secondary",              sample: "rgb(247, 200, 115)", category: "color" },
  { id: "secondary-foreground",   label: "Secondary Foreground",   cssVar: "--secondary-foreground",   sample: "rgb(26, 34, 56)",    category: "color" },
  { id: "muted",                  label: "Muted",                  cssVar: "--muted",                  sample: "rgb(229, 229, 223)", category: "color" },
  { id: "muted-foreground",       label: "Muted Foreground",       cssVar: "--muted-foreground",       sample: "rgb(58, 91, 160)",   category: "color" },
  { id: "accent",                 label: "Accent",                 cssVar: "--accent",                 sample: "rgb(110, 163, 193)", category: "color" },
  { id: "accent-foreground",      label: "Accent Foreground",      cssVar: "--accent-foreground",      sample: "rgb(255, 251, 230)", category: "color" },
  { id: "destructive",            label: "Destructive",            cssVar: "--destructive",            sample: "rgb(45, 30, 47)",    category: "color" },
  { id: "destructive-foreground", label: "Destructive Foreground", cssVar: "--destructive-foreground", sample: "rgb(255, 251, 230)", category: "color" },
  { id: "border",                 label: "Border",                 cssVar: "--border",                 sample: "rgb(176, 184, 193)", category: "color" },
  { id: "input",                  label: "Input",                  cssVar: "--input",                  sample: "rgb(110, 163, 193)", category: "color" },
  { id: "ring",                   label: "Ring",                   cssVar: "--ring",                   sample: "rgb(247, 200, 115)", category: "color" },
];

export const SPACE_TOKENS: DesignToken[] = [
  { id: "xs",  label: "XS",  cssVar: "--mv-space-xs",  sample: "4px",  category: "space" },
  { id: "sm",  label: "SM",  cssVar: "--mv-space-sm",  sample: "8px",  category: "space" },
  { id: "md",  label: "MD",  cssVar: "--mv-space-md",  sample: "16px", category: "space" },
  { id: "lg",  label: "LG",  cssVar: "--mv-space-lg",  sample: "24px", category: "space" },
  { id: "xl",  label: "XL",  cssVar: "--mv-space-xl",  sample: "32px", category: "space" },
  { id: "2xl", label: "2XL", cssVar: "--mv-space-2xl", sample: "48px", category: "space" },
  { id: "3xl", label: "3XL", cssVar: "--mv-space-3xl", sample: "64px", category: "space" },
];

export const TEXT_TOKENS: DesignToken[] = [
  { id: "xs",   label: "XS",   cssVar: "--mv-text-xs",   sample: "12px", category: "text" },
  { id: "sm",   label: "SM",   cssVar: "--mv-text-sm",   sample: "14px", category: "text" },
  { id: "base", label: "Base", cssVar: "--mv-text-base", sample: "16px", category: "text" },
  { id: "lg",   label: "LG",   cssVar: "--mv-text-lg",   sample: "18px", category: "text" },
  { id: "xl",   label: "XL",   cssVar: "--mv-text-xl",   sample: "20px", category: "text" },
  { id: "2xl",  label: "2XL",  cssVar: "--mv-text-2xl",  sample: "24px", category: "text" },
  { id: "3xl",  label: "3XL",  cssVar: "--mv-text-3xl",  sample: "32px", category: "text" },
  { id: "4xl",  label: "4XL",  cssVar: "--mv-text-4xl",  sample: "40px", category: "text" },
  { id: "5xl",  label: "5XL",  cssVar: "--mv-text-5xl",  sample: "56px", category: "text" },
];

// Shadcn-style radius scale. The base value is `--radius` (0.5rem) in
// globals.css; `--radius-sm/md/lg/xl` are computed in the `@theme inline`
// block as `calc(var(--radius) ± Npx)`. The sample values below are the
// resolved sizes for the default --radius: 0.5rem (8px).
export const RADIUS_TOKENS: DesignToken[] = [
  { id: "sm", label: "SM", cssVar: "--radius-sm", sample: "4px",  category: "radius" },
  { id: "md", label: "MD", cssVar: "--radius-md", sample: "6px",  category: "radius" },
  { id: "lg", label: "LG", cssVar: "--radius-lg", sample: "8px",  category: "radius" },
  { id: "xl", label: "XL", cssVar: "--radius-xl", sample: "12px", category: "radius" },
];

export const ALL_TOKENS: DesignToken[] = [
  ...COLOR_TOKENS,
  ...SPACE_TOKENS,
  ...TEXT_TOKENS,
  ...RADIUS_TOKENS,
];

export function tokensFor(category: TokenCategory): DesignToken[] {
  switch (category) {
    case "color":  return COLOR_TOKENS;
    case "space":  return SPACE_TOKENS;
    case "text":   return TEXT_TOKENS;
    case "radius": return RADIUS_TOKENS;
  }
}

// ─── Site-level overrides ──────────────────────────────────────────────────
// A site may override individual token values (e.g. brand color). Overrides
// are stored in `site.tokens` as a flat map keyed by the CSS variable name
// (e.g. {"--mv-color-brand-primary": "#ff0000"}). When a token isn't
// overridden the default from globals.css wins.

/** Resolve a token's current effective value, honoring any site override. */
export function resolveTokenValue(
  token: DesignToken,
  overrides?: Record<string, string>,
): string {
  return overrides?.[token.cssVar] ?? token.sample;
}

/** True if the token has a site-level override (vs falling back to default). */
export function isOverridden(
  token: DesignToken,
  overrides?: Record<string, string>,
): boolean {
  return !!overrides && Object.prototype.hasOwnProperty.call(overrides, token.cssVar);
}

// ─── Custom token discovery ────────────────────────────────────────────────
// Users can add entirely new tokens (not just override predefined ones) by
// inserting entries into site.tokens whose cssVar doesn't match any
// predefined token. We classify them by their `--mv-{category}-…` prefix.

const PREFIX_BY_CATEGORY: Record<TokenCategory, string> = {
  color: "--mv-color-",
  space: "--mv-space-",
  text: "--mv-text-",
  radius: "--mv-radius-",
};

const PREDEFINED_CSSVARS = new Set(ALL_TOKENS.map((t) => t.cssVar));

/** Convert a slug ("brand-x", "myColor") into a Pretty Label for the picker. */
function prettifySlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract every custom (non-predefined) token of a given category from the
 *  site overrides map. Used by the picker UIs to show user-added tokens
 *  alongside the predefined set. */
export function customTokensFor(
  category: TokenCategory,
  overrides?: Record<string, string>,
): DesignToken[] {
  if (!overrides) return [];
  const prefix = PREFIX_BY_CATEGORY[category];
  const out: DesignToken[] = [];
  for (const [cssVar, value] of Object.entries(overrides)) {
    if (PREDEFINED_CSSVARS.has(cssVar)) continue;
    if (!cssVar.startsWith(prefix)) continue;
    const slug = cssVar.slice(prefix.length);
    if (!slug) continue;
    out.push({
      id: slug,
      label: prettifySlug(slug),
      cssVar,
      sample: value,
      category,
    });
  }
  return out;
}

/** Same as `tokensFor` but also includes any user-added custom tokens
 *  found in `overrides`. Predefined tokens come first to keep the picker
 *  order stable. */
export function mergedTokensFor(
  category: TokenCategory,
  overrides?: Record<string, string>,
): DesignToken[] {
  return [...tokensFor(category), ...customTokensFor(category, overrides)];
}

/** Validate + slugify a user-supplied token name into the cssVar that
 *  should be persisted. Returns null when the name normalizes to empty
 *  or collides with a predefined token. */
export function makeCustomCssVar(
  category: TokenCategory,
  rawName: string,
  existing?: Record<string, string>,
): { cssVar: string; slug: string } | null {
  const slug = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  const cssVar = PREFIX_BY_CATEGORY[category] + slug;
  if (PREDEFINED_CSSVARS.has(cssVar)) return null;
  if (existing && Object.prototype.hasOwnProperty.call(existing, cssVar)) return null;
  return { cssVar, slug };
}

/** Wrap a token in `var(--…)` for insertion into inline styles. */
export function tokenRef(token: DesignToken): string {
  return `var(${token.cssVar})`;
}

/** Inverse of tokenRef: if the value is `var(--mv-…)`, return the matching
 *  token; otherwise null. Used to highlight the currently active token in
 *  the picker dropdown. */
export function tokenFromValue(value: string | null | undefined): DesignToken | null {
  if (!value) return null;
  const m = value.trim().match(/^var\(\s*(--mv-[a-z0-9-]+)\s*\)$/i);
  if (!m) return null;
  const cssVar = m[1];
  return ALL_TOKENS.find((t) => t.cssVar === cssVar) ?? null;
}

/**
 * Builds a `:root { … }` CSS string with all the design tokens, mirroring
 * what's in globals.css. Used by html-canvas to inject tokens into the
 * sandboxed iframe so `var(--mv-…)` resolves there too.
 *
 * If `overrides` is provided (typically from `site.tokens`), those values
 * win over the defaults so the iframe preview reflects the site's brand.
 *
 * Note: this is the light-theme copy. The builder iframe doesn't currently
 * propagate the app's dark-mode state; if/when it does, mirror the .dark
 * block from globals.css here as well.
 */
export function buildTokenCss(overrides?: Record<string, string>): string {
  const lines = ALL_TOKENS.map(
    (t) => `  ${t.cssVar}: ${resolveTokenValue(t, overrides)};`,
  );
  // Append any custom tokens the user has added — they live in `overrides`
  // under cssVars that don't match any predefined token. We accept ANY CSS
  // custom property (not just --mv-*) so AI-pasted shadcn-style themes
  // (--background, --primary, …) work too. The picker UI still filters
  // to --mv-{category}-* so the dropdowns stay focused on the design system.
  if (overrides) {
    for (const [cssVar, value] of Object.entries(overrides)) {
      if (PREDEFINED_CSSVARS.has(cssVar)) continue;
      if (!cssVar.startsWith("--")) continue;
      lines.push(`  ${cssVar}: ${value};`);
    }
  }
  return `:root {\n${lines.join("\n")}\n}`;
}

/** Convert site-level token overrides into a React inline style object
 *  (CSS custom properties on a wrapper element). Used by the storefront
 *  / preview renderers, which can't write a `:root` rule but can set
 *  `--mv-…` on their root <div>. */
export function tokenStyleVars(
  overrides?: Record<string, string>,
): Record<string, string> {
  if (!overrides) return {};
  const out: Record<string, string> = {};
  // Predefined token overrides
  for (const t of ALL_TOKENS) {
    const v = overrides[t.cssVar];
    if (v) out[t.cssVar] = v;
  }
  // User-added custom tokens — include any --* var so AI-pasted themes
  // (e.g. --background, --primary) and user-added --mv-* both resolve on
  // the storefront wrapper.
  for (const [cssVar, value] of Object.entries(overrides)) {
    if (PREDEFINED_CSSVARS.has(cssVar)) continue;
    if (!cssVar.startsWith("--")) continue;
    out[cssVar] = value;
  }
  return out;
}
