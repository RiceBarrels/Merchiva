// Drive uploads (DS §6.3 "Uploads", §6.4; storage-api §3 as adopted by CONTRACTS
// C9–C11, C13, C44). index.ts wires them:
// `export const { … } = defineDriveUploadReducers(spacetimedb, driveDeps)`.
//
// Life of an uploaded file:
//   beginDriveUpload     member, over the WebSocket: a 'pending' row that reserves
//                        its declared bytes. The client computes the blob key and
//                        the module recomputes it (C11).
//   authorizeDriveUpload /api/drive/upload, with the USER's token, before it signs
//                        one PUT: counts the attempt and moves the pending
//                        deadline to now + DRIVE_UPLOAD_TTL_MICROS.
//   serviceCommit…       the commit route, the Blob webhook or the GC cron's
//                        'verify' job, with the HEAD size: 'ready'.
// A row that never commits is queued for a 'verify' by the sweep (service.ts).
// The module holds no Blob credentials: every blob removal is a drive_blob_gc
// row the cron drains, and a key once queued there is never used again.

import type { DriveCtx, DriveItemRow, DriveSchema } from './types';
import { driveAdminScopeOf } from './access-index';
import {
  addDriveUsage, assertDriveItemRole, callerDriveMember, deleteItemRow, driveError, driveNewRowOwner, queueDriveBlob,
  releaseDriveReservation, reserveDriveBytes, resolveContainer, resolveDriveActor, type DriveDeps,
} from './context';
import {
  DRIVE_ETAG_MAX, DRIVE_GC_HOLD_SLACK_MICROS, DRIVE_MAX_FILE_BYTES, DRIVE_MAX_ITEMS_PER_ORG,
  DRIVE_MAX_PENDING_PER_UPLOADER, DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES, DRIVE_THUMB_MAX_BYTES, DRIVE_THUMB_TYPES,
  DRIVE_UPLOAD_MAX_ATTEMPTS, DRIVE_UPLOAD_TTL_MICROS, cleanDriveName, driveBlobKey, driveThumbKeyFor,
  isBlockedDriveFile, normalizeDriveMime, parseDriveBlobKey,
} from './logic';

/** Reasons serviceFailDriveUpload records; anything else becomes 'rejected'. */
const DRIVE_FAIL_REASONS: readonly string[] = ['upload_expired', 'rejected'];

/** Service-only reducers: the registered service identity (deps.isServiceCaller reads service_identity). */
export function assertDriveService(ctx: DriveCtx, deps: DriveDeps): void {
  if (!deps.isServiceCaller(ctx)) throw driveError(deps, 'forbidden', 'Service identity required');
}

/** The pending uploads ctx.sender holds, in every organization: their number and declared bytes (C44). */
function pendingUploadsOfSender(ctx: DriveCtx): { count: number; bytes: bigint } {
  let count = 0;
  let bytes = 0n;
  for (const row of ctx.db.driveItem.byUploaderIdentity.filter(ctx.sender)) {
    if (row.kind !== 'file' || row.status !== 'pending') continue;
    count++;
    bytes += row.sizeBytes;
  }
  return { count, bytes };
}

/**
 * deleteItemRow for a pending upload. When the sweep had queued a 'verify' job
 * for its key, the GC cron may be mid-run: it HEADs the key, commits or fails
 * it, then acks the key. The 'delete' job that replaces the verify is held for
 * at least DRIVE_GC_HOLD_SLACK_MICROS more, so that ack keeps it for the next
 * run instead of dropping a blob nobody deleted. Also the end of a 'verify' job
 * that runs out of attempts (service.ts serviceFailDriveBlobGc).
 */
export function deletePendingUpload(ctx: DriveCtx, deps: DriveDeps, item: DriveItemRow, reason: string): void {
  const hadVerify = ctx.db.driveBlobGc.blobKey.find(item.blobKey)?.action === 'verify';
  deleteItemRow(ctx, deps, item, reason);
  if (!hadVerify) return;
  const holdUntil = deps.timestampFromMicros(deps.timestampMicros(ctx.timestamp) + DRIVE_GC_HOLD_SLACK_MICROS);
  for (const blobKey of new Set([item.blobKey, item.thumbKey || driveThumbKeyFor(item.blobKey)])) {
    if (blobKey !== '') {
      queueDriveBlob(ctx, { blobKey, organizationId: item.organizationId, itemId: item.id, action: 'delete', reason, holdUntil });
    }
  }
}

/** A drive_item file row by id (any case), else `[drive.not_found]`. */
function uploadRow(ctx: DriveCtx, deps: DriveDeps, itemId: string): DriveItemRow {
  const item = ctx.db.driveItem.id.find(String(itemId ?? '').toLowerCase());
  if (!item || item.kind !== 'file') throw driveError(deps, 'not_found', 'Upload not found');
  return item;
}

export function defineDriveUploadReducers(spacetimedb: DriveSchema, deps: DriveDeps) {
  const { t } = deps;

  /**
   * A pending file row that reserves its declared bytes. The client generates
   * the item id and the blob key (reducers can't return values); the key must
   * equal driveBlobKey(org, itemId, blobId, cleaned name). A repeat of the same
   * call by the same identity is a lost-response replay and changes nothing.
   */
  const beginDriveUpload = spacetimedb.reducer(
    {
      organizationId: t.string(), itemId: t.string(), space: t.string(), parentId: t.string(), ownerMemberId: t.string(),
      name: t.string(), mimeType: t.string(), sizeBytes: t.u64(), blobKey: t.string(), actingMemberId: t.string(),
    },
    (ctx, args) => {
      const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
      const organizationId = actor.organizationId;
      const id = String(args.itemId ?? '').toLowerCase();
      if (!deps.docLimits.uuidRe.test(id)) throw driveError(deps, 'invalid', 'Invalid item id');
      const existing = ctx.db.driveItem.id.find(id);
      if (existing) {
        const replay = existing.status === 'pending' && existing.uploaderIdentity.isEqual(ctx.sender)
          && existing.blobKey === args.blobKey && existing.sizeBytes === args.sizeBytes;
        if (replay) return;
        throw driveError(deps, 'conflict', 'That id is already taken');
      }

      const name = cleanDriveName(args.name);
      if (name === null) throw driveError(deps, 'invalid_name', 'Invalid file name');
      const mimeType = normalizeDriveMime(args.mimeType);
      if (mimeType === '') throw driveError(deps, 'invalid', 'Invalid file type');
      if (isBlockedDriveFile(name, mimeType)) {
        throw driveError(deps, 'blocked_type', 'Programs and installers cannot be stored in Drive');
      }
      const sizeBytes = args.sizeBytes;
      if (sizeBytes <= 0n) throw driveError(deps, 'invalid', 'Empty files cannot be uploaded');
      if (sizeBytes > DRIVE_MAX_FILE_BYTES) throw driveError(deps, 'too_large', 'This file is too large for Drive');

      const key = parseDriveBlobKey(args.blobKey);
      if (!key || key.isThumb || key.organizationId !== organizationId || key.itemId !== id
          || args.blobKey !== driveBlobKey(organizationId, id, key.blobId, name)) {
        throw driveError(deps, 'invalid', 'Invalid storage key');
      }
      // A discarded or deleted key is never resurrected (its GC job would delete the new bytes).
      if (ctx.db.driveBlobGc.blobKey.find(args.blobKey) || ctx.db.driveBlobGc.blobKey.find(driveThumbKeyFor(args.blobKey))) {
        throw driveError(deps, 'conflict', 'That storage key was already used');
      }

      const container = resolveContainer(ctx, deps, actor, args.space, args.parentId, args.ownerMemberId);
      const pending = pendingUploadsOfSender(ctx);
      if (pending.count >= DRIVE_MAX_PENDING_PER_UPLOADER || pending.bytes + sizeBytes > DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES) {
        throw driveError(deps, 'too_many_pending', 'Wait for your other uploads to finish');
      }
      if ((ctx.db.driveUsage.organizationId.find(organizationId)?.itemCount ?? 0) >= DRIVE_MAX_ITEMS_PER_ORG) {
        throw driveError(deps, 'too_many_items', 'This store has too many files and folders');
      }
      reserveDriveBytes(ctx, deps, organizationId, sizeBytes);

      const uploadExpiresAt = deps.timestampFromMicros(deps.timestampMicros(ctx.timestamp) + DRIVE_UPLOAD_TTL_MICROS);
      ctx.db.driveItem.insert({
        id, organizationId, adminScope: driveAdminScopeOf(ctx, organizationId), space: container.space,
        parentId: container.parentId, kind: 'file', name, mimeType, sizeBytes, blobKey: args.blobKey, thumbKey: '',
        thumbBytes: 0n, etag: '', ownerMemberId: driveNewRowOwner(container, actor), createdByMemberId: actor.memberId,
        uploaderIdentity: ctx.sender, status: 'pending', uploadExpiresAt, uploadAttempts: 0, trashed: false,
        trashRootId: '', trashedAt: undefined, trashedByMemberId: '', createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
        lastEditorMemberId: actor.memberId, trashRootAt: 0n,
      });
      addDriveUsage(ctx, organizationId, { items: 1 });
    }
  );

  /**
   * Called by /api/drive/upload with the caller's token, just before it signs one
   * PUT for `pathname`: the uploading identity, still an active gated member of
   * the item's org, asks for exactly the row's key, size and type (or its
   * thumbnail). Each authorize counts an attempt and extends the pending deadline
   * to cover the PUT the route is about to sign.
   */
  const authorizeDriveUpload = spacetimedb.reducer(
    {
      itemId: t.string(), variant: t.string(), pathname: t.string(), sizeBytes: t.u64(), mimeType: t.string(),
      multipart: t.bool(),
    },
    (ctx, args) => {
      const item = uploadRow(ctx, deps, args.itemId);
      const member = callerDriveMember(ctx, item.organizationId);
      if (!member) throw driveError(deps, 'not_found', 'Upload not found');
      if (!deps.docMemberGate(member) || !item.uploaderIdentity.isEqual(ctx.sender)) {
        throw driveError(deps, 'forbidden', 'Only the person who started this upload can send it');
      }
      if (item.status !== 'pending') throw driveError(deps, 'conflict', 'This upload has already finished');
      const now = deps.timestampMicros(ctx.timestamp);
      if (deps.timestampMicros(item.uploadExpiresAt) < now) throw driveError(deps, 'expired', 'This upload has expired');
      if (item.uploadAttempts >= DRIVE_UPLOAD_MAX_ATTEMPTS) {
        throw driveError(deps, 'too_many_attempts', 'This upload failed too many times');
      }
      const size = args.sizeBytes;
      const ok = args.variant === 'original'
        ? args.pathname === item.blobKey && size === item.sizeBytes && args.mimeType === item.mimeType
        : args.variant === 'thumb'
          && args.pathname === driveThumbKeyFor(item.blobKey) && size > 0n && size <= DRIVE_THUMB_MAX_BYTES
          && (DRIVE_THUMB_TYPES as readonly string[]).includes(args.mimeType) && !args.multipart;
      if (!ok) throw driveError(deps, 'invalid', 'That does not match the upload');
      if (ctx.db.driveBlobGc.blobKey.find(args.pathname)) throw driveError(deps, 'conflict', 'That storage key was already used');
      ctx.db.driveItem.id.update({
        ...item, uploadAttempts: item.uploadAttempts + 1,
        uploadExpiresAt: deps.timestampFromMicros(now + DRIVE_UPLOAD_TTL_MICROS),
      });
    }
  );

  /**
   * Cancel a pending upload: its reservation is released and its keys are queued
   * for deletion until the upload window (+ slack) has passed, in case a PUT still
   * lands. The uploader, or anyone who manages the item. Idempotent: a missing or
   * finished upload is left alone.
   */
  const abortDriveUpload = spacetimedb.reducer(
    { itemId: t.string() },
    (ctx, args) => {
      const item = ctx.db.driveItem.id.find(String(args.itemId ?? '').toLowerCase());
      if (!item || item.kind !== 'file' || item.status !== 'pending') return;
      const actor = resolveDriveActor(ctx, deps, item.organizationId, '', { outsider: 'not_found' });
      if (!item.uploaderIdentity.isEqual(ctx.sender)) assertDriveItemRole(deps, actor, item, 'manager');
      deletePendingUpload(ctx, deps, item, 'cancelled');
    }
  );

  /**
   * The blob is in the store (the caller HEADed it): the row becomes 'ready' with
   * the observed size, which moves from reserved to used. An empty blob, or one
   * larger than declared, deletes the row instead ('rejected'; its bytes are
   * queued for GC) — the commit route answers 413 from its own read of the size.
   */
  const serviceCommitDriveUpload = spacetimedb.reducer(
    { itemId: t.string(), blobKey: t.string(), observedBytes: t.u64(), etag: t.string() },
    (ctx, args) => {
      assertDriveService(ctx, deps);
      const item = uploadRow(ctx, deps, args.itemId);
      if (item.blobKey !== args.blobKey) throw driveError(deps, 'invalid', 'That is not this upload\'s key');
      if (item.status === 'ready') return;
      const observed = args.observedBytes;
      if (observed === 0n || observed > item.sizeBytes) {
        deletePendingUpload(ctx, deps, item, 'rejected');
        return;
      }
      releaseDriveReservation(ctx, item.organizationId, item.sizeBytes);
      addDriveUsage(ctx, item.organizationId, { bytes: observed, files: 1 });
      ctx.db.driveItem.id.update({
        ...item, status: 'ready', sizeBytes: observed, etag: deps.clampChars(String(args.etag ?? ''), DRIVE_ETAG_MAX),
        updatedAt: ctx.timestamp,
      });
      const job = ctx.db.driveBlobGc.blobKey.find(item.blobKey);
      if (job && job.action === 'verify') ctx.db.driveBlobGc.delete(job);
    }
  );

  /** The upload never arrived (the verify job's HEAD found nothing) or was refused: a pending row with that key goes. */
  const serviceFailDriveUpload = spacetimedb.reducer(
    { itemId: t.string(), blobKey: t.string(), reason: t.string() },
    (ctx, args) => {
      assertDriveService(ctx, deps);
      const item = ctx.db.driveItem.id.find(String(args.itemId ?? '').toLowerCase());
      if (!item || item.kind !== 'file' || item.status !== 'pending' || item.blobKey !== args.blobKey) return;
      deletePendingUpload(ctx, deps, item, DRIVE_FAIL_REASONS.includes(args.reason) ? args.reason : 'rejected');
    }
  );

  /**
   * Attach a thumbnail (pending or ready row). Its bytes count as used from now
   * until the row is deleted. A thumbnail outside 1..DRIVE_THUMB_MAX_BYTES is not
   * attached and its key is queued for deletion.
   */
  const serviceSetDriveThumb = spacetimedb.reducer(
    { itemId: t.string(), thumbKey: t.string(), observedBytes: t.u64() },
    (ctx, args) => {
      assertDriveService(ctx, deps);
      const item = uploadRow(ctx, deps, args.itemId);
      if (args.thumbKey === '' || args.thumbKey !== driveThumbKeyFor(item.blobKey)) {
        throw driveError(deps, 'invalid', 'That is not this file\'s thumbnail key');
      }
      if (item.thumbKey === args.thumbKey) return;
      const observed = args.observedBytes;
      if (observed <= 0n || observed > DRIVE_THUMB_MAX_BYTES) {
        queueDriveBlob(ctx, {
          blobKey: args.thumbKey, organizationId: item.organizationId, itemId: item.id, action: 'delete', reason: 'rejected',
        });
        return;
      }
      ctx.db.driveItem.id.update({ ...item, thumbKey: args.thumbKey, thumbBytes: observed, updatedAt: ctx.timestamp });
      addDriveUsage(ctx, item.organizationId, { bytes: observed });
    }
  );

  /**
   * The commit route found bytes under a key that no row owns (the row is gone,
   * or it is ready under another key). Routes never delete client-supplied keys:
   * a key of this item that is not live is queued for deletion; a live key is
   * left alone.
   */
  const serviceDiscardDriveBlob = spacetimedb.reducer(
    { itemId: t.string(), blobKey: t.string() },
    (ctx, args) => {
      assertDriveService(ctx, deps);
      const key = parseDriveBlobKey(args.blobKey);
      if (!key || key.itemId !== String(args.itemId ?? '').toLowerCase()) {
        throw driveError(deps, 'invalid', 'That key does not belong to this item');
      }
      const item = ctx.db.driveItem.id.find(key.itemId);
      const live = !!item && item.blobKey !== ''
        && (args.blobKey === item.blobKey || args.blobKey === item.thumbKey || args.blobKey === driveThumbKeyFor(item.blobKey));
      if (live) return;
      queueDriveBlob(ctx, {
        blobKey: args.blobKey, organizationId: key.organizationId, itemId: key.itemId, action: 'delete', reason: 'discarded',
      });
    }
  );

  return {
    beginDriveUpload, authorizeDriveUpload, abortDriveUpload, serviceCommitDriveUpload, serviceFailDriveUpload,
    serviceSetDriveThumb, serviceDiscardDriveBlob,
  };
}
