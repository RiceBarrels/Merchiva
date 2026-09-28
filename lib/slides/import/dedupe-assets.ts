// In-worker image dedupe for .pptx imports (slides.md §10.1 step 2, F26).
//
// pptxtojson keeps one data-URL string per image file, but a layout or master image is referenced from every slide
// that shows it, and structured clone copies a string once per reference. extractDataUrls walks the parse result
// once, replaces every data URL with "asset:<key>" (equal strings share one key), and decodes each distinct string
// to bytes exactly once. The worker posts the lean result plus the assets, with every asset's bytes in the transfer
// list, so each image crosses the thread boundary once, as an ArrayBuffer. Pure; runs in the worker and in Bun.

export interface ExtractedAsset {
  key: string;
  /** The MIME type the data URL declared ("" when none); the importer sniffs the bytes and never trusts it. */
  mime: string;
  bytes: ArrayBuffer;
}

/** The prefix of an asset reference in the lean result. */
export const ASSET_REF_PREFIX = "asset:";

/**
 * A base64 data URL. pptxtojson writes `data:;base64,` for image types it has no MIME for (BMP, WebP, …), so an
 * empty MIME is accepted too; anything else, and "data:" anywhere but the start, is left alone.
 */
const DATA_URL_RE = /^data:((?:[\w.+-]+\/[\w.+-]+)?);base64,/;

/** Nesting deeper than any pptxtojson result; a deeper value is left as it is. */
const MAX_DEPTH = 64;

function decodeBase64(payload: string): ArrayBuffer {
  const clean = payload.replace(/[^A-Za-z0-9+/]/g, "");
  let binary: string;
  try {
    binary = atob(clean.length % 4 === 1 ? clean.slice(0, -1) : clean);
  } catch {
    return new ArrayBuffer(0);
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

/** The asset key an "asset:<key>" reference names, or null for any other value. */
export function assetKeyOf(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(ASSET_REF_PREFIX)) return null;
  const key = value.slice(ASSET_REF_PREFIX.length);
  return /^a\d{1,6}$/.test(key) ? key : null;
}

/**
 * `parsed` with every data-URL string replaced by "asset:<key>" (one key per distinct string), and the decoded
 * assets. Arrays and plain objects are copied; the input is not modified.
 */
export function extractDataUrls<T>(parsed: T): { lean: T; assets: ExtractedAsset[] } {
  const keys = new Map<string, string>();
  const assets: ExtractedAsset[] = [];
  const visit = (value: unknown, depth: number): unknown => {
    if (typeof value === "string") {
      const match = DATA_URL_RE.exec(value);
      if (!match) return value;
      let key = keys.get(value);
      if (key === undefined) {
        key = `a${assets.length + 1}`;
        keys.set(value, key);
        assets.push({ key, mime: match[1].toLowerCase(), bytes: decodeBase64(value.slice(match[0].length)) });
      }
      return `${ASSET_REF_PREFIX}${key}`;
    }
    if (depth >= MAX_DEPTH || typeof value !== "object" || value === null) return value;
    if (Array.isArray(value)) return value.map((item) => visit(item, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = visit(v, depth + 1);
    return out;
  };
  return { lean: visit(parsed, 0) as T, assets };
}
