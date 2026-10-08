// Element operations on one slide (slides.md §4.3): add, patch, delete, duplicate, z-order, text and paste. One call
// is one transaction (one undo step): a drag commits its final patch once. New elements go on top of the slide; a
// patch writes only the keys whose sanitized value changes, so two people editing different properties of the same
// element (fill vs stroke) both keep their edit.
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import { SLIDES_ID_RE, SLIDES_MAX_ELEMENTS_PER_SLIDE } from "@/lib/slides/constants";
import { resolveThemeColorRefs, themesDiffer, type SlidesClipboardPayload } from "@/lib/slides/clipboard";
import { unionBounds } from "@/lib/slides/geometry/arrange";
import { elementToY } from "@/lib/slides/model/build";
import { isOrderKey, newSlidesId } from "@/lib/slides/model/fractional-index";
import {
  SlidesOpError, among, checkedEntries, isBoolean, isFiniteNumber, isTextDefaults, keyedMaps, keysForInsert, recordOf,
  rekeyMoved, requireSlide, sameJson, transactSlides, type KeyedMap, type PatchCheck,
} from "@/lib/slides/model/ops-slides";
import { ensureCell } from "@/lib/slides/model/ops-table";
import { deckMaps, readDeckMeta, readElement } from "@/lib/slides/model/read";
import { asRecord, sanitizeFill, sanitizeGeom, sanitizeShadow, sanitizeStroke } from "@/lib/slides/model/sanitize-parts";
import { parseTableCellKey } from "@/lib/slides/model/sanitize-table";
import { clampCoord, safeHref, safeImageSrc } from "@/lib/slides/model/safe-values";
import type { ElementPatch, ElementPatchEntry, NewElement, Pt, SlideElement } from "@/lib/slides/model/types";
import { sanitizeElement, sanitizeElementWith } from "@/lib/slides/model/validate";
import { writeTextJson } from "@/lib/slides/text/fragment";
import { blankTextJson } from "@/lib/slides/text/plain";

export type { ElementPatch, ElementPatchEntry, NewElement } from "@/lib/slides/model/types";

type KeysOf<T> = T extends unknown ? keyof T : never;
type PatchKey = KeysOf<ElementPatch>;

const isString: PatchCheck = (value) => typeof value === "string";

/** A preset this version knows, or a usable path (sanitizeGeom turns anything else into a rectangle). */
function isGeom(value: unknown): boolean {
  const r = asRecord(value);
  const geom = sanitizeGeom(value);
  return r !== null && r.kind === geom.kind && (geom.kind === "path" || r.preset === geom.preset);
}

/** Crop fractions the sanitizer keeps (it resets a crop that leaves nothing visible to none). */
function isCrop(value: unknown): boolean {
  const r = asRecord(value);
  const sides = r ? [r.l, r.t, r.r, r.b] : [];
  if (sides.length !== 4 || !sides.every(isFiniteNumber)) return false;
  const [l, t, right, b] = sides.map((n) => Math.min(0.99, Math.max(0, n)));
  return l + right < 1 && t + b < 1;
}

/**
 * Every key a patch can set, with what its value must be. Identity (`id`, `type`), text and table structure are
 * absent, so a patch never sets them. Null is a value only for `stroke` and `shadow`; "" only for `link` (no link).
 */
const PATCH_CHECKS: Readonly<Record<PatchKey, PatchCheck>> = {
  z: isOrderKey,
  x: isFiniteNumber, y: isFiniteNumber, w: isFiniteNumber, h: isFiniteNumber, rot: isFiniteNumber,
  x1: isFiniteNumber, y1: isFiniteNumber, x2: isFiniteNumber, y2: isFiniteNumber,
  locked: isBoolean, flipH: isBoolean, flipV: isBoolean,
  name: isString, alt: isString,
  placeholder: among("", "title", "subtitle", "body"),
  mask: among("", "ellipse", "roundRect"),
  link: (value) => value === "" || (typeof value === "string" && safeHref(value) !== ""),
  src: (value) => typeof value === "string" && safeImageSrc(value) !== "",
  geom: isGeom,
  fill: (value) => sanitizeFill(value) !== null,
  stroke: (value) => value === null || sanitizeStroke(value) !== null,
  shadow: (value) => value === null || sanitizeShadow(value) !== null,
  box: recordOf({
    vAlign: among("top", "middle", "bottom"), inset: (v) => Array.isArray(v) && v.length === 4 && v.every(isFiniteNumber),
    autofit: among("none", "grow"), fontScale: isFiniteNumber, wrap: isBoolean, vertical: isBoolean,
  }),
  textStyle: isTextDefaults,
  crop: isCrop,
};
/** Default offset of a duplicate (pt). */
export const DUPLICATE_OFFSET = 12;

/** The slide's elements map, or null when it has none (only add ops create one). */
function elementsOf(slide: Y.Map<unknown>): Y.Map<unknown> | null {
  const map = slide.get("elements");
  return map instanceof Y.Map ? map : null;
}

/** The highest well-formed z key (the top of the stack), or null. */
function topKey(sorted: readonly KeyedMap[]): string | null {
  const last = sorted.length > 0 ? sorted[sorted.length - 1].key : "";
  return last === "" ? null : last;
}

/** `el` moved by (dx, dy): a box by its corner, a line by both endpoints. */
function shifted<T extends SlideElement>(el: T, dx: Pt, dy: Pt): T {
  if (el.type === "line") {
    return { ...el, x1: clampCoord(el.x1 + dx, el.x1), y1: clampCoord(el.y1 + dy, el.y1), x2: clampCoord(el.x2 + dx, el.x2), y2: clampCoord(el.y2 + dy, el.y2) };
  }
  return { ...el, x: clampCoord(el.x + dx, el.x), y: clampCoord(el.y + dy, el.y) };
}

/** Writes clean elements on top of the stack of `slideId`, in order; returns their ids. */
function stackOnTop(doc: Y.Doc, slideId: string, els: readonly NewElement[]): string[] {
  const slide = requireSlide(doc, slideId);
  let map = elementsOf(slide);
  const sorted = map ? keyedMaps(map, "z") : [];
  if (sorted.length + els.length > SLIDES_MAX_ELEMENTS_PER_SLIDE) throw new SlidesOpError("tooManyElements");
  const taken = new Set<string>(map ? map.keys() : []);
  const keys = keysForInsert(topKey(sorted), null, els.length);
  const clean = els.map((el, i) => {
    let id = typeof el.id === "string" && SLIDES_ID_RE.test(el.id) && !taken.has(el.id) ? el.id : newSlidesId();
    while (taken.has(id)) id = newSlidesId();
    taken.add(id);
    const out = sanitizeElement({ ...el, id, z: keys[i] });
    if (!out) throw new SlidesOpError("invalid");
    return out;
  });
  if (!map) {
    map = new Y.Map<unknown>();
    slide.set("elements", map);
  }
  for (const el of clean) map.set(el.id, elementToY(el));
  return clean.map((el) => el.id);
}

/** Adds elements on top of the slide, in the given order (a valid, unused `id` is kept); returns their ids. */
export function addElements(doc: Y.Doc, slideId: string, els: readonly NewElement[]): string[] {
  if (els.length === 0) return [];
  return transactSlides(doc, () => stackOnTop(doc, slideId, els));
}

/**
 * The sanitized scalar fields of an element map with `patch` applied (text and table structure stand in, they are
 * not read). null for an element type this version does not know (never patched).
 */
function patchedFields(id: string, y: Y.Map<unknown>, patch: Record<string, unknown>): Record<string, unknown> | null {
  const raw: Record<string, unknown> = {};
  y.forEach((value, key) => {
    if (!(value instanceof Y.AbstractType)) raw[key] = value;
  });
  Object.assign(raw, patch, { id, type: y.get("type"), text: blankTextJson() });
  if (raw.type === "table") Object.assign(raw, { rows: [{ id: "r", order: "", h: 1 }], cols: [{ id: "c", order: "", w: 1 }], cells: [] });
  const clean = sanitizeElementWith(raw, blankTextJson);
  return clean ? (clean as unknown as Record<string, unknown>) : null;
}

/**
 * Patches elements of the slide: every key is sanitized as the element's type requires and set only when its value
 * changes; keys that don't belong to the type, `undefined` values, and a null stroke on a line are ignored. A value
 * its sanitizer would replace rather than keep (a bad colour or fill, a non-https image, a non-finite number) throws
 * invalid before anything is written; finite numbers are still clamped. Elements that are gone are skipped.
 */
export function updateElements(doc: Y.Doc, slideId: string, entries: readonly ElementPatchEntry[]): void {
  if (entries.length === 0) return;
  const checked = entries.map(({ id, patch }) => ({ id, patch: checkedEntries(patch, PATCH_CHECKS) }));
  transactSlides(doc, () => {
    const map = elementsOf(requireSlide(doc, slideId));
    if (!map) return;
    const writes: Array<[Y.Map<unknown>, string, unknown]> = [];
    for (const { id, patch } of checked) {
      const y = SLIDES_ID_RE.test(id) ? map.get(id) : undefined;
      if (!(y instanceof Y.Map) || patch.length === 0) continue;
      const clean = patchedFields(id, y, Object.fromEntries(patch));
      if (!clean) continue;
      for (const [key, value] of patch) {
        if (!(key in clean) || (value === null && clean[key] !== null)) continue;
        if (!sameJson(y.get(key), clean[key])) writes.push([y, key, clean[key]]);
      }
    }
    for (const [y, key, value] of writes) y.set(key, value);
  });
}

/** Deletes elements of the slide (ids that are gone are ignored). */
export function deleteElements(doc: Y.Doc, slideId: string, ids: readonly string[]): void {
  if (ids.length === 0) return;
  transactSlides(doc, () => {
    const map = elementsOf(requireSlide(doc, slideId));
    if (!map) return;
    for (const id of ids) if (SLIDES_ID_RE.test(id) && map.has(id)) map.delete(id);
  });
}

/** Copies elements on top of the slide, moved by `offset` pt (default 12) on both axes; returns the new ids. */
export function duplicateElements(doc: Y.Doc, slideId: string, ids: readonly string[], offset: Pt = DUPLICATE_OFFSET): string[] {
  return transactSlides(doc, () => {
    const map = elementsOf(requireSlide(doc, slideId));
    if (!map) return [];
    const wanted = new Set(ids);
    const copies = keyedMaps(map, "z")
      .filter((e) => wanted.has(e.id))
      .flatMap((e) => readElement(e.id, e.y) ?? [])
      .map((el) => ({ ...shifted(el, offset, offset), id: undefined }));
    return copies.length > 0 ? stackOnTop(doc, slideId, copies) : [];
  });
}

/** One step towards the end of `order` for every selected run that has an unselected neighbour there. */
function stepUp(order: readonly string[], selected: ReadonlySet<string>): string[] {
  const out = [...order];
  for (let i = out.length - 2; i >= 0; i--) {
    if (selected.has(out[i]) && !selected.has(out[i + 1])) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  }
  return out;
}

/**
 * Z-order: "front" / "back" move the selection above / below everything else; "forward" / "backward" move each
 * selected run one element up / down. Relative order within the selection is kept; only moved elements are re-keyed,
 * plus any tied z key rekeyMoved repairs.
 */
export function reorderElements(doc: Y.Doc, slideId: string, ids: readonly string[], op: "front" | "forward" | "backward" | "back"): void {
  transactSlides(doc, () => {
    const map = elementsOf(requireSlide(doc, slideId));
    if (!map) return;
    const sorted = keyedMaps(map, "z");
    const wanted = new Set(ids);
    const selected = new Set(sorted.filter((e) => wanted.has(e.id)).map((e) => e.id));
    if (selected.size === 0) return;
    const current = sorted.map((e) => e.id);
    const rest = current.filter((id) => !selected.has(id));
    const chosen = current.filter((id) => selected.has(id));
    let next: string[];
    if (op === "front") next = [...rest, ...chosen];
    else if (op === "back") next = [...chosen, ...rest];
    else if (op === "forward") next = stepUp(current, selected);
    else next = stepUp([...current].reverse(), selected).reverse();
    if (next.every((id, i) => id === current[i])) return;
    const byId = new Map(sorted.map((e) => [e.id, e.y]));
    for (const [id, key] of rekeyMoved(sorted, next, selected)) byId.get(id)?.set("z", key);
  });
}

/**
 * Replaces the text of a text or shape element, or of one table cell (`cellKey` = "rowId:colId", created when it is
 * missing), with `json` (sanitized). The fragment is diff-updated (updateYFragment), so unchanged paragraphs keep
 * their Yjs items and a concurrent edit elsewhere in the same text survives.
 */
export function setElementText(doc: Y.Doc, slideId: string, id: string, json: JSONContent, cellKey?: string): void {
  transactSlides(doc, () => {
    const map = elementsOf(requireSlide(doc, slideId));
    const y = map && SLIDES_ID_RE.test(id) ? map.get(id) : undefined;
    if (!(y instanceof Y.Map)) throw new SlidesOpError("notFound");
    let owner: Y.Map<unknown> = y;
    if (cellKey !== undefined) {
      const ids = parseTableCellKey(cellKey);
      const rows = y.get("rows");
      const cols = y.get("cols");
      const cells = y.get("cells");
      if (y.get("type") !== "table" || !ids || !(rows instanceof Y.Map) || !(cols instanceof Y.Map) || !(cells instanceof Y.Map)) {
        throw new SlidesOpError("invalid");
      }
      if (!rows.has(ids.rowId) || !cols.has(ids.colId)) throw new SlidesOpError("notFound");
      owner = ensureCell(cells as Y.Map<Y.Map<unknown>>, ids.rowId, ids.colId);
    } else if (y.get("type") !== "text" && y.get("type") !== "shape") {
      throw new SlidesOpError("invalid");
    }
    let fragment = owner.get("text");
    if (!(fragment instanceof Y.XmlFragment)) {
      fragment = new Y.XmlFragment();
      owner.set("text", fragment);
    }
    writeTextJson(fragment as Y.XmlFragment, json);
  });
}

/**
 * Pastes copied elements on top of the slide with new ids. With `at`, the group's top-left corner lands there;
 * without it they keep their positions. From a deck with other theme colours, theme colour references become the
 * source's hex. Returns the new ids; [] for a slides payload (see pasteSlides).
 */
export function pasteElements(doc: Y.Doc, slideId: string, payload: SlidesClipboardPayload, at?: { x: Pt; y: Pt }): string[] {
  let els = payload.kind === "elements" ? [...(payload.elements ?? [])] : [];
  if (els.length === 0) return [];
  if (themesDiffer(payload.theme, readDeckMeta(deckMaps(doc).deck).theme)) els = els.map((el) => resolveThemeColorRefs(el, payload.theme));
  const bounds = at ? unionBounds(els) : null;
  if (at && bounds) els = els.map((el) => shifted(el, at.x - bounds.x, at.y - bounds.y));
  return addElements(doc, slideId, els.map((el) => ({ ...el, id: undefined })));
}
