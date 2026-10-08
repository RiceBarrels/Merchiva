// Bringing the server's rows into the bound model (sheets.md §4.5, §4.6).
//
// applyRemoteRow is the receive policy for one `document_update` row written by another session: decode, the app
// version gate, then per op acceptRemoteOp (the persisted-mutation allow-list of lib/sheets/univer/mutation-filter.ts,
// passed in so this layer never loads the editor chunk) → sanitizeOpParams → adapter.applyRemote. Commands and
// operations are never executed from the log. A refused op or an undecodable row is skipped and marks the client
// diverged; an accepted op that fails to execute reloads once, and fails the second time as a poisoned row, which is
// skipped from then on — never a reload loop.
//
// SheetModelSync owns the model side of a session: load (snapshot + log, restarted when a compaction lands during an
// async decode), reload, parked workbooks, live rows, and the diverged / update-required state. The rows come from
// ./live/subscription.ts.
//
// Pure: no React, no Univer runtime (type imports only).

import type { IWorkbookData } from "@univerjs/presets";
import type { DocSnapshotRow, DocUpdateRow } from "@/lib/docs/types";
import {
  SHEET_ASYNC_DECODE_MIN_BYTES, decodeSheetEnvelope, decodeSheetEnvelopeAsync, decodeSheetOps,
} from "@/lib/sheets/codec";
import { SHEET_APP_VERSION, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import { sanitizeOpParams, sanitizeWorkbookData } from "@/lib/sheets/sanitize";
import type { SheetModelAdapter, SheetOp } from "@/lib/sheets/types";
import type { SheetRowSource } from "./live/subscription";

/** acceptRemoteOp of lib/sheets/univer/mutation-filter.ts: a plain {mutationId, params} op classified "sync". */
export type SheetOpAcceptor = (op: unknown, unitId: string) => op is SheetOp;

export type SheetReloadReason = "reset" | "stale" | "diverged" | "lease_lost" | "rebind";
export type SheetLoadState = "loading" | "ready" | "load_failed";

/** True when `app` (a writer's SHEET_APP_VERSION) is newer than this client's: numeric major.minor.patch compare. */
export function isNewerSheetApp(app: string, current: string = SHEET_APP_VERSION): boolean {
  const parts = (v: string) => v.split(".").slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parts(app), parts(current)];
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Rows that failed to execute once (the next failure poisons them) and rows skipped for good. */
export class SheetPoisonTracker {
  private readonly failedOnce = new Set<bigint>();
  private readonly poisoned = new Set<bigint>();
  isPoisoned(id: bigint): boolean { return this.poisoned.has(id); }
  /** Records a failure; true when the row had failed before (it is poisoned now). */
  fail(id: bigint): boolean {
    if (this.failedOnce.has(id)) {
      this.poisoned.add(id);
      return true;
    }
    this.failedOnce.add(id);
    return false;
  }
}

export interface SheetApplyContext {
  model: SheetModelAdapter;
  acceptRemoteOp: SheetOpAcceptor;
  poison: SheetPoisonTracker;
  unitId?: string;
}

export type SheetRowOutcome =
  | { kind: "applied"; refusedOps: number }
  /** resetSheetContent's throw-away marker (empty payload): nothing to apply. */
  | { kind: "marker" }
  | { kind: "undecodable"; error: unknown }
  | { kind: "update_required"; app: string }
  /** An accepted op failed to execute for the first time: reload once. */
  | { kind: "failed" }
  | { kind: "poisoned" };

/** The §4.5 receive policy for one foreign row. */
export function applyRemoteRow(row: DocUpdateRow, ctx: SheetApplyContext): SheetRowOutcome {
  if (ctx.poison.isPoisoned(row.id)) return { kind: "poisoned" };
  if (row.payload.byteLength === 0) return { kind: "marker" };
  let batch;
  try {
    batch = decodeSheetOps(row.payload);
  } catch (error) {
    return { kind: "undecodable", error };
  }
  if (isNewerSheetApp(batch.app)) return { kind: "update_required", app: batch.app };
  const unitId = ctx.unitId ?? SHEET_UNIT_ID;
  const accepted: SheetOp[] = [];
  let refusedOps = 0;
  for (const op of batch.ops) {
    if (!ctx.acceptRemoteOp(op, unitId)) {
      refusedOps++;
      continue;
    }
    try {
      sanitizeOpParams(op.mutationId, op.params);
    } catch {
      refusedOps++; // beyond the sanitizer's depth / node caps
      continue;
    }
    accepted.push(op);
  }
  if (accepted.length === 0) return { kind: "applied", refusedOps };
  let failedAt: number;
  try {
    failedAt = ctx.model.applyRemote(accepted).failedAt;
  } catch {
    failedAt = 0;
  }
  if (failedAt < 0) return { kind: "applied", refusedOps };
  return ctx.poison.fail(row.id) ? { kind: "poisoned" } : { kind: "failed" };
}

/** The `seq` of every decodable row this session wrote after `afterId` (which of its batches committed). */
export function committedSeqsOf(rows: Iterable<DocUpdateRow>, sessionId: string, afterId: bigint): Set<number> {
  const seqs = new Set<number>();
  for (const row of rows) {
    if (row.sessionId !== sessionId || row.id <= afterId || row.payload.byteLength === 0) continue;
    try {
      seqs.add(decodeSheetOps(row.payload).seq);
    } catch {
      // Not ours to judge: an unreadable own row counts as not committed.
    }
  }
  return seqs;
}

export interface SheetModelSyncHost {
  /** Null while there is no applied subscription. */
  source(): SheetRowSource | null;
  /** This session holds the lease: its model is what the snapshots are written from. */
  isWriter(): boolean;
  loaded(reason: SheetReloadReason | null): void;
  loadFailed(error: unknown): void;
  /** Load state, divergence, skipped counts or update-required changed. */
  changed(): void;
  undecodable(error: unknown): void;
  updateRequired(app: string): void;
}

export interface SheetModelSyncOptions {
  sessionId: string;
  acceptRemoteOp: SheetOpAcceptor;
  host: SheetModelSyncHost;
}

const LOAD_ATTEMPTS = 3;

export class SheetModelSync {
  private readonly opts: SheetModelSyncOptions;
  private readonly poison = new SheetPoisonTracker();
  private modelValue: SheetModelAdapter | null = null;
  private state: SheetLoadState = "loading";
  private through = 0n;
  private parkedValue: { wb: IWorkbookData; through: bigint } | null = null;
  private loadGeneration = 0;
  private reloadingValue = false;
  /** Highest id of a skipped row or op (null: in step with the log). A snapshot covering it heals the model. */
  private divergedThrough: bigint | null = null;
  private skipped = { ops: 0, rows: 0 };
  private updateApp: string | null = null;
  private reloadAfter: SheetReloadReason | null = null;

  constructor(opts: SheetModelSyncOptions) {
    this.opts = opts;
  }

  get model(): SheetModelAdapter | null { return this.modelValue; }
  get loadState(): SheetLoadState { return this.state; }
  get appliedThrough(): bigint { return this.through; }
  get parked(): boolean { return this.parkedValue !== null; }
  get reloading(): boolean { return this.reloadingValue; }
  get diverged(): boolean { return this.divergedThrough !== null; }
  get skippedCounts(): { skippedOps: number; skippedRows: number } { return { skippedOps: this.skipped.ops, skippedRows: this.skipped.rows }; }
  get updateRequiredApp(): string | null { return this.updateApp; }

  /** Swap the model. A new one is loaded by the caller (load()); null leaves the session parked or modelless. */
  bind(model: SheetModelAdapter | null): void {
    this.modelValue = model;
    this.loadGeneration++;
    this.state = "loading";
    this.reloadingValue = false;
    this.opts.host.changed();
  }

  /** Keep the unmounted editor's workbook: a re-bind within the idle window loads it instead of decoding. */
  park(snapshot: { wb: IWorkbookData; through: bigint }): void {
    this.parkedValue = { wb: snapshot.wb, through: snapshot.through };
  }

  dropParked(): void {
    this.parkedValue = null;
  }

  /**
   * sheets.md §4.6. `reason` null = the model's first load; anything else is a reload (the banner shows). The model
   * is read-only from the start; the host's loaded() decides what it may do after.
   */
  async load(reason: SheetReloadReason | null): Promise<void> {
    const model = this.modelValue;
    if (!model) return;
    const generation = ++this.loadGeneration;
    const current = () => generation === this.loadGeneration && this.modelValue === model;
    // Read-only until the host re-applies it after the load (§5.6): an edit typed during an async decode would be
    // wiped by model.load() while its op still went out.
    model.setEditable(false);
    this.state = "loading";
    this.reloadingValue = reason !== null;
    this.reloadAfter = null;
    this.opts.host.changed();
    for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
      const snap = this.opts.host.source()?.snapshot() ?? null;
      if (!snap) return this.fail(new Error("The spreadsheet has no saved content"));
      const parked = this.parkedValue;
      let wb: IWorkbookData;
      let base: bigint;
      let fromServer: boolean;
      if (parked && snap.throughUpdateId <= parked.through) {
        // No reset or compaction moved past the parked workbook: it holds everything up to parked.through.
        [wb, base, fromServer] = [parked.wb, parked.through, false];
      } else {
        const token = { through: snap.throughUpdateId, compactedAt: snap.compactedAt.getTime() };
        let app: string;
        try {
          const envelope = snap.byteLength >= SHEET_ASYNC_DECODE_MIN_BYTES
            ? await decodeSheetEnvelopeAsync(snap.state)
            : decodeSheetEnvelope(snap.state);
          [wb, app] = [envelope.wb, envelope.app];
        } catch (error) {
          if (current()) this.fail(error);
          return;
        }
        if (!current()) return;
        const now = this.opts.host.source()?.snapshot() ?? null;
        if (!now || now.throughUpdateId !== token.through || now.compactedAt.getTime() !== token.compactedAt) continue;
        [base, fromServer] = [token.through, true];
        if (isNewerSheetApp(app)) this.flagUpdateRequired(app);
      }
      // Synchronous from here to the end of the replay: the row cache cannot change in between.
      try {
        model.load(sanitizeWorkbookData(wb));
      } catch (error) {
        return this.fail(error);
      }
      this.parkedValue = null;
      this.through = base;
      if (fromServer) {
        this.divergedThrough = null;
        this.skipped = { ops: 0, rows: 0 };
      }
      // A fresh model lacks this session's own rows after the snapshot; a parked one already holds them.
      for (const row of this.opts.host.source()?.rowsAfter(base) ?? []) this.applyRow(row, !fromServer);
      this.state = "ready";
      this.reloadingValue = false;
      this.opts.host.changed();
      this.opts.host.loaded(reason);
      this.runPendingReload();
      return;
    }
    this.fail(new Error("The spreadsheet kept changing while it loaded"));
  }

  /** A live `document_update` insert. Own rows are already in the model; foreign rows go through the policy. */
  onRow(row: DocUpdateRow): void {
    if (this.state !== "ready" || !this.modelValue) return;
    this.applyRow(row, true);
    this.runPendingReload();
  }

  /**
   * A snapshot insert/update: a reset (or anything past what was applied) reloads; one covering a skipped row heals
   * a reader by reloading, and the writer at once (the snapshot was written from its own model).
   */
  onSnapshot(snap: DocSnapshotRow): void {
    if (this.state === "load_failed" && this.modelValue) {
      void this.load(null); // a new snapshot may be readable where the last one was not (or was missing)
      return;
    }
    if (this.state !== "ready" || !this.modelValue) return;
    if (snap.throughUpdateId > this.through) {
      void this.load("reset");
    } else if (this.divergedThrough !== null && snap.throughUpdateId >= this.divergedThrough) {
      if (!this.opts.host.isWriter()) {
        void this.load("diverged");
        return;
      }
      this.divergedThrough = null;
      this.skipped = { ops: 0, rows: 0 };
      this.opts.host.changed();
    }
  }

  /** After a re-subscribe with the model still loaded: a moved snapshot reloads, otherwise the missed rows replay. */
  catchUp(): void {
    if (this.state !== "ready" || !this.modelValue) return;
    const source = this.opts.host.source();
    const snap = source?.snapshot() ?? null;
    if (!source || !snap) return;
    if (snap.throughUpdateId > this.through) {
      void this.load("reset");
      return;
    }
    for (const row of source.rowsAfter(this.through)) this.applyRow(row, true);
    this.runPendingReload();
  }

  /** A local edit this session cannot save: the model is ahead of the log until a snapshot covers it. */
  driftedLocally(): void {
    if (this.state === "ready") this.skip(this.through, 1, 0);
  }

  private applyRow(row: DocUpdateRow, skipOwn: boolean): void {
    if (row.id <= this.through || this.updateApp !== null || this.reloadAfter !== null) return;
    const model = this.modelValue;
    if (!model) return;
    if (skipOwn && row.sessionId === this.opts.sessionId) {
      this.through = row.id;
      return;
    }
    const outcome = applyRemoteRow(row, { model, acceptRemoteOp: this.opts.acceptRemoteOp, poison: this.poison });
    switch (outcome.kind) {
      case "update_required":
        this.flagUpdateRequired(outcome.app);
        return; // stop here: nothing after it is applied
      case "failed":
        this.reloadAfter = "diverged";
        return;
      case "applied":
        if (outcome.refusedOps > 0) this.skip(row.id, outcome.refusedOps, 0);
        break;
      case "undecodable":
        this.skip(row.id, 0, 1);
        this.opts.host.undecodable(outcome.error);
        break;
      case "poisoned":
        this.skip(row.id, 0, 1);
        break;
      case "marker":
        break;
    }
    this.through = row.id;
  }

  private skip(id: bigint, ops: number, rows: number): void {
    this.skipped = { ops: this.skipped.ops + ops, rows: this.skipped.rows + rows };
    if (this.divergedThrough === null || id > this.divergedThrough) this.divergedThrough = id;
    this.opts.host.changed();
  }

  private flagUpdateRequired(app: string): void {
    if (this.updateApp !== null) return;
    this.updateApp = app;
    this.opts.host.changed();
    this.opts.host.updateRequired(app);
  }

  private runPendingReload(): void {
    const reason = this.reloadAfter;
    if (reason === null || this.state !== "ready") return;
    this.reloadAfter = null;
    void this.load(reason);
  }

  private fail(error: unknown): void {
    this.state = "load_failed";
    this.reloadingValue = false;
    this.opts.host.changed();
    this.opts.host.loadFailed(error);
  }
}
