"use client";

/** One `useEditorState` selector for the whole toolbar (shallow-compared), per docs-editor-ui spec §4.6. */
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

import type { AlignValue } from "@/components/docs/editor/use-doc-actions";
import { currentFontSizePt } from "@/components/docs/editor/use-doc-actions";
import { normalizeHex } from "@/lib/docs/colors";
import { getBlockStyle } from "@/lib/docs/extensions/paragraph-style";
import type { BlockStyle, LineSpacing } from "@/lib/docs/fonts";

export interface ToolbarState {
  canUndo: boolean;
  canRedo: boolean;
  blockStyle: BlockStyle;
  fontFamily: string | null;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  highlight: string | null;
  link: boolean;
  align: AlignValue;
  lineSpacing: LineSpacing | null;
  taskList: boolean;
  bulletList: boolean;
  orderedList: boolean;
  inTable: boolean;
}

const EMPTY: ToolbarState = {
  canUndo: false,
  canRedo: false,
  blockStyle: "normal",
  fontFamily: null,
  fontSizePt: 11,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  highlight: null,
  link: false,
  align: "left",
  lineSpacing: null,
  taskList: false,
  bulletList: false,
  orderedList: false,
  inTable: false,
};

function shallowEqual(a: ToolbarState, b: ToolbarState | null): boolean {
  if (!b) return false;
  for (const key of Object.keys(a) as (keyof ToolbarState)[]) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function computeToolbarState(editor: Editor): ToolbarState {
  const textStyle = editor.getAttributes("textStyle");
  const parent = editor.state.selection.$head.parent;
  const editable = editor.isEditable;
  const spacing = parent.attrs.lineSpacing;
  return {
    canUndo: editable && editor.can().undo(),
    canRedo: editable && editor.can().redo(),
    blockStyle: getBlockStyle(editor),
    fontFamily: typeof textStyle.fontFamily === "string" ? textStyle.fontFamily : null,
    fontSizePt: currentFontSizePt(editor),
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    color: normalizeHex(textStyle.color),
    highlight: normalizeHex(editor.getAttributes("highlight").color),
    link: editor.isActive("link"),
    align: (["center", "right", "justify"] as const).find((a) => editor.isActive({ textAlign: a })) ?? "left",
    lineSpacing: spacing === "1" || spacing === "1.15" || spacing === "1.5" || spacing === "2" ? spacing : null,
    taskList: editor.isActive("taskList"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    inTable: editor.isActive("table"),
  };
}

export function useToolbarState(editor: Editor | null): ToolbarState {
  return useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed && !ed.isDestroyed ? computeToolbarState(ed) : EMPTY),
    equalityFn: shallowEqual,
  }) ?? EMPTY;
}
