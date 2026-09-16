"use client";

import { useEditorState } from "@tiptap/react";

import { docWordCount } from "@/lib/docs/text";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDocEditor } from "./doc-editor-context";

/** View ▸ Show word count: live word total in the canvas corner; opens the Word count dialog. */
export function WordCountChip() {
  const t = useT();
  const { contentEditor, actions } = useDocEditor();
  const words = useEditorState({
    editor: contentEditor,
    selector: ({ editor }) => (editor && !editor.isDestroyed ? docWordCount(editor.getText()) : 0),
  });

  return (
    <button
      type="button"
      onClick={actions.openWordCount}
      className="absolute bottom-3 start-4 z-20 rounded border border-border bg-background px-2 py-1 font-mono text-[11.5px] tabular-nums text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span aria-live="polite">{fmt(t("docs.wordCount.chip"), { n: words ?? 0 })}</span>
    </button>
  );
}
