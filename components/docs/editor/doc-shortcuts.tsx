"use client";

/**
 * Document-level editor shortcuts (docs-editor-ui spec §4.8), active while the editor route is mounted.
 *
 * | Keys           | Action                                                                                      |
 * | Mod-F          | Open find (focus). A second Mod-F while the find input is focused falls through to native find. |
 * | Mod-Alt-F      | Find and replace (Mod-Shift-H is shell-reserved, plan §B7.4)                                |
 * | Mod-O          | Open a document                                                                              |
 * | Mod-P          | Web: native print (beforeprint fills the portal). Capacitor: jsPDF fallback                  |
 * | Mod-Alt-M      | Comment (editor keymap handles it first while focused)                                       |
 * | Mod-Shift-C    | Word count (editor focus only)                                                               |
 * | Mod-Alt-Shift-H| Version history                                                                              |
 * | Esc            | Close find → cancel comment draft → exit full screen → blur the editor                       |
 *
 * Never bound here: Mod-T/W/L/R, Mod-[ / Mod-], Mod-1…9, Ctrl-Tab (shell).
 */
import { useEffect, useLayoutEffect, useRef } from "react";

import { DOC_FIND_INPUT_ATTR } from "@/components/docs/panels/find-replace-bar";
import { isCapacitorNative } from "@/lib/capacitor";
import { detectMac, isAltGraphChord } from "@/lib/docs/shortcut-label";
import { useDocEditor, type DocEditorContextValue } from "./doc-editor-context";

const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-slot="doc-menu-content"]';

export function DocShortcuts() {
  const ctx = useDocEditor();
  const latest = useRef<DocEditorContextValue>(ctx);
  useLayoutEffect(() => {
    latest.current = ctx;
  });

  useEffect(() => {
    const isMac = detectMac();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const c = latest.current;
      const target = event.target instanceof Element ? event.target : null;

      if (event.key === "Escape") {
        if (event.defaultPrevented || target?.closest(OVERLAY_SELECTOR)) return;
        if (c.ui.find.open) {
          event.preventDefault();
          c.dispatch({ type: "closeFind" });
          if (c.editor && !c.editor.isDestroyed && c.editable) c.editor.commands.focus();
          return;
        }
        if (c.ui.draftQuote !== null) {
          event.preventDefault();
          c.actions.finishDraft(null);
          return;
        }
        if (c.ui.fullScreen) {
          event.preventDefault();
          c.dispatch({ type: "setFullScreen", on: false });
          return;
        }
        if (c.editor && !c.editor.isDestroyed && c.editor.isFocused) {
          c.editor.commands.blur();
        }
        return;
      }

      const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!mod || event.defaultPrevented || isAltGraphChord(event, isMac)) return;
      const editorFocused = !!c.editor && !c.editor.isDestroyed && c.editor.isFocused;

      switch (event.code) {
        case "KeyF": {
          if (event.shiftKey) return;
          if (event.altKey) {
            event.preventDefault();
            c.actions.openFind(true);
            return;
          }
          if (document.activeElement?.hasAttribute(DOC_FIND_INPUT_ATTR)) return;
          event.preventDefault();
          c.actions.openFind(false);
          return;
        }
        case "KeyO": {
          if (event.altKey || event.shiftKey) return;
          event.preventDefault();
          c.actions.openDocumentPicker();
          return;
        }
        case "KeyP": {
          if (event.altKey || event.shiftKey) return;
          if (isCapacitorNative()) {
            event.preventDefault();
            void c.actions.print();
          }
          return;
        }
        case "KeyM": {
          if (!event.altKey || event.shiftKey) return;
          event.preventDefault();
          c.actions.startComment();
          return;
        }
        case "KeyC": {
          if (!event.shiftKey || event.altKey || !editorFocused) return;
          event.preventDefault();
          c.actions.openWordCount();
          return;
        }
        case "KeyH": {
          if (!event.shiftKey || !event.altKey) return;
          event.preventDefault();
          c.actions.showVersionHistory();
          return;
        }
        default:
          return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
