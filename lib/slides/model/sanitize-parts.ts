// Sanitizers for the compound JSON values of the model (fills, strokes, text boxes, themes, …). Each takes
// untrusted input and returns a clean value or null / a default; nothing here throws. Used by ./validate.ts for
// elements and by ./read.ts for slide and deck keys. Output objects never carry `undefined` values (Yjs stores them).
import { SLIDES_COORD_LIMIT, SLIDES_MAX_PATH_CHARS } from "@/lib/slides/constants";
import { isShapePreset } from "@/lib/slides/geometry/presets";
import { parsePath } from "@/lib/slides/geometry/svg-path";
import {
  DEFAULT_STROKE, DEFAULT_TABLE_STYLE, DEFAULT_TEXT_BOX, DEFAULT_TEXT_DEFAULTS, DEFAULT_TRANSITION_MS, MAX_TRANSITION_MS,
} from "@/lib/slides/model/defaults";
import {
  THEME_COLOR_SLOTS, clampNumber, cleanLabel, normalizeRotation, safeColor, safeFontCss, safeHex, safeImageSrc,
} from "@/lib/slides/model/safe-values";
import type {
  ChartData, ColorValue, DashStyle, DeckSource, Fill, FontRef, LineEnd, Shadow, ShapeGeom, SlideTransition, Stroke,
  TableStyle, TextBox, TextDefaults, ThemeColorSlot, ThemeSpec, VAlign,
} from "@/lib/slides/model/types";

export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

const VALIGNS: readonly VAlign[] = ["top", "middle", "bottom"];
const DASHES: readonly DashStyle[] = ["solid", "dash", "dot", "dashDot"];
const LINE_ENDS: readonly LineEnd[] = ["none", "arrow", "triangle", "stealth", "oval", "diamond"];
const ALIGNS: readonly TextDefaults["align"][] = ["left", "center", "right", "justify"];
const STARTER_IDS: readonly ThemeSpec["id"][] = ["simple-light", "simple-dark", "paper", "coastal", "market", "mono", "imported"];
const DECORS: readonly ThemeSpec["decor"][] = ["none", "accentBar", "topBand", "cornerBlock"];
const MAX_STOPS = 10;

export function sanitizeVAlign(value: unknown): VAlign {
  return oneOf(value, VALIGNS, "top");
}

function alpha(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}

/** Adds `alpha` only when it is a real, non-opaque value. */
function withAlpha<T extends object>(base: T, value: unknown): T & { alpha?: number } {
  const a = alpha(value);
  return a === null || a === 1 ? base : { ...base, alpha: a };
}

/** A fill, or null when `raw` is not one. */
export function sanitizeFill(raw: unknown): Fill | null {
  const r = asRecord(raw);
  if (!r) return null;
  switch (r.t) {
    case "none":
      return { t: "none" };
    case "solid": {
      const color = safeColor(r.color);
      return color === null ? null : withAlpha({ t: "solid" as const, color }, r.alpha);
    }
    case "linear": {
      if (!Array.isArray(r.stops)) return null;
      const stops = r.stops
        .slice(0, MAX_STOPS)
        .map((s) => {
          const stop = asRecord(s);
          const color = stop ? safeColor(stop.color) : null;
          if (!stop || color === null) return null;
          return withAlpha({ pos: clampNumber(stop.pos, 0, 1, 0), color }, stop.alpha);
        })
        .filter((s): s is { pos: number; color: ColorValue; alpha?: number } => s !== null)
        .sort((a, b) => a.pos - b.pos);
      if (stops.length < 2) return stops.length === 1 ? withAlpha({ t: "solid" as const, color: stops[0].color }, stops[0].alpha) : null;
      return { t: "linear", angle: normalizeRotation(r.angle), stops };
    }
    case "image": {
      const src = typeof r.src === "string" ? safeImageSrc(r.src) : "";
      return src === "" ? null : { t: "image", src, mode: r.mode === "stretch" ? "stretch" : "cover" };
    }
    default:
      return null;
  }
}

/** A stroke, or null when `raw` is not one (no colour). */
export function sanitizeStroke(raw: unknown): Stroke | null {
  const r = asRecord(raw);
  const color = r ? safeColor(r.color) : null;
  if (!r || color === null) return null;
  const stroke: Stroke = withAlpha(
    { color, width: clampNumber(r.width, 0, 200, DEFAULT_STROKE.width), dash: oneOf(r.dash, DASHES, "solid") },
    r.alpha,
  );
  const head = oneOf(r.head, LINE_ENDS, "none");
  const tail = oneOf(r.tail, LINE_ENDS, "none");
  if (head !== "none") stroke.head = head;
  if (tail !== "none") stroke.tail = tail;
  return stroke;
}

export function sanitizeShadow(raw: unknown): Shadow | null {
  const r = asRecord(raw);
  const color = r ? safeColor(r.color) : null;
  if (!r || color === null) return null;
  return {
    x: clampNumber(r.x, -500, 500, 0),
    y: clampNumber(r.y, -500, 500, 0),
    blur: clampNumber(r.blur, 0, 500, 0),
    color,
    alpha: alpha(r.alpha) ?? 1,
  };
}

export function sanitizeTextBox(raw: unknown): TextBox {
  const r = asRecord(raw) ?? {};
  const d = DEFAULT_TEXT_BOX;
  const inset: readonly unknown[] = Array.isArray(r.inset) && r.inset.length === 4 ? r.inset : d.inset;
  const side = (i: number) => clampNumber(inset[i], 0, 1000, d.inset[i]);
  return {
    vAlign: sanitizeVAlign(r.vAlign ?? d.vAlign),
    inset: [side(0), side(1), side(2), side(3)],
    autofit: r.autofit === "grow" ? "grow" : "none",
    fontScale: clampNumber(r.fontScale, 0.1, 1, 1),
    wrap: bool(r.wrap, true),
    vertical: bool(r.vertical, false),
  };
}

/** A font reference: `theme:heading`, `theme:body` or a safe CSS stack. */
export function sanitizeFontRef(raw: unknown): FontRef | null {
  if (raw === "theme:heading" || raw === "theme:body") return raw;
  return safeFontCss(raw);
}

export function sanitizeTextDefaults(raw: unknown, fallback: TextDefaults = DEFAULT_TEXT_DEFAULTS): TextDefaults {
  const r = asRecord(raw) ?? {};
  return {
    font: sanitizeFontRef(r.font) ?? fallback.font,
    size: clampNumber(r.size, 1, 400, fallback.size),
    color: safeColor(r.color) ?? fallback.color,
    bold: bool(r.bold, fallback.bold),
    align: oneOf(r.align, ALIGNS, fallback.align),
    lineHeight: clampNumber(r.lineHeight, 0.5, 5, fallback.lineHeight),
  };
}

/** Shape geometry; an unusable custom path falls back to a rectangle. */
export function sanitizeGeom(raw: unknown): ShapeGeom {
  const r = asRecord(raw);
  if (r?.kind === "preset" && isShapePreset(r.preset)) return { kind: "preset", preset: r.preset };
  if (r?.kind === "path" && typeof r.d === "string" && r.d.length <= SLIDES_MAX_PATH_CHARS && parsePath(r.d) !== null) {
    const vw = clampNumber(r.vw, 0, 1e7, 0);
    const vh = clampNumber(r.vh, 0, 1e7, 0);
    const srcPreset = typeof r.srcPreset === "string" && /^[A-Za-z0-9]{0,64}$/.test(r.srcPreset) ? r.srcPreset : "";
    if (vw > 0 && vh > 0) return { kind: "path", d: r.d, vw, vh, srcPreset };
  }
  return { kind: "preset", preset: "rect" };
}

export function sanitizeTransition(raw: unknown): SlideTransition | null {
  const r = asRecord(raw);
  if (!r || (r.type !== "none" && r.type !== "fade")) return null;
  const transition: SlideTransition = { type: r.type, durationMs: Math.round(clampNumber(r.durationMs, 0, MAX_TRANSITION_MS, DEFAULT_TRANSITION_MS)) };
  const srcType = cleanLabel(r.srcType, 40);
  if (srcType !== "") transition.srcType = srcType;
  return transition;
}

export function sanitizeTableStyle(raw: unknown): TableStyle {
  const r = asRecord(raw) ?? {};
  const border = asRecord(r.border) ?? {};
  const d = DEFAULT_TABLE_STYLE;
  return {
    border: { color: safeColor(border.color) ?? d.border.color, width: clampNumber(border.width, 0, 50, d.border.width) },
    headerRow: bool(r.headerRow, d.headerRow),
    banded: bool(r.banded, d.banded),
    textStyle: sanitizeTextDefaults(r.textStyle, d.textStyle),
  };
}

export function sanitizeChart(raw: unknown): ChartData {
  const r = asRecord(raw) ?? {};
  const strings = (v: unknown, max: number, len: number) =>
    Array.isArray(v) ? v.slice(0, max).map((s) => cleanLabel(typeof s === "number" ? String(s) : s, len)) : [];
  const series = Array.isArray(r.series)
    ? r.series.slice(0, 50).flatMap((s) => {
        const entry = asRecord(s);
        if (!entry) return [];
        const values = Array.isArray(entry.values)
          ? entry.values.slice(0, 1000).map((n) => (typeof n === "number" && Number.isFinite(n) ? n : 0))
          : [];
        return [{ name: cleanLabel(entry.name, 200), values }];
      })
    : [];
  return {
    kind: cleanLabel(r.kind, 40),
    title: cleanLabel(r.title, 500),
    categories: strings(r.categories, 1000, 200),
    series,
    colors: Array.isArray(r.colors) ? r.colors.slice(0, 50).flatMap((c) => safeHex(c) ?? []) : [],
  };
}

/** A theme; missing or invalid parts come from `fallback`. */
export function sanitizeTheme(raw: unknown, fallback: ThemeSpec): ThemeSpec {
  const r = asRecord(raw);
  if (!r) return fallback;
  const colors = asRecord(r.colors) ?? {};
  const fonts = asRecord(r.fonts) ?? {};
  const outColors = {} as Record<ThemeColorSlot, `#${string}`>;
  for (const slot of THEME_COLOR_SLOTS) outColors[slot] = safeHex(colors[slot]) ?? fallback.colors[slot];
  return {
    id: oneOf(r.id, STARTER_IDS, "imported"),
    colors: outColors,
    fonts: { heading: safeFontCss(fonts.heading) ?? fallback.fonts.heading, body: safeFontCss(fonts.body) ?? fallback.fonts.body },
    background: sanitizeFill(r.background) ?? fallback.background,
    decor: oneOf(r.decor, DECORS, "none"),
  };
}

export function sanitizeDeckSource(raw: unknown): DeckSource | null {
  const r = asRecord(raw);
  if (!r || r.kind !== "pptx") return null;
  const source: DeckSource = {
    kind: "pptx",
    fileName: cleanLabel(r.fileName, 255),
    importedAt: clampNumber(r.importedAt, 0, 8.64e15, 0),
  };
  if (typeof r.driveItemId === "string" && /^[0-9a-f-]{36}$/.test(r.driveItemId)) source.driveItemId = r.driveItemId;
  return source;
}

/** Slide size in pt; each side within [1, SLIDES_COORD_LIMIT], else the fallback. */
export function sanitizeSize(raw: unknown, fallback: { w: number; h: number }): { w: number; h: number } {
  const r = asRecord(raw);
  if (!r) return { w: fallback.w, h: fallback.h };
  return { w: clampNumber(r.w, 1, SLIDES_COORD_LIMIT, fallback.w), h: clampNumber(r.h, 1, SLIDES_COORD_LIMIT, fallback.h) };
}
