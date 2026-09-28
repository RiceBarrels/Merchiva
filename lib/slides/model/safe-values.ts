// Scalar sanitizers shared by the model validator, the text schema and the renderers (slides.md §4.2, §13).
// Everything that ends up in an href, an image src, an inline style or a DOM attribute passes one of these, on
// write AND on read. Re-exported by ./validate.ts, which is the public entry point; the text schema imports this
// file directly so the validator and the schema do not import each other.
import { normalizeHex } from "@/lib/docs/colors";
import { SLIDES_COORD_LIMIT } from "@/lib/slides/constants";
import type { ColorValue, ThemeColorSlot } from "@/lib/slides/model/types";

export const THEME_COLOR_SLOTS: readonly ThemeColorSlot[] = [
  "bg", "text", "muted", "surface", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "link",
];

/** Longest href or image src kept. */
export const SLIDES_URL_MAX = 2048;

// C0 and C1 controls, DEL, and the bidi controls a URL or label could hide behind.
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Removes control and bidi-control characters. */
export function stripControls(raw: string): string {
  return raw.replace(CONTROL_RE, "");
}

/** A short display string (names, alt text, labels): controls stripped, trimmed, capped at `max` characters. */
export function cleanLabel(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return Array.from(stripControls(raw).trim()).slice(0, max).join("");
}

function parseUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  const cleaned = stripControls(raw).trim();
  if (cleaned === "" || cleaned.length > SLIDES_URL_MAX) return null;
  try {
    return new URL(cleaned);
  } catch {
    return null;
  }
}

/** A link target: "" unless an absolute http:, https: or mailto: URL. Returns the parsed (normalized) href. */
export function safeHref(raw: string): string {
  const url = parseUrl(raw);
  if (!url || !["http:", "https:", "mailto:"].includes(url.protocol)) return "";
  if (url.protocol !== "mailto:" && (url.username !== "" || url.password !== "")) return "";
  return url.href.length <= SLIDES_URL_MAX ? url.href : "";
}

/**
 * An image source: "" unless https:, or http: on localhost / 127.0.0.1 while NODE_ENV is "development". No data:,
 * blob:, javascript:, drive: or relative URLs, and no credentials. Stricter than lib/docs/uploads.ts
 * normalizeImageUrl, which accepts any http: URL.
 */
export function safeImageSrc(raw: string): string {
  const url = parseUrl(raw);
  if (!url || url.username !== "" || url.password !== "") return "";
  const devHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    process.env.NODE_ENV === "development";
  if (url.protocol !== "https:" && !devHttp) return "";
  return url.href.length <= SLIDES_URL_MAX ? url.href : "";
}

/** `#rrggbb` (lowercase; #rgb and rgb() are normalized) or `theme:<slot>`; null otherwise. */
export function safeColor(raw: unknown): ColorValue | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.startsWith("theme:")) {
    const slot = value.slice("theme:".length);
    return (THEME_COLOR_SLOTS as readonly string[]).includes(slot) ? (`theme:${slot}` as ColorValue) : null;
  }
  const hex = normalizeHex(value);
  return hex === null ? null : (hex as ColorValue);
}

/** A literal `#rrggbb` only (no theme reference); null otherwise. */
export function safeHex(raw: unknown): `#${string}` | null {
  const color = safeColor(raw);
  return color !== null && color.startsWith("#") ? (color as `#${string}`) : null;
}

const FONT_CSS_RE = /^[\p{L}\p{N} ,'"_-]{1,200}$/u;

/** A CSS font stack made of names, spaces, commas and quotes only (rejects `;`, `(`, `)`, `:` and so `url(`). */
export function safeFontCss(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value !== "" && FONT_CSS_RE.test(value) ? value : null;
}

/** A finite number within `[min, max]`, else `fallback`. */
export function clampNumber(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** A finite coordinate clamped to ±SLIDES_COORD_LIMIT, else `fallback`. */
export function clampCoord(n: unknown, fallback: number): number {
  return clampNumber(n, -SLIDES_COORD_LIMIT, SLIDES_COORD_LIMIT, fallback);
}

/** Degrees normalized to [0, 360); `fallback` for a non-finite value. */
export function normalizeRotation(n: unknown, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  const r = ((n % 360) + 360) % 360;
  return r === 360 ? 0 : r;
}
