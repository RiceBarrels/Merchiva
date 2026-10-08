// The storage calls the Drive UI makes outside the upload queue: one upload
// with its own progress, signed URLs for any number of files, and deleting
// items for good. Thin adapters over upload.ts, url-loader.ts and the Drive
// write wrappers.

import { DriveClientError } from "@/lib/drive/errors";
import { DRIVE_MAX_BATCH } from "@/lib/drive/rules";
import type { DriveSpace } from "@/lib/drive/types";
import { planDriveUpload, sharedDriveUploadTransport, uploadDriveFile, type DriveUploadPlan } from "@/lib/drive/upload";
import { invalidateSharedDriveUrls, sharedDriveUrlLoader } from "@/lib/drive/url-loader";
import { deleteDriveEntriesForever } from "@/lib/spacetimedb/actions/drive";

export interface DriveUploadInput {
  organizationId: string;
  file: File;
  name: string;
  space: DriveSpace;
  /** '' = the root of the space. */
  parentId: string;
  /** Whose My files a root target is ('' or absent = the actor's own). */
  ownerMemberId?: string;
  /** The PIN operator on /store, '' elsewhere. */
  actingMemberId: string;
}
export interface DriveUploadHandle {
  /** The new item's id, known before any request; '' when the file cannot be uploaded (`done` says why). */
  itemId: string;
  /** Resolves once the file is ready; rejects with a DriveClientError (`aborted` after abort()). */
  done: Promise<void>;
  abort(): void;
}

/** One file, outside the queue. There is no retry, so a failed upload releases its pending row at once. */
export function startDriveUpload(
  input: DriveUploadInput,
  opts: { onProgress(loaded: number, total: number): void },
): DriveUploadHandle {
  const controller = new AbortController();
  const target = {
    organizationId: input.organizationId,
    space: input.space,
    parentId: input.parentId,
    ownerMemberId: input.ownerMemberId,
    actingMemberId: input.actingMemberId,
  };
  const source = { file: input.file, name: input.name };
  let plan: DriveUploadPlan;
  try {
    plan = planDriveUpload(source, target);
  } catch (err) {
    const failed = Promise.reject(err instanceof Error ? err : new DriveClientError("invalid"));
    // The caller learns of it through `done`; don't report it as unhandled before they attach a handler.
    failed.catch(() => undefined);
    return { itemId: "", done: failed, abort: () => undefined };
  }
  const done = uploadDriveFile(source, target, {
    transport: sharedDriveUploadTransport(),
    signal: controller.signal,
    plan,
    onProgress: (progress) => opts.onProgress(progress.loaded, progress.total),
  }).then(() => undefined);
  done.catch(() => undefined);
  return { itemId: plan.itemId, done, abort: () => controller.abort() };
}

/**
 * Signed URLs of the originals, any number of ids (the loader batches them ≤ 50 per request). Ids without a URL
 * (not ready, hidden, unknown) are left out. `actingMemberId` narrows them to what the /store operator may read.
 */
export async function fetchDriveUrls(
  itemIds: readonly string[],
  opts: { download?: boolean; actingMemberId?: string | null } = {},
): Promise<Record<string, { url: string; expiresAt: number }>> {
  const purpose = opts.download ? "download" : "view";
  const ids = [...new Set(itemIds.map((id) => String(id ?? "").trim().toLowerCase()).filter((id) => id !== ""))];
  const loader = sharedDriveUrlLoader(opts.actingMemberId);
  const results = await loader.getMany(ids.map((id) => ({ id, variant: "original" as const, purpose })));
  const out: Record<string, { url: string; expiresAt: number }> = {};
  ids.forEach((id, index) => {
    const signed = results[index];
    if (signed) out[id] = { url: signed.url, expiresAt: signed.expiresAt };
  });
  return out;
}

/**
 * Deletes items for good (in batches the module accepts); their bytes are removed by the GC cron. Cached signed
 * URLs of the items are dropped.
 */
export async function deleteDriveItemsForever(itemIds: readonly string[], actingMemberId: string): Promise<void> {
  const ids = [...new Set(itemIds.map((id) => String(id ?? "").trim().toLowerCase()).filter((id) => id !== ""))];
  try {
    for (let i = 0; i < ids.length; i += DRIVE_MAX_BATCH) {
      await deleteDriveEntriesForever({ itemIds: ids.slice(i, i + DRIVE_MAX_BATCH), actingMemberId });
    }
  } finally {
    invalidateSharedDriveUrls(ids);
  }
}
