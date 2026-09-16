"use client";

/**
 * Desktop canvas (docs-editor-ui spec §4.4, §4.9): the grey scroll area with the outline gutter, the rulers,
 * the stack of sheets (live editor, or the version preview with the live editor kept mounted but hidden) and the
 * aligned comment margin.
 *
 * The horizontal ruler is sticky at the top of the scroll area and shares the paper's column so the two stay
 * aligned at every zoom; the vertical ruler runs beside the sheets.
 */
import { EditorContent } from "@tiptap/react";

import { CommentsMargin } from "@/components/docs/panels/comments-margin";
import { OutlinePanel } from "@/components/docs/panels/outline-panel";
import { VersionPreview } from "@/components/docs/panels/version-preview";
import { unitForLocale } from "@/lib/docs/page-setup";
import { useHeaderFooterHtml } from "@/lib/docs/use-header-footer";
import { useDocEditor } from "./doc-editor-context";
import { DocRuler, DocVerticalRuler } from "./doc-ruler";
import { HeaderFooterLayer } from "./header-footer-layer";
import { LinkBubble } from "./link-bubble";
import { LinkEditorPopover } from "./link-editor";
import { PageSheet } from "./page-sheet";
import { openReadOnlyLink } from "./read-only-links";
import { SelectionCommentButton } from "./selection-comment-button";

export function DocCanvas({ gutter, aligned, zoom }: { gutter: boolean; aligned: boolean; zoom: number }) {
  const {
    editor,
    contentEditor,
    setPreviewEditor,
    previewVersionId,
    doc,
    access,
    memberId,
    threads,
    draft,
    ui,
    dispatch,
    actions,
    scrollRef,
    sheetRef,
    collab,
    pageSetup,
    setPageSetup,
    pageLayout,
    headerFooterEditing,
    setHeaderFooterEditing,
    locale,
    canEditNow,
    editable,
  } = useDocEditor();

  const previewing = previewVersionId !== null;
  const headerFooterHtml = useHeaderFooterHtml(collab.ydoc, pageSetup);
  const unit = unitForLocale(locale);
  const showRuler = ui.showRuler && !previewing;

  return (
    <div
      ref={scrollRef}
      data-tab-scroll-root=""
      className="min-h-0 min-w-0 flex-1 overflow-auto bg-muted"
      onClickCapture={(event) => {
        if (!editable) openReadOnlyLink(event);
      }}
    >
      <div className="mx-auto flex w-max min-w-full justify-center gap-6 px-6 py-6">
        {gutter && (
          <OutlinePanel
            editor={contentEditor}
            variant="gutter"
            scrollContainerRef={scrollRef}
            onClose={() => dispatch({ type: "setOutline", open: false })}
          />
        )}
        <div className="flex flex-col">
          {showRuler && (
            <div className="sticky top-0 z-20 flex shrink-0 bg-muted pb-2">
              <div className="h-5 w-5 shrink-0 bg-muted" />
              <DocRuler
                setup={pageSetup}
                zoom={zoom}
                unit={unit}
                canEdit={canEditNow}
                editor={editor}
                onSetupChange={setPageSetup}
              />
            </div>
          )}
          <div className="flex items-start">
            {showRuler && (
              <DocVerticalRuler setup={pageSetup} zoom={zoom} unit={unit} layout={pageLayout} canEdit={canEditNow} onSetupChange={setPageSetup} />
            )}
            <PageSheet
              ref={sheetRef}
              zoom={zoom}
              setup={pageSetup}
              layout={previewing ? null : pageLayout}
              overlay={
                pageLayout && collab.ydoc && collab.provider ? (
                  <HeaderFooterLayer
                    ydoc={collab.ydoc}
                    provider={collab.provider}
                    setup={pageSetup}
                    layout={pageLayout}
                    html={headerFooterHtml}
                    canEdit={canEditNow && !previewing}
                    editing={headerFooterEditing}
                    onEditingChange={setHeaderFooterEditing}
                  />
                ) : null
              }
            >
              {previewVersionId && <VersionPreview documentId={doc.id} versionId={previewVersionId} onEditorChange={setPreviewEditor} />}
              <div hidden={previewVersionId !== null}>
                <EditorContent editor={editor} />
              </div>
              {editor && previewVersionId === null && (
                <>
                  <LinkBubble editor={editor} />
                  <SelectionCommentButton editor={editor} />
                  <LinkEditorPopover editor={editor} />
                </>
              )}
            </PageSheet>
          </div>
        </div>
        {aligned && previewVersionId === null && (
          <CommentsMargin
            documentId={doc.id}
            editor={editor}
            access={access}
            memberId={memberId}
            threads={threads}
            activeThreadId={ui.activeThreadId}
            onActivateThread={actions.activateThread}
            draft={draft}
            onDraftDone={actions.finishDraft}
            sheetRef={sheetRef}
            zoom={zoom}
            filter={ui.commentsFilter}
            onFilterChange={(filter) => dispatch({ type: "setCommentsFilter", filter })}
            trashed={!!doc.trashedAt}
          />
        )}
      </div>
    </div>
  );
}
