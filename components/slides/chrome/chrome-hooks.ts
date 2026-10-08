"use client";

// Hooks shared by the Slides toolbar and menu bar (slides.md §7.3): the selection they act on, where keyboard focus
// goes when a menu or picker closes, and the shortcut hints they show.
//
// Focus: after a command from a menu or a picker, keys belong to what was being edited again, as in Docs: the text
// being typed in, else the stage's keyboard target (so Delete, the arrows and Mod+C act on the selection). Not when
// the command moved focus somewhere on purpose (a dialog, the title field), and not after a touch or pen tap, where
// focusing the stage's hidden text field would raise the soft keyboard. Escape cancels instead: focus goes back to
// the menu's or picker's trigger, so a keyboard user keeps their place in the menu bar or the toolbar.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";

import { selectionInfo, type SlidesSelectionInfo } from "@/components/slides/chrome/selection-info";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { formatDocShortcut, useIsMac } from "@/lib/docs/shortcut-label";
import { textTargetKey } from "@/lib/slides/editor/text-target";

export function useSlidesSelection(): SlidesSelectionInfo {
  const { deck, ui, canEditNow } = useSlidesEditor();
  const { currentSlideId, selection, editing, previewVersionId } = ui;
  return useMemo(
    () => selectionInfo({ deck, ui: { currentSlideId, selection, editing, previewVersionId }, canEditNow }),
    [deck, currentSlideId, selection, editing, previewVersionId, canEditNow],
  );
}

/** The TipTap editor of the text being typed in; null while nothing is (a pre-mounted, read-only editor included). */
export function useEditingEditor(): Editor | null {
  const { ui, refs } = useSlidesEditor();
  const handle = useSyncExternalStore(refs.textEditor.subscribe, refs.textEditor.getSnapshot, () => null);
  const key = ui.editing ? textTargetKey(ui.editing.elementId, ui.editing.cellKey) : null;
  return key && handle && handle.target === key && !handle.editor.isDestroyed ? handle.editor : null;
}

/** Menus, pickers, the menu bar and the toolbar: focus inside them is not a place a command sent it to. */
const CHROME_SELECTOR = '[data-slot="doc-menu-content"], [role="menubar"], [role="toolbar"], [role="menu"], [role="dialog"][data-slides-picker]';

type CloseType = "mouse" | "touch" | "pen" | "keyboard" | "";

/**
 * Whether the last key or pointer press anywhere was Escape. A close only says "keyboard", for Enter on an item and
 * for Escape alike; this tells them apart. One capture listener pair serves all the chrome while any of it is mounted.
 */
const lastPress = { escape: false };
let pressWatchers = 0;
const onPressKey = (event: KeyboardEvent) => {
  lastPress.escape = event.key === "Escape";
};
const onPressPointer = () => {
  lastPress.escape = false;
};

function useLastPressWatcher(): void {
  useEffect(() => {
    if (pressWatchers++ === 0) {
      window.addEventListener("keydown", onPressKey, true);
      window.addEventListener("pointerdown", onPressPointer, true);
    }
    return () => {
      if (--pressWatchers > 0) return;
      window.removeEventListener("keydown", onPressKey, true);
      window.removeEventListener("pointerdown", onPressPointer, true);
    };
  }, []);
}

/** `finalFocus` for the Slides menus and toolbar pickers (see the file comment). Never pass it to a submenu. */
export function useSlidesFinalFocus(): (closeType: CloseType) => boolean | HTMLElement {
  const { refs, ui } = useSlidesEditor();
  useLastPressWatcher();
  const editingKey = ui.editing ? textTargetKey(ui.editing.elementId, ui.editing.cellKey) : null;
  return useCallback(
    (closeType: CloseType) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !active.closest(CHROME_SELECTOR)) return false;
      if (closeType === "touch" || closeType === "pen") return true;
      // Cancelled with Escape: back to the trigger (true), as the menu bar and toolbar patterns expect.
      if (closeType === "keyboard" && lastPress.escape) return true;
      const handle = refs.textEditor.current;
      if (editingKey && handle && handle.target === editingKey && !handle.editor.isDestroyed) return handle.editor.view.dom;
      refs.stageFocus.focus();
      return false;
    },
    [refs, editingKey],
  );
}

/** Every shortcut the Slides chrome shows, in Tiptap key notation (lib/slides/editor/keys.ts is the stage's map). */
export const SLIDES_SHORTCUTS = {
  undo: "Mod-z",
  redo: "Mod-Shift-z",
  cut: "Mod-x",
  copy: "Mod-c",
  paste: "Mod-v",
  duplicate: "Mod-d",
  selectAll: "Mod-a",
  newSlide: "Ctrl-m",
  present: "Mod-Enter",
  presentFromStart: "Mod-Shift-Enter",
  forward: "Mod-ArrowUp",
  backward: "Mod-ArrowDown",
  front: "Mod-Shift-ArrowUp",
  back: "Mod-Shift-ArrowDown",
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  strike: "Mod-Shift-s",
  superscript: "Mod-.",
  subscript: "Mod-,",
  alignLeft: "Mod-Shift-l",
  alignCenter: "Mod-Shift-e",
  alignJustify: "Mod-Shift-j",
  bulletList: "Mod-Shift-8",
  orderedList: "Mod-Shift-7",
} as const;

export type SlidesShortcutId = keyof typeof SLIDES_SHORTCUTS | "delete";

/** Formatter bound to the platform: `label("undo")` → "⌘Z" or "Ctrl+Z"; Delete is ⌫ on Apple keyboards. */
export function useSlidesShortcutLabels(): (id: SlidesShortcutId) => string {
  const isMac = useIsMac();
  return useCallback((id: SlidesShortcutId) => (id === "delete" ? (isMac ? "⌫" : "Del") : formatDocShortcut(SLIDES_SHORTCUTS[id], isMac)), [isMac]);
}
