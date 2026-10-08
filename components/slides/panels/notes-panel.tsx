"use client";

// Speaker notes of the current slide (slides.md §7.3), under the stage. Open: a second TipTap editor bound to the
// slide's `notes` fragment, mounted only while the panel is open and only for someone who may edit now (like the
// slide text editor, it is never mounted read-only on a deck it must not write to); everyone else reads the notes
// as rendered text. Typing in the notes is part of the deck's one undo history (SlideTextSync maps Mod+Z to it), as
// its own steps; Escape goes back to the stage. Closed: a slim bar with the button that opens it. Open/closed and
// the height (80-320 px, dragged or set with the keyboard on the top edge) are per-viewer preferences.
import { useLayoutEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import * as Y from "yjs";

import { RichTextView } from "@/components/slides/canvas/rich-text-view";
import { SLIDE_TEXT_CLASS } from "@/components/slides/canvas/slide-text-class";
import { ResizeHandle } from "@/components/slides/panels/resize-handle";
import { currentSlideOf, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useT } from "@/lib/i18n/context";
import { SLIDES_ID_RE } from "@/lib/slides/constants";
import { Latest } from "@/lib/slides/editor/latest";
import { deckMaps } from "@/lib/slides/model/read";
import { isEmptyText } from "@/lib/slides/text/plain";
import { slideTextExtensions } from "@/lib/slides/text/extensions";
import { NOTES_HEIGHT_MAX, NOTES_HEIGHT_MIN } from "@/lib/slides/editor/ui-state";
import { cn } from "@/lib/utils";

/** The live notes fragment of a slide; null when the slide or its notes are missing (never created here). */
export function notesFragment(doc: Y.Doc, slideId: string): Y.XmlFragment | null {
  if (!SLIDES_ID_RE.test(slideId)) return null;
  const slide: unknown = deckMaps(doc).slides.get(slideId);
  const notes: unknown = slide instanceof Y.Map ? slide.get("notes") : null;
  return notes instanceof Y.XmlFragment ? notes : null;
}

interface NotesEditorProps {
  fragment: Y.XmlFragment;
  placeholder: string;
  label: string;
  onUndo(): void;
  onRedo(): void;
  onEscape(): void;
}

/** The notes editor of one slide (the host keys it by slide, so a slide change binds a new editor). */
function NotesEditor({ fragment, placeholder, label, onUndo, onRedo, onEscape }: NotesEditorProps) {
  const [callbacks] = useState(() => new Latest({ onUndo, onRedo, onEscape }));
  useLayoutEffect(() => {
    callbacks.set({ onUndo, onRedo, onEscape });
  });
  const extensions = useMemo(
    () =>
      slideTextExtensions({
        fragment,
        placeholder,
        onUndo: () => callbacks.get().onUndo(),
        onRedo: () => callbacks.get().onRedo(),
        onEscape: () => callbacks.get().onEscape(),
      }),
    [fragment, placeholder, callbacks],
  );
  // Typed as possibly null: a hidden <Activity> destroys the editor and the reveal recreates it (text-edit-overlay.tsx).
  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editable: true,
      extensions,
      editorProps: { attributes: { spellcheck: "true", role: "textbox", "aria-multiline": "true", "aria-label": label } },
    },
    [extensions],
  ) as Editor | null;
  return editor ? <EditorContent editor={editor} className="flex min-h-full cursor-text flex-col [&_.ProseMirror]:flex-1" /> : null;
}

export function NotesPanel() {
  const t = useT();
  const { deck, ui, dispatch, ydoc, canEditNow, undo, refs } = useSlidesEditor();
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const slide = currentSlideOf(deck, ui);
  const title = t("slides.notes.title");

  if (!ui.notesOpen) {
    return (
      <div className="flex h-7 shrink-0 items-center border-t border-border bg-background px-1.5">
        <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => dispatch({ type: "toggleNotes", open: true })}>
          <ChevronUp className="h-3 w-3" />
          {t("slides.notes.show")}
        </Button>
      </div>
    );
  }

  const height = liveHeight ?? ui.notesHeight;
  const editable = canEditNow && !deck.schemaTooNew && ui.previewVersionId === null;
  const fragment = slide && editable ? notesFragment(ydoc, slide.id) : null;
  const hide = t("slides.notes.hide");

  let body: React.ReactNode;
  if (!slide) body = null;
  else if (fragment) {
    body = (
      <NotesEditor
        key={slide.id}
        fragment={fragment}
        placeholder={t("slides.notes.placeholder")}
        label={title}
        onUndo={undo.undo}
        onRedo={undo.redo}
        onEscape={() => refs.stageFocus.focus()}
      />
    );
  } else if (isEmptyText(slide.notes)) body = null;
  else body = <RichTextView json={slide.notes} />;

  return (
    <section aria-label={title} className="relative flex shrink-0 flex-col border-t border-border bg-background" style={{ height }}>
      <ResizeHandle
        edge="top"
        value={height}
        min={NOTES_HEIGHT_MIN}
        max={NOTES_HEIGHT_MAX}
        label={title}
        onPreview={setLiveHeight}
        onCommit={(value) => dispatch({ type: "setNotesHeight", height: value })}
      />
      <div className="flex h-7 shrink-0 items-center gap-2 ps-3 pe-1.5">
        <Eyebrow as="h3" className="min-w-0 flex-1 truncate">
          {title}
        </Eyebrow>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={hide} title={hide} onClick={() => dispatch({ type: "toggleNotes", open: false })}>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
      {/* Typing in the notes is its own undo step, never merged with an edit made on the slide just before or after. */}
      <div
        onFocus={undo.stopCapturing}
        onBlur={undo.stopCapturing}
        className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-2 text-[13px] leading-relaxed text-foreground", SLIDE_TEXT_CLASS)}
      >
        {body}
      </div>
    </section>
  );
}
