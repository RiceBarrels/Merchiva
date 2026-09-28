"use client";

// Version history of a spreadsheet (sheets.md §10.7): the Docs list (VersionHistoryPanel, whose rows are light
// because a sheet version's bytes live in document_version_state), the read-only preview of a version over the
// sheet, and the restore confirmation. A version's bytes are subscribed one row at a time (useSheetVersionState),
// decoded off the render path and sanitized before Univer sees them. Only a version of THIS sheet (one listed by
// useDocumentVersions) is loaded: a `?version=` of another document fails instead of showing, or restoring, its bytes.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { RestoreVersionAlert } from "@/components/docs/dialogs/restore-version-alert";
import { VersionHistoryPanel } from "@/components/docs/panels/version-history-panel";
import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import { formatDateTime } from "@/lib/docs/format";
import { useI18n } from "@/lib/i18n/context";
import { decodeSheetEnvelopeAsync } from "@/lib/sheets/codec";
import { sanitizeWorkbookData } from "@/lib/sheets/sanitize";
import { useDocumentVersions } from "@/lib/spacetimedb/hooks/useDocs";
import { useSheetVersionState } from "@/lib/spacetimedb/hooks/useSheets";

/** How long a restore waits for the version's bytes to arrive. */
const BYTES_WAIT_MS = 20_000;

type Waiter = { id: string; resolve(state: Uint8Array): void; reject(err: Error): void };

export interface SheetVersionPreviewState {
  /** The previewed version's bytes are loading or decoding. */
  loading: boolean;
  /** They could not be loaded (no such row, not a version of this sheet, or a corrupt version). */
  failed: boolean;
  /** Resolves with a version's bytes once its row is here (restore). */
  waitForBytes(versionId: string): Promise<Uint8Array>;
}

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Loads the bytes of the previewed version (else of the one being restored) and shows the preview on the grid.
 * Mounted once by the editor, so the preview follows `ui.previewVersionId` whatever panel is open.
 */
export function useSheetVersionPreview(): SheetVersionPreviewState {
  const { doc, ui, host } = useSheetEditor();
  const previewId = ui.previewVersionId;
  const wantedId = previewId ?? ui.restoreVersionId;
  const { versions, isReady: versionsReady } = useDocumentVersions(doc.id, wantedId !== null);
  const known = useMemo(() => new Set(versions.map((v) => v.id.toLowerCase())), [versions]);
  const isOwn = useCallback((versionId: string) => known.has(versionId.toLowerCase()), [known]);
  // Bytes are subscribed only for a version this sheet lists.
  const loadId = wantedId !== null && isOwn(wantedId) ? wantedId : null;
  const { state, isReady } = useSheetVersionState(loadId);
  const [shown, setShown] = useState<{ id: string; ok: boolean } | null>(null);
  const showId = previewId !== null && loadId !== null && sameId(previewId, loadId) ? previewId : null;

  useEffect(() => {
    if (!host) return;
    if (!showId) {
      host.hidePreview();
      return;
    }
    if (!state) return;
    let cancelled = false;
    decodeSheetEnvelopeAsync(state)
      .then((envelope) => {
        if (cancelled) return;
        host.showPreview(sanitizeWorkbookData(envelope.wb));
        setShown({ id: showId, ok: true });
      })
      .catch(() => {
        if (!cancelled) setShown({ id: showId, ok: false });
      });
    return () => {
      cancelled = true;
    };
  }, [host, showId, state]);

  const waiters = useRef<Waiter[]>([]);
  const latest = useRef({ loadId, state, versionsReady, isOwn });
  useLayoutEffect(() => {
    latest.current = { loadId, state, versionsReady, isOwn };
    if (!state || loadId === null) return;
    for (const waiter of waiters.current.filter((w) => sameId(w.id, loadId))) waiter.resolve(state);
    waiters.current = waiters.current.filter((w) => !sameId(w.id, loadId));
  });

  const waitForBytes = useCallback((versionId: string) => {
    const now = latest.current;
    if (now.versionsReady && !now.isOwn(versionId)) return Promise.reject(new Error("[sheet.invalid] Not a version of this spreadsheet"));
    if (now.loadId !== null && sameId(now.loadId, versionId) && now.state) return Promise.resolve(now.state);
    return new Promise<Uint8Array>((resolve, reject) => {
      const waiter: Waiter = { id: versionId, resolve, reject };
      waiters.current.push(waiter);
      window.setTimeout(() => {
        if (!waiters.current.includes(waiter)) return;
        waiters.current = waiters.current.filter((w) => w !== waiter);
        reject(new Error("[sheet.invalid] The version did not load"));
      }, BYTES_WAIT_MS);
    });
  }, []);

  const foreign = previewId !== null && versionsReady && !isOwn(previewId);
  const missing = showId !== null && isReady && state === null;
  const decodedFailed = showId !== null && shown?.id === showId && !shown.ok;
  const failed = foreign || missing || decodedFailed;
  const loading = previewId !== null && !failed && !(showId !== null && shown?.id === showId);
  return { loading, failed, waitForBytes };
}

/** The list: the desktop side panel's body, or the phone's history page. */
export function SheetVersionHistory({ variant }: { variant: "panel" | "page" }) {
  const { t } = useI18n();
  const { doc, access, actor, editing, mobile, ui, dispatch, actions } = useSheetEditor();
  return (
    <VersionHistoryPanel
      variant={variant}
      documentId={doc.id}
      access={access}
      memberId={actor.memberId}
      selectedVersionId={ui.previewVersionId}
      onSelectVersion={(versionId) => {
        actions.previewVersion(versionId);
        // The phone's history page covers the grid: close it so the version shows.
        if (mobile && versionId) dispatch({ type: "setHistory", open: false, keepPreview: true });
      }}
      onNameCurrentVersion={actions.nameCurrentVersion}
      onRestoreVersion={(versionId) => {
        if (!editing) {
          toast(t("sheets.lease.viewOnlyHint"), { action: { label: t("sheets.lease.edit"), onClick: () => void actions.requestEdit() } });
          return;
        }
        actions.previewVersion(versionId);
        actions.askRestore(versionId);
      }}
    />
  );
}

/** "Restore this version?": waits for the version's bytes, then the holder's session restores them. */
export function SheetRestoreAlert({ preview }: { preview: SheetVersionPreviewState }) {
  const { t, locale } = useI18n();
  const { doc, ui, dispatch, actions } = useSheetEditor();
  const restoreId = ui.restoreVersionId;
  const { versions } = useDocumentVersions(doc.id, restoreId !== null);
  const version = useMemo(() => versions.find((v) => v.id === restoreId) ?? null, [versions, restoreId]);
  const time = version ? formatDateTime(version.createdAt, locale) : "";

  return (
    <RestoreVersionAlert
      open={restoreId !== null}
      onOpenChange={(open) => {
        if (!open) dispatch({ type: "askRestore", versionId: null });
      }}
      time={time}
      onConfirm={async () => {
        if (!restoreId) return;
        let state: Uint8Array;
        try {
          // Only a version this sheet lists (a crafted link must never restore another document's content).
          if (!version) throw new Error("[sheet.invalid] Not a version of this spreadsheet");
          state = await preview.waitForBytes(restoreId);
        } catch (err) {
          toast.error(t("sheets.versions.loadFailed"));
          throw err;
        }
        await actions.restoreVersion(state, time);
      }}
    />
  );
}
