// The .pptx import limits and file checks the dialogs need before the import code loads (slides.md §10.1 step 1).
// No imports, so a dialog can use these without pulling the parser, the worker or DOMPurify into its bundle.

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const PPTX_EXTENSION = ".pptx";
/** The file input's `accept`. */
export const PPTX_ACCEPT = `${PPTX_EXTENSION},${PPTX_MIME}`;
/** Largest .pptx the import opens. */
export const PPTX_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
/** PPTX_IMPORT_MAX_BYTES in MB, for `slides.import.tooLarge` ({mb}). */
export const PPTX_IMPORT_MAX_MB = PPTX_IMPORT_MAX_BYTES / (1024 * 1024);

export type PptxFileProblem = "tooLarge" | "notPptx";

/** Step 1 of the import: the size first, then the `.pptx` extension or MIME type. Null when the file may be read. */
export function checkPptxFile(file: { name: string; size: number; type: string }): PptxFileProblem | null {
  if (!Number.isFinite(file.size) || file.size > PPTX_IMPORT_MAX_BYTES) return "tooLarge";
  const named = file.name.toLowerCase().endsWith(PPTX_EXTENSION);
  if (!named && file.type.toLowerCase() !== PPTX_MIME) return "notPptx";
  return null;
}

/** The deck title a file gives: its name without the extension (the name itself when nothing is left). */
export function pptxTitle(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "");
  const stripped = base.replace(/\.pptx$/i, "").trim();
  return stripped === "" ? base.trim() : stripped;
}
