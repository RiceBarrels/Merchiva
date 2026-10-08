"use client";

// The hidden file input behind New ▸ Import a file on the Drive page: one file that a Docs, Sheets
// or Slides importer reads (lib/drive/file-kinds.ts importTargetOf picks which). `pick` must run in
// the click's own handler, so the browser still sees the user's gesture.

import { useCallback, useRef } from "react";

/** Every format an editor can import: Docs (.docx, Markdown, HTML, text), Sheets (.xlsx, .xlsm, .csv), Slides (.pptx). */
export const DRIVE_IMPORT_ACCEPT = ".docx,.md,.markdown,.html,.htm,.txt,.xlsx,.xlsm,.csv,.pptx";

export interface ImportFilePicker {
  /** Opens the picker. */
  pick(): void;
  /** The hidden input; render it outside the menu, which unmounts its items when it closes. */
  input: React.ReactNode;
}

/** A one-file picker that hands its file to `onFile`. */
export function useImportFilePicker(onFile: (file: File) => void): ImportFilePicker {
  const ref = useRef<HTMLInputElement>(null);
  const pick = useCallback(() => {
    const input = ref.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, []);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={DRIVE_IMPORT_ACCEPT}
      tabIndex={-1}
      aria-hidden
      className="hidden"
      data-drive-import-input=""
      onChange={(event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = "";
        if (file) onFile(file);
      }}
    />
  );
  return { pick, input };
}
