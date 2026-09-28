// Drive write wrappers: folders, moves, trash, stars, the management notice,
// uploads and new Docs / Sheets / Slides files placed in a Drive container.
//
// A sibling of lib/spacetimedb/actions.ts, which stays untouched: import these
// from "@/lib/spacetimedb/actions/drive" ("@/lib/spacetimedb/actions" still
// resolves to actions.ts, a file wins over a directory).
//
// Like the Docs block in actions.ts, calls go straight to the reducers and never
// through `mutationQueue`, whose FIFO replay would re-run a move or a trash long
// after the screen that asked for it is gone. Arguments are one object keyed by
// the generated camelCase names. Failures reject with the module's
// `[drive.<code>] …` / `[doc.<code>] …` / `[sheet.<code>] …` message, or with a
// DriveClientError: `not_connected` (no connection or no active store),
// `not_published` (the connected bindings lack the reducer), or a check this
// file makes before the round trip with the module's own rules. Screens turn any
// of them into copy with driveErrorKey (lib/drive/errors.ts).
//
// `actingMemberId` names the store tablet's PIN operator ('' = the caller); the
// module grants the lower of both members' rights and attributes the write to
// the operator. Reducers can't return values, so new ids are made here.

import { newDocumentId } from "@/lib/docs/ids";
import type { DocFileType, DocVisibility } from "@/lib/docs/types";
import { DriveClientError } from "@/lib/drive/errors";
import {
  cleanDriveName, DRIVE_MAX_BATCH, DRIVE_MAX_FILE_BYTES, DRIVE_MULTIPART_THRESHOLD_BYTES, driveBlobKey,
  driveThumbKeyFor, isBlockedDriveFile, resolveDriveMime,
} from "@/lib/drive/rules";
import { DRIVE_NOTICE_ID, type DriveSpace, type DriveSurface } from "@/lib/drive/types";
import { getActiveOrgId, getConnection } from "@/lib/spacetimedb/client";

/** Who acts ('' or absent = the caller; the store tablet passes its PIN operator) and in which store (default: the active one). */
export interface ActingOptions { actingMemberId?: string | null; organizationId?: string }
export interface DriveEntryIds { itemIds?: readonly string[]; documentIds?: readonly string[] }
/** A Drive container: a space and a folder in it ('' = its root). */
export interface DriveTarget {
  space: DriveSpace;
  parentId: string;
  /** Whose My files a root target is: '' or absent = the actor's own. */
  ownerMemberId?: string;
}

type ReducerCall = (args: Record<string, unknown>) => Promise<void>;
type ReducerFn = (this: unknown, args: Record<string, unknown>) => unknown;

/** Rounds emptyDriveTrash runs by default; each purges up to the module's DRIVE_SWEEP_MAX (500) rows. */
const EMPTY_TRASH_DEFAULT_ROUNDS = 20;
const EMPTY_TRASH_MAX_ROUNDS = 100;

/** The live connection's reducer `name`, or a DriveClientError. */
function driveReducer(name: string): ReducerCall {
  const connection = getConnection();
  if (!connection) throw new DriveClientError("not_connected");
  const reducers = connection.reducers as unknown as Record<string, unknown> | undefined;
  const reducer = reducers?.[name];
  if (typeof reducer !== "function") {
    throw new DriveClientError(
      "not_published",
      `[drive.not_published] Reducer "${name}" is not available. Publish the module and run \`spacetime generate\` to enable Drive.`,
    );
  }
  return async (args) => {
    await (reducer as ReducerFn).call(reducers, args);
  };
}

function organizationOf(opts: ActingOptions | undefined): string {
  const explicit = opts?.organizationId?.trim();
  if (explicit) return explicit;
  try {
    return getActiveOrgId();
  } catch {
    throw new DriveClientError("not_connected", "[drive.not_connected] No active store");
  }
}

function actingOf(opts: ActingOptions | undefined): string {
  return String(opts?.actingMemberId ?? "").trim();
}

/** Ids are lowercase uuids on the server. */
function idKey(id: string): string {
  return String(id ?? "").trim().toLowerCase();
}

/** A JSON id list for the module (deduplicated, lowercase). */
function idList(ids: readonly string[] | undefined): string[] {
  return [...new Set((ids ?? []).map(idKey).filter((id) => id !== ""))];
}

/** The two JSON lists a multi-entry reducer takes; `batch_too_large` over DRIVE_MAX_BATCH, null when empty. */
function entryLists(input: DriveEntryIds): { itemIds: string; documentIds: string } | null {
  const itemIds = idList(input.itemIds);
  const documentIds = idList(input.documentIds);
  if (itemIds.length + documentIds.length === 0) return null;
  if (itemIds.length + documentIds.length > DRIVE_MAX_BATCH) throw new DriveClientError("batch_too_large");
  return { itemIds: JSON.stringify(itemIds), documentIds: JSON.stringify(documentIds) };
}

function cleanNameOrThrow(name: string): string {
  const clean = cleanDriveName(name);
  if (clean === null) throw new DriveClientError("invalid_name");
  return clean;
}

/** u32 reducer args: finite, non-negative integers. */
function u32(value: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 0xffffffff) : 0;
}

// ── Folders, names, moves, stars ─────────────────────────────────────────────

/** Creates a folder and returns its id. */
export async function createDriveFolder(input: DriveTarget & { name: string; itemId?: string } & ActingOptions): Promise<string> {
  const call = driveReducer("createDriveFolder");
  const organizationId = organizationOf(input);
  const name = cleanNameOrThrow(input.name);
  const itemId = idKey(input.itemId ?? newDocumentId());
  await call({
    organizationId,
    itemId,
    space: input.space,
    parentId: idKey(input.parentId),
    ownerMemberId: input.ownerMemberId ?? "",
    name,
    actingMemberId: actingOf(input),
  });
  return itemId;
}

/** Renames a folder or an uploaded file (documents: renameDriveDocument). */
export async function renameDriveItem(itemId: string, name: string, opts?: ActingOptions): Promise<void> {
  const call = driveReducer("renameDriveItem");
  await call({ itemId: idKey(itemId), name: cleanNameOrThrow(name), actingMemberId: actingOf(opts) });
}

/** Moves items and documents into one container. No ids → no call. */
export async function moveDriveEntries(input: DriveEntryIds & DriveTarget & ActingOptions): Promise<void> {
  const call = driveReducer("moveDriveEntries");
  const organizationId = organizationOf(input);
  const lists = entryLists(input);
  if (!lists) return;
  await call({
    organizationId,
    ...lists,
    targetSpace: input.space,
    targetParentId: idKey(input.parentId),
    targetOwnerMemberId: input.ownerMemberId ?? "",
    actingMemberId: actingOf(input),
  });
}

/** Moves one document, resolved in its own store (no organizationId needed). */
export async function setDocumentFolder(documentId: string, target: DriveTarget, opts?: ActingOptions): Promise<void> {
  const call = driveReducer("setDocumentFolder");
  await call({
    documentId: idKey(documentId),
    space: target.space,
    folderId: idKey(target.parentId),
    ownerMemberId: target.ownerMemberId ?? "",
    actingMemberId: actingOf(opts),
  });
}

/** Stars or unstars a folder or file for the actor (documents keep toggleDocumentStar). */
export async function toggleDriveStar(itemId: string, opts?: ActingOptions): Promise<void> {
  const call = driveReducer("toggleDriveStar");
  await call({ itemId: idKey(itemId), actingMemberId: actingOf(opts) });
}

/** Records that the actor saw the management notice on this surface (idempotent). */
export async function acknowledgeDriveNotice(input: { surface: DriveSurface; notice?: string } & ActingOptions): Promise<void> {
  const call = driveReducer("acknowledgeDriveNotice");
  await call({
    organizationId: organizationOf(input),
    notice: input.notice ?? DRIVE_NOTICE_ID,
    surface: input.surface,
    actingMemberId: actingOf(input),
  });
}

/** Rebuilds the caller's own Drive admin and document reader index rows in the store (a self-heal; never grants more). */
export async function refreshMyDriveAccess(organizationId?: string): Promise<void> {
  const call = driveReducer("refreshMyDriveAccess");
  await call({ organizationId: organizationOf({ organizationId }) });
}

// ── Trash ────────────────────────────────────────────────────────────────────

async function entriesCall(name: string, input: DriveEntryIds & ActingOptions): Promise<void> {
  const call = driveReducer(name);
  const organizationId = organizationOf(input);
  const lists = entryLists(input);
  if (!lists) return;
  await call({ organizationId, ...lists, actingMemberId: actingOf(input) });
}

/** Trashes items (with their subtrees and the documents in them) and documents. */
export function trashDriveEntries(input: DriveEntryIds & ActingOptions): Promise<void> {
  return entriesCall("trashDriveEntries", input);
}

/** Restores trash roots; a missing or trashed parent puts them at the root of their space. */
export function restoreDriveEntries(input: DriveEntryIds & ActingOptions): Promise<void> {
  return entriesCall("restoreDriveEntries", input);
}

/** Deletes trash roots for good (uploaded bytes are queued for deletion). */
export function deleteDriveEntriesForever(input: DriveEntryIds & ActingOptions): Promise<void> {
  return entriesCall("deleteDriveEntriesForever", input);
}

/** Trashed Drive rows of the store in this client's cache; null when the cache holds neither table. */
function cachedTrashCount(organizationId: string): number | null {
  const db = getConnection()?.db as unknown as Record<string, { iter?: () => Iterable<unknown> } | undefined> | undefined;
  const count = (accessor: string, trashed: (row: Record<string, unknown>) => boolean): number | null => {
    const table = db?.[accessor];
    if (!table || typeof table.iter !== "function") return null;
    let n = 0;
    for (const raw of table.iter()) {
      const row = raw as Record<string, unknown>;
      if (row.organizationId === organizationId && trashed(row)) n++;
    }
    return n;
  };
  const items = count("driveItem", (row) => row.trashed === true);
  const docs = count("document", (row) => row.trashedAt != null);
  return items === null && docs === null ? null : (items ?? 0) + (docs ?? 0);
}

/**
 * Empties the actor's trash. One reducer call purges a bounded batch, so this repeats while the trashed rows this
 * client can see keep shrinking (rows someone else manages stay), up to `maxRounds` (default 20) calls.
 */
export async function emptyDriveTrash(opts?: ActingOptions & { maxRounds?: number }): Promise<void> {
  const call = driveReducer("emptyDriveTrash");
  const organizationId = organizationOf(opts);
  const actingMemberId = actingOf(opts);
  const requested = Math.trunc(Number(opts?.maxRounds ?? EMPTY_TRASH_DEFAULT_ROUNDS));
  const rounds = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), EMPTY_TRASH_MAX_ROUNDS) : 1;
  let before = cachedTrashCount(organizationId);
  for (let round = 0; round < rounds; round++) {
    await call({ organizationId, actingMemberId });
    // The reducer's row changes reach the cache before its promise resolves.
    const after = cachedTrashCount(organizationId);
    if (before === null || after === null || after === 0 || after >= before) return;
    before = after;
  }
}

// ── Uploads (lib/drive/upload.ts runs the transfer) ─────────────────────────

export interface BeganUpload { itemId: string; blobId: string; blobKey: string; thumbKey: string; mimeType: string; sizeBytes: number; multipart: boolean }

/**
 * Reserves a pending file row (quota, type, name and permission checks happen here) and returns the blob keys the
 * transfer may write. The key is computed with lib/drive/rules.ts; the module recomputes it and must agree.
 */
export async function beginDriveUpload(
  input: DriveTarget & { name: string; file: { type?: string; size: number }; itemId?: string; blobId?: string } & ActingOptions,
): Promise<BeganUpload> {
  const call = driveReducer("beginDriveUpload");
  const organizationId = organizationOf(input);
  const name = cleanNameOrThrow(input.name);
  const sizeBytes = Number(input.file.size);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new DriveClientError("invalid", "[drive.invalid] Empty files cannot be uploaded");
  if (sizeBytes > DRIVE_MAX_FILE_BYTES) throw new DriveClientError("too_large");
  const mimeType = resolveDriveMime(input.file, name);
  if (isBlockedDriveFile(name, mimeType)) throw new DriveClientError("blocked_type");
  const itemId = idKey(input.itemId ?? newDocumentId());
  const blobId = idKey(input.blobId ?? newDocumentId());
  const blobKey = driveBlobKey(organizationId, itemId, blobId, name);
  await call({
    organizationId,
    itemId,
    space: input.space,
    parentId: idKey(input.parentId),
    ownerMemberId: input.ownerMemberId ?? "",
    name,
    mimeType,
    sizeBytes: BigInt(sizeBytes),
    blobKey,
    actingMemberId: actingOf(input),
  });
  return {
    itemId,
    blobId,
    blobKey,
    thumbKey: driveThumbKeyFor(blobKey),
    mimeType,
    sizeBytes,
    multipart: sizeBytes >= DRIVE_MULTIPART_THRESHOLD_BYTES,
  };
}

/** Cancels a pending upload (a no-op once it finished or expired); its bytes, if any, are queued for deletion. */
export async function abortDriveUpload(itemId: string): Promise<void> {
  const call = driveReducer("abortDriveUpload");
  await call({ itemId: idKey(itemId) });
}

// ── Documents ────────────────────────────────────────────────────────────────

/**
 * Creates a Doc, Sheet or Slides file in a Drive container and returns its id. Visibility '' (default) takes the
 * space's own: private in My files, org_edit in Store. A Sheet needs its gzipped workbook as `initialState`.
 */
export async function createDriveDocument(
  input: {
    fileType: Exclude<DocFileType, "unknown">; space: DriveSpace; folderId: string; ownerMemberId?: string;
    visibility?: "" | DocVisibility; title?: string; templateId?: string; initialState?: Uint8Array | null;
    html?: string | null; plainText?: string | null; wordCount?: number; documentId?: string;
  } & ActingOptions,
): Promise<string> {
  const call = driveReducer("createDriveDocument");
  const organizationId = organizationOf(input);
  const documentId = idKey(input.documentId ?? newDocumentId());
  await call({
    organizationId,
    documentId,
    fileType: input.fileType,
    space: input.space,
    folderId: idKey(input.folderId),
    ownerMemberId: input.ownerMemberId ?? "",
    visibility: input.visibility ?? "",
    title: input.title ?? "",
    templateId: input.templateId ?? "",
    initialState: input.initialState && input.initialState.byteLength > 0 ? input.initialState : undefined,
    html: input.html ?? undefined,
    plainText: input.plainText ?? undefined,
    wordCount: input.wordCount === undefined || input.wordCount === null ? undefined : u32(input.wordCount),
    actingMemberId: actingOf(input),
  });
  return documentId;
}

/**
 * Renames a Doc, Sheet or Slides file for the actor, resolved in its own store (no organizationId needed). Acting,
 * both the operator and the tablet account need edit access; the rename is attributed to the operator. The module
 * cleans the title as renameDocument does.
 */
export async function renameDriveDocument(documentId: string, title: string, opts?: ActingOptions): Promise<void> {
  const call = driveReducer("renameDriveDocument");
  await call({ documentId: idKey(documentId), title: String(title ?? ""), actingMemberId: actingOf(opts) });
}

// ── Admin tooling ────────────────────────────────────────────────────────────

/** Platform admins only: rebuilds the Drive admin and document reader indexes of one store, or of every store ('' / absent). */
export async function backfillDriveAccessV1(organizationId?: string): Promise<void> {
  const call = driveReducer("backfillDriveAccessV1");
  await call({ organizationId: organizationId?.trim() ?? "" });
}
