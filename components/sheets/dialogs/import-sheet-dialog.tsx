"use client";

// File ▸ Import… (sheets.md §10.8). The file is read first (the xlsx worker, or its in-thread fallback), then it
// opens as a new spreadsheet next to this one (the default), or — for the one editing — replaces this spreadsheet:
// confirmed, and the current content saved as a version first, so it can be restored. What the file loses shows
// before anything is written.

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { reportSheetError } from "@/components/sheets/editor/use-sheet-actions";
import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDriveBytes } from "@/lib/drive/format";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { SHEET_ACCEPT } from "@/lib/sheets/constants";
import { SHEET_IMPORT_TEMPLATE_ID, createSheetFromState, defaultSheetName, sheetTitleFromFileName, univerLocaleOf } from "@/lib/sheets/create";
import {
  readSpreadsheetFile, spreadsheetKind, spreadsheetMaxBytes, spreadsheetReadErrorKey, type SpreadsheetReadResult,
} from "@/lib/sheets/xlsx/client";
import { cn } from "@/lib/utils";

function hasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export interface ImportSheetDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  confirmLossy(kind: "import", items: SpreadsheetReadResult["lossy"]): Promise<boolean>;
}

export function ImportSheetDialog({ open, onOpenChange, confirmLossy }: ImportSheetDialogProps) {
  const { t, locale } = useI18n();
  const { facade, editing, actions } = useSheetEditor();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SpreadsheetReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const busy = reading || committing;
  const attempt = useRef(0);

  const reset = () => {
    attempt.current += 1;
    setFile(null);
    setResult(null);
    setError(null);
    setReading(false);
    setConfirmReplace(false);
  };

  const close = () => {
    if (committing) return;
    reset();
    onOpenChange(false);
  };

  const readErrorText = (err: unknown, picked: File): string => {
    const key = spreadsheetReadErrorKey(err);
    if (key !== "sheets.import.tooLarge") return t(key);
    const kind = spreadsheetKind(picked) ?? "xlsx";
    return fmt(t(key), { size: formatDriveBytes(picked.size, locale), max: formatDriveBytes(spreadsheetMaxBytes(kind), locale) });
  };

  const read = async (picked: File) => {
    const current = ++attempt.current;
    setFile(picked);
    setResult(null);
    setError(null);
    setReading(true);
    try {
      const outcome = await readSpreadsheetFile(picked, { locale: univerLocaleOf(locale), sheetName: defaultSheetName(t), languages: [locale] });
      if (current === attempt.current) setResult(outcome);
    } catch (err) {
      if (current === attempt.current) setError(readErrorText(err, picked));
    } finally {
      if (current === attempt.current) setReading(false);
    }
  };

  /** What the file loses is shown once, before either action goes on. */
  const lossyAccepted = async (): Promise<boolean> =>
    !result || result.lossy.length === 0 || (await confirmLossy("import", result.lossy));

  const commit = async (mode: "new" | "replace") => {
    if (!file || !result || committing) return;
    setCommitting(true);
    try {
      if (mode === "new") {
        const title = result.title || sheetTitleFromFileName(file.name);
        const id = await createSheetFromState(result, actions.newTarget, { templateId: SHEET_IMPORT_TEMPLATE_ID, title });
        toast.success(fmt(t("sheets.import.imported"), { name: file.name }));
        actions.openSheet(id, true);
      } else {
        const session = facade.session;
        if (!session) throw new Error("No live session");
        await session.replaceContent(
          { state: result.state, plainText: result.plainText, cellCount: result.cellCount },
          fmt(t("sheets.import.beforeReplace"), { name: file.name }),
        );
        toast.success(t("sheets.import.replaced"));
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      reportSheetError(err, t);
    } finally {
      setCommitting(false);
      setConfirmReplace(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("sheets.import.title")}</SheetTitle>
            <SheetDescription>{t("sheets.import.description")}</SheetDescription>
          </SheetHeader>
          <input
            ref={inputRef}
            type="file"
            accept={SHEET_ACCEPT}
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = "";
              if (picked) void read(picked);
            }}
          />
          <div
            aria-busy={busy || undefined}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border px-4 py-8 text-center"
            onDragOver={(event) => {
              if (!hasFiles(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = busy ? "none" : "copy";
            }}
            onDrop={(event) => {
              if (!hasFiles(event)) return;
              event.preventDefault();
              const picked = event.dataTransfer.files[0];
              if (picked && !busy) void read(picked);
            }}
          >
            {reading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden />
            )}
            {file && (
              <p className={cn("max-w-full truncate text-sm", reading ? "text-muted-foreground" : "text-foreground")}>
                {reading ? fmt(t("sheets.import.reading"), { name: file.name }) : file.name}
              </p>
            )}
            <Button type="button" size="sm" variant={result ? "outline" : "default"} disabled={busy} onClick={() => inputRef.current?.click()}>
              {t("sheets.import.choose")}
            </Button>
            <p className="hidden text-[12px] text-muted-foreground md:block">{t("sheets.import.drop")}</p>
          </div>
          {error && <Callout tone="danger">{error}</Callout>}
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
            {editing && (
              <Button type="button" variant="outline" size="sm" disabled={!result || busy} onClick={() => void lossyAccepted().then((ok) => setConfirmReplace(ok))}>
                {t("sheets.import.replace")}
              </Button>
            )}
            <Button type="button" size="sm" disabled={!result || busy} aria-busy={committing || undefined} onClick={() => void lossyAccepted().then((ok) => (ok ? commit("new") : undefined))}>
              {committing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("sheets.import.asNew")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={confirmReplace}
        onOpenChange={(next) => {
          if (!next && !committing) setConfirmReplace(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sheets.import.replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("sheets.import.replaceDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={committing}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={committing} onClick={() => void commit("replace")}>
              {committing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("sheets.import.replace")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
