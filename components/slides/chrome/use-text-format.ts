"use client";

// The text controls' state (slides.md §7.3): from the live editor while something is being typed in (re-read on each
// editor transaction, compared field by field), else from the selected elements' stored text.
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

import { useEditingEditor } from "@/components/slides/chrome/chrome-hooks";
import type { SlidesSelectionInfo } from "@/components/slides/chrome/selection-info";
import { editorTextState, elementsTextState, sameTextState, type TextFormatState } from "@/components/slides/chrome/text-state";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { liveTextDefaults } from "@/lib/slides/editor/text-format";
import type { SlidesEditingTarget } from "@/lib/slides/editor/ui-state";
import type { TextDefaults } from "@/lib/slides/model/types";

function readerOf(editor: Editor) {
  return {
    isActive: (name: string) => editor.isActive(name),
    attrs: (type: "textStyle" | "highlight" | "link" | "paragraph") => editor.getAttributes(type),
  };
}

/** The defaults of the element being typed in (a table's for its cells; a header-row cell shows bold). */
function editingDefaults(sel: SlidesSelectionInfo, editing: SlidesEditingTarget | null): TextDefaults | null {
  const el = editing ? sel.slide?.elements.find((e) => e.id === editing.elementId) : undefined;
  return el && editing ? liveTextDefaults(el, editing.cellKey) : null;
}

export function useTextFormatState(sel: SlidesSelectionInfo): TextFormatState | null {
  const { ui } = useSlidesEditor();
  const liveEditor = useEditingEditor();
  const defaults = editingDefaults(sel, ui.editing);
  const live = useEditorState({
    editor: liveEditor,
    selector: ({ editor: ed }) => (ed && !ed.isDestroyed && defaults ? editorTextState(readerOf(ed), defaults) : null),
    equalityFn: sameTextState,
  });
  if (liveEditor) return live;
  return sel.hasText ? elementsTextState(sel.selected) : null;
}
