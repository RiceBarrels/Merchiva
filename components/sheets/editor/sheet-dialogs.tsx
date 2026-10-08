"use client";

// Dialog host of the spreadsheet editor. Share (the Docs package) loads the first time it opens and stays mounted so
// its close animation runs. Titles are stable strings, never the spreadsheet's title.

import { useState } from "react";
import dynamic from "next/dynamic";

import { NameVersionDialog } from "@/components/docs/dialogs/name-version-dialog";
import { RenameDialog } from "@/components/docs/dialogs/rename-dialog";
import { LeaseRequestDialog } from "@/components/sheets/chrome/lease-request-dialog";
import { ImportSheetDialog } from "@/components/sheets/dialogs/import-sheet-dialog";
import { LossyReportDialog } from "@/components/sheets/dialogs/lossy-report-dialog";
import { SheetRestoreAlert, SheetVersionHistory, type SheetVersionPreviewState } from "@/components/sheets/panels/sheet-version-history";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/context";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { useSheetEditor } from "./sheet-editor-context";

const ShareDialog = dynamic(() => import("@/components/docs/dialogs/share-dialog").then((m) => m.ShareDialog), { ssr: false });

export interface SheetDialogsProps {
  preview: SheetVersionPreviewState;
  lossy: { confirm(kind: "import" | "export", items: SheetLossyItem[]): Promise<boolean>; settle(proceed: boolean): void };
}

export function SheetDialogs({ preview, lossy }: SheetDialogsProps) {
  const t = useT();
  const { doc, access, mobile, ui, dispatch, actions } = useSheetEditor();
  const dialog = ui.dialog;
  const onOpenChange = (open: boolean) => {
    if (!open) dispatch({ type: "closeDialog" });
  };

  const [shareMounted, setShareMounted] = useState(false);
  if (dialog === "share" && !shareMounted) setShareMounted(true);

  return (
    <>
      {shareMounted && <ShareDialog open={dialog === "share"} onOpenChange={onOpenChange} doc={doc} access={access} />}
      <ImportSheetDialog open={dialog === "import"} onOpenChange={onOpenChange} confirmLossy={lossy.confirm} />
      <NameVersionDialog open={dialog === "nameVersion"} onOpenChange={onOpenChange} onSubmit={actions.saveNamedVersion} />
      <RenameDialog open={dialog === "rename"} onOpenChange={onOpenChange} initialTitle={doc.title} onSubmit={actions.renameTo} />
      <LossyReportDialog report={ui.lossy} onSettle={lossy.settle} />
      <SheetRestoreAlert preview={preview} />
      <LeaseRequestDialog />
      {mobile && (
        <Sheet open={ui.historyOpen} onOpenChange={(open) => dispatch({ type: "setHistory", open })}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{t("docs.versions.title")}</SheetTitle>
            </SheetHeader>
            <SheetVersionHistory variant="page" />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
