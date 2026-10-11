// The one rule for following a notification's link. A row's `link` is chosen
// by whoever created it (createNotification is client-callable), so nothing
// opens it, puts it in an OS notification or an email button until it has
// passed here: an in-app `/manager` path, returned as pathname + search.
//
// Mirrored in the module as `notifySafeAppPath` (spacetimedb/src/notify/logic.ts),
// which applies it before a link reaches a push or an email; the two are
// parity-tested (scripts/tests/notify/client-safe-link.test.ts).

/** Where links resolve when NEXT_PUBLIC_APP_URL is unset or unparseable. */
export const NOTIFY_DEFAULT_ORIGIN = "https://www.merchiva.com";
/** Longer links are refused (= NOTIFY_LINK_MAX in the module). */
export const SAFE_LINK_MAX = 2000;

const APP_PATH_RE = /^\/manager(?:[/?]|$)/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const DOT_SEGMENT_RE = /^(?:\.|%2e){1,2}$/i;

/** The origin app links resolve against: NEXT_PUBLIC_APP_URL's, else the production site's. */
export function notifyAppOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (raw) {
    try {
      const origin = new URL(raw).origin;
      if (origin.startsWith("https://") || origin.startsWith("http://")) return origin;
    } catch {
      // Unparseable: fall back to the production origin.
    }
  }
  return NOTIFY_DEFAULT_ORIGIN;
}

/**
 * The link as `pathname + search` when it is an in-app `/manager` path, else null.
 * Refused: anything not starting `/manager` (`/store`, `https://…`, `javascript:`),
 * `//` and `\` anywhere (protocol-relative tricks), control characters, dot segments
 * (a parser would resolve them out of /manager) and links over SAFE_LINK_MAX. The hash
 * is dropped; characters a URL parser percent-encodes come back encoded.
 */
export function safeAppPath(link: unknown): string | null {
  if (typeof link !== "string" || link.length > SAFE_LINK_MAX) return null;
  // A URL parser drops trailing spaces before anything else (the module does the same).
  const trimmed = link.replace(/ +$/, "");
  if (!APP_PATH_RE.test(trimmed)) return null;
  if (trimmed.includes("//") || trimmed.includes("\\") || CONTROL_RE.test(trimmed)) return null;
  const path = trimmed.split(/[?#]/, 1)[0] ?? "";
  if (path.split("/").some((segment) => DOT_SEGMENT_RE.test(segment))) return null;
  const origin = notifyAppOrigin();
  let url: URL;
  try {
    url = new URL(trimmed, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !APP_PATH_RE.test(url.pathname)) return null;
  return url.pathname + url.search;
}
