"use client";

/**
 * Creates the live collaborative Tiptap editor (docs-editor-ui spec §4.2, plan §B6 wiring rules):
 * - mounted only after the provider synced (the caller renders this hook's component then);
 * - never receives `content` — the Y.Doc "default" fragment is the source of truth;
 * - starts non-editable; the session toggles `setEditable`;
 * - `onContentError` (a newer client's schema) disables collaboration so unknown content isn't deleted remotely.
 *
 * The editor is rebuilt only when the Y.Doc/provider, edit capability (trailing node, resize handles, uploads) or
 * pointer type change. With non-empty deps `useEditor` never re-applies options to an existing editor, so the
 * `editorProps` that change while it lives (scroll margins for the mobile keyboard and format bar, the aria-label
 * after a rename) are pushed through `setOptions` in an effect.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useEditor, type Editor, type EditorOptions } from "@tiptap/react";
import type * as Y from "yjs";

import { buildDocExtensions, type CollaborationProviderLike, type DocEditorHandlers } from "@/lib/docs/editor-extensions";
import type { PaginationController } from "@/lib/docs/extensions/pagination";

export interface UseDocEditorInstanceArgs {
  ydoc: Y.Doc;
  provider: CollaborationProviderLike;
  /** Edit capability at build time (trailing node, resize handles, image uploads). */
  canEdit: boolean;
  coarsePointer: boolean;
  user: { name: string; color: string; memberId: string };
  t: (key: string) => string;
  /** Stable handler object (its functions forward to the latest callbacks). */
  handlers: DocEditorHandlers;
  /** Stable paged-layout controller; the session pushes metrics onto it without rebuilding the editor. */
  pagination: PaginationController;
  onFatal: () => void;
  /** Extra bottom scroll margin (mobile format bar + keyboard) so the caret stays visible. */
  scrollMarginBottom: number;
  ariaLabel: string;
}

export function useDocEditorInstance(args: UseDocEditorInstanceArgs): Editor | null {
  const { ydoc, provider, canEdit, coarsePointer, user, t, handlers, pagination, onFatal, scrollMarginBottom, ariaLabel } = args;
  const onFatalRef = useRef(onFatal);
  useLayoutEffect(() => {
    onFatalRef.current = onFatal;
  });

  // The caret user and translator are read at build time only; later name changes go through `updateUser`.
  const extensions = useMemo(
    () => buildDocExtensions({ mode: "live", ydoc, provider, user, canEdit, coarsePointer, t, handlers, pagination }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilding the editor on a name or locale change would reset the view
    [ydoc, provider, canEdit, coarsePointer, handlers, pagination],
  );

  const editorProps = useMemo<EditorOptions["editorProps"]>(
    () => ({
      attributes: {
        class: "doc-prose",
        spellcheck: "true",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
      },
      scrollMargin: { top: 80, bottom: scrollMarginBottom + 24, left: 0, right: 0 },
      scrollThreshold: { top: 24, bottom: scrollMarginBottom + 24, left: 0, right: 0 },
    }),
    [ariaLabel, scrollMarginBottom],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: false,
      textDirection: "auto",
      enableContentCheck: true,
      onContentError: ({ disableCollaboration }) => {
        disableCollaboration();
        onFatalRef.current();
      },
      extensions,
      editorProps,
    },
    [extensions],
  );

  // Creation used the props of that render; later changes reach the live view here. `setOptions` merges, so the
  // editable state set by the session is kept.
  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.options.editorProps === editorProps) return;
    editor.setOptions({ editorProps });
  }, [editor, editorProps]);

  return editor;
}
