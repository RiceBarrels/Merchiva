"use client";

// Version history on the phone and in device panels (slides.md §4.9, §11): More ▸ Version history opens a full-screen
// page with the Docs version list (VersionHistoryPanel, page variant). Tapping a version shows it full screen: a
// read-only DeckStore over the decoded version doc (never written: no repairs, no seeding), swipeable slides, and
// Back / Restore. Restore (editors only) asks first (the editor's restore confirmation, SlidesDialogs), then restores
// through actions.restoreVersion, an undoable edit.
//
// The page is open while ui.rightPanel is "history" (the same state the desktop panel uses); the preview shows
// whenever ui.previewVersionId is set, with the page hidden under it, so the restore question sits on top.
//
// The preview is portaled to <body> at z-50: above the phone shell (its content layer is a stacking context under
// the z-48 chrome, which is also hidden while previewing) and above a device panel's z-50 app layer (earlier in the
// DOM); the restore confirmation (z-50, portaled after it) stays on top. Back (the shell's, Android's) closes it, and
// a version that is not in the list once it has loaded (a stale ?version=) says so instead of loading forever.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, History, Loader2, RotateCcw } from "lucide-react";

import { VersionHistoryPanel } from "@/components/docs/panels/version-history-panel";
import { useSlideViewLabels, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { PresentSlide } from "@/components/slides/present/present-slide";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useShellBackHandler, useShellChrome } from "@/lib/browser-shell";
import { formatDateTime } from "@/lib/docs/format";
import type { DocVersion } from "@/lib/docs/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { DeckStore, type DeckState } from "@/lib/slides/model/deck-store";
import { swipeAction } from "@/lib/slides/present/input";
import { loadVersionDoc } from "@/lib/slides/versions";
import { useDocumentVersions } from "@/lib/spacetimedb/hooks/useDocs";

type Loaded = { versionId: string; deck: DeckState } | { versionId: string; failed: true };

/** The version's deck, read once from a throwaway read-only store. */
function useVersionDeck(version: DocVersion | null): { deck: DeckState | null; failed: boolean } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!version) return;
    let cancelled = false;
    let store: DeckStore | null = null;
    loadVersionDoc(version)
      .then((doc) => {
        if (cancelled) return;
        store = new DeckStore(doc, { readOnly: true });
        setLoaded({ versionId: version.id, deck: store.getSnapshot() });
      })
      .catch((err: unknown) => {
        console.error("[slides] could not load a version", err);
        if (!cancelled) setLoaded({ versionId: version.id, failed: true });
      })
      .finally(() => {
        // Only its first snapshot is needed: the version never changes.
        store?.destroy();
      });
    return () => {
      cancelled = true;
    };
  }, [version]);
  if (!version || !loaded || loaded.versionId !== version.id) return { deck: null, failed: false };
  return "failed" in loaded ? { deck: null, failed: true } : { deck: loaded.deck, failed: false };
}

interface VersionPreviewProps {
  version: DocVersion | null;
  /** The versions have loaded and this one is not among them. */
  missing: boolean;
  canRestore: boolean;
  onBack(): void;
  onRestore(): void;
}

function VersionPreview({ version, missing, canRestore, onBack, onRestore }: VersionPreviewProps) {
  const t = useT();
  const { locale } = useSlidesEditor();
  const labels = useSlideViewLabels(true);
  const { deck, failed } = useVersionDeck(version);
  const [index, setIndex] = useState(0);
  const press = useRef<{ x: number; y: number; type: string } | null>(null);
  const total = deck?.slideIds.length ?? 0;
  const at = Math.min(index, Math.max(0, total - 1));
  const go = (delta: 1 | -1) => setIndex(Math.min(Math.max(0, at + delta), Math.max(0, total - 1)));

  let body: React.ReactNode;
  if (failed || missing) body = <EmptyState icon={History} title={t("docs.versions.loadFailed")} />;
  else if (!deck) body = <Loader2 aria-label={t("common.loading")} className="h-5 w-5 animate-spin text-muted-foreground" />;
  else if (total === 0) body = <EmptyState icon={History} title={t("slides.present.noSlides")} />;
  else body = <PresentSlide deck={deck} slideId={deck.slideIds[at]} labels={labels} padding={12} />;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("docs.versions.title")}
      className="fixed inset-0 z-50 flex flex-col bg-background"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-1.5">
        <Button type="button" variant="ghost" size="icon" aria-label={t("common.back")} onClick={onBack}>
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium">
          {version ? fmt(t("docs.versions.previewing"), { time: formatDateTime(version.createdAt, locale) }) : t("docs.versions.title")}
        </h2>
      </header>
      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center bg-muted"
        onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
          press.current = { x: event.clientX, y: event.clientY, type: event.pointerType };
        }}
        onPointerUp={(event: PointerEvent<HTMLDivElement>) => {
          const p = press.current;
          press.current = null;
          const swipe = p ? swipeAction({ pointerType: p.type, dx: event.clientX - p.x, dy: event.clientY - p.y }) : null;
          if (swipe) go(swipe === "next" ? 1 : -1);
        }}
        onPointerCancel={() => {
          press.current = null;
        }}
      >
        {body}
      </div>
      <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-border px-2">
        <Button type="button" variant="ghost" size="icon" aria-label={t("slides.present.previous")} disabled={at <= 0} onClick={() => go(-1)}>
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <span className="min-w-16 text-center font-mono text-[13px] tabular-nums text-muted-foreground">{total > 0 ? `${at + 1} / ${total}` : "0 / 0"}</span>
        <Button type="button" variant="ghost" size="icon" aria-label={t("slides.present.next")} disabled={at >= total - 1} onClick={() => go(1)}>
          <ChevronRight className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <span className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          {t("common.back")}
        </Button>
        {canRestore ? (
          <Button type="button" size="sm" disabled={!deck || total === 0} onClick={onRestore}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t("docs.versions.restore")}
          </Button>
        ) : null}
      </footer>
    </div>
  );
}

export function MobileVersionsPage() {
  const t = useT();
  const { doc, access, memberId, canEditNow, deck, ui, dispatch, actions } = useSlidesEditor();
  const pageOpen = ui.rightPanel === "history";
  const previewId = ui.previewVersionId;
  const { versions, isReady } = useDocumentVersions(doc.id, pageOpen || previewId !== null);
  const preview = useMemo(() => (previewId ? (versions.find((v) => v.id === previewId) ?? null) : null), [versions, previewId]);
  const canRestore = canEditNow && !deck.schemaTooNew;

  useShellChrome(previewId !== null ? { immersive: true } : null);
  useShellBackHandler(() => {
    actions.previewVersion(null);
    return true;
  }, previewId !== null);

  return (
    <>
      <Sheet
        open={pageOpen && previewId === null}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: "closePanel" });
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("docs.versions.title")}</SheetTitle>
          </SheetHeader>
          <VersionHistoryPanel
            variant="page"
            documentId={doc.id}
            access={access}
            memberId={memberId}
            selectedVersionId={previewId}
            onSelectVersion={(versionId) => actions.previewVersion(versionId)}
            onNameCurrentVersion={() => dispatch({ type: "openDialog", dialog: "nameVersion" })}
            onRestoreVersion={actions.requestRestore}
          />
        </SheetContent>
      </Sheet>
      {previewId && typeof document !== "undefined"
        ? createPortal(
            <VersionPreview
              key={previewId}
              version={preview}
              missing={isReady && preview === null}
              canRestore={canRestore}
              onBack={() => actions.previewVersion(null)}
              onRestore={() => actions.requestRestore(previewId)}
            />,
            document.body,
          )
        : null}
    </>
  );
}
