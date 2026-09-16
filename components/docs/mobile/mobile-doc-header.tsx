"use client";

/**
 * Mobile header (docs-editor-ui spec §7.3).
 * Reading: Back · title (tap to rename) · collaborators · Edit · Comments · More.
 * Editing: Done · Undo · Redo · save status · Comment (with a selection) · More.
 */
import { useRouter } from "next/navigation";
import { useEditorState } from "@tiptap/react";
import { Check, ChevronLeft, MessageSquare, MessageSquarePlus, MoreVertical, Pencil, Redo2, Undo2 } from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { PresenceAvatars } from "@/components/docs/editor/presence-avatars";
import { SaveStatus } from "@/components/docs/editor/save-status";
import { Button } from "@/components/ui/button";
import { useShellInfo, useTabActions } from "@/lib/browser-shell";
import { DOCS_HOME_HREF } from "@/lib/docs/hrefs";
import { useT } from "@/lib/i18n/context";

export function MobileDocHeader() {
  const t = useT();
  const router = useRouter();
  const shell = useShellInfo();
  const tabActions = useTabActions();
  const { doc, ui, dispatch, actions, canEditNow, editor, threads, access } = useDocEditor();
  const editing = ui.mobileMode === "editing";
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const live = !!ed && !ed.isDestroyed;
      return {
        canUndo: live && ed.isEditable && ed.can().undo(),
        canRedo: live && ed.isEditable && ed.can().redo(),
        hasSelection: live && !ed.state.selection.empty,
      };
    },
    equalityFn: (a, b) => !!b && a.canUndo === b.canUndo && a.canRedo === b.canRedo && a.hasSelection === b.hasSelection,
  }) ?? { canUndo: false, canRedo: false, hasSelection: false };
  const keepFocus = (event: React.PointerEvent) => event.preventDefault();
  const openCount = threads.openCount;
  const title = doc.title || t("docs.untitled");

  const back = () => {
    if (shell) tabActions.goBack({ closeToOpener: true });
    else router.push(DOCS_HOME_HREF);
  };

  if (editing) {
    return (
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={actions.exitEditing}>
          <Check className="h-4 w-4" />
          {t("docs.mobile.done")}
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={t("docs.edit.undo")} disabled={!state.canUndo} onPointerDown={keepFocus} onClick={actions.undo}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={t("docs.edit.redo")} disabled={!state.canRedo} onPointerDown={keepFocus} onClick={actions.redo}>
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 flex-1 justify-end">
          <SaveStatus compact />
        </div>
        {access.canComment && state.hasSelection && (
          <Button type="button" variant="ghost" size="icon" aria-label={t("docs.comments.add")} onPointerDown={keepFocus} onClick={actions.startComment}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" aria-label={t("docs.mobile.actions")} onClick={() => dispatch({ type: "openMobileSheet", sheet: "actions" })}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </header>
    );
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-1.5">
      <Button type="button" variant="ghost" size="icon" aria-label={t("docs.mobile.back")} onClick={back}>
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
      </Button>
      {canEditNow ? (
        <button
          type="button"
          onClick={actions.rename}
          aria-label={`${title} — ${t("docs.menu.rename")}`}
          className="min-w-0 flex-1 truncate rounded text-start text-[15px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {title}
        </button>
      ) : (
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{title}</h1>
      )}
      <PresenceAvatars max={2} />
      {canEditNow && (
        <Button type="button" size="sm" onClick={() => actions.enterEditing()}>
          <Pencil className="h-3.5 w-3.5" />
          {t("docs.mobile.edit")}
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon" className="relative" onClick={() => dispatch({ type: "openMobilePage", page: "comments" })}>
        <MessageSquare className="h-4 w-4" />
        <span className="sr-only">
          {t("docs.comments.title")}
          {openCount > 0 ? ` (${openCount})` : ""}
        </span>
        {openCount > 0 && (
          <span
            aria-hidden
            className="absolute end-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-mono text-[9.5px] font-semibold tabular-nums text-background"
          >
            {openCount > 99 ? "99+" : openCount}
          </span>
        )}
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label={t("docs.mobile.actions")} onClick={() => dispatch({ type: "openMobileSheet", sheet: "actions" })}>
        <MoreVertical className="h-4 w-4" />
      </Button>
    </header>
  );
}
