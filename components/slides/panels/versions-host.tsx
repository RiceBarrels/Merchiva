"use client";

// Version history on the desktop (slides.md §4.9, §7.3). VersionsPanel hosts the Docs VersionHistoryPanel in the
// side-panel frame: choosing a version previews it, its menu names, renames, deletes or restores (restore asks
// first, in the editor's restoreConfirm dialog). VersionPreview replaces the rail and the stage while a version is
// previewed: the version's deck, decoded into its own Y.Doc (loadVersionDoc) and read through a read-only DeckStore,
// as thumbnails and one slide at the fit size. The live session is untouched and the version doc is never written.
// Restoring is an ordinary edit of the live deck (restoreSlidesVersion): collaborators receive it and Mod+Z undoes it.
import { useEffect, useState, type KeyboardEvent } from "react";
import { History, Loader2 } from "lucide-react";

import { SlideView } from "@/components/slides/canvas/slide-view";
import { useStageFit } from "@/components/slides/canvas/use-stage-fit";
import { SidePanelFrame } from "@/components/docs/panels/side-panel-frame";
import { VersionHistoryPanel } from "@/components/docs/panels/version-history-panel";
import { railThumbWidth } from "@/components/slides/rail/slide-rail";
import { SlideThumb } from "@/components/slides/rail/slide-thumb";
import { steppedSlide } from "@/components/slides/rail/rail-selection";
import { useSlideViewLabels, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import type { DocVersion } from "@/lib/docs/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { DeckStore } from "@/lib/slides/model/deck-store";
import { useDeckState } from "@/lib/slides/use-deck-state";
import { loadVersionDoc } from "@/lib/slides/versions";
import { useDocumentVersions } from "@/lib/spacetimedb/hooks/useDocs";
import { cn } from "@/lib/utils";

const STAGE_PADDING = 32;

export function VersionsPanel() {
  const t = useT();
  const { doc, access, memberId, ui, dispatch, actions } = useSlidesEditor();
  return (
    <SidePanelFrame title={t("docs.versions.title")} onClose={() => dispatch({ type: "closePanel" })}>
      <VersionHistoryPanel
        variant="panel"
        documentId={doc.id}
        access={access}
        memberId={memberId}
        selectedVersionId={ui.previewVersionId}
        onSelectVersion={actions.previewVersion}
        onNameCurrentVersion={() => dispatch({ type: "openDialog", dialog: "nameVersion" })}
        onRestoreVersion={actions.requestRestore}
      />
    </SidePanelFrame>
  );
}

/** The version's deck in a read-only store; the stage and thumbnails render from it. */
function VersionDeck({ store }: { store: DeckStore }) {
  const t = useT();
  const labels = useSlideViewLabels();
  const { ui } = useSlidesEditor();
  const deck = useDeckState(store);
  const [chosen, setChosen] = useState<string | null>(null);
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const fit = useStageFit(viewport, deck.meta.size, { padding: STAGE_PADDING });
  const shown = chosen && deck.slides.has(chosen) ? chosen : (deck.slideIds[0] ?? null);
  const slide = shown ? deck.slides.get(shown) : undefined;
  const thumbWidth = railThumbWidth(ui.railWidth);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const dir = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const next = event.key === "Home" ? deck.slideIds[0] : event.key === "End" ? deck.slideIds[deck.slideIds.length - 1] : dir ? steppedSlide(deck.slideIds, shown, dir) : null;
    if (!next) return;
    event.preventDefault();
    setChosen(next);
    rail?.querySelector<HTMLElement>(`[data-version-slide="${next}"]`)?.focus();
  };

  if (!slide) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-muted">
        <EmptyState compact icon={History} title={t("slides.editor.emptyDeckTitle")} />
      </div>
    );
  }

  return (
    <>
      <div
        ref={setRail}
        role="listbox"
        aria-label={t("slides.rail.label")}
        onKeyDown={onKeyDown}
        className="shrink-0 overflow-y-auto border-e border-border bg-background py-2"
        style={{ width: ui.railWidth }}
      >
        {deck.slideIds.map((id, i) => {
          const s = deck.slides.get(id);
          if (!s) return null;
          const current = id === shown;
          return (
            <div
              key={id}
              role="option"
              aria-selected={current}
              tabIndex={current ? 0 : -1}
              data-version-slide={id}
              onClick={() => setChosen(id)}
              className="group flex cursor-default items-start gap-1.5 px-2 py-1 outline-none select-none"
            >
              <span aria-hidden className="w-5 shrink-0 pt-0.5 text-end font-mono text-[11px] tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <div
                className={cn(
                  "rounded-[2px] border group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                  current ? "border-foreground ring-1 ring-foreground" : "border-border",
                )}
              >
                <SlideThumb deck={deck} slide={s} width={thumbWidth} root={rail} labels={labels} className={s.hidden ? "opacity-50" : undefined} />
              </div>
              <span className="sr-only">{fmt(t("slides.rail.slideN"), { n: i + 1 })}</span>
              {s.hidden && <span className="sr-only">{t("slides.rail.hidden")}</span>}
            </div>
          );
        })}
      </div>
      <div ref={setViewport} className="relative min-w-0 flex-1 overflow-hidden bg-muted">
        <div className="flex h-full w-full items-center justify-center" style={{ visibility: fit.measured ? undefined : "hidden" }}>
          <div className="border border-border bg-background">
            <SlideView deck={deck} slide={slide} scale={fit.scale} mode="present" labels={labels} />
          </div>
        </div>
      </div>
    </>
  );
}

type Loaded = { status: "ready"; store: DeckStore } | { status: "error" };

/** Loads one version (the parent keys it by version and attempt, so `version` is read once). */
function VersionLoader({ version, onRetry }: { version: DocVersion; onRetry(): void }) {
  const t = useT();
  const [source] = useState(version);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    let result: Loaded | null = null;
    let store: DeckStore | null = null;
    loadVersionDoc(source)
      .then((ydoc) => {
        if (cancelled) return;
        store = new DeckStore(ydoc, { readOnly: true });
        result = { status: "ready", store };
      })
      .catch((err: unknown) => {
        console.error("[slides] version preview failed", err);
        result = { status: "error" };
      })
      .finally(() => {
        if (!cancelled && result) setLoaded(result);
      });
    return () => {
      cancelled = true;
      store?.destroy();
    };
  }, [source]);

  if (loaded?.status === "ready") return <VersionDeck store={loaded.store} />;
  if (loaded?.status === "error") {
    return (
      <div className="flex min-w-0 flex-1 items-start justify-center bg-muted p-6">
        <Callout
          tone="danger"
          title={t("docs.versions.loadFailed")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t("docs.versions.retry")}
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center bg-muted" role="status" aria-label={t("common.loading")}>
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Replaces the rail and the stage while `versionId` is previewed. */
export function VersionPreview({ versionId }: { versionId: string }) {
  const t = useT();
  const { doc } = useSlidesEditor();
  const { versions, isReady } = useDocumentVersions(doc.id, true);
  const [attempt, setAttempt] = useState(0);
  const version = versions.find((v) => v.id === versionId) ?? null;

  if (!version) {
    return isReady ? (
      <div className="flex min-w-0 flex-1 items-start justify-center bg-muted p-6">
        <Callout tone="danger" title={t("docs.versions.loadFailed")} />
      </div>
    ) : (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-muted" role="status" aria-label={t("common.loading")}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <VersionLoader key={`${version.id}:${attempt}`} version={version} onRetry={() => setAttempt((n) => n + 1)} />;
}
