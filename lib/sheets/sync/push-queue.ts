// The push pipeline of a spreadsheet session (sheets.md §4.4): captured ops → gzipped batches → pushSheetOps, one
// call at a time, in capture order. A batch is cut 150 ms after the last op (≤ 1 s after the first waiting one) from
// the longest prefix that encodes to ≤ updateMaxBytes; a single larger op takes the host's oversize path (a reset of
// the whole workbook, enqueueReset). Every write takes the next `seq` of its grant and keeps its bytes until
// committed: a retry resends the same (seq, bytes) and the server treats seq ≤ lastSeq as done, so a reply lost to a
// closed socket is harmless — after the re-bind the lease row's lastSeq says what landed. Offline: jittered backoff
// 1 s → 30 s, nothing dropped. What retrying cannot fix (fencing, divergence, access, size) halts the queue and goes
// to the host, which resumes or discards. Pure: no React, no Univer runtime, no connection (the host sends).

import { docErrorCode } from "@/lib/docs/errors";
import type { DocErrorCode } from "@/lib/docs/types";
import { encodeSheetOps } from "@/lib/sheets/codec";
import { SHEET_APP_VERSION, SHEET_TUNING, type SheetTuning } from "@/lib/sheets/constants";
import { sheetErrorCode } from "@/lib/sheets/errors";
import type { SheetOp } from "@/lib/sheets/types";

export type SheetTimers = { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
type TimerHandle = ReturnType<typeof setTimeout>;

/** The page's timers as plain calls (a DOM setTimeout called as another object's method throws "Illegal invocation"). */
export const SHEET_TIMERS: SheetTimers = {
  setTimeout: ((handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms)) as typeof setTimeout,
  clearTimeout: ((handle?: TimerHandle) => globalThis.clearTimeout(handle)) as typeof clearTimeout,
};

/** Jittered exponential backoff (as lib/docs/spacetime-provider.ts): retryBaseMs · 2^attempt, capped, ±25 %. */
export function sheetBackoffMs(tuning: Pick<SheetTuning, "retryBaseMs" | "retryMaxMs">, attempt: number, random = Math.random): number {
  const base = Math.min(tuning.retryMaxMs, tuning.retryBaseMs * 2 ** Math.min(attempt, 30));
  return base * (0.75 + random() * 0.5);
}

/** A whole workbook replacing the sheet's content (resetSheetContent). */
export interface SheetResetContent { state: Uint8Array; plainText: string; cellCount: number }

/** One write of a grant's seq stream. Immutable once built. */
export type SheetWrite =
  | { readonly kind: "ops"; readonly seq: bigint; readonly payload: Uint8Array; readonly opCount: number; readonly minBase: bigint }
  | { readonly kind: "reset"; readonly seq: bigint; readonly content: SheetResetContent; readonly opCount: number; readonly minBase: bigint };

/** What a write is fenced by: the grant's epoch, and the highest update id the model had applied when it was sent. */
export interface SheetWriteContext { leaseEpoch: bigint; baseUpdateId: bigint }

export type SheetPushFailure =
  | { kind: "diverged"; code: "stale" | "sequence" | "invalid"; error: unknown }
  | { kind: "lease"; error: unknown }
  | { kind: "too_large"; write: SheetWrite; error: unknown }
  | { kind: "quota"; write: SheetWrite; error: unknown }
  | { kind: "access"; code: DocErrorCode; error: unknown }
  | { kind: "fatal"; error: unknown }
  /** Retried with backoff; reported for the error event only. */
  | { kind: "transient"; error: unknown };

export interface SheetPushHost {
  /** The grant and base to write under now, or null while this session may not write (no bound lease, not loaded). */
  writeContext(): SheetWriteContext | null;
  /** One pushSheetOps / resetSheetContent call. */
  send(write: SheetWrite, context: SheetWriteContext): Promise<void>;
  /** The first waiting op alone encodes to more than updateMaxBytes: fold everything into enqueueReset. */
  oversize(): void;
  failed(failure: SheetPushFailure): void;
  /** Anything the save status reads changed. */
  changed(): void;
}

export interface SheetPushQueueOptions {
  host: SheetPushHost;
  tuning?: Partial<SheetTuning>;
  now?: () => number;
  timers?: SheetTimers;
  random?: () => number;
}

const ACCESS_CODES: ReadonlySet<DocErrorCode> = new Set<DocErrorCode>(["forbidden", "not_found", "trashed", "not_published"]);

interface Waiter { resolve(): void; reject(error: unknown): void }

export class SheetPushQueue {
  private readonly host: SheetPushHost;
  private readonly tuning: SheetTuning;
  private readonly now: () => number;
  private readonly timers: SheetTimers;
  private readonly random: () => number;
  private pending: SheetOp[] = [];
  private firstPendingAt = 0;
  /** The debounce elapsed (or a flush asked): waiting ops may be cut into a batch. */
  private due = false;
  private writes: SheetWrite[] = [];
  private readonly waiters = new Map<SheetWrite, Waiter>();
  private epoch: bigint | null = null;
  private nextSeq = 1n;
  private committedSeq = 0n;
  private sending: SheetWrite | null = null;
  private halted = false;
  private oversized = false;
  private offline = false;
  private retryAttempt = 0;
  private debounceTimer: TimerHandle | null = null;
  private retryTimer: TimerHandle | null = null;
  private flushWaiters: Array<(drained: boolean) => void> = [];
  private disposed = false;

  constructor(opts: SheetPushQueueOptions) {
    this.host = opts.host;
    this.tuning = { ...SHEET_TUNING, ...opts.tuning };
    this.now = opts.now ?? Date.now;
    this.timers = opts.timers ?? SHEET_TIMERS;
    this.random = opts.random ?? Math.random;
  }

  get lastCommittedSeq(): bigint { return this.committedSeq; }
  get hasUnsaved(): boolean { return this.pending.length > 0 || this.writes.length > 0; }
  /** Captured ops not yet known to be on the server. */
  get unsavedOps(): number { return this.pending.length + this.writes.reduce((sum, w) => sum + w.opCount, 0); }
  get idle(): boolean { return !this.hasUnsaved && this.sending === null; }
  /** The last attempt failed for lack of a connection. */
  get isOffline(): boolean { return this.offline; }
  /** Built writes not yet known to be committed, oldest first (the lost-lease count reads them). */
  get outstanding(): readonly SheetWrite[] { return this.writes; }
  get pendingOps(): number { return this.pending.length; }

  add(op: SheetOp): void {
    if (this.disposed) return;
    this.pending.push(op);
    if (this.firstPendingAt === 0) this.firstPendingAt = this.now();
    this.scheduleCut();
    this.host.changed();
  }

  /**
   * The lease row names this session under `epoch`, bound to its connection. The same epoch keeps the stream: writes
   * the row shows as committed are dropped, the rest go in turn; only a (re)bind (`rebound`: a reconnect, a fencing)
   * lifts a halt or a backoff, never the same binding seen again (a heartbeat). A new epoch starts a new stream after
   * `lastSeq` (0 on a grant); writes of an older grant can never be sent any more and are dropped — the host counts
   * them through its lost-lease flow first.
   */
  grant(epoch: bigint, lastSeq: bigint, rebound = true): void {
    if (this.epoch !== epoch) {
      this.dropWrites(new Error("[sheet.lease] The edit lease changed"));
      this.epoch = epoch;
      this.nextSeq = lastSeq + 1n;
      this.committedSeq = lastSeq;
      return this.resume();
    }
    this.committed(epoch, lastSeq);
    if (this.writes.length === 0 && this.nextSeq <= lastSeq) this.nextSeq = lastSeq + 1n;
    if (rebound) this.resume();
    else this.pump();
  }

  /** The lease row of this grant shows `lastSeq`: every write up to it is on the server. */
  committed(epoch: bigint, lastSeq: bigint): void {
    if (epoch !== this.epoch) return;
    if (lastSeq > this.committedSeq) this.committedSeq = lastSeq;
    let dropped = false;
    while (this.writes.length > 0 && this.writes[0].seq <= lastSeq) {
      const write = this.writes.shift() as SheetWrite;
      this.settleWaiter(write, null);
      dropped = true;
    }
    if (!dropped) return;
    this.retryAttempt = 0;
    this.offline = false;
    this.host.changed();
    this.pump();
  }

  /** Clears a halt or a pending backoff and sends again (after a re-bind, or a reconnect). */
  resume(): void {
    this.halted = false;
    this.clearTimer("retryTimer");
    this.pump();
  }

  /** Cut and send everything now: true once all is committed, false as soon as that cannot happen now. */
  flush(): Promise<boolean> {
    this.clearTimer("debounceTimer");
    if (this.pending.length > 0) this.due = true;
    return new Promise<boolean>((resolve) => {
      this.flushWaiters.push(resolve);
      this.pump();
    });
  }

  /**
   * Queue a reset after the writes already built. The waiting ops are folded into it (the workbook in `content`
   * already holds them); `replaceWrites` folds the built writes not in flight too, reusing the first one's seq, and
   * lifts the halt (the log-full path: the refused batch goes out inside the reset). Resolves once committed; rejects
   * when it fails or is discarded.
   */
  enqueueReset(content: SheetResetContent, baseUpdateId: bigint, opts: { replaceWrites?: boolean } = {}): Promise<void> {
    if (this.epoch === null || this.disposed) return Promise.reject(new Error("[sheet.lease] Not holding the edit lease"));
    let folded = this.pending.length;
    if (opts.replaceWrites) {
      const replaced = this.writes.splice(this.writes[0] === this.sending ? 1 : 0); // never the one in flight
      if (replaced.length > 0) this.nextSeq = replaced[0].seq;
      for (const write of replaced) {
        folded += write.opCount;
        this.settleWaiter(write, new Error("[sheet.too_large] Folded into a reset"));
      }
      this.halted = false;
      this.clearTimer("retryTimer");
    }
    this.pending = [];
    this.firstPendingAt = 0;
    this.due = false;
    this.oversized = false;
    this.clearTimer("debounceTimer");
    const write: SheetWrite = { kind: "reset", seq: this.nextSeq++, content, opCount: folded, minBase: baseUpdateId };
    this.writes.push(write);
    const done = new Promise<void>((resolve, reject) => this.waiters.set(write, { resolve, reject }));
    this.host.changed();
    this.pump();
    return done;
  }

  /** Drop everything (lost lease, divergence, "Discard change"). Returns how many captured ops were dropped. */
  discard(reason: unknown = new Error("[sheet.lease] Changes discarded")): number {
    const dropped = this.unsavedOps;
    this.dropWrites(reason);
    this.pending = [];
    this.firstPendingAt = 0;
    this.due = false;
    this.oversized = false;
    this.halted = false;
    this.offline = false;
    this.retryAttempt = 0;
    this.epoch = null;
    this.nextSeq = 1n;
    this.committedSeq = 0n;
    this.clearTimer("debounceTimer");
    this.clearTimer("retryTimer");
    this.host.changed();
    this.settleFlush();
    return dropped;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer("debounceTimer");
    this.clearTimer("retryTimer");
    this.dropWrites(new Error("[sheet.offline] Session closed"));
    for (const resolve of this.flushWaiters.splice(0)) resolve(false);
  }

  /** Send the next write if one may go now. Called on every state change; the host calls it once it can write. */
  pump(): void {
    if (this.disposed || this.sending || this.halted || this.retryTimer !== null) return this.settleFlush();
    const context = this.host.writeContext();
    if (!context || this.epoch === null || context.leaseEpoch !== this.epoch) return this.settleFlush();
    if (this.writes.length === 0 && this.due && this.pending.length > 0) {
      this.cut(context);
      if (this.sending) return; // the host's oversize path queued its reset and sent it from its own pump()
    }
    const write = this.writes[0];
    if (!write) return this.settleFlush();
    void this.send(write, context);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private scheduleCut(): void {
    this.clearTimer("debounceTimer");
    const waited = this.now() - this.firstPendingAt;
    const wait = Math.max(0, Math.min(this.tuning.pushDebounceMs, this.tuning.pushMaxWaitMs - waited));
    this.debounceTimer = this.timers.setTimeout(() => {
      this.debounceTimer = null;
      this.due = true;
      this.pump();
    }, wait);
  }

  /** Build one batch from the longest prefix that fits (binary search over encoded sizes). */
  private cut(context: SheetWriteContext): void {
    const max = this.tuning.updateMaxBytes;
    const seq = this.nextSeq;
    let count = this.pending.length;
    const encode = (ops: SheetOp[]) => encodeSheetOps({ v: 1, app: SHEET_APP_VERSION, seq: Number(seq), ops });
    let payload = encode(this.pending);
    if (payload.byteLength > max) {
      let lo = 0;
      let hi = count;
      let fitting: Uint8Array | null = null;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        const candidate = encode(this.pending.slice(0, mid));
        if (candidate.byteLength <= max) {
          lo = mid;
          fitting = candidate;
        } else {
          hi = mid;
        }
      }
      if (lo === 0 || !fitting) {
        if (!this.oversized) {
          this.oversized = true;
          this.host.oversize();
        }
        return;
      }
      count = lo;
      payload = fitting;
    }
    const ops = this.pending.splice(0, count);
    this.nextSeq = seq + 1n;
    this.writes.push({ kind: "ops", seq, payload, opCount: ops.length, minBase: context.baseUpdateId });
    if (this.pending.length === 0) {
      this.firstPendingAt = 0;
      this.due = false;
    }
  }

  private async send(write: SheetWrite, context: SheetWriteContext): Promise<void> {
    this.sending = write;
    this.host.changed();
    let failure: { error: unknown } | null = null;
    try {
      await this.host.send(write, context);
    } catch (error) {
      failure = { error };
    }
    // Nothing is in flight any more before the host hears of it: its callbacks may queue (and send) the next write.
    if (this.sending === write) this.sending = null;
    try {
      if (!failure) this.onSent(write);
      // Seen as committed on the lease row meanwhile (the reply was lost after the commit): nothing to redo.
      else if (this.writes[0] === write) this.onFailed(write, failure.error);
    } finally {
      this.pump();
      this.host.changed();
    }
  }

  private onSent(write: SheetWrite): void {
    if (this.writes[0] !== write) return;
    this.writes.shift();
    if (write.seq > this.committedSeq) this.committedSeq = write.seq;
    this.settleWaiter(write, null);
    this.retryAttempt = 0;
    this.offline = false;
  }

  private onFailed(write: SheetWrite, error: unknown): void {
    const sheet = sheetErrorCode(error);
    const doc = docErrorCode(error);
    this.offline = sheet === "offline";
    if (this.offline) return this.scheduleRetry();
    if (doc && ACCESS_CODES.has(doc)) return this.halt({ kind: "access", code: doc, error });
    if (sheet === "stale" || sheet === "sequence" || sheet === "invalid") return this.halt({ kind: "diverged", code: sheet, error });
    if (sheet === "lease") return this.halt({ kind: "lease", error });
    if (sheet === "too_large" || sheet === "quota") {
      // A refused reset leaves the stream: nothing behind it waits for it, so the queue goes on.
      if (write.kind === "reset" && this.dropLastReset(write, error)) return this.host.failed({ kind: sheet, write, error });
      return this.halt({ kind: sheet, write, error });
    }
    if (sheet !== null || doc !== null) return this.halt({ kind: "fatal", error });
    // Unknown (network, a stale PIN's [drive.operator]…): keep the write and retry with backoff. The host discards the
    // queue once retrying cannot help (another person signed in on the store tablet: session retireIfOperatorChanged).
    this.scheduleRetry();
    this.host.failed({ kind: "transient", error });
  }

  private halt(failure: SheetPushFailure): void {
    this.halted = true;
    this.host.failed(failure);
  }

  /** A refused reset leaves the stream: its seq is reused by whatever comes next. False when writes follow it. */
  private dropLastReset(write: SheetWrite, error: unknown): boolean {
    if (this.writes[this.writes.length - 1] !== write) return false;
    this.writes.pop();
    this.nextSeq = write.seq;
    this.settleWaiter(write, error);
    return true;
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null || this.disposed) return;
    const delay = sheetBackoffMs(this.tuning, this.retryAttempt++, this.random);
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      this.pump();
    }, delay);
  }

  private dropWrites(reason: unknown): void {
    for (const write of this.writes) this.settleWaiter(write, reason);
    this.writes = [];
  }

  private settleWaiter(write: SheetWrite, error: unknown): void {
    const waiter = this.waiters.get(write);
    if (!waiter) return;
    this.waiters.delete(write);
    if (error === null) waiter.resolve();
    else waiter.reject(error);
  }

  /** Resolve flush() callers: true once idle, false while nothing can move without outside help. */
  private settleFlush(): void {
    if (this.flushWaiters.length === 0 || this.sending) return;
    let drained: boolean;
    if (this.idle) drained = true;
    else if (this.halted || this.oversized || this.retryTimer !== null || this.disposed) drained = false;
    else {
      const context = this.host.writeContext();
      if (context && this.epoch !== null && context.leaseEpoch === this.epoch) return; // pump() is about to send
      drained = false;
    }
    for (const resolve of this.flushWaiters.splice(0)) resolve(drained);
  }

  private clearTimer(key: "debounceTimer" | "retryTimer"): void {
    const timer = this[key];
    if (timer !== null) this.timers.clearTimeout(timer);
    this[key] = null;
  }
}
