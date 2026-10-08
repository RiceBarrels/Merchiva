"use client";

// The Drive lite app's data and writes (drive-ui §14): the person's entry tree (useDriveData: the PIN
// operator on /store, the signed-in member on /personal), their uploads in this tab, and every change the
// app makes, each announced with a toast. Shared by every lite screen through the router's context.
//
// Writes go through the manager's runners, so both surfaces behave alike: runDriveWrite names the actor
// (`actingMemberId` on /store) and bounds the reply; New ▸ Doc / Sheet / Slides, a Doc from a template and
// "Open as …" go through
// lib/drive/editors.ts, timed from the moment their create is sent; uploads through useDriveCreate's
// uploadFiles (preflight, then the tab's queue); "Save to phone" through startDownload, straight from the tap.
// One change runs at a time (`busy`), which keeps a slow tablet from sending a second tap twice.
//
// When the module answers `[drive.operator]` (the tablet's PIN session for this person is gone), the error
// toast offers "Log in again", which drops the operator: the store screen then asks for a PIN or a QR again.

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import { announceWrite, startDownload } from "@/components/drive/actions/action-toasts";
import { driveWriteErrorKey, runDriveWrite, withReducerTimeoutFrom, type DriveWrite, type DriveWriteResult } from "@/components/drive/actions/drive-writes";
import { docCreateErrorMessage, docTargetOf, openAsTargetOf, openFileAs } from "@/components/drive/actions/open-as";
import { useDriveCreate } from "@/components/drive/actions/use-drive-create";
import { readDownloadEnv, type DownloadableEntry } from "@/components/drive/download";
import { canonicalMemberId } from "@/components/drive/drive-actor";
import type { ActionContext } from "@/components/drive/model/actions";
import { moveRoots, type MoveActor } from "@/components/drive/model/move";
import type { DriveDocKind, DriveEntry, DriveMoveTarget, DriveSection, FileEntry } from "@/components/drive/model/types";
import type { DroppedFile } from "@/components/drive/model/upload-plan";
import { usePreviewLoader } from "@/components/drive/preview/open-entry";
import { useDocTemplateNames, type StoreTemplateId } from "@/components/drive/store-templates";
import { useDriveData, type DriveData } from "@/components/drive/use-drive-data";
import { dateKey } from "@/lib/date-key";
import type { EditorKind } from "@/lib/device-apps";
import { isOrgAdminRole } from "@/lib/drive/access";
import { createDriveDoc, createDriveDocFromTemplate, DRIVE_IMPORT_FAILED_KEY } from "@/lib/drive/editors";
import { documentFileHref } from "@/lib/drive/hrefs";
import type { DriveUploadEntry, DriveUploadQueue } from "@/lib/drive/upload-queue";
import type { DriveUrlLoader } from "@/lib/drive/url-loader";
import { useDriveUploads } from "@/lib/drive/use-drive-uploads";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useLiveSpacetimeConnection, useSignedInMember } from "@/lib/spacetimedb/hooks/useDocs";
import { setCurrentOperator } from "@/lib/store-device-lock";
import { isOperatorError } from "./lite-actions";
import type { LiteEditorGate } from "./lite-install-drawer";

export interface UseLiteDriveOptions {
  organizationId: string;
  /** The editor plugins' gate (lite-install-drawer.tsx): New and "Open as …" ask for a missing one first. */
  editors: LiteEditorGate;
  /** The panel's opener: a new document opens its editor on top. */
  openInPanel: DocsOpenUrl;
  /** The section of the screen on top ("Added to My files" shows only away from My files). */
  section: DriveSection;
  /** Shows the Mine tab (the "Show" of "Added to My files"). */
  showMyFiles(): void;
}

/** A success toast: fixed copy, or copy built from what landed; null says nothing. */
export type LiteSuccess = string | null | ((result: DriveWriteResult) => string | null);

export interface LiteDrive {
  data: DriveData;
  surface: "store" | "personal";
  organizationId: string;
  /** Uploads this person started in this tab, for this store. */
  uploads: readonly DriveUploadEntry[];
  queue: DriveUploadQueue;
  offline: boolean;
  /** Whether `kind`'s editor plugin is installed (true while the install state loads). */
  editorInstalled(kind: EditorKind): boolean;
  /** Runs `then` once `kind`'s editor plugin is installed: now, or after the download drawer installs it. */
  ensureEditor(kind: EditorKind, mode: "open" | "create", then: () => void): void;
  /** The module has no Drive yet. */
  notPublished: boolean;
  /** Rows, the actor or the members are still on their way. */
  loading: boolean;
  /** A store tablet signed in with an account that is neither owner nor manager: Store only. */
  staffTablet: boolean;
  ctx: ActionContext;
  moveActor: MoveActor;
  /** Signed URLs for the person (the operator's scope on /store). */
  loader: DriveUrlLoader;
  /** A change is running; buttons that change something wait. */
  busy: boolean;
  /** "Log in again" on /store; null on /personal. */
  relogin: (() => void) | null;
  /** moveRoots for one entry: whether "Share with store" / "Move to my files" can be offered. */
  movesFor(entry: DriveEntry): { toStore: boolean; toMy: boolean };
  /** Runs a write and says how it went; resolves true when everything landed. Never rejects. */
  runWrite(write: DriveWrite, success: LiteSuccess, undo?: () => void): Promise<boolean>;
  createDocument(kind: DriveDocKind, target: DriveMoveTarget): void;
  /** New ▸ Doc from a template: a Doc filled from a store template, gated like createDocument. */
  createFromTemplate(templateId: StoreTemplateId, target: DriveMoveTarget): void;
  uploadFiles(files: readonly DroppedFile[], target: DriveMoveTarget): void;
  openAs(entry: FileEntry, kind: DriveDocKind): void;
  /** "Save to phone": call straight from the tap. */
  download(entry: DownloadableEntry): void;
  /** Toasts `message` for a failure (with "Log in again" when the PIN session is gone). */
  showError(err: unknown, message: string): void;
}

const NO_MOVES = { toStore: false, toMy: false };

export function useLiteDrive({ organizationId, editors, openInPanel, section, showMyFiles }: UseLiteDriveOptions): LiteDrive {
  const { t, locale } = useI18n();
  const { entries: allUploads, queue } = useDriveUploads();
  const data = useDriveData({ localUploadIds: queue.localItemIds() });
  const { actor, drive, tree, members } = data;
  // On /store the actor is the PIN operator, so a template signs with their name.
  const templateNames = useDocTemplateNames(data.memberNames, actor.memberId);
  const signedIn = useSignedInMember();
  const offline = useLiveSpacetimeConnection() === null;
  const { isInstalled: editorInstalled, ensureEditor } = editors;
  const loader = usePreviewLoader();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const surface = actor.surface === "store" ? "store" : "personal";
  const notPublished = drive.status === "not_published";
  const loading = !notPublished && (!data.isReady || drive.status === "checking");
  const staffTablet = actor.ceiling !== null;
  const { actingMemberId } = actor;

  const start = useCallback((): boolean => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }, []);
  const finish = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  const relogin = useMemo(() => (surface === "store" ? () => setCurrentOperator(null) : null), [surface]);
  const showError = useCallback(
    (err: unknown, message: string) => {
      if (relogin && isOperatorError(err)) {
        toast.error(t("drive.errors.operator"), { action: { label: t("device.lite.drive.relogin"), onClick: relogin } });
        return;
      }
      toast.error(message);
    },
    [relogin, t],
  );

  // The queue belongs to the tab: another operator's uploads (and their names) stay out of this person's list.
  const uploads = useMemo(
    () => allUploads.filter((entry) => entry.target.organizationId === organizationId && entry.target.actingMemberId === actingMemberId),
    [allUploads, organizationId, actingMemberId],
  );

  const activeIds = useMemo(() => new Set(members.filter((m) => m.active).map((m) => m.id)), [members]);
  const tabletId = canonicalMemberId(signedIn.memberId);
  const moveActor = useMemo(
    (): MoveActor => ({
      memberId: actor.memberId,
      orgAdmin: isOrgAdminRole(actor.role),
      canEditAll: actor.canEditAll,
      // On /store the module checks the tablet account as well as the operator.
      caller: actor.acting ? { memberId: tabletId, orgAdmin: isOrgAdminRole(signedIn.role) } : null,
      storeOnly: staffTablet,
      isActiveMember: (id: string) => activeIds.has(id),
    }),
    [actor.memberId, actor.role, actor.canEditAll, actor.acting, tabletId, signedIn.role, staffTablet, activeIds],
  );

  const ctx = useMemo((): ActionContext => ({ surface, section, offline }), [surface, section, offline]);

  const movesFor = useCallback(
    (entry: DriveEntry) => {
      if (entry.type === "virtual" || !entry.access.canMove) return NO_MOVES;
      const roots = moveRoots([entry], tree, moveActor);
      return { toStore: roots.store !== null, toMy: roots.my !== null };
    },
    [tree, moveActor],
  );

  const deps = useMemo(() => ({ actingMemberId, organizationId }), [actingMemberId, organizationId]);
  const runWrite = useCallback(
    async (write: DriveWrite, success: LiteSuccess, undo?: () => void): Promise<boolean> => {
      if (!start()) return false;
      try {
        const result = await runDriveWrite(write, deps);
        const copy = typeof success === "function" ? success(result) : success;
        announceWrite(result, { success: copy, action: undo ? { label: t("drive.home.undo"), onClick: undo } : undefined }, t);
        return result.done === result.total;
      } catch (err) {
        showError(err, t(driveWriteErrorKey(err)));
        return false;
      } finally {
        finish();
      }
    },
    [start, finish, deps, showError, t],
  );

  const create = useDriveCreate({
    tree,
    organizationId,
    actingMemberId,
    actorMemberId: actor.memberId,
    section,
    usage: drive.usage,
    queue,
    openUrl: openInPanel,
    showMyFiles,
    t,
    locale,
  });

  const createDocument = useCallback(
    (kind: DriveDocKind, target: DriveMoveTarget) => {
      ensureEditor(kind, "create", () => {
        if (!start()) return;
        withReducerTimeoutFrom((sent) => createDriveDoc(kind, docTargetOf(target, organizationId, actingMemberId), { t, locale, beforeCreate: sent }))
          .then((documentId) => openInPanel(documentFileHref({ id: documentId, fileType: kind }, { isNew: true }), "current"))
          .catch((err: unknown) => showError(err, docCreateErrorMessage(err, t, "drive.home.errors.createFailed")))
          .finally(finish);
      });
    },
    [ensureEditor, start, finish, organizationId, actingMemberId, t, locale, openInPanel, showError],
  );

  const createFromTemplate = useCallback(
    (templateId: StoreTemplateId, target: DriveMoveTarget) => {
      ensureEditor("doc", "create", () => {
        if (!start()) return;
        const docTarget = docTargetOf(target, organizationId, actingMemberId);
        withReducerTimeoutFrom((sent) => createDriveDocFromTemplate(templateId, docTarget, { t, locale, ...templateNames, beforeCreate: sent }))
          .then((documentId) => openInPanel(documentFileHref({ id: documentId, fileType: "doc" }, { isNew: true }), "current"))
          .catch((err: unknown) => showError(err, docCreateErrorMessage(err, t, "drive.home.errors.createFailed")))
          .finally(finish);
      });
    },
    [ensureEditor, start, finish, organizationId, actingMemberId, t, locale, templateNames, openInPanel, showError],
  );

  const openAs = useCallback(
    (entry: FileEntry, kind: DriveDocKind) => {
      ensureEditor(kind, "open", () => {
        if (!start()) return;
        const target = docTargetOf(openAsTargetOf(entry, tree, actor.memberId), organizationId, actingMemberId);
        const toastId = toast.loading(t("drive.preview.importing"));
        openFileAs(entry, kind, { loader, target, t, locale, openUrl: openInPanel })
          .catch((err: unknown) => showError(err, docCreateErrorMessage(err, t, DRIVE_IMPORT_FAILED_KEY)))
          .finally(() => {
            toast.dismiss(toastId);
            finish();
          });
      });
    },
    [ensureEditor, start, finish, tree, actor.memberId, organizationId, actingMemberId, loader, t, locale, openInPanel, showError],
  );

  const download = useCallback(
    (entry: DownloadableEntry) => {
      void startDownload([entry], { loader, env: readDownloadEnv(), zipName: fmt(t("drive.home.zipName"), { date: dateKey() }) }, t);
    },
    [loader, t],
  );

  const { uploadFiles } = create;
  return useMemo(
    (): LiteDrive => ({
      data, surface, organizationId, uploads, queue, offline, editorInstalled, ensureEditor, notPublished, loading, staffTablet, ctx, moveActor,
      loader, busy, relogin, movesFor, runWrite, createDocument, createFromTemplate, uploadFiles, openAs, download, showError,
    }),
    [
      data, surface, organizationId, uploads, queue, offline, editorInstalled, ensureEditor, notPublished, loading, staffTablet, ctx, moveActor,
      loader, busy, relogin, movesFor, runWrite, createDocument, createFromTemplate, uploadFiles, openAs, download, showError,
    ],
  );
}
