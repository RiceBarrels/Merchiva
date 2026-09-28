// Compaction and versions of a spreadsheet (sheets.md §4.7). Only the lease holder compacts, and only while a model is
// bound: the snapshot is `encodeSheetSnapshot(model.save())` through `appliedThrough`, so every captured op must be
// committed and echoed first (the session's writer() is null otherwise). There is no compaction on unmount or while
// parked — the parked workbook is not re-encoded, and every captured op is already on the server or in the queue.
//
// Triggers: the log reaches 150 rows or 1 MiB (at most every 30 s); 20 s idle with ≥ 10 rows; before release,
// hand-over, "Make a copy" and "Download" (compactNow); after a mutation that cannot travel as an op, or an edit
// captured while writes were held (requestSnapshot). Such a change always goes as a reset of the whole workbook
// (seq-fenced, edits held until it lands; every reader reloads): a compaction only moves the snapshot up to rows a
// reader has already applied, so no reader would reload it, and a later holder would write its own model over it.
// Auto versions: every 10 min of editing, when appliedThrough moved (the server gates the gap).
// Named versions come from any editor; a restore or a replace (holder) saves a safety version, then resets.
//
// Pure: no React, no Univer runtime.

import { decodeSheetEnvelopeAsync, encodeSheetSnapshot } from "@/lib/sheets/codec";
import { SHEET_TUNING, type SheetTuning } from "@/lib/sheets/constants";
import { SheetOfflineError, sheetErrorCode } from "@/lib/sheets/errors";
import { sanitizeWorkbookData } from "@/lib/sheets/sanitize";
import { serializeSheetText } from "@/lib/sheets/serialize-text";
import type { SheetModelAdapter } from "@/lib/sheets/types";
import { SHEET_TIMERS, type SheetResetContent, type SheetTimers } from "./push-queue";
import { isNewerSheetApp } from "./remote-apply";
import type { SheetTransport } from "./transport";

/** Everything a compaction or an auto version is written against, at one instant. */
export interface SheetCompactionWriter {
  leaseEpoch: bigint;
  appliedThrough: bigint;
  snapshotThrough: bigint;
  model: SheetModelAdapter;
}

export interface SheetCompactorOptions {
  documentId: string;
  sessionId: string;
  actingMemberId(): string;
  transport: Pick<SheetTransport, "compact" | "saveVersion">;
  /**
   * Non-null only when the snapshot would be exact: this session holds the lease on its connection, the model is
   * loaded, nothing is waiting or in flight, and the lease row shows every committed write (so its rows are applied).
   */
  writer(): SheetCompactionWriter | null;
  /** Drain the push queue; false when that cannot finish now. */
  flush(): Promise<boolean>;
  /** The loaded model, how far it applied the log, and the lease as this session holds it (null: not loaded). */
  reader(): { model: SheetModelAdapter; appliedThrough: bigint; heldEpoch: bigint | null; bound: boolean } | null;
  enqueueReset(content: SheetResetContent, baseUpdateId: bigint): Promise<void>;
  /** Hold local edits back (true) while a replace or a snapshot reset is under way. */
  pauseWrites(paused: boolean): void;
  sizeWarning(kind: "near_limit" | "too_large"): void;
  error(err: unknown): void;
  tuning?: Partial<SheetTuning>;
  now?: () => number;
  timers?: SheetTimers;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/** The encoded workbook plus its search text, as compactSheet / saveSheetVersion / resetSheetContent take them. */
export function encodeSheetContent(model: SheetModelAdapter): SheetResetContent {
  const wb = model.save();
  const { plainText, cellCount } = serializeSheetText(wb);
  return { state: encodeSheetSnapshot(wb), plainText, cellCount };
}

export class SheetCompactor {
  private readonly opts: SheetCompactorOptions;
  private readonly tuning: SheetTuning;
  private readonly now: () => number;
  private readonly timers: SheetTimers;
  private logRows = 0;
  private logBytes = 0;
  private lastCompactAt = Number.NEGATIVE_INFINITY;
  private running: Promise<boolean> | null = null;
  private disabled = false;
  private snapshotWanted = false;
  /** A snapshot write was refused: check() tries it again from this time (0: at once). */
  private snapshotRetryAt = 0;
  private active = false;
  private lastVersionThrough = -1n;
  private idleTimer: TimerHandle | null = null;
  private intervalTimer: TimerHandle | null = null;
  private versionTimer: TimerHandle | null = null;
  private disposed = false;

  constructor(opts: SheetCompactorOptions) {
    this.opts = opts;
    this.tuning = { ...SHEET_TUNING, ...opts.tuning };
    this.now = opts.now ?? Date.now;
    this.timers = opts.timers ?? SHEET_TIMERS;
  }

  /** The state went over stateMaxBytes: no more compactions until the model is loaded from the server again. */
  get isDisabled(): boolean { return this.disabled; }

  /**
   * The model was loaded from the server (a reload, "Discard change"): it holds nothing a snapshot still waits for,
   * and a size refusal of the content it replaced no longer applies.
   */
  loadedFromServer(): void {
    this.disabled = false;
    this.snapshotWanted = false;
    this.snapshotRetryAt = 0;
  }

  /** The session holds the lease with a model bound (true) or not: the auto-version clock runs only meanwhile. */
  setActive(active: boolean): void {
    if (active === this.active || this.disposed) return;
    this.active = active;
    this.clear("versionTimer");
    this.clear("idleTimer");
    if (active) this.armVersionTimer();
  }

  /** The op log of this document now holds `rows` rows of `bytes` bytes. */
  noteLog(rows: number, bytes: number): void {
    this.logRows = rows;
    this.logBytes = bytes;
    this.check();
  }

  /** A local edit was captured: restart the 20 s idle clock. */
  noteActivity(): void {
    if (!this.active || this.disposed) return;
    this.clear("idleTimer");
    this.idleTimer = this.timers.setTimeout(() => {
      this.idleTimer = null;
      if (this.logRows >= 10) void this.compactNow();
    }, this.tuning.compactIdleMs);
  }

  /** A mutation could not be captured as an op: write a snapshot once the queue drains. */
  requestSnapshot(): void {
    this.snapshotWanted = true;
    void this.compactNow();
  }

  /**
   * The push queue may have drained: a wanted snapshot goes now (after a refused write, at most every
   * compactMinIntervalMs — this runs after every committed batch), an over-threshold log at most every 30 s.
   */
  check(): void {
    if (!this.active || this.disposed || this.running) return;
    let at: number;
    if (this.snapshotWanted) at = this.snapshotRetryAt;
    else if (this.logRows >= this.tuning.compactMaxRows || this.logBytes >= this.tuning.compactMaxBytes) {
      at = this.lastCompactAt + this.tuning.compactMinIntervalMs;
    } else return;
    const wait = at - this.now();
    if (wait <= 0) {
      void this.compactNow();
    } else if (this.intervalTimer === null) {
      this.intervalTimer = this.timers.setTimeout(() => {
        this.intervalTimer = null;
        this.check();
      }, wait);
    }
  }

  /** Flush, then snapshot through appliedThrough. True when the log is compacted (or there was nothing to do). */
  compactNow(): Promise<boolean> {
    if (this.running) return this.running;
    const run = this.run().finally(() => {
      if (this.running === run) this.running = null;
    });
    this.running = run;
    void run.then((done) => {
      // A snapshot requested while this one was written holds a change it does not: it goes next.
      if (done && this.snapshotWanted) this.check();
    }, () => {});
    return run;
  }

  /** An auto version of the current content (holder only; the server skips it inside the 10-min gap). */
  async saveAutoVersion(): Promise<void> {
    if (!(await this.opts.flush())) return;
    const writer = this.opts.writer();
    if (!writer || writer.appliedThrough === this.lastVersionThrough) return;
    const content = encodeSheetContent(writer.model);
    if (content.state.byteLength > this.tuning.stateMaxBytes) return;
    await this.opts.transport.saveVersion({
      documentId: this.opts.documentId, sessionId: this.opts.sessionId, leaseEpoch: writer.leaseEpoch, kind: "auto",
      state: content.state, throughUpdateId: writer.appliedThrough, cellCount: content.cellCount,
      actingMemberId: this.opts.actingMemberId(),
    });
    this.lastVersionThrough = writer.appliedThrough;
  }

  /** Name the current content (any editor; the holder flushes first so its own edits are in it). */
  async saveNamedVersion(name: string): Promise<void> {
    const reader = this.requireReader();
    if (reader.heldEpoch !== null) await this.opts.flush();
    const content = this.checkedContent(reader.model);
    await this.opts.transport.saveVersion({
      documentId: this.opts.documentId, sessionId: this.opts.sessionId, leaseEpoch: reader.heldEpoch ?? 0n, kind: "named",
      name, state: content.state, throughUpdateId: reader.appliedThrough, cellCount: content.cellCount,
      actingMemberId: this.opts.actingMemberId(),
    });
  }

  /** Restore a version's bytes (holder): decoded and sanitized first, so a corrupt version fails before anything. */
  async restoreVersion(state: Uint8Array, safetyName: string): Promise<void> {
    const envelope = await decodeSheetEnvelopeAsync(state);
    if (isNewerSheetApp(envelope.app)) throw new Error("[sheet.invalid] This version was saved by a newer app");
    const wb = sanitizeWorkbookData(envelope.wb);
    await this.replaceContent({ state: encodeSheetSnapshot(wb), ...serializeSheetText(wb) }, safetyName);
  }

  /** Replace the whole content (holder); every reader reloads. `safetyName` first saves a restore version. */
  async replaceContent(content: SheetResetContent, safetyName?: string): Promise<void> {
    const reader = this.requireReader();
    if (reader.heldEpoch === null || !reader.bound) throw new Error("[sheet.lease] Start editing first");
    if (content.state.byteLength > this.tuning.stateMaxBytes) throw new Error("[sheet.too_large] Spreadsheet is too large");
    this.opts.pauseWrites(true);
    try {
      if (!(await this.opts.flush())) throw new SheetOfflineError();
      const current = this.requireReader();
      if (current.heldEpoch !== reader.heldEpoch) throw new Error("[sheet.lease] Someone else is editing this spreadsheet");
      if (safetyName) {
        const safety = this.checkedContent(current.model);
        await this.opts.transport.saveVersion({
          documentId: this.opts.documentId, sessionId: this.opts.sessionId, leaseEpoch: reader.heldEpoch, kind: "restore",
          name: safetyName, state: safety.state, throughUpdateId: current.appliedThrough, cellCount: safety.cellCount,
          actingMemberId: this.opts.actingMemberId(),
        });
      }
      await this.opts.enqueueReset(content, current.appliedThrough);
    } finally {
      this.opts.pauseWrites(false);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.active = false;
    this.clear("idleTimer");
    this.clear("intervalTimer");
    this.clear("versionTimer");
  }

  private async run(): Promise<boolean> {
    if (this.disabled || this.disposed || !(await this.opts.flush())) return false;
    // Synchronous from the writer() check to the call: nothing can be captured or applied in between.
    const writer = this.opts.writer();
    if (!writer) return false;
    const wanted = this.snapshotWanted;
    if (writer.appliedThrough < writer.snapshotThrough) return false; // the model is behind: a reload is due
    // A change the log never carried needs a reset (see the file header); without one, compactSheet has nothing to
    // do unless the snapshot moves forward.
    if (!wanted && writer.appliedThrough === writer.snapshotThrough) return true;
    const viaReset = wanted;
    // Held from before the encode until the reset lands and the reload it causes has begun: an edit captured in
    // between would be queued after the reset, then missing from this model once it reloads from the reset.
    if (viaReset) this.opts.pauseWrites(true);
    try {
      const content = encodeSheetContent(writer.model);
      if (content.state.byteLength > this.tuning.stateMaxBytes) {
        this.disabled = true;
        this.opts.sizeWarning("too_large");
        return false;
      }
      if (content.state.byteLength >= this.tuning.stateWarnBytes) this.opts.sizeWarning("near_limit");
      this.lastCompactAt = this.now();
      this.snapshotWanted = false; // a request from here on is a change this content does not hold
      await this.write(writer, content, viaReset);
      this.snapshotRetryAt = 0;
      return true;
    } catch (err) {
      if (wanted) {
        this.snapshotWanted = true; // kept until a write lands
        this.snapshotRetryAt = this.now() + this.tuning.compactMinIntervalMs;
      }
      if (sheetErrorCode(err) === "too_large") {
        this.disabled = true;
        this.opts.sizeWarning("too_large");
      } else if (sheetErrorCode(err) !== "offline" && !viaReset) {
        this.opts.error(err); // a refused reset reached the session through the push queue already
      }
      return false;
    } finally {
      if (viaReset) this.opts.pauseWrites(false);
    }
  }

  private async write(writer: SheetCompactionWriter, content: SheetResetContent, viaReset: boolean): Promise<void> {
    if (viaReset) return this.opts.enqueueReset(content, writer.appliedThrough);
    await this.opts.transport.compact({
      documentId: this.opts.documentId, sessionId: this.opts.sessionId, leaseEpoch: writer.leaseEpoch,
      throughUpdateId: writer.appliedThrough, state: content.state, plainText: content.plainText,
      cellCount: content.cellCount, actingMemberId: this.opts.actingMemberId(),
    });
  }

  private requireReader(): NonNullable<ReturnType<SheetCompactorOptions["reader"]>> {
    const reader = this.opts.reader();
    if (!reader) throw new Error("[sheet.invalid] The spreadsheet is not open");
    return reader;
  }

  private checkedContent(model: SheetModelAdapter): SheetResetContent {
    const content = encodeSheetContent(model);
    if (content.state.byteLength > this.tuning.stateMaxBytes) throw new Error("[sheet.too_large] Spreadsheet is too large");
    return content;
  }

  private armVersionTimer(): void {
    this.versionTimer = this.timers.setTimeout(() => {
      this.versionTimer = null;
      if (!this.active) return;
      this.saveAutoVersion()
        .catch((err: unknown) => {
          if (sheetErrorCode(err) !== "offline") this.opts.error(err);
        })
        .finally(() => {
          if (this.active && !this.disposed && this.versionTimer === null) this.armVersionTimer();
        });
    }, this.tuning.autoVersionIntervalMs);
  }

  private clear(key: "idleTimer" | "intervalTimer" | "versionTimer"): void {
    const timer = this[key];
    if (timer !== null) this.timers.clearTimeout(timer);
    this[key] = null;
  }
}
