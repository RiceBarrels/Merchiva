"use client";

// File menu (slides.md §7.2): new deck and .pptx import (both land next to this deck, or in the actor's own My files
// when it belongs to someone else: targetForNewFromDeck), open Drive, copy, share, download, versions, rename, trash.
// Copy and share are left out while acting for a PIN operator (useSlidesFileCommands).
import { ArchiveRestore, Copy, Download, FolderOpen, History, Pencil, Presentation, Share2, Trash2, Upload } from "lucide-react";

import { MENUBAR_TRIGGER_CLASS } from "@/components/docs/menubar/doc-menubar";
import {
  DocMenu, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuSub, DocMenuSubContent, DocMenuSubTrigger, DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useDriveActor } from "@/components/drive/drive-actor";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useSlidesFileCommands } from "@/components/slides/editor/use-slides-actions";
import { SLIDES_EXPORT_FORMATS, type SlidesExportFormat } from "@/components/slides/export/export-deck";
import { useT } from "@/lib/i18n/context";

const FORMAT_KEYS: Readonly<Record<SlidesExportFormat, string>> = {
  pptx: "slides.file.downloadPptx",
  pdf: "slides.file.downloadPdf",
  png: "slides.file.downloadPng",
};

export function FileMenu() {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const { doc, access, canEditNow, actions, dispatch } = useSlidesEditor();
  // New decks need the actor (who owns them, where they go); on /store that is the PIN operator.
  const actorReady = useDriveActor().ready;
  const commands = useSlidesFileCommands();
  const trashed = doc.trashedAt !== null;

  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("slides.menubar.file")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-60">
        <DocMenuItem icon={Presentation} disabled={!actorReady} onClick={() => void actions.newPresentation()}>
          {t("slides.file.new")}
        </DocMenuItem>
        <DocMenuItem icon={FolderOpen} onClick={actions.goHome}>
          {t("slides.file.open")}
        </DocMenuItem>
        <DocMenuItem icon={Upload} disabled={!actorReady} onClick={actions.openImport}>
          {t("slides.file.import")}
        </DocMenuItem>
        {commands.makeCopy && (
          <DocMenuItem icon={Copy} onClick={() => void actions.makeCopy()}>
            {t("slides.file.makeCopy")}
          </DocMenuItem>
        )}
        <DocMenuSeparator />
        {commands.share && (
          <DocMenuItem icon={Share2} onClick={actions.openShare}>
            {t("slides.file.share")}
          </DocMenuItem>
        )}
        <DocMenuSub>
          <DocMenuSubTrigger icon={Download}>{t("slides.file.download")}</DocMenuSubTrigger>
          <DocMenuSubContent>
            {SLIDES_EXPORT_FORMATS.map((format) => (
              <DocMenuItem key={format} onClick={() => void actions.download(format)}>
                {t(FORMAT_KEYS[format])}
              </DocMenuItem>
            ))}
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuSeparator />
        <DocMenuSub>
          <DocMenuSubTrigger icon={History}>{t("slides.file.versionHistory")}</DocMenuSubTrigger>
          <DocMenuSubContent>
            <DocMenuItem disabled={!canEditNow} onClick={() => dispatch({ type: "openDialog", dialog: "nameVersion" })}>
              {t("slides.file.nameVersion")}
            </DocMenuItem>
            <DocMenuItem onClick={actions.showVersionHistory}>{t("docs.file.seeVersions")}</DocMenuItem>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={Pencil} disabled={!canEditNow || trashed} onClick={() => dispatch({ type: "openDialog", dialog: "rename" })}>
          {t("slides.file.rename")}
        </DocMenuItem>
        {trashed ? (
          <DocMenuItem icon={ArchiveRestore} disabled={!access.canManage} onClick={() => void actions.restoreFromTrash()}>
            {t("slides.editor.restore")}
          </DocMenuItem>
        ) : (
          <DocMenuItem icon={Trash2} destructive disabled={!access.canManage} onClick={() => void actions.moveToTrash()}>
            {t("slides.file.moveToTrash")}
          </DocMenuItem>
        )}
      </DocMenuContent>
    </DocMenu>
  );
}
