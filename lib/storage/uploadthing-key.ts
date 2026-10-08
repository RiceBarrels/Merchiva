// UploadThing file keys and their app_file hashes. Pure.
//
// uploadThingKeyOf / uploadThingKeysIn are an identical copy of the module's
// (spacetimedb/src/drive/storage.ts); scripts/tests/storage/uploadthing-key.test.ts
// checks the two agree. Change both together.

import { sha256Hex } from "@/lib/storage/sha256";

/** `https://<app>.ufs.sh/f/<key>`, `https://utfs.io/f/<key>`, or either host with `/a/<appId>/<key>`. */
const UPLOADTHING_URL_RE =
  /^https:\/\/(?:utfs\.io|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ufs\.sh)(?::443)?\/(?:f\/([^/?#\s]+)|a\/[^/?#\s]+\/([^/?#\s]+))(?:[?#]|$)/i;
/** URL candidates inside free text (JSON, HTML attributes). */
const URL_IN_TEXT_RE = /https:\/\/[^\s"'<>()\\]+/gi;

/** The longest key the module's backfill accepts (APP_KEY_MAX in spacetimedb/src/drive/storage-reducers.ts). */
export const APP_FILE_KEY_MAX = 256;
const BARE_KEY_RE = /^[^/?#\s]+$/;

/** The UploadThing file key of a file URL (as written, not decoded), or null when it is not one. */
export function uploadThingKeyOf(url: string): string | null {
  const match = UPLOADTHING_URL_RE.exec(String(url ?? "").trim());
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

/** Every distinct UploadThing key referenced by a URL inside `text`, in order of first appearance. */
export function uploadThingKeysIn(text: string): string[] {
  const keys = new Set<string>();
  for (const candidate of String(text ?? "").match(URL_IN_TEXT_RE) ?? []) {
    const key = uploadThingKeyOf(candidate);
    if (key) keys.add(key);
  }
  return [...keys];
}

/**
 * app_file.keyHash for an UploadThing file URL or a bare key (`file.key` in onUploadComplete): the lowercase
 * hex SHA-256 of the key. null for anything else (another host, an empty string, a key with `/`, `?`, `#` or
 * whitespace, or one longer than APP_FILE_KEY_MAX).
 */
export function appFileKeyHash(urlOrKey: string): string | null {
  const raw = String(urlOrKey ?? "").trim();
  const key = uploadThingKeyOf(raw) ?? (BARE_KEY_RE.test(raw) ? raw : null);
  if (!key || key.length > APP_FILE_KEY_MAX) return null;
  return sha256Hex(key);
}
