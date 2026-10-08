"use client";

/**
 * One open deck after its first sync (slides.md §7.2). The session
 * - builds the render state (a DeckStore per Y.Doc, repairing and seeding only while a mounted editor can edit), the
 *   UI state, the one undo stack, the document and element actions and the presence;
 * - registers the serializer the provider sends with every compaction and version, and keeps the Drive card excerpt
 *   current (after 5 s without local edits, at most every 30 s; remote edits never write);
 * - consumes the link parameters: `?slide=` opens on that slide, `?version=` previews that version, `?present=1`
 *   starts the slideshow, `?new=1` focuses the title (desktop) or opens in edit mode (phone) and shows the report of
 *   an import that just created the deck. They are one-shot: once consumed the URL is replaced without them, and a
 *   later link to the same deck in this tab applies again;
 * - wires the shell (docked chrome, immersive while presenting, the phone page actions) and renders the desktop or
 *   phone layout inside SlidesEditorContext, with the slideshow host beside it for both;
 * - handles losing access after the first sync as Docs does: while the member can still view the deck (the route
 *   unmounts the editor when they cannot) it stays open read-only under a banner (SlidesBanners, below the header);
 *   a deck that no longer exists, or a module without Docs, is a full page without the slideshow or the phone page
 *   actions.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { History, Play, Share2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type * as Y from "yjs";

import { useDocSaveState } from "@/components/docs/editor/use-save-state";
import { useSheetReplaceUrl } from "@/components/sheets/use-sheet-replace-url";
import { DesktopSlidesEditor } from "@/components/slides/editor/desktop-slides-editor";
import {
  SlidesEditorContext, slidesAwarenessOf, useSlideViewLabels, useSlidesEditorRefs, useSlidesUiState, useSlidesUndo,
  type SlidesEditorContextValue,
} from "@/components/slides/editor/slides-context";
import { useElementActions } from "@/components/slides/editor/use-element-actions";
import { useSlidesActions, useSlidesFileCommands } from "@/components/slides/editor/use-slides-actions";
import { useSlidesPresence } from "@/components/slides/editor/use-slides-presence";
import { MobileSlidesEditor } from "@/components/slides/mobile/mobile-slides-editor";
import { SlidesPresenterHost } from "@/components/slides/present/presenter-host";
import { EmptyState } from "@/components/ui/empty-state";
import { useRegisterPageActions, useShellChrome, type PageAction } from "@/lib/browser-shell";
import { DOC_ERROR_I18N_KEYS } from "@/lib/docs/errors";
import type { SpacetimeYjsProvider } from "@/lib/docs/spacetime-provider";
import { docExcerpt } from "@/lib/docs/text";
import type { DocumentCollaboration } from "@/lib/docs/use-document-collaboration";
import { slidesHref } from "@/lib/drive/hrefs";
import { useI18n } from "@/lib/i18n/context";
import { SLIDES_SILENT_ORIGIN } from "@/lib/slides/constants";
import { presentStartSlide } from "@/lib/slides/editor/ui-state";
import { DeckStore } from "@/lib/slides/model/deck-store";
import { serializeDeck } from "@/lib/slides/serialize";
import { useDeckState } from "@/lib/slides/use-deck-state";
import { updateDocumentMeta } from "@/lib/spacetimedb/actions";
import { useDocumentVersions } from "@/lib/spacetimedb/hooks/useDocs";

import type { SlidesEditorProps } from "./slides-editor";
import { BackToDriveButton, SlidesCenteredState } from "./slides-editor-skeleton";

const EXCERPT_IDLE_MS = 5000;
const EXCERPT_MIN_GAP_MS = 30_000;

// One store per Y.Doc, living as long as the doc (the session cache destroys it after 30 s parked), not as long as a
// mounted editor: a hidden browser-shell tab (<Activity>) and StrictMode run effect cleanups without unmounting, and
// a store destroyed there would never publish again. Two tabs on the same deck share its doc, and so its store.
const deckStores = new WeakMap<Y.Doc, DeckStore>();

function deckStoreFor(ydoc: Y.Doc): DeckStore {
  let store = deckStores.get(ydoc);
  if (!store) {
    const created = new DeckStore(ydoc);
    deckStores.set(ydoc, created);
    ydoc.once("destroy", () => {
      created.destroy();
      deckStores.delete(ydoc);
    });
    store = created;
  }
  return store;
}

// Repairs and the first slide of an empty deck are writes, made only while at least one mounted editor can edit the
// store's deck. Not while the doc is parked (the session cache keeps it syncing after the editor closes), in a hidden
// tab, or for a viewer. Counted: two tabs on the same deck share its store, and one closing leaves the other repairing.
const repairHolds = new WeakMap<DeckStore, number>();

function holdRepairs(store: DeckStore): () => void {
  const holds = (repairHolds.get(store) ?? 0) + 1;
  repairHolds.set(store, holds);
  if (holds === 1) store.setCanRepair(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = Math.max(0, (repairHolds.get(store) ?? 1) - 1);
    repairHolds.set(store, left);
    if (left === 0) store.setCanRepair(false);
  };
}

interface LinkSeen {
  slide: string | null;
  version: string | null;
  present: boolean;
  isNew: boolean;
}

export interface SlidesSessionProps extends SlidesEditorProps {
  collab: DocumentCollaboration;
  ydoc: Y.Doc;
  provider: SpacetimeYjsProvider;
  /** The editing member (the panel's member on a device), canonical form. */
  memberId: string;
  isMobile: boolean;
}

export function SlidesSession(props: SlidesSessionProps): React.JSX.Element {
  const { doc, access, isStarred, initialNew, initialSlideId, versionParam, startPresenting, collab, ydoc, provider, memberId, isMobile } =
    props;
  const { t, locale } = useI18n();
  const replaceUrl = useSheetReplaceUrl();

  const store = useMemo(() => deckStoreFor(ydoc), [ydoc]);
  const deck = useDeckState(store);
  const canEditNow = access.canEdit && collab.accessLost === null;
  // Held while this editor is mounted and can edit (see holdRepairs); a viewer writes nothing.
  useEffect(() => {
    if (!canEditNow) return;
    return holdRepairs(store);
  }, [store, canEditNow]);

  // Access lost after the first sync (see the file comment); the read-only case is a banner (SlidesBanners).
  const lost = collab.accessLost;
  const lostPage = lost === "not_found" || lost === "not_published";

  const [ui, dispatch] = useSlidesUiState(deck, { initialSlideId, startPresenting }, canEditNow);
  const undo = useSlidesUndo(ydoc, ui, dispatch);
  const refs = useSlidesEditorRefs();
  const labels = useSlideViewLabels();
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Link parameters (see the file comment). `?slide=` and `?present=1` of the first render went into the initial UI
  // state; everything else, and any later link while the deck is open, is applied here.
  const [seen, setSeen] = useState<LinkSeen>({ slide: initialSlideId, version: null, present: startPresenting, isNew: false });
  if (seen.slide !== initialSlideId || seen.version !== versionParam || seen.present !== startPresenting || seen.isNew !== initialNew) {
    setSeen({ slide: initialSlideId, version: versionParam, present: startPresenting, isNew: initialNew });
    const slide = initialSlideId !== null && initialSlideId !== seen.slide && deck.slides.has(initialSlideId) ? initialSlideId : null;
    if (slide) dispatch({ type: "selectSlide", slideId: slide });
    if (versionParam !== null && versionParam !== seen.version) {
      if (!isMobile && ui.rightPanel !== "history") dispatch({ type: "openPanel", panel: "history" });
      dispatch({ type: "previewVersion", versionId: versionParam });
    }
    if (startPresenting && !seen.present) {
      const start = presentStartSlide(deck, "current", slide ?? ui.currentSlideId);
      if (start) dispatch({ type: "present", startSlideId: start, speaker: "none" });
    }
    if (initialNew && !seen.isNew && isMobile && canEditNow && !deck.schemaTooNew) dispatch({ type: "setMobileMode", mode: "edit" });
  }

  // `?new=1` on a desktop: the title is focused for naming. Then every link parameter leaves the URL (replaced, so
  // Back skips it); a device panel has no URL and never gets any.
  const newHandled = useRef(false);
  useEffect(() => {
    if (!initialNew || newHandled.current) return;
    newHandled.current = true;
    const input = titleInputRef.current;
    if (!isMobile && access.canEdit && input) {
      input.focus();
      input.select();
    }
  }, [initialNew, isMobile, access.canEdit]);
  const linked = initialNew || initialSlideId !== null || versionParam !== null || startPresenting;
  useEffect(() => {
    if (linked) replaceUrl(slidesHref(doc.id));
  }, [linked, replaceUrl, doc.id]);

  // A deck an import just created: its report, once (the import module is already loaded by then).
  const reportTaken = useRef(false);
  useEffect(() => {
    if (!initialNew || reportTaken.current) return;
    reportTaken.current = true;
    import("@/lib/slides/import")
      .then(({ takePendingImportReport }) => {
        const report = takePendingImportReport(doc.id);
        if (report && report.items.length > 0) dispatch({ type: "showImportReport", report });
      })
      .catch((err: unknown) => console.error("[slides] import report unavailable", err));
  }, [initialNew, doc.id, dispatch]);

  const versionsEnabled = ui.rightPanel === "history" || ui.previewVersionId !== null || ui.dialog === "restoreConfirm";
  const { versions } = useDocumentVersions(doc.id, versionsEnabled);
  const findVersion = useCallback((versionId: string) => versions.find((v) => v.id === versionId), [versions]);

  const actions = useSlidesActions({ doc, access, canEditNow, ydoc, provider, deck, ui, dispatch, findVersion, labels, locale });
  const el = useElementActions({ doc, canEditNow, ydoc, deck, ui, dispatch, refs, undo });
  const peers = useSlidesPresence(provider, slidesAwarenessOf(ui));
  const saveState = useDocSaveState(collab.status, canEditNow);

  // Snapshot serializer for compaction and versions (pure over the doc).
  useEffect(() => {
    provider.setSerializer(() => serializeDeck(ydoc));
    return () => provider.setSerializer(null);
  }, [provider, ydoc]);

  // Card excerpt: after 5 s without local edits, at most every 30 s. The first write after open is not throttled, so a
  // row whose text another client once overwrote heals on the first edit (the next compaction rewrites the rest).
  const excerptRef = useRef(doc.excerpt);
  useLayoutEffect(() => {
    excerptRef.current = doc.excerpt;
  });
  useEffect(() => {
    if (!canEditNow) return;
    let idleTimer: number | undefined;
    let lastWrite = 0;
    const flush = () => {
      if (ydoc.isDestroyed) return;
      const wait = EXCERPT_MIN_GAP_MS - (Date.now() - lastWrite);
      if (wait > 0) {
        idleTimer = window.setTimeout(flush, wait);
        return;
      }
      const excerpt = docExcerpt(serializeDeck(ydoc).plainText);
      if (excerpt === excerptRef.current) return;
      lastWrite = Date.now();
      excerptRef.current = excerpt;
      updateDocumentMeta(doc.id, { excerpt }).catch(() => {
        // Best effort: compaction also refreshes the excerpt.
      });
    };
    const onUpdate = (_update: Uint8Array, origin: unknown, _doc: Y.Doc, tr: Y.Transaction) => {
      // Remote rows arrive through applyUpdate (not local); repairs and seeding are silent.
      if (!tr.local || origin === SLIDES_SILENT_ORIGIN) return;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(flush, EXCERPT_IDLE_MS);
    };
    ydoc.on("update", onUpdate);
    return () => {
      ydoc.off("update", onUpdate);
      window.clearTimeout(idleTimer);
    };
  }, [ydoc, canEditNow, doc.id]);

  // Losing edit rights while the deck is open.
  const hadEdit = useRef(access.canEdit);
  useEffect(() => {
    if (hadEdit.current && !access.canEdit) toast(t("slides.editor.accessChanged"));
    hadEdit.current = access.canEdit;
  }, [access.canEdit, t]);

  // Shell: docked chrome; immersive while presenting (the phone layout adds its own while editing). The full-page
  // access-lost state has no slideshow and no page actions.
  useShellChrome({ immersive: ui.presenting !== null && !lostPage, mobileChrome: "docked" });
  const canShare = useSlidesFileCommands().share;
  const pageActions = useMemo<readonly PageAction[] | null>(
    () =>
      isMobile
        ? [
            { id: "slides-present", label: t("slides.view.present"), icon: Play, onSelect: () => actions.present("current") },
            ...(canShare ? [{ id: "slides-share", label: t("slides.file.share"), icon: Share2, onSelect: actions.openShare }] : []),
            { id: "slides-history", label: t("slides.file.versionHistory"), icon: History, onSelect: actions.showVersionHistory },
          ]
        : null,
    [isMobile, t, actions, canShare],
  );
  useRegisterPageActions(lostPage ? null : pageActions);

  const value = useMemo<SlidesEditorContextValue>(
    () => ({
      doc, access, isStarred, memberId, canEditNow, ydoc, provider, collab, store, deck, undo, ui, dispatch, actions, el, peers, saveState,
      isMobile, locale, refs,
    }),
    [doc, access, isStarred, memberId, canEditNow, ydoc, provider, collab, store, deck, undo, ui, dispatch, actions, el, peers, saveState, isMobile, locale, refs],
  );

  if (lostPage) {
    return (
      <SlidesCenteredState>
        <EmptyState
          icon={ShieldAlert}
          title={t("slides.editor.accessLostTitle")}
          description={t(DOC_ERROR_I18N_KEYS[lost])}
          action={<BackToDriveButton />}
        />
      </SlidesCenteredState>
    );
  }

  return (
    <SlidesEditorContext.Provider value={value}>
      <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-background" data-slides-session="">
        {isMobile ? <MobileSlidesEditor /> : <DesktopSlidesEditor titleInputRef={titleInputRef} />}
      </div>
      <SlidesPresenterHost />
    </SlidesEditorContext.Provider>
  );
}
