/**
 * Docs colours.
 *
 * - `PRESENCE_COLORS`: collaborator carets, remote selections and avatar rings in the editor only (lead decision Q3:
 *   8 muted hues taken from families the app already uses — status tones and the chart blue ramp). Everything
 *   else in the UI stays neutral.
 * - `TEXT_COLORS` / `HIGHLIGHT_COLORS`: the named quick row at the top of the picker. Names are i18n suffixes
 *   under `docs.colors.*`.
 * - `DOC_COLOR_GRID`: the full palette below it — a greyscale row plus six tint/shade rows across ten hues. A
 *   document is content, not app chrome, so it gets real colours; the saturated primaries row Word and Docs ship is
 *   left out because nothing in this product should be neon. Swatches are labelled by their hex value, which needs
 *   no translation and is what people look for when matching a brand colour.
 *
 * The page sheet stays light in dark mode (docs-editor-ui spec §4.11), so these fixed hex values are readable there.
 */

export const PRESENCE_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0284c7",
  "#1f3fad",
  "#57534e",
  "#047857",
] as const;

export type PresenceColor = (typeof PRESENCE_COLORS)[number];

/** FNV-1a 32-bit hash of a string. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable collaborator colour for an org member id (same on every device). */
export function colorForMember(memberId: string | null | undefined): PresenceColor {
  if (!memberId) return PRESENCE_COLORS[6];
  return PRESENCE_COLORS[fnv1a(memberId) % PRESENCE_COLORS.length];
}

export type DocColorName =
  | "black"
  | "darkGray"
  | "gray"
  | "red"
  | "amber"
  | "green"
  | "sky"
  | "blue"
  | "lightAmber"
  | "lightGreen"
  | "lightSky"
  | "lightRed"
  | "lightGray";

export interface DocSwatch {
  readonly name: DocColorName;
  readonly hex: string;
}

export const TEXT_COLORS: readonly DocSwatch[] = [
  { name: "black", hex: "#0a0a0a" },
  { name: "darkGray", hex: "#525252" },
  { name: "gray", hex: "#a3a3a3" },
  { name: "red", hex: "#dc2626" },
  { name: "amber", hex: "#d97706" },
  { name: "green", hex: "#059669" },
  { name: "sky", hex: "#0284c7" },
  { name: "blue", hex: "#1f3fad" },
];

export const HIGHLIGHT_COLORS: readonly DocSwatch[] = [
  { name: "lightAmber", hex: "#fef3c7" },
  { name: "lightGreen", hex: "#d1fae5" },
  { name: "lightSky", hex: "#e0f2fe" },
  { name: "lightRed", hex: "#fee2e2" },
  { name: "lightGray", hex: "#e5e5e5" },
];

/** Column order of `DOC_COLOR_GRID`, used only for ordering — swatches are labelled by hex. */
export const DOC_COLOR_HUES = [
  "redBerry",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "cornflower",
  "blue",
  "purple",
  "magenta",
] as const;

/**
 * Row 0 is greyscale; rows 1–6 run light to dark across `DOC_COLOR_HUES`. Text colour usually comes from the
 * darker rows and highlighting from the lighter ones, so both pickers show the same grid.
 */
export const DOC_COLOR_GRID: readonly (readonly string[])[] = [
  ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"],
  ["#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc"],
  ["#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
  ["#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0"],
  ["#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79"],
  ["#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"],
  ["#5b0f00", "#660000", "#783f04", "#7f6000", "#274e13", "#0c343d", "#1c4587", "#073763", "#20124d", "#4c1130"],
];

const RECENT_KEY = "docs_recent_colors";
const RECENT_MAX = 10;

/** Recently used colours, newest first. Per viewer, read in try/catch (storage can be blocked). */
export function readRecentColors(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHex).filter((hex): hex is string => hex !== null).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecentColor(hex: string): string[] {
  const normalized = normalizeHex(hex);
  if (!normalized) return readRecentColors();
  const next = [normalized, ...readRecentColors().filter((value) => value !== normalized)].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the list just doesn't persist.
  }
  return next;
}

/** Relative luminance, so a swatch's selected tick and the trigger's bar stay visible on light and dark colours. */
export function isLightColor(hex: string): boolean {
  const value = normalizeHex(hex);
  if (!value) return true;
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b) > 0.5;
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalises a CSS colour from a mark attribute to lowercase `#rrggbb`, or null when it isn't a hex colour. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (HEX_RE.test(trimmed)) {
    if (trimmed.length === 4) return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    return trimmed;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(trimmed);
  if (!rgb) return null;
  const toHex = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
  return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
}
