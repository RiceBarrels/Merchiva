// One spreadsheet editing session (sheets.md §4–§5, §8.2): one sheet's live rows, the bound model, and the
// single-writer protocol around them.
//
// In lib/sheets/sync/:
//   rows    live/subscription.ts (one query set) → remote-apply.ts SheetModelSync (load, reload, foreign rows)
//   lease   lease-controller.ts decides when to call the server and follows the lease row
//   writes  session/writes.ts: push-queue.ts (op batches, resets), compactor.ts (snapshots, versions) — holder only
//   people  presence.ts and session/peers.ts (avatars, the holder's selection highlighted for viewers)
//   types   session/types.ts (options, events)
//
// The editor binds its Univer model adapter (bindModel) and the session cache parks it on unmount
// (lib/sheets/sync/session-cache.ts); components reach a session only through lib/sheets/use-sheet-session.ts.
//
// Pure: no React, no Univer runtime.

import type { IWorkbookData } from "@univerjs/presets";
import { sameMemberId } from "@/lib/docs/access";
import { docErrorCode } from "@/lib/docs/errors";
import { isDocumentId, newDocumentId } from "@/lib/docs/ids";
import type { DocPeer } from "@/lib/docs/sync-types";
import type { DocErrorCode } from "@/lib/docs/types";
import { driveErrorCode } from "@/lib/drive/errors";
import { SHEET_TUNING, type SheetTuning } from "@/lib/sheets/constants";
import { SheetOfflineError, sheetErrorCode, sheetErrorMessage } from "@/lib/sheets/errors";
import type { SheetLeaseRow, SheetLeaseView } from "@/lib/sheets/lease";
import type { SheetModelAdapter, SheetOp, SheetSyncStatus } from "@/lib/sheets/types";
import type { SheetCompactor } from "@/lib/sheets/sync/compactor";
import type { SheetConnection } from "@/lib/sheets/sync/connection";
import { SheetLeaseController } from "@/lib/sheets/sync/lease-controller";
import { SheetLiveSubscription } from "@/lib/sheets/sync/live/subscription";
import { SheetPresence } from "@/lib/sheets/sync/presence";
import { SHEET_TIMERS, type SheetPushQueue, type SheetResetContent, type SheetTimers } from "@/lib/sheets/sync/push-queue";
import { SheetModelSync, type SheetLoadState, type SheetReloadReason } from "@/lib/sheets/sync/remote-apply";
import {
  SHEET_SIZE_RANK, SheetEmitter, type SheetSessionErrorCode, type SheetSessionEvents, type SheetSessionOptions, type SheetSizeWarning,
} from "./types";
import { SheetSessionPeers } from "./peers";
import { SheetSessionWrites } from "./writes";

export type { SheetLoadState, SheetOpAcceptor, SheetReloadReason } from "@/lib/sheets/sync/remote-apply";
export type { SheetReleaseReason } from "@/lib/sheets/sync/lease-controller";
export type { SheetSessionErrorCode, SheetSessionEvents, SheetSessionOptions, SheetSizeWarning } from "./types";

const DESTROY_FLUSH_MS = 10_000;

export class SheetSyncSession {
  readonly id = newDocumentId();
  readonly documentId: string;
  private readonly opts: SheetSessionOptions;
  private readonly tuning: SheetTuning;
  private readonly timers: SheetTimers;
  private readonly events = new SheetEmitter<SheetSessionEvents>();
  private readonly live: SheetLiveSubscription;
  private readonly sync: SheetModelSync;
  private readonly writes: SheetSessionWrites;
  private readonly leaseCtl: SheetLeaseController;
  private readonly presence: SheetPresence;
  private readonly people: SheetSessionPeers;
  private modelOff: Array<() => void> = [];
  private parkedFlag = false;
  private canEditValue: boolean;
  private statusValue: SheetSyncStatus = "connecting";
  private accessLostCode: DocErrorCode | null = null;
  private operatorChangedFlag = false;
  private sizeWarningValue: SheetSizeWarning | null = null;
  private integrityKey = "0:0";
  private lastErrorKey = "";
  private closing = false;
  private destroyed = false;

  constructor(opts: SheetSessionOptions) {
    if (!isDocumentId(opts.documentId)) throw new Error("Invalid document id");
    const documentId = opts.documentId.toLowerCase();
    const tuning: SheetTuning = { ...SHEET_TUNING, ...opts.tuning };
    const now = opts.now ?? Date.now;
    const timers = opts.timers ?? SHEET_TIMERS;
    const { transport } = opts;
    this.opts = opts;
    this.documentId = documentId;
    this.tuning = tuning;
    this.timers = timers;
    this.canEditValue = opts.canEdit;
    this.live = new SheetLiveSubscription(documentId, {
      applied: () => this.onApplied(),
      failed: (cause) => {
        this.reportError("subscription", cause);
        this.afterDetach();
      },
      update: (row) => {
        this.trackLog();
        this.sync.onRow(row);
      },
      updateDeleted: () => this.trackLog(),
      snapshot: (row) => this.sync.onSnapshot(row),
      lease: (row) => this.leaseCtl.observe(row),
      presence: (row) => {
        if (row) this.presence.observe(row);
        this.people.update();
      },
    }, { tuning, timers });
    this.sync = new SheetModelSync({ sessionId: this.id, acceptRemoteOp: opts.acceptRemoteOp, host: {
      source: () => this.live.source,
      isWriter: () => this.leaseCtl.heldEpoch !== null,
      loaded: (reason) => this.afterLoad(reason),
      loadFailed: (err) => this.reportError("decode", err),
      changed: () => this.onSyncChanged(),
      undecodable: (err) => this.reportError("decode", err),
      updateRequired: (app) => {
        this.applyEditable();
        this.events.emit("updateRequired", { app });
      },
    } });
    this.writes = new SheetSessionWrites({
      documentId, sessionId: this.id, actingMemberId: opts.actingMemberId, transport, tuning, now, timers, host: {
        sync: this.sync, live: this.live, events: this.events,
        lease: () => this.leaseCtl,
        accessLost: () => this.accessLostCode !== null,
        applyEditable: () => this.applyEditable(),
        sizeWarning: (kind) => this.setSizeWarning(kind),
        loseAccess: (code) => this.loseAccess(code),
        reportError: (code, err) => this.reportError(code, err),
        callFailed: (err) => this.onCallFailed(err),
        operatorChanged: (err) => this.retireIfOperatorChanged(err),
        refresh: () => this.refresh(),
      },
    });
    this.leaseCtl = new SheetLeaseController({
      documentId, sessionId: this.id, transport, now, timers,
      me: () => ({ memberId: opts.memberId, actorMemberId: opts.actorMemberId, sessionId: this.id, canEdit: this.mayEdit() }),
      actingMemberId: () => opts.actingMemberId,
      host: {
        connectionId: () => this.live.connectionId,
        ready: () => this.live.everApplied,
        modelLoaded: () => this.sync.model !== null && this.sync.loadState === "ready",
        parked: () => this.parkedFlag,
        mayAutoAcquire: () => opts.autoAcquire && !this.parkedFlag && this.sync.model !== null
          && this.sync.loadState === "ready" && !this.sync.diverged,
        viewChanged: (view) => {
          this.applyEditable(); // whatever dropped the held epoch, Univer is read-only from here
          this.events.emit("lease", view);
          this.people.update();
          this.refresh();
        },
        granted: () => {
          this.writes.granted(this.sync.model !== null);
          this.applyEditable();
        },
        writable: (epoch, lastSeq, rebound) => {
          this.queue.grant(epoch, lastSeq, rebound);
          this.versions.check();
        },
        lost: (row) => this.onLeaseLost(row),
        requested: (request) => this.events.emit("handOverRequested", request),
        release: (reason) => void this.writes.release(reason).catch(() => {}),
        failed: (err) => this.onCallFailed(err),
      },
    });
    this.presence = new SheetPresence({
      documentId, transport, now, timers, user: { ...opts.user, memberId: opts.actorMemberId },
      onError: (err) => {
        const code = docErrorCode(err);
        if (code === "forbidden" || code === "not_found") this.loseAccess(code);
      },
    });
    this.people = new SheetSessionPeers({
      live: this.live, sync: this.sync, presence: this.presence, events: this.events, lease: () => this.leaseCtl,
    }, timers, tuning.presenceHeartbeatMs);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onPageHide);
      window.addEventListener("pageshow", this.onPageShow);
    }
  }

  // ── state ───────────────────────────────────────────────────────────────────

  get status(): SheetSyncStatus { return this.statusValue; }
  get lease(): SheetLeaseView { return this.leaseCtl.view; }
  get peers(): DocPeer[] { return this.people.peers; }
  get appliedThrough(): bigint { return this.sync.appliedThrough; }
  get hasUnsavedChanges(): boolean { return this.queue.hasUnsaved; }
  get diverged(): boolean { return this.sync.diverged; }
  get parked(): boolean { return this.parkedFlag; }
  get loadState(): SheetLoadState { return this.sync.loadState; }
  get reloading(): boolean { return this.sync.reloading; }
  get updateRequired(): boolean { return this.sync.updateRequiredApp !== null; }
  get accessLost(): DocErrorCode | null { return this.accessLostCode; }
  /** Another person signed in on this store device: this session (the previous PIN operator's) never writes again. */
  get operatorChanged(): boolean { return this.operatorChangedFlag; }
  get sizeWarning(): SheetSizeWarning | null { return this.sizeWarningValue; }
  private get queue(): SheetPushQueue { return this.writes.queue; }
  private get versions(): SheetCompactor { return this.writes.versions; }
  /** Unsaved edits that can still reach the server (the unload guard and the session cache read it). */
  get holdsSaveableEdits(): boolean {
    return this.queue.hasUnsaved && this.accessLostCode === null && this.leaseCtl.heldEpoch !== null;
  }

  on<K extends keyof SheetSessionEvents>(event: K, fn: (...args: SheetSessionEvents[K]) => void): () => void {
    return this.events.on(event, fn);
  }

  // ── connection and model ───────────────────────────────────────────────────

  attach(conn: SheetConnection | null): void {
    if (this.destroyed) return;
    if (conn === this.live.connection) {
      if (!conn) this.live.attach(null); // offline: no re-subscribe to the dropped connection
      return;
    }
    const hadConnection = this.live.connection !== null;
    this.live.attach(conn);
    if (hadConnection) this.afterDetach();
    this.refresh();
  }

  /** Bind the editor's model (null unbinds). A model loads (§4.6), from the parked workbook when it is still valid. */
  async bindModel(model: SheetModelAdapter | null): Promise<void> {
    if (this.destroyed || model === this.sync.model) return;
    for (const off of this.modelOff.splice(0)) off();
    const wasParked = this.parkedFlag;
    this.sync.bind(model);
    this.versions.setActive(false);
    if (!model) {
      void this.presence.stop();
      this.refresh();
      return;
    }
    this.parkedFlag = false;
    this.leaseCtl.rearmAutoAcquire();
    model.setEditable(false);
    this.modelOff = [
      model.onLocalOp(this.onLocalOp),
      model.onNeedsSnapshot(() => this.versions.requestSnapshot()),
      model.onSelectionChange((selection) => this.presence.setSelection(selection)),
    ];
    this.startPresence();
    if (this.live.applied) await this.sync.load(wasParked ? "rebind" : null);
  }

  park(snapshot: { wb: IWorkbookData; through: bigint }): void {
    this.sync.park(snapshot);
    this.parkedFlag = true;
    this.refresh();
  }

  /** The unmount sequence (§5.7): mute capture, save synchronously while Univer is alive, park, unbind. */
  parkModel(): void {
    const model = this.sync.model;
    if (!model) return;
    for (const off of this.modelOff.splice(0)) off();
    this.parkedFlag = true;
    if (this.sync.loadState === "ready") {
      try {
        this.sync.park({ wb: model.save(), through: this.sync.appliedThrough });
      } catch {
        // Unreadable: the next bind loads from the server.
      }
    }
    void this.bindModel(null);
  }

  // ── actions ────────────────────────────────────────────────────────────────

  /** "Edit" / "Ask to edit". A diverged client reloads first (§4.5). */
  async requestEdit(): Promise<void> {
    if (!this.mayEdit()) return;
    if (this.sync.diverged && this.sync.model) await this.sync.load("diverged");
    await this.leaseCtl.requestEdit();
  }

  /** "Done" / "Stop editing": flush → compact → release. */
  stopEditing(): Promise<void> { return this.writes.release("done"); }
  /** "Let {name} edit": the same, and the server keeps the lease reserved for the requester. */
  handOver(): Promise<void> { return this.writes.release("hand_over"); }
  declineRequest(): Promise<void> { return this.leaseCtl.declineRequest(); }
  cancelRequest(): Promise<void> { return this.leaseCtl.cancelRequest(); }
  async flush(): Promise<void> { await this.queue.flush(); }
  /** Before "Make a copy" / "Download": true once the snapshot holds every edit. */
  compactNow(): Promise<boolean> { return this.versions.compactNow(); }
  saveVersion(_kind: "named", name: string): Promise<void> { return this.versions.saveNamedVersion(name); }
  restoreVersion(state: Uint8Array, safetyName: string): Promise<void> { return this.versions.restoreVersion(state, safetyName); }
  replaceContent(content: SheetResetContent, safetyName?: string): Promise<void> {
    return this.versions.replaceContent(content, safetyName);
  }

  /** "Discard change" (too large to save): drop what could not be saved and load the server's content. */
  async discardChanges(): Promise<void> {
    this.sizeWarningValue = null;
    this.writes.discardChanges();
    this.sync.dropParked(); // it holds what was just discarded
    this.leaseCtl.evaluate();
    await this.sync.load("stale");
  }

  /** Retry after load_failed, "Reload" after skipped changes. */
  async reload(): Promise<void> {
    if (this.queue.hasUnsaved && !(await this.queue.flush())) throw new SheetOfflineError();
    await this.sync.load(this.sync.loadState === "load_failed" ? null : "diverged");
  }

  setUser(user: { name: string; color: string }): void {
    this.presence.setUser({ name: user.name, color: user.color, memberId: this.opts.actorMemberId });
  }

  setCanEdit(canEdit: boolean): void {
    if (canEdit === this.canEditValue) return;
    this.canEditValue = canEdit;
    if (!canEdit && this.leaseCtl.heldEpoch !== null) void this.writes.release("can_not_edit").catch(() => {});
    if (canEdit && this.accessLostCode !== null) {
      // The app believes access is back (restored, re-granted): try again; a refusal loses it again.
      this.accessLostCode = null;
      this.queue.resume();
    }
    this.leaseCtl.evaluate();
    this.applyEditable();
    this.refresh();
  }

  /** Page hidden / shown (visibilitychange is followed already; the native app state may call this too). */
  setHidden(hidden: boolean): void {
    this.leaseCtl.setHidden(hidden);
    if (hidden) void this.queue.flush();
  }

  /** flush (≤ 10 s) → release → cancel the request → remove presence → unsubscribe. No compaction. */
  async destroy(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    for (const off of this.modelOff.splice(0)) off();
    this.versions.dispose();
    let timer: ReturnType<typeof setTimeout> | null = null;
    await Promise.race([this.queue.flush(), new Promise((resolve) => (timer = this.timers.setTimeout(resolve, DESTROY_FLUSH_MS)))]);
    if (timer !== null) this.timers.clearTimeout(timer);
    if (this.leaseCtl.heldEpoch !== null) await this.leaseCtl.release();
    await this.leaseCtl.cancelRequest().catch(() => {});
    await this.presence.stop();
    this.destroyed = true;
    this.people.dispose();
    this.live.dispose();
    this.queue.dispose();
    this.leaseCtl.dispose();
    this.presence.dispose();
    this.sync.bind(null);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onPageHide);
      window.removeEventListener("pageshow", this.onPageShow);
    }
    this.events.clear();
  }

  // ── rows and lease ─────────────────────────────────────────────────────────

  private onApplied(): void {
    this.trackLog();
    // The lease first: a lease lost while away is counted before anything reloads.
    this.leaseCtl.observe(this.live.source?.lease() ?? null);
    if (this.sync.model) {
      if (this.sync.loadState === "ready") this.sync.catchUp();
      else void this.sync.load(null);
    }
    this.startPresence();
    this.people.update();
    this.queue.resume();
    this.refresh();
  }

  private afterDetach(): void {
    this.people.stop();
    if (!this.closing) void this.presence.stop(); // the server drops the row with the socket anyway
    this.leaseCtl.evaluate();
    this.refresh();
  }

  private onLocalOp = (op: SheetOp): void => {
    // While a load runs the model is about to be replaced (and read-only): an op from it is dropped with it.
    if (this.closing || this.sync.loadState !== "ready") return;
    if (this.leaseCtl.heldEpoch === null || this.writes.held) {
      // Captured while this session may not write (Univer should have refused it): the model is ahead of the
      // server. Diverged, not reloaded at once, so an adapter that emits on load can never loop. The holder's model
      // is what its snapshots are written from: the edit reaches the readers as a snapshot reset.
      this.sync.driftedLocally();
      if (this.leaseCtl.heldEpoch !== null) this.versions.requestSnapshot();
      return;
    }
    this.queue.add(op);
    this.leaseCtl.noteActivity();
    this.versions.noteActivity();
  };

  /** §5.6: what never reached the server is counted from this session's own rows, dropped, and the model reloaded. */
  private onLeaseLost(row: SheetLeaseRow | null): void {
    const discardedOps = this.writes.discardForLostLease();
    this.sync.dropParked();
    this.writes.pause(false);
    this.events.emit("leaseLost", { byName: row?.holderName ?? "", discardedOps });
    if (discardedOps > 0 && this.sync.model) void this.sync.load("lease_lost");
    this.refresh();
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private mayEdit(): boolean {
    return this.canEditValue && this.accessLostCode === null && !this.operatorChangedFlag && this.sync.updateRequiredApp === null;
  }

  /** Univer is editable exactly while this session may write: held lease, loaded, nothing paused or too large. */
  private applyEditable(): void {
    const model = this.sync.model;
    if (!model || this.sync.loadState !== "ready") return;
    model.setEditable(this.leaseCtl.heldEpoch !== null && this.mayEdit() && !this.writes.held && this.sizeWarningValue !== "too_large");
  }

  private afterLoad(reason: SheetReloadReason | null): void {
    this.writes.loaded(reason);
    const snapshotBytes = this.live.source?.snapshot()?.byteLength ?? 0;
    if (snapshotBytes >= this.tuning.stateWarnBytes) this.setSizeWarning("near_limit"); // §4.9 soft warning
    this.applyEditable();
    this.versions.setActive(this.leaseCtl.heldEpoch !== null);
    this.leaseCtl.evaluate();
    this.startPresence();
    this.people.update();
    this.events.emit("loaded");
    if (reason) this.events.emit("reloaded", reason);
    this.writes.resume();
    this.refresh();
  }

  private onSyncChanged(): void {
    const { skippedOps, skippedRows } = this.sync.skippedCounts;
    const key = `${skippedOps}:${skippedRows}`;
    if (key !== this.integrityKey) {
      this.integrityKey = key;
      this.events.emit("integrity", { skippedOps, skippedRows });
    }
    this.refresh();
  }

  private trackLog(): void {
    const rows = this.live.source?.rowsAfter(-1n) ?? [];
    this.versions.noteLog(rows.length, rows.reduce((sum, row) => sum + row.byteLength, 0));
  }

  private startPresence(): void {
    const conn = this.live.connection;
    if (conn && this.live.applied && this.sync.model && !this.closing) this.presence.start(conn.connectionIdHex);
  }

  private setSizeWarning(kind: SheetSizeWarning): void {
    if (this.sizeWarningValue && SHEET_SIZE_RANK[this.sizeWarningValue] >= SHEET_SIZE_RANK[kind]) return; // once per change
    this.sizeWarningValue = kind;
    this.events.emit("sizeWarning", kind);
    this.applyEditable();
    this.refresh();
  }

  private loseAccess(code: DocErrorCode): void {
    if (this.accessLostCode !== null) return;
    this.accessLostCode = code;
    this.leaseCtl.forget();
    this.versions.setActive(false);
    this.applyEditable();
    this.events.emit("accessLost", code);
    this.refresh();
  }

  private onCallFailed(err: unknown): void {
    const code = docErrorCode(err);
    if (code === "forbidden" || code === "not_found" || code === "trashed" || code === "not_published") return this.loseAccess(code);
    if (this.retireIfOperatorChanged(err)) return;
    this.reportError(sheetErrorCode(err) ?? code ?? "unknown", err);
  }

  /**
   * `[drive.operator]` while this device's operator row names someone else: the PIN operator this session acts for
   * was replaced on the store tablet, so no write, heartbeat or retry of it can ever be accepted again. Its unsent
   * edits are dropped and the lease given back (the release goes by session, not operator), so no "Saving", unload
   * prompt or held lease outlives it; the session cache evicts it. A stale PIN of the same operator, or a locked
   * device (no row), stays a retry: that person may still come back.
   */
  private retireIfOperatorChanged(err: unknown): boolean {
    if (this.operatorChangedFlag) return true;
    const acting = this.opts.actingMemberId.trim();
    if (acting === "" || driveErrorCode(err) !== "operator") return false;
    const current = this.live.connection?.deviceOperator?.() ?? null;
    if (!current || (sameMemberId(current.memberId, acting) && sameMemberId(current.organizationId, this.opts.organizationId))) return false;
    this.operatorChangedFlag = true;
    this.reportError("unknown", err);
    this.writes.discardForLostLease();
    this.sync.dropParked(); // it holds what was just discarded
    if (this.leaseCtl.heldEpoch !== null) void this.leaseCtl.release();
    void this.leaseCtl.cancelRequest().catch(() => {});
    this.leaseCtl.evaluate();
    this.applyEditable();
    this.refresh();
    return true;
  }

  private reportError(code: SheetSessionErrorCode, err: unknown): void {
    const message = sheetErrorMessage(err) || (err instanceof Error ? err.message : String(err ?? ""));
    const key = `${code}:${message}`;
    if (key === this.lastErrorKey) return; // one report per repeated retry failure
    this.lastErrorKey = key;
    this.events.emit("error", { code, message });
  }

  private refresh(): void {
    const status = this.computeStatus();
    if (status !== this.statusValue) {
      this.statusValue = status;
      if (status === "saved") this.lastErrorKey = "";
      this.events.emit("status", status);
    }
    this.events.emit("changed");
  }

  private computeStatus(): SheetSyncStatus {
    if (this.accessLostCode !== null || this.operatorChangedFlag || this.sync.loadState === "load_failed") return "error";
    if (!this.live.connection) return this.live.everApplied ? "offline" : "connecting";
    if (!this.live.applied || (this.sync.model !== null && this.sync.loadState === "loading")) return "syncing";
    if (this.queue.isOffline) return "offline";
    return this.queue.hasUnsaved ? "saving" : "saved";
  }

  private onVisibility = (): void => this.setHidden(document.visibilityState === "hidden");

  /**
   * Page unload, best effort: unsaved work tries to get out; otherwise the lease is released (else it detaches) and,
   * as writes.release() would, the grid turns read-only: a page the back/forward cache restores must never capture
   * edits into a lease it no longer holds.
   */
  private onPageHide = (): void => {
    if (this.queue.hasUnsaved) {
      void this.queue.flush();
    } else if (this.leaseCtl.heldEpoch !== null) {
      this.versions.setActive(false);
      this.writes.discard();
      void this.leaseCtl.release();
      this.applyEditable();
    }
  };

  /** Restored from the back/forward cache: judged again as on open (auto-acquire included). */
  private onPageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || this.closing) return;
    this.leaseCtl.rearmAutoAcquire();
    this.leaseCtl.evaluate();
    this.applyEditable();
    this.refresh();
  };
}
