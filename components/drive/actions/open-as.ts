// "Open as Doc / Sheet / Slides" of an uploaded file on the Drive manager page (drive-ui §7.7): the
// file's bytes are fetched through a signed URL and imported into a NEW document by
// lib/drive/editors.ts; the original stays where it is. No React.
//
// The copy lands next to the original when the person may add files there (their own My files, or
// Store); a file in someone else's My files, or in a folder they can't add to, opens into the root of
// their own My files. The importer's size and type rules are checked before any byte is fetched.
// The create's reply is timed from the moment it is sent (withReducerTimeoutFrom): a dropped connection
// would otherwise leave the import, its loading toast and the entry's busy state pending forever.

import { toast } from "sonner";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import { folderContainer, type DriveTree } from "@/components/drive/model/entries";
import type { DriveMoveTarget, FileEntry } from "@/components/drive/model/types";
import { fetchDriveItemBytes } from "@/lib/drive/download";
import { checkDriveImport, DriveEditorError, driveEditorErrorMessage, importIntoDrive, type DriveDocKind } from "@/lib/drive/editors";
import { documentFileHref } from "@/lib/drive/hrefs";
import type { DriveDocTarget } from "@/lib/drive/types";
import type { DriveUrlLoader } from "@/lib/drive/url-loader";
import { driveWriteErrorKey, DriveWriteTimeoutError, withReducerTimeoutFrom } from "./drive-writes";

/** Copy for a failed New ▸ Doc / Sheet / Slides or "Open as …": "no answer" for a create that timed out, else the editors' own. */
export function docCreateErrorMessage(err: unknown, t: (key: string) => string, fallbackKey: string): string {
  return err instanceof DriveWriteTimeoutError ? t(driveWriteErrorKey(err)) : driveEditorErrorMessage(err, t, fallbackKey);
}

/** Where a new document goes, for createDriveDoc / importIntoDrive. */
export function docTargetOf(target: DriveMoveTarget, organizationId: string, actingMemberId: string): DriveDocTarget {
  return {
    organizationId,
    space: target.space,
    folderId: target.parentId,
    ownerMemberId: target.space === "my" ? target.ownerMemberId : "",
    actingMemberId,
  };
}

/** The container an "Open as …" copy of `entry` goes to (see the file comment). */
export function openAsTargetOf(entry: FileEntry, tree: Pick<DriveTree, "folders" | "hasTrashedAncestor">, actorMemberId: string | null): DriveMoveTarget {
  const mine: DriveMoveTarget = { space: "my", parentId: "", ownerMemberId: actorMemberId ?? "" };
  const location = entry.location;
  if (!location) return mine;
  if (location.space === "my" && location.ownerMemberId !== actorMemberId) return mine;
  if (location.parentId === "") return { space: location.space, parentId: "", ownerMemberId: location.space === "my" ? location.ownerMemberId : "" };
  const folder = tree.folders.get(location.parentId);
  if (!folder || !folder.access.canAddChildren || tree.hasTrashedAncestor(folder)) return mine;
  return folderContainer(folder);
}

export interface OpenAsDeps {
  loader: DriveUrlLoader;
  target: DriveDocTarget;
  t: (key: string) => string;
  locale: string;
  openUrl: DocsOpenUrl;
  /** How long the create may go unanswered once sent; default REDUCER_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Imports `entry` as a new `kind` document and opens it. Rejects with a DriveEditorError, a DriveWriteTimeoutError
 * (docCreateErrorMessage has the copy of both) or a Drive download error.
 */
export async function openFileAs(entry: FileEntry, kind: DriveDocKind, deps: OpenAsDeps): Promise<void> {
  const ctx = { t: deps.t, locale: deps.locale };
  const problem = await checkDriveImport(kind, { name: entry.name, size: entry.sizeBytes, type: entry.mimeType }, ctx);
  if (problem !== null) throw new DriveEditorError(problem, null);
  const bytes = await fetchDriveItemBytes({ id: entry.id, name: entry.name, sizeBytes: entry.sizeBytes, mimeType: entry.mimeType }, deps.loader);
  const file = new File([bytes], entry.name, { type: entry.mimeType });
  const { documentId, warnings } = await withReducerTimeoutFrom(
    (start) => importIntoDrive(file, kind, deps.target, { ...ctx, driveItemId: entry.id, beforeCreate: start }),
    deps.timeoutMs,
  );
  if (warnings > 0) toast(deps.t("drive.preview.importWarnings"));
  deps.openUrl(documentFileHref({ id: documentId, fileType: kind }, { isNew: true }), "current");
}
