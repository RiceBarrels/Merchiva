"use client";

// The phone's "More" drawer for a spreadsheet (sheets.md §10.5): the File menu's actions as full-width rows, plus the
// star. Neither the star nor "Make a copy" shows while acting for a PIN operator: both are written for the signed-in
// (tablet) account. Every row closes the drawer before it runs, so a dialog it opens is never hidden behind it.

import { Copy, FileDown, FilePlus2, FolderOpen, History, LogOut, Pencil, Share2, Star, Trash2, Upload } from "lucide-react";

import { MobileDrawer, SheetDivider, SheetRow } from "@/components/docs/mobile/mobile-drawer";
import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import { useT } from "@/lib/i18n/context";

export function MobileSheetActions() {
  const t = useT();
  const { doc, access, isStarred, actor, editing, host, ui, dispatch, actions } = useSheetEditor();
  const trashed = doc.trashedAt !== null;
  const run = (fn: () => void) => () => {
    dispatch({ type: "setMobileActions", open: false });
    fn();
  };

  return (
    <MobileDrawer open={ui.mobileActions} onOpenChange={(open) => dispatch({ type: "setMobileActions", open })} title={t("sheets.menu.actions")}>
      <SheetRow icon={Share2} label={t("sheets.menu.share")} onSelect={run(actions.openShare)} />
      {!actor.acting && (
        <SheetRow icon={Star} label={isStarred ? t("docs.menu.unstar") : t("docs.menu.star")} disabled={trashed} onSelect={run(() => void actions.toggleStar())} />
      )}
      <SheetRow icon={History} label={t("sheets.menu.seeHistory")} onSelect={run(actions.showVersionHistory)} />
      <SheetDivider />
      <SheetRow icon={FileDown} label={`${t("sheets.menu.download")} · ${t("sheets.menu.downloadXlsx")}`} disabled={!host} onSelect={run(() => void actions.downloadXlsx())} />
      <SheetRow icon={FileDown} label={`${t("sheets.menu.download")} · ${t("sheets.menu.downloadCsv")}`} disabled={!host} onSelect={run(() => void actions.downloadCsv())} />
      <SheetRow icon={Upload} label={t("sheets.menu.import")} disabled={!access.canEdit || trashed} onSelect={run(actions.openImport)} />
      {!actor.acting && (
        <SheetRow icon={Copy} label={t("sheets.menu.makeCopy")} disabled={trashed} onSelect={run(() => void actions.makeCopy())} />
      )}
      <SheetRow icon={FilePlus2} label={t("sheets.menu.new")} onSelect={run(() => void actions.createNew())} />
      <SheetRow icon={Pencil} label={t("sheets.menu.rename")} disabled={!access.canEdit || trashed} onSelect={run(actions.rename)} />
      {editing && <SheetRow icon={LogOut} label={t("sheets.lease.stopEditing")} onSelect={run(() => void actions.stopEditing())} />}
      <SheetRow icon={FolderOpen} label={t("sheets.menu.openDrive")} onSelect={run(actions.goHome)} />
      <SheetDivider />
      <SheetRow icon={Trash2} label={t("sheets.menu.moveToTrash")} destructive disabled={!access.canManage || trashed} onSelect={run(() => void actions.trash())} />
    </MobileDrawer>
  );
}
