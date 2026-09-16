"use client";

/**
 * Mobile panel pages (docs-editor-ui spec §7.3): Comments, Outline and Version history as DynamicUIElement pages
 * with stable i18n titles (titles are written into `?dialogs=`).
 */
import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { CommentsPanel } from "@/components/docs/panels/comments-panel";
import { OutlinePanel } from "@/components/docs/panels/outline-panel";
import { VersionHistoryPanel } from "@/components/docs/panels/version-history-panel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/context";

export function MobilePages() {
  const t = useT();
  const { doc, access, memberId, editor, contentEditor, ui, dispatch, actions, threads, draft, scrollRef, previewVersionId } = useDocEditor();
  const page = ui.mobilePage;
  const close = () => dispatch({ type: "closeMobilePage" });
  const onOpenChange = (open: boolean) => {
    if (open) return;
    // Closing the comments page cancels an unsent new comment.
    if (page === "comments" && ui.draftQuote !== null) actions.finishDraft(null);
    close();
  };

  return (
    <>
      <Sheet open={page === "comments"} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("docs.comments.title")}</SheetTitle>
          </SheetHeader>
          <CommentsPanel
            variant="page"
            trashed={!!doc.trashedAt}
            documentId={doc.id}
            editor={editor}
            access={access}
            memberId={memberId}
            threads={threads}
            activeThreadId={ui.activeThreadId}
            onActivateThread={(threadId) => {
              actions.activateThread(threadId);
              if (threadId) close();
            }}
            draft={draft}
            onDraftDone={(threadId) => {
              actions.finishDraft(threadId);
              if (threadId) close();
            }}
            filter={ui.commentsFilter}
            onFilterChange={(filter) => dispatch({ type: "setCommentsFilter", filter })}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={page === "outline"} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("docs.outline.title")}</SheetTitle>
          </SheetHeader>
          <OutlinePanel editor={contentEditor} variant="sheet" scrollContainerRef={scrollRef} onNavigate={close} />
        </SheetContent>
      </Sheet>

      <Sheet open={page === "history"} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("docs.versions.title")}</SheetTitle>
          </SheetHeader>
          <VersionHistoryPanel
            variant="page"
            documentId={doc.id}
            access={access}
            memberId={memberId}
            selectedVersionId={previewVersionId}
            onSelectVersion={(versionId) => {
              actions.selectVersion(versionId);
              if (versionId) close();
            }}
            onNameCurrentVersion={actions.nameCurrentVersion}
            onRestoreVersion={actions.requestRestore}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
