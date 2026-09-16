"use client";

/**
 * Desktop editor layout (docs-editor-ui spec §4.4): header + toolbar (or the version preview header), banners,
 * then the canvas row with the outline gutter / overlay, the page sheet, aligned comment margin or side panels,
 * the floating find bar and the word-count chip.
 */
import { useEffect, useRef, useState } from "react";
import { Minimize2 } from "lucide-react";

import { CommentsPanel } from "@/components/docs/panels/comments-panel";
import { FindReplaceBar } from "@/components/docs/panels/find-replace-bar";
import { OutlinePanel } from "@/components/docs/panels/outline-panel";
import { SidePanelFrame } from "@/components/docs/panels/side-panel-frame";
import { VersionHistoryPanel } from "@/components/docs/panels/version-history-panel";
import { VersionPreviewHeader } from "@/components/docs/panels/version-preview";
import { Button } from "@/components/ui/button";
import { DocToolbar } from "@/components/docs/toolbar/doc-toolbar";
import { pageMetricsPx } from "@/lib/docs/page-setup";
import { useT } from "@/lib/i18n/context";
import { DocBanners } from "./banners";
import { DocCanvas } from "./doc-canvas";
import { useDocEditor } from "./doc-editor-context";
import { DocHeader } from "./doc-header";
import { WordCountChip } from "./word-count-chip";

const CANVAS_PADDING = 48;
/** Both rulers are 20px, and the horizontal one needs its corner spacer. */
const RULER = 20;
const GUTTER = 208 + 24;
const MARGIN = 280 + 24;
const SIDE_PANEL = 320;

function useElementWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function DesktopDocEditor() {
  const t = useT();
  const ctx = useDocEditor();
  const { doc, access, memberId, ui, dispatch, previewVersionId, canEditNow, actions, contentEditor, editor, threads, draft, pageSetup, scrollRef } = ctx;
  const [rowRef, rowWidth] = useElementWidth();
  const previewing = previewVersionId !== null;

  const pageWidth = pageMetricsPx(pageSetup).pageWidth;
  const rulerWidth = ui.showRuler && !previewing ? RULER : 0;
  const layoutZoom = ui.zoom === "fit" ? 1 : ui.zoom / 100;
  const scaledPage = pageWidth * layoutZoom + CANVAS_PADDING + rulerWidth;
  const commentsOpen = ui.rightPanel === "comments" && !previewing;
  const aligned = commentsOpen && ui.commentsFilter === "open" && rowWidth > 0 && rowWidth >= scaledPage + MARGIN;
  const sidePanelWidth = ui.rightPanel === "history" || (commentsOpen && !aligned) ? SIDE_PANEL : 0;
  const canvasWidth = Math.max(0, rowWidth - sidePanelWidth);
  const gutter = ui.outlineOpen && canvasWidth >= scaledPage + GUTTER + (aligned ? MARGIN : 0);
  const outlineOverlay = ui.outlineOpen && !gutter && rowWidth > 0;
  const available = canvasWidth - (outlineOverlay ? SIDE_PANEL : 0) - (gutter ? GUTTER : 0) - (aligned ? MARGIN : 0) - CANVAS_PADDING - rulerWidth;
  const zoomFactor = ui.zoom === "fit" ? Math.min(2, Math.max(0.5, available / pageWidth)) : ui.zoom / 100;

  const closeFind = () => {
    dispatch({ type: "closeFind" });
    if (editor && !editor.isDestroyed && ctx.editable) editor.commands.focus();
  };

  return (
    <>
      {!ui.fullScreen &&
        (previewing ? (
          <VersionPreviewHeader
            documentId={doc.id}
            versionId={previewVersionId}
            canRestore={canEditNow}
            onBack={() => actions.selectVersion(null)}
            onRestore={() => actions.requestRestore(previewVersionId)}
          />
        ) : (
          <>
            <DocHeader />
            <DocToolbar />
          </>
        ))}
      <DocBanners />
      <div ref={rowRef} className="relative flex min-h-0 flex-1">
        {outlineOverlay && (
          <SidePanelFrame side="start" title={t("docs.outline.title")} onClose={() => dispatch({ type: "setOutline", open: false })}>
            <OutlinePanel editor={contentEditor} variant="panel" scrollContainerRef={scrollRef} />
          </SidePanelFrame>
        )}
        <DocCanvas gutter={gutter} aligned={aligned} zoom={zoomFactor} />
        <FindReplaceBar
          editor={contentEditor}
          open={ui.find.open}
          withReplace={ui.find.withReplace}
          onWithReplaceChange={(withReplace) => dispatch({ type: "setFindReplace", withReplace })}
          canEdit={canEditNow && !previewing}
          onClose={closeFind}
          focusRequest={ui.find.focusRequest}
          variant="floating"
        />
        {commentsOpen && !aligned && (
          <SidePanelFrame title={t("docs.comments.title")} onClose={() => dispatch({ type: "closePanel" })}>
            <CommentsPanel
              variant="list"
              trashed={!!doc.trashedAt}
              documentId={doc.id}
              editor={editor}
              access={access}
              memberId={memberId}
              threads={threads}
              activeThreadId={ui.activeThreadId}
              onActivateThread={actions.activateThread}
              draft={draft}
              onDraftDone={actions.finishDraft}
              filter={ui.commentsFilter}
              onFilterChange={(filter) => dispatch({ type: "setCommentsFilter", filter })}
            />
          </SidePanelFrame>
        )}
        {ui.rightPanel === "history" && (
          <SidePanelFrame
            title={t("docs.versions.title")}
            onClose={() => {
              if (previewing) actions.selectVersion(null);
              dispatch({ type: "closePanel" });
            }}
          >
            <VersionHistoryPanel
              variant="panel"
              documentId={doc.id}
              access={access}
              memberId={memberId}
              selectedVersionId={previewVersionId}
              onSelectVersion={actions.selectVersion}
              onNameCurrentVersion={actions.nameCurrentVersion}
              onRestoreVersion={actions.requestRestore}
            />
          </SidePanelFrame>
        )}
        {ui.showWordCount && <WordCountChip />}
        {ui.fullScreen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute end-4 top-2 z-30 bg-background"
            onClick={() => dispatch({ type: "setFullScreen", on: false })}
          >
            <Minimize2 className="h-3.5 w-3.5" />
            {t("docs.view.exitFullScreen")}
          </Button>
        )}
      </div>
    </>
  );
}
