"use client";

// Edit menu (slides.md §7.2). While text is being typed in, cut / copy / paste / select all work on that text, as
// Mod+X/C/V/A do; otherwise on the selected elements (or, with none selected, copy takes the rail's slides), through
// the element actions and their in-memory clipboard copy. Undo and redo are the deck's one stack either way.
import { ClipboardPaste, Copy, CopyPlus, Redo2, Scissors, TextSelect, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { execClipboardCommand, pasteFromClipboard } from "@/components/docs/editor/clipboard";
import { MENUBAR_TRIGGER_CLASS } from "@/components/docs/menubar/doc-menubar";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useEditingEditor, useSlidesFinalFocus, useSlidesSelection, useSlidesShortcutLabels } from "@/components/slides/chrome/chrome-hooks";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

export function EditMenu() {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const finalFocus = useSlidesFinalFocus();
  const { undo, el, dispatch, deck } = useSlidesEditor();
  const sel = useSlidesSelection();
  const editor = useEditingEditor();
  const writable = sel.writable;
  const hasSelection = sel.selected.length > 0;
  const blocked = (shortcut: string) => toast(fmt(t("docs.edit.clipboardBlocked"), { shortcut }));

  const cut = () => {
    if (editor) {
      if (!execClipboardCommand(editor, "cut")) blocked(label("cut"));
    } else el.cut();
  };
  const copy = () => {
    if (editor) {
      if (!execClipboardCommand(editor, "copy")) blocked(label("copy"));
    } else el.copy();
  };
  const paste = () => {
    if (!editor) {
      void el.paste();
      return;
    }
    pasteFromClipboard(editor, false)
      .then((result) => {
        if (result === "blocked") blocked(label("paste"));
      })
      .catch(() => blocked(label("paste")));
  };
  const selectAll = () => {
    if (editor) editor.chain().focus().selectAll().run();
    else dispatch({ type: "select", ids: sel.slide?.elements.map((e) => e.id) ?? [] });
  };
  const duplicate = () => {
    if (hasSelection) el.duplicateSelection();
    else el.duplicateSlides();
  };

  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("slides.menubar.edit")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-60">
        <DocMenuItem icon={Undo2} shortcut={label("undo")} disabled={!writable || !undo.canUndo} onClick={undo.undo}>
          {t("slides.edit.undo")}
        </DocMenuItem>
        <DocMenuItem icon={Redo2} shortcut={label("redo")} disabled={!writable || !undo.canRedo} onClick={undo.redo}>
          {t("slides.edit.redo")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuItem icon={Scissors} shortcut={label("cut")} disabled={!writable || (!editor && deck.slideIds.length === 0)} onClick={cut}>
          {t("slides.edit.cut")}
        </DocMenuItem>
        <DocMenuItem icon={Copy} shortcut={label("copy")} disabled={!editor && deck.slideIds.length === 0} onClick={copy}>
          {t("slides.edit.copy")}
        </DocMenuItem>
        <DocMenuItem icon={ClipboardPaste} shortcut={label("paste")} disabled={!writable} onClick={paste}>
          {t("slides.edit.paste")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuItem icon={CopyPlus} shortcut={label("duplicate")} disabled={!writable || editor !== null || deck.slideIds.length === 0} onClick={duplicate}>
          {t("slides.edit.duplicate")}
        </DocMenuItem>
        <DocMenuItem icon={Trash2} shortcut={label("delete")} disabled={!writable || editor !== null || !hasSelection || sel.allLocked} onClick={el.deleteSelection}>
          {t("slides.edit.delete")}
        </DocMenuItem>
        <DocMenuItem icon={TextSelect} shortcut={label("selectAll")} disabled={!editor && (sel.slide?.elements.length ?? 0) === 0} onClick={selectAll}>
          {t("slides.edit.selectAll")}
        </DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}
