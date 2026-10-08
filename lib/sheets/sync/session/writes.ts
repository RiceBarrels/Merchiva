// The holder's write side of a spreadsheet session (sheets.md §4.4, §4.7, §5.6): the push queue and the compactor,
// the holds on local edits while a fold, a release or the compactor's reset is under way, and what a refused write
// means. The session (./index.ts) captures the edits and follows the lease; this decides what reaches the server.
//
// Pure: no React, no Univer runtime.

import { docErrorCode } from "@/lib/docs/errors";
import type { DocErrorCode } from "@/lib/docs/types";
import type { SheetTuning } from "@/lib/sheets/constants";
import { SheetOfflineError, sheetErrorCode } from "@/lib/sheets/errors";
import { SheetCompactor, encodeSheetContent, type SheetCompactionWriter } from "@/lib/sheets/sync/compactor";
import type { SheetLeaseController, SheetReleaseReason } from "@/lib/sheets/sync/lease-controller";
import type { SheetLiveSubscription } from "@/lib/sheets/sync/live/subscription";
import { SheetPushQueue, type SheetPushFailure, type SheetTimers, type SheetWrite } from "@/lib/sheets/sync/push-queue";
import { committedSeqsOf, type SheetModelSync, type SheetReloadReason } from "@/lib/sheets/sync/remote-apply";
import type { SheetTransport } from "@/lib/sheets/sync/transport";
import type { SheetEmitter, SheetSessionErrorCode, SheetSessionEvents, SheetSizeWarning } from "./types";

export interface SheetWritesHost {
  readonly sync: SheetModelSync;
  readonly live: SheetLiveSubscription;
  readonly events: SheetEmitter<SheetSessionEvents>;
  /** The session's lease controller (built after the write side, which it calls back). */
  lease(): SheetLeaseController;
  accessLost(): boolean;
  /** A hold changed: Univer's editable flag is set again. */
  applyEditable(): void;
  sizeWarning(kind: SheetSizeWarning): void;
  loseAccess(code: DocErrorCode): void;
  reportError(code: SheetSessionErrorCode, err: unknown): void;
  /** A compaction or version call failed: access lost, or an error. */
  callFailed(err: unknown): void;
  /** True when `err` retired the session: another person signed in on this device (nothing it holds can go out). */
  operatorChanged(err: unknown): boolean;
  refresh(): void;
}

export interface SheetWritesOptions {
  documentId: string;
  sessionId: string;
  actingMemberId: string;
  transport: SheetTransport;
  tuning: SheetTuning;
  now: () => number;
  timers: SheetTimers;
  host: SheetWritesHost;
}

export class SheetSessionWrites {
  readonly queue: SheetPushQueue;
  readonly versions: SheetCompactor;
  private readonly opts: SheetWritesOptions;
  private readonly host: SheetWritesHost;
  /** Local edits are held back: an oversize or log-full reset, or a release is under way. */
  private writesPaused = false;
  /** The compactor holds local edits back while its replace or snapshot reset is under way (its own flag, so neither
   *  side's end of a hold lifts the other's). */
  private compactorHold = false;
  /** The model holds edits that are neither in the log nor queued (folded into a reset): no snapshot from it. */
  private modelAhead = false;
  private logFullFolded = false;
  /** A fold asked for while no model was loaded: resume() runs it (replaceWrites: the log-full path's). */
  private foldPending: { replaceWrites: boolean } | null = null;

  constructor(opts: SheetWritesOptions) {
    this.opts = opts;
    this.host = opts.host;
    const { documentId, sessionId, transport, tuning, now, timers, host } = opts;
    this.queue = new SheetPushQueue({ tuning, now, timers, host: {
      writeContext: () => this.writeContext(),
      send: (write, ctx) => this.send(write, ctx.leaseEpoch, ctx.baseUpdateId),
      oversize: () => this.foldIntoReset(false),
      failed: (failure) => this.onPushFailure(failure),
      changed: () => this.onQueueChanged(),
    } });
    this.versions = new SheetCompactor({
      documentId, sessionId, transport, tuning, now, timers,
      actingMemberId: () => opts.actingMemberId,
      writer: () => this.compactionWriter(),
      flush: () => this.queue.flush(),
      reader: () => {
        const model = host.sync.model;
        if (!model || host.sync.loadState !== "ready") return null;
        const lease = host.lease();
        return { model, appliedThrough: host.sync.appliedThrough, heldEpoch: lease.heldEpoch, bound: lease.isBound };
      },
      enqueueReset: (content, base) => this.queue.enqueueReset(content, base),
      pauseWrites: (paused) => {
        this.compactorHold = paused;
        host.applyEditable();
      },
      sizeWarning: (kind) => host.sizeWarning(kind),
      error: (err) => host.callFailed(err),
    });
  }

  /** Local edits are held back (a fold, a release, or the compactor's reset or replace). */
  get held(): boolean { return this.writesPaused || this.compactorHold; }

  pause(paused: boolean): void {
    this.writesPaused = paused;
    this.host.applyEditable();
  }

  /** A new grant: a full log may be folded once more; versions run while a model is bound. */
  granted(hasModel: boolean): void {
    this.logFullFolded = false;
    this.versions.setActive(hasModel);
  }

  /** Drop everything unsent (lost lease, divergence, a release). */
  discard(): void {
    this.queue.discard();
    this.foldPending = null;
  }

  /** "Discard change": nothing unsent is left, and nothing is held. */
  discardChanges(): void {
    this.discard();
    this.logFullFolded = false;
    this.pause(false);
  }

  /** §5.6: how many captured ops never reached the server (counted from this session's own rows); all dropped. */
  discardForLostLease(): number {
    const writes = this.queue.outstanding;
    const source = this.host.live.source;
    let discardedOps = this.queue.pendingOps;
    if (writes.length > 0) {
      const after = writes.reduce((min, w) => (w.minBase < min ? w.minBase : min), writes[0].minBase);
      const committed = source ? committedSeqsOf(source.rowsAfter(after), this.opts.sessionId, after) : new Set<number>();
      for (const write of writes) if (!(write.kind === "ops" && committed.has(Number(write.seq)))) discardedOps += write.opCount;
    }
    this.discard();
    this.versions.setActive(false);
    return discardedOps;
  }

  /** flush → compact → release. An idle / hidden release that cannot flush is tried again later. */
  async release(reason: SheetReleaseReason): Promise<void> {
    const lease = this.host.lease();
    if (lease.heldEpoch === null) return;
    this.pause(true);
    try {
      if (!(await this.queue.flush())) {
        if (reason === "done" || reason === "hand_over") throw new SheetOfflineError();
        lease.releaseDeferred(reason); // idle / hidden: tried again when that clock runs out again
        return;
      }
      const { sync } = this.host;
      if (sync.model && sync.loadState === "ready") await this.versions.compactNow();
      if (lease.heldEpoch === null) return;
      this.versions.setActive(false);
      this.discard();
      await lease.release();
      this.host.events.emit("released", reason);
    } finally {
      this.pause(false);
      this.host.refresh();
    }
  }

  /** A model finished loading: from the server's content unless `reason` is "rebind" (the parked workbook). */
  loaded(reason: SheetReloadReason | null): void {
    if (reason === "rebind") return;
    this.modelAhead = false;
    this.versions.loadedFromServer();
  }

  /** After a load: a fold that waited for a model runs now, then the queue goes on. */
  resume(): void {
    const fold = this.foldPending;
    if (fold && this.queue.hasUnsaved) this.foldIntoReset(fold.replaceWrites);
    else this.foldPending = null;
    this.queue.pump();
  }

  private writeContext(): { leaseEpoch: bigint; baseUpdateId: bigint } | null {
    const { sync, live } = this.host;
    const lease = this.host.lease();
    const epoch = lease.heldEpoch;
    if (epoch === null || !lease.isBound || !live.applied || this.host.accessLost()) return null;
    if (sync.model && sync.loadState !== "ready") return null;
    return { leaseEpoch: epoch, baseUpdateId: sync.appliedThrough };
  }

  private async send(write: SheetWrite, leaseEpoch: bigint, baseUpdateId: bigint): Promise<void> {
    const { documentId, sessionId, actingMemberId, transport } = this.opts;
    const common = { documentId, sessionId, leaseEpoch, seq: write.seq, actingMemberId };
    if (write.kind === "ops") await transport.pushOps({ ...common, baseUpdateId, payload: write.payload });
    else await transport.resetContent({ ...common, ...write.content });
    this.host.lease().writeCommitted();
  }

  /**
   * The oversize path (§4.4), and a full log: hold edits, then one reset carrying the whole workbook. Without a loaded
   * model (parked, the editor remounting) the fold waits for the next one: resume() runs it, as the queue will not
   * ask again.
   */
  private foldIntoReset(replaceWrites: boolean): void {
    const { sync } = this.host;
    if (this.host.lease().heldEpoch === null) return;
    const model = sync.model;
    if (!model || sync.loadState !== "ready") {
      this.foldPending = { replaceWrites: replaceWrites || this.foldPending?.replaceWrites === true };
      return;
    }
    this.foldPending = null;
    this.pause(true);
    this.modelAhead = true;
    const content = encodeSheetContent(model);
    if (content.state.byteLength > this.opts.tuning.stateMaxBytes) return this.host.sizeWarning("too_large"); // → discardChanges()
    this.queue.enqueueReset(content, sync.appliedThrough, { replaceWrites }).then(
      () => this.pause(false),
      () => {}, // reported through onPushFailure
    );
  }

  private onPushFailure(failure: SheetPushFailure): void {
    const { host } = this;
    switch (failure.kind) {
      case "access":
        return host.loseAccess(failure.code);
      case "lease":
        return host.lease().fenced();
      case "diverged":
        // Holding the lease, the server's log still moved past this model: only divergence explains it.
        host.reportError(failure.code, failure.error);
        this.discard();
        host.sync.dropParked(); // a parked workbook holds the discarded edits: the next bind loads the server's
        host.lease().evaluate();
        if (host.sync.model) void host.sync.load("stale");
        return;
      case "too_large":
        if (failure.write.kind === "ops" && (!this.logFullFolded || this.foldPending !== null)) {
          this.logFullFolded = true; // the log is full: everything unsent becomes one reset, once (a deferred one: when it runs)
          return this.foldIntoReset(true);
        }
        return host.sizeWarning(failure.write.kind === "ops" ? "log_full" : "too_large");
      case "quota":
        host.reportError("quota", failure.error);
        if (this.writesPaused) host.sizeWarning("too_large");
        return;
      case "fatal":
      case "transient":
        if (host.operatorChanged(failure.error)) return; // retried forever otherwise: the queue is discarded
        return host.reportError(sheetErrorCode(failure.error) ?? docErrorCode(failure.error) ?? "unknown", failure.error);
    }
  }

  private onQueueChanged(): void {
    if (this.queue.idle) this.versions.check();
    this.host.refresh();
  }

  private compactionWriter(): SheetCompactionWriter | null {
    const { sync, live } = this.host;
    const model = sync.model;
    const row = this.host.lease().leaseRow;
    const context = this.writeContext();
    if (!model || !row || !context || sync.loadState !== "ready" || !this.queue.idle || this.modelAhead) return null;
    // The lease row and its log rows arrive in one transaction: lastSeq caught up ⇒ every own row is applied.
    if (row.lastSeq < this.queue.lastCommittedSeq) return null;
    const snapshotThrough = live.source?.snapshot()?.throughUpdateId ?? 0n;
    return { leaseEpoch: context.leaseEpoch, appliedThrough: sync.appliedThrough, snapshotThrough, model };
  }
}
