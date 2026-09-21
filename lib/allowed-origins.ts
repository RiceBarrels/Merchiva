/**
 * Origin matching for the CORS allow-lists.
 *
 * Matched responses carry `Access-Control-Allow-Credentials: true`, so a match
 * lets that origin read authenticated responses. `origin.startsWith(allowed)`
 * is therefore not safe: https://merchiva.com.attacker.com starts with
 * https://merchiva.com, and anyone can register it. Same for
 * https://localhost.attacker.com, and for http://localhost:30000 against
 * http://localhost:3000.
 *
 * So: http(s) origins match exactly, and only custom app schemes match by
 * prefix — a page in a browser cannot forge an Origin in a scheme it does not
 * own, and everything after the scheme is that app's own WebView host.
 */

export interface OriginAllowList {
  /** Full origins, compared with ===. */
  exact: ReadonlySet<string>;
  /** Custom app schemes, e.g. "merchiva://". */
  schemes: readonly string[];
}

export function matchAllowedOrigin(
  origin: string | null | undefined,
  list: OriginAllowList,
): string | null {
  if (!origin) return null;
  if (list.exact.has(origin)) return origin;
  if (list.schemes.some((scheme) => origin.startsWith(scheme))) return origin;
  return null;
}
