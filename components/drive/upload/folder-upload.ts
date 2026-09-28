// Uploading a dropped or picked tree (a folder, or plain files) into one Drive container: the
// planned folders are created parents first, merging into same-named folders that already
// exist, then every file goes to the tab's upload queue under a name no sibling uses yet
// (drive-ui §5.6, §8.2).
//
// Merge rule: a planned folder whose name reads the same (sameName) as a visible, untrashed
// folder in the same container that the actor may add to is reused; anything else gets a new
// folder named with uniqueSiblingName, as do the files. The server does not enforce unique
// names, so a concurrent upload can still produce two of a name, which is harmless.
//
// Folders are created one reducer call at a time (a child needs its parent's row), each under
// withReducerTimeout and naming the actor. The walk stops at the first failure: folders already
// created stay, and no file is queued, so nothing lands half-sorted.

import { newDocumentId } from "@/lib/docs/ids";
import type { DriveUploadQueue } from "@/lib/drive/upload-queue";
import type { DriveUploadSource, DriveUploadTarget } from "@/lib/drive/upload";
import { fmt } from "@/lib/i18n/fmt";
import { createDriveFolder } from "@/lib/spacetimedb/actions/drive";
import { driveWriteErrorKey, withReducerTimeout } from "@/components/drive/actions/drive-writes";
import { containerKey, type DriveTree } from "@/components/drive/model/entries";
import { cleanEntryName, sameName, uniqueSiblingName } from "@/components/drive/model/names";
import { countKey } from "@/components/drive/model/plural";
import type { DriveMoveTarget } from "@/components/drive/model/types";
import type { FolderUploadPlan } from "@/components/drive/model/upload-plan";

export interface FolderUploadDeps {
  /** The visible entries, for the merge and the free names. */
  tree: DriveTree;
  /** The PIN operator on /store; '' elsewhere. */
  actingMemberId: string;
  /** The store (required by the upload queue's plans). */
  organizationId: string;
  queue: Pick<DriveUploadQueue, "enqueue">;
  locale?: string;
  /** Per folder call; default REDUCER_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface FolderUploadResult {
  /** Upload-queue keys of the files handed over, in plan order. */
  queued: string[];
  createdFolderIds: string[];
  reusedFolderIds: string[];
  /** Files the plan left out (unsafe path, a folder name the server refuses, nested too deep). */
  skipped: FolderUploadPlan["skipped"];
  /** The folder that could not be created (its path below the target) and why; null when every folder is there. */
  failure: { dir: string[]; error: unknown } | null;
}

interface CreatedFolder { name: string; id: string }

const dirKey = (dir: readonly string[]): string => JSON.stringify(dir);

function childContainer(parent: DriveMoveTarget, folderId: string): DriveMoveTarget {
  return { space: parent.space, ownerMemberId: parent.space === "my" ? parent.ownerMemberId : "", parentId: folderId };
}

/** Creates the plan's folders, then queues its files (see the file comment). Never rejects. */
export async function uploadFolderTree(plan: FolderUploadPlan, target: DriveMoveTarget, deps: FolderUploadDeps): Promise<FolderUploadResult> {
  const { tree, locale } = deps;
  const actingMemberId = String(deps.actingMemberId ?? "").trim();
  const organizationId = String(deps.organizationId ?? "").trim();
  const root: DriveMoveTarget = { ...target, ownerMemberId: target.space === "my" ? target.ownerMemberId : "" };
  const containers = new Map<string, DriveMoveTarget>([[dirKey([]), root]]);
  /** Folders made by this run, per container (the tree does not show them yet). */
  const created = new Map<string, CreatedFolder[]>();
  /** Names this run added to each container: new folders and queued files. */
  const addedNames = new Map<string, string[]>();
  const result: FolderUploadResult = { queued: [], createdFolderIds: [], reusedFolderIds: [], skipped: plan.skipped, failure: null };

  const siblingNames = (container: DriveMoveTarget): string[] => [
    ...tree.childrenOf(container).map((entry) => entry.name),
    ...(addedNames.get(containerKey(container)) ?? []),
  ];
  const addName = (container: DriveMoveTarget, name: string) => {
    const key = containerKey(container);
    addedNames.set(key, [...(addedNames.get(key) ?? []), name]);
  };

  for (const dir of plan.folders) {
    const parent = containers.get(dirKey(dir.slice(0, -1)));
    const name = dir[dir.length - 1] ?? "";
    if (!parent || name === "") {
      result.failure = { dir, error: new Error("Folder plan lists a child before its parent") };
      return result;
    }
    const existing = tree
      .childrenOf(parent)
      .find((entry) => entry.type === "folder" && entry.trashedAt === null && entry.access.canAddChildren && sameName(entry.name, name, locale));
    if (existing) {
      containers.set(dirKey(dir), childContainer(parent, existing.id));
      result.reusedFolderIds.push(existing.id);
      continue;
    }
    const madeHere = (created.get(containerKey(parent)) ?? []).find((folder) => sameName(folder.name, name, locale));
    if (madeHere) {
      containers.set(dirKey(dir), childContainer(parent, madeHere.id));
      continue;
    }
    const folderName = uniqueSiblingName(name, siblingNames(parent), locale);
    try {
      const id = await withReducerTimeout(
        createDriveFolder({
          organizationId,
          actingMemberId,
          space: parent.space,
          parentId: parent.parentId,
          ownerMemberId: parent.space === "my" ? parent.ownerMemberId : "",
          name: folderName,
          itemId: newDocumentId(),
        }),
        deps.timeoutMs,
      );
      const key = containerKey(parent);
      created.set(key, [...(created.get(key) ?? []), { name: folderName, id }]);
      addName(parent, folderName);
      containers.set(dirKey(dir), childContainer(parent, id));
      result.createdFolderIds.push(id);
    } catch (error) {
      result.failure = { dir, error };
      return result;
    }
  }

  // Files, grouped by container in plan order: one enqueue per container.
  const batches = new Map<string, { container: DriveMoveTarget; sources: DriveUploadSource[] }>();
  for (const upload of plan.uploads) {
    const container = containers.get(dirKey(upload.dir));
    if (!container) continue;
    const name = uniqueSiblingName(cleanEntryName(upload.file.name), siblingNames(container), locale);
    addName(container, name);
    const key = containerKey(container);
    const batch = batches.get(key) ?? { container, sources: [] };
    batch.sources.push({ file: upload.file, name });
    batches.set(key, batch);
  }
  for (const { container, sources } of batches.values()) {
    const uploadTarget: DriveUploadTarget = {
      organizationId,
      space: container.space,
      parentId: container.parentId,
      ownerMemberId: container.space === "my" ? container.ownerMemberId : "",
      actingMemberId,
    };
    result.queued.push(...deps.queue.enqueue(sources, uploadTarget));
  }
  return result;
}

/**
 * Toast copy for what an upload left out or stopped at, in the order to show it; [] when everything went through.
 * The failure line names the folder and adds the error's own copy.
 */
export function folderUploadMessages(result: FolderUploadResult, t: (key: string) => string): string[] {
  const out: string[] = [];
  if (result.failure) {
    const name = result.failure.dir[result.failure.dir.length - 1] ?? "";
    out.push(`${fmt(t("drive.upload.folderFailed"), { name })} ${t(driveWriteErrorKey(result.failure.error))}`);
  }
  const skipped = result.skipped.length;
  if (skipped > 0) out.push(fmt(t(countKey("drive.upload.skipped", skipped)), { count: skipped }));
  return out;
}
