// Spreadsheet wire formats (sheets.md §4.1). A snapshot / version state is a gzipped JSON envelope
// `{ v: 1, app, wb }` of Univer's IWorkbookData; an op-log row is a gzipped JSON batch
// `{ v: 1, app, seq, ops: [{ mutationId, params }] }`. The server only checks the gzip header and
// sizes (spacetimedb/src/drive/sheet-logic.ts isGzipBytes), so everything here treats its input as
// untrusted: inflate is capped with a streaming Gunzip (a 1 MiB payload cannot expand to
// gigabytes), and the JSON is shape-checked before anyone reads it.
//
// Pure: fflate only, type-only Univer imports.

import { Gunzip, gzipSync, strToU8 } from "fflate";
import type { IWorkbookData } from "@univerjs/presets";
import { SHEET_APP_VERSION, SHEET_UNIT_ID } from "./constants";
import type { SheetOpBatch, SheetSnapshotEnvelope } from "./types";
import { UNIVER_LOCALE } from "./univer-constants";

export type { SheetOp, SheetOpBatch, SheetSnapshotEnvelope } from "./types";

export const SHEET_CODEC_VERSION = 1 as const;
/** Largest inflated snapshot / version state. */
export const SNAPSHOT_MAX_INFLATED_BYTES = 256 * 1024 * 1024;
/** Largest inflated op batch (a row is ≤ 1 MiB compressed). */
export const OPS_MAX_INFLATED_BYTES = 32 * 1024 * 1024;
/** Compressed size from which the *Async decoders inflate in slices, yielding to the event loop. */
export const SHEET_ASYNC_DECODE_MIN_BYTES = 256 * 1024;

export type SheetCodecErrorReason = "not_gzip" | "too_big" | "bad_json" | "bad_shape";

export class SheetCodecError extends Error {
  readonly reason: SheetCodecErrorReason;
  constructor(reason: SheetCodecErrorReason, message?: string) {
    super(message ?? `Unreadable spreadsheet data (${reason})`);
    this.name = "SheetCodecError";
    this.reason = reason;
  }
}

/** gzip member header (1f 8b 08) on a buffer long enough for header + trailer; = isGzipBytes on the server. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 18 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08;
}

function gzipJson(value: unknown): Uint8Array {
  // mtime 0: equal content gives equal bytes (the server skips an auto version whose state did not change).
  return gzipSync(strToU8(JSON.stringify(value)), { level: 6, mtime: 0 });
}

export function encodeSheetSnapshot(wb: IWorkbookData): Uint8Array {
  const envelope: SheetSnapshotEnvelope = { v: SHEET_CODEC_VERSION, app: SHEET_APP_VERSION, wb };
  return gzipJson(envelope);
}

export function encodeSheetOps(batch: SheetOpBatch): Uint8Array {
  return gzipJson({ v: SHEET_CODEC_VERSION, app: batch.app, seq: batch.seq, ops: batch.ops });
}

// ── Capped inflate ───────────────────────────────────────────────────────────────────────────────

/** Compressed bytes pushed per step: one step can inflate to at most ~1032× this before the cap is checked. */
const INFLATE_SLICE = 16 * 1024;
/** Longest run of slices the async decoders do before yielding (ms). */
const ASYNC_SLICE_BUDGET_MS = 8;

class CappedGunzip {
  private readonly gunzip = new Gunzip();
  private chunks: Uint8Array[] = [];
  private total = 0;
  private over = false;
  private done = false;

  constructor(private readonly cap: number) {
    this.gunzip.ondata = (chunk, final) => {
      if (this.over) return;
      this.total += chunk.length;
      if (this.total > this.cap) {
        this.over = true;
        this.chunks = [];
        return;
      }
      this.chunks.push(chunk);
      if (final) this.done = true;
    };
  }

  push(slice: Uint8Array, final: boolean): void {
    try {
      this.gunzip.push(slice, final);
    } catch (err) {
      if (this.over) throw new SheetCodecError("too_big");
      throw new SheetCodecError("not_gzip", err instanceof Error ? err.message : undefined);
    }
    if (this.over) throw new SheetCodecError("too_big");
  }

  result(): Uint8Array {
    if (!this.done) throw new SheetCodecError("not_gzip", "Truncated spreadsheet data");
    if (this.chunks.length === 1) return this.chunks[0];
    const out = new Uint8Array(this.total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function inflateSync(bytes: Uint8Array, cap: number): Uint8Array {
  if (!isGzip(bytes)) throw new SheetCodecError("not_gzip");
  const inflater = new CappedGunzip(cap);
  for (let at = 0; at < bytes.length; at += INFLATE_SLICE) {
    const end = Math.min(bytes.length, at + INFLATE_SLICE);
    inflater.push(bytes.subarray(at, end), end === bytes.length);
  }
  return inflater.result();
}

/**
 * Resolves in a new task, through a MessageChannel rather than a timer: browsers clamp chained timers in a
 * hidden tab to ≥ 1 s (Chrome's intensive throttling: 1 min), which would stretch a large decode in a
 * background tab to minutes, while posted messages run at full speed. setTimeout only where there is no
 * MessageChannel.
 */
function yieldToEventLoop(): Promise<void> {
  if (typeof MessageChannel !== "function") return new Promise<void>((resolve) => setTimeout(resolve, 0));
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * inflateSync in time-boxed slices, so a large snapshot does not freeze the page while it loads. On the main
 * thread, not in fflate's AsyncGunzip worker: that worker has no `onerror` (a worker that fails to start
 * never settles), inflates a whole push before its bytes can be counted, and crashes under Bun, so no test
 * could run it.
 */
async function inflateSliced(bytes: Uint8Array, cap: number): Promise<Uint8Array> {
  if (!isGzip(bytes)) throw new SheetCodecError("not_gzip");
  const inflater = new CappedGunzip(cap);
  let sliceStart = Date.now();
  for (let at = 0; at < bytes.length; at += INFLATE_SLICE) {
    const end = Math.min(bytes.length, at + INFLATE_SLICE);
    inflater.push(bytes.subarray(at, end), end === bytes.length);
    if (Date.now() - sliceStart >= ASYNC_SLICE_BUDGET_MS) {
      await yieldToEventLoop();
      sliceStart = Date.now();
    }
  }
  return inflater.result();
}

function parseJson(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SheetCodecError("bad_json", "Spreadsheet data is not UTF-8");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new SheetCodecError("bad_json");
  }
}

// ── Shape checks ─────────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks the workbook skeleton, then pins `id` to SHEET_UNIT_ID and fills missing top-level fields (in place). */
function normalizeWorkbook(raw: unknown): IWorkbookData {
  if (!isRecord(raw)) throw new SheetCodecError("bad_shape", "No workbook");
  const { sheets, sheetOrder, resources } = raw;
  if (!isRecord(sheets) || !Object.values(sheets).every(isRecord)) throw new SheetCodecError("bad_shape", "Bad sheets");
  if (!Array.isArray(sheetOrder) || !sheetOrder.every((id) => typeof id === "string")) {
    throw new SheetCodecError("bad_shape", "Bad sheet order");
  }
  if (resources !== undefined && !Array.isArray(resources)) throw new SheetCodecError("bad_shape", "Bad resources");
  raw.id = SHEET_UNIT_ID;
  if (typeof raw.name !== "string") raw.name = "";
  if (typeof raw.appVersion !== "string") raw.appVersion = SHEET_APP_VERSION;
  if (typeof raw.locale !== "string") raw.locale = UNIVER_LOCALE.EN_US;
  if (!isRecord(raw.styles)) raw.styles = {};
  // The skeleton checked above is the part IWorkbookData requires; the sheet contents are Univer's to read.
  return raw as unknown as IWorkbookData;
}

function toEnvelope(value: unknown): SheetSnapshotEnvelope {
  if (!isRecord(value) || value.v !== SHEET_CODEC_VERSION || typeof value.app !== "string") {
    throw new SheetCodecError("bad_shape", "Not a spreadsheet snapshot");
  }
  return { v: SHEET_CODEC_VERSION, app: value.app, wb: normalizeWorkbook(value.wb) };
}

function toBatch(value: unknown): SheetOpBatch {
  if (!isRecord(value) || value.v !== SHEET_CODEC_VERSION || typeof value.app !== "string") {
    throw new SheetCodecError("bad_shape", "Not a spreadsheet edit");
  }
  const { seq, ops } = value;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1 || !Array.isArray(ops)) {
    throw new SheetCodecError("bad_shape", "Bad edit batch");
  }
  // Items stay unchecked here: the receiver passes each one through acceptRemoteOp and skips only that op.
  return { v: SHEET_CODEC_VERSION, app: value.app, seq, ops: ops as SheetOpBatch["ops"] };
}

// ── Decoders ─────────────────────────────────────────────────────────────────────────────────────

/** Snapshot → envelope (keeps `app` for the version gate). Throws SheetCodecError. */
export function decodeSheetEnvelope(bytes: Uint8Array): SheetSnapshotEnvelope {
  return toEnvelope(parseJson(inflateSync(bytes, SNAPSHOT_MAX_INFLATED_BYTES)));
}

/** Snapshot → workbook. Throws SheetCodecError. */
export function decodeSheetSnapshot(bytes: Uint8Array): IWorkbookData {
  return decodeSheetEnvelope(bytes).wb;
}

/** decodeSheetEnvelope that inflates ≥ SHEET_ASYNC_DECODE_MIN_BYTES in time-boxed slices. Rejects with SheetCodecError. */
export async function decodeSheetEnvelopeAsync(bytes: Uint8Array): Promise<SheetSnapshotEnvelope> {
  if (bytes.length < SHEET_ASYNC_DECODE_MIN_BYTES) return decodeSheetEnvelope(bytes);
  const inflated = await inflateSliced(bytes, SNAPSHOT_MAX_INFLATED_BYTES);
  await yieldToEventLoop();
  return toEnvelope(parseJson(inflated));
}

export async function decodeSheetSnapshotAsync(bytes: Uint8Array): Promise<IWorkbookData> {
  return (await decodeSheetEnvelopeAsync(bytes)).wb;
}

/** Op-log row → batch. Throws SheetCodecError (never returns null). */
export function decodeSheetOps(bytes: Uint8Array): SheetOpBatch {
  return toBatch(parseJson(inflateSync(bytes, OPS_MAX_INFLATED_BYTES)));
}
