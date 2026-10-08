"use client";

// Adding things on the Drive manager page (drive-ui §7.4, §8.1–§8.2): New ▸ Doc / Sheet / Slides
// and Docs templates (lib/drive/editors.ts createDriveDoc / createDriveDocFromTemplate), New ▸ Import a file
// (importIntoDrive: a picked .docx, .xlsx, .pptx, … becomes a new document; the file itself is not
// uploaded), each then opened in its editor, a missing editor plugin asked for first; and uploads from the
// pickers or a drop (files and whole folders: components/drive/upload/folder-upload.ts over the
// tab's upload queue). New folder is a dialog, owned by useDriveActions.
//
// A new document's create is timed from the moment its reducer is sent (withReducerTimeoutFrom), so
// a dropped connection can't leave the New button spinning. Uploads are checked before any request
// (preflightUploads: empty files, files over the size limit, a batch the store's storage can't
// hold); the server checks again. Something added from Shared, Recent or Starred lands in the root
// of My files, and a toast offers to show it there (announceCreatedAway).

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import type { DriveTree } from "@/components/drive/model/entries";
import { planFolderUpload, preflightUploads, type DroppedFile, type UploadRejection } from "@/components/drive/model/upload-plan";
import type { DriveDocKind, DriveMoveTarget, DriveSection } from "@/components/drive/model/types";
import type { NewMenuBusy } from "@/components/drive/toolbar/new-menu";
import { folderUploadMessages, uploadFolderTree } from "@/components/drive/upload/folder-upload";
import type { DocTemplateId } from "@/lib/docs/templates";
import {
  checkDriveImport,
  createDriveDoc,
  createDriveDocFromTemplate,
  DRIVE_IMPORT_FAILED_KEY,
  DriveEditorError,
  importIntoDrive,
} from "@/lib/drive/editors";
import { importTargetOf } from "@/lib/drive/file-kinds";
import { formatDriveBytes } from "@/lib/drive/format";
import { documentFileHref } from "@/lib/drive/hrefs";
import { DRIVE_MAX_FILE_BYTES } from "@/lib/drive/rules";
import type { DriveUsageView } from "@/lib/drive/types";
import type { DriveUploadQueue } from "@/lib/drive/upload-queue";
import { fmt } from "@/lib/i18n/fmt";
import { announceCreatedAway } from "./action-toasts";
import { driveWriteErrorKey, withReducerTimeoutFrom } from "./drive-writes";
import { docCreateErrorMessage, docTargetOf } from "./open-as";
import type { EditorGate } from "./use-editor-gate";

export interface UseDriveCreateOptions {
  tree: DriveTree;
  organizationId: string;
  /** The PIN operator on /store; '' on the manager page. */
  actingMemberId: string;
  /** The actor's own My-files owner id (a create there from another section toasts "Added to My files"). */
  actorMemberId: string | null;
  section: DriveSection;
  usage: DriveUsageView | null;
  /** Asks to download a missing editor plugin before anything is created; default: none. */
  ensureEditor?: EditorGate["ensureEditor"];
  queue: Pick<DriveUploadQueue, "enqueue">;
  openUrl: DocsOpenUrl;
  /** Shows My files (the "Show" of the "Added to My files" toast). */
  showMyFiles(): void;
  /** How long a new document's create may go unanswered once sent; default REDUCER_TIMEOUT_MS. */
  timeoutMs?: number;
  t: (key: string) => string;
  locale: string;
}

export interface DriveCreate {
  /** What is being created (the New button spins); null when idle. */
  creating: NewMenuBusy;
  createDocument(kind: DriveDocKind, target: DriveMoveTarget): void;
  /** A new Doc from one of the Docs templates (the names fill its placeholders). */
  createFromTemplate(
    templateId: Exclude<DocTemplateId, "blank">,
    target: DriveMoveTarget,
    names: { storeName: string | null; authorName: string | null },
  ): void;
  /**
   * A new Doc, Sheet or Slides file imported from a picked file (the kind follows its extension), then opened. The
   * importer's size and type rules are checked first; the picked file is not uploaded.
   */
  importFile(file: File, target: DriveMoveTarget): void;
  /** Uploads picked or dropped files (with their folder paths) into `target`. */
  uploadFiles(files: readonly DroppedFile[], target: DriveMoveTarget): void;
}

const dirKey = (dir: readonly string[]): string => JSON.stringify(dir);
const RUN_NOW: EditorGate["ensureEditor"] = (_kind, _mode, then) => then();

/** One toast per reason, naming the first file it refused. */
function announceRejections(rejected: readonly UploadRejection[], t: (key: string) => string, locale: string): void {
  const first = new Map<UploadRejection["reason"], UploadRejection>();
  for (const rejection of rejected) if (!first.has(rejection.reason)) first.set(rejection.reason, rejection);
  for (const [reason, rejection] of first) {
    if (reason === "quota") toast.error(t("drive.errors.quotaExceeded"));
    else if (reason === "empty") toast.error(fmt(t("drive.upload.empty"), { name: rejection.file.name }));
    else toast.error(fmt(t("drive.upload.tooLarge"), { name: rejection.file.name, max: formatDriveBytes(DRIVE_MAX_FILE_BYTES, locale) }));
  }
}

export function useDriveCreate(opts: UseDriveCreateOptions): DriveCreate {
  const { tree, organizationId, actingMemberId, actorMemberId, section, usage, queue, openUrl, showMyFiles, timeoutMs, t, locale } = opts;
  const ensureEditor = opts.ensureEditor ?? RUN_NOW;
  const [creating, setCreating] = useState<NewMenuBusy>(null);
  const creatingRef = useRef(false);

  /** Creates one document (after its editor plugin is there), then opens it in that editor. */
  const runCreate = useCallback(
    (kind: DriveDocKind, create: (beforeCreate: (withinMs?: number) => void) => Promise<string>, failedKey = "drive.home.errors.createFailed") => {
      ensureEditor(kind, "create", () => {
        if (creatingRef.current) return;
        creatingRef.current = true;
        setCreating(kind);
        withReducerTimeoutFrom(create, timeoutMs)
          .then((documentId) => {
            openUrl(documentFileHref({ id: documentId, fileType: kind }, { isNew: true }), "current");
          })
          .catch((err: unknown) => {
            toast.error(docCreateErrorMessage(err, t, failedKey));
          })
          .finally(() => {
            creatingRef.current = false;
            setCreating(null);
          });
      });
    },
    [ensureEditor, t, openUrl, timeoutMs],
  );

  const createDocument = useCallback(
    (kind: DriveDocKind, target: DriveMoveTarget) =>
      runCreate(kind, (start) => createDriveDoc(kind, docTargetOf(target, organizationId, actingMemberId), { t, locale, beforeCreate: start })),
    [runCreate, organizationId, actingMemberId, t, locale],
  );

  const createFromTemplate = useCallback(
    (templateId: Exclude<DocTemplateId, "blank">, target: DriveMoveTarget, names: { storeName: string | null; authorName: string | null }) =>
      runCreate("doc", (start) =>
        createDriveDocFromTemplate(templateId, docTargetOf(target, organizationId, actingMemberId), { t, locale, ...names, beforeCreate: start }),
      ),
    [runCreate, organizationId, actingMemberId, t, locale],
  );

  const importFile = useCallback(
    (file: File, target: DriveMoveTarget) => {
      const kind = importTargetOf(file.type, file.name);
      if (kind === null) {
        toast.error(t("docs.import.unsupported"));
        return;
      }
      const ctx = { t, locale };
      runCreate(
        kind,
        async (start) => {
          const problem = await checkDriveImport(kind, file, ctx);
          if (problem !== null) throw new DriveEditorError(problem, null);
          const into = docTargetOf(target, organizationId, actingMemberId);
          const { documentId, warnings } = await importIntoDrive(file, kind, into, { ...ctx, beforeCreate: start });
          if (warnings > 0) toast(t("drive.preview.importWarnings"));
          return documentId;
        },
        DRIVE_IMPORT_FAILED_KEY,
      );
    },
    [runCreate, organizationId, actingMemberId, t, locale],
  );

  const uploadFiles = useCallback(
    (files: readonly DroppedFile[], target: DriveMoveTarget) => {
      const plan = planFolderUpload(files);
      const { accepted, rejected } = preflightUploads(
        plan.uploads.map((upload) => upload.file),
        usage,
        usage?.quotaBytes ?? 0,
        DRIVE_MAX_FILE_BYTES,
      );
      announceRejections(rejected, t, locale);
      const keep = new Set(accepted);
      const uploads = plan.uploads.filter((upload) => keep.has(upload.file));
      // Only the folders something still goes into: a folder of refused files is not created.
      const needed = new Set<string>();
      for (const upload of uploads) for (let depth = 1; depth <= upload.dir.length; depth++) needed.add(dirKey(upload.dir.slice(0, depth)));
      const folders = plan.folders.filter((dir) => needed.has(dirKey(dir)));
      const trimmed = { ...plan, folders, uploads };
      if (uploads.length === 0) {
        for (const message of folderUploadMessages({ queued: [], createdFolderIds: [], reusedFolderIds: [], skipped: plan.skipped, failure: null }, t)) {
          toast.warning(message);
        }
        return;
      }
      uploadFolderTree(trimmed, target, { tree, actingMemberId, organizationId, queue, locale })
        .then((result) => {
          folderUploadMessages(result, t).forEach((message, index) => {
            if (index === 0 && result.failure) toast.error(message);
            else toast.warning(message);
          });
          if (result.queued.length > 0) announceCreatedAway(target, { section, actorMemberId, showMyFiles }, t);
        })
        .catch((err: unknown) => {
          toast.error(t(driveWriteErrorKey(err)));
        });
    },
    [usage, t, locale, tree, actingMemberId, organizationId, queue, section, actorMemberId, showMyFiles],
  );

  return useMemo(
    () => ({ creating, createDocument, createFromTemplate, importFile, uploadFiles }),
    [creating, createDocument, createFromTemplate, importFile, uploadFiles],
  );
}
