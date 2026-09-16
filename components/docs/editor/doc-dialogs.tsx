"use client";

/**
 * Dialog host for the editor. Share and Open (docs home package) load lazily the first time they open.
 * Every DynamicUIElement title is a stable i18n string, never the document title (titles go into `?dialogs=`).
 */
import { useState } from "react";
import dynamic from "next/dynamic";

import { ImportDialog } from "@/components/docs/dialogs/import-dialog";
import { NameVersionDialog } from "@/components/docs/dialogs/name-version-dialog";
import { PageSetupDialog } from "@/components/docs/dialogs/page-setup-dialog";
import { RenameDialog } from "@/components/docs/dialogs/rename-dialog";
import { RestoreVersionAlert } from "@/components/docs/dialogs/restore-version-alert";
import { WordCountDialog } from "@/components/docs/dialogs/word-count-dialog";
import { formatDateTime } from "@/lib/docs/format";
import { unitForLocale } from "@/lib/docs/page-setup";
import { useDocEditor } from "./doc-editor-context";
import { ImageUrlDialog } from "./image-url-dialog";
import { InsertDateDialog } from "./insert-date-dialog";

const ShareDialog = dynamic(() => import("@/components/docs/dialogs/share-dialog").then((m) => m.ShareDialog), { ssr: false });
const OpenDocumentDialog = dynamic(
  () => import("@/components/docs/dialogs/open-document-dialog").then((m) => m.OpenDocumentDialog),
  { ssr: false },
);

export function DocDialogs() {
  const { doc, access, ui, dispatch, actions, contentEditor, findVersion, locale, pageSetup, setPageSetup, canEditNow } = useDocEditor();
  const dialog = ui.dialog;
  const onOpenChange = (open: boolean) => {
    if (!open) dispatch({ type: "closeDialog" });
  };

  // Lazy dialogs mount on first open and stay mounted so their close animation runs.
  const [shareMounted, setShareMounted] = useState(false);
  const [openMounted, setOpenMounted] = useState(false);
  if (dialog === "share" && !shareMounted) setShareMounted(true);
  if (dialog === "open" && !openMounted) setOpenMounted(true);

  const restoreVersion = ui.restoreVersionId ? findVersion(ui.restoreVersionId) : undefined;
  const restoreTime = restoreVersion ? formatDateTime(restoreVersion.createdAt, locale) : "";

  return (
    <>
      {shareMounted && <ShareDialog open={dialog === "share"} onOpenChange={onOpenChange} doc={doc} access={access} />}
      {openMounted && <OpenDocumentDialog open={dialog === "open"} onOpenChange={onOpenChange} />}
      <WordCountDialog
        open={dialog === "wordCount"}
        onOpenChange={onOpenChange}
        editor={contentEditor}
        showWhileTyping={ui.showWordCount}
        onShowWhileTypingChange={actions.setShowWordCount}
      />
      <NameVersionDialog open={dialog === "nameVersion"} onOpenChange={onOpenChange} mode="name" onSubmit={actions.saveNamedVersion} />
      <RestoreVersionAlert open={dialog === "restoreConfirm"} onOpenChange={onOpenChange} time={restoreTime} onConfirm={actions.confirmRestore} />
      <ImportDialog open={dialog === "import"} onOpenChange={onOpenChange} onImported={actions.openImported} />
      <RenameDialog open={dialog === "rename"} onOpenChange={onOpenChange} initialTitle={doc.title} onSubmit={actions.renameTo} />
      <ImageUrlDialog open={dialog === "imageUrl"} onOpenChange={onOpenChange} onSubmit={actions.insertImageFromUrl} />
      <InsertDateDialog open={dialog === "insertDate"} onOpenChange={onOpenChange} onSubmit={actions.insertDate} />
      <PageSetupDialog
        open={dialog === "pageSetup"}
        onOpenChange={onOpenChange}
        setup={pageSetup}
        unit={unitForLocale(locale)}
        canEdit={canEditNow}
        onSubmit={setPageSetup}
      />
    </>
  );
}
