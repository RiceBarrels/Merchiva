// Drive writes shared by the manager page (actions/use-drive-actions.ts) and the device lite
// app: rename, move, trash / restore / delete forever, star and new folder. No React.
//
// Every Drive reducer call names the store and the actor (`actingMemberId`: the PIN operator on
// /store, '' elsewhere; the module grants the lower of both members' rights and attributes the
// write to the operator), and runs under withReducerTimeout: a dropped socket can leave a
// reducer promise pending forever, so after REDUCER_TIMEOUT_MS the write rejects with `network`.
// The reducer may still land later; the subscription then shows it.
//
// Documents move, go to the trash, come back, are renamed and are deleted through Drive reducers
// that name the actor, like folders and files (moves and trash also cascade into folders,
// data-server §6.3). A document rename goes through renameDriveDocument: acting on /store, the
// module requires edit access for both the operator and the tablet account and records the
// operator as the editor. Document stars keep the Docs reducer, which takes no acting member: a
// document star belongs to the signed-in account, so it is refused while acting for an operator
// (the menus never offer it).
//
// The module takes at most DRIVE_MAX_BATCH ids per call, so larger selections go out as
// sequential calls. The first call that fails stops the run: nothing landed → the promise
// rejects with that error; some batches landed → it resolves with `done < total` and `error`
// (copy: drive.home.bulkPartial).

import { newDocumentId } from "@/lib/docs/ids";
import { DRIVE_GENERIC_ERROR_KEY, DriveClientError, type DriveClientErrorCode } from "@/lib/drive/errors";
import { DRIVE_MAX_BATCH } from "@/lib/drive/rules";
import { invalidateSharedDriveUrls } from "@/lib/drive/url-loader";
import { toggleDocumentStar } from "@/lib/spacetimedb/actions";
import {
  createDriveFolder, deleteDriveEntriesForever, moveDriveEntries, renameDriveDocument, renameDriveItem, restoreDriveEntries,
  toggleDriveStar, trashDriveEntries, type ActingOptions,
} from "@/lib/spacetimedb/actions/drive";
import { driveErrorToastKey } from "@/components/drive/model/errors";
import type { MoveBlockReason, MovePlan } from "@/components/drive/model/move";
import type { DocEntry, DriveEntry, DriveMoveTarget, FileEntry, FolderEntry } from "@/components/drive/model/types";

/** How long one reducer call may stay unanswered before the write counts as failed. */
export const REDUCER_TIMEOUT_MS = 15_000;

/** A write that got no answer in time. Code `network` (drive.errors.offline); driveWriteErrorKey gives it its own copy. */
export class DriveWriteTimeoutError extends DriveClientError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super("network", `[drive.network] No answer after ${timeoutMs} ms`);
    this.name = "DriveWriteTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * `p`, or a DriveWriteTimeoutError (code `network`) when it has not settled after `ms` (default REDUCER_TIMEOUT_MS).
 * A late settlement of `p` is swallowed, so it never surfaces as an unhandled rejection.
 */
export function withReducerTimeout<T>(p: Promise<T>, ms: number = REDUCER_TIMEOUT_MS): Promise<T> {
  const limit = Number.isFinite(ms) && ms > 0 ? ms : REDUCER_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DriveWriteTimeoutError(limit)), limit);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * withReducerTimeout for a call that does work of its own before its reducer goes out (a document built or a file
 * parsed): `run(start)` calls `start()` right before it sends the reducer, and the `ms` limit runs from there. A step
 * that can't say when it sends calls `start(withinMs)` up front instead, with the longest its own (bounded) work may
 * take, which is added to the limit. Nothing times out while `start` is not called; a late settlement is swallowed.
 */
export function withReducerTimeoutFrom<T>(run: (start: (withinMs?: number) => void) => Promise<T>, ms: number = REDUCER_TIMEOUT_MS): Promise<T> {
  const limit = Number.isFinite(ms) && ms > 0 ? ms : REDUCER_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle();
    };
    const start = (withinMs = 0) => {
      if (settled || timer !== undefined) return;
      const total = limit + (Number.isFinite(withinMs) && withinMs > 0 ? withinMs : 0);
      timer = setTimeout(() => finish(() => reject(new DriveWriteTimeoutError(total))), total);
    };
    let work: Promise<T>;
    try {
      work = run(start);
    } catch (err) {
      work = Promise.reject(err);
    }
    work.then(
      (value) => finish(() => resolve(value)),
      (err: unknown) => finish(() => reject(err)),
    );
  });
}

/** i18n key for a failed write: the "no answer" copy for a timeout, else the error's own key (or `fallback`). */
export function driveWriteErrorKey(err: unknown, fallback: string = DRIVE_GENERIC_ERROR_KEY): string {
  return err instanceof DriveWriteTimeoutError ? "drive.home.errors.timeout" : driveErrorToastKey(err, fallback);
}

export interface DriveWriteDeps {
  /** The PIN operator on /store; '' elsewhere. */
  actingMemberId: string;
  /** The store the entries belong to ('' = the active store). */
  organizationId: string;
  /** Per reducer call; default REDUCER_TIMEOUT_MS. */
  timeoutMs?: number;
}

export type DriveWrite =
  | { kind: "rename"; entry: DriveEntry; name: string }
  | { kind: "move"; plan: MovePlan }
  | { kind: "trash" | "restore" | "deleteForever"; entries: readonly DriveEntry[] }
  | { kind: "star"; entry: FolderEntry | FileEntry | DocEntry }
  /** `itemId`: the new folder's id when the caller needs it before the call lands (default: a new uuid). */
  | { kind: "newFolder"; target: DriveMoveTarget; name: string; itemId?: string };

export interface DriveWriteResult {
  /** Entries whose call landed (a batch counts once its call resolved). */
  done: number;
  total: number;
  /** newFolder: the new folder's id. */
  createdId?: string;
  /** Some batches landed and a later one failed: that failure (the rest were not sent). */
  error?: unknown;
}

/** What a blocked move plan would have failed with on the server; null = nothing to do. */
const MOVE_BLOCK_CODE: Readonly<Record<MoveBlockReason, DriveClientErrorCode | null>> = {
  virtual: "invalid",
  noPermission: "forbidden",
  notReady: "invalid",
  intoSelf: "cycle",
  intoDescendant: "cycle",
  mixedOwners: "forbidden",
  descendantOwners: "forbidden",
  spaceNotAllowed: "space_mismatch",
  targetNotWritable: "forbidden",
  targetTrashed: "trashed",
  tooDeep: "too_deep",
  sameLocation: null,
};

interface EntryRef { kind: "item" | "doc"; id: string }

const isItemEntry = (entry: DriveEntry): entry is FolderEntry | FileEntry => entry.type === "folder" || entry.type === "file";

/** Folders and files → item ids, Docs / Sheets / Slides → document ids; virtual entries are not Drive rows. Deduplicated. */
function entryRefs(entries: readonly DriveEntry[]): EntryRef[] {
  const seen = new Set<string>();
  const refs: EntryRef[] = [];
  for (const entry of entries) {
    if (entry.type === "virtual") continue;
    const ref: EntryRef = { kind: isItemEntry(entry) ? "item" : "doc", id: entry.id };
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

function planRefs(plan: MovePlan): EntryRef[] {
  const items = [...new Set(plan.itemIds)].map((id): EntryRef => ({ kind: "item", id }));
  const docs = [...new Set(plan.documentIds)].map((id): EntryRef => ({ kind: "doc", id }));
  return [...items, ...docs];
}

function idsOf(batch: readonly EntryRef[]): { itemIds: string[]; documentIds: string[] } {
  return {
    itemIds: batch.filter((ref) => ref.kind === "item").map((ref) => ref.id),
    documentIds: batch.filter((ref) => ref.kind === "doc").map((ref) => ref.id),
  };
}

/** One call per DRIVE_MAX_BATCH refs, in order; stops at the first failure (see the file comment). */
async function runBatches(
  refs: readonly EntryRef[],
  call: (ids: { itemIds: string[]; documentIds: string[] }) => Promise<void>,
  timeoutMs: number | undefined,
  onLanded?: (ids: { itemIds: string[]; documentIds: string[] }) => void,
): Promise<DriveWriteResult> {
  const total = refs.length;
  let done = 0;
  for (let start = 0; start < total; start += DRIVE_MAX_BATCH) {
    const batch = refs.slice(start, start + DRIVE_MAX_BATCH);
    const ids = idsOf(batch);
    try {
      await withReducerTimeout(call(ids), timeoutMs);
    } catch (err) {
      if (done === 0) throw err;
      return { done, total, error: err };
    }
    done += batch.length;
    onLanded?.(ids);
  }
  return { done, total };
}

/** The ActingOptions every Drive reducer call carries. */
function actingOf(deps: DriveWriteDeps): { actingMemberId: string; organizationId: string } & ActingOptions {
  return { actingMemberId: String(deps.actingMemberId ?? "").trim(), organizationId: String(deps.organizationId ?? "").trim() };
}

/** Runs one write for the actor (see the file comment). Rejects with the first failure when nothing landed. */
export async function runDriveWrite(write: DriveWrite, deps: DriveWriteDeps): Promise<DriveWriteResult> {
  const acting = actingOf(deps);
  const timed = <T,>(p: Promise<T>) => withReducerTimeout(p, deps.timeoutMs);

  switch (write.kind) {
    case "rename": {
      const { entry } = write;
      if (entry.type === "virtual") throw new DriveClientError("invalid", "[drive.invalid] Files kept by other apps can't be renamed here");
      if (isItemEntry(entry)) await timed(renameDriveItem(entry.id, write.name, acting));
      else await timed(renameDriveDocument(entry.id, write.name, acting));
      return { done: 1, total: 1 };
    }

    case "star": {
      const { entry } = write;
      if (isItemEntry(entry)) {
        await timed(toggleDriveStar(entry.id, acting));
      } else {
        // toggleDocumentStar stars for the signed-in account, which on /store is the tablet, not the operator.
        if (acting.actingMemberId !== "") {
          throw new DriveClientError("forbidden", "[drive.forbidden] Document stars are not available while acting for another member");
        }
        await timed(toggleDocumentStar(entry.id));
      }
      return { done: 1, total: 1 };
    }

    case "newFolder": {
      const { target } = write;
      const createdId = await timed(
        createDriveFolder({
          ...acting,
          space: target.space,
          parentId: target.parentId,
          ownerMemberId: target.space === "my" ? target.ownerMemberId : "",
          name: write.name,
          itemId: write.itemId ?? newDocumentId(),
        }),
      );
      return { done: 1, total: 1, createdId };
    }

    case "move": {
      const { plan } = write;
      if (plan.blocked !== null) {
        const code = MOVE_BLOCK_CODE[plan.blocked];
        if (code === null) return { done: 0, total: 0 };
        throw new DriveClientError(code, `[drive.${code}] Move not allowed (${plan.blocked})`);
      }
      const { target } = plan;
      return runBatches(
        planRefs(plan),
        (ids) =>
          moveDriveEntries({
            ...acting,
            ...ids,
            space: target.space,
            parentId: target.parentId,
            ownerMemberId: target.space === "my" ? target.ownerMemberId : "",
          }),
        deps.timeoutMs,
      );
    }

    case "trash":
    case "restore":
    case "deleteForever": {
      const call = write.kind === "trash" ? trashDriveEntries : write.kind === "restore" ? restoreDriveEntries : deleteDriveEntriesForever;
      // Deleted bytes are gone: drop any signed URL this tab still caches for them.
      const onLanded = write.kind === "deleteForever" ? (ids: { itemIds: string[] }) => invalidateSharedDriveUrls(ids.itemIds) : undefined;
      return runBatches(entryRefs(write.entries), (ids) => call({ ...acting, ...ids }), deps.timeoutMs, onLanded);
    }
  }
}
