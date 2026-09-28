"use client";

// Import a .pptx as a new presentation (slides.md §10.1 "UI"). Pick or drop a file; the sheet shows each stage
// (checking, reading slides, uploading images n of m, creating) and can cancel until the deck is being created.
// The management notice sits above the picker (C8): an imported deck is stored where management can see it.
//
// The import code (parser worker, pptxtojson, DOMPurify) loads only when a file is chosen. The host decides where
// the deck goes (`target`: Drive's placement, or targetForNewFromDeck in the editor) and what happens next
// (`onImported`: open the deck; the editor then shows the report via takePendingImportReport, or the host shows
// ImportReportDialog with "Open presentation").

import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ManagementNoticeBanner } from "@/components/drive/notice/management-notice";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { DriveDocTarget } from "@/lib/drive/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { PPTX_ACCEPT, PPTX_IMPORT_MAX_MB, checkPptxFile } from "@/lib/slides/import/constants";
import { isAbortError, slidesImportErrorMessage } from "@/lib/slides/import/errors";
import type { ImportProgress, ImportSlidesResult } from "@/lib/slides/import";
import { cn } from "@/lib/utils";

export interface ImportPptxDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Where the new deck goes; null while it is not known (the picker is disabled). */
  target: DriveDocTarget | null;
  /** Called once the deck exists, just before the sheet closes. */
  onImported(result: ImportSlidesResult): void;
}

function hasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function stageText(progress: ImportProgress, t: (key: string) => string): string {
  switch (progress.stage) {
    case "checking":
      return t("slides.import.checking");
    case "parsing":
      return t("slides.import.parsing");
    case "images":
      return fmt(t("slides.import.uploadingImages"), { done: progress.done, total: progress.total });
    case "creating":
      return t("slides.import.creating");
  }
}

export function ImportPptxDialog({ open, onOpenChange, target, onImported }: ImportPptxDialogProps): React.JSX.Element {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const busy = progress !== null;
  const creating = progress?.stage === "creating";

  // When the host goes away (route change, the editor or panel closing), a running import is cancelled like a
  // closed sheet; one already creating its deck finishes, but no longer opens it or touches the host.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const runImport = async (file: File) => {
    if (abortRef.current || !target) return;
    const problem = checkPptxFile(file);
    if (problem) {
      toast.error(problem === "tooLarge" ? fmt(t("slides.import.tooLarge"), { mb: PPTX_IMPORT_MAX_MB }) : t("slides.import.notPptx"));
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ stage: "checking" });
    try {
      const { importSlidesFile } = await import("@/lib/slides/import");
      const result = await importSlidesFile(file, target, { signal: controller.signal, onProgress: setProgress });
      toast.success(t("slides.import.done"));
      abortRef.current = null;
      if (!mountedRef.current) return;
      onImported(result);
      onOpenChange(false);
    } catch (err) {
      if (!isAbortError(err)) {
        console.error("[slides] import failed", err);
        toast.error(slidesImportErrorMessage(err, t));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setProgress(null);
    }
  };

  const cancel = () => {
    if (creating) return;
    abortRef.current?.abort();
  };

  const percent = progress?.stage === "images" && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && abortRef.current) {
          // Closing cancels a running import, except while the deck is being created.
          if (creating) return;
          abortRef.current.abort();
        }
        onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("slides.import.title")}</SheetTitle>
          <SheetDescription>{t("slides.import.description")}</SheetDescription>
        </SheetHeader>
        <ManagementNoticeBanner compact />
        <input
          ref={inputRef}
          type="file"
          accept={PPTX_ACCEPT}
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
            "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center transition-colors",
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
            event.dataTransfer.dropEffect = busy || !target ? "none" : "copy";
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
          {progress ? (
            <div className="flex w-full max-w-xs flex-col items-center gap-3" role="status" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-sm text-foreground">{stageText(progress, t)}</p>
              <Progress value={percent} aria-label={stageText(progress, t)} className="w-full" />
              <Button type="button" size="sm" variant="outline" disabled={creating} onClick={cancel}>
                {t("slides.import.cancel")}
              </Button>
            </div>
          ) : (
            <>
              <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden />
              <Button type="button" size="sm" disabled={!target} onClick={() => inputRef.current?.click()}>
                {t("slides.import.choose")}
              </Button>
              <p className="hidden text-xs text-muted-foreground md:block">{t("slides.import.dropHere")}</p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
