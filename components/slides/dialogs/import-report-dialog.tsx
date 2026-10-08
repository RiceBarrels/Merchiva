"use client";

// What a .pptx import changed (slides.md §10.1 "UI"): the issues grouped into changes (warnings) and notes
// (information such as removed animations), each with its count and, for substituted fonts, their names; the
// fidelity note; and, when the host passes `onOpenDeck` (an import started inside another deck), "Open presentation".

import { FileWarning, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/ui/dialog-actions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { IMPORT_INFO_CODES, importIssueKey, type ImportReport, type ImportReportItem } from "@/lib/slides/import/report";

export interface ImportReportDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  report: ImportReport | null;
  /** Shown as the primary action when set. */
  onOpenDeck?: () => void;
}

function IssueList({ items, info }: { items: readonly ImportReportItem[]; info: boolean }) {
  const t = useT();
  if (items.length === 0) return null;
  const Icon = info ? Info : FileWarning;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((item) => (
        <li key={item.code} className="flex items-start gap-2.5 px-3 py-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{fmt(t(importIssueKey(item.code)), { n: item.count })}</p>
            {item.detail && item.detail.length > 0 ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.detail.join(", ")}>
                {item.detail.join(", ")}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ImportReportDialog({ open, onOpenChange, report, onOpenDeck }: ImportReportDialogProps): React.JSX.Element {
  const t = useT();
  const items = report?.items ?? [];
  const changes = items.filter((item) => !IMPORT_INFO_CODES.has(item.code));
  const notes = items.filter((item) => IMPORT_INFO_CODES.has(item.code));
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("slides.import.reportTitle")}</SheetTitle>
          <SheetDescription>{changes.length > 0 ? t("slides.import.reportIntro") : t("slides.import.done")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3">
          <IssueList items={changes} info={false} />
          <IssueList items={notes} info />
          <p className="text-xs text-muted-foreground">{t("slides.import.fidelityNote")}</p>
        </div>
        {onOpenDeck ? (
          <DialogActions
            onCancel={close}
            cancelLabel={t("common.close")}
            onConfirm={() => {
              close();
              onOpenDeck();
            }}
            confirmLabel={t("slides.import.openDeck")}
          />
        ) : (
          <div className="flex justify-end border-t border-border pt-3">
            <Button type="button" size="sm" onClick={close}>
              {t("common.close")}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
