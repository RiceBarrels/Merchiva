"use client";

/**
 * Import a file as a new document (plan §B7.3; docs-editor-ui spec §6.4 "Import UI"). Used from the docs home
 * ("Import" button) and from File ▸ Import file in the editor.
 *
 * Props:
 * - `open` / `onOpenChange`
 * - `onImported(documentId)` — called after the document is created, just before the dialog closes. The docs home
 *   navigates to `documentHref(documentId, { isNew: true })`; the editor opens it in a new tab.
 *
 * Behaviour:
 * 1. "Choose file" opens a hidden `<input type="file" accept={IMPORT_ACCEPT}>`; a file can also be dropped on the
 *    drop area.
 * 2. `validateImportFile`, then `importAsNewDocument(file, { t, locale })`, with a Loader2 progress state (`docs.import.importing`).
 * 3. After success: `docs.import.warnings` if `result.warnings > 0`; `docs.import.imagesSkipped` if `result.skippedImages > 0`.
 * 4. Errors: `toast.error(t(importErrorMessageKey(err)))`; the dialog stays open.
 * 5. It can't be dismissed while an import is running.
 *
 * The title is the stable `t("docs.import.title")`.
 */
import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DocImportError,
  IMPORT_ACCEPT,
  importAsNewDocument,
  importErrorMessageKey,
  validateImportFile,
} from "@/lib/docs/import";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface ImportDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onImported(documentId: string): void;
}

function hasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const busyRef = useRef(false);

  const runImport = async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const invalid = validateImportFile(file);
      if (invalid) throw new DocImportError(invalid);
      const { documentId, result } = await importAsNewDocument(file, { t, locale });
      if (result.warnings > 0) toast(t("docs.import.warnings"));
      if (result.skippedImages > 0) toast.warning(t("docs.import.imagesSkipped"));
      onImported(documentId);
      busyRef.current = false;
      onOpenChange(false);
    } catch (err) {
      if (!(err instanceof DocImportError) || err.code === "failed") console.error("[docs] import failed", err);
      toast.error(t(importErrorMessageKey(err)));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && busyRef.current) return;
        onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("docs.import.title")}</SheetTitle>
          <SheetDescription>{t("docs.import.description")}</SheetDescription>
        </SheetHeader>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void runImport(file);
          }}
        />
        <div
          aria-busy={busy || undefined}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border border-border px-4 py-8 text-center transition-colors",
            dragOver && !busy && "border-foreground/40 bg-muted",
          )}
          onDragEnter={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = busy ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragOver(false);
          }}
          onDrop={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file && !busy) void runImport(file);
          }}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
          <p className="max-w-xs text-sm text-muted-foreground sm:hidden">{t("docs.import.description")}</p>
          <Button type="button" size="sm" disabled={busy} aria-busy={busy || undefined} onClick={() => inputRef.current?.click()}>
            {busy ? t("docs.import.importing") : t("docs.import.choose")}
          </Button>
          <p className="hidden text-[12px] text-muted-foreground md:block">{t("docs.import.drop")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
