// Storage accounting beyond Blob uploads: what each document keeps in the module
// (document_size), the org's document and app-file totals (org_storage_usage),
// and the ONE quota every new Drive upload, app upload and new document is
// checked against (orgStorageTotal / assertOrgStorageRoom).
//
// Sizes are maintained at create, compaction, versions, sheet writes and purge —
// never on pushDocumentUpdate / pushSheetOps: a size-row write there would be
// broadcast on every keystroke batch. A document's size lags by at most one
// uncompacted log; the recompute reducer fixes any drift.
//
// Editing an existing document is never refused here: only new uploads and new
// documents (create / import / duplicate) call assertOrgStorageRoom.
//
// Runtime imports: only ./logic and ./document-file, which import nothing at
// runtime, so ./context and ./sheets may import this file without a cycle.

import type { DriveCtx, SenderErrorCtor } from './types';
import type { DriveDeps } from './context';
import { DRIVE_DEFAULT_QUOTA_BYTES } from './logic';
import { docFileTypeOf, type DocFileKind } from './document-file';

type Db = DriveCtx['db'];
export type OrgStorageUsageRow = NonNullable<ReturnType<Db['orgStorageUsage']['organizationId']['find']>>;
export type DocumentSizeRow = NonNullable<ReturnType<Db['documentSize']['documentId']['find']>>;

/** app_file.source values. */
export const APP_FILE_SOURCES: readonly string[] = [
  'chat', 'tasks', 'inventory', 'training', 'products', 'bugs', 'logo', 'avatar',
  'doc_image', 'sheet_image', 'slides_image', 'other',
];

/**
 * Sources whose files go to the private app_file_private, never the org-readable
 * app_file: chat and DM attachments (voice notes too) belong to a conversation,
 * and a per-file row readable by the whole org would reveal them (decision 2:
 * others' chat files show in totals only).
 */
export const PRIVATE_APP_FILE_SOURCES: readonly string[] = ['chat'];

/** Whether a file with this keyHash is recorded, in either ledger. */
export function appFileRecorded(ctx: DriveCtx, keyHash: string): boolean {
  return ctx.db.appFile.keyHash.find(keyHash) != null || ctx.db.appFilePrivate.keyHash.find(keyHash) != null;
}

/** Record one app file in the ledger its source belongs to (the caller checked appFileRecorded). */
export function insertAppFile(
  ctx: DriveCtx,
  row: { keyHash: string; organizationId: string; source: string; sizeBytes: bigint; mimeType: string },
): void {
  const full = { ...row, createdAt: ctx.timestamp };
  if (PRIVATE_APP_FILE_SOURCES.includes(row.source)) ctx.db.appFilePrivate.insert(full);
  else ctx.db.appFile.insert(full);
}

const nonNegative = (value: bigint): bigint => (value < 0n ? 0n : value);

/** UTF-8 byte length of `s` without encoding it (a lone surrogate counts 3, as TextEncoder writes U+FFFD). */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

// ─── UploadThing keys ────────────────────────────────────────────────────────
// lib/storage keeps an identical copy (parity test); change both together.

/** `https://<app>.ufs.sh/f/<key>`, `https://utfs.io/f/<key>`, or either host with `/a/<appId>/<key>`. */
const UPLOADTHING_URL_RE =
  /^https:\/\/(?:utfs\.io|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ufs\.sh)(?::443)?\/(?:f\/([^/?#\s]+)|a\/[^/?#\s]+\/([^/?#\s]+))(?:[?#]|$)/i;
/** URL candidates inside free text (JSON, HTML attributes). */
const URL_IN_TEXT_RE = /https:\/\/[^\s"'<>()\\]+/gi;

/** The UploadThing file key of a file URL (as written, not decoded), or null when it is not one. */
export function uploadThingKeyOf(url: string): string | null {
  const match = UPLOADTHING_URL_RE.exec(String(url ?? '').trim());
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

/** Every distinct UploadThing key referenced by a URL inside `text`, in order of first appearance. */
export function uploadThingKeysIn(text: string): string[] {
  const keys = new Set<string>();
  for (const candidate of String(text ?? '').match(URL_IN_TEXT_RE) ?? []) {
    const key = uploadThingKeyOf(candidate);
    if (key) keys.add(key);
  }
  return [...keys];
}

// ─── Quota ───────────────────────────────────────────────────────────────────

/** The org's quota: support's override (drive_usage.quotaBytesOverride) when set, else DRIVE_DEFAULT_QUOTA_BYTES. */
export function driveQuotaBytes(ctx: DriveCtx, organizationId: string): bigint {
  const override = ctx.db.driveUsage.organizationId.find(organizationId)?.quotaBytesOverride ?? 0n;
  return override > 0n ? override : DRIVE_DEFAULT_QUOTA_BYTES;
}

/**
 * Everything the org stores: Drive files (used + reserved for pending uploads),
 * spreadsheet content, Docs + Slides content and app files. Reads only; an org
 * with no rows yet stores 0.
 */
export function orgStorageTotal(ctx: DriveCtx, organizationId: string): bigint {
  const drive = ctx.db.driveUsage.organizationId.find(organizationId);
  const other = ctx.db.orgStorageUsage.organizationId.find(organizationId);
  return (drive ? drive.bytesUsed + drive.bytesReserved + drive.sheetBytes : 0n)
    + (other ? other.docBytes + other.appBytes : 0n)
    + appUploadHeldBytes(ctx, organizationId);
}

// ─── app_upload_hold ─────────────────────────────────────────────────────────

/** How long an allowed app upload holds its bytes: UploadThing's presigned URLs live an hour. */
export const APP_UPLOAD_HOLD_MICROS = 60n * 60n * 1_000_000n;

/** Bytes of the org's app uploads allowed and not yet recorded (lapsed holds excluded). */
export function appUploadHeldBytes(ctx: DriveCtx, organizationId: string): bigint {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  let held = 0n;
  for (const hold of ctx.db.appUploadHold.byOrganizationId.filter(organizationId)) {
    if (hold.expiresAt.microsSinceUnixEpoch > now) held += hold.bytes;
  }
  return held;
}

/** Hold `bytes` for an allowed app upload; drops the org's lapsed holds first. */
export function holdAppUploadBytes(
  ctx: DriveCtx, deps: Pick<DriveDeps, 'timestampFromMicros'>, organizationId: string, bytes: bigint,
): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const hold of [...ctx.db.appUploadHold.byOrganizationId.filter(organizationId)]) {
    if (hold.expiresAt.microsSinceUnixEpoch <= now) ctx.db.appUploadHold.delete(hold);
  }
  if (bytes <= 0n) return;
  const expiresAt = deps.timestampFromMicros(now + APP_UPLOAD_HOLD_MICROS);
  ctx.db.appUploadHold.insert({ id: 0n, organizationId, bytes, expiresAt });
}

/** A recorded file takes its bytes off the org's oldest holds (a hold emptied is deleted). */
export function releaseAppUploadHold(ctx: DriveCtx, organizationId: string, bytes: bigint): void {
  let left = bytes;
  const holds = [...ctx.db.appUploadHold.byOrganizationId.filter(organizationId)].sort((x, y) => (x.id < y.id ? -1 : 1));
  for (const hold of holds) {
    if (left <= 0n) return;
    if (hold.bytes <= left) {
      left -= hold.bytes;
      ctx.db.appUploadHold.delete(hold);
    } else {
      ctx.db.appUploadHold.id.update({ ...hold, bytes: hold.bytes - left });
      left = 0n;
    }
  }
}

/** Room for `extraBytes` more: false when the total is already at the quota, or would pass it. */
export function storageRoomFits(total: bigint, extraBytes: bigint, quota: bigint): boolean {
  return total < quota && total + extraBytes <= quota;
}

/** `[drive.quota_exceeded]` unless the org's total + extraBytes fits its quota (and the total is under it). */
export function assertOrgStorageRoom(
  ctx: DriveCtx, deps: { SenderError: typeof SenderErrorCtor }, organizationId: string, extraBytes: bigint,
): void {
  if (!storageRoomFits(orgStorageTotal(ctx, organizationId), extraBytes, driveQuotaBytes(ctx, organizationId))) {
    throw new deps.SenderError('[drive.quota_exceeded] This store is out of storage');
  }
}

// ─── org_storage_usage ───────────────────────────────────────────────────────

/** The org's org_storage_usage row, inserted with zeros on first use. */
export function orgStorageUsageRow(ctx: DriveCtx, organizationId: string): OrgStorageUsageRow {
  const existing = ctx.db.orgStorageUsage.organizationId.find(organizationId);
  if (existing) return existing;
  return ctx.db.orgStorageUsage.insert({
    organizationId, docBytes: 0n, docCount: 0, appBytes: 0n, appFileCount: 0, updatedAt: ctx.timestamp,
  });
}

export interface OrgStorageDelta { docBytes?: bigint; docs?: number; appBytes?: bigint; appFiles?: number }

/** Apply signed deltas; every counter floors at 0. A zero delta writes nothing (no broadcast). */
export function addOrgStorageUsage(ctx: DriveCtx, organizationId: string, delta: OrgStorageDelta): void {
  if (!delta.docBytes && !delta.docs && !delta.appBytes && !delta.appFiles) return;
  const usage = orgStorageUsageRow(ctx, organizationId);
  ctx.db.orgStorageUsage.organizationId.update({
    ...usage,
    docBytes: nonNegative(usage.docBytes + (delta.docBytes ?? 0n)),
    docCount: Math.max(0, usage.docCount + (delta.docs ?? 0)),
    appBytes: nonNegative(usage.appBytes + (delta.appBytes ?? 0n)),
    appFileCount: Math.max(0, usage.appFileCount + (delta.appFiles ?? 0)),
    updatedAt: ctx.timestamp,
  });
}

// ─── Document sizes ──────────────────────────────────────────────────────────

/** Bytes one document holds in the sheet tables: snapshot + update log (live) and version states. */
export function sheetBytesOfDocument(ctx: DriveCtx, documentId: string): { live: bigint; versions: bigint } {
  let live = BigInt(ctx.db.documentSnapshot.documentId.find(documentId)?.byteLength ?? 0);
  for (const row of ctx.db.documentUpdate.byDocumentId.filter(documentId)) live += BigInt(row.byteLength);
  let versions = 0n;
  for (const row of ctx.db.documentVersionState.byDocumentId.filter(documentId)) versions += BigInt(row.byteLength);
  return { live, versions };
}

/**
 * What one document keeps in the module, walked through existing indexes only:
 * documentLiveBytes + documentVersionBytes.
 */
export function documentStoredBytes(ctx: DriveCtx, documentId: string, fileType: DocFileKind): bigint {
  return documentLiveBytes(ctx, documentId, fileType) + documentVersionBytes(ctx, documentId);
}

/**
 * documentStoredBytes without the versions (what a copy takes): snapshot state
 * + its plain text and html (UTF-8; a sheet's html is always '') + Σ update log.
 * Reads one snapshot row and the log, never a version.
 */
export function documentLiveBytes(ctx: DriveCtx, documentId: string, fileType: DocFileKind): bigint {
  const snapshot = ctx.db.documentSnapshot.documentId.find(documentId);
  let total = BigInt(snapshot?.byteLength ?? 0) + BigInt(utf8ByteLength(snapshot?.plainText ?? ''));
  if (fileType !== 'sheet') total += BigInt(utf8ByteLength(snapshot?.html ?? ''));
  for (const row of ctx.db.documentUpdate.byDocumentId.filter(documentId)) total += BigInt(row.byteLength);
  return total;
}

/**
 * Σ version bytes from document_version.byteLength. A sheet version's state
 * lives in document_version_state and its document_version.state is empty, so
 * this reads no sheet state; a Docs / Slides version carries its state inline,
 * so this is the one walk that loads those — only when versions change and in
 * the recompute.
 */
function documentVersionBytes(ctx: DriveCtx, documentId: string): bigint {
  let total = 0n;
  for (const row of ctx.db.documentVersion.byDocumentId.filter(documentId)) total += BigInt(row.byteLength);
  return total;
}

/** What a new document's first snapshot adds (assertOrgStorageRoom's extra): state + html + plain text (UTF-8). */
export function documentInitialBytes(stateLength: number, html: string, plainText: string): bigint {
  return BigInt(stateLength) + BigInt(utf8ByteLength(html)) + BigInt(utf8ByteLength(plainText));
}

/** What a document_size row adds to org_storage_usage: Docs + Slides only (sheets are drive_usage.sheetBytes). */
function orgShareOf(row: { fileType: string; bytes: bigint } | null): { bytes: bigint; docs: number } {
  return row && row.fileType !== 'sheet' ? { bytes: row.bytes, docs: 1 } : { bytes: 0n, docs: 0 };
}

/**
 * Re-measure a document and store its document_size row (inserted on first
 * use), moving the org's docBytes / docCount by the difference. An unchanged
 * size writes nothing. Returns the new size.
 *
 * `keepVersions` (compaction, content reset: paths that never touch versions)
 * re-measures only the live part and keeps the row's versionBytes, so a
 * compaction never loads a version's state. Paths that add or delete versions
 * leave it off.
 */
export function refreshDocumentSize(
  ctx: DriveCtx, doc: { id: string; organizationId: string }, opts: { keepVersions?: boolean } = {},
): bigint {
  const { current, row } = writeDocumentSize(ctx, doc, opts.keepVersions === true);
  const bytes = row.bytes;
  if (current === row) return bytes;
  const before = orgShareOf(current);
  const after = orgShareOf(row);
  if (current && current.organizationId !== doc.organizationId) {
    addOrgStorageUsage(ctx, current.organizationId, { docBytes: -before.bytes, docs: -before.docs });
    addOrgStorageUsage(ctx, doc.organizationId, { docBytes: after.bytes, docs: after.docs });
  } else {
    addOrgStorageUsage(ctx, doc.organizationId, { docBytes: after.bytes - before.bytes, docs: after.docs - before.docs });
  }
  return bytes;
}

/**
 * Re-measure a document and upsert its document_size row, leaving the org
 * totals alone. `row === current` when nothing changed (nothing written).
 */
function writeDocumentSize(
  ctx: DriveCtx, doc: { id: string; organizationId: string }, keepVersions: boolean,
): { current: DocumentSizeRow | null; row: DocumentSizeRow } {
  const fileType = docFileTypeOf(ctx, doc.id);
  const current = ctx.db.documentSize.documentId.find(doc.id) ?? null;
  const versionBytes = keepVersions && current ? current.versionBytes : documentVersionBytes(ctx, doc.id);
  const bytes = documentLiveBytes(ctx, doc.id, fileType) + versionBytes;
  if (current && current.bytes === bytes && current.versionBytes === versionBytes && current.fileType === fileType
      && current.organizationId === doc.organizationId) {
    return { current, row: current };
  }
  const row = {
    documentId: doc.id, organizationId: doc.organizationId, fileType, bytes, versionBytes, updatedAt: ctx.timestamp,
  };
  if (current) ctx.db.documentSize.documentId.update(row);
  else ctx.db.documentSize.insert(row);
  return { current, row };
}

/** What the recompute found for one org. */
export interface OrgStorageRecount { docBytes: bigint; docCount: number; appBytes: bigint; appFileCount: number }

/**
 * Rebuild one org's sizes from the rows: document_size for every document of
 * the org (rows of vanished documents dropped), then org_storage_usage set to
 * the sums (Docs + Slides sizes and form text, app_file and app_file_private rows). Unchanged rows are not written.
 */
export function recomputeOrgStorage(ctx: DriveCtx, organizationId: string): OrgStorageRecount {
  const recount: OrgStorageRecount = { docBytes: 0n, docCount: 0, appBytes: 0n, appFileCount: 0 };
  for (const doc of [...ctx.db.document.byOrganizationId.filter(organizationId)]) {
    const share = orgShareOf(writeDocumentSize(ctx, doc, false).row);
    recount.docBytes += share.bytes;
    recount.docCount += share.docs;
  }
  // Forms (../forms/access.ts addFormStorage): definitions and stored answers are
  // module-resident text, counted in docBytes but never in docCount.
  for (const form of ctx.db.form.byOrganizationId.filter(organizationId)) recount.docBytes += BigInt(form.definitionBytes);
  for (const meta of ctx.db.formMeta.byOrganizationId.filter(organizationId)) recount.docBytes += meta.answerBytes;
  for (const row of [...ctx.db.documentSize.byOrganizationId.filter(organizationId)]) {
    const doc = ctx.db.document.id.find(row.documentId);
    if (!doc || doc.organizationId !== organizationId) ctx.db.documentSize.delete(row);
  }
  for (const files of [ctx.db.appFile, ctx.db.appFilePrivate]) {
    for (const file of files.byOrganizationId.filter(organizationId)) {
      recount.appBytes += file.sizeBytes;
      recount.appFileCount++;
    }
  }
  const usage = ctx.db.orgStorageUsage.organizationId.find(organizationId);
  if (usage && usage.docBytes === recount.docBytes && usage.docCount === recount.docCount
      && usage.appBytes === recount.appBytes && usage.appFileCount === recount.appFileCount) {
    return recount;
  }
  const row = { organizationId, ...recount, updatedAt: ctx.timestamp };
  if (usage) ctx.db.orgStorageUsage.organizationId.update(row);
  else if (recount.docCount > 0 || recount.docBytes > 0n || recount.appFileCount > 0) ctx.db.orgStorageUsage.insert(row);
  return recount;
}

/** Drop a document's document_size row (purge) and take its bytes off the org's totals. */
export function dropDocumentSize(ctx: DriveCtx, documentId: string): void {
  const current = ctx.db.documentSize.documentId.find(documentId);
  if (!current) return;
  ctx.db.documentSize.delete(current);
  const share = orgShareOf(current);
  addOrgStorageUsage(ctx, current.organizationId, { docBytes: -share.bytes, docs: -share.docs });
}
