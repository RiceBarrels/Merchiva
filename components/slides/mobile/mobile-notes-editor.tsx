"use client";

// Speaker notes on the phone (slides.md §11 "Notes"): a TipTap editor bound to the slide's notes fragment with the
// slide text schema, while the viewer is editing; the stored notes as text otherwise. A deck from a newer schema
// never mounts the editor (y-tiptap would drop what it cannot represent, F8). Typing in the notes is part of the
// deck's one undo history (y-tiptap's origin is tracked), and Mod+Z there undoes through it.
//
// The fragment is looked up on every render (each deck change renders this): a slide can be recreated under the
// same id (a collaborator undoes its deletion, a restore brings it back), and the editor must follow the live one.
import { useLayoutEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type * as Y from "yjs";

import { RichTextView } from "@/components/slides/canvas/rich-text-view";
import { SLIDE_TEXT_CLASS } from "@/components/slides/canvas/slide-text-class";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { notesFragment } from "@/components/slides/panels/notes-panel";
import { useT } from "@/lib/i18n/context";
import { Latest } from "@/lib/slides/editor/latest";
import { isEmptyText } from "@/lib/slides/text/plain";
import { slideTextExtensions } from "@/lib/slides/text/extensions";

function NotesTipTap({ fragment, label, placeholder, onUndo, onRedo }: { fragment: Y.XmlFragment; label: string; placeholder: string; onUndo(): void; onRedo(): void }) {
  // The undo callbacks change with every step of the history; the editor must not be rebuilt for that.
  const [callbacks] = useState(() => new Latest({ onUndo, onRedo }));
  useLayoutEffect(() => {
    callbacks.set({ onUndo, onRedo });
  });
  const extensions = useMemo(
    () => slideTextExtensions({ fragment, placeholder, onUndo: () => callbacks.get().onUndo(), onRedo: () => callbacks.get().onRedo() }),
    [fragment, placeholder, callbacks],
  );
  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      extensions,
      editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": label, spellcheck: "true", class: "min-h-32 pb-6" } },
    },
    [extensions],
  );
  return <EditorContent editor={editor} />;
}

export function MobileNotesEditor({ slideId, editable }: { slideId: string; editable: boolean }) {
  const t = useT();
  const { ydoc, deck, undo } = useSlidesEditor();
  const slide = deck.slides.get(slideId);
  const canWrite = editable && !deck.schemaTooNew;
  const fragment = canWrite ? notesFragment(ydoc, slideId) : null;

  let body: React.ReactNode;
  if (fragment) {
    body = <NotesTipTap key={slideId} fragment={fragment} label={t("slides.notes.title")} placeholder={t("slides.notes.placeholder")} onUndo={undo.undo} onRedo={undo.redo} />;
  } else if (slide && !isEmptyText(slide.notes)) {
    body = <RichTextView json={slide.notes} />;
  } else {
    body = <p className="text-muted-foreground">{t("slides.present.noNotes")}</p>;
  }
  return (
    <div className={SLIDE_TEXT_CLASS} style={{ fontSize: 16, lineHeight: 1.45 }}>
      {body}
    </div>
  );
}
