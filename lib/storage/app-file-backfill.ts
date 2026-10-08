// The pure half of scripts/backfill-app-files.ts: every UploadThing file the app
// stored before uploads were recorded becomes one serviceBackfillAppFiles entry
// `{ key, keyHash, sizeBytes, mimeType }`. The module finds the store that owns a
// key by scanning the columns that hold UploadThing URLs; a key nothing references
// is skipped there. No env, no fetch — the script injects UTApi.listFiles.

import { mimeFromExtension } from "@/lib/drive/rules";
import { appFileKeyHash } from "@/lib/storage/uploadthing-key";

/** Entries per serviceBackfillAppFiles call (the module's APP_BACKFILL_MAX). */
export const APP_BACKFILL_MAX = 2000;
/** The longest `entries` argument the module reads (APP_BACKFILL_MAX × 512 characters). */
export const APP_BACKFILL_MAX_CHARS = APP_BACKFILL_MAX * 512;
/** Files per UTApi.listFiles page (UploadThing's own cap is 500). */
export const UPLOADTHING_PAGE_SIZE = 500;

/** The fields of a UTApi.listFiles file the backfill reads. */
export interface UploadThingListedFile {
  readonly key: string;
  readonly name: string;
  readonly size: number;
  readonly status: string;
}

export type UploadThingListFiles = (opts: { limit: number; offset: number }) => Promise<{
  readonly files: readonly UploadThingListedFile[];
  readonly hasMore: boolean;
}>;

export interface AppBackfillEntry {
  key: string;
  keyHash: string;
  sizeBytes: number;
  mimeType: string;
}

/** Every file UploadThing lists, page by page. Stops on an empty page even if `hasMore` says otherwise. */
export async function listAllUploadThingFiles(
  listFiles: UploadThingListFiles,
  pageSize = UPLOADTHING_PAGE_SIZE,
): Promise<UploadThingListedFile[]> {
  const all: UploadThingListedFile[] = [];
  for (let offset = 0; ; ) {
    const page = await listFiles({ limit: pageSize, offset });
    all.push(...page.files);
    offset += page.files.length;
    if (!page.hasMore || page.files.length === 0) return all;
  }
}

export interface AppBackfillPlan {
  entries: AppBackfillEntry[];
  /** Listed but not stored (still uploading, failed, or pending deletion). */
  notUploaded: number;
  /** A key the upload path would not hash (appFileKeyHash: empty, too long, odd characters) or an unusable size. */
  invalid: number;
  /** The same key listed twice. */
  duplicates: number;
  /** Sum of the entries' sizes. */
  totalBytes: number;
}

/**
 * The entries to send, in listing order: only `Uploaded` files, one per key. The MIME type comes from the
 * file name's extension (listFiles carries no type); the module normalizes it again.
 */
export function appBackfillPlan(files: readonly UploadThingListedFile[]): AppBackfillPlan {
  const entries: AppBackfillEntry[] = [];
  const seen = new Set<string>();
  let notUploaded = 0;
  let invalid = 0;
  let duplicates = 0;
  let totalBytes = 0;
  for (const file of files) {
    if (file.status !== "Uploaded") {
      notUploaded++;
      continue;
    }
    const key = typeof file.key === "string" ? file.key : "";
    // The hash recordAppUpload stores for the same key, so a backfilled row and a recorded one never differ.
    const keyHash = key === "" ? null : appFileKeyHash(key);
    if (keyHash === null || !Number.isSafeInteger(file.size) || file.size < 0) {
      invalid++;
      continue;
    }
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    entries.push({ key, keyHash, sizeBytes: file.size, mimeType: mimeFromExtension(file.name ?? "") });
    totalBytes += file.size;
  }
  return { entries, notUploaded, invalid, duplicates, totalBytes };
}

/**
 * The `entries` JSON arguments, each at most `maxEntries` entries and `maxChars` characters, in order.
 * An entry is a few hundred characters at most (the key is capped), so a chunk always holds at least one.
 */
export function appBackfillChunks(
  entries: readonly AppBackfillEntry[],
  maxEntries = APP_BACKFILL_MAX,
  maxChars = APP_BACKFILL_MAX_CHARS,
): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let chars = 2; // "[" + "]"
  const flush = () => {
    if (current.length > 0) chunks.push(`[${current.join(",")}]`);
    current = [];
    chars = 2;
  };
  for (const entry of entries) {
    const json = JSON.stringify(entry);
    const added = json.length + (current.length > 0 ? 1 : 0);
    if (current.length >= maxEntries || (current.length > 0 && chars + added > maxChars)) flush();
    chars += json.length + (current.length > 0 ? 1 : 0);
    current.push(json);
  }
  flush();
  return chunks;
}
