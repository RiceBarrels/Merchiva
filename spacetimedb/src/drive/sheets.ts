// Sheets server (sheets.md §3.3–§3.6): the single-writer edit lease and the content
// reducers of a spreadsheet. index.ts wires them: `export const { … } =
// defineSheetReducers(spacetimedb, sheetDeps)`. A sheet is a `document` whose
// document_file row says 'sheet', with its content in the Docs tables, but not as Yjs: a gzipped
// Univer workbook (document_snapshot) and gzipped mutation batches (document_update),
// which the module never parses (only the gzip header is checked). Version bytes live
// in document_version_state; the document_version row keeps an EMPTY state.
// Access: requireDoc for ctx.sender (the tablet account on /store), then the Drive
// actor rule (DS §4.4): the role is the minimum of the caller's and the operator's,
// and edits are attributed to the operator. Errors: `[sheet.<code>]` plus
// requireDoc's `[doc.*]` and resolveDriveActor's `[drive.*]`.
// Runtime imports: only the SDK-free ./sheet-logic, ./logic and ./context.

import type { DocRole, DocumentRow, DriveCtx, DriveSchema, MemberLike } from './types';
import { addDriveUsage, docRoleOf, driveUsageRow, resolveDriveActor, type DriveDeps } from './context';
import { DRIVE_DOC_ROLE_RANK } from './logic';
import {
  SHEET_LOG_MAX_BYTES, SHEET_LOG_MAX_ROWS, cleanSheetName, cleanSheetSessionId, isGzipBytes, sheetBytesFit, sheetLeaseDecision,
  sheetRequestLive, sheetVersionPrunePlan, type SheetErrorCode, type SheetLeaseTimes,
} from './sheet-logic';

type LeaseRow = NonNullable<ReturnType<DriveCtx['db']['documentEditLease']['documentId']['find']>>;
type SnapshotRow = NonNullable<ReturnType<DriveCtx['db']['documentSnapshot']['documentId']['find']>>;
type Stamp = DriveCtx['timestamp'];
const NO_REQUEST = { requestedByMemberId: '', requestedByActorMemberId: '', requestedBySessionId: '', requestedByConnectionId: '', requestedByName: '' };

/** What the sheet factory needs from index.ts on top of DriveDeps (sheets.md §3.3, §3.10). */
export interface SheetDeps extends DriveDeps {
  /** The Docs guard for ctx.sender: [doc.not_found] / [doc.forbidden] / [doc.trashed]. */
  requireDoc(ctx: DriveCtx, documentId: string, min: Exclude<DocRole, 'none'>, opts?: { allowTrashed?: boolean }):
    { doc: DocumentRow; memberId: string };
  touchDocument(ctx: DriveCtx, doc: DocumentRow, memberId: string): void;
  /** ./document-file.ts docFileTypeOf: what the document holds (no document_file row = 'doc'). */
  docFileTypeOf(ctx: DriveCtx, documentId: string): 'doc' | 'sheet' | 'slides';
  sheetLimits: { updateMaxBytes: number; namedVersionMax: number; versionNameMax: number; autoVersionGapMicros: bigint };
}

export function sheetError(deps: Pick<DriveDeps, 'SenderError'>, code: SheetErrorCode, message: string): Error {
  return new deps.SenderError(`[sheet.${code}] ${message}`);
}

/** `[sheet.quota]` unless the org's sheet bytes + growth fit SHEET_ORG_MAX_BYTES (growth ≤ 0 always fits). */
export function assertSheetBytesFitIn(ctx: DriveCtx, deps: Pick<DriveDeps, 'SenderError'>, organizationId: string, growth: bigint): void {
  if (growth <= 0n) return;
  if (!sheetBytesFit(driveUsageRow(ctx, organizationId).sheetBytes, growth)) {
    throw sheetError(deps, 'quota', 'This store has no room for more spreadsheet data');
  }
}

/** Bytes one document holds in the sheet tables: snapshot + update log (live) and version states. */
export function sheetBytesOfDocument(ctx: DriveCtx, documentId: string): { live: bigint; versions: bigint } {
  let live = BigInt(ctx.db.documentSnapshot.documentId.find(documentId)?.byteLength ?? 0);
  for (const row of ctx.db.documentUpdate.byDocumentId.filter(documentId)) live += BigInt(row.byteLength);
  let versions = 0n;
  for (const row of ctx.db.documentVersionState.byDocumentId.filter(documentId)) versions += BigInt(row.byteLength);
  return { live, versions };
}

/** drive_usage.sheetBytes recomputed from the rows (serviceFinishDriveReconcile): the org's sheets are its 'sheet' document_file rows. */
export function orgSheetBytes(ctx: DriveCtx, organizationId: string): bigint {
  let total = 0n;
  for (const file of ctx.db.documentFile.byOrganizationId.filter(organizationId)) {
    if (file.fileType !== 'sheet' || !ctx.db.document.id.find(file.documentId)) continue;
    total += sheetBytesOfDocument(ctx, file.documentId).live;
  }
  for (const row of ctx.db.documentVersionState.byOrganizationId.filter(organizationId)) total += BigInt(row.byteLength);
  return total;
}

/** The lease with no holder: the reservation clock (heartbeatAt) starts `now`; epoch, lastSeq and any request stay. */
export function sheetLeaseWithoutHolder(lease: LeaseRow, now: Stamp): LeaseRow {
  return { ...lease, holderMemberId: '', holderActorMemberId: '', holderSessionId: '', holderConnectionId: '', holderName: '', heartbeatAt: now };
}

/** The lease with no request. */
export function sheetLeaseWithoutRequest(lease: LeaseRow): LeaseRow {
  return { ...lease, ...NO_REQUEST };
}

/** Who a sheet write is by: fencing uses the caller's member, attribution and the same-person rule the actor. */
interface SheetAccess { doc: DocumentRow; callerMemberId: string; actorMemberId: string; actorName: string }

function memberDisplayName(member: MemberLike): string {
  return 'displayName' in member && typeof member.displayName === 'string' ? member.displayName : '';
}

/**
 * requireDoc(min) for ctx.sender, the sheet type, then the actor: `actingMemberId`
 * ('' = the caller) must pass resolveDriveActor ([drive.operator]) and the
 * INTERSECTION of both roles must reach `min` ([doc.forbidden]). A staff-account
 * tablet therefore never reaches a sheet in an operator's My files.
 */
function requireSheetAccess(
  ctx: DriveCtx, deps: SheetDeps, documentId: string, actingMemberId: string, min: Exclude<DocRole, 'none'>,
  opts: { allowTrashed?: boolean } = {},
): SheetAccess {
  const { doc } = deps.requireDoc(ctx, documentId, min, opts);
  if (deps.docFileTypeOf(ctx, doc.id) !== 'sheet') throw sheetError(deps, 'not_sheet', 'Not a spreadsheet');
  const actor = resolveDriveActor(ctx, deps, doc.organizationId, actingMemberId);
  if (DRIVE_DOC_ROLE_RANK[docRoleOf(ctx, deps, doc, actor)] < DRIVE_DOC_ROLE_RANK[min]) {
    throw new deps.SenderError('[doc.forbidden] You do not have access to this document');
  }
  return { doc, callerMemberId: actor.callerMember.id.toString(), actorMemberId: actor.memberId,
    actorName: cleanSheetName(memberDisplayName(actor.operatorMember)) };
}

function sessionOf(deps: SheetDeps, raw: string): string {
  const sessionId = cleanSheetSessionId(raw);
  if (sessionId === null) throw sheetError(deps, 'invalid', 'Invalid session id');
  return sessionId;
}

function leaseTimes(deps: SheetDeps, l: LeaseRow): SheetLeaseTimes {
  return {
    holderMemberId: l.holderMemberId, holderActorMemberId: l.holderActorMemberId, holderSessionId: l.holderSessionId,
    holderConnectionId: l.holderConnectionId, heartbeatMicros: deps.timestampMicros(l.heartbeatAt),
    lastEditMicros: deps.timestampMicros(l.lastEditAt), requestedBySessionId: l.requestedBySessionId,
    requestedByConnectionId: l.requestedByConnectionId, requestedMicros: deps.timestampMicros(l.requestedAt),
  };
}

/**
 * The lease's log totals for a new holder `sessionId`: one walk of the log (at most SHEET_LOG_MAX_ROWS
 * rows). While the session holds the lease only it writes the log, so the rows another session wrote
 * are fixed from here on, and pushSheetOps / compactSheet / resetSheetContent keep the rest current.
 */
function sheetLogTotals(ctx: DriveCtx, documentId: string, sessionId: string): { logBytes: bigint; logRows: number; logOtherMaxId: bigint } {
  let logBytes = 0n;
  let logRows = 0;
  let logOtherMaxId = 0n;
  for (const row of ctx.db.documentUpdate.byDocumentId.filter(documentId)) {
    logBytes += BigInt(row.byteLength);
    logRows++;
    if (row.sessionId !== sessionId && row.id > logOtherMaxId) logOtherMaxId = row.id;
  }
  return { logBytes, logRows, logOtherMaxId };
}

/** The caller must hold the lease: same member, actor, session and epoch, on this connection. Else [sheet.lease]. */
function requireSheetLease(ctx: DriveCtx, deps: SheetDeps, a: SheetAccess, sessionId: string, epoch: bigint): LeaseRow {
  const lease = ctx.db.documentEditLease.documentId.find(a.doc.id);
  const connection = ctx.connectionId ? ctx.connectionId.toHexString() : '';
  if (!lease || connection === '' || lease.epoch !== epoch || lease.holderSessionId !== sessionId
      || lease.holderConnectionId !== connection || lease.holderMemberId !== a.callerMemberId
      || lease.holderActorMemberId !== a.actorMemberId) {
    throw sheetError(deps, 'lease', 'Someone else is editing this spreadsheet');
  }
  return lease;
}

/** ctx.sender's member id in the org (release / cancel need no role beyond viewer). */
function callerMemberIdIn(ctx: DriveCtx, deps: SheetDeps, organizationId: string): string {
  return resolveDriveActor(ctx, deps, organizationId, '').callerMember.id.toString();
}

/** A write's `seq` after the grant: false for one already committed (a retry after a lost reply), [sheet.sequence] for a gap. */
function sheetSeqIsNew(deps: SheetDeps, held: LeaseRow, seq: bigint): boolean {
  if (seq <= held.lastSeq) return false;
  if (seq !== held.lastSeq + 1n) throw sheetError(deps, 'sequence', 'Edits arrived out of order');
  return true;
}

/** A state argument: 0 < size ≤ stateMaxBytes ([sheet.too_large]) and gzip ([sheet.invalid]). */
function checkSheetState(deps: SheetDeps, state: Uint8Array): void {
  if (state.length === 0 || state.length > deps.docLimits.stateMaxBytes) throw sheetError(deps, 'too_large', 'Spreadsheet is too large');
  if (!isGzipBytes(state)) throw sheetError(deps, 'invalid', 'Not a spreadsheet');
}

/** Write the snapshot and the document's excerpt / cell count (wordCount holds the cell count for sheets). */
function writeSheetSnapshot(ctx: DriveCtx, deps: SheetDeps, a: SheetAccess, current: SnapshotRow | null | undefined,
  state: Uint8Array, throughUpdateId: bigint, plainTextRaw: string, cellCount: number): void {
  const plainText = deps.clampChars(String(plainTextRaw ?? ''), deps.docLimits.textMaxChars);
  const snapshot = {
    documentId: a.doc.id, organizationId: a.doc.organizationId, state, throughUpdateId, byteLength: state.length, html: '',
    plainText, compactedAt: ctx.timestamp, compactedByMemberId: a.actorMemberId,
  };
  if (current) ctx.db.documentSnapshot.documentId.update(snapshot);
  else ctx.db.documentSnapshot.insert(snapshot);
  const doc = ctx.db.document.id.find(a.doc.id) ?? a.doc;
  const excerpt = deps.docExcerpt(plainText);
  if (excerpt !== doc.excerpt || cellCount !== doc.wordCount) ctx.db.document.id.update({ ...doc, excerpt, wordCount: cellCount });
}

export function defineSheetReducers(spacetimedb: DriveSchema, deps: SheetDeps) {
  const { t } = deps;
  const lease = (ctx: DriveCtx) => ctx.db.documentEditLease.documentId;

  /** Take the lease, re-bind it to a new connection of the same session, record a request, or do nothing (queued). */
  const acquireSheetLease = spacetimedb.reducer({ documentId: t.string(), sessionId: t.string(), actingMemberId: t.string() }, (ctx, args) => {
    const a = requireSheetAccess(ctx, deps, args.documentId, args.actingMemberId, 'editor');
    if (!ctx.connectionId) throw sheetError(deps, 'lease', 'Editing needs a live connection');
    const sessionId = sessionOf(deps, args.sessionId);
    const connection = ctx.connectionId.toHexString();
    const now = ctx.timestamp;
    const nowUs = deps.timestampMicros(now);
    const holder = { holderMemberId: a.callerMemberId, holderActorMemberId: a.actorMemberId, holderSessionId: sessionId,
      holderConnectionId: connection, holderName: a.actorName };
    const cur = lease(ctx).find(a.doc.id);
    if (!cur) {
      ctx.db.documentEditLease.insert({
        documentId: a.doc.id, organizationId: a.doc.organizationId, epoch: 1n, ...holder, acquiredAt: now, heartbeatAt: now,
        lastEditAt: now, lastSeq: 0n, ...NO_REQUEST, requestedAt: now, ...sheetLogTotals(ctx, a.doc.id, sessionId),
      });
      return;
    }
    const times = leaseTimes(deps, cur);
    const decision = sheetLeaseDecision(times, nowUs, { memberId: a.callerMemberId, actorMemberId: a.actorMemberId, sessionId });
    // The session's own lease on a new connection keeps epoch and lastSeq. Another operator on
    // that session is another person (SH §15 g): a fresh grant, which fences the old one's writes.
    if (decision === 'rebind' && cur.holderActorMemberId === a.actorMemberId) {
      lease(ctx).update({ ...cur, holderConnectionId: connection, holderName: a.actorName, heartbeatAt: now });
      return;
    }
    switch (decision) {
      case 'rebind':
      case 'grant': {
        const keepOther = sheetRequestLive(times, nowUs) && cur.requestedBySessionId !== sessionId;
        lease(ctx).update({ ...(keepOther ? cur : sheetLeaseWithoutRequest(cur)), epoch: cur.epoch + 1n, ...holder,
          acquiredAt: now, heartbeatAt: now, lastEditAt: now, lastSeq: 0n, ...sheetLogTotals(ctx, a.doc.id, sessionId) });
        return;
      }
      case 'request':
        if (cur.requestedBySessionId === sessionId && sheetRequestLive(times, nowUs)) {
          lease(ctx).update({ ...cur, requestedByConnectionId: connection }); // keeps requestedAt (the grace clock)
        } else {
          lease(ctx).update({
            ...cur, requestedByMemberId: a.callerMemberId, requestedByActorMemberId: a.actorMemberId,
            requestedBySessionId: sessionId, requestedByConnectionId: connection, requestedByName: a.actorName, requestedAt: now,
          });
        }
        return;
      case 'queued':
        return; // someone else's live request or reservation stands
    }
  });

  const leaseArgs = () => ({ documentId: t.string(), sessionId: t.string(), leaseEpoch: t.u64(), actingMemberId: t.string() });

  const heartbeatSheetLease = spacetimedb.reducer(leaseArgs(), (ctx, args) => {
    const a = requireSheetAccess(ctx, deps, args.documentId, args.actingMemberId, 'editor');
    const held = requireSheetLease(ctx, deps, a, sessionOf(deps, args.sessionId), args.leaseEpoch);
    lease(ctx).update({ ...held, heartbeatAt: ctx.timestamp });
  });

  /** The holder turns the request down: it lapses, and the holder counts as active now. */
  const declineSheetLeaseRequest = spacetimedb.reducer(leaseArgs(), (ctx, args) => {
    const a = requireSheetAccess(ctx, deps, args.documentId, args.actingMemberId, 'editor');
    const held = requireSheetLease(ctx, deps, a, sessionOf(deps, args.sessionId), args.leaseEpoch);
    lease(ctx).update({ ...sheetLeaseWithoutRequest(held), lastEditAt: ctx.timestamp, heartbeatAt: ctx.timestamp });
  });

  /** Idempotent. Clears the holder when it is (caller member, session); the row, epoch, lastSeq and any request stay. */
  const releaseSheetLease = spacetimedb.reducer({ documentId: t.string(), sessionId: t.string() }, (ctx, args) => {
    const { doc } = deps.requireDoc(ctx, args.documentId, 'viewer', { allowTrashed: true });
    const sessionId = sessionOf(deps, args.sessionId);
    const cur = lease(ctx).find(doc.id);
    if (!cur || cur.holderSessionId !== sessionId || cur.holderMemberId !== callerMemberIdIn(ctx, deps, doc.organizationId)) return;
    lease(ctx).update(sheetLeaseWithoutHolder(cur, ctx.timestamp));
  });

  /** Idempotent. Withdraws the request when it is (caller member, session). */
  const cancelSheetLeaseRequest = spacetimedb.reducer({ documentId: t.string(), sessionId: t.string() }, (ctx, args) => {
    const { doc } = deps.requireDoc(ctx, args.documentId, 'viewer', { allowTrashed: true });
    const sessionId = sessionOf(deps, args.sessionId);
    const cur = lease(ctx).find(doc.id);
    if (!cur || cur.requestedBySessionId !== sessionId || cur.requestedByMemberId !== callerMemberIdIn(ctx, deps, doc.organizationId)) return;
    lease(ctx).update(sheetLeaseWithoutRequest(cur));
  });

  /**
   * Append one gzipped op batch. `seq` counts the session's writes since its grant (sheetSeqIsNew);
   * `baseUpdateId` is the highest update id the client had applied: another session's row after it,
   * or a snapshot past it, is [sheet.stale]. Never refused by the org budget (that would lose typed
   * edits); the per-sheet log caps (bytes and rows) bound it. O(1): the lease carries the log totals
   * (sheetLogTotals), so a push never walks the log.
   */
  const pushSheetOps = spacetimedb.reducer({
    documentId: t.string(), sessionId: t.string(), leaseEpoch: t.u64(), seq: t.u64(), baseUpdateId: t.u64(),
    payload: t.byteArray(), actingMemberId: t.string(),
  }, (ctx, args) => {
    const a = requireSheetAccess(ctx, deps, args.documentId, args.actingMemberId, 'editor');
    const sessionId = sessionOf(deps, args.sessionId);
    const held = requireSheetLease(ctx, deps, a, sessionId, args.leaseEpoch);
    if (!sheetSeqIsNew(deps, held, args.seq)) return;
    const size = args.payload.length;
    if (size === 0) throw sheetError(deps, 'invalid', 'Empty edit');
    if (size > deps.sheetLimits.updateMaxBytes) throw sheetError(deps, 'too_large', 'Edit is too large to sync');
    if (!isGzipBytes(args.payload)) throw sheetError(deps, 'invalid', 'Not a spreadsheet edit');
    const snap = ctx.db.documentSnapshot.documentId.find(a.doc.id);
    if (snap && snap.throughUpdateId > args.baseUpdateId) throw sheetError(deps, 'stale', 'Spreadsheet changed');
    // A row of another session past the base. One compacted away is ≤ the snapshot's throughUpdateId, which the check above covers.
    if (held.logOtherMaxId > args.baseUpdateId) throw sheetError(deps, 'stale', 'Spreadsheet changed');
    if (held.logRows >= SHEET_LOG_MAX_ROWS || held.logBytes + BigInt(size) > BigInt(SHEET_LOG_MAX_BYTES)) {
      throw sheetError(deps, 'too_large', 'Spreadsheet needs compaction');
    }
    ctx.db.documentUpdate.insert({
      id: 0n, documentId: a.doc.id, organizationId: a.doc.organizationId, payload: args.payload, byteLength: size,
      sessionId, memberId: a.actorMemberId, createdAt: ctx.timestamp,
    });
    lease(ctx).update({ ...held, lastSeq: args.seq, lastEditAt: ctx.timestamp, heartbeatAt: ctx.timestamp,
      logBytes: held.logBytes + BigInt(size), logRows: held.logRows + 1 });
    addDriveUsage(ctx, a.doc.organizationId, { sheetBytes: BigInt(size) });
    deps.touchDocument(ctx, a.doc, a.actorMemberId);
  });

  /**
   * compactDocument's contract, lease-fenced: `state` covers every update id ≤
   * throughUpdateId, which must STRICTLY advance (else a silent no-op) and not
   * pass the log. Never refused by the org budget.
   */
  const compactSheet = spacetimedb.reducer({
    documentId: t.string(), sessionId: t.string(), leaseEpoch: t.u64(), throughUpdateId: t.u64(), state: t.byteArray(),
    plainText: t.string(), cellCount: t.u32(), actingMemberId: t.string(),
  }, (ctx, args) => {
    const a = requireSheetAccess(ctx, deps, args.documentId, args.actingMemberId, 'editor');
    const held = requireSheetLease(ctx, deps, a, sessionOf(deps, args.sessionId), args.leaseEpoch);
    checkSheetState(deps, args.state);
    const current = ctx.db.documentSnapshot.documentId.find(a.doc.id);
    if (current && args.throughUpdateId <= current.throughUpdateId) return;
    const rows = [...ctx.db.documentUpdate.byDocumentId.filter(a.doc.id)];
    let maxId = current ? current.throughUpdateId : 0n;
    for (const row of rows) if (row.id > maxId) maxId = row.id;
    if (args.throughUpdateId > maxId) throw sheetError(deps, 'invalid', 'Snapshot is ahead of the edit log');
    writeSheetSnapshot(ctx, deps, a, current, args.state, args.throughUpdateId, args.plainText, args.cellCount);
    const covered = rows.filter((row) => row.id <= args.throughUpdateId);
    for (const row of covered) ctx.db.documentUpdate.delete(row);
    const dropped = covered.reduce((sum, row) => sum + BigInt(row.byteLength), 0n);
    const kept = rows.filter((row) => row.id > args.throughUpdateId);
    addDriveUsage(ctx, a.doc.organizationId, { sheetBytes: BigInt(args.state.length) - BigInt(current?.byteLength ?? 0) - dropped });
    lease(ctx).update({ ...held, heartbeatAt: ctx.timestamp, logRows: kept.length,
      logBytes: kept.reduce((sum, row) => sum + BigInt(row.byteLength), 0n) });
  });

  /**
   * Replace the whole content (version restore, "replace this spreadsheet", an
   * oversize edit). Shares the push seq stream. A throw-away marker row takes a
   * fresh update id and the whole log goes, so the snapshot's throughUpdateId
   * is past every client's base: all of them reload.
   */
  const resetSheetContent = spacetimedb.reducer({
    documentId: t.string(), sessionId: t.string(), leaseEpoch: t.u64(), seq: t.u64(), state: t.byteArray(),
    plainText: t.string(), cellCount: t.u32(), actingMemberId: t.string(),
  }, (ctx, args) => {
    const a = requireSheetAccess(ctx, deps, args.documentId, args.actingMemberId, 'editor');
    const sessionId = sessionOf(deps, args.sessionId);
    const held = requireSheetLease(ctx, deps, a, sessionId, args.leaseEpoch);
    if (!sheetSeqIsNew(deps, held, args.seq)) return;
    checkSheetState(deps, args.state);
    const current = ctx.db.documentSnapshot.documentId.find(a.doc.id);
    const growth = BigInt(args.state.length) - sheetBytesOfDocument(ctx, a.doc.id).live;
    assertSheetBytesFitIn(ctx, deps, a.doc.organizationId, growth);
    const marker = ctx.db.documentUpdate.insert({
      id: 0n, documentId: a.doc.id, organizationId: a.doc.organizationId, payload: new Uint8Array(0), byteLength: 0,
      sessionId, memberId: a.actorMemberId, createdAt: ctx.timestamp,
    });
    for (const row of [...ctx.db.documentUpdate.byDocumentId.filter(a.doc.id)]) ctx.db.documentUpdate.delete(row);
    writeSheetSnapshot(ctx, deps, a, current, args.state, marker.id, args.plainText, args.cellCount);
    addDriveUsage(ctx, a.doc.organizationId, { sheetBytes: growth });
    lease(ctx).update({ ...held, lastSeq: args.seq, lastEditAt: ctx.timestamp, heartbeatAt: ctx.timestamp,
      logBytes: 0n, logRows: 0, logOtherMaxId: 0n });
    deps.touchDocument(ctx, ctx.db.document.id.find(a.doc.id) ?? a.doc, a.actorMemberId);
  });

  /**
   * 'auto' and 'restore' need the lease; 'named' needs editor only. Autos keep
   * saveDocumentVersion's 10-minute gap and same-state skip; the prune plan
   * bounds autos and bytes per sheet. An auto that does not fit is skipped; a
   * named or restore one is refused ([sheet.versions_full] / [sheet.quota]).
   */
  const saveSheetVersion = spacetimedb.reducer({
    documentId: t.string(), sessionId: t.string(), leaseEpoch: t.u64(), kind: t.string(), name: t.option(t.string()),
    state: t.byteArray(), throughUpdateId: t.u64(), cellCount: t.u32(), actingMemberId: t.string(),
  }, (ctx, args) => {
    const a = requireSheetAccess(ctx, deps, args.documentId, args.actingMemberId, 'editor');
    const kind = args.kind;
    if (kind !== 'auto' && kind !== 'named' && kind !== 'restore') throw sheetError(deps, 'invalid', 'Unknown version kind');
    if (kind !== 'named') requireSheetLease(ctx, deps, a, sessionOf(deps, args.sessionId), args.leaseEpoch);
    checkSheetState(deps, args.state);
    const name = args.name ? args.name.replace(/\s+/g, ' ').trim().slice(0, deps.sheetLimits.versionNameMax) : '';
    if (kind === 'named' && !name) throw sheetError(deps, 'invalid', 'Named versions need a name');
    const org = a.doc.organizationId;
    const versions = [...ctx.db.documentVersion.byDocumentId.filter(a.doc.id)];
    const at = (v: (typeof versions)[number]): bigint => deps.timestampMicros(v.createdAt);
    if (kind === 'auto') {
      const latest = versions.filter((v) => v.kind === 'auto').sort((x, y) => (at(y) > at(x) ? 1 : at(y) < at(x) ? -1 : 0))[0];
      if (latest && (deps.timestampMicros(ctx.timestamp) - at(latest) < deps.sheetLimits.autoVersionGapMicros
          || (latest.throughUpdateId === args.throughUpdateId && latest.byteLength === args.state.length))) return;
    } else if (versions.filter((v) => v.kind !== 'auto').length >= deps.sheetLimits.namedVersionMax) {
      throw sheetError(deps, 'versions_full', 'Too many saved versions — delete some first');
    }
    const stateOf = (id: string) => ctx.db.documentVersionState.versionId.find(id);
    const meta = versions.map((v) => ({
      id: v.id.toString(), kind: v.kind, byteLength: stateOf(v.id.toString())?.byteLength ?? 0, createdMicros: at(v) }));
    const plan = sheetVersionPrunePlan(meta, { kind, byteLength: args.state.length });
    if (!plan.accept && kind === 'auto') return;
    if (!plan.accept) throw sheetError(deps, 'versions_full', 'Version history is full');
    const freed = meta.filter((m) => plan.deleteIds.includes(m.id)).reduce((sum, m) => sum + BigInt(m.byteLength), 0n);
    const growth = BigInt(args.state.length) - freed;
    if (kind === 'auto' && !sheetBytesFit(driveUsageRow(ctx, org).sheetBytes, growth)) return;
    assertSheetBytesFitIn(ctx, deps, org, growth);
    for (const v of versions.filter((x) => plan.deleteIds.includes(x.id.toString()))) {
      ctx.db.documentVersion.delete(v);
      const state = stateOf(v.id.toString());
      if (state) ctx.db.documentVersionState.delete(state);
    }
    const versionId = ctx.newUuidV4();
    ctx.db.documentVersion.insert({
      id: versionId, documentId: a.doc.id, organizationId: org, kind, name: name || undefined, state: new Uint8Array(0),
      throughUpdateId: args.throughUpdateId, byteLength: args.state.length, wordCount: args.cellCount,
      createdAt: ctx.timestamp, createdByMemberId: a.actorMemberId,
    });
    ctx.db.documentVersionState.insert({
      versionId: versionId.toString(), documentId: a.doc.id, organizationId: org, state: args.state, byteLength: args.state.length });
    addDriveUsage(ctx, org, { sheetBytes: growth });
  });

  return {
    acquireSheetLease, heartbeatSheetLease, releaseSheetLease, declineSheetLeaseRequest, cancelSheetLeaseRequest,
    pushSheetOps, compactSheet, resetSheetContent, saveSheetVersion,
  };
}
