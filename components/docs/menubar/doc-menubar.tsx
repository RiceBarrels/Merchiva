"use client";

/**
 * Google Docs-style menu bar (docs-editor-ui spec §4.6) on Base UI Menubar: File · Edit · View · Insert · Format ·
 * Tools. Items that need edit or manage rights are disabled, not hidden. After a command the menu returns focus to
 * the editor (unless the command moved focus elsewhere, e.g. a dialog or the title input).
 */
import { useCallback } from "react";
import { Menubar } from "@base-ui/react/menubar";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { useT } from "@/lib/i18n/context";
import { EditMenu } from "./edit-menu";
import { FileMenu } from "./file-menu";
import { FormatMenu } from "./format-menu";
import { InsertMenu } from "./insert-menu";
import { ToolsMenu } from "./tools-menu";
import { ViewMenu } from "./view-menu";

export const MENUBAR_TRIGGER_CLASS =
  "h-6 rounded px-2 text-[13px] text-foreground outline-none select-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted";

/**
 * `finalFocus` for top-level editor menus: back to the editor when editable, unless focus already moved elsewhere.
 * Never pass it to a submenu popup: Base UI returns focus to the submenu trigger when ArrowLeft closes it, and an
 * explicit `finalFocus` there would move focus into the document and close the parent menu. Commands chosen inside a
 * submenu close the whole tree, so the top-level popup's `finalFocus` still returns focus to the editor.
 */
export function useEditorFinalFocus(): () => boolean | HTMLElement {
  const { editor, editable } = useDocEditor();
  return useCallback(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      !active.closest('[data-slot="doc-menu-content"], [role="menubar"], [role="toolbar"], [role="menu"]')
    ) {
      return false;
    }
    if (editor && !editor.isDestroyed && editable) return editor.view.dom;
    return true;
  }, [editor, editable]);
}

export function DocMenuBar() {
  const t = useT();
  return (
    <Menubar aria-label={t("docs.menubar.label")} className="-ms-1 flex h-7 min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar" modal={false}>
      <FileMenu />
      <EditMenu />
      <ViewMenu />
      <InsertMenu />
      <FormatMenu />
      <ToolsMenu />
    </Menubar>
  );
}
