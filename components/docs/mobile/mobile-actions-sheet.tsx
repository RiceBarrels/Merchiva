"use client";

/** Mobile "⋮" document actions (docs-editor-ui spec §7.3) and the nested Download sheet. */
import {
  Copy,
  Download,
  FileDown,
  History,
  ListTree,
  MessageSquare,
  Pencil,
  Plus,
  Printer,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
  WholeWord,
} from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { EXPORT_FORMATS } from "@/lib/docs/export";
import { useT } from "@/lib/i18n/context";
import { MobileDrawer, SheetDivider, SheetRow } from "./mobile-drawer";

export function MobileActionsSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const { doc, access, isStarred, ui, dispatch, actions, canEditNow, contentEditor } = useDocEditor();
  const editing = ui.mobileMode === "editing";
  const run = (fn: () => void) => () => {
    dispatch({ type: "closeMobileSheet" });
    fn();
  };

  return (
    <MobileDrawer open={open} onOpenChange={onOpenChange} title={t("docs.mobile.actions")}>
      <SheetRow icon={Share2} label={t("docs.menu.share")} onSelect={run(actions.openShare)} />
      <SheetRow icon={Star} label={isStarred ? t("docs.menu.unstar") : t("docs.menu.star")} disabled={!!doc.trashedAt} onSelect={run(() => void actions.toggleStar())} />
      <SheetRow icon={MessageSquare} label={t("docs.comments.title")} onSelect={() => dispatch({ type: "openMobilePage", page: "comments" })} />
      <SheetRow icon={ListTree} label={t("docs.outline.title")} onSelect={() => dispatch({ type: "openMobilePage", page: "outline" })} />
      <SheetRow icon={Search} label={t("docs.edit.findReplace")} onSelect={run(() => actions.openFind(editing))} />
      <SheetRow icon={History} label={t("docs.versions.title")} onSelect={() => dispatch({ type: "openMobilePage", page: "history" })} />
      <SheetRow icon={WholeWord} label={t("docs.tools.wordCount")} onSelect={run(actions.openWordCount)} />
      <SheetDivider />
      {editing && <SheetRow icon={Plus} label={t("docs.mobile.insert")} chevron onSelect={() => dispatch({ type: "openMobileSheet", sheet: "insert" })} />}
      <SheetRow icon={Download} label={t("docs.file.download")} chevron disabled={!contentEditor} onSelect={() => dispatch({ type: "openMobileSheet", sheet: "download" })} />
      <SheetRow icon={Upload} label={t("docs.file.import")} onSelect={run(actions.openImport)} />
      <SheetRow icon={Copy} label={t("docs.menu.makeCopy")} onSelect={run(() => void actions.makeCopy())} />
      <SheetRow icon={Pencil} label={t("docs.menu.rename")} disabled={!canEditNow} onSelect={run(actions.rename)} />
      <SheetRow icon={Printer} label={t("docs.file.print")} disabled={!contentEditor} onSelect={run(() => void actions.print())} />
      <SheetRow
        icon={Trash2}
        label={t("docs.menu.moveToTrash")}
        destructive
        disabled={!access.canManage || !!doc.trashedAt}
        onSelect={run(() => void actions.trash())}
      />
    </MobileDrawer>
  );
}

export function MobileDownloadSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const { dispatch, actions } = useDocEditor();
  return (
    <MobileDrawer open={open} onOpenChange={onOpenChange} title={t("docs.file.download")}>
      {EXPORT_FORMATS.map((format) => (
        <SheetRow
          key={format}
          icon={FileDown}
          label={t(`docs.file.${format}`)}
          onSelect={() => {
            dispatch({ type: "closeMobileSheet" });
            void actions.exportAs(format);
          }}
        />
      ))}
    </MobileDrawer>
  );
}
