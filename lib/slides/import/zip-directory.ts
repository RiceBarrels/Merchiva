// A ZIP central-directory reader that sees an archive the way JSZip does (slides.md §10.1 step 2, F28).
//
// pptxtojson opens the file with JSZip, which trusts the central directory: it finds the LAST end-of-central-directory
// signature in the whole buffer, reads every consecutive central header from the stated offset (correcting for bytes
// prepended to the archive), and inflates each entry's `compressedSize` bytes after its local header. The zip guard
// must bound exactly those bytes, so this reader follows the same rules instead of reading local headers in stream
// order (a crafted archive can hide entries from a streaming reader). Where JSZip's reading is quirky (duplicate
// extra fields, wrapped 64-bit offsets, its ZIP64 record loop) the reader refuses the archive instead of guessing, so
// every number the guard checks is the number JSZip uses. Pure: bytes in, numbers out; worker-safe.
import { Inflate } from "fflate";

export interface ZipEntryInfo {
  name: string;
  /** General-purpose flags; bit 0 = encrypted. */
  flags: number;
  /** 0 = stored, 8 = deflate; JSZip reads nothing else. */
  method: number;
  compressedSize: number;
  /** Declared uncompressed size (may lie). */
  originalSize: number;
  /** Absolute offset of the entry's data in the buffer. */
  dataOffset: number;
}

export type ZipDirectoryResult = { entries: ZipEntryInfo[] } | "notZip" | "tooManyEntries";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const MAX16 = 0xffff;
const MAX32 = 0xffffffff;

function u16(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8);
}

function u32(b: Uint8Array, i: number): number {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 0x1000000;
}

/** A little-endian 64-bit value; beyond 2^53 it is not a usable offset or size, so it becomes Infinity. */
function u64(b: Uint8Array, i: number): number {
  const high = u32(b, i + 4);
  return high >= 0x200000 ? Infinity : u32(b, i) + high * 0x100000000;
}

function hasSig(b: Uint8Array, i: number, sig: number): boolean {
  return i >= 0 && i + 4 <= b.length && u32(b, i) === sig;
}

/** The last index of `sig` in the buffer, like JSZip's lastIndexOfSignature (it searches the whole buffer). */
function lastIndexOfSig(b: Uint8Array, sig: number, from = b.length - 4): number {
  const s0 = sig & 0xff;
  for (let i = Math.min(from, b.length - 4); i >= 0; i--) if (b[i] === s0 && u32(b, i) === sig) return i;
  return -1;
}

const utf8 = new TextDecoder("utf-8", { fatal: false });

/**
 * Applies a central header's ZIP64 extra field (0x0001) the way JSZip does: its values in spec order, for the fields
 * that were 0xFFFFFFFF. JSZip reads fields while more than 4 bytes remain and keys them by id, so the LAST 0x0001
 * wins; a field whose length runs past the region takes its value from the bytes that follow. Rather than copy those
 * quirks, an ambiguous region returns false and the archive is refused: a second 0x0001 field, or any overrun.
 */
function applyZip64Extra(b: Uint8Array, start: number, end: number, entry: { originalSize: number; compressedSize: number; localOffset: number }): boolean {
  let zip64 = -1;
  let zip64End = -1;
  for (let i = start; i + 4 < end; ) {
    const body = i + 4;
    const bodyEnd = body + u16(b, i + 2);
    if (bodyEnd > end) return false;
    if (u16(b, i) === 0x0001) {
      if (zip64 >= 0) return false;
      zip64 = body;
      zip64End = bodyEnd;
    }
    i = bodyEnd;
  }
  if (zip64 < 0) return true;
  let j = zip64;
  const take = (): number => {
    if (j + 8 > zip64End) return NaN;
    const v = u64(b, j);
    j += 8;
    return v;
  };
  if (entry.originalSize === MAX32) entry.originalSize = take();
  if (entry.compressedSize === MAX32) entry.compressedSize = take();
  if (entry.localOffset === MAX32) entry.localOffset = take();
  return true;
}

/**
 * The entries of the archive as JSZip would read them, or "notZip" when JSZip would refuse the buffer (no directory,
 * multi-volume, missing bytes, a local header or data outside the buffer) or could read it differently from this
 * reader (see applyZip64Extra and the ZIP64 record checks), or "tooManyEntries" past `maxEntries`.
 */
export function readZipDirectory(b: Uint8Array, maxEntries: number): ZipDirectoryResult {
  const eocd = lastIndexOfSig(b, SIG_EOCD);
  if (eocd < 0 || eocd + 22 > b.length) return "notZip";
  let diskCount = u16(b, eocd + 4);
  let records = u16(b, eocd + 10);
  let cdSize = u32(b, eocd + 12);
  let cdOffset = u32(b, eocd + 16);
  let expectedEnd: number;
  const zip64 =
    diskCount === MAX16 || u16(b, eocd + 6) === MAX16 || u16(b, eocd + 8) === MAX16 || records === MAX16 || cdSize === MAX32 || cdOffset === MAX32;
  if (zip64) {
    const locator = lastIndexOfSig(b, SIG_ZIP64_LOCATOR);
    if (locator < 0 || locator + 20 > b.length || u32(b, locator + 16) > 1) return "notZip";
    // JSZip reads this offset with 32-bit arithmetic (a larger one wraps to another offset) and throws when it is past
    // the end, so it is refused here, not searched for. An offset inside the buffer (the import caps files far below
    // 2^31 bytes) is one JSZip reads as the same number.
    let record = u64(b, locator + 8);
    if (record + 4 > b.length) return "notZip";
    if (!hasSig(b, record, SIG_ZIP64_EOCD)) record = lastIndexOfSig(b, SIG_ZIP64_EOCD);
    if (record < 0 || record + 56 > b.length) return "notZip";
    const recordSize = u64(b, record + 4);
    // JSZip's loop over the record's extensible data never advances: past 44 bytes it throws at the end of the
    // buffer, or spins forever on a negative length. No archive JSZip can open has a larger record.
    if (recordSize > 44) return "notZip";
    diskCount = u32(b, record + 16);
    records = u64(b, record + 32);
    cdSize = u64(b, record + 40);
    cdOffset = u64(b, record + 48);
    expectedEnd = cdOffset + cdSize + 20 + 12 + recordSize;
  } else {
    expectedEnd = cdOffset + cdSize;
  }
  if (diskCount > 1 || !Number.isFinite(expectedEnd) || !Number.isFinite(cdOffset)) return "notZip";
  const extraBytes = eocd - expectedEnd;
  if (extraBytes < 0) return "notZip";
  // Bytes prepended to the archive shift every stated offset (JSZip's `reader.zero`).
  const zero = extraBytes;

  const entries: ZipEntryInfo[] = [];
  let i = zero + cdOffset;
  while (hasSig(b, i, SIG_CENTRAL)) {
    if (i + 46 > b.length) return "notZip";
    if (entries.length >= maxEntries) return "tooManyEntries";
    const nameLen = u16(b, i + 28);
    const extraLen = u16(b, i + 30);
    const commentLen = u16(b, i + 32);
    const nameEnd = i + 46 + nameLen;
    if (nameEnd + extraLen + commentLen > b.length) return "notZip";
    const entry = { originalSize: u32(b, i + 24), compressedSize: u32(b, i + 20), localOffset: u32(b, i + 42) };
    if (!applyZip64Extra(b, nameEnd, nameEnd + extraLen, entry)) return "notZip";
    const local = zero + entry.localOffset;
    if (!Number.isFinite(entry.compressedSize) || !Number.isFinite(entry.originalSize) || !hasSig(b, local, SIG_LOCAL) || local + 30 > b.length) {
      return "notZip";
    }
    const dataOffset = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    if (dataOffset + entry.compressedSize > b.length) return "notZip";
    entries.push({
      name: utf8.decode(b.subarray(i + 46, nameEnd)),
      flags: u16(b, i + 8),
      method: u16(b, i + 10),
      compressedSize: entry.compressedSize,
      originalSize: entry.originalSize,
      dataOffset,
    });
    i = nameEnd + extraLen + commentLen;
  }
  // JSZip gives up only when the directory promised records and none were found.
  if (entries.length === 0 && records !== 0) return "notZip";
  return { entries };
}

/** Input bytes pushed to the inflater at a time: one push emits at most ~1,032× this (deflate's ceiling). */
const PUSH_BYTES = 4096;

/**
 * Streams one entry's uncompressed bytes through `onData` (each chunk is a view that is reused after the call: copy
 * what you keep). `onData` returns false to stop. "corrupt" when the deflate stream is broken or the method is one
 * JSZip cannot read; what was emitted before that still counts.
 */
export function streamZipEntry(b: Uint8Array, entry: ZipEntryInfo, onData: (chunk: Uint8Array) => boolean): "done" | "stopped" | "corrupt" {
  const data = b.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.method === 0) {
    for (let off = 0; off < data.length; off += PUSH_BYTES) {
      if (!onData(data.subarray(off, Math.min(off + PUSH_BYTES, data.length)))) return "stopped";
    }
    return "done";
  }
  if (entry.method !== 8) return "corrupt";
  let stopped = false;
  const inflater = new Inflate((chunk) => {
    if (!stopped && chunk.length > 0 && !onData(chunk)) stopped = true;
  });
  try {
    if (data.length === 0) inflater.push(new Uint8Array(0), true);
    for (let off = 0; off < data.length && !stopped; off += PUSH_BYTES) {
      const end = Math.min(off + PUSH_BYTES, data.length);
      inflater.push(data.subarray(off, end), end >= data.length);
    }
  } catch {
    return stopped ? "stopped" : "corrupt";
  }
  return stopped ? "stopped" : "done";
}

/** One entry's bytes, or null when it is larger than `maxBytes` or cannot be read. */
export function readZipEntry(b: Uint8Array, entry: ZipEntryInfo, maxBytes: number): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const result = streamZipEntry(b, entry, (chunk) => {
    total += chunk.length;
    if (total > maxBytes) return false;
    chunks.push(chunk.slice());
    return true;
  });
  if (result !== "done") return null;
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
