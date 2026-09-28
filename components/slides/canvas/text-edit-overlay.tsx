"use client";

// The slide text editor (slides.md §6.2): one TipTap editor, bound to the text fragment of the single selected text
// box, shape or table cell, mounted in place of its rendered text in the same container, so selecting never moves
// the text. It is created during the first render (immediatelyRender: the editor chunk is client-only), read-only,
// as soon as the element is selected; enterEditing() then makes it editable and focuses it SYNCHRONOUSLY inside
// the user gesture (double-click, second tap, Enter, or the first printable key), which is what iOS Safari, iPadOS
// and the Capacitor WKWebView require before they raise the soft keyboard. Keys are never replayed: the keydown
// that starts typing only moves focus, and the browser's own input or IME composition lands in ProseMirror.
//
// Mounting writes nothing: y-tiptap renders Y → ProseMirror and only writes back what the user changes. Undo and
// redo go to the deck's one UndoManager (SlideTextSync maps Mod-Z / Shift-Mod-Z / Mod-Y), Escape leaves editing, and
// Mod-B runs the host's bold command (the toolbar's) when the host passes one.
//
// The editor can be null for a moment although TipTap types it as always there: a hidden <Activity> (a background
// browser-shell tab) runs the effect cleanups, TipTap destroys the editor 1 ms later and sets it to null, and the
// reveal recreates it in an effect. Until then the text renders as RichTextView and no handle is published.
import { useImperativeHandle, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { AllSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { JSONContent } from "@tiptap/core";
import type * as Y from "yjs";

import { RichTextView } from "@/components/slides/canvas/rich-text-view";
import type { SlideElement } from "@/lib/slides/model/types";
import { Latest } from "@/lib/slides/editor/latest";
import { textTargetKey } from "@/lib/slides/editor/text-target";
import { slideTextExtensions } from "@/lib/slides/text/extensions";

export interface EnterEditingOptions {
  /** Where the caret goes: the end of the text (default), or everything selected. */
  caret?: "end" | "all";
  /** A viewport point (clientX / clientY) to put the caret at, e.g. the double-click position. */
  at?: { x: number; y: number };
}

export interface SlideTextEditorHandle {
  /** MUST be called synchronously inside the user-gesture handler (see the file comment). */
  enterEditing(opts?: EnterEditingOptions): void;
  /** The TipTap editor (the formatting toolbar drives it while editing). */
  readonly editor: Editor;
  /** The element id, or `${tableId}/${cellKey}` for a table cell. */
  readonly target: string;
}

export interface SlideTextEditorProps {
  fragment: Y.XmlFragment;
  element: SlideElement;
  /** The table cell ("rowId:colId") when `element` is a table. */
  cellKey?: string;
  /** The empty-placeholder prompt; "" for none. */
  placeholder: string;
  /** The editor UI state says this target is being typed in. */
  editing: boolean;
  handleRef: RefObject<SlideTextEditorHandle | null>;
  onExit(): void;
  /** Called when enterEditing() starts editing (the UI state follows). */
  onStartEditing?(): void;
  onUndo?(): void;
  onRedo?(): void;
  /** Mod-B, sent as the toolbar's bold command (a bold element default is not a mark toggleBold sees). */
  onBold?(): void;
  /** The text holds content this version cannot show (a newer schema): the host drops the editor. */
  onContentError?(): void;
}

/** Makes the editor editable, focuses it and places the caret, all synchronously. */
function startEditing(editor: Editor | null, opts: EnterEditingOptions = {}): void {
  if (!editor || editor.isDestroyed) return;
  if (!editor.isEditable) editor.setEditable(true, false);
  editor.view.focus();
  const { state } = editor;
  let selection: Selection | null = null;
  if (opts.at) {
    const hit = editor.view.posAtCoords({ left: opts.at.x, top: opts.at.y });
    if (hit) selection = TextSelection.near(state.doc.resolve(hit.pos));
    // A point outside the text (the box's empty space): above it is the start, anywhere else the end.
    else if (opts.at.y < editor.view.dom.getBoundingClientRect().top) selection = Selection.atStart(state.doc);
  } else if (opts.caret === "all") {
    selection = new AllSelection(state.doc);
  }
  editor.view.dispatch(state.tr.setSelection(selection ?? Selection.atEnd(state.doc)));
}

/** The stored text of the element or table cell, shown while the editor is being recreated. */
function storedText(element: SlideElement, cellKey?: string): JSONContent | null {
  if (element.type === "text" || element.type === "shape") return element.text;
  if (element.type !== "table" || !cellKey) return null;
  return element.cells.find((cell) => `${cell.rowId}:${cell.colId}` === cellKey)?.text ?? null;
}

export function SlideTextEditor({
  fragment,
  element,
  cellKey,
  placeholder,
  editing,
  handleRef,
  onExit,
  onStartEditing,
  onUndo,
  onRedo,
  onBold,
  onContentError,
}: SlideTextEditorProps): React.JSX.Element {
  const [callbacks] = useState(() => new Latest({ onExit, onStartEditing, onUndo, onRedo, onBold, onContentError }));
  useLayoutEffect(() => {
    callbacks.set({ onExit, onStartEditing, onUndo, onRedo, onBold, onContentError });
  });

  const extensions = useMemo(
    () =>
      slideTextExtensions({
        fragment,
        placeholder: placeholder === "" ? undefined : placeholder,
        onUndo: () => callbacks.get().onUndo?.(),
        onRedo: () => callbacks.get().onRedo?.(),
        onEscape: () => callbacks.get().onExit(),
        onBold: () => {
          const bold = callbacks.get().onBold;
          if (!bold) return false;
          bold();
          return true;
        },
      }),
    [fragment, placeholder, callbacks],
  );

  // Typed as possibly null: see the file comment.
  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editable: false,
      extensions,
      editorProps: { attributes: { spellcheck: "true", role: "textbox", "aria-multiline": "true" } },
      onContentError: () => callbacks.get().onContentError?.(),
    },
    [extensions],
  ) as Editor | null;

  const target = textTargetKey(element.id, cellKey);
  // No handle while there is no live editor: callers treat a null handle as "nothing to type into".
  useImperativeHandle<SlideTextEditorHandle | null, SlideTextEditorHandle | null>(
    handleRef,
    () =>
      editor && !editor.isDestroyed
        ? {
            editor,
            target,
            enterEditing(opts?: EnterEditingOptions) {
              startEditing(editor, opts);
              callbacks.get().onStartEditing?.();
            },
          }
        : null,
    [editor, target, callbacks],
  );

  // Editing that started without a gesture (a new text box, a table cell, a menu command) or ended elsewhere
  // (Escape, another selection, lost rights): follow the UI state. After a gesture the editor is already editable and
  // focused, so this does nothing; it refocuses only when the view is not focused as the editor (re)mounts, e.g. after
  // StrictMode's simulated remount moved the view out of the document and back. A layout effect, so it runs after
  // EditorContent (a child) has put the view in place.
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (!editing) {
      if (editor.isEditable) {
        editor.setEditable(false, false);
        editor.view.dom.blur();
      }
      return;
    }
    if (!editor.isEditable || !editor.view.hasFocus()) startEditing(editor);
    // EditorContent keys its inner class component by the editor, so a new editor (a revealed <Activity>) remounts it,
    // and dev StrictMode then unmounts and remounts it once more, dropping focus to <body>: take it back next frame,
    // but never from anything else that has focus.
    const frame = requestAnimationFrame(() => {
      const doc = editor.isDestroyed ? null : editor.view.dom.ownerDocument;
      if (doc && editor.isEditable && !editor.view.hasFocus() && (doc.activeElement === null || doc.activeElement === doc.body)) editor.view.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, editing]);

  if (!editor) {
    const json = storedText(element, cellKey);
    return <div className="select-text">{json ? <RichTextView json={json} /> : null}</div>;
  }
  return <EditorContent editor={editor} className="select-text" data-slides-text-editor={target} />;
}
