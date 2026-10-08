// The six in-house starter themes (slides.md §8). Fonts are system-safe stacks (hashed next/font names can't be
// stored or exported) that always end in fonts Android WebView ships, so staff phones fall back predictably (R15).
// Export writes only the first family of each stack. Colours are stored lowercase, the form safeColor produces.
import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_DEFAULTS } from "@/lib/slides/model/defaults";
import type {
  ColorValue, FontRef, LayoutKind, Pt, SlideElement, StarterThemeId, ThemeColorSlot, ThemeSpec,
} from "@/lib/slides/model/types";
import { blankTextJson } from "@/lib/slides/text/plain";
import { slideColorVar, slideFontVar } from "@/lib/slides/text/theme-css";

const ARIAL = 'Arial, Helvetica, Roboto, "Noto Sans", sans-serif';
const GEORGIA = 'Georgia, "Noto Serif", "DejaVu Serif", serif';
const VERDANA = 'Verdana, "DejaVu Sans", "Noto Sans", Roboto, sans-serif';
const TREBUCHET = '"Trebuchet MS", "Noto Sans", Roboto, sans-serif';
const COURIER = '"Courier New", "Liberation Mono", "Droid Sans Mono", "Noto Sans Mono", monospace';

type Palette = readonly [bg: string, text: string, muted: string, surface: string, link: string, accents: readonly string[]];

function theme(id: StarterThemeId, palette: Palette, heading: string, body: string, decor: ThemeSpec["decor"]): ThemeSpec {
  const [bg, text, muted, surface, link, accents] = palette;
  const hex = (v: string) => v.toLowerCase() as `#${string}`;
  const colors: Record<ThemeColorSlot, `#${string}`> = {
    bg: hex(bg), text: hex(text), muted: hex(muted), surface: hex(surface),
    accent1: hex(accents[0]), accent2: hex(accents[1]), accent3: hex(accents[2]),
    accent4: hex(accents[3]), accent5: hex(accents[4]), accent6: hex(accents[5]),
    link: hex(link),
  };
  return { id, colors, fonts: { heading, body }, background: { t: "solid", color: "theme:bg" }, decor };
}

export const STARTER_THEMES: Readonly<Record<StarterThemeId, ThemeSpec>> = {
  "simple-light": theme(
    "simple-light",
    ["#FFFFFF", "#1F2937", "#6B7280", "#F3F4F6", "#2563EB", ["#2563EB", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#0EA5E9"]],
    ARIAL, ARIAL, "none",
  ),
  "simple-dark": theme(
    "simple-dark",
    ["#111827", "#F9FAFB", "#9CA3AF", "#1F2937", "#93C5FD", ["#60A5FA", "#FBBF24", "#34D399", "#F87171", "#A78BFA", "#38BDF8"]],
    ARIAL, ARIAL, "none",
  ),
  paper: theme(
    "paper",
    ["#FAF7F2", "#292524", "#78716C", "#F0EBE3", "#1D4ED8", ["#B45309", "#0F766E", "#7C3AED", "#BE123C", "#1D4ED8", "#4D7C0F"]],
    GEORGIA, VERDANA, "accentBar",
  ),
  coastal: theme(
    "coastal",
    ["#F8FAFC", "#0F172A", "#475569", "#E2E8F0", "#0369A1", ["#0E7490", "#0369A1", "#F97316", "#16A34A", "#DB2777", "#CA8A04"]],
    TREBUCHET, VERDANA, "topBand",
  ),
  market: theme(
    "market",
    ["#FFFFFF", "#111827", "#4B5563", "#FEF3C7", "#1E3A8A", ["#EA580C", "#1E3A8A", "#15803D", "#B91C1C", "#7C3AED", "#0891B2"]],
    VERDANA, ARIAL, "cornerBlock",
  ),
  mono: theme(
    "mono",
    ["#FFFFFF", "#0A0A0A", "#525252", "#F5F5F5", "#171717", ["#404040", "#737373", "#A3A3A3", "#171717", "#525252", "#D4D4D4"]],
    COURIER, ARIAL, "none",
  ),
};

/** Order shown in the theme panel. */
export const STARTER_THEME_IDS: readonly StarterThemeId[] = ["simple-light", "simple-dark", "paper", "coastal", "market", "mono"];

export const DEFAULT_THEME_ID: StarterThemeId = "simple-light";

export const THEME_LABEL_KEYS: Readonly<Record<StarterThemeId, string>> = {
  "simple-light": "slides.themes.simpleLight",
  "simple-dark": "slides.themes.simpleDark",
  paper: "slides.themes.paper",
  coastal: "slides.themes.coastal",
  market: "slides.themes.market",
  mono: "slides.themes.mono",
};

export function isStarterThemeId(value: unknown): value is StarterThemeId {
  return typeof value === "string" && (STARTER_THEME_IDS as readonly string[]).includes(value);
}

/** The hex a stored colour stands for under `theme`. */
export function resolveColor(v: ColorValue, theme: ThemeSpec): `#${string}` {
  if (v.startsWith("theme:")) return theme.colors[v.slice("theme:".length) as ThemeColorSlot] ?? theme.colors.text;
  return v as `#${string}`;
}

/** The CSS font stack a stored font stands for under `theme`. */
export function resolveFont(f: FontRef, theme: ThemeSpec): string {
  if (f === "theme:heading") return theme.fonts.heading;
  if (f === "theme:body") return theme.fonts.body;
  return f;
}

/** Custom properties that make `theme:*` references in text marks resolve (set on the slide content host). */
export function themeCssVars(theme: ThemeSpec): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [slot, hex] of Object.entries(theme.colors)) vars[slideColorVar(slot)] = hex;
  vars[slideFontVar("heading")] = theme.fonts.heading;
  vars[slideFontVar("body")] = theme.fonts.body;
  return vars;
}

function decorRect(id: string, z: string, x: Pt, y: Pt, w: Pt, h: Pt, color: ColorValue): SlideElement {
  return {
    id, z, type: "shape", locked: true, name: "", link: "", placeholder: "",
    x, y, w, h, rot: 0,
    geom: { kind: "preset", preset: "rect" },
    fill: { t: "solid", color },
    stroke: null,
    shadow: null,
    box: DEFAULT_TEXT_BOX,
    textStyle: DEFAULT_TEXT_DEFAULTS,
    flipH: false,
    flipV: false,
    text: blankTextJson(),
  };
}

/**
 * The code-drawn decor of a slide whose masterId is "theme": locked shapes rendered behind the slide's own
 * elements. Geometry is designed at 960×540 and scaled to the deck size; title and section slides get a bolder
 * version. They stay clear of the layout placeholders (lib/slides/themes/layouts.ts).
 */
export function themeDecorElements(theme: ThemeSpec, size: { w: Pt; h: Pt }, layout: LayoutKind): SlideElement[] {
  const sx = size.w / 960;
  const sy = size.h / 540;
  const bold = layout === "title" || layout === "section";
  const rects: Array<[x: number, y: number, w: number, h: number, color: ColorValue]> = [];
  switch (theme.decor) {
    case "accentBar":
      rects.push([0, 0, (bold ? 24 : 12) * sx, size.h, "theme:accent1"]);
      break;
    case "topBand":
      rects.push([0, 0, size.w, (bold ? 40 : 16) * sy, "theme:accent1"]);
      break;
    case "cornerBlock": {
      const edge = bold ? 120 : 48;
      rects.push([size.w - edge * sx, size.h - edge * sy, edge * sx, edge * sy, "theme:accent1"]);
      rects.push([size.w - (edge + 16) * sx, size.h - 16 * sy, 16 * sx, 16 * sy, "theme:accent2"]);
      break;
    }
    case "none":
      break;
  }
  const keys = sequentialKeys(rects.length);
  return rects.map(([x, y, w, h, color], i) => decorRect(`decor${i + 1}`, keys[i], x, y, w, h, color));
}
