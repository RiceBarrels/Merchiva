"use client";

// Dialog host of the Slides editor (slides.md §7.2): one dialog at a time, named by ui.dialog. Share, rename, name
// a version and restore a version reuse the Docs dialogs as they are; .pptx import and its report are the Slides
// import dialogs; insert table, picture by link and the move-to-trash confirmation complete the set. Each layout
// (desktop, phone) mounts this once.
//
// Share (the Docs package) loads lazily the first time it opens; share and import stay mounted once opened, so their
// close animation runs (and a running import is not cancelled by the dialog unmounting). The share dialog gets the
// session's live document row and access, so a visibility change shows at once.
import { useState } from "react";
import dynamic from "next/dynamic";

import { NameVersionDialog } from "@/components/docs/dialogs/name-version-dialog";
import { RenameDialog } from "@/components/docs/dialogs/rename-dialog";
import { RestoreVersionAlert } from "@/components/docs/dialogs/restore-version-alert";
import { ImageUrlDialog } from "@/components/docs/editor/image-url-dialog";
import { useDriveActor } from "@/components/drive/drive-actor";
import { ImportPptxDialog } from "@/components/slides/dialogs/import-pptx-dialog";
import { ImportReportDialog } from "@/components/slides/dialogs/import-report-dialog";
import { InsertTableDialog } from "@/components/slides/dialogs/insert-table-dialog";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/lib/docs/format";
import { useT } from "@/lib/i18n/context";
import { targetForNewFromDeck } from "@/lib/slides/create";
import { useDocumentVersions } from "@/lib/spacetimedb/hooks/useDocs";

const ShareDialog = dynamic(() => import("@/components/docs/dialogs/share-dialog").then((m) => m.ShareDialog), { ssr: false });

export function SlidesDialogs() {
  const t = useT();
  const actor = useDriveActor();
  const { doc, access, ui, dispatch, actions, el, locale } = useSlidesEditor();
  const dialog = ui.dialog;
  const onOpenChange = (open: boolean) => {
    if (!open) dispatch({ type: "closeDialog" });
  };

  const [shareMounted, setShareMounted] = useState(false);
  const [importMounted, setImportMounted] = useState(false);
  if (dialog === "share" && !shareMounted) setShareMounted(true);
  if (dialog === "importPptx" && !importMounted) setImportMounted(true);

  // The restore confirmation names the version's time; it keeps the last one while it closes.
  const restoreId = dialog === "restoreConfirm" ? ui.restoreVersionId : null;
  const { versions } = useDocumentVersions(doc.id, restoreId !== null);
  const restoreVersion = restoreId ? versions.find((v) => v.id === restoreId) : undefined;
  const [restoreTime, setRestoreTime] = useState("");
  const time = restoreVersion ? formatDateTime(restoreVersion.createdAt, locale) : "";
  if (time !== "" && time !== restoreTime) setRestoreTime(time);

  // A new deck (File ▸ Import) goes next to this one, or to the actor's own My files (targetForNewFromDeck).
  const importTarget = actor.ready ? targetForNewFromDeck(doc, actor) : null;

  return (
    <>
      {shareMounted && <ShareDialog open={dialog === "share"} onOpenChange={onOpenChange} doc={doc} access={access} />}
      <RenameDialog open={dialog === "rename"} onOpenChange={onOpenChange} initialTitle={doc.title} onSubmit={actions.renameTo} />
      <NameVersionDialog open={dialog === "nameVersion"} onOpenChange={onOpenChange} mode="name" onSubmit={actions.nameCurrentVersion} />
      <RestoreVersionAlert
        open={dialog === "restoreConfirm"}
        onOpenChange={onOpenChange}
        time={time || restoreTime}
        onConfirm={() => (restoreId ? actions.restoreVersion(restoreId) : Promise.reject(new Error("No version to restore")))}
      />
      {importMounted && (
        <ImportPptxDialog
          open={dialog === "importPptx"}
          onOpenChange={onOpenChange}
          target={importTarget}
          onImported={(result) => actions.openImported(result.documentId)}
        />
      )}
      <ImportReportDialog open={dialog === "importReport"} onOpenChange={onOpenChange} report={ui.importReport} />
      <InsertTableDialog open={dialog === "insertTable"} onOpenChange={onOpenChange} onSubmit={(rows, cols) => el.insertTable(rows, cols)} />
      <ImageUrlDialog open={dialog === "imageUrl"} onOpenChange={onOpenChange} onSubmit={el.insertImageUrl} />
      <AlertDialog open={dialog === "trashConfirm"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("slides.file.trashConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("slides.file.trashConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!access.canManage}
              onClick={() => {
                dispatch({ type: "closeDialog" });
                void actions.moveToTrash();
              }}
            >
              {t("slides.file.moveToTrash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
