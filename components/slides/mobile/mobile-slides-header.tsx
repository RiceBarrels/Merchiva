"use client";

// Phone / device header of the Slides editor (slides.md §11).
// Viewing: Back · title (tap to rename) · collaborators (2) · Edit · Play · More.
// Editing: Done · Undo · Redo · save status · Add · More.
// Back goes to Drive the same way the Docs phone header does: the device panel's opener when there is one, else
// the shell's back, else a plain navigation. The undo / redo buttons keep the keyboard up (no focus on press).
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, MoreVertical, Pencil, Play, Plus, Redo2, Undo2 } from "lucide-react";

import { useDocsOpenOverride } from "@/components/docs/docs-open-context";
import { FilePresenceAvatars } from "@/components/files/editor-chrome/file-presence-avatars";
import { FileSaveStatus } from "@/components/files/editor-chrome/file-save-status";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { Button } from "@/components/ui/button";
import { useShellInfo, useTabActions } from "@/lib/browser-shell";
import { DRIVE_HOME_HREF } from "@/lib/drive/hrefs";
import { useT } from "@/lib/i18n/context";

const keepFocus = (event: React.PointerEvent) => event.preventDefault();

export function MobileSlidesHeader() {
  const t = useT();
  const router = useRouter();
  const shell = useShellInfo();
  const tabActions = useTabActions();
  const openDocs = useDocsOpenOverride();
  const { doc, deck, ui, dispatch, actions, undo, canEditNow, collab, peers, saveState } = useSlidesEditor();
  const editing = ui.mobileMode === "edit";
  const editable = canEditNow && !deck.schemaTooNew && ui.previewVersionId === null;
  const trashed = doc.trashedAt !== null;
  const title = doc.title || t("slides.untitled");
  const empty = deck.slideIds.length === 0;

  const back = () => {
    if (openDocs) openDocs(DRIVE_HOME_HREF, "current");
    else if (shell) tabActions.goBack({ closeToOpener: true });
    else router.push(DRIVE_HOME_HREF);
  };
  const jumpTo = (memberId: string) => {
    const slideId = peers.list.find((peer) => peer.memberId === memberId && peer.slideId !== null)?.slideId;
    if (slideId) dispatch({ type: "selectSlide", slideId });
  };
  const more = (
    <Button type="button" variant="ghost" size="icon" aria-label={t("slides.mobile.more")} onClick={() => dispatch({ type: "openMobileSheet", sheet: "more" })}>
      <MoreVertical className="h-4 w-4" />
    </Button>
  );

  if (editing) {
    return (
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ type: "setMobileMode", mode: "view" })}>
          <Check className="h-4 w-4" />
          {t("slides.mobile.done")}
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={t("slides.edit.undo")} disabled={!undo.canUndo} onPointerDown={keepFocus} onClick={undo.undo}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={t("slides.edit.redo")} disabled={!undo.canRedo} onPointerDown={keepFocus} onClick={undo.redo}>
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 flex-1 justify-end">
          <FileSaveStatus saveState={saveState} compact />
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t("slides.mobile.add")} disabled={!editable} onClick={() => dispatch({ type: "openMobileSheet", sheet: "add" })}>
          <Plus className="h-5 w-5" />
        </Button>
        {more}
      </header>
    );
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-1.5">
      <Button type="button" variant="ghost" size="icon" aria-label={t("slides.editor.backToDrive")} onClick={back}>
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
      </Button>
      {canEditNow && !trashed ? (
        <button
          type="button"
          onClick={() => dispatch({ type: "openDialog", dialog: "rename" })}
          aria-label={`${title} — ${t("slides.file.rename")}`}
          className="min-w-0 flex-1 truncate rounded text-start text-[15px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {title}
        </button>
      ) : (
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{title}</h1>
      )}
      <FilePresenceAvatars peers={collab.peers} max={2} onJump={jumpTo} />
      {editable && !trashed ? (
        <Button type="button" size="sm" onClick={() => dispatch({ type: "setMobileMode", mode: "edit" })}>
          <Pencil className="h-3.5 w-3.5" />
          {t("slides.mobile.edit")}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon" aria-label={t("slides.view.present")} disabled={empty} onClick={() => actions.present("current")}>
        <Play className="h-4 w-4" />
      </Button>
      {more}
    </header>
  );
}
