// ZIP-bomb preflight for .pptx imports (slides.md §10.1 step 2, §13, F28). Runs in the parse worker (or its
// main-thread fallback) BEFORE pptxtojson, which inlines JSZip and inflates everything it touches.
//
// 1. checkZipDirectory reads the central directory only (nothing is inflated): too many entries, too much declared
//    uncompressed data, or one big entry with an absurd compression ratio.
// 2. Declared sizes can lie, so checkZipInflation then streams every entry through the inflater, counting the bytes
//    and dropping each chunk: memory stays at one chunk, CPU is bounded by the cap. An entry that inflates past its
//    declared size is rejected as lying.
// 3. Archives inside the archive (a chart's embedded workbook is one) are opened the same way, a few levels deep, so a
//    42.zip-style nest is refused as unsafe instead of failing later as "not a presentation". pptxtojson itself never
//    opens an inner archive; this only classifies the file.
// Both views are JSZip's (./zip-directory.ts), so the bytes counted are the bytes the parser would inflate.
import { readZipDirectory, streamZipEntry, type ZipEntryInfo } from "./zip-directory";

export const ZIP_LIMITS = {
  maxEntries: 5_000,
  maxTotalUncompressed: 400 * 1024 * 1024,
  maxRatio: 100,
  ratioMinBytes: 8 * 1024 * 1024,
} as const;

export type ZipLimits = { readonly [K in keyof typeof ZIP_LIMITS]: number };
export type ZipRejectCode = "notZip" | "tooManyEntries" | "tooLargeUncompressed" | "suspiciousRatio";

/** Inner archives are opened this many levels below the file itself; one found deeper is refused. */
const NESTED_MAX_DEPTH = 2;
/** Inner archives opened per file (a deck with many charts has one workbook per chart). */
const NESTED_MAX_ARCHIVES = 256;
/** An inner archive is kept in memory to be opened only up to this size; a larger one is counted, not opened. */
const NESTED_MAX_BYTES = 16 * 1024 * 1024;
/** Output between two yields to the event loop (keeps a main-thread fallback responsive). */
const YIELD_EVERY_BYTES = 16 * 1024 * 1024;

function isEncrypted(entry: ZipEntryInfo): boolean {
  return (entry.flags & 1) === 1;
}

function isSuspicious(originalSize: number, compressedSize: number, limits: ZipLimits): boolean {
  return originalSize > limits.ratioMinBytes && originalSize / Math.max(1, compressedSize) > limits.maxRatio;
}

/** Central directory only (F28): nothing is inflated. Null when the declared contents are within the limits. */
export function checkZipDirectory(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): ZipRejectCode | null {
  const dir = readZipDirectory(bytes, limits.maxEntries);
  if (dir === "notZip" || dir === "tooManyEntries") return dir;
  let total = 0;
  for (const entry of dir.entries) {
    // JSZip reads stored and deflated entries only, and no encrypted ones.
    if (isEncrypted(entry) || (entry.method !== 0 && entry.method !== 8)) return "notZip";
    total += entry.originalSize;
  }
  if (total > limits.maxTotalUncompressed) return "tooLargeUncompressed";
  for (const entry of dir.entries) if (isSuspicious(entry.originalSize, entry.compressedSize, limits)) return "suspiciousRatio";
  return null;
}

interface InflationBudget {
  /** Bytes inflated so far, across all levels. */
  total: number;
  /** Inner archives opened so far. */
  archives: number;
  sinceYield: number;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function startsWithZipMagic(chunk: Uint8Array): boolean {
  return chunk.length >= 4 && ZIP_MAGIC.every((byte, i) => chunk[i] === byte);
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function inflateArchive(bytes: Uint8Array, limits: ZipLimits, budget: InflationBudget, depth: number): Promise<ZipRejectCode | null> {
  const dir = readZipDirectory(bytes, limits.maxEntries);
  if (dir === "notZip" || dir === "tooManyEntries") return dir;
  for (const entry of dir.entries) {
    if (isEncrypted(entry) || (entry.method !== 0 && entry.method !== 8)) return "notZip";
    const state: { produced: number; reject: ZipRejectCode | null; inner: Uint8Array[] | null; first: boolean } = {
      produced: 0,
      reject: null,
      inner: null,
      first: true,
    };
    streamZipEntry(bytes, entry, (chunk) => {
      if (state.first) {
        state.first = false;
        if (startsWithZipMagic(chunk)) state.inner = [];
      }
      state.produced += chunk.length;
      budget.total += chunk.length;
      budget.sinceYield += chunk.length;
      if (budget.total > limits.maxTotalUncompressed) state.reject = "tooLargeUncompressed";
      else if (state.produced > entry.originalSize || isSuspicious(state.produced, entry.compressedSize, limits)) state.reject = "suspiciousRatio";
      if (state.reject) return false;
      if (state.inner) {
        if (state.produced > NESTED_MAX_BYTES) state.inner = null;
        else state.inner.push(chunk.slice());
      }
      return true;
    });
    // A corrupt stream stops early; the parser cannot inflate it either, so what was counted is the bound.
    if (state.reject) return state.reject;
    if (state.inner) {
      if (depth >= NESTED_MAX_DEPTH) return "suspiciousRatio";
      budget.archives += 1;
      if (budget.archives > NESTED_MAX_ARCHIVES) return "tooManyEntries";
      const archive = new Uint8Array(state.produced);
      let at = 0;
      for (const part of state.inner) {
        archive.set(part, at);
        at += part.length;
      }
      const nested = checkZipDirectory(archive, limits) ?? (await inflateArchive(archive, limits, budget, depth + 1));
      // Not a readable archive after all (a file that merely starts with "PK"): only its bytes count, as counted.
      if (nested && nested !== "notZip") return nested;
    }
    if (budget.sinceYield >= YIELD_EVERY_BYTES) {
      budget.sinceYield = 0;
      await yieldToLoop();
    }
  }
  return null;
}

/**
 * Streams every entry (F28) and counts what it really inflates to: past the total cap → "tooLargeUncompressed"; an
 * entry that inflates past its declared size, or past the ratio limit → "suspiciousRatio". Inner archives are checked
 * the same way (their directory, then their bytes, sharing the cap) down to NESTED_MAX_DEPTH. Null when safe.
 */
export async function checkZipInflation(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<ZipRejectCode | null> {
  return inflateArchive(bytes, limits, { total: 0, archives: 0, sinceYield: 0 }, 0);
}
