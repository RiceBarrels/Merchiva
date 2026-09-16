"use client";

import { useState } from "react";
import {
  CalendarDays,
  Hash,
  Image as ImageIcon,
  Link as LinkIcon,
  ListChecks,
  MessageSquarePlus,
  Minus,
  PanelBottom,
  PanelTop,
  SeparatorHorizontal,
  Table as TableIcon,
} from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { TableGridPicker } from "@/components/docs/toolbar/table-grid-picker";
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
import { variantForPage } from "@/lib/docs/header-footer";
import { useDocShortcutLabels } from "@/lib/docs/shortcut-label";
import { useT } from "@/lib/i18n/context";
import { MENUBAR_TRIGGER_CLASS, useEditorFinalFocus } from "./doc-menubar";

export function InsertMenu() {
  const t = useT();
  const label = useDocShortcutLabels();
  const finalFocus = useEditorFinalFocus();
  const { access, editable, actions, dispatch, pageSetup, pageLayout, setHeaderFooterEditing } = useDocEditor();
  const [open, setOpen] = useState(false);
  // Header/footer boxes only exist on a paged canvas (desktop).
  const canEditBoxes = editable && !!pageLayout;
  const openBox = (zone: "header" | "footer", insertPageField = false) =>
    setHeaderFooterEditing({ zone, variant: variantForPage(1, pageSetup), pageIndex: 0, insertPageField });

  return (
    <DocMenu open={open} onOpenChange={(next) => setOpen(next)}>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("docs.menubar.insert")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-56">
        <DocMenuSub>
          <DocMenuSubTrigger icon={ImageIcon} disabled={!editable}>
            {t("docs.insert.image")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            <DocMenuItem onClick={actions.pickImageFile}>{t("docs.insert.imageUpload")}</DocMenuItem>
            <DocMenuItem onClick={() => dispatch({ type: "openDialog", dialog: "imageUrl" })}>{t("docs.insert.imageUrl")}</DocMenuItem>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuSub>
          <DocMenuSubTrigger icon={TableIcon} disabled={!editable}>
            {t("docs.insert.table")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            <TableGridPicker
              onPick={(rows, cols) => {
                setOpen(false);
                actions.insertTable(rows, cols);
              }}
            />
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={LinkIcon} shortcut={label("link")} disabled={!editable} onClick={actions.openLinkEditor}>
          {t("docs.insert.link")}
        </DocMenuItem>
        <DocMenuItem icon={Minus} disabled={!editable} onClick={actions.insertHorizontalRule}>
          {t("docs.insert.horizontalLine")}
        </DocMenuItem>
        <DocMenuItem icon={SeparatorHorizontal} shortcut={label("pageBreak")} disabled={!editable} onClick={actions.insertPageBreak}>
          {t("docs.insert.pageBreak")}
        </DocMenuItem>
        <DocMenuItem icon={ListChecks} shortcut={label("taskList")} disabled={!editable} onClick={() => actions.toggleList("task")}>
          {t("docs.insert.checklist")}
        </DocMenuItem>
        <DocMenuItem icon={CalendarDays} disabled={!editable} onClick={() => dispatch({ type: "openDialog", dialog: "insertDate" })}>
          {t("docs.insert.date")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuItem icon={PanelTop} disabled={!canEditBoxes} onClick={() => openBox("header")}>
          {t("docs.headerFooter.header")}
        </DocMenuItem>
        <DocMenuItem icon={PanelBottom} disabled={!canEditBoxes} onClick={() => openBox("footer")}>
          {t("docs.headerFooter.footer")}
        </DocMenuItem>
        <DocMenuItem icon={Hash} disabled={!canEditBoxes} onClick={() => openBox("footer", true)}>
          {t("docs.headerFooter.pageNumber")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuItem icon={MessageSquarePlus} shortcut={label("comment")} disabled={!access.canComment} onClick={actions.startComment}>
          {t("docs.insert.comment")}
        </DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}
