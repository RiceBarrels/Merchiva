// Where to go after signing in.
//
// `next` (login, signup) and `redirect_to` (the OAuth state, /auth-callback,
// the native shells' merchiva://auth-callback) come from a URL anyone can
// write. They used to reach `router.push(next)` and `window.location.href =
// redirectTo` unchecked: `next=https://evil.example` was an open redirect off a
// real sign-in page, and `next=javascript:…` ran on this origin right after
// /auth-callback stored the WorkOS tokens in localStorage — enough to read them.
//
// Only a same-origin path survives: it starts with exactly one "/", holds no
// backslash or control character (browsers read "/\evil.com" and "/\t/evil.com"
// as "//evil.com"), and still resolves to this origin. The NORMALIZED path is
// checked again: dot segments collapse, so "/.//evil.com" and "/..//evil.com"
// come out of URL parsing as the protocol-relative "//evil.com". Anything else
// is the fallback.

export const DEFAULT_NEXT = "/choose";

const PROBE_ORIGIN = "https://merchiva.invalid";

export function safeNextPath(raw: unknown, fallback: string = DEFAULT_NEXT): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith("//")) return fallback;
  try {
    if (new URL(path, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return fallback;
  } catch {
    return fallback;
  }
  return path;
}
