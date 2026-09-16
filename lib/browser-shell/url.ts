import { matchRoute, resolveLegacyRedirect } from "./routes";
import type { TabUrl, UrlKey } from "./types";

/** Root of every tabbable URL. */
export const MANAGER_ROOT = "/manager";
/** Never part of a tab URL (DynamicUIElement writes `?dialogs=`: components/ui/dynamic-ui-element.tsx:165). */
export const TRANSIENT_PARAMS: readonly string[] = ["dialogs"];
/** Longer inputs are rejected outright (keeps storage and history stamps bounded). */
export const MAX_URL_LEN = 2048;

/** Base used when there is no `window` (unit tests, SSR). */
const FALLBACK_BASE = "http://local/";

export interface CanonicalUrl {
  url: TabUrl;
  key: UrlKey;
  pathname: string;
  /** "" or "?a=1&b=2" (original order, transient params removed). */
  search: string;
  tabbable: boolean;
}

function defaultBase(): string {
  if (typeof window !== "undefined" && window.location?.href) return window.location.href;
  return FALLBACK_BASE;
}

/** Trims trailing slashes except on a bare "/". Static builds add them (next.config.ts trailingSlash). */
function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Decoded name of one raw `name=value` query segment. */
function paramName(segment: string): string {
  const eq = segment.indexOf("=");
  const raw = eq < 0 ? segment : segment.slice(0, eq);
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function keyOf(pathname: string, search: string): UrlKey {
  if (!search) return pathname;
  const params = new URLSearchParams(search);
  params.sort();
  const sorted = params.toString();
  return sorted ? `${pathname}?${sorted}` : pathname;
}

/**
 * Parses `input` against `base` (default `window.location.href`; tests pass "http://local/").
 * Returns null when the input can't be parsed, points at another origin (or scheme), or is
 * longer than MAX_URL_LEN. Strips the hash, trailing slashes and TRANSIENT_PARAMS; keeps the
 * remaining query segments byte-for-byte in their original order. `key` sorts the params.
 */
export function canonicalizeUrl(input: string, base?: string): CanonicalUrl | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_URL_LEN) return null;

  let baseUrl: URL;
  let parsed: URL;
  try {
    baseUrl = new URL(base ?? defaultBase());
    parsed = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }
  // Compare scheme + host rather than `origin`: non-special schemes such as
  // capacitor:// report origin "null", which would make every such URL match.
  if (parsed.protocol !== baseUrl.protocol || parsed.host !== baseUrl.host) return null;

  const pathname = normalizePathname(parsed.pathname);
  const segments = parsed.search
    .replace(/^\?/, "")
    .split("&")
    .filter((segment) => segment !== "" && !TRANSIENT_PARAMS.includes(paramName(segment)));
  const search = segments.length > 0 ? `?${segments.join("&")}` : "";
  const url = `${pathname}${search}`;
  if (url.length > MAX_URL_LEN) return null;

  return { url, key: keyOf(pathname, search), pathname, search, tabbable: isTabbablePathname(pathname) };
}

/** `pathname === "/manager" || startsWith("/manager/")`, excluding `/manager/setup` and `/manager/setup/…`. */
export function isTabbablePathname(pathname: string): boolean {
  const p = normalizePathname(pathname.split(/[?#]/, 1)[0] ?? "");
  if (p !== MANAGER_ROOT && !p.startsWith(`${MANAGER_ROOT}/`)) return false;
  return !(p === "/manager/setup" || p.startsWith("/manager/setup/"));
}

/** Removes the matched route's `volatileParams` (one-shot callback params). Used only when persisting. */
export function stripVolatileParams(url: TabUrl): TabUrl {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const pathname = url.slice(0, q);
  const volatile = matchRoute(pathname)?.volatileParams;
  if (!volatile || volatile.length === 0) return url;
  const kept = url
    .slice(q + 1)
    .split("&")
    .filter((segment) => segment !== "" && !volatile.includes(paramName(segment)));
  return kept.length > 0 ? `${pathname}?${kept.join("&")}` : pathname;
}

/**
 * Omnibox input → a URL or a search query.
 *   "/manager/x", "manager/x" and same-origin absolute URLs → url (after legacy redirects), if tabbable
 *   anything else (including text with whitespace) → query
 * Arbitrary strings are never turned into navigations (use-router.md XSS note).
 */
export function parseOmniboxInput(
  input: string,
  base?: string,
): { kind: "url"; url: TabUrl } | { kind: "query"; q: string } {
  const q = input.trim();
  if (!q || /\s/.test(q)) return { kind: "query", q };

  let candidate: string | null = null;
  if (q.startsWith("/")) candidate = q;
  else if (/^manager(\/|\?|$)/.test(q)) candidate = `/${q}`;
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) candidate = q;
  if (!candidate) return { kind: "query", q };

  const first = canonicalizeUrl(candidate, base);
  if (!first) return { kind: "query", q };
  const redirected = resolveLegacyRedirect(first.url);
  const final = redirected === first.url ? first : canonicalizeUrl(redirected, base);
  if (!final || !final.tabbable) return { kind: "query", q };
  return { kind: "url", url: final.url };
}
