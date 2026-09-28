// Shared plumbing of the Drive reducers: what index.ts injects (DriveDeps), who
// a write is by (resolveDriveActor), where new content goes (resolveContainer),
// and the storage accounting + blob GC queue every row deletion goes through.
//
// Runtime imports: only the pure ./logic and ./access-index (which imports only
// ./logic), so Bun tests load this file directly; index.ts values arrive through DriveDeps.

import type { Range } from 'spacetimedb/server';
import type { DocRole, DocumentRow, DriveCtx, DriveItemRow, MemberLike, MemberRow, SenderErrorCtor, TypeBuilders } from './types';
import { syncDriveAdminIndex, type AccessDocument } from './access-index';
import {
  DRIVE_DEFAULT_QUOTA_BYTES, DRIVE_DOC_ROLE_RANK, DRIVE_GC_HOLD_SLACK_MICROS, DRIVE_MAX_BATCH, DRIVE_MAX_DEPTH,
  DRIVE_OPERATOR_SESSION_TTL_MICROS, DRIVE_ROLE_RANK, DRIVE_SERVICE_SCOPE, collectSubtree, depthOf, driveAccessOf,
  driveItemRole, driveThumbKeyFor, isDriveSpace, isOrgAdminRole, minDocRole, minDriveRole, parseIdList, rootItem,
  type DriveActorLike, type DriveAdminAccess, type DriveErrorCode, type DriveItemLike, type DriveItemRole, type DriveSpace,
} from './logic';

export type { DocRole, DocumentRow, DriveCtx, DriveItemRow, MemberLike };
export type DriveTimestamp = DriveCtx['timestamp'];
export type DriveUsageRow = NonNullable<ReturnType<DriveCtx['db']['driveUsage']['organizationId']['find']>>;

/** Everything the drive factories need from index.ts. Injected, so drive files never import index.ts at runtime. */
export interface DriveDeps {
  t: typeof TypeBuilders;
  SenderError: typeof SenderErrorCtor;
  findActiveMember(ctx: DriveCtx, organizationId: string): MemberLike;
  isServiceCaller(ctx: DriveCtx): boolean;
  requireAdmin(ctx: DriveCtx): void;
  docMemberGate(member: { role: string; permissions: string }): boolean;
  docRoleFor(ctx: DriveCtx, doc: AccessDocument, member: MemberLike): DocRole;
  purgeDocumentRows(ctx: DriveCtx, doc: DocumentRow): void;
  pruneDocPresence(ctx: DriveCtx, doc: DocumentRow): void;
  /** A trashed sheet's document_edit_lease loses its holder and request; the row (and its epoch) stays. */
  dropDocumentLease(ctx: DriveCtx, documentId: string): void;
  /** syncDocumentReaders(ctx, doc, docRoleFor): after any change to a document's visibility, grants or owner. */
  refreshDocReaders(ctx: DriveCtx, doc: DocumentRow): void;
  timestampMicros(ts: { microsSinceUnixEpoch?: bigint }): bigint;
  /** `new Timestamp(micros)`: drive files cannot import the SDK at runtime. */
  timestampFromMicros(micros: bigint): DriveTimestamp;
  /** The SDK `Range` [from, toExclusive) for a btree scan over a u64 column (same reason). */
  u64Range(from: bigint, toExclusive: bigint): Range<bigint>;
  cleanDocTitle(s: string): string;
  docExcerpt(plainText: string): string;
  clampChars(s: string, max: number): string;
  docLimits: { uuidRe: RegExp; stateMaxBytes: number; textMaxChars: number; htmlMaxChars: number; templateIdMax: number };
}

/** `[drive.<code>] message` — the prefix lib/drive/errors.ts driveErrorCode parses. */
export function driveError(deps: Pick<DriveDeps, 'SenderError'>, code: DriveErrorCode, message: string): Error {
  return new deps.SenderError(`[drive.${code}] ${message}`);
}

// ─── Members ─────────────────────────────────────────────────────────────────

/** The active org_member row with this id in this organization, if any. */
export function activeDriveMember(ctx: DriveCtx, organizationId: string, memberId: string): MemberRow | undefined {
  if (memberId === '') return undefined;
  for (const m of ctx.db.orgMember.byOrganizationId.filter(organizationId)) {
    if (m.id.toString() === memberId && m.status === 'active') return m;
  }
  return undefined;
}

/** ctx.sender's active org_member row in this organization (never the service identity's virtual owner). */
export function callerDriveMember(ctx: DriveCtx, organizationId: string): MemberRow | undefined {
  for (const m of ctx.db.orgMember.byUserId.filter(ctx.sender)) {
    if (m.organizationId === organizationId && m.status === 'active') return m;
  }
  return undefined;
}

// ─── Actor (DS §4.4) ─────────────────────────────────────────────────────────

export interface DriveActor {
  organizationId: string;
  /** Effective member — the operator when acting, else the caller: attribution and owner of new rows. */
  memberId: string;
  acting: boolean;
  /** Rights of ctx.sender's member (the service identity's virtual owner for the service). */
  caller: DriveActorLike;
  /** Rights of `memberId` (=== caller when not acting). */
  operator: DriveActorLike;
  callerMember: MemberLike;
  operatorMember: MemberLike;
  isService: boolean;
}

function actorRights(deps: DriveDeps, member: MemberLike, isService: boolean): DriveActorLike {
  const gate = isService || deps.docMemberGate(member);
  return { organizationId: member.organizationId, memberId: member.id.toString(), gate,
    orgAdmin: isService || isOrgAdminRole(member.role), admin: gate ? driveAccessOf(member) : { view: false, edit: false } };
}

/** device_operator_session of ctx.sender names exactly this member in this org, resolved within the TTL. */
export function operatorSessionFresh(ctx: DriveCtx, deps: DriveDeps, organizationId: string, memberId: string): boolean {
  const session = ctx.db.deviceOperatorSession.identity.find(ctx.sender);
  if (!session || session.organizationId !== organizationId || session.memberId !== memberId) return false;
  return deps.timestampMicros(ctx.timestamp) - deps.timestampMicros(session.resolvedAt) <= DRIVE_OPERATOR_SESSION_TTL_MICROS;
}

/**
 * Who a Drive write in `organizationId` is by. '' or the caller's own member id
 * → the caller. Otherwise the store tablet acts for its PIN/QR operator: only an
 * active member of the org, and only when the caller is an org owner/manager or
 * the service identity, or ctx.sender's device_operator_session names exactly
 * that member in this org and is at most DRIVE_OPERATOR_SESSION_TTL_MICROS old.
 *
 * ACTING NEVER RAISES PRIVILEGES: every role is the minimum of the caller's and
 * the operator's (itemRoleOf / docRoleOf), the admin power the AND of both, so a
 * staff-account tablet reaches the Store space only. Self-heals the caller's
 * drive_admin_index row, never the service identity's (its virtual owner gets none).
 * `outsider` is the code for a non-member caller: 'not_found' for reducers
 * addressed by a row id, so an id from another organization reveals nothing.
 */
export function resolveDriveActor(
  ctx: DriveCtx, deps: DriveDeps, organizationId: string, actingMemberId: string,
  opts: { outsider?: 'forbidden' | 'not_found' } = {},
): DriveActor {
  const isService = deps.isServiceCaller(ctx);
  let callerMember: MemberLike;
  if (isService) {
    callerMember = deps.findActiveMember(ctx, organizationId);
  } else {
    const row = callerDriveMember(ctx, organizationId);
    if (!row) throw driveError(deps, opts.outsider ?? 'forbidden', 'Not an active member of this organization');
    syncDriveAdminIndex(ctx, row, deps.docMemberGate);
    callerMember = row;
  }
  const caller = actorRights(deps, callerMember, isService);
  const actingId = String(actingMemberId ?? '').trim().toLowerCase();
  if (actingId === '' || actingId === caller.memberId) {
    return { organizationId, memberId: caller.memberId, acting: false, caller, operator: caller, callerMember,
      operatorMember: callerMember, isService };
  }
  const operatorMember = activeDriveMember(ctx, organizationId, actingId);
  if (!operatorMember) throw driveError(deps, 'operator', 'That person is not an active member of this store');
  if (!isService && !isOrgAdminRole(callerMember.role) && !operatorSessionFresh(ctx, deps, organizationId, actingId)) {
    throw driveError(deps, 'operator', 'Enter your PIN again to continue');
  }
  return { organizationId, memberId: actingId, acting: true, caller, operator: actorRights(deps, operatorMember, false),
    callerMember, operatorMember, isService };
}

/** The actor's role on an item: the minimum of the operator's and the caller's. */
export function itemRoleOf(item: DriveItemLike, actor: DriveActor): DriveItemRole {
  return minDriveRole(driveItemRole(item, actor.operator), driveItemRole(item, actor.caller));
}

/** The actor's role on a document: 'none' across orgs, else the minimum of both members' docRoleFor. */
export function docRoleOf(ctx: DriveCtx, deps: DriveDeps, doc: AccessDocument, actor: DriveActor): DocRole {
  if (doc.organizationId !== actor.organizationId) return 'none';
  const callerRole = deps.docRoleFor(ctx, doc, actor.callerMember);
  return actor.acting ? minDocRole(deps.docRoleFor(ctx, doc, actor.operatorMember), callerRole) : callerRole;
}

/** The Drive "everyone's files" power of the actor: the AND of both. */
export function adminOf(actor: DriveActor): DriveAdminAccess {
  return { view: actor.operator.admin.view && actor.caller.admin.view, edit: actor.operator.admin.edit && actor.caller.admin.edit };
}

/**
 * Throw unless the actor holds at least `min` on `item`: `device_scope` when
 * acting and only the caller (the tablet account) has no role at all there — a
 * staff-account tablet reaching for My files — else `code` (forbidden).
 */
export function assertDriveItemRole(
  deps: DriveDeps, actor: DriveActor, item: DriveItemLike, min: DriveItemRole, code: DriveErrorCode = 'forbidden',
): void {
  if (DRIVE_ROLE_RANK[itemRoleOf(item, actor)] >= DRIVE_ROLE_RANK[min]) return;
  if (actor.acting && driveItemRole(item, actor.caller) === 'none' && driveItemRole(item, actor.operator) !== 'none') {
    throw driveError(deps, 'device_scope', 'This tablet cannot reach that person\'s files');
  }
  throw driveError(deps, code, 'You do not have access to this item');
}

/** Same rule for a document; `ok` decides on the actor's role. */
export function assertDriveDocRole(
  ctx: DriveCtx, deps: DriveDeps, actor: DriveActor, doc: AccessDocument, ok: (role: DocRole) => boolean,
  code: DriveErrorCode = 'forbidden',
): DocRole {
  const role = docRoleOf(ctx, deps, doc, actor);
  if (ok(role)) return role;
  if (actor.acting && deps.docRoleFor(ctx, doc, actor.callerMember) === 'none'
      && deps.docRoleFor(ctx, doc, actor.operatorMember) !== 'none') {
    throw driveError(deps, 'device_scope', 'This tablet cannot reach that person\'s files');
  }
  throw driveError(deps, code, 'You do not have access to this document');
}

export function isDocManager(role: DocRole): boolean {
  return DRIVE_DOC_ROLE_RANK[role] >= DRIVE_DOC_ROLE_RANK.manager;
}

// ─── Tree + containers (DS §6.1) ─────────────────────────────────────────────

/** A document's space is derived, never stored: private → 'my' (its owner's), otherwise 'store'. */
export function driveSpaceOfDoc(doc: { visibility: string }): DriveSpace {
  return doc.visibility === 'private' ? 'my' : 'store';
}

/** parentOf for the tree walks, limited to one organization's rows. */
export function driveParentLookup(ctx: DriveCtx, organizationId: string): (id: string) => string | undefined {
  return (id) => {
    const row = ctx.db.driveItem.id.find(id);
    return row && row.organizationId === organizationId ? row.parentId : undefined;
  };
}

/** `rootId` and its non-trashed descendants (roots first) with the subtree height; null over `max` rows. */
export function driveSubtree(ctx: DriveCtx, organizationId: string, rootId: string, max: number): { rows: DriveItemRow[]; height: number } | null {
  const byId = new Map<string, DriveItemRow>();
  const root = ctx.db.driveItem.id.find(rootId);
  if (root) byId.set(rootId, root);
  const ids = collectSubtree([rootId], (id) => {
    const children = [...ctx.db.driveItem.byParentId.filter(id)].filter((c) => c.organizationId === organizationId);
    for (const child of children) byId.set(child.id, child);
    return children;
  }, max);
  if (!ids) return null;
  const depth = new Map<string, number>();
  const rows: DriveItemRow[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    depth.set(id, id === rootId ? 0 : (depth.get(row.parentId) ?? 0) + 1);
    rows.push(row);
  }
  return { rows, height: Math.max(0, ...depth.values()) };
}

/** Whether `folderId` is a live folder of this org that content of (space, owner) may sit in. */
export function driveFolderFits(ctx: DriveCtx, organizationId: string, folderId: string, space: string, ownerMemberId: string): boolean {
  const folder = folderId === '' ? null : ctx.db.driveItem.id.find(folderId);
  return !!folder && folder.organizationId === organizationId && folder.kind === 'folder' && folder.status === 'ready'
    && !folder.trashed && folder.space === space && (space !== 'my' || folder.ownerMemberId === ownerMemberId);
}

/** A resolved target: `ownerMemberId` is the space owner for 'my', '' for 'store'. */
export interface DriveContainer { space: DriveSpace; parentId: string; ownerMemberId: string }

/**
 * Where new or moved content goes. `ownerMemberId` names whose My files a ROOT
 * target is ('' = the actor's own); it is ignored for store and, for a folder,
 * must be '' or the folder's owner. The actor needs at least contributor on it.
 */
export function resolveContainer(
  ctx: DriveCtx, deps: DriveDeps, actor: DriveActor, space: string, parentId: string, ownerMemberId: string,
): DriveContainer {
  if (!isDriveSpace(space)) throw driveError(deps, 'invalid', 'Unknown space');
  const organizationId = actor.organizationId;
  const folderId = String(parentId ?? '').toLowerCase();
  const owner = String(ownerMemberId ?? '').toLowerCase();
  if (folderId === '') {
    const spaceOwner = space === 'my' ? owner || actor.memberId : '';
    if (space === 'my' && !activeDriveMember(ctx, organizationId, spaceOwner)) {
      throw driveError(deps, 'not_found', 'That person is not an active member of this store');
    }
    assertDriveItemRole(deps, actor, rootItem(organizationId, space, spaceOwner), 'contributor');
    return { space, parentId: '', ownerMemberId: spaceOwner };
  }
  const folder = ctx.db.driveItem.id.find(folderId);
  if (!folder || folder.organizationId !== organizationId) throw driveError(deps, 'not_found', 'Folder not found');
  if (folder.kind !== 'folder' || folder.status !== 'ready') throw driveError(deps, 'invalid', 'Not a folder');
  if (folder.trashed) throw driveError(deps, 'trashed', 'Folder is in the trash');
  if (folder.space !== space) throw driveError(deps, 'space_mismatch', 'Folder is in the other space');
  if (space === 'my' && owner !== '' && owner !== folder.ownerMemberId) throw driveError(deps, 'invalid', 'Folder belongs to someone else');
  assertDriveItemRole(deps, actor, folder, 'contributor');
  if (depthOf(folder.id, driveParentLookup(ctx, organizationId)) + 1 > DRIVE_MAX_DEPTH) {
    throw driveError(deps, 'too_deep', 'Folders cannot be nested this deep');
  }
  return { space, parentId: folder.id, ownerMemberId: space === 'my' ? folder.ownerMemberId : '' };
}

/** Owner of a new row: the space owner in 'my' (always), the actor who added it in 'store'. */
export function driveNewRowOwner(container: DriveContainer, actor: DriveActor): string {
  return container.space === 'my' ? container.ownerMemberId : actor.memberId;
}

/**
 * Longest id-list argument read at all: DRIVE_MAX_BATCH ids with room for
 * spaces (a compact id is 39 chars with quotes and comma). Checked before
 * parsing: parseIdList de-duplicates in O(n²), and reducers run one at a time.
 */
export const DRIVE_ID_LIST_MAX_CHARS = DRIVE_MAX_BATCH * 64;

/** A reducer's two JSON id lists: `invalid` when unreadable, `batch_too_large` over DRIVE_MAX_BATCH in total. */
export function parseDriveEntryIds(deps: DriveDeps, itemIdsJson: string, documentIdsJson: string): { itemIds: string[]; documentIds: string[] } {
  for (const raw of [itemIdsJson, documentIdsJson]) {
    if (typeof raw === 'string' && raw.length > DRIVE_ID_LIST_MAX_CHARS) {
      throw driveError(deps, 'batch_too_large', 'Too many entries at once');
    }
  }
  const itemIds = parseIdList(itemIdsJson, Number.MAX_SAFE_INTEGER);
  const documentIds = parseIdList(documentIdsJson, Number.MAX_SAFE_INTEGER);
  if (!itemIds || !documentIds) throw driveError(deps, 'invalid', 'Invalid id list');
  if (itemIds.length + documentIds.length > DRIVE_MAX_BATCH) throw driveError(deps, 'batch_too_large', 'Too many entries at once');
  return { itemIds, documentIds };
}

// ─── Usage + GC (DS §6.2) ────────────────────────────────────────────────────

const floorAt0 = (value: bigint): bigint => (value < 0n ? 0n : value);

/** The org's drive_usage row, inserted with zeros on first use. */
export function driveUsageRow(ctx: DriveCtx, organizationId: string): DriveUsageRow {
  const existing = ctx.db.driveUsage.organizationId.find(organizationId);
  if (existing) return existing;
  return ctx.db.driveUsage.insert({
    organizationId, scope: DRIVE_SERVICE_SCOPE, bytesUsed: 0n, bytesReserved: 0n, fileCount: 0, itemCount: 0, quotaBytesOverride: 0n,
    sheetBytes: 0n, measuredBytes: 0n, measuredCount: 0, measuredAt: ctx.timestamp, updatedAt: ctx.timestamp,
  });
}

/** The org's quota: support's override when set, else the flat DRIVE_DEFAULT_QUOTA_BYTES. */
export function driveQuotaBytes(ctx: DriveCtx, organizationId: string): bigint {
  const override = ctx.db.driveUsage.organizationId.find(organizationId)?.quotaBytesOverride ?? 0n;
  return override > 0n ? override : DRIVE_DEFAULT_QUOTA_BYTES;
}

/** Hold `bytes` for a pending upload; `quota_exceeded` when used + reserved + bytes would pass the quota. */
export function reserveDriveBytes(ctx: DriveCtx, deps: DriveDeps, organizationId: string, bytes: bigint): void {
  const usage = driveUsageRow(ctx, organizationId);
  if (usage.bytesUsed + usage.bytesReserved + bytes > driveQuotaBytes(ctx, organizationId)) {
    throw driveError(deps, 'quota_exceeded', 'This store is out of Drive storage');
  }
  ctx.db.driveUsage.organizationId.update({ ...usage, bytesReserved: usage.bytesReserved + bytes, updatedAt: ctx.timestamp });
}

export function releaseDriveReservation(ctx: DriveCtx, organizationId: string, bytes: bigint): void {
  const usage = driveUsageRow(ctx, organizationId);
  ctx.db.driveUsage.organizationId.update({ ...usage, bytesReserved: floorAt0(usage.bytesReserved - bytes), updatedAt: ctx.timestamp });
}

/** Apply signed deltas; every counter floors at 0. `sheetBytes` is not part of bytesUsed (the quota). */
export function addDriveUsage(
  ctx: DriveCtx, organizationId: string, delta: { bytes?: bigint; files?: number; items?: number; sheetBytes?: bigint },
): void {
  const usage = driveUsageRow(ctx, organizationId);
  ctx.db.driveUsage.organizationId.update({
    ...usage,
    bytesUsed: floorAt0(usage.bytesUsed + (delta.bytes ?? 0n)),
    fileCount: Math.max(0, usage.fileCount + (delta.files ?? 0)),
    itemCount: Math.max(0, usage.itemCount + (delta.items ?? 0)),
    sheetBytes: floorAt0(usage.sheetBytes + (delta.sheetBytes ?? 0n)),
    updatedAt: ctx.timestamp,
  });
}

/**
 * Queue blob work for the GC cron. One row per key: 'delete' upgrades a
 * 'verify' or 'dead' row (attempts reset) and keeps the later holdUntil;
 * 'verify' never downgrades an existing row.
 */
export function queueDriveBlob(ctx: DriveCtx, input: {
  blobKey: string; organizationId: string; itemId: string; action: 'delete' | 'verify'; reason: string;
  declaredBytes?: bigint; holdUntil?: DriveTimestamp;
}): void {
  const holdUntil = input.holdUntil ?? ctx.timestamp;
  const existing = ctx.db.driveBlobGc.blobKey.find(input.blobKey);
  if (!existing) {
    ctx.db.driveBlobGc.insert({
      blobKey: input.blobKey, scope: DRIVE_SERVICE_SCOPE, organizationId: input.organizationId, itemId: input.itemId,
      action: input.action, reason: input.reason, declaredBytes: input.declaredBytes ?? 0n, holdUntil, attempts: 0,
      lastError: '', createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
    });
    return;
  }
  if (input.action !== 'delete') return;
  const later = holdUntil.microsSinceUnixEpoch > existing.holdUntil.microsSinceUnixEpoch ? holdUntil : existing.holdUntil;
  if (existing.action === 'delete' && later === existing.holdUntil) return;
  const upgrade = existing.action === 'delete' ? {} : { action: 'delete', reason: input.reason, attempts: 0, lastError: '' };
  ctx.db.driveBlobGc.blobKey.update({ ...existing, ...upgrade, holdUntil: later, updatedAt: ctx.timestamp });
}

/**
 * Release a file's bytes and queue its blob (and thumbnail key) for deletion:
 * ready → usage -(size + thumb), files -1; pending → reservation released and any
 * attached thumb unused. A pending key keeps being deleted until its upload
 * window (+ slack) has passed, in case a PUT still lands.
 */
export function purgeDriveFileBytes(ctx: DriveCtx, deps: DriveDeps, item: DriveItemRow, reason: string): void {
  if (item.kind !== 'file' || item.blobKey === '') return;
  const pending = item.status !== 'ready';
  if (pending) {
    releaseDriveReservation(ctx, item.organizationId, item.sizeBytes);
    if (item.thumbBytes > 0n) addDriveUsage(ctx, item.organizationId, { bytes: -item.thumbBytes });
  } else {
    addDriveUsage(ctx, item.organizationId, { bytes: -(item.sizeBytes + item.thumbBytes), files: -1 });
  }
  const holdUntil = pending
    ? deps.timestampFromMicros(deps.timestampMicros(item.uploadExpiresAt) + DRIVE_GC_HOLD_SLACK_MICROS) : ctx.timestamp;
  for (const blobKey of new Set([item.blobKey, item.thumbKey || driveThumbKeyFor(item.blobKey)])) {
    if (blobKey !== '') queueDriveBlob(ctx, { blobKey, organizationId: item.organizationId, itemId: item.id, action: 'delete', reason, holdUntil });
  }
}

/** Delete one drive_item row for good: its bytes (files), its stars, the row, and one from itemCount. */
export function deleteItemRow(ctx: DriveCtx, deps: DriveDeps, item: DriveItemRow, reason: string): void {
  purgeDriveFileBytes(ctx, deps, item, reason);
  for (const star of [...ctx.db.driveStar.byItemId.filter(item.id)]) ctx.db.driveStar.delete(star);
  ctx.db.driveItem.delete(item);
  addDriveUsage(ctx, item.organizationId, { items: -1 });
}
