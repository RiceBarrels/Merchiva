// Spreadsheet write wrappers: the edit lease, the op log, compaction, reset and versions
// (spacetimedb/src/drive/sheets.ts, sheets.md §7.1). New spreadsheets are created through createDriveDocument
// (./drive.ts); renames, stars and sharing are the kind-agnostic Docs wrappers in lib/spacetimedb/actions.ts.
//
// A sibling of lib/spacetimedb/actions.ts, which stays untouched: import these from
// "@/lib/spacetimedb/actions/sheets" (the sync engine reaches them through lib/sheets/sync/transport.ts).
//
// Like the Docs and Drive blocks, calls go straight to the reducers and never through `mutationQueue`: the sheet
// push queue retries on its own, and the module's per-lease `seq` makes a retried batch idempotent. Arguments are one
// object keyed by the generated camelCase names; ids are lowercased and `cellCount` clamped to u32 here.
//
// Failures reject with the module's `[sheet.<code>] …` / `[doc.<code>] …` / `[drive.<code>] …` message, or with:
// - SheetOfflineError (`[sheet.offline]`) when there is no live connection, and when the socket closes before the
//   server answered: a reducer call on a dead SpacetimeDB connection never settles (the SDK queues it, and the app
//   builds a new connection instead of reviving the old one);
// - `[doc.not_published] …` when the connected bindings lack the reducer;
// - `[sheet.invalid] …` for a u64 argument out of range.
// sheetOrDocErrorKey (lib/sheets/errors.ts) turns any of them into copy.

import { isDocConnectionDown, onDocConnectionDown } from "@/lib/docs/connection";
import { SheetOfflineError } from "@/lib/sheets/errors";
import { getConnection } from "@/lib/spacetimedb/client";

/** Who acts: '' / null / absent = the caller; the store tablet passes its PIN operator. */
export interface SheetActing { actingMemberId?: string | null }
/** One editor session on one spreadsheet. */
export interface SheetSessionRef { documentId: string; sessionId: string }
/** Fenced by the lease grant the session holds (or, for a decline, the grant the request was made against). */
export interface SheetLeaseEpochInput extends SheetSessionRef, SheetActing { leaseEpoch: bigint }
export interface SheetPushInput extends SheetLeaseEpochInput { seq: bigint; baseUpdateId: bigint; payload: Uint8Array }
export interface SheetCompactInput extends SheetLeaseEpochInput {
  throughUpdateId: bigint; state: Uint8Array; plainText: string; cellCount: number;
}
export interface SheetResetInput extends SheetLeaseEpochInput { seq: bigint; state: Uint8Array; plainText: string; cellCount: number }
export type SheetVersionKind = "auto" | "named" | "restore";
export interface SheetSaveVersionInput extends SheetLeaseEpochInput {
  kind: SheetVersionKind; name?: string; state: Uint8Array; throughUpdateId: bigint; cellCount: number;
}

type ReducerCall = (args: Record<string, unknown>) => Promise<void>;
type ReducerFn = (this: unknown, args: Record<string, unknown>) => unknown;
type RawConnection = NonNullable<ReturnType<typeof getConnection>>;

const U64_MAX = (1n << 64n) - 1n;

/** Settles like `call`, or rejects with SheetOfflineError once `connection` closes first. */
function untilSettledOrDown<T>(connection: RawConnection, call: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stop = onDocConnectionDown(connection, () => {
      reject(new SheetOfflineError("[sheet.offline] The connection closed before the server answered"));
    });
    let pending: Promise<T>;
    try {
      pending = call();
    } catch (err) {
      stop();
      reject(err);
      return;
    }
    pending.then(
      (value) => {
        stop();
        resolve(value);
      },
      (err: unknown) => {
        stop();
        reject(err);
      },
    );
  });
}

/**
 * Runs `call` on the live app connection with the sheet offline rules above. lib/sheets/sync/transport.ts wraps the
 * Docs presence wrappers with it, so every sheet round trip fails the same way.
 */
export function whileSheetConnectionLive<T>(call: () => Promise<T>): Promise<T> {
  const connection = getConnection();
  if (!connection || isDocConnectionDown(connection)) return Promise.reject(new SheetOfflineError());
  return untilSettledOrDown(connection, call);
}

/** The live connection's reducer `name`, or a SheetOfflineError / `[doc.not_published]` error. */
function sheetsReducer(name: string): ReducerCall {
  const connection = getConnection();
  if (!connection || isDocConnectionDown(connection)) throw new SheetOfflineError();
  const reducers = connection.reducers as unknown as Record<string, unknown> | undefined;
  const reducer = reducers?.[name];
  if (typeof reducer !== "function") {
    throw new Error(
      `[doc.not_published] Reducer "${name}" is not available. Publish the module and run \`spacetime generate\` to enable Sheets.`,
    );
  }
  return (args) =>
    untilSettledOrDown(connection, async () => {
      await (reducer as ReducerFn).call(reducers, args);
    });
}

/** Document ids and session ids are lowercase on the server. */
function idKey(id: string): string {
  return String(id ?? "").trim().toLowerCase();
}

function actingOf(input: SheetActing): string {
  return String(input.actingMemberId ?? "").trim();
}

/** u32 reducer args: finite, non-negative integers. */
function u32(value: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 0xffffffff) : 0;
}

/** u64 reducer args: a bigint in range, else `[sheet.invalid]` (a wrong seq or epoch must never be clamped). */
function u64(value: bigint, field: string): bigint {
  let n: bigint;
  try {
    n = typeof value === "bigint" ? value : BigInt(value as unknown as string);
  } catch {
    throw new Error(`[sheet.invalid] ${field} is not an integer`);
  }
  if (n < 0n || n > U64_MAX) throw new Error(`[sheet.invalid] ${field} is out of range`);
  return n;
}

function sessionArgs(input: SheetSessionRef): { documentId: string; sessionId: string } {
  return { documentId: idKey(input.documentId), sessionId: idKey(input.sessionId) };
}

// ── Lease ────────────────────────────────────────────────────────────────────

/** Takes the lease, rebinds this session's own, or records an edit request (sheets.md §5.1: the server decides). */
export async function acquireSheetLease(input: SheetSessionRef & SheetActing): Promise<void> {
  const call = sheetsReducer("acquireSheetLease");
  await call({ ...sessionArgs(input), actingMemberId: actingOf(input) });
}

/** The holder's 15 s heartbeat. */
export async function heartbeatSheetLease(input: SheetLeaseEpochInput): Promise<void> {
  const call = sheetsReducer("heartbeatSheetLease");
  await call({ ...sessionArgs(input), leaseEpoch: u64(input.leaseEpoch, "leaseEpoch"), actingMemberId: actingOf(input) });
}

/** Gives the lease up (no-op unless this session holds it). */
export async function releaseSheetLease(input: SheetSessionRef): Promise<void> {
  const call = sheetsReducer("releaseSheetLease");
  await call(sessionArgs(input));
}

/** The holder turns down the pending edit request. */
export async function declineSheetLeaseRequest(input: SheetLeaseEpochInput): Promise<void> {
  const call = sheetsReducer("declineSheetLeaseRequest");
  await call({ ...sessionArgs(input), leaseEpoch: u64(input.leaseEpoch, "leaseEpoch"), actingMemberId: actingOf(input) });
}

/** Withdraws this session's own edit request. */
export async function cancelSheetLeaseRequest(input: SheetSessionRef): Promise<void> {
  const call = sheetsReducer("cancelSheetLeaseRequest");
  await call(sessionArgs(input));
}

// ── Content ──────────────────────────────────────────────────────────────────

/** Appends one op batch (encodeSheetOps). Retrying the same (seq, payload) after a lost reply stores it once. */
export async function pushSheetOps(input: SheetPushInput): Promise<void> {
  const call = sheetsReducer("pushSheetOps");
  await call({
    ...sessionArgs(input),
    leaseEpoch: u64(input.leaseEpoch, "leaseEpoch"),
    seq: u64(input.seq, "seq"),
    baseUpdateId: u64(input.baseUpdateId, "baseUpdateId"),
    payload: input.payload,
    actingMemberId: actingOf(input),
  });
}

/** Replaces the snapshot with `state` (encodeSheetSnapshot) and drops the log through `throughUpdateId`. */
export async function compactSheet(input: SheetCompactInput): Promise<void> {
  const call = sheetsReducer("compactSheet");
  await call({
    ...sessionArgs(input),
    leaseEpoch: u64(input.leaseEpoch, "leaseEpoch"),
    throughUpdateId: u64(input.throughUpdateId, "throughUpdateId"),
    state: input.state,
    plainText: input.plainText,
    cellCount: u32(input.cellCount),
    actingMemberId: actingOf(input),
  });
}

/** Replaces the whole content (restore, import into an open sheet); every reader reloads. */
export async function resetSheetContent(input: SheetResetInput): Promise<void> {
  const call = sheetsReducer("resetSheetContent");
  await call({
    ...sessionArgs(input),
    leaseEpoch: u64(input.leaseEpoch, "leaseEpoch"),
    seq: u64(input.seq, "seq"),
    state: input.state,
    plainText: input.plainText,
    cellCount: u32(input.cellCount),
    actingMemberId: actingOf(input),
  });
}

/** Saves a version: `auto` and `restore` need the lease, `named` any editor (and a name). */
export async function saveSheetVersion(input: SheetSaveVersionInput): Promise<void> {
  const call = sheetsReducer("saveSheetVersion");
  await call({
    ...sessionArgs(input),
    leaseEpoch: u64(input.leaseEpoch, "leaseEpoch"),
    kind: input.kind,
    name: input.name ? input.name : undefined,
    state: input.state,
    throughUpdateId: u64(input.throughUpdateId, "throughUpdateId"),
    cellCount: u32(input.cellCount),
    actingMemberId: actingOf(input),
  });
}
