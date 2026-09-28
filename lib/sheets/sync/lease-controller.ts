// The edit lease as one session sees it (sheets.md §5): the view, when to call acquireSheetLease, the 15 s heartbeat,
// the idle / hidden release clocks and the hand-over prompt. The server decides every grant (sheet-logic.ts); this
// only calls it at the right moments (the user asks, auto-acquire on open, a request turns ready, a reservation for
// this session appears, the holder is gone) and follows the lease row. "Held": the row names this session (member,
// actor, session) under one epoch; "bound": it also names this session's current connection, which every write
// needs. A held lease on a closed socket is re-bound after the reconnect; another holder or epoch is a lost lease.
// Pure: no React, no Univer runtime.

import { docErrorCode } from "@/lib/docs/errors";
import {
  SHEET_LEASE_DETACHED_GRACE_MS, SHEET_LEASE_HEARTBEAT_MS, SHEET_LEASE_HIDDEN_RELEASE_MS, SHEET_LEASE_IDLE_RELEASE_MS,
  SHEET_LEASE_REQUEST_GRACE_MS, SHEET_LEASE_REQUEST_MAX_AGE_MS, SHEET_LEASE_RESERVE_MS, SHEET_LEASE_TTL_MS,
  sheetLeaseDecision, sheetLeaseView, sheetRequestLive, type SheetLeaseMe, type SheetLeaseRow, type SheetLeaseView,
} from "@/lib/sheets/lease";
import { sheetErrorCode } from "@/lib/sheets/errors";
import { SHEET_TIMERS, type SheetTimers } from "./push-queue";
import type { SheetTransport } from "./transport";

/** Why this session gave the lease up. */
export type SheetReleaseReason = "done" | "hand_over" | "idle" | "hidden" | "parked" | "can_not_edit";

/** Two acquire calls are at least this far apart (a skewed clock must not turn "grant" ⇄ "request" into a loop). */
export const SHEET_ACQUIRE_MIN_GAP_MS = 2_000;

export const LOADING_VIEW: SheetLeaseView = Object.freeze({ kind: "loading" }) as SheetLeaseView;

export interface SheetLeaseHost {
  connectionId(): string; // once its subscription applied; '' while detached
  ready(): boolean; // a subscription applied at least once (before that the view is "loading")
  /** A model is bound and loaded (the idle release needs one). */
  modelLoaded(): boolean;
  parked(): boolean; // the editor unmounted (a request then hands over at once)
  /** Auto-acquire is allowed now: the option is on, the model is loaded and not diverged or outdated. */
  mayAutoAcquire(): boolean;
  viewChanged(view: SheetLeaseView): void;
  /** The row newly names this session under `epoch` (a grant, or a held lease seen again). */
  granted(epoch: bigint): void;
  /** Held and bound to this connection: writes under `epoch` may go; `lastSeq` is the row's. `rebound`: a new binding
   *  (a grant, a re-bind after a reconnect or a fencing), not the same one seen again in a row update. */
  writable(epoch: bigint, lastSeq: bigint, rebound: boolean): void;
  /** Held, and the row moved on (another holder, another epoch, or no holder): the §5.6 flow. */
  lost(row: SheetLeaseRow | null): void;
  /** Someone asked to edit while this session holds the lease. */
  requested(request: { name: string; deadlineMs: number }): void;
  /** The idle / hidden clock ran out, or a request reached a parked session: flush → compact → release. */
  release(reason: SheetReleaseReason): void;
  /** A lease call failed (access loss, the operator's session…). */
  failed(err: unknown): void;
}

export interface SheetLeaseControllerOptions {
  documentId: string;
  sessionId: string;
  me(): SheetLeaseMe;
  actingMemberId(): string;
  transport: Pick<SheetTransport, "acquireLease" | "heartbeatLease" | "releaseLease" | "declineLeaseRequest" | "cancelLeaseRequest">;
  host: SheetLeaseHost;
  now?: () => number;
  timers?: SheetTimers;
}

type TimerKey = "heartbeatTimer" | "deadlineTimer" | "idleTimer" | "hiddenTimer";
type TimerHandle = ReturnType<typeof setTimeout>;

const viewKey = (view: SheetLeaseView): string => JSON.stringify(view, (_k, v: unknown) => (typeof v === "bigint" ? `${v}n` : v));

export class SheetLeaseController {
  private readonly opts: SheetLeaseControllerOptions;
  private readonly host: SheetLeaseHost;
  private readonly now: () => number;
  private readonly timers: SheetTimers;
  private row: SheetLeaseRow | null = null;
  private viewValue: SheetLeaseView = LOADING_VIEW;
  private viewSignature = viewKey(LOADING_VIEW);
  private held: { epoch: bigint } | null = null;
  private bound = false;
  private wantEdit = false;
  private autoPending = true;
  /** The grant this session released while the row may still show it (a release lost to a closed socket is resent). */
  private releasedEpoch: bigint | null = null;
  /** The connection the release went out on: it is resent only from another one (the reply may never come). */
  private releasedOn = "";
  private releaseCall: Promise<void> | null = null;
  private acquiring: Promise<void> | null = null;
  /** `[sheet.lease]` answers since the last committed write: the second one means the lease is gone. */
  private fencedStrikes = 0;
  private lastAcquireAt = Number.NEGATIVE_INFINITY;
  /** A throttled acquire waits for this time (0: none). */
  private acquireRetryAt = 0;
  private lastRequestKey = "";
  private hidden = false;
  private disposed = false;
  private heartbeatTimer: TimerHandle | null = null;
  private deadlineTimer: TimerHandle | null = null;
  private idleTimer: TimerHandle | null = null;
  private hiddenTimer: TimerHandle | null = null;

  constructor(opts: SheetLeaseControllerOptions) {
    this.opts = opts;
    this.host = opts.host;
    this.now = opts.now ?? Date.now;
    this.timers = opts.timers ?? SHEET_TIMERS;
  }

  get view(): SheetLeaseView { return this.viewValue; }
  get leaseRow(): SheetLeaseRow | null { return this.row; }
  /** The epoch this session writes under, or null. */
  get heldEpoch(): bigint | null { return this.held?.epoch ?? null; }
  /** Held and bound to the current connection: the server accepts this session's writes. */
  get isBound(): boolean { return this.held !== null && this.bound; }

  /** The document's lease row (null: none) as the cache holds it now. */
  observe(row: SheetLeaseRow | null): void {
    this.row = row;
    this.evaluate();
  }

  /** Re-run every rule (connection, readiness, access or model changed). */
  evaluate(): void {
    if (this.disposed) return;
    const me = this.opts.me();
    const row = this.row;
    const connection = this.host.connectionId();
    const names = !!row && row.holderMemberId !== "" && row.holderMemberId === me.memberId
      && row.holderSessionId === me.sessionId && row.holderActorMemberId === me.actorMemberId;
    // The grant this session gave up, still on the row until the release lands; a newer epoch is a new grant.
    const released = names && !!row && row.epoch === this.releasedEpoch;
    if (this.held && connection !== "") {
      if (!row || !names || row.epoch !== this.held.epoch) {
        this.dropHeld();
        this.host.lost(row);
      } else {
        this.bindTo(row, connection);
      }
    } else if (!this.held && names && row && !released && connection !== "" && me.canEdit) {
      this.held = { epoch: row.epoch };
      this.bound = false;
      this.wantEdit = false;
      this.autoPending = false;
      this.releasedEpoch = null;
      this.host.granted(row.epoch);
      this.armHeartbeat();
      this.noteActivity();
      if (this.hidden) this.setHidden(true);
      this.bindTo(row, connection);
    }
    if (this.releasedEpoch !== null && connection !== "") {
      if (!released) this.releasedEpoch = null;
      else if (!this.releaseCall && connection !== this.releasedOn) void this.sendRelease(); // lost to a closed socket
    }
    this.refreshView(me);
    this.maybeAcquire(me, connection);
    this.checkRequest();
  }

  /** "Edit" / "Ask to edit": acquire now (grant, rebind or a recorded request). Rejects when the call fails. */
  requestEdit(): Promise<void> {
    if (this.held) return Promise.resolve();
    this.wantEdit = true;
    this.autoPending = false;
    return this.acquire(true);
  }

  /** A model was bound (an open, or a return to a parked session): auto-acquire may run once more. */
  rearmAutoAcquire(): void { this.autoPending = true; }

  /** Withdraw this session's request (and stop wanting the lease). */
  async cancelRequest(): Promise<void> {
    this.wantEdit = false;
    if (this.row?.requestedBySessionId !== this.opts.sessionId) return;
    await this.opts.transport.cancelLeaseRequest({ documentId: this.opts.documentId, sessionId: this.opts.sessionId });
  }

  /** "Keep editing": turn the pending request down. */
  async declineRequest(): Promise<void> {
    if (!this.held) return;
    await this.opts.transport.declineLeaseRequest({
      documentId: this.opts.documentId, sessionId: this.opts.sessionId, leaseEpoch: this.held.epoch,
      actingMemberId: this.opts.actingMemberId(),
    });
  }

  /** Give the lease up (the caller flushed and compacted first). Idempotent; retried after a reconnect. */
  release(): Promise<void> {
    if (!this.held) return this.releaseCall ?? Promise.resolve();
    this.releasedEpoch = this.held.epoch;
    this.dropHeld();
    this.wantEdit = false;
    return this.sendRelease();
  }

  /**
   * A write or heartbeat came back `[sheet.lease]`: re-bind and retry once (sheets.md §5.6). A second refusal before
   * any write lands means the lease is gone even if the cached row has not caught up yet.
   */
  fenced(): void {
    if (!this.held) return;
    if (++this.fencedStrikes > 1) {
      const row = this.row;
      this.dropHeld();
      this.host.lost(row);
      return;
    }
    this.bound = false;
    void this.acquire(true).catch(() => {});
  }

  /** A write of this grant committed: fencing strikes start over. */
  writeCommitted(): void { this.fencedStrikes = 0; }

  /** A captured edit: restarts the 5-min idle release clock. */
  noteActivity(): void {
    if (!this.held || this.disposed) return;
    this.clear("idleTimer");
    this.idleTimer = this.timers.setTimeout(() => {
      this.idleTimer = null;
      if (!this.held) return;
      if (this.host.modelLoaded()) this.host.release("idle");
      else this.noteActivity(); // no model to compact from right now: ask again later
    }, SHEET_LEASE_IDLE_RELEASE_MS);
  }

  /** An idle / hidden release could not flush (offline, a halted queue): its clock runs again, so it is retried. */
  releaseDeferred(reason: SheetReleaseReason): void {
    if (reason === "idle") this.noteActivity();
    else if (reason === "hidden" && this.hidden) this.setHidden(true);
  }

  /** The page was hidden (true) or shown: 2 min hidden releases the lease. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.clear("hiddenTimer");
    if (!hidden || !this.held) return;
    this.hiddenTimer = this.timers.setTimeout(() => {
      this.hiddenTimer = null;
      if (this.held && this.hidden) this.host.release("hidden");
    }, SHEET_LEASE_HIDDEN_RELEASE_MS);
  }

  /** Forget the lease locally without a call (access lost). */
  forget(): void {
    this.dropHeld();
    this.wantEdit = false;
  }

  dispose(): void {
    this.disposed = true;
    for (const key of ["heartbeatTimer", "deadlineTimer", "idleTimer", "hiddenTimer"] as const) this.clear(key);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private bindTo(row: SheetLeaseRow, connection: string): void {
    const epoch = row.epoch;
    const wasBound = this.bound;
    this.bound = row.holderConnectionId === connection;
    if (this.bound) this.host.writable(epoch, row.lastSeq, !wasBound);
    else if (!this.acquiring) void this.acquire(false).catch(() => {}); // rebind to this connection
    if (this.bound && !wasBound) this.armHeartbeat();
  }

  private dropHeld(): void {
    this.held = null;
    this.bound = false;
    this.fencedStrikes = 0;
    this.clear("heartbeatTimer");
    this.clear("idleTimer");
    this.clear("hiddenTimer");
  }

  private refreshView(me: SheetLeaseMe): void {
    const view = this.host.ready() ? sheetLeaseView(this.row, this.now(), me) : LOADING_VIEW;
    const signature = viewKey(view);
    if (signature !== this.viewSignature) {
      this.viewValue = view;
      this.viewSignature = signature;
      this.host.viewChanged(view);
    }
    this.armDeadline();
  }

  private maybeAcquire(me: SheetLeaseMe, connection: string): void {
    if (this.held || this.acquiring || connection === "" || !me.canEdit || !this.host.ready()) return;
    const row = this.row;
    const now = this.now();
    if (this.wantEdit) {
      const decision = sheetLeaseDecision(row, now, me);
      const recorded = !!row && row.requestedBySessionId === me.sessionId && sheetRequestLive(row, now);
      if (decision === "grant" || decision === "rebind" || (decision === "request" && !recorded)) void this.acquire(false).catch(() => {});
      return;
    }
    if (!this.autoPending || this.releasedEpoch !== null || !this.host.mayAutoAcquire()) return;
    this.autoPending = false;
    const view = this.viewValue;
    const open = (view.kind === "free" && view.reservedForName === null)
      || (view.kind === "other" && view.state === "expired" && !view.samePerson && view.otherRequestName === null);
    if (!open) return;
    this.wantEdit = true;
    void this.acquire(false).catch(() => {});
  }

  /** One acquireSheetLease at a time, ≥ SHEET_ACQUIRE_MIN_GAP_MS apart unless the user asked. */
  private acquire(userAsked: boolean): Promise<void> {
    if (this.acquiring) return this.acquiring;
    const wait = this.lastAcquireAt + SHEET_ACQUIRE_MIN_GAP_MS - this.now();
    if (!userAsked && wait > 0) {
      this.acquireRetryAt = this.now() + wait;
      this.armDeadline();
      return Promise.resolve();
    }
    this.acquireRetryAt = 0;
    this.lastAcquireAt = this.now();
    const settle = () => void (this.acquiring === call && (this.acquiring = null));
    const call: Promise<void> = this.opts.transport
      .acquireLease({ documentId: this.opts.documentId, sessionId: this.opts.sessionId, actingMemberId: this.opts.actingMemberId() })
      .then(
        () => {
          settle();
          this.evaluate(); // rows that arrived while the call was out were judged with it still pending
        },
        (err: unknown) => {
          settle(); // no re-evaluation: a failing call waits for the next row, deadline or reconnect
          if (sheetErrorCode(err) !== "offline") this.host.failed(err);
          throw err;
        },
      );
    this.acquiring = call;
    return call;
  }

  private sendRelease(): Promise<void> {
    if (this.releaseCall) return this.releaseCall;
    this.releasedOn = this.host.connectionId();
    const call = this.opts.transport.releaseLease({ documentId: this.opts.documentId, sessionId: this.opts.sessionId })
      .catch((err: unknown) => {
        // Offline: the server detaches the lease with the socket; the release is sent again after the reconnect.
        const code = docErrorCode(err);
        if (code === "forbidden" || code === "not_found") this.releasedEpoch = null;
        if (sheetErrorCode(err) !== "offline") this.host.failed(err);
      })
      .finally(() => {
        if (this.releaseCall === call) this.releaseCall = null;
      });
    this.releaseCall = call;
    return call;
  }

  private armHeartbeat(): void {
    this.clear("heartbeatTimer");
    this.heartbeatTimer = this.timers.setTimeout(() => {
      this.heartbeatTimer = null;
      const held = this.held;
      if (!held || this.disposed) return;
      this.armHeartbeat();
      if (!this.bound) return;
      this.opts.transport.heartbeatLease({
        documentId: this.opts.documentId, sessionId: this.opts.sessionId, leaseEpoch: held.epoch,
        actingMemberId: this.opts.actingMemberId(),
      }).catch((err: unknown) => {
        const code = sheetErrorCode(err);
        if (code === "lease") this.fenced();
        else if (code !== "offline") this.host.failed(err);
      });
    }, SHEET_LEASE_HEARTBEAT_MS);
  }

  /** Hand-over prompt: once per request while this session holds the lease; a parked session hands over at once. */
  private checkRequest(): void {
    const view = this.viewValue;
    const row = this.row;
    if (!this.held || view.kind !== "mine" || !view.request || !row) {
      if (!this.held) this.lastRequestKey = "";
      return;
    }
    const key = `${row.requestedBySessionId}:${row.requestedAt.getTime()}`;
    if (key === this.lastRequestKey) return;
    this.lastRequestKey = key;
    this.host.requested({ name: view.request.name, deadlineMs: view.request.sinceMs + SHEET_LEASE_REQUEST_GRACE_MS });
    if (this.host.parked()) this.host.release("parked");
  }

  /** Re-evaluate when the view can next change by time alone (a holder going stale, a request growing ready…). */
  private armDeadline(): void {
    this.clear("deadlineTimer");
    const row = this.row;
    const now = this.now();
    const candidates: number[] = this.acquireRetryAt > 0 ? [this.acquireRetryAt] : [];
    if (row) {
      const [heartbeat, requested] = [row.heartbeatAt.getTime(), row.requestedAt.getTime()];
      candidates.push(heartbeat + SHEET_LEASE_DETACHED_GRACE_MS, heartbeat + SHEET_LEASE_TTL_MS, heartbeat + SHEET_LEASE_RESERVE_MS);
      if (row.requestedBySessionId !== "") candidates.push(requested + SHEET_LEASE_REQUEST_GRACE_MS, requested + SHEET_LEASE_REQUEST_MAX_AGE_MS);
    }
    const next = candidates.filter((at) => at > now).reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(next)) return;
    // +1 ms: every rule compares with a strict ">" at the boundary.
    this.deadlineTimer = this.timers.setTimeout(() => {
      this.deadlineTimer = null;
      this.evaluate();
    }, next - now + 1);
  }

  private clear(key: TimerKey): void {
    const timer = this[key];
    if (timer !== null) this.timers.clearTimeout(timer);
    this[key] = null;
  }
}
