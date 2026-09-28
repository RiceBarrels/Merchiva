// Copy and paste of slide elements and whole slides (slides.md §4.8). Copy writes our own MIME type with the JSON
// payload, text/plain with the copied text, and a small html rendering of that text; the editor also keeps the
// JSON in memory for browsers that drop custom types. Paste reads the custom type first, then the in-memory copy
// when the clipboard still holds the same text; images and plain text are the editor's own fallbacks.
//
// A pasted payload is untrusted (any page can put our MIME type on the clipboard): decodeClipboard runs every
// element and text through the validator, like any other remote input.
import { escapeHtml } from "@/lib/docs/export/utils";
import { DEFAULT_SLIDE_SIZE, SLIDES_ID_RE, SLIDES_MAX_ELEMENTS_PER_SLIDE, SLIDES_MAX_SLIDES } from "@/lib/slides/constants";
import { compareKeyed, isOrderKey } from "@/lib/slides/model/fractional-index";
import { asRecord, sanitizeFill, sanitizeSize, sanitizeTheme, sanitizeTransition } from "@/lib/slides/model/sanitize-parts";
import { THEME_COLOR_SLOTS } from "@/lib/slides/model/safe-values";
import type { Pt, SlideElement, SlideSnapshot, ThemeColorSlot, ThemeSpec } from "@/lib/slides/model/types";
import { sanitizeElement, sanitizeTextJson } from "@/lib/slides/model/validate";
import { slideTexts } from "@/lib/slides/serialize";
import { isLayoutKind } from "@/lib/slides/themes/layouts";
import { DEFAULT_THEME_ID, STARTER_THEMES } from "@/lib/slides/themes/themes";
import { textJsonToPlain } from "@/lib/slides/text/plain";

export const SLIDES_CLIPBOARD_MIME = "application/x-merchiva-slides+json";
/** A longer clipboard string is not parsed at all. */
export const SLIDES_CLIPBOARD_MAX_CHARS = 20_000_000;

export interface SlidesClipboardPayload {
  v: 1;
  kind: "elements" | "slides";
  /** Slide size of the source deck (pt). */
  size: { w: Pt; h: Pt };
  /** Theme of the source deck: theme colour references are resolved against it when the target's differs. */
  theme: ThemeSpec;
  /** kind "elements": the copied elements, sorted by (z, id). */
  elements?: SlideElement[];
  /** kind "slides": the copied slides, in deck order. */
  slides?: SlideSnapshot[];
}

/** Any source of clipboard strings: a DataTransfer (paste or drop event), or a stand-in with the same getData. */
export type ClipboardSource = Pick<DataTransfer, "getData"> & { readonly types?: readonly string[] };

function elementPlain(el: SlideElement): string {
  if (el.type === "text" || el.type === "shape") return textJsonToPlain(el.text).trim();
  if (el.type !== "table") return "";
  const cells = new Map(el.cells.map((cell) => [`${cell.rowId}:${cell.colId}`, cell]));
  const rows = el.rows.map((row) =>
    el.cols
      .map((col) => cells.get(`${row.id}:${col.id}`))
      .filter((cell) => cell !== undefined && !cell.covered)
      .map((cell) => (cell ? textJsonToPlain(cell.text).trim() : ""))
      .join("\t")
      .trim(),
  );
  return rows.filter((row) => row !== "").join("\n");
}

/** The text a payload puts on text/plain (and that the in-memory copy is matched against on paste). */
export function clipboardPlainText(p: SlidesClipboardPayload): string {
  if (p.kind === "elements") return (p.elements ?? []).map(elementPlain).filter((s) => s !== "").join("\n");
  return (p.slides ?? [])
    .map((slide) => {
      const texts = slideTexts(slide);
      return [texts.title, ...texts.lines].filter((s) => s !== "").join("\n");
    })
    .filter((s) => s !== "")
    .join("\n\n");
}

/** The three clipboard strings of a payload: our JSON, its plain text, and that text as html paragraphs. */
export function encodeClipboard(p: SlidesClipboardPayload): { json: string; plain: string; html: string } {
  const plain = clipboardPlainText(p);
  const html = plain === "" ? "" : plain.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  return { json: JSON.stringify(p), plain, html };
}

function sanitizeSlide(raw: unknown): SlideSnapshot | null {
  const r = asRecord(raw);
  if (!r || typeof r.id !== "string" || !SLIDES_ID_RE.test(r.id)) return null;
  const masterId = typeof r.masterId === "string" && (r.masterId === "" || SLIDES_ID_RE.test(r.masterId)) ? r.masterId : "";
  const elements = Array.isArray(r.elements) ? r.elements.slice(0, SLIDES_MAX_ELEMENTS_PER_SLIDE) : [];
  return {
    id: r.id,
    order: isOrderKey(r.order) ? r.order : "",
    layout: isLayoutKind(r.layout) ? r.layout : "blank",
    masterId,
    hidden: r.hidden === true,
    background: r.background === null || r.background === undefined ? null : sanitizeFill(r.background),
    transition: sanitizeTransition(r.transition),
    notes: sanitizeTextJson(r.notes),
    elements: sortByZ(elements.flatMap((el) => sanitizeElement(el) ?? [])),
  };
}

function sortByZ(elements: SlideElement[]): SlideElement[] {
  return elements.sort((a, b) => compareKeyed({ key: a.z, id: a.id }, { key: b.z, id: b.id }));
}

/** An untrusted payload (parsed JSON) → a clean one, or null when it holds nothing usable. */
export function sanitizeClipboardPayload(raw: unknown): SlidesClipboardPayload | null {
  const r = asRecord(raw);
  if (!r || r.v !== 1 || (r.kind !== "elements" && r.kind !== "slides")) return null;
  const base = {
    v: 1 as const,
    size: sanitizeSize(r.size, DEFAULT_SLIDE_SIZE),
    theme: sanitizeTheme(r.theme, STARTER_THEMES[DEFAULT_THEME_ID]),
  };
  if (r.kind === "elements") {
    const raws = Array.isArray(r.elements) ? r.elements.slice(0, SLIDES_MAX_ELEMENTS_PER_SLIDE) : [];
    const elements = sortByZ(raws.flatMap((el) => sanitizeElement(el) ?? []));
    return elements.length > 0 ? { ...base, kind: "elements", elements } : null;
  }
  const raws = Array.isArray(r.slides) ? r.slides.slice(0, SLIDES_MAX_SLIDES) : [];
  const slides = raws.flatMap((s) => sanitizeSlide(s) ?? []);
  return slides.length > 0 ? { ...base, kind: "slides", slides } : null;
}

/** A clipboard JSON string → a clean payload, or null (not ours, malformed, too long, or empty). */
export function parseClipboardPayload(json: string): SlidesClipboardPayload | null {
  if (typeof json !== "string" || json === "" || json.length > SLIDES_CLIPBOARD_MAX_CHARS) return null;
  try {
    return sanitizeClipboardPayload(JSON.parse(json));
  } catch {
    return null;
  }
}

function readData(data: ClipboardSource, type: string): string {
  try {
    return data.getData(type) ?? "";
  } catch {
    return "";
  }
}

const normalizeLines = (s: string) => s.replace(/\r\n?/g, "\n").trim();

/**
 * The payload to paste: our MIME type when present; else the in-memory copy (`memory`, the last copied JSON) when
 * the clipboard still holds its text and no files; else null (the editor then pastes an image or plain text).
 * `data` null (no paste event, e.g. a menu command) uses the in-memory copy.
 */
export function decodeClipboard(data: ClipboardSource | null, memory: string | null): SlidesClipboardPayload | null {
  if (data) {
    const json = readData(data, SLIDES_CLIPBOARD_MIME);
    if (json !== "") return parseClipboardPayload(json);
  }
  if (!memory) return null;
  const payload = parseClipboardPayload(memory);
  if (!payload || data === null) return payload;
  if (data.types?.includes("Files")) return null;
  return normalizeLines(readData(data, "text/plain")) === normalizeLines(clipboardPlainText(payload)) ? payload : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Theme references across decks

/** True when colours referenced as `theme:<slot>` would look different under `b` than under `a`. */
export function themesDiffer(a: ThemeSpec, b: ThemeSpec): boolean {
  return a.id !== b.id || THEME_COLOR_SLOTS.some((slot) => a.colors[slot] !== b.colors[slot]);
}

const COLOR_REF_RE = /^theme:([a-z0-9]+)$/;

function resolveRef(value: string, theme: ThemeSpec): string {
  const slot = COLOR_REF_RE.exec(value)?.[1];
  return slot !== undefined && (THEME_COLOR_SLOTS as readonly string[]).includes(slot) ? theme.colors[slot as ThemeColorSlot] : value;
}

/**
 * A copy of `value` in which every theme colour reference (a `color` field, or a table cell's `fill` string) is
 * replaced by its hex under `theme`. Font references (`theme:heading` / `theme:body`) are kept. The input is a
 * clean element or slide, so its nesting is bounded.
 */
export function resolveThemeColorRefs<T>(value: T, theme: ThemeSpec): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    const record = asRecord(node);
    if (!record) return node;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      out[key] = typeof child === "string" && (key === "color" || key === "fill") ? resolveRef(child, theme) : walk(child);
    }
    return out;
  };
  return walk(value) as T;
}
