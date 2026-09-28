"use client";

// Desktop layout of the Slides editor (slides.md §7.3):
//
//   header (Drive tile · title · menu bar | people · Slideshow · Share) — or, while a version is previewed, the
//     version preview header (back · "Version from …" · Restore)
//   toolbar
//   banners (trash, newer version, view only)
//   rail (resizable) │ stage + speaker notes │ right panel (theme | format options | version history)
//   — the grid view replaces the rail and the stage; a version preview replaces them with the version's slides.
//
// The editor root takes the keyboard and clipboard shortcuts (useSlidesShortcuts). While a version is previewed the
// live deck is out of sight, so keys that would change it (undo, Ctrl+M, delete, paste, …) are swallowed before the
// shortcut hook sees them. The session renders this inside SlidesEditorContext; the presenter overlay is the
// session's, not this layout's.
import { useEffect, useRef, type Ref, type RefObject } from "react";

import { VersionPreviewHeader } from "@/components/docs/panels/version-preview";
import { SidePanelFrame } from "@/components/docs/panels/side-panel-frame";
import { SlidesStage } from "@/components/slides/canvas/stage";
import { SlidesHeader } from "@/components/slides/chrome/slides-header";
import { SlidesToolbar } from "@/components/slides/chrome/slides-toolbar";
import { SlidesDialogs } from "@/components/slides/editor/slides-dialogs";
import { useSlidesEditor, type SlidesEditorRefs } from "@/components/slides/editor/slides-context";
import { useSlidesShortcuts } from "@/components/slides/editor/use-slides-shortcuts";
import { SlidesBanners } from "@/components/slides/panels/banners";
import { FormatPanel } from "@/components/slides/panels/format-panel";
import { NotesPanel } from "@/components/slides/panels/notes-panel";
import { ThemePanel } from "@/components/slides/panels/theme-panel";
import { usePanelWrite, type PanelWrite } from "@/components/slides/panels/use-panel-write";
import { VersionPreview, VersionsPanel } from "@/components/slides/panels/versions-host";
import { SlideRail } from "@/components/slides/rail/slide-rail";
import { SlideSorter } from "@/components/slides/rail/slide-sorter";
import { useT } from "@/lib/i18n/context";
import { isApplePlatform, slidesKeyCommand, type SlidesKeyCommand } from "@/lib/slides/editor/keys";
import type { SlidesUiState } from "@/lib/slides/editor/ui-state";

export interface DesktopSlidesEditorProps {
  /** The title field (the session focuses it for `?new=1`). */
  titleInputRef?: Ref<HTMLInputElement>;
}

/** Shortcut commands that change the deck (swallowed while a version is previewed). */
const WRITE_COMMANDS: ReadonlySet<SlidesKeyCommand["kind"]> = new Set([
  "undo", "redo", "duplicate", "delete", "nudge", "newSlide", "arrange", "moveSlides",
]);

function isTextField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']") !== null;
}

/**
 * While `active`, keeps the shortcut hook on `root` from changing the live deck: write chords and cut / paste
 * outside text fields are marked handled (defaultPrevented) in the capture phase, which the hook skips.
 */
function usePreviewKeyGuard(root: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = root.current;
    if (!el || !active) return;
    const isMac = isApplePlatform(typeof navigator === "undefined" ? undefined : navigator);
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextField(event.target)) return;
      const cmd = slidesKeyCommand(event, { isMac, inRail: false });
      if (cmd && WRITE_COMMANDS.has(cmd.kind)) event.preventDefault();
    };
    const onClipboard = (event: ClipboardEvent) => {
      if (!isTextField(event.target)) event.preventDefault();
    };
    el.addEventListener("keydown", onKey, true);
    el.addEventListener("cut", onClipboard, true);
    el.addEventListener("paste", onClipboard, true);
    return () => {
      el.removeEventListener("keydown", onKey, true);
      el.removeEventListener("cut", onClipboard, true);
      el.removeEventListener("paste", onClipboard, true);
    };
  }, [root, active]);
}

/**
 * When the grid view gives way to the editor and focus went down with the grid (Enter or a double-click opened a
 * slide), the stage takes the keys. Runs after the stage's own mount effect, which registers its focus target.
 */
function useStageFocusAfterGrid(view: SlidesUiState["view"], refs: SlidesEditorRefs): void {
  const shown = useRef(view);
  useEffect(() => {
    const leftGrid = shown.current === "grid" && view !== "grid";
    shown.current = view;
    if (!leftGrid) return;
    const active = document.activeElement;
    if (!active || active === document.body) refs.stageFocus.focus();
  }, [view, refs]);
}

function RightPanel({ panelWrite }: { panelWrite: PanelWrite }) {
  const t = useT();
  const { ui, dispatch } = useSlidesEditor();
  const close = () => dispatch({ type: "closePanel" });
  switch (ui.rightPanel) {
    case "theme":
      return (
        <SidePanelFrame title={t("slides.panel.theme")} onClose={close}>
          <ThemePanel panelWrite={panelWrite} />
        </SidePanelFrame>
      );
    case "format":
      return (
        <SidePanelFrame title={t("slides.panel.format")} onClose={close}>
          <FormatPanel />
        </SidePanelFrame>
      );
    case "history":
      return <VersionsPanel />;
    case "none":
      return null;
  }
}

export function DesktopSlidesEditor({ titleInputRef }: DesktopSlidesEditorProps) {
  const { doc, ui, canEditNow, actions, refs } = useSlidesEditor();
  const rootRef = useRef<HTMLDivElement>(null);
  const previewId = ui.previewVersionId;
  useSlidesShortcuts(rootRef);
  usePreviewKeyGuard(rootRef, previewId !== null);
  useStageFocusAfterGrid(ui.view, refs);
  // Held here, not in the Theme panel: a background upload can outlast the panel (see usePanelWrite).
  const panelWrite = usePanelWrite();

  let workspace: React.ReactNode;
  if (previewId !== null) workspace = <VersionPreview versionId={previewId} />;
  else if (ui.view === "grid") workspace = <SlideSorter />;
  else {
    workspace = (
      <>
        <SlideRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <SlidesStage />
          </div>
          <NotesPanel />
        </div>
      </>
    );
  }

  return (
    <div ref={rootRef} data-slides-editor="" className="flex h-full min-h-0 w-full flex-col bg-background">
      {previewId !== null ? (
        <VersionPreviewHeader
          documentId={doc.id}
          versionId={previewId}
          canRestore={canEditNow}
          onBack={() => actions.previewVersion(null)}
          onRestore={() => actions.requestRestore(previewId)}
        />
      ) : (
        <>
          <SlidesHeader titleInputRef={titleInputRef} />
          <SlidesToolbar />
        </>
      )}
      <SlidesBanners />
      <div className="flex min-h-0 flex-1">
        {workspace}
        <RightPanel panelWrite={panelWrite} />
      </div>
      <SlidesDialogs />
    </div>
  );
}
