// The lean pptxtojson result → a DeckSnapshot (slides.md §10.1 step 3). Pure: no DOM (unless DOMPurify finds one),
// no network. Images stay "pending": each image element or fill is registered with the asset registry, whose
// writers put the uploaded URL in before the deck is built (./assets.ts); finalizeImportedDeck then swaps whatever
// did not upload for a placeholder.
//
// - Size → meta.size, snapped to a preset within 1 pt (959.98 → 960, F17).
// - Theme: `themeColors` → the accents; bg from the first slide's background, text from the dominant text colour
//   (when it reads on that background); heading/body fonts from the text itself (./deck-text.ts).
// - Z-order (F27): a slide's elements, and each group's children, are sorted by `order` before z keys are assigned.
//   Decor goes through orderDecor. Decor → canonical JSON → one master per distinct decor list.
// - Slides are capped at SLIDES_MAX_SLIDES (`slidesTruncated`); hidden flags and animations come from the slide scan.
import {
  SLIDE_SIZE_PRESETS, SLIDES_COORD_LIMIT, SLIDES_MAX_SLIDES, SLIDES_SCHEMA_VERSION,
} from "@/lib/slides/constants";
import { DEFAULT_TEXT_DEFAULTS, DEFAULT_TRANSITION_MS } from "@/lib/slides/model/defaults";
import { newSlidesId, sequentialKeys } from "@/lib/slides/model/fractional-index";
import type {
  DeckSnapshot, Fill, MasterSnapshot, SlideElement, SlideSnapshot, SlideTransition, ThemeSpec,
} from "@/lib/slides/model/types";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";

import { createAssetRegistry, type AssetFailure, type PendingAsset } from "./assets";
import { parseCssColor, luminance } from "./colors";
import { createDeckText, deckFontResolver, elementTextContext, fontStack } from "./deck-text";
import type { ExtractedAsset } from "./dedupe-assets";
import { flattenElements } from "./flatten";
import type { HtmlPurifier } from "./html-to-text";
import { arr, num, rec, records, str, type LeanRecord } from "./lean";
import { imagePlaceholder, mapElement, type ElementContext } from "./map-element";
import { mapFill, type FillContext } from "./map-fill";
import { createImportReportBuilder, type ImportReportBuilder } from "./report";
import type { SlideScan } from "./slide-scan";
import type { LeanParseResult } from "./worker-protocol";

export interface MapPptxContext {
  fileName: string;
  now: number;
  /** The worker's images ("asset:<key>" references resolve here). */
  assets?: readonly ExtractedAsset[];
  scan?: SlideScan;
  /** The Drive file the deck was opened from (kept in meta.source). */
  driveItemId?: string;
  /** Replaces DOMPurify (tests); null = none. Defaults to DOMPurify when a DOM exists. */
  purify?: HtmlPurifier | null;
}

export interface MappedDeck { snapshot: DeckSnapshot; assets: PendingAsset[]; report: ImportReportBuilder }

/**
 * Paint order of layout + master decor. With a `source` tag (only a patched pptxtojson writes one), master decor
 * goes first and layout decor second, each by `order`. Without it the whole list is sorted by `order`, which is
 * never worse than pptxtojson's array order (R17).
 */
export function orderDecor<E extends { order?: unknown; source?: unknown }>(layoutElements: readonly E[]): E[] {
  const sorted = (list: readonly E[]) =>
    list.map((el, i) => ({ el, i })).sort((a, b) => num(a.el.order, -1) - num(b.el.order, -1) || a.i - b.i).map((x) => x.el);
  const tagged = layoutElements.some((el) => el.source === "slideMasterBg" || el.source === "slideLayoutBg");
  if (!tagged) return sorted(layoutElements);
  return [
    ...sorted(layoutElements.filter((el) => el.source === "slideMasterBg")),
    ...sorted(layoutElements.filter((el) => el.source === "slideLayoutBg")),
    ...sorted(layoutElements.filter((el) => el.source !== "slideMasterBg" && el.source !== "slideLayoutBg")),
  ];
}

/** JSON with sorted keys and without the parse-specific `order` / `id` (two layouts with the same decor match). */
function canonical(value: unknown, depth = 0): string {
  if (depth > 32 || typeof value !== "object" || value === null) return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, depth + 1)).join(",")}]`;
  const keys = Object.keys(value).filter((k) => k !== "order" && k !== "id").sort();
  const obj = value as Record<string, unknown>;
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k], depth + 1)}`).join(",")}}`;
}

/** 16 hex digits of two independent 32-bit string hashes (FNV-1a and a multiply-rotate variant). */
function hash16(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
    b = (b << 13) | (b >>> 19);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (Math.imul(b, 0xc2b2ae35) >>> 0).toString(16).padStart(8, "0");
}

function deckSize(raw: unknown): { w: number; h: number } {
  const size = rec(raw);
  const w = num(size?.width, 0);
  const h = num(size?.height, 0);
  if (w <= 0 || h <= 0) return { ...SLIDE_SIZE_PRESETS["16:9"] };
  for (const preset of Object.values(SLIDE_SIZE_PRESETS)) {
    if (Math.abs(w - preset.w) <= 1 && Math.abs(h - preset.h) <= 1) return { w: preset.w, h: preset.h };
  }
  const clamp = (n: number) => Math.min(SLIDES_COORD_LIMIT, Math.max(1, Math.round(n * 100) / 100));
  return { w: clamp(w), h: clamp(h) };
}

/** The first slide's background colour (a gradient's first stop), else white. */
function backgroundHex(slide: LeanRecord | undefined): `#${string}` {
  const fill = rec(slide?.fill);
  if (fill?.type === "color") return parseCssColor(fill.value)?.hex ?? "#ffffff";
  if (fill?.type === "gradient") return parseCssColor(records(rec(fill.value)?.colors)[0]?.color)?.hex ?? "#ffffff";
  return "#ffffff";
}

function importedTheme(parsed: LeanRecord, first: LeanRecord | undefined, stats: { textColor: `#${string}` | null; heading: string; body: string }): ThemeSpec {
  const bg = backgroundHex(first);
  const dark = luminance(bg) < 0.35;
  const base = STARTER_THEMES[dark ? "simple-dark" : "simple-light"];
  const text = stats.textColor && Math.abs(luminance(stats.textColor) - luminance(bg)) >= 0.35 ? stats.textColor : base.colors.text;
  const accents = arr(parsed.themeColors);
  const accent = (i: number) => parseCssColor(accents[i])?.hex ?? base.colors[`accent${i + 1}` as "accent1"];
  return {
    id: "imported",
    colors: {
      ...base.colors,
      bg,
      text,
      accent1: accent(0), accent2: accent(1), accent3: accent(2), accent4: accent(3), accent5: accent(4), accent6: accent(5),
    },
    fonts: { heading: stats.heading || base.fonts.heading, body: stats.body || base.fonts.body },
    background: { t: "solid", color: "theme:bg" },
    decor: "none",
  };
}

function mapTransition(raw: unknown, report: ImportReportBuilder): SlideTransition | null {
  const t = rec(raw);
  const type = str(t?.type);
  if (!t || type === "" || type === "none") return null;
  const durationMs = Math.round(num(t.duration, DEFAULT_TRANSITION_MS));
  if (type === "fade") return { type: "fade", durationMs };
  report.add("transitionApprox");
  return { type: "fade", durationMs, srcType: type.replace(/[^A-Za-z0-9]/g, "").slice(0, 40) };
}

function mapElements(elements: readonly unknown[], ctx: ElementContext, report: ImportReportBuilder, sort: boolean, locked: boolean): SlideElement[] {
  const mapped = flattenElements(elements, report, sort).flatMap((flat) => mapElement(flat, ctx));
  const keys = sequentialKeys(mapped.length);
  // In place: the image writers registered while mapping hold these very objects.
  mapped.forEach((el, i) => {
    el.z = keys[i];
    if (locked) el.locked = true;
  });
  return mapped;
}

/** The lean parse result → a deck snapshot, the images it waits for, and the report so far. */
export function mapPptxToSnapshot(parsed: LeanParseResult, ctx: MapPptxContext): MappedDeck {
  const report = createImportReportBuilder();
  const assets = createAssetRegistry(ctx.assets ?? []);
  const root = rec(parsed) ?? {};
  const all = records(root.slides);
  const kept = all.slice(0, SLIDES_MAX_SLIDES);
  if (all.length > kept.length) report.add("slidesTruncated", all.length - kept.length);

  const deckText = createDeckText(report, ctx.purify);
  const stats = deckText.stats(kept.flatMap((slide) => [records(slide.elements), records(slide.layoutElements)]));
  const heading = fontStack(stats.headingFont) || fontStack(stats.bodyFont);
  const body = fontStack(stats.bodyFont) || heading;
  const theme = importedTheme(root, kept[0], { textColor: stats.textColor, heading, body });
  const fonts = deckFontResolver(report, theme.fonts.heading, theme.fonts.body);
  const fillCtx: FillContext = { report, assets, color: (hex) => hex };
  const elementCtx: ElementContext = { ...fillCtx, ...elementTextContext(deckText, report, fonts, theme.colors.text) };

  const masters = new Map<string, MasterSnapshot>();
  const masterIds = new Set<string>();
  const masterFor = (slide: LeanRecord): string => {
    const decor = orderDecor(records(slide.layoutElements));
    if (decor.length === 0) return "";
    const key = canonical(decor);
    const known = masters.get(key);
    if (known) return known.id;
    let id = `m_${hash16(key)}`;
    for (let n = 2; masterIds.has(id); n++) id = `m_${hash16(`${key}#${n}`)}`;
    masterIds.add(id);
    masters.set(key, { id, name: "", background: null, elements: mapElements(decor, elementCtx, report, false, true) });
    return id;
  };

  const orders = sequentialKeys(kept.length);
  const slides: SlideSnapshot[] = kept.map((slide, i) => {
    const masterId = masterFor(slide);
    const background = mapFill(slide.fill, fillCtx);
    const followsTheme = background?.t === "solid" && background.color === theme.colors.bg && background.alpha === undefined;
    if (ctx.scan?.animated[i]) report.add("animationsDropped");
    return {
      id: newSlidesId(),
      order: orders[i],
      layout: "imported",
      masterId,
      hidden: ctx.scan?.hidden[i] === true,
      background: followsTheme ? null : background,
      transition: mapTransition(slide.transition, report),
      notes: elementCtx.text(slide.note, DEFAULT_TEXT_DEFAULTS).text,
      elements: mapElements(records(slide.elements), elementCtx, report, true, false),
    };
  });

  const driveItemId = ctx.driveItemId && /^[0-9a-f-]{36}$/i.test(ctx.driveItemId) ? ctx.driveItemId.toLowerCase() : undefined;
  const snapshot: DeckSnapshot = {
    meta: {
      schemaVersion: SLIDES_SCHEMA_VERSION,
      size: deckSize(root.size),
      theme,
      source: { kind: "pptx", fileName: ctx.fileName, importedAt: ctx.now, ...(driveItemId ? { driveItemId } : {}) },
    },
    masters: [...masters.values()],
    slides,
  };
  return { snapshot, assets: assets.pending(), report };
}

function finalizeElements(elements: readonly SlideElement[]): SlideElement[] {
  return elements.map((el) => {
    if (el.type === "image" && el.src === "") return imagePlaceholder({ id: el.id, z: el.z, name: el.name, x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot });
    if ((el.type === "text" || el.type === "shape") && el.fill.t === "image" && el.fill.src === "") return { ...el, fill: { t: "none" } };
    return el;
  });
}

function finalizeBackground(fill: Fill | null): Fill | null {
  return fill?.t === "image" && fill.src === "" ? null : fill;
}

/**
 * After the uploads: each failed image is reported once (by its reason), and every image that has no URL becomes a
 * light-grey placeholder (image fills fall back to none, backgrounds to the theme's).
 */
export function finalizeImportedDeck(snapshot: DeckSnapshot, failures: ReadonlyMap<string, AssetFailure>, report: ImportReportBuilder): DeckSnapshot {
  for (const code of failures.values()) report.add(code);
  return {
    meta: snapshot.meta,
    masters: snapshot.masters.map((m) => ({ ...m, background: finalizeBackground(m.background), elements: finalizeElements(m.elements) })),
    slides: snapshot.slides.map((s) => ({ ...s, background: finalizeBackground(s.background), elements: finalizeElements(s.elements) })),
  };
}
