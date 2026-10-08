// The parse pipeline of a .pptx import (slides.md §10.1 step 2), shared by the worker and its main-thread fallback:
// zip directory check → streamed inflation check → pptxtojson → in-place image dedupe → slide scan. It uses no DOM
// and no structured clone, so the fallback runs exactly what the worker runs.
import { parse } from "pptxtojson";

import { extractDataUrls } from "./dedupe-assets";
import { scanSlides } from "./slide-scan";
import type { PptxPipelineResult } from "./worker-protocol";
import { checkZipDirectory, checkZipInflation } from "./zip-guard";

/**
 * pptxtojson options: images inline as base64 (deduped below), no video or audio (blob URLs die with the worker).
 * singleLineSpacingFactor must equal the exporter's SINGLE_LINE_HEIGHT (lib/slides/export/pptx-text.ts), so an
 * exported spcPct line spacing reads back unchanged. Kept literal so the worker does not import the exporter;
 * scripts/tests/slides/roundtrip.test.ts fails when the two drift apart.
 */
export const PPTX_PARSE_OPTIONS = {
  imageMode: "base64",
  videoMode: "none",
  audioMode: "none",
  singleLineSpacingFactor: 1.2,
} as const;

/**
 * Runs the whole pipeline on the file bytes. Throws when pptxtojson itself fails, or when `checkpoint` (called
 * between stages; the main-thread fallback's deadline and abort check) throws.
 */
export async function runParsePipeline(buf: ArrayBuffer, checkpoint: () => void = () => {}): Promise<PptxPipelineResult> {
  const bytes = new Uint8Array(buf);
  const rejected = checkZipDirectory(bytes) ?? (await checkZipInflation(bytes));
  if (rejected) return { type: "rejected", code: rejected };
  checkpoint();
  const scan = scanSlides(bytes);
  checkpoint();
  const parsed = await parse(buf, PPTX_PARSE_OPTIONS);
  checkpoint();
  const { lean, assets } = extractDataUrls(parsed);
  return { type: "parsed", lean, assets, scan };
}
