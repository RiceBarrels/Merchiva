// Pure rules of the Sheets server (sheets.md §3.2): the edit-lease state machine,
// version pruning, the org byte budget and the input cleaners. ZERO imports, so
// Bun tests import this file directly and lib/sheets/lease.ts mirrors it in ms
// (parity-tested). Durations are µs bigints, sizes are bytes.
//
// A spreadsheet has at most one writer: the session holding its
// document_edit_lease row. Every grant raises `epoch` and every write carries
// it, so a session that lost the lease can never write again (fencing).

/** The holder heartbeats every 15 s; silent for longer than this → expired. */
export const SHEET_LEASE_TTL_MICROS = 45_000_000n;
/** The holder's socket closed → others may take the lease this long after its last heartbeat. */
export const SHEET_LEASE_DETACHED_GRACE_MICROS = 10_000_000n;
/** A live request wins once it is this old and the holder has not edited since it was made. */
export const SHEET_LEASE_REQUEST_GRACE_MICROS = 30_000_000n;
/** After a release, the lease stays reserved this long for a live requester (measured from heartbeatAt). */
export const SHEET_LEASE_RESERVE_MICROS = 60_000_000n;
/** Safety net: an older request is not live even with its socket open. */
export const SHEET_LEASE_REQUEST_MAX_AGE_MICROS = 600_000_000n;
/** Σ document_update.byteLength of one sheet; the holder must compact before pushing more. */
export const SHEET_LOG_MAX_BYTES = 16_777_216;
/**
 * document_update rows of one sheet; the holder must compact before pushing more. Clients compact
 * at 150 rows, so only one that never compacts meets it; it bounds every walk of a sheet's log
 * (a grant, compactSheet, resetSheetContent). Server-only: a push past it is [sheet.too_large],
 * which the client folds into a reset exactly as for SHEET_LOG_MAX_BYTES.
 */
export const SHEET_LOG_MAX_ROWS = 2_000;
/** Autosaved versions kept per sheet (named and restore versions are never pruned). */
export const SHEET_VERSION_AUTO_KEEP = 10;
/** Σ document_version_state bytes of one sheet (64 MiB). */
export const SHEET_VERSION_MAX_BYTES = 67_108_864;
/** Σ sheet bytes (snapshots + logs + version states) per organization (256 MiB). */
export const SHEET_ORG_MAX_BYTES = 268_435_456n;
/** Longest display name stored on the lease (holderName / requestedByName). */
export const SHEET_NAME_MAX = 80;
/** A client SheetSyncSession id, lowercased. */
export const SHEET_SESSION_ID_RE = /^[a-z0-9-]{8,64}$/;

/** `[sheet.<code>]` error prefixes; lib/sheets/errors.ts maps them to sheets.errors.*. */
export type SheetErrorCode =
  | 'lease' | 'not_sheet' | 'stale' | 'too_large' | 'invalid' | 'sequence' | 'quota' | 'versions_full';

/** gzip member header (1f 8b 08) on a buffer long enough to hold header + trailer. Every sheet payload and state is gzip. */
export function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 18 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08;
}

/** Trimmed + lowercased session id, or null when it does not match SHEET_SESSION_ID_RE. */
export function cleanSheetSessionId(raw: string): string | null {
  const value = String(raw ?? '').trim().toLowerCase();
  return SHEET_SESSION_ID_RE.test(value) ? value : null;
}

/** Collapsed whitespace, trimmed, at most SHEET_NAME_MAX code points. */
export function cleanSheetName(raw: string): string {
  return Array.from(String(raw ?? '').replace(/\s+/g, ' ').trim()).slice(0, SHEET_NAME_MAX).join('');
}

/** The org budget: growth ≤ 0 always fits; otherwise current + growth ≤ SHEET_ORG_MAX_BYTES. */
export function sheetBytesFit(currentOrgBytes: bigint, growth: bigint): boolean {
  return growth <= 0n || currentOrgBytes + growth <= SHEET_ORG_MAX_BYTES;
}

/** Plain view of a lease row (µs). MUST match lib/sheets/lease.ts (ms) — parity test. */
export interface SheetLeaseTimes {
  holderMemberId: string;
  holderActorMemberId: string;
  holderSessionId: string;
  holderConnectionId: string;
  heartbeatMicros: bigint;
  lastEditMicros: bigint;
  requestedBySessionId: string;
  requestedByConnectionId: string;
  requestedMicros: bigint;
}

/** Who asks: the caller's member (the tablet account on /store), the validated actor and the client session. */
export interface SheetLeaseCaller { memberId: string; actorMemberId: string; sessionId: string }
export type SheetLeaseState = 'free' | 'held' | 'detached' | 'expired';
export type SheetLeaseDecision = 'grant' | 'rebind' | 'request' | 'queued';

export function sheetLeaseState(l: SheetLeaseTimes | null, now: bigint): SheetLeaseState {
  if (!l || l.holderMemberId === '') return 'free';
  const idle = now - l.heartbeatMicros;
  if (l.holderConnectionId === '') return idle > SHEET_LEASE_DETACHED_GRACE_MICROS ? 'expired' : 'detached';
  return idle > SHEET_LEASE_TTL_MICROS ? 'expired' : 'held';
}

/** A request counts only while the requester's socket is open and it is younger than 10 min. */
export function sheetRequestLive(l: SheetLeaseTimes | null, now: bigint): boolean {
  return !!l && l.requestedBySessionId !== '' && l.requestedByConnectionId !== ''
    && now - l.requestedMicros < SHEET_LEASE_REQUEST_MAX_AGE_MICROS;
}

/**
 * What acquireSheetLease does for `caller` (sheets.md §5.1):
 * - rebind: the caller's own session holds it (a new connection re-binds; epoch and lastSeq stay);
 * - grant: take it (epoch + 1) — free, expired, the same person on another tab/device, or a ready request;
 * - request: record (or refresh) the caller's request;
 * - queued: someone else's live request or reservation stands; nothing is written.
 */
export function sheetLeaseDecision(l: SheetLeaseTimes | null, now: bigint, caller: SheetLeaseCaller): SheetLeaseDecision {
  if (!l) return 'grant';
  if (l.holderMemberId !== '' && l.holderMemberId === caller.memberId && l.holderSessionId === caller.sessionId) return 'rebind';
  const state = sheetLeaseState(l, now);
  const live = sheetRequestLive(l, now);
  const mine = live && l.requestedBySessionId === caller.sessionId;
  const other = live && !mine;
  // Free after a release: reserved for a live requester for SHEET_LEASE_RESERVE_MICROS after the release.
  if (state === 'free') return other && now - l.heartbeatMicros < SHEET_LEASE_RESERVE_MICROS ? 'queued' : 'grant';
  if (state === 'expired') return other ? 'queued' : 'grant';
  // The same person on another tab or device takes over at once; fencing drops the old session.
  if (l.holderActorMemberId === caller.actorMemberId) return 'grant';
  if (mine) {
    const ready = state === 'held' && now - l.requestedMicros >= SHEET_LEASE_REQUEST_GRACE_MICROS
      && l.lastEditMicros < l.requestedMicros;
    return ready ? 'grant' : 'request';
  }
  return other ? 'queued' : 'request';
}

/** One stored version of a sheet, for pruning. */
export interface SheetVersionMeta { id: string; kind: string; byteLength: number; createdMicros: bigint }

/**
 * Which versions to delete so that autos ≤ SHEET_VERSION_AUTO_KEEP (counting an
 * incoming auto) and Σ bytes ≤ SHEET_VERSION_MAX_BYTES, oldest autos first.
 * Named and restore versions are never deleted. accept = false when the named /
 * restore bytes alone plus the incoming state pass the budget: a named or
 * restore version is then refused, an auto one skipped (deleteIds = []).
 */
export function sheetVersionPrunePlan(
  existing: readonly SheetVersionMeta[], incoming: { kind: string; byteLength: number },
): { accept: boolean; deleteIds: string[] } {
  const keptBytes = existing.reduce((sum, v) => (v.kind === 'auto' ? sum : sum + v.byteLength), 0);
  if (keptBytes + incoming.byteLength > SHEET_VERSION_MAX_BYTES) return { accept: false, deleteIds: [] };
  const autos = existing.filter((v) => v.kind === 'auto').sort((a, b) =>
    a.createdMicros < b.createdMicros ? -1 : a.createdMicros > b.createdMicros ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const incomingAuto = incoming.kind === 'auto';
  let total = keptBytes + incoming.byteLength + autos.reduce((sum, v) => sum + v.byteLength, 0);
  let autoCount = autos.length + (incomingAuto ? 1 : 0);
  const deleteIds: string[] = [];
  for (const v of autos) {
    if (!(incomingAuto && autoCount > SHEET_VERSION_AUTO_KEEP) && total <= SHEET_VERSION_MAX_BYTES) break;
    deleteIds.push(v.id);
    total -= v.byteLength;
    autoCount--;
  }
  return { accept: true, deleteIds };
}
