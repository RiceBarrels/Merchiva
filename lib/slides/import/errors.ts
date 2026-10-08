// Failures of a .pptx import and the copy each one shows (slides.md §10.1, §14 `slides.import.*`).
import { driveErrorKey } from "@/lib/drive/errors";
import { fmt } from "@/lib/i18n/fmt";

import { PPTX_IMPORT_MAX_MB, type PptxFileProblem } from "./constants";
import type { ZipRejectCode } from "./zip-guard";

/**
 * - `notPptx` / `tooLarge`: the file check before reading (step 1);
 * - `unsafeFile`: the zip guard refused the archive (`[slides.import_rejected]`);
 * - `failed`: the parse crashed, timed out or the file is not a presentation (`[slides.import_failed]`).
 */
export type SlidesImportProblem = PptxFileProblem | "unsafeFile" | "failed";

export class SlidesImportError extends Error {
  readonly code: SlidesImportProblem;
  /** Why the zip guard refused the file (diagnostics only; every code shows the same copy). */
  readonly rejectCode: ZipRejectCode | null;

  constructor(code: SlidesImportProblem, detail?: string, rejectCode: ZipRejectCode | null = null) {
    const tag = code === "unsafeFile" ? "[slides.import_rejected]" : code === "failed" ? "[slides.import_failed]" : "[slides.import]";
    super(`${tag} ${code}${detail ? `: ${detail}` : ""}`);
    this.name = "SlidesImportError";
    this.code = code;
    this.rejectCode = rejectCode;
  }
}

/** A DOMException "AbortError" (what `fetch` and friends reject with when a signal aborts). */
export function abortError(): Error {
  return typeof DOMException === "function" ? new DOMException("The import was cancelled.", "AbortError") : Object.assign(new Error("The import was cancelled."), { name: "AbortError" });
}

export function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

const PROBLEM_KEYS: Readonly<Record<SlidesImportProblem, string>> = {
  notPptx: "slides.import.notPptx",
  tooLarge: "slides.import.tooLarge",
  unsafeFile: "slides.import.unsafeFile",
  failed: "slides.import.failed",
};

/**
 * The message for a failed import: the import's own problems, then `[doc.*]` / `[drive.*]` failures of the create
 * step (a deck over the size limit, lost access, …) through driveErrorKey, then `slides.import.failed`.
 */
export function slidesImportErrorMessage(err: unknown, t: (key: string) => string): string {
  if (err instanceof SlidesImportError) {
    const text = t(PROBLEM_KEYS[err.code]);
    return err.code === "tooLarge" ? fmt(text, { mb: PPTX_IMPORT_MAX_MB }) : text;
  }
  const key = driveErrorKey(err);
  return key === "drive.errors.generic" ? t("slides.import.failed") : t(key);
}
