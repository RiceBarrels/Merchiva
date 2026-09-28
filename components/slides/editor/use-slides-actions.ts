"use client";

// Document-level commands of the Slides editor (slides.md §7.2): the File menu, the header, the phone "More" sheet
// and the version history call these. Rename, trash and restore go through the Drive reducers for the actor
// (lib/slides/editor/file-writes.ts), so on /store they are checked for and attributed to the PIN operator; star,
// copy and share reuse the Docs reducers and dialogs and are not offered while acting (useSlidesFileCommands). New
// and imported decks go through the Drive seam (createSlidesDocument / importSlidesFile with targetForNewFromDeck),
// never the Docs createDocument wrapper, so a deck opened from someone else's My files is never copied into it.
//
// The returned object is stable for the session: every command reads the latest inputs when it runs. Navigation
// goes through useDocsOpenUrl(), so inside a device panel nothing leaves the panel.
import { useLayoutEffect, useMemo, useRef, type Dispatch } from "react";
import { toast } from "sonner";
import type * as Y from "yjs";

import type { SlideViewLabels } from "@/components/slides/canvas/slide-view";
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { reportDocError } from "@/components/docs/editor/notify";
import { useDriveActor, useDriveActorIds } from "@/components/drive/drive-actor";
import { exportDeck, isEmptyExport, isExportAbort, type SlidesExportFormat } from "@/components/slides/export/export-deck";
import { formatDateTime } from "@/lib/docs/format";
import type { DocAccess, DocVersion, DocumentMeta } from "@/lib/docs/types";
import type { VersionSaver } from "@/lib/docs/versions";
import { driveErrorCode, driveErrorKey } from "@/lib/drive/errors";
import { DRIVE_HOME_HREF, slidesHref } from "@/lib/drive/hrefs";
import type { DriveDocTarget } from "@/lib/drive/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { createSlidesDocument, targetForNewFromDeck } from "@/lib/slides/create";
import {
  renameDeck, restoreDeck, slidesFileCommands, toggleDeckStar, trashDeck, type SlidesFileCommands,
} from "@/lib/slides/editor/file-writes";
import { presentStartSlide, type SlidesUiAction, type SlidesUiState, type SpeakerMode } from "@/lib/slides/editor/ui-state";
import { exportWarningCount } from "@/lib/slides/export/report";
import type { DeckState } from "@/lib/slides/model/deck-store";
import { restoreSlidesVersion } from "@/lib/slides/versions";
import { duplicateDocument } from "@/lib/spacetimedb/actions";

export type { SlidesExportFormat } from "@/components/slides/export/export-deck";

export interface SlidesDocActions {
  renameTo(title: string): Promise<void>;
  toggleStar(): Promise<void>;
  /** duplicateDocument: the server keeps the folder only when it is still valid for the copier, else My files root. */
  makeCopy(): Promise<void>;
  moveToTrash(): Promise<void>;
  restoreFromTrash(): Promise<void>;
  openShare(): void;
  newPresentation(): Promise<void>;
  openImport(): void;
  download(format: SlidesExportFormat): Promise<void>;
  showVersionHistory(): void;
  nameCurrentVersion(name: string): Promise<void>;
  previewVersion(id: string | null): void;
  /** Rejects on failure (a confirmation stays open). */
  restoreVersion(id: string): Promise<void>;
  present(from: "current" | "start", speaker?: SpeakerMode): void;
  goHome(): void;
  /** Where File ▸ New and File ▸ Import put a deck (targetForNewFromDeck); null until the actor is known. */
  newDeckTarget(): DriveDocTarget | null;
  /** Opens a deck that an import just created. */
  openImported(documentId: string): void;
  /** Asks to restore a version (opens the restore confirmation). */
  requestRestore(versionId: string): void;
}

export interface SlidesDocActionDeps {
  doc: DocumentMeta;
  access: DocAccess;
  canEditNow: boolean;
  ydoc: Y.Doc;
  /** The live provider (saves versions); null while there is none. */
  provider: VersionSaver | null;
  deck: DeckState;
  ui: SlidesUiState;
  dispatch: Dispatch<SlidesUiAction>;
  findVersion(versionId: string): DocVersion | undefined;
  /** SlideView strings for the PDF / PNG export (useSlideViewLabels()). */
  labels: SlideViewLabels;
  locale: string;
}

type Translate = (key: string) => string;

/** A failed file write: the Drive reducers fail with `[drive.*]`, the Docs ones (and the title check) with `[doc.*]`. */
function reportFileError(err: unknown, t: Translate): void {
  if (driveErrorCode(err) !== null) toast.error(t(driveErrorKey(err)));
  else reportDocError(err, t);
}

/** Which file commands the chrome offers: star, copy and share not while acting for a PIN operator (file-writes.ts). */
export function useSlidesFileCommands(): SlidesFileCommands {
  const { actingMemberId } = useDriveActorIds();
  return useMemo(() => slidesFileCommands({ actingMemberId }), [actingMemberId]);
}

export function useSlidesActions(deps: SlidesDocActionDeps): SlidesDocActions {
  const t = useT();
  const openDocsUrl = useDocsOpenUrl();
  const actor = useDriveActor();
  const latest = useRef({ ...deps, t, openDocsUrl, actor });
  useLayoutEffect(() => {
    latest.current = { ...deps, t, openDocsUrl, actor };
  });
  const exporting = useRef(false);

  return useMemo<SlidesDocActions>(() => {
    const cur = () => latest.current;
    const newDeckTarget = (): DriveDocTarget | null => {
      const { doc, actor: a } = cur();
      return a.ready ? targetForNewFromDeck(doc, a) : null;
    };
    return {
      newDeckTarget,
      renameTo: async (title) => {
        const { doc, actor: a, t: tr } = cur();
        try {
          await renameDeck(doc, title, a);
        } catch (err) {
          reportFileError(err, tr);
          throw err;
        }
      },
      toggleStar: async () => {
        const { doc, actor: a, t: tr } = cur();
        try {
          await toggleDeckStar(doc, a);
        } catch (err) {
          reportDocError(err, tr);
        }
      },
      makeCopy: async () => {
        const { doc, actor: a, t: tr, openDocsUrl: open } = cur();
        // duplicateDocument makes the sender the owner: while acting, that is the tablet account.
        if (!slidesFileCommands(a).makeCopy) return;
        try {
          const id = await duplicateDocument({ sourceDocumentId: doc.id, title: fmt(tr("docs.copy.title"), { title: doc.title || tr("slides.untitled") }) });
          toast.success(tr("docs.copy.toast"), { action: { label: tr("docs.menu.open"), onClick: () => open(slidesHref(id), "new-foreground") } });
        } catch (err) {
          reportDocError(err, tr);
        }
      },
      moveToTrash: async () => {
        const { doc, access, actor: a, t: tr, openDocsUrl: open } = cur();
        if (!access.canManage) return;
        try {
          await trashDeck(doc, a);
          toast(tr("docs.trash.movedToast"), {
            action: {
              label: tr("docs.trash.undo"),
              onClick: () => {
                restoreDeck(doc, a)
                  .then(() => toast.success(tr("slides.file.restoredToast")))
                  .catch((err: unknown) => reportFileError(err, tr));
              },
            },
          });
          open(DRIVE_HOME_HREF, "current");
        } catch (err) {
          reportFileError(err, tr);
        }
      },
      restoreFromTrash: async () => {
        const { doc, access, actor: a, t: tr } = cur();
        if (!access.canManage) return;
        try {
          await restoreDeck(doc, a);
          toast.success(tr("slides.file.restoredToast"));
        } catch (err) {
          reportFileError(err, tr);
        }
      },
      openShare: () => {
        const { actor: a, dispatch } = cur();
        // The share dialog grants and changes visibility as the sender: while acting, the tablet account.
        if (slidesFileCommands(a).share) dispatch({ type: "openDialog", dialog: "share" });
      },
      newPresentation: async () => {
        const { t: tr, openDocsUrl: open } = cur();
        const target = newDeckTarget();
        if (!target) return;
        try {
          const id = await createSlidesDocument(target);
          open(slidesHref(id, { isNew: true }), "new-foreground");
        } catch (err) {
          reportDocError(err, tr);
        }
      },
      openImport: () => cur().dispatch({ type: "openDialog", dialog: "importPptx" }),
      openImported: (documentId) => cur().openDocsUrl(slidesHref(documentId, { isNew: true }), "new-foreground"),
      download: async (format) => {
        if (exporting.current) return;
        exporting.current = true;
        const { doc, ydoc, ui, labels, t: tr } = cur();
        const controller = new AbortController();
        const cancel = { label: tr("slides.export.cancel"), onClick: () => controller.abort() };
        const id = toast.loading(tr("docs.export.preparing"), { action: cancel });
        try {
          const { result, report } = await exportDeck({
            format,
            ydoc,
            title: doc.title,
            untitled: tr("slides.untitled"),
            currentSlideId: ui.currentSlideId,
            labels,
            signal: controller.signal,
            onProgress: (done, total) => {
              if (format !== "pptx") toast.loading(fmt(tr("slides.export.working"), { done: Math.min(done + 1, total), total }), { id, action: cancel });
            },
          });
          if (result === "unsupported") toast(tr("slides.export.unsupported"), { id, action: undefined });
          else if (result === "cancelled") toast.dismiss(id);
          else {
            const n = exportWarningCount(report);
            if (n > 0) toast.warning(fmt(tr("slides.export.simplified"), { n }), { id, action: undefined });
            else toast.success(tr("slides.export.done"), { id, action: undefined });
          }
        } catch (err) {
          if (isExportAbort(err)) toast.dismiss(id);
          else if (isEmptyExport(err)) toast(tr("slides.present.noSlides"), { id, action: undefined });
          else {
            console.error("[slides] export failed", err);
            toast.error(tr("slides.export.failed"), { id, action: undefined });
          }
        } finally {
          exporting.current = false;
        }
      },
      showVersionHistory: () => {
        const { ui, dispatch } = cur();
        if (ui.rightPanel !== "history") dispatch({ type: "openPanel", panel: "history" });
      },
      nameCurrentVersion: async (name) => {
        const { provider, t: tr } = cur();
        if (!provider) throw new Error("No live session");
        try {
          await provider.saveVersion("named", name);
          toast.success(tr("docs.versions.named"));
        } catch (err) {
          reportDocError(err, tr);
          throw err;
        }
      },
      previewVersion: (id) => cur().dispatch({ type: "previewVersion", versionId: id }),
      requestRestore: (versionId) => cur().dispatch({ type: "requestRestore", versionId }),
      restoreVersion: async (versionId) => {
        const { ydoc, provider, canEditNow, findVersion, dispatch, locale, t: tr } = cur();
        const version = findVersion(versionId);
        if (!canEditNow || !version || !provider) {
          toast.error(tr("docs.versions.loadFailed"));
          throw new Error("Version unavailable");
        }
        try {
          await restoreSlidesVersion({
            ydoc,
            provider,
            version,
            safetyName: fmt(tr("docs.versions.beforeRestore"), { time: formatDateTime(new Date(), locale) }),
          });
        } catch (err) {
          reportDocError(err, tr, "docs.versions.restoreFailed");
          throw err;
        }
        dispatch({ type: "previewVersion", versionId: null });
        dispatch({ type: "closeDialog" });
        toast.success(tr("docs.versions.restored"));
      },
      present: (from, speaker = "none") => {
        const { deck, ui, dispatch, t: tr } = cur();
        const start = presentStartSlide(deck, from, ui.currentSlideId);
        if (!start) {
          toast(tr("slides.present.noSlides"));
          return;
        }
        dispatch({ type: "present", startSlideId: start, speaker });
      },
      goHome: () => cur().openDocsUrl(DRIVE_HOME_HREF, "current"),
    };
  }, []);
}
