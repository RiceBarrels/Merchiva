// Storage reducers for app files (UploadThing) and the storage recompute.
// index.ts wires them:
// `export const { … } = defineStorageReducers(spacetimedb, driveDeps)`.
//
//   beginAppUpload           the upload route, with the PERSON's token, before
//                            UploadThing accepts files: membership + quota,
//                            then an app_upload_hold on the bytes, so uploads
//                            started together cannot pass one check together.
//   serviceRecordAppFile     the upload route's completion callback, with the
//                            service token: one app_file row per stored file
//                            (app_file_private for chat), idempotent on keyHash.
//   serviceBackfillAppFiles  scripts: files uploaded before app_file existed,
//                            attributed by the columns that reference them.
//   serviceRecomputeStorage  the backfill script and the nightly reconcile:
//                            rebuild document_size and org_storage_usage.
//
// app_file never holds a key, URL or name — only the key's SHA-256 (keyHash):
// UploadThing URLs are public, so the URL is the access. Chat attachments go to
// the private app_file_private instead (PRIVATE_APP_FILE_SOURCES, ./storage.ts):
// colleagues see them in the org's appBytes only.

import type { DriveSchema } from './types';
import { driveError, type DriveDeps } from './context';
import { normalizeDriveMime } from './logic';
import { DRIVE_UUID_LIKE_RE, driveOrgKnown } from './service';
import { appFileOwners } from './storage-backfill';
import {
  APP_FILE_SOURCES, addOrgStorageUsage, appFileRecorded, assertOrgStorageRoom, holdAppUploadBytes, insertAppFile,
  recomputeOrgStorage, releaseAppUploadHold,
} from './storage';
import { assertDriveService } from './uploads';

/** Files per beginAppUpload (the largest UploadThing route accepts fewer). */
export const APP_UPLOAD_MAX_FILES = 20;
/**
 * Entries per serviceBackfillAppFiles call, and the longest argument read at all
 * (checked before JSON.parse). Every call that leaves a key unmatched scans every
 * reference column and every document once, so the backfill takes as few calls
 * as possible: an entry is ~200 characters, a full batch well under 1 MB.
 */
export const APP_BACKFILL_MAX = 2000;
const APP_BACKFILL_MAX_CHARS = APP_BACKFILL_MAX * 512;
/** Longest UploadThing key a backfill entry may carry. */
const APP_KEY_MAX = 256;
const KEY_HASH_RE = /^[0-9a-f]{64}$/;

interface BackfillEntry { key: string; keyHash: string; sizeBytes: bigint; mimeType: string }

const orgIdOf = (raw: unknown): string => String(raw ?? '').trim().toLowerCase();

/** A JSON size: a non-negative safe integer or a string of digits; null otherwise. */
function sizeOf(raw: unknown): bigint | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : null;
  if (typeof raw === 'string' && /^\d{1,19}$/.test(raw)) return BigInt(raw);
  return null;
}

/** One backfill entry, or null when any field is unusable. */
function backfillEntryOf(raw: unknown): BackfillEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === 'string' ? r.key : '';
  const keyHash = typeof r.keyHash === 'string' ? r.keyHash.toLowerCase() : '';
  const sizeBytes = sizeOf(r.sizeBytes);
  if (key === '' || key.length > APP_KEY_MAX || !KEY_HASH_RE.test(keyHash) || sizeBytes === null) return null;
  return { key, keyHash, sizeBytes, mimeType: normalizeDriveMime(typeof r.mimeType === 'string' ? r.mimeType : '') };
}

export function defineStorageReducers(spacetimedb: DriveSchema, deps: DriveDeps) {
  const { t } = deps;

  /** Before an app upload: the caller is an active member, the org has room for totalBytes more, and holds them. */
  const beginAppUpload = spacetimedb.reducer(
    { organizationId: t.string(), source: t.string(), totalBytes: t.u64(), fileCount: t.u32() },
    (ctx, args) => {
      const organizationId = orgIdOf(args.organizationId);
      deps.findActiveMember(ctx, organizationId);
      if (!APP_FILE_SOURCES.includes(String(args.source ?? ''))) throw driveError(deps, 'invalid', 'Unknown upload source');
      if (!(args.fileCount >= 1 && args.fileCount <= APP_UPLOAD_MAX_FILES)) {
        throw driveError(deps, 'invalid', 'Invalid number of files');
      }
      assertOrgStorageRoom(ctx, deps, organizationId, args.totalBytes);
      holdAppUploadBytes(ctx, deps, organizationId, args.totalBytes);
    }
  );

  /** One stored app file with the size UploadThing reported. A keyHash already recorded is left as it is. */
  const serviceRecordAppFile = spacetimedb.reducer(
    { organizationId: t.string(), keyHash: t.string(), source: t.string(), sizeBytes: t.u64(), mimeType: t.string() },
    (ctx, args) => {
      assertDriveService(ctx, deps);
      const organizationId = orgIdOf(args.organizationId);
      const keyHash = String(args.keyHash ?? '').trim().toLowerCase();
      const source = String(args.source ?? '');
      if (!KEY_HASH_RE.test(keyHash)) throw driveError(deps, 'invalid', 'Invalid key hash');
      if (!APP_FILE_SOURCES.includes(source)) throw driveError(deps, 'invalid', 'Unknown upload source');
      if (!driveOrgKnown(ctx, organizationId)) throw driveError(deps, 'not_found', 'Unknown organization');
      if (appFileRecorded(ctx, keyHash)) return;
      insertAppFile(ctx, {
        keyHash, organizationId, source, sizeBytes: args.sizeBytes, mimeType: normalizeDriveMime(String(args.mimeType ?? '')),
      });
      releaseAppUploadHold(ctx, organizationId, args.sizeBytes);
      addOrgStorageUsage(ctx, organizationId, { appBytes: args.sizeBytes, appFiles: 1 });
    }
  );

  /**
   * Files stored before app_file existed. `entries` is JSON
   * `[{ key, keyHash, sizeBytes, mimeType }]` (at most APP_BACKFILL_MAX). Each
   * key not yet recorded is attributed by the columns that reference it
   * (storage-backfill.ts); unusable and unreferenced entries are skipped. The
   * counts of the last call go to migration_state 'app_files_v1'.
   */
  const serviceBackfillAppFiles = spacetimedb.reducer({ entries: t.string() }, (ctx, args) => {
    assertDriveService(ctx, deps);
    const text = String(args.entries ?? '');
    if (text.length > APP_BACKFILL_MAX_CHARS) throw driveError(deps, 'batch_too_large', 'Too many entries');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw driveError(deps, 'invalid', 'Entries are not JSON');
    }
    if (!Array.isArray(parsed)) throw driveError(deps, 'invalid', 'Entries must be a list');
    if (parsed.length > APP_BACKFILL_MAX) throw driveError(deps, 'batch_too_large', 'Too many entries');

    let invalid = 0;
    let already = 0;
    const pending: BackfillEntry[] = [];
    for (const raw of parsed) {
      const entry = backfillEntryOf(raw);
      if (!entry) invalid++;
      else if (appFileRecorded(ctx, entry.keyHash)) already++;
      else pending.push(entry);
    }

    const owners = appFileOwners(ctx, new Set(pending.map((e) => e.key)));
    const added = new Map<string, { bytes: bigint; files: number }>();
    let recorded = 0;
    let unmatched = 0;
    for (const entry of pending) {
      const owner = owners.get(entry.key);
      if (!owner) {
        unmatched++;
        continue;
      }
      if (appFileRecorded(ctx, entry.keyHash)) {
        already++;
        continue;
      }
      insertAppFile(ctx, {
        keyHash: entry.keyHash, organizationId: owner.organizationId, source: owner.source,
        sizeBytes: entry.sizeBytes, mimeType: entry.mimeType,
      });
      const sum = added.get(owner.organizationId) ?? { bytes: 0n, files: 0 };
      added.set(owner.organizationId, { bytes: sum.bytes + entry.sizeBytes, files: sum.files + 1 });
      recorded++;
    }
    for (const [organizationId, sum] of added) {
      addOrgStorageUsage(ctx, organizationId, { appBytes: sum.bytes, appFiles: sum.files });
    }

    const note = `entries=${parsed.length} recorded=${recorded} already=${already} unmatched=${unmatched} invalid=${invalid}`;
    const name = 'app_files_v1';
    const prev = ctx.db.migrationState.name.find(name);
    if (prev) ctx.db.migrationState.name.update({ ...prev, appliedAt: ctx.timestamp, note });
    else ctx.db.migrationState.insert({ name, appliedAt: ctx.timestamp, note });
  });

  /**
   * Rebuild document_size and org_storage_usage from the rows for one org, or
   * for every org when organizationId is '' (every org that has a row, a
   * document, a size or an app file).
   */
  const serviceRecomputeStorage = spacetimedb.reducer({ organizationId: t.string() }, (ctx, args) => {
    assertDriveService(ctx, deps);
    const organizationId = orgIdOf(args.organizationId);
    if (organizationId !== '' && !DRIVE_UUID_LIKE_RE.test(organizationId)) {
      throw driveError(deps, 'invalid', 'Invalid organization id');
    }
    if (organizationId !== '') {
      recomputeOrgStorage(ctx, organizationId);
      return;
    }
    const orgs = new Set<string>();
    for (const org of ctx.db.organization.iter()) orgs.add(org.orgIdText || org.id.toString());
    for (const doc of ctx.db.document.iter()) orgs.add(doc.organizationId);
    for (const row of ctx.db.documentSize.iter()) orgs.add(row.organizationId);
    for (const row of ctx.db.appFile.iter()) orgs.add(row.organizationId);
    for (const row of ctx.db.appFilePrivate.iter()) orgs.add(row.organizationId);
    for (const row of ctx.db.orgStorageUsage.iter()) orgs.add(row.organizationId);
    for (const id of orgs) if (id !== '') recomputeOrgStorage(ctx, id);
  });

  return { beginAppUpload, serviceRecordAppFile, serviceBackfillAppFiles, serviceRecomputeStorage };
}
