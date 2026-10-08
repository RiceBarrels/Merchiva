// Drive service reducers (DS §6.4, §5.3; storage-api §3 R7, R9 as adopted by
// CONTRACTS C9, C10). index.ts wires them:
// `export const { … } = defineDriveServiceReducers(spacetimedb, driveDeps)`.
//
// Callers are the Vercel crons and support, over HTTP with the service token
// (lib/drive/server/stdb-calls.ts is the one file naming them):
//   /api/cron/drive-gc         sweep → read drive_blob_gc → delete / HEAD → ack / fail
//   /api/cron/drive-reconcile  report old blobs per org → finish with the listing totals
// The module decides what is live; the routes never decide that a key is an orphan.
// backfillDriveAccessV1 is the one-shot index backfill scripts/migrate-drive-v1.ts runs.

import type { DriveCtx, DriveItemRow, DriveSchema } from './types';
import { syncDriveAdminIndex } from './access-index';
import { driveError, driveUsageRow, queueDriveBlob, type DriveDeps } from './context';
import {
  DRIVE_GC_MAX_ATTEMPTS, DRIVE_ORPHAN_BRAKE_MAX_KEYS, DRIVE_ORPHAN_GRACE_MICROS, DRIVE_SERVICE_SCOPE, DRIVE_SWEEP_MAX,
  DRIVE_TRASH_RETENTION_MICROS, driveAccessOf, driveThumbKeyFor, parseDriveBlobKey,
} from './logic';
import { orgSheetBytes } from './sheets';
import { deleteDriveTrashRoot, driveDocsByFolder } from './trash';
import { assertDriveService, deletePendingUpload } from './uploads';

/** Keys per ack / fail / orphan-report call. */
const DRIVE_GC_KEYS_MAX = 1000;
/** Longest list argument read at all, checked before JSON.parse (a key is ≤ 215 chars; an orphan entry adds its size and date). */
const DRIVE_GC_KEYS_MAX_CHARS = DRIVE_GC_KEYS_MAX * 256;
const DRIVE_ORPHAN_LIST_MAX_CHARS = DRIVE_GC_KEYS_MAX * 320;
const DRIVE_GC_ERROR_MAX = 500;
/** A minimum share of orphans in one report that means a misconfigured store, not leftovers: more than 1 in 5 of at least 20. */
const DRIVE_ORPHAN_BRAKE_MIN_KEYS = 20;
const DRIVE_ORPHAN_BRAKE_SHARE = 5;
export const DRIVE_UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The service identity, or a platform admin (user.isAdmin). */
function assertDriveServiceOrAdmin(ctx: DriveCtx, deps: DriveDeps): void {
  if (deps.isServiceCaller(ctx)) return;
  if (ctx.db.user.identity.find(ctx.sender)?.isAdmin === true) return;
  throw driveError(deps, 'forbidden', 'Admin only');
}

/** Whether this database knows the organization: its row (by the plain-string id mirror) or any member row. */
export function driveOrgKnown(ctx: DriveCtx, organizationId: string): boolean {
  if (organizationId === '') return false;
  return driveAnyRow(ctx.db.organization.byOrgIdText.filter(organizationId))
    || driveAnyRow(ctx.db.orgMember.byOrganizationId.filter(organizationId));
}

/** Whether an index scan yields a row (for-of, so an early exit closes the scan). */
function driveAnyRow(rows: Iterable<unknown>): boolean {
  for (const row of rows) {
    if (row) return true;
  }
  return false;
}

/** A JSON list argument: `invalid` when unreadable or not an array, `batch_too_large` over `max` entries or `maxChars`. */
function parseDriveJsonList(deps: DriveDeps, raw: string, max: number, maxChars: number): unknown[] {
  if (typeof raw !== 'string') throw driveError(deps, 'invalid', 'Invalid list');
  if (raw.length > maxChars) throw driveError(deps, 'batch_too_large', 'Too many keys at once');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw driveError(deps, 'invalid', 'Invalid list');
  }
  if (!Array.isArray(parsed)) throw driveError(deps, 'invalid', 'Invalid list');
  if (parsed.length > max) throw driveError(deps, 'batch_too_large', 'Too many keys at once');
  return parsed;
}

/** A JSON string[] of blob keys, de-duplicated. */
function parseDriveGcKeys(deps: DriveDeps, raw: string): string[] {
  const keys = new Set<string>();
  for (const value of parseDriveJsonList(deps, raw, DRIVE_GC_KEYS_MAX, DRIVE_GC_KEYS_MAX_CHARS)) {
    if (typeof value !== 'string') throw driveError(deps, 'invalid', 'Invalid list');
    keys.add(value);
  }
  return [...keys];
}

/** A non-negative whole number from a JSON number, else null. */
function driveWholeNumber(value: unknown): bigint | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? BigInt(Math.floor(value)) : null;
}

/** ctx.sender may read drive_blob_gc and drive_usage (the service rules join drive_service_reader). */
function ensureDriveServiceReader(ctx: DriveCtx): void {
  const identityHex = ctx.sender.toHexString();
  const existing = ctx.db.driveServiceReader.identityHex.find(identityHex);
  if (!existing) {
    ctx.db.driveServiceReader.insert({ identityHex, scope: DRIVE_SERVICE_SCOPE, userId: ctx.sender, registeredAt: ctx.timestamp });
  } else if (existing.scope !== DRIVE_SERVICE_SCOPE) {
    ctx.db.driveServiceReader.identityHex.update({ ...existing, scope: DRIVE_SERVICE_SCOPE });
  }
}

export function defineDriveServiceReducers(spacetimedb: DriveSchema, deps: DriveDeps) {
  const { t } = deps;

  const serviceEnsureDriveReader = spacetimedb.reducer({}, (ctx) => {
    assertDriveService(ctx, deps);
    ensureDriveServiceReader(ctx);
  });

  /**
   * One GC pass, each phase bounded by min(maxItems, DRIVE_SWEEP_MAX):
   * (1) pending uploads past their deadline get a 'verify' job (the cron HEADs
   *     the key: found → commit, missing → fail) — the row stays pending until
   *     then, so an upload whose commit was lost is rescued, not deleted;
   * (2) trash roots older than DRIVE_TRASH_RETENTION_MICROS are deleted for
   *     good. Documents in them are never auto-deleted: they stay in the trash
   *     at the root of their space.
   */
  const serviceDriveSweep = spacetimedb.reducer({ maxItems: t.u32() }, (ctx, args) => {
    assertDriveService(ctx, deps);
    ensureDriveServiceReader(ctx);
    const limit = Math.min(Math.max(0, args.maxItems), DRIVE_SWEEP_MAX);
    const now = deps.timestampMicros(ctx.timestamp);

    let queued = 0;
    for (const row of [...ctx.db.driveItem.byStatus.filter('pending')]) {
      if (queued >= limit) break;
      if (row.kind !== 'file' || row.blobKey === '' || deps.timestampMicros(row.uploadExpiresAt) >= now) continue;
      if (ctx.db.driveBlobGc.blobKey.find(row.blobKey)) continue;
      queueDriveBlob(ctx, {
        blobKey: row.blobKey, organizationId: row.organizationId, itemId: row.id, action: 'verify',
        reason: 'upload_expired', declaredBytes: row.sizeBytes,
      });
      queued++;
    }

    // Expired trash roots straight off the byTrashRootAt range, oldest first: live and recent
    // trash is never read. Each root removes at least its own row, so `limit` roots are enough.
    const cutoff = now - DRIVE_TRASH_RETENTION_MICROS;
    const expired: DriveItemRow[] = [];
    if (limit > 0 && cutoff > 1n) {
      for (const row of ctx.db.driveItem.byTrashRootAt.filter(deps.u64Range(1n, cutoff))) {
        if (row.trashed && row.trashRootId === row.id) expired.push(row);
        if (expired.length >= limit) break;
      }
    }
    const docsIn = driveDocsByFolder(ctx);
    let removed = 0;
    for (const root of expired) {
      if (removed >= limit) break;
      if (!ctx.db.driveItem.id.find(root.id)) continue;
      removed += deleteDriveTrashRoot(ctx, deps, root, 'trash_expired', () => false, docsIn);
    }
  });

  /**
   * The cron finished these keys. A 'delete' still inside its hold (a PUT may
   * yet land) is kept for the next run, with only updatedAt touched.
   */
  const serviceAckDriveBlobGc = spacetimedb.reducer({ blobKeysJson: t.string() }, (ctx, args) => {
    assertDriveService(ctx, deps);
    const now = deps.timestampMicros(ctx.timestamp);
    for (const blobKey of parseDriveGcKeys(deps, args.blobKeysJson)) {
      const job = ctx.db.driveBlobGc.blobKey.find(blobKey);
      if (!job) continue;
      if (job.action === 'delete' && deps.timestampMicros(job.holdUntil) > now) {
        ctx.db.driveBlobGc.blobKey.update({ ...job, updatedAt: ctx.timestamp });
      } else {
        ctx.db.driveBlobGc.delete(job);
      }
    }
  });

  /**
   * The cron failed these keys: one more attempt; at DRIVE_GC_MAX_ATTEMPTS the
   * job is 'dead' (reported, never retried). A 'verify' job never goes dead
   * while its upload is still pending under that key: nothing else would ever
   * settle that row (the sweep skips a key with a job, authorize refuses it as
   * expired), so it would hold its reservation and one of the uploader's pending
   * slots for good. The upload is failed instead ('upload_expired'), which turns
   * the job into a held 'delete' with its attempts reset.
   */
  const serviceFailDriveBlobGc = spacetimedb.reducer({ blobKeysJson: t.string(), error: t.string() }, (ctx, args) => {
    assertDriveService(ctx, deps);
    const lastError = deps.clampChars(String(args.error ?? ''), DRIVE_GC_ERROR_MAX);
    for (const blobKey of parseDriveGcKeys(deps, args.blobKeysJson)) {
      const job = ctx.db.driveBlobGc.blobKey.find(blobKey);
      if (!job) continue;
      const attempts = job.attempts + 1;
      if (attempts >= DRIVE_GC_MAX_ATTEMPTS && job.action === 'verify') {
        const item = ctx.db.driveItem.id.find(job.itemId);
        if (item && item.kind === 'file' && item.status === 'pending' && item.blobKey === blobKey) {
          deletePendingUpload(ctx, deps, item, 'upload_expired');
          continue;
        }
      }
      ctx.db.driveBlobGc.blobKey.update({
        ...job, attempts, lastError, action: attempts >= DRIVE_GC_MAX_ATTEMPTS ? 'dead' : job.action, updatedAt: ctx.timestamp,
      });
    }
  });

  /**
   * One page of the reconcile listing for an org: `[{ k: key, s: size, u:
   * uploadedAt ms }]`. A key older than DRIVE_ORPHAN_GRACE_MICROS that no row
   * owns (blob, thumbnail, or the thumbnail key a pending row may still get) and
   * that is not queued yet is queued as an 'orphan' delete. The brake refuses the
   * whole page, before any write, when it looks like a store paired with the
   * wrong database. An org this database does not know is skipped.
   */
  const serviceEnqueueOrphanDriveBlobs = spacetimedb.reducer(
    { organizationId: t.string(), blobsJson: t.string() },
    (ctx, args) => {
      assertDriveService(ctx, deps);
      const organizationId = String(args.organizationId ?? '').toLowerCase();
      const entries = parseDriveJsonList(deps, args.blobsJson, DRIVE_GC_KEYS_MAX, DRIVE_ORPHAN_LIST_MAX_CHARS);
      if (!driveOrgKnown(ctx, organizationId)) return;
      const newestAllowed = deps.timestampMicros(ctx.timestamp) - DRIVE_ORPHAN_GRACE_MICROS;
      const seen = new Set<string>();
      const orphans: Array<{ blobKey: string; itemId: string; size: bigint }> = [];
      let candidates = 0;
      for (const entry of entries) {
        if (entry === null || typeof entry !== 'object') continue;
        const { k, s, u } = entry as { k?: unknown; s?: unknown; u?: unknown };
        if (typeof k !== 'string' || seen.has(k)) continue;
        seen.add(k);
        const key = parseDriveBlobKey(k);
        const uploadedAtMs = driveWholeNumber(u);
        if (!key || key.organizationId !== organizationId || uploadedAtMs === null) continue;
        if (uploadedAtMs * 1000n > newestAllowed) continue; // too young to call an orphan
        candidates++;
        const item = ctx.db.driveItem.id.find(key.itemId);
        const live = !!item && item.organizationId === organizationId && item.blobKey !== ''
          && (k === item.blobKey || k === item.thumbKey || k === driveThumbKeyFor(item.blobKey));
        if (live || ctx.db.driveBlobGc.blobKey.find(k)) continue;
        orphans.push({ blobKey: k, itemId: key.itemId, size: driveWholeNumber(s) ?? 0n });
      }
      if (orphans.length > DRIVE_ORPHAN_BRAKE_MAX_KEYS
          || (candidates >= DRIVE_ORPHAN_BRAKE_MIN_KEYS && orphans.length * DRIVE_ORPHAN_BRAKE_SHARE > candidates)) {
        throw driveError(deps, 'orphan_brake', 'Too many unknown files: check that this store belongs to this database');
      }
      for (const orphan of orphans) {
        queueDriveBlob(ctx, {
          blobKey: orphan.blobKey, organizationId, itemId: orphan.itemId, action: 'delete', reason: 'orphan',
          declaredBytes: orphan.size,
        });
      }
    }
  );

  /**
   * End of an org's reconcile: drive_usage is recomputed from the org's rows
   * (authoritative) and the listing totals are stored for drift monitoring.
   * used = ready files (size + thumbnail) + thumbnails of pending rows;
   * reserved = declared sizes of pending rows; sheetBytes = the org's sheet
   * snapshots + edit logs + version states (sheets.md §3.7).
   */
  const serviceFinishDriveReconcile = spacetimedb.reducer(
    { organizationId: t.string(), measuredBytes: t.u64(), measuredCount: t.u32() },
    (ctx, args) => {
      assertDriveService(ctx, deps);
      const organizationId = String(args.organizationId ?? '').toLowerCase();
      if (!driveOrgKnown(ctx, organizationId)) return;
      let bytesUsed = 0n;
      let bytesReserved = 0n;
      let fileCount = 0;
      let itemCount = 0;
      for (const row of ctx.db.driveItem.byOrganizationId.filter(organizationId)) {
        itemCount++;
        if (row.kind !== 'file') continue;
        bytesUsed += row.thumbBytes;
        if (row.status === 'ready') {
          bytesUsed += row.sizeBytes;
          fileCount++;
        } else {
          bytesReserved += row.sizeBytes;
        }
      }
      const usage = driveUsageRow(ctx, organizationId);
      ctx.db.driveUsage.organizationId.update({
        ...usage, bytesUsed, bytesReserved, fileCount, itemCount, sheetBytes: orgSheetBytes(ctx, organizationId),
        measuredBytes: args.measuredBytes, measuredCount: args.measuredCount, measuredAt: ctx.timestamp, updatedAt: ctx.timestamp,
      });
    }
  );

  /** Support raises (or lowers) one org's quota; 0 clears the override (DRIVE_DEFAULT_QUOTA_BYTES applies). */
  const serviceSetDriveQuota = spacetimedb.reducer(
    { organizationId: t.string(), quotaBytesOverride: t.u64() },
    (ctx, args) => {
      assertDriveService(ctx, deps);
      const organizationId = String(args.organizationId ?? '').toLowerCase();
      if (!driveOrgKnown(ctx, organizationId)) throw driveError(deps, 'not_found', 'Unknown organization');
      const usage = driveUsageRow(ctx, organizationId);
      ctx.db.driveUsage.organizationId.update({ ...usage, quotaBytesOverride: args.quotaBytesOverride, updatedAt: ctx.timestamp });
    }
  );

  /**
   * One-shot (re-runnable) build of drive_admin_index and document_reader_index
   * for one org, or for every org when organizationId is ''. Rows no current
   * member justifies are removed; readers of vanished documents only in the
   * all-orgs run (they carry no org). Counts go to migration_state
   * 'drive_access_v1'. The service identity or a platform admin.
   */
  const backfillDriveAccessV1 = spacetimedb.reducer({ organizationId: t.string() }, (ctx, args) => {
    assertDriveServiceOrAdmin(ctx, deps);
    const organizationId = String(args.organizationId ?? '').trim().toLowerCase();
    if (organizationId !== '' && !DRIVE_UUID_LIKE_RE.test(organizationId)) {
      throw driveError(deps, 'invalid', 'Invalid organization id');
    }
    const all = organizationId === '';

    let members = 0;
    for (const member of all ? [...ctx.db.orgMember.iter()] : [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]) {
      syncDriveAdminIndex(ctx, member, deps.docMemberGate);
      members++;
    }
    const docs = all ? [...ctx.db.document.iter()] : [...ctx.db.document.byOrganizationId.filter(organizationId)];
    for (const doc of docs) deps.refreshDocReaders(ctx, doc);

    // Admin rows whose (scope, identity) no active member with the power still justifies.
    const orgOfScope = new Map<string, string>();
    for (const state of all ? [...ctx.db.driveOrgState.iter()] : [ctx.db.driveOrgState.organizationId.find(organizationId)]) {
      if (state) orgOfScope.set(state.adminScope, state.organizationId);
    }
    const adminRows = all
      ? [...ctx.db.driveAdminIndex.iter()]
      : [...orgOfScope.keys()].flatMap((scope) => [...ctx.db.driveAdminIndex.byAdminScope.filter(scope)]);
    let removed = 0;
    let adminKept = 0;
    for (const row of adminRows) {
      const orgId = orgOfScope.get(row.adminScope);
      const justified = orgId !== undefined && [...ctx.db.orgMember.byUserId.filter(row.userId)].some((m) =>
        m.organizationId === orgId && m.status === 'active' && deps.docMemberGate(m) && driveAccessOf(m).view);
      if (justified) {
        adminKept++;
      } else {
        ctx.db.driveAdminIndex.delete(row);
        removed++;
      }
    }
    let readerRows = 0;
    if (all) {
      for (const row of [...ctx.db.documentReaderIndex.iter()]) {
        if (ctx.db.document.id.find(row.documentId)) {
          readerRows++;
        } else {
          ctx.db.documentReaderIndex.delete(row);
          removed++;
        }
      }
    } else {
      for (const doc of docs) readerRows += [...ctx.db.documentReaderIndex.byDocumentId.filter(doc.id)].length;
    }

    const scope = all ? '' : `org=${organizationId} `;
    const note = `${scope}members=${members} docs=${docs.length} readerRows=${readerRows} adminRows=${adminKept} removed=${removed}`;
    const name = 'drive_access_v1';
    const prev = ctx.db.migrationState.name.find(name);
    if (prev) ctx.db.migrationState.name.update({ ...prev, appliedAt: ctx.timestamp, note });
    else ctx.db.migrationState.insert({ name, appliedAt: ctx.timestamp, note });
  });

  return {
    serviceEnsureDriveReader, serviceDriveSweep, serviceAckDriveBlobGc, serviceFailDriveBlobGc,
    serviceEnqueueOrphanDriveBlobs, serviceFinishDriveReconcile, serviceSetDriveQuota, backfillDriveAccessV1,
  };
}
