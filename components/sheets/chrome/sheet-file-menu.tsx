"use client";

// The spreadsheet's one menu (sheets.md §10.4). Univer's ribbon below the header carries edit, format, insert and
// data; this menu carries the file: new, open Drive, copy, share, import, download, versions, rename, stop editing,
// trash. Items that need rights are disabled, not hidden. Downloads are open to viewers too (Q12). "Make a copy" is off
// while acting for a PIN operator: the copy would be the signed-in (tablet) account's.

import { Menubar } from "@base-ui/react/menubar";
import { Copy, Download, FilePlus2, FolderOpen, History, LogOut, Pencil, Share2, Trash2, Upload } from "lucide-react";

import {
  DocMenu,
  DocMenuContent,
  DocMenuItem,
  DocMenuSeparator,
  DocMenuSub,
  DocMenuSubContent,
  DocMenuSubTrigger,
  DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import { useT } from "@/lib/i18n/context";

/** = MENUBAR_TRIGGER_CLASS of the Docs menu bar (components/docs/menubar/doc-menubar.tsx), which the editor chunk
 *  does not import: that module pulls in the Docs editor. */
const MENUBAR_TRIGGER_CLASS =
  "h-6 rounded px-2 text-[13px] text-foreground outline-none select-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted";

export function SheetFileMenu() {
  const t = useT();
  const { doc, access, actor, editing, host, actions } = useSheetEditor();
  const trashed = doc.trashedAt !== null;

  return (
    <Menubar aria-label={t("sheets.menu.actions")} className="-ms-1 flex h-7 min-w-0 items-center gap-0.5" modal={false}>
      <DocMenu>
        <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("sheets.menu.file")}</DocMenuTrigger>
        <DocMenuContent className="min-w-60">
          <DocMenuItem icon={FilePlus2} onClick={() => void actions.createNew()}>
            {t("sheets.menu.new")}
          </DocMenuItem>
          <DocMenuItem icon={FolderOpen} onClick={actions.goHome}>
            {t("sheets.menu.openDrive")}
          </DocMenuItem>
          <DocMenuItem icon={Copy} disabled={!access.canView || trashed || actor.acting} onClick={() => void actions.makeCopy()}>
            {t("sheets.menu.makeCopy")}
          </DocMenuItem>
          <DocMenuSeparator />
          <DocMenuItem icon={Share2} onClick={actions.openShare}>
            {t("sheets.menu.share")}
          </DocMenuItem>
          <DocMenuItem icon={Upload} disabled={!access.canEdit || trashed} onClick={actions.openImport}>
            {t("sheets.menu.import")}
          </DocMenuItem>
          <DocMenuSub>
            <DocMenuSubTrigger icon={Download}>{t("sheets.menu.download")}</DocMenuSubTrigger>
            <DocMenuSubContent>
              <DocMenuItem disabled={!host} onClick={() => void actions.downloadXlsx()}>
                {t("sheets.menu.downloadXlsx")}
              </DocMenuItem>
              <DocMenuItem disabled={!host} onClick={() => void actions.downloadCsv()}>
                {t("sheets.menu.downloadCsv")}
              </DocMenuItem>
            </DocMenuSubContent>
          </DocMenuSub>
          <DocMenuSeparator />
          <DocMenuSub>
            <DocMenuSubTrigger icon={History}>{t("sheets.menu.versionHistory")}</DocMenuSubTrigger>
            <DocMenuSubContent>
              <DocMenuItem disabled={!access.canEdit || trashed} onClick={actions.nameCurrentVersion}>
                {t("sheets.menu.nameVersion")}
              </DocMenuItem>
              <DocMenuItem onClick={actions.showVersionHistory}>{t("sheets.menu.seeHistory")}</DocMenuItem>
            </DocMenuSubContent>
          </DocMenuSub>
          <DocMenuItem icon={Pencil} disabled={!access.canEdit || trashed} onClick={actions.rename}>
            {t("sheets.menu.rename")}
          </DocMenuItem>
          <DocMenuItem icon={LogOut} disabled={!editing} onClick={() => void actions.stopEditing()}>
            {t("sheets.lease.stopEditing")}
          </DocMenuItem>
          <DocMenuSeparator />
          <DocMenuItem icon={Trash2} destructive disabled={!access.canManage || trashed} onClick={() => void actions.trash()}>
            {t("sheets.menu.moveToTrash")}
          </DocMenuItem>
        </DocMenuContent>
      </DocMenu>
    </Menubar>
  );
}
