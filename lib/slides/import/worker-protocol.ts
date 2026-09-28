// Messages between the import (main thread) and the .pptx parse worker (slides.md §10.1 step 2).
import type { ExtractedAsset } from "./dedupe-assets";
import type { SlideScan } from "./slide-scan";
import type { ZipRejectCode } from "./zip-guard";

/** What pptxtojson's `parse` resolves to. */
export type PptxParseResult = Awaited<ReturnType<typeof import("pptxtojson").parse>>;
/** Same shape; every image data URL is an "asset:<key>" reference into the assets that travel with it. */
export type LeanParseResult = PptxParseResult;

/** Main thread → worker. `buf` is transferred. */
export type PptxWorkerRequest = { type: "parse"; buf: ArrayBuffer };

/** Worker → main thread. */
export type PptxWorkerMessage =
  /** Posted once the worker's module graph (pptxtojson included) has loaded. */
  | { type: "ready" }
  | { type: "rejected"; code: ZipRejectCode }
  /** Every `assets[i].bytes` is in the transfer list. */
  | { type: "parsed"; lean: LeanParseResult; assets: ExtractedAsset[]; scan: SlideScan }
  | { type: "error"; message: string };

/** The result of the parse pipeline, in the worker or on the main thread. */
export type PptxPipelineResult = Extract<PptxWorkerMessage, { type: "rejected" } | { type: "parsed" }>;

const ZIP_REJECT_CODES: readonly ZipRejectCode[] = ["notZip", "tooManyEntries", "tooLargeUncompressed", "suspiciousRatio"];

/** The worker message `data` holds, or null when it is not one (a message from anything but our worker). */
export function readWorkerMessage(data: unknown): PptxWorkerMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case "ready":
      return { type: "ready" };
    case "rejected":
      return ZIP_REJECT_CODES.includes(msg.code as ZipRejectCode) ? { type: "rejected", code: msg.code as ZipRejectCode } : null;
    case "parsed":
      return typeof msg.lean === "object" && msg.lean !== null && Array.isArray(msg.assets) && typeof msg.scan === "object" && msg.scan !== null
        ? (msg as PptxWorkerMessage)
        : null;
    case "error":
      return { type: "error", message: typeof msg.message === "string" ? msg.message.slice(0, 500) : "" };
    default:
      return null;
  }
}
