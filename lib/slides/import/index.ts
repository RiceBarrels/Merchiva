// .pptx import (slides.md §10.1). Client only. Drive's "Open as Slides" and the editor's File ▸ Import both call
// importSlidesFile; Drive imports it as "@/lib/slides/import" (C7).
//
// 1. Checks: size, then the .pptx extension or MIME type, then the bytes.
// 2. Parse in a module worker (./parse.ts): zip guard, pptxtojson, in-worker image dedupe, slide scan.
// 3. Map (pure, ./map-deck.ts) into a DeckSnapshot; every HTML string passes DOMPurify (when a DOM exists), the
//    tokenizer and sanitizeTextJson, and links survive only as http(s) URLs.
// 4. Refuse a deck over the state limit (assertImportFits), then upload the images (./assets.ts) through
//    uploadSlidesImage; what does not upload becomes a placeholder.
// 5. Create the deck with createDeckDocument → createDriveDocument (never the Docs createDocument wrapper), so the
//    server derives visibility from the target space and the owner from the acting member. The report is kept for
//    the editor, which shows it once when the new deck opens (takePendingImportReport).
// A local-file import does not upload the original .pptx (Q3); a Drive-file import records its item in meta.source.
import type { DriveDocTarget } from "@/lib/drive/types";
import { SLIDES_STATE_MAX_BYTES, createDeckDocument } from "@/lib/slides/create";
import { uploadSlidesImage } from "@/lib/slides/images";
import { deckStateMaxBytes } from "@/lib/slides/model/build";

import { uploadAssets } from "./assets";
import { checkPptxFile, pptxTitle } from "./constants";
import { SlidesImportError, throwIfAborted } from "./errors";
import { finalizeImportedDeck, mapPptxToSnapshot, type MappedDeck } from "./map-deck";
import { parsePptx } from "./parse";
import { importWarningCount, type ImportReport } from "./report";

export { PPTX_ACCEPT, PPTX_IMPORT_MAX_BYTES, PPTX_IMPORT_MAX_MB, PPTX_MIME, checkPptxFile } from "./constants";
export { isAbortError, SlidesImportError, slidesImportErrorMessage, type SlidesImportProblem } from "./errors";
export {
  IMPORT_INFO_CODES, IMPORT_ISSUE_CODES, importIssueKey, importWarningCount,
  type ImportIssueCode, type ImportReport, type ImportReportItem,
} from "./report";

export type ImportProgress =
  | { stage: "checking" }
  | { stage: "parsing" }
  | { stage: "images"; done: number; total: number }
  | { stage: "creating" };

export interface ImportSlidesOptions {
  /** The Drive file being opened (kept in the deck's meta.source). */
  driveItemId?: string;
  onProgress?(p: ImportProgress): void;
  /** Cancels until the create step starts; once the deck is being created the import finishes. */
  signal?: AbortSignal;
}

/** A superset of what Drive reads (`{ documentId, warnings }`). */
export interface ImportSlidesResult { documentId: string; warnings: number; report: ImportReport }

/** Reports waiting for the editor, by document id (shown once, then gone). */
const pendingReports = new Map<string, ImportReport>();
const MAX_PENDING_REPORTS = 20;

/** The report of an import that created `documentId`, once; null afterwards or when there is none. */
export function takePendingImportReport(documentId: string): ImportReport | null {
  const key = documentId.toLowerCase();
  const report = pendingReports.get(key) ?? null;
  pendingReports.delete(key);
  return report;
}

/**
 * State bytes kept free per image use while its src is still empty: an uploaded URL adds about its length (~80 for
 * UploadThing's), an image that fails becomes a placeholder (~290 more). SLIDES_URL_MAX (2048) would be the strict
 * bound, but it would refuse decks that fit; a deck in the gap still fails at createDeckDocument's own check.
 */
export const IMPORT_STATE_BYTES_PER_IMAGE_USE = 512;

/**
 * Throws createDeckDocument's `[doc.too_large]` before any image is uploaded: uploads are public and never purged
 * (R10), so a deck that cannot be created must not publish its images first. Measured with every image still pending,
 * as the most bytes any build of the deck can take (deckStateMaxBytes: a build's size varies with its random Yjs
 * client id), so the answer is the same every time and never below what createDeckDocument will build.
 */
export function assertImportFits(mapped: Pick<MappedDeck, "snapshot" | "assets">): void {
  const uses = mapped.assets.reduce((n, asset) => n + asset.uses.length, 0);
  const bytes = deckStateMaxBytes(mapped.snapshot) + uses * IMPORT_STATE_BYTES_PER_IMAGE_USE;
  if (bytes > SLIDES_STATE_MAX_BYTES) throw new Error("[doc.too_large] Presentation is too large");
}

function keepReport(documentId: string, report: ImportReport): void {
  pendingReports.set(documentId.toLowerCase(), report);
  while (pendingReports.size > MAX_PENDING_REPORTS) {
    const oldest = pendingReports.keys().next().value;
    if (oldest === undefined) break;
    pendingReports.delete(oldest);
  }
}

/**
 * Imports a .pptx as a new deck in `target` and resolves to its id, the warning count and the report. Rejects with a
 * SlidesImportError (`notPptx`, `tooLarge`, `unsafeFile`, `failed`), an AbortError, or the create step's
 * `[doc.*]` / `[drive.*]` error (slidesImportErrorMessage has the copy for each).
 */
export async function importSlidesFile(file: File, target: DriveDocTarget, opts: ImportSlidesOptions = {}): Promise<ImportSlidesResult> {
  const { signal, onProgress } = opts;
  throwIfAborted(signal);
  onProgress?.({ stage: "checking" });
  const problem = checkPptxFile(file);
  if (problem) throw new SlidesImportError(problem);
  onProgress?.({ stage: "parsing" });
  // No variable keeps the file bytes: the worker takes them (transfer), and the fallback lets them go after parsing.
  let parsed: Awaited<ReturnType<typeof parsePptx>> | null = await parsePptx(await file.arrayBuffer(), signal);
  throwIfAborted(signal);
  let mapped: ReturnType<typeof mapPptxToSnapshot>;
  try {
    mapped = mapPptxToSnapshot(parsed.lean, { fileName: file.name, now: Date.now(), assets: parsed.assets, scan: parsed.scan, driveItemId: opts.driveItemId });
  } catch (err) {
    throw new SlidesImportError("failed", err instanceof Error ? err.message : String(err));
  }
  // The pending assets now hold the only references to the image bytes; each is released after its upload.
  parsed = null;
  assertImportFits(mapped);
  throwIfAborted(signal);

  const failures = await uploadAssets(
    mapped.assets,
    (done, total) => onProgress?.({ stage: "images", done, total }),
    signal,
    (image) => uploadSlidesImage(image, { documentId: null, target }),
  );
  const snapshot = finalizeImportedDeck(mapped.snapshot, failures, mapped.report);
  throwIfAborted(signal);

  onProgress?.({ stage: "creating" });
  const documentId = await createDeckDocument(snapshot, target, { templateId: "import:pptx", title: target.title ?? pptxTitle(file.name) });
  const report = mapped.report.build(snapshot.slides.length);
  keepReport(documentId, report);
  return { documentId, warnings: importWarningCount(report), report };
}
