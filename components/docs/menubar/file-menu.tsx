"use client";

import { Copy, Download, FileCog, FilePlus2, FileText, FolderOpen, History, Pencil, Printer, Share2, Trash2, Upload } from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
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
import { EXPORT_FORMATS } from "@/lib/docs/export";
import { useDocShortcutLabels } from "@/lib/docs/shortcut-label";
import { DOC_TEMPLATES } from "@/lib/docs/templates";
import { useT } from "@/lib/i18n/context";
import { MENUBAR_TRIGGER_CLASS, useEditorFinalFocus } from "./doc-menubar";

export function FileMenu() {
  const t = useT();
  const label = useDocShortcutLabels();
  const finalFocus = useEditorFinalFocus();
  const { doc, access, actions, canEditNow, contentEditor } = useDocEditor();

  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("docs.menubar.file")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-60">
        <DocMenuSub>
          <DocMenuSubTrigger icon={FilePlus2}>{t("docs.file.new")}</DocMenuSubTrigger>
          <DocMenuSubContent>
            <DocMenuItem icon={FileText} onClick={() => void actions.createBlank()}>
              {t("docs.file.newBlank")}
            </DocMenuItem>
            <DocMenuSub>
              <DocMenuSubTrigger inset>{t("docs.file.fromTemplate")}</DocMenuSubTrigger>
              <DocMenuSubContent>
                {DOC_TEMPLATES.filter((template) => template.id !== "blank").map((template) => (
                  <DocMenuItem key={template.id} onClick={() => void actions.createFromTemplate(template.id)}>
                    {t(template.titleKey)}
                  </DocMenuItem>
                ))}
              </DocMenuSubContent>
            </DocMenuSub>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={FolderOpen} shortcut={label("open")} onClick={actions.openDocumentPicker}>
          {t("docs.file.open")}
        </DocMenuItem>
        <DocMenuItem icon={Copy} onClick={() => void actions.makeCopy()}>
          {t("docs.menu.makeCopy")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuItem icon={Share2} onClick={actions.openShare}>
          {t("docs.menu.share")}
        </DocMenuItem>
        <DocMenuSub>
          <DocMenuSubTrigger icon={Download}>{t("docs.file.download")}</DocMenuSubTrigger>
          <DocMenuSubContent>
            {EXPORT_FORMATS.map((format) => (
              <DocMenuItem key={format} disabled={!contentEditor} onClick={() => void actions.exportAs(format)}>
                {t(`docs.file.${format}`)}
              </DocMenuItem>
            ))}
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={Upload} onClick={actions.openImport}>
          {t("docs.file.import")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuSub>
          <DocMenuSubTrigger icon={History}>{t("docs.file.versionHistory")}</DocMenuSubTrigger>
          <DocMenuSubContent>
            <DocMenuItem disabled={!canEditNow} onClick={actions.nameCurrentVersion}>
              {t("docs.file.nameVersion")}
            </DocMenuItem>
            <DocMenuItem shortcut={label("seeVersions")} onClick={actions.showVersionHistory}>
              {t("docs.file.seeVersions")}
            </DocMenuItem>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={Pencil} disabled={!canEditNow} onClick={actions.rename}>
          {t("docs.menu.rename")}
        </DocMenuItem>
        <DocMenuItem icon={Trash2} destructive disabled={!access.canManage || !!doc.trashedAt} onClick={() => void actions.trash()}>
          {t("docs.menu.moveToTrash")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuItem icon={FileCog} onClick={actions.openPageSetup}>
          {t("docs.pageSetup.title")}
        </DocMenuItem>
        <DocMenuItem icon={Printer} shortcut={label("print")} disabled={!contentEditor} onClick={() => void actions.print()}>
          {t("docs.file.print")}
        </DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}
