"use client";

// What an import or a download leaves out (sheets.md §10.8, §11.8), shown before anything is committed:
// Continue goes on, Cancel (or dismissing) stops. Only shown when the report is non-empty.

import { useCallback, useRef, type Dispatch } from "react";
import type { SheetUiAction, SheetUiState } from "@/components/sheets/editor/sheet-editor-context";
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
import { useT } from "@/lib/i18n/context";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { lossyItemKey, orderedLossy } from "@/lib/sheets/xlsx/lossy";

/** Promise-shaped confirmation over the editor's UI state: `confirm` shows the report, `settle` answers it. */
export function useLossyConfirm(dispatch: Dispatch<SheetUiAction>): {
  confirm(kind: "import" | "export", items: SheetLossyItem[]): Promise<boolean>;
  settle(proceed: boolean): void;
} {
  const pending = useRef<((proceed: boolean) => void) | null>(null);
  const settle = useCallback(
    (proceed: boolean) => {
      const resolve = pending.current;
      pending.current = null;
      dispatch({ type: "closeLossy" });
      resolve?.(proceed);
    },
    [dispatch],
  );
  const confirm = useCallback(
    (kind: "import" | "export", items: SheetLossyItem[]) =>
      new Promise<boolean>((resolve) => {
        pending.current?.(false); // an older report still open: that one is cancelled
        pending.current = resolve;
        dispatch({ type: "showLossy", kind, items });
      }),
    [dispatch],
  );
  return { confirm, settle };
}

export interface LossyReportDialogProps {
  report: SheetUiState["lossy"];
  onSettle(proceed: boolean): void;
}

export function LossyReportDialog({ report, onSettle }: LossyReportDialogProps) {
  const t = useT();
  const items = report ? orderedLossy(report.items) : [];
  const exporting = report?.kind === "export";
  return (
    <AlertDialog
      open={report !== null}
      onOpenChange={(open) => {
        if (!open) onSettle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(exporting ? "sheets.lossy.exportTitle" : "sheets.lossy.importTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t(exporting ? "sheets.lossy.exportDescription" : "sheets.lossy.importDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-60 list-disc space-y-1 overflow-y-auto ps-5 text-sm text-foreground">
          {items.map((item) => (
            <li key={item}>{t(lossyItemKey(item))}</li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("sheets.lossy.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => onSettle(true)}>{t("sheets.lossy.continue")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
