// Slide-level operations (slides.md §4.3), plus the helpers the element and table ops share. Every op runs inside
// transactSlides (one transaction = one undo step, origin SLIDES_ORIGIN), checks everything before its first write
// (a Yjs transaction cannot roll back) and throws SlidesOpError at the caps. Ops never trust the doc: keys failing
// SLIDES_ID_RE and values of the wrong Y type are skipped exactly as the readers skip them, and nothing a reader
// would reject is ever written (build.ts sanitizes every slide, element and text on the way in).
import * as Y from "yjs";

import {
  SLIDES_ID_RE, SLIDES_MAX_SLIDES, SLIDES_ORIGIN, SLIDES_SCHEMA_VERSION, SLIDES_SILENT_ORIGIN,
} from "@/lib/slides/constants";
import { slideToY } from "@/lib/slides/model/build";
import {
  compareKeyed, gapAround, isOrderKey, keyBetween, keysBetween, newSlidesId, repairDuplicateKeys, sequentialKeys,
} from "@/lib/slides/model/fractional-index";
import { deckMaps, readDeckMeta, readSlide } from "@/lib/slides/model/read";
import {
  asRecord, sanitizeDeckSource, sanitizeFill, sanitizeFontRef, sanitizeSize, sanitizeTheme, sanitizeTransition,
} from "@/lib/slides/model/sanitize-parts";
import { safeColor } from "@/lib/slides/model/safe-values";
import type {
  DeckMeta, LayoutKind, NewElement, Pt, SlideElement, SlideSnapshot, ThemeSpec,
} from "@/lib/slides/model/types";
import { resolveThemeColorRefs, themesDiffer, type SlidesClipboardPayload } from "@/lib/slides/clipboard";
import { isLayoutKind, layoutPlaceholders } from "@/lib/slides/themes/layouts";
import { blankTextJson } from "@/lib/slides/text/plain";

export type SlidesOpErrorCode = "lastSlide" | "tooManySlides" | "tooManyElements" | "notFound" | "invalid";

/** A refused op. `code` maps to copy in the editor (slides.editor.lastSlide, tooManySlides, tooManyElements). */
export class SlidesOpError extends Error {
  constructor(readonly code: SlidesOpErrorCode, message?: string) {
    super(message ?? `[slides.${code}]`);
    this.name = "SlidesOpError";
  }
}

/** Runs `fn` in one Yjs transaction with `origin` (default SLIDES_ORIGIN: tracked by undo, pushed by the provider). */
export function transactSlides<T>(doc: Y.Doc, fn: () => T, origin: symbol = SLIDES_ORIGIN): T {
  return doc.transact(() => fn(), origin);
}

// ---------------------------------------------------------------------------------------------------------------
// Shared helpers

/** Deep equality of JSON values (object key order ignored). A Y type is never equal to anything but itself. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (a instanceof Y.AbstractType || b instanceof Y.AbstractType) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => sameJson(value, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && sameJson(left[key], right[key]));
}

/** Sets `key` only when the stored value differs (so an unchanged value produces no update). */
export function setIfChanged(map: Y.Map<unknown>, key: string, value: unknown): void {
  if (!sameJson(map.get(key), value)) map.set(key, value);
}

/** True when a patch value survives its sanitizer (clamped or normalized at most) instead of being replaced. */
export type PatchCheck = (value: unknown) => boolean;
export const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const isBoolean: PatchCheck = (value) => typeof value === "boolean";
export const isColor: PatchCheck = (value) => safeColor(value) !== null;
export const among = (...allowed: readonly unknown[]): PatchCheck => (value) => allowed.includes(value);
/** An object whose listed fields all pass (fields the sanitizer does not read are ignored). */
export function recordOf(checks: Readonly<Record<string, PatchCheck>>): PatchCheck {
  return (value) => {
    const r = asRecord(value);
    return r !== null && Object.entries(checks).every(([key, check]) => check(r[key]));
  };
}
/** A complete text style (element `textStyle`, table `style.textStyle`). */
export const isTextDefaults = recordOf({
  font: (value) => sanitizeFontRef(value) !== null, size: isFiniteNumber, color: isColor, bold: isBoolean,
  align: among("left", "center", "right", "justify"), lineHeight: isFiniteNumber,
});

/**
 * The defined entries of `patch` under a key of `checks` (others are ignored). A value that fails its check throws
 * invalid: the sanitizer would replace it with a default, and so erase the stored value instead of refusing.
 */
export function checkedEntries<K extends string>(patch: unknown, checks: Readonly<Record<K, PatchCheck>>): Array<[K, unknown]> {
  const r = asRecord(patch);
  if (!r) throw new SlidesOpError("invalid");
  const out: Array<[K, unknown]> = [];
  for (const [key, value] of Object.entries(r)) {
    if (value === undefined || !Object.prototype.hasOwnProperty.call(checks, key)) continue;
    if (!checks[key as K](value)) throw new SlidesOpError("invalid");
    out.push([key as K, value]);
  }
  return out;
}

export interface KeyedMap { id: string; key: string; y: Y.Map<unknown> }

/** The Y.Map entries of `map` under valid ids, with their order key (`field`; "" when malformed), sorted by (key, id). */
export function keyedMaps<T>(map: Y.Map<T>, field: "order" | "z"): KeyedMap[] {
  const out: KeyedMap[] = [];
  map.forEach((value, id) => {
    if (!SLIDES_ID_RE.test(id) || !(value instanceof Y.Map)) return;
    const y = value as Y.Map<unknown>;
    const key: unknown = y.get(field);
    out.push({ id, key: isOrderKey(key) ? key : "", y });
  });
  return out.sort(compareKeyed);
}

/** The slide map under `slideId`; SlidesOpError("notFound") when there is none. */
export function requireSlide(doc: Y.Doc, slideId: string): Y.Map<unknown> {
  const y = SLIDES_ID_RE.test(slideId) ? deckMaps(doc).slides.get(slideId) : undefined;
  if (!(y instanceof Y.Map)) throw new SlidesOpError("notFound");
  return y;
}

/** Up to this many new keys are jittered one by one; a longer run is spaced evenly (then repaired if it collides). */
const JITTER_RUN_MAX = 16;

/** `n` ascending keys strictly between `a` and `b` (null = open end), jittered so concurrent inserts differ. */
export function keysForInsert(a: string | null, b: string | null, n: number): string[] {
  if (n > JITTER_RUN_MAX) return keysBetween(a, b, n);
  const out: string[] = [];
  let lo = a;
  for (let i = 0; i < n; i++) {
    lo = keyBetween(lo, b, { jitter: true });
    out.push(lo);
  }
  return out;
}

/**
 * New keys for the `moved` entries so that the list reads `order` (ids); each run of moved ids goes into the gap
 * between its fixed neighbours. Fixed entries keep their keys, except tied or malformed ones (before the deck
 * store's repair lands): those get repairDuplicateKeys' keys in the same write, as that repair would give them, so
 * a run aimed between two tied entries has a real gap instead of landing after both.
 */
export function rekeyMoved(
  entries: ReadonlyArray<{ id: string; key: string }>,
  order: readonly string[],
  moved: ReadonlySet<string>,
): Map<string, string> {
  const keyOf = new Map(entries.map((e) => [e.id, e.key]));
  const out = new Map<string, string>();
  for (const fix of repairDuplicateKeys(entries)) {
    keyOf.set(fix.id, fix.key);
    if (!moved.has(fix.id)) out.set(fix.id, fix.key);
  }
  let i = 0;
  while (i < order.length) {
    if (!moved.has(order[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < order.length && moved.has(order[j])) j++;
    const a = i > 0 ? keyOf.get(order[i - 1]) || null : null;
    let b: string | null = null;
    for (let k = j; k < order.length && b === null; k++) {
      const key = moved.has(order[k]) ? "" : keyOf.get(order[k]) ?? "";
      if (key !== "" && (a === null || key > a)) b = key;
    }
    keysForInsert(a, b, j - i).forEach((key, k) => out.set(order[i + k], key));
    i = j;
  }
  return out;
}

/** A slide element from a new one, with its id and z key. */
export function placeElement(el: NewElement, id: string, z: string): SlideElement {
  return { ...el, id, z } as SlideElement;
}

/** A new slide of `layout`: its placeholders scaled to `size`, fresh ids, no background or transition. */
export function newSlideSnapshot(id: string, order: string, layout: LayoutKind, masterId: string, size: { w: Pt; h: Pt }): SlideSnapshot {
  const placeholders = layoutPlaceholders(layout, size);
  const z = sequentialKeys(placeholders.length);
  return {
    id,
    order,
    layout,
    masterId,
    hidden: false,
    background: null,
    transition: null,
    notes: blankTextJson(),
    elements: placeholders.map((el, i) => placeElement(el, newSlidesId(), z[i])),
  };
}

/** Index of `afterSlideId` in `sorted`: null → -1 (before the first); an id no longer there → the last. */
function afterIndex(sorted: readonly KeyedMap[], afterSlideId: string | null): number {
  if (afterSlideId === null) return -1;
  const index = sorted.findIndex((e) => e.id === afterSlideId);
  return index >= 0 ? index : sorted.length - 1;
}

function isMasterIdValue(value: unknown): value is string {
  return typeof value === "string" && (value === "" || SLIDES_ID_RE.test(value));
}

/** A copy of a slide under a new id and order key, with new element ids. */
function copySlide(s: SlideSnapshot, id: string, order: string): SlideSnapshot {
  return { ...s, id, order, elements: s.elements.map((el) => ({ ...el, id: newSlidesId() })) };
}

// ---------------------------------------------------------------------------------------------------------------
// Slide ops

/**
 * Inserts a slide of `layout` after `afterSlideId` (null = before the first slide; an id that is gone = at the end)
 * with the layout's placeholders at the deck size. `masterId` defaults to the previous slide's, else "theme".
 */
export function insertSlide(doc: Y.Doc, input: { afterSlideId: string | null; layout: LayoutKind; masterId?: string }): string {
  return transactSlides(doc, () => {
    const { deck, slides } = deckMaps(doc);
    const sorted = keyedMaps(slides, "order");
    if (sorted.length >= SLIDES_MAX_SLIDES) throw new SlidesOpError("tooManySlides");
    if (!isLayoutKind(input.layout)) throw new SlidesOpError("invalid");
    if (input.masterId !== undefined && !isMasterIdValue(input.masterId)) throw new SlidesOpError("invalid");
    const index = afterIndex(sorted, input.afterSlideId);
    const previous: unknown = index >= 0 ? sorted[index].y.get("masterId") : undefined;
    const masterId = input.masterId ?? (isMasterIdValue(previous) ? previous : "theme");
    const { a, b } = gapAround(sorted, index);
    const id = newSlidesId();
    const meta = readDeckMeta(deck);
    slides.set(id, slideToY(newSlideSnapshot(id, keyBetween(a, b, { jitter: true }), input.layout, masterId, meta.size)));
    return id;
  });
}

/** Copies the slides (in deck order) right after the last of them; returns the new ids in order. */
export function duplicateSlides(doc: Y.Doc, slideIds: readonly string[]): string[] {
  return transactSlides(doc, () => {
    const { slides } = deckMaps(doc);
    const sorted = keyedMaps(slides, "order");
    const wanted = new Set(slideIds);
    const sources = sorted.filter((e) => wanted.has(e.id));
    if (sources.length === 0) return [];
    if (sorted.length + sources.length > SLIDES_MAX_SLIDES) throw new SlidesOpError("tooManySlides");
    const snapshots = sources.flatMap((e) => readSlide(e.id, e.y) ?? []);
    const { a, b } = gapAround(sorted, sorted.indexOf(sources[sources.length - 1]));
    const keys = keysForInsert(a, b, snapshots.length);
    return snapshots.map((s, i) => {
      const id = newSlidesId();
      slides.set(id, slideToY(copySlide(s, id, keys[i])));
      return id;
    });
  });
}

/** Deletes the slides. Throws lastSlide when that would leave this doc without a slide (a local guard only). */
export function deleteSlides(doc: Y.Doc, slideIds: readonly string[]): void {
  transactSlides(doc, () => {
    const { slides } = deckMaps(doc);
    const sorted = keyedMaps(slides, "order");
    const wanted = new Set(slideIds);
    const doomed = sorted.filter((e) => wanted.has(e.id));
    if (doomed.length === 0) return;
    if (doomed.length >= sorted.length) throw new SlidesOpError("lastSlide");
    for (const e of doomed) slides.delete(e.id);
  });
}

/**
 * Empty-deck repair: when the doc holds no slide, adds one "title" slide (and any missing deck key) with
 * SLIDES_SILENT_ORIGIN, so it never enters undo. Returns the new slide id, or the first slide's when there is one.
 */
export function seedFirstSlide(doc: Y.Doc, deck: DeckMeta): string {
  return transactSlides(
    doc,
    () => {
      const maps = deckMaps(doc);
      const sorted = keyedMaps(maps.slides, "order");
      if (sorted.length > 0) return sorted[0].id;
      const meta = readDeckMeta(maps.deck);
      const size = sanitizeSize(deck.size, meta.size);
      if (!maps.deck.has("schemaVersion")) maps.deck.set("schemaVersion", SLIDES_SCHEMA_VERSION);
      if (!maps.deck.has("size")) maps.deck.set("size", size);
      if (!maps.deck.has("theme")) maps.deck.set("theme", sanitizeTheme(deck.theme, meta.theme));
      if (!maps.deck.has("source")) maps.deck.set("source", sanitizeDeckSource(deck.source));
      const id = newSlidesId();
      maps.slides.set(id, slideToY(newSlideSnapshot(id, keyBetween(null, null, { jitter: true }), "title", "theme", size)));
      return id;
    },
    SLIDES_SILENT_ORIGIN,
  );
}

/**
 * Moves the slides (keeping their relative order) before `beforeSlideId` (null = to the end). Only the moved slides
 * get new keys, plus any tied key rekeyMoved repairs. Moving a block onto one of its own slides is a no-op; an id
 * that is gone means the end.
 */
export function moveSlides(doc: Y.Doc, slideIds: readonly string[], beforeSlideId: string | null): void {
  transactSlides(doc, () => {
    const { slides } = deckMaps(doc);
    const sorted = keyedMaps(slides, "order");
    const wanted = new Set(slideIds);
    const moving = sorted.filter((e) => wanted.has(e.id));
    if (moving.length === 0 || (beforeSlideId !== null && moving.some((e) => e.id === beforeSlideId))) return;
    const rest = sorted.filter((e) => !wanted.has(e.id));
    const found = beforeSlideId === null ? -1 : rest.findIndex((e) => e.id === beforeSlideId);
    const at = found >= 0 ? found : rest.length;
    const order = [...rest.slice(0, at), ...moving, ...rest.slice(at)].map((e) => e.id);
    if (order.every((id, i) => id === sorted[i].id)) return;
    const byId = new Map(sorted.map((e) => [e.id, e.y]));
    for (const [id, key] of rekeyMoved(sorted, order, new Set(moving.map((e) => e.id)))) byId.get(id)?.set("order", key);
  });
}

export type SlidePropsPatch = Partial<Pick<SlideSnapshot, "hidden" | "background" | "transition" | "layout" | "masterId">>;

/** Sets slide properties on every listed slide (only the keys whose value changes). Invalid values throw invalid. */
export function setSlidesProps(doc: Y.Doc, slideIds: readonly string[], patch: SlidePropsPatch): void {
  const clean: Array<[string, unknown]> = [];
  if (patch.hidden !== undefined) {
    if (typeof patch.hidden !== "boolean") throw new SlidesOpError("invalid");
    clean.push(["hidden", patch.hidden]);
  }
  if (patch.background !== undefined) {
    const fill = patch.background === null ? null : sanitizeFill(patch.background);
    if (patch.background !== null && fill === null) throw new SlidesOpError("invalid");
    clean.push(["background", fill]);
  }
  if (patch.transition !== undefined) {
    const transition = patch.transition === null ? null : sanitizeTransition(patch.transition);
    if (patch.transition !== null && transition === null) throw new SlidesOpError("invalid");
    clean.push(["transition", transition]);
  }
  if (patch.layout !== undefined) {
    if (!isLayoutKind(patch.layout)) throw new SlidesOpError("invalid");
    clean.push(["layout", patch.layout]);
  }
  if (patch.masterId !== undefined) {
    if (!isMasterIdValue(patch.masterId)) throw new SlidesOpError("invalid");
    clean.push(["masterId", patch.masterId]);
  }
  if (clean.length === 0) return;
  transactSlides(doc, () => {
    const { slides } = deckMaps(doc);
    const wanted = new Set(slideIds);
    for (const e of keyedMaps(slides, "order")) {
      if (wanted.has(e.id)) for (const [key, value] of clean) setIfChanged(e.y, key, value);
    }
  });
}

/** Replaces the deck theme (sanitized; invalid parts keep the current theme's). Slides on master "theme" follow. */
export function applyTheme(doc: Y.Doc, theme: ThemeSpec): void {
  transactSlides(doc, () => {
    const { deck } = deckMaps(doc);
    setIfChanged(deck, "theme", sanitizeTheme(theme, readDeckMeta(deck).theme));
  });
}

/**
 * Pastes copied slides after `afterSlideId` (null = before the first; an id that is gone = at the end), with new
 * slide and element ids. From a deck with other theme colours, theme colour references become the source's hex;
 * a master this deck lacks becomes "" (no decor). Returns the new ids in order; [] for an elements payload.
 */
export function pasteSlides(doc: Y.Doc, afterSlideId: string | null, payload: SlidesClipboardPayload): string[] {
  const source = payload.kind === "slides" ? payload.slides ?? [] : [];
  if (source.length === 0) return [];
  return transactSlides(doc, () => {
    const { deck, slides, masters } = deckMaps(doc);
    const sorted = keyedMaps(slides, "order");
    if (sorted.length + source.length > SLIDES_MAX_SLIDES) throw new SlidesOpError("tooManySlides");
    const resolve = themesDiffer(payload.theme, readDeckMeta(deck).theme);
    const { a, b } = gapAround(sorted, afterIndex(sorted, afterSlideId));
    const keys = keysForInsert(a, b, source.length);
    return source.map((s, i) => {
      const id = newSlidesId();
      const known = s.masterId === "" || s.masterId === "theme" || masters.get(s.masterId) instanceof Y.Map;
      let copy = copySlide({ ...s, masterId: known ? s.masterId : "" }, id, keys[i]);
      if (resolve) copy = resolveThemeColorRefs(copy, payload.theme);
      slides.set(id, slideToY(copy));
      return id;
    });
  });
}
