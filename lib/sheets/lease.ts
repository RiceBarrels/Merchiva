// Client mirror of the spreadsheet edit lease (sheets.md §5). The rules are the server's
// (spacetimedb/src/drive/sheet-logic.ts, µs bigints) in milliseconds; lease-parity.test.ts compares the two
// over a generated grid. Clients never decide alone: the view only picks which button to show, and
// acquireSheetLease decides. Clock skew only delays a button.

/** The holder heartbeats every 15 s; silent for longer than this → expired. */
export const SHEET_LEASE_TTL_MS = 45_000;
/** The holder's socket closed → others may take the lease this long after its last heartbeat. */
export const SHEET_LEASE_DETACHED_GRACE_MS = 10_000;
/** A live request wins once it is this old and the holder has not edited since it was made. */
export const SHEET_LEASE_REQUEST_GRACE_MS = 30_000;
/** After a release, the lease stays reserved this long for a live requester. */
export const SHEET_LEASE_RESERVE_MS = 60_000;
/** An older request is not live even with its socket open. */
export const SHEET_LEASE_REQUEST_MAX_AGE_MS = 600_000;
/** Client timers (§5.3). */
export const SHEET_LEASE_HEARTBEAT_MS = 15_000;
export const SHEET_LEASE_IDLE_RELEASE_MS = 300_000;
export const SHEET_LEASE_HIDDEN_RELEASE_MS = 120_000;

/** A `document_edit_lease` row after mapping (lib/sheets/mappers.ts mapLeaseRow). */
export interface SheetLeaseRow {
  documentId: string;
  organizationId: string;
  epoch: bigint;
  /** The caller's member (the tablet account on /store); '' = free. */
  holderMemberId: string;
  /** The validated actor (the PIN operator on /store; else = holderMemberId). */
  holderActorMemberId: string;
  holderSessionId: string;
  /** '' = the holder's socket closed (detached). */
  holderConnectionId: string;
  /** Server-derived display name of the holder's actor. */
  holderName: string;
  acquiredAt: Date;
  /** Last heartbeat / write; the release time once free. */
  heartbeatAt: Date;
  lastEditAt: Date;
  lastSeq: bigint;
  /** '' = no request. */
  requestedByMemberId: string;
  requestedByActorMemberId: string;
  requestedBySessionId: string;
  /** Cleared when the requester's socket closes. */
  requestedByConnectionId: string;
  requestedByName: string;
  requestedAt: Date;
}

/** Who is looking: the caller's member, the acting member, this client's session, and whether they may edit. */
export interface SheetLeaseMe {
  memberId: string;
  actorMemberId: string;
  sessionId: string;
  canEdit: boolean;
}

export type SheetLeaseState = "free" | "held" | "detached" | "expired";
export type SheetLeaseDecision = "grant" | "rebind" | "request" | "queued";

export type SheetLeaseView =
  | { kind: "loading" }
  | { kind: "cannot_edit" }
  | { kind: "mine"; epoch: bigint; lastSeq: bigint; request: { name: string; sinceMs: number } | null }
  | { kind: "free"; reservedForName: string | null; reservedForMe: boolean }
  | {
      kind: "other";
      holderName: string;
      samePerson: boolean;
      state: "held" | "detached" | "expired";
      myRequest: "none" | "pending" | "ready";
      otherRequestName: string | null;
    };

const ms = (date: Date) => date.getTime();

export function sheetLeaseState(row: SheetLeaseRow | null, nowMs: number): SheetLeaseState {
  if (!row || row.holderMemberId === "") return "free";
  const idle = nowMs - ms(row.heartbeatAt);
  if (row.holderConnectionId === "") return idle > SHEET_LEASE_DETACHED_GRACE_MS ? "expired" : "detached";
  return idle > SHEET_LEASE_TTL_MS ? "expired" : "held";
}

/** A request counts only while the requester's socket is open and it is younger than 10 min. */
export function sheetRequestLive(row: SheetLeaseRow | null, nowMs: number): boolean {
  return !!row && row.requestedBySessionId !== "" && row.requestedByConnectionId !== ""
    && nowMs - ms(row.requestedAt) < SHEET_LEASE_REQUEST_MAX_AGE_MS;
}

/** What acquireSheetLease will do for `me` (sheets.md §5.1). */
export function sheetLeaseDecision(
  row: SheetLeaseRow | null, nowMs: number, me: Omit<SheetLeaseMe, "canEdit">,
): SheetLeaseDecision {
  if (!row) return "grant";
  if (row.holderMemberId !== "" && row.holderMemberId === me.memberId && row.holderSessionId === me.sessionId) return "rebind";
  const state = sheetLeaseState(row, nowMs);
  const live = sheetRequestLive(row, nowMs);
  const mine = live && row.requestedBySessionId === me.sessionId;
  const other = live && !mine;
  if (state === "free") return other && nowMs - ms(row.heartbeatAt) < SHEET_LEASE_RESERVE_MS ? "queued" : "grant";
  if (state === "expired") return other ? "queued" : "grant";
  if (row.holderActorMemberId === me.actorMemberId) return "grant";
  if (mine) {
    const ready = state === "held" && nowMs - ms(row.requestedAt) >= SHEET_LEASE_REQUEST_GRACE_MS
      && ms(row.lastEditAt) < ms(row.requestedAt);
    return ready ? "grant" : "request";
  }
  return other ? "queued" : "request";
}

/**
 * The lease as this client should present it. "mine" needs the same member, session AND actor: another
 * operator on the holder's own session is a fresh grant on the server (sheets.ts), not a continuation.
 * Never returns "loading": the session reports that until its subscription has applied.
 */
export function sheetLeaseView(row: SheetLeaseRow | null, nowMs: number, me: SheetLeaseMe): SheetLeaseView {
  if (!me.canEdit) return { kind: "cannot_edit" };
  const state = sheetLeaseState(row, nowMs);
  const live = sheetRequestLive(row, nowMs);
  if (!row || state === "free") {
    // Reserved = what makes the server answer "queued" to everyone but the requester.
    if (!row || !live || nowMs - ms(row.heartbeatAt) >= SHEET_LEASE_RESERVE_MS) {
      return { kind: "free", reservedForName: null, reservedForMe: false };
    }
    const forMe = row.requestedBySessionId === me.sessionId;
    return { kind: "free", reservedForName: forMe ? null : row.requestedByName, reservedForMe: forMe };
  }
  const requestIsMine = live && row.requestedBySessionId === me.sessionId;
  if (row.holderMemberId === me.memberId && row.holderSessionId === me.sessionId && row.holderActorMemberId === me.actorMemberId) {
    const request = live && !requestIsMine ? { name: row.requestedByName, sinceMs: ms(row.requestedAt) } : null;
    return { kind: "mine", epoch: row.epoch, lastSeq: row.lastSeq, request };
  }
  let myRequest: "none" | "pending" | "ready" = "none";
  if (requestIsMine) myRequest = sheetLeaseDecision(row, nowMs, me) === "grant" ? "ready" : "pending";
  return {
    kind: "other",
    holderName: row.holderName,
    samePerson: row.holderActorMemberId === me.actorMemberId,
    state,
    myRequest,
    otherRequestName: live && !requestIsMine ? row.requestedByName : null,
  };
}
