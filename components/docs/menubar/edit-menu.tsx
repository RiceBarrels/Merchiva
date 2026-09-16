"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { ClipboardPaste, ClipboardType, Copy, Redo2, Replace, Scissors, TextSelect, Undo2 } from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useDocShortcutLabels } from "@/lib/docs/shortcut-label";
import { useT } from "@/lib/i18n/context";
import { MENUBAR_TRIGGER_CLASS, useEditorFinalFocus } from "./doc-menubar";

function useHistoryState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      canUndo: !!ed && !ed.isDestroyed && ed.isEditable && ed.can().undo(),
      canRedo: !!ed && !ed.isDestroyed && ed.isEditable && ed.can().redo(),
    }),
    equalityFn: (a, b) => !!b && a.canUndo === b.canUndo && a.canRedo === b.canRedo,
  });
}

function EditMenuItems() {
  const t = useT();
  const label = useDocShortcutLabels();
  const { editor, editable, actions } = useDocEditor();
  const { canUndo, canRedo } = useHistoryState(editor) ?? { canUndo: false, canRedo: false };

  return (
    <>
      <DocMenuItem icon={Undo2} shortcut={label("undo")} disabled={!canUndo} onClick={actions.undo}>
        {t("docs.edit.undo")}
      </DocMenuItem>
      <DocMenuItem icon={Redo2} shortcut={label("redo")} disabled={!canRedo} onClick={actions.redo}>
        {t("docs.edit.redo")}
      </DocMenuItem>
      <DocMenuSeparator />
      <DocMenuItem icon={Scissors} shortcut={label("cut")} disabled={!editable} onClick={actions.cut}>
        {t("docs.edit.cut")}
      </DocMenuItem>
      <DocMenuItem icon={Copy} shortcut={label("copy")} disabled={!editor} onClick={actions.copy}>
        {t("docs.edit.copy")}
      </DocMenuItem>
      <DocMenuItem icon={ClipboardPaste} shortcut={label("paste")} disabled={!editable} onClick={() => void actions.paste(false)}>
        {t("docs.edit.paste")}
      </DocMenuItem>
      <DocMenuItem icon={ClipboardType} shortcut={label("pastePlain")} disabled={!editable} onClick={() => void actions.paste(true)}>
        {t("docs.edit.pastePlain")}
      </DocMenuItem>
      <DocMenuSeparator />
      <DocMenuItem icon={TextSelect} shortcut={label("selectAll")} disabled={!editor} onClick={actions.selectAll}>
        {t("docs.edit.selectAll")}
      </DocMenuItem>
      <DocMenuSeparator />
      <DocMenuItem icon={Replace} shortcut={label("findReplace")} onClick={() => actions.openFind(true)}>
        {t("docs.edit.findReplace")}
      </DocMenuItem>
    </>
  );
}

export function EditMenu() {
  const t = useT();
  const finalFocus = useEditorFinalFocus();
  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("docs.menubar.edit")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-60">
        <EditMenuItems />
      </DocMenuContent>
    </DocMenu>
  );
}
