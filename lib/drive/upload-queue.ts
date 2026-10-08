// The tab's upload queue: files wait, run two at a time (a multipart file runs
// alone), report throttled progress, and can be cancelled or retried. No React;
// use-drive-uploads.ts reads it with useSyncExternalStore.
//
// Every file is planned at enqueue, so its item id is known at once (the list
// shows the pending row as "uploading"); a file that cannot be uploaded at all
// (too large, blocked type, bad name) enters as `failed`. The pending row is
// reserved only when the file starts. The queue lives in memory: closing the
// tab leaves pending rows to the upload webhook or the module's sweep, so the
// tab's queue arms the browser's "leave site?" question while anything is
// queued or running, whichever page is on screen.
//
// A failed file keeps its pending row for Retry, which commits first, only
// when the attempt may have left one: a failure that reserved nothing
// (driveUploadReservedNothing: storage off, a refused begin) retries from
// begin with the same plan, and there is nothing to release. A resume that
// fails keeps committing first on the next Retry, even after `not_configured`:
// the commit route checks storage before it looks at the row, so that says
// nothing about the row, which an earlier attempt did reserve. While the tab's
// status says the store is not configured, the transport fails that commit at
// once without a request, so such Retries send nothing until it comes back.

import { newDocumentId } from "@/lib/docs/ids";
import { driveErrorCode, type DriveClientErrorCode } from "@/lib/drive/errors";
import {
  driveUploadReservedNothing, planDriveUpload, sharedDriveUploadTransport, uploadDriveFile, type DriveUploadPlan,
  type DriveUploadProgress, type DriveUploadSource, type DriveUploadTarget, type DriveUploadTransport,
} from "@/lib/drive/upload";

export type DriveUploadState = "queued" | "preparing" | "uploading" | "finalizing" | "done" | "failed" | "cancelled";
export interface DriveUploadEntry {
  key: string;
  /** '' when the file could not be planned. Changes if a retry has to start the upload over. */
  itemId: string;
  name: string;
  sizeBytes: number;
  target: DriveUploadTarget;
  state: DriveUploadState;
  /** Bytes of the original sent so far. */
  loaded: number;
  errorCode: DriveClientErrorCode | "generic" | null;
  createdAt: number;
}
export interface DriveUploadQueue {
  /** Returns one key per file: the planned item id, or a fresh id for a file that failed planning. */
  enqueue(files: ReadonlyArray<DriveUploadSource>, target: DriveUploadTarget): string[];
  cancel(key: string): void;
  retry(key: string): void;
  /** Drops done, failed and cancelled entries; a failed entry's pending row is released. */
  clearFinished(): void;
  /** Entries still queued or running (the leave-page guard). */
  activeCount(): number;
  /** Item ids of entries still queued or running. The same Set until the entries change. */
  localItemIds(): ReadonlySet<string>;
  subscribe(listener: () => void): () => void;
  /** Immutable; a new array (and new objects for the changed entries) after every change. */
  getSnapshot(): readonly DriveUploadEntry[];
}
export interface DriveUploadQueueDeps { transport: DriveUploadTransport; concurrency?: number; now?: () => number }

/** Progress-only changes reach listeners at most this often; state changes go out at once. */
export const DRIVE_UPLOAD_PROGRESS_INTERVAL_MS = 100;
const DEFAULT_CONCURRENCY = 2;
const ACTIVE_STATES: ReadonlySet<DriveUploadState> = new Set<DriveUploadState>(["queued", "preparing", "uploading", "finalizing"]);
const RUNNING_STATES: ReadonlySet<DriveUploadState> = new Set<DriveUploadState>(["preparing", "uploading", "finalizing"]);
/** Within one attempt the phases only move forward. */
const PHASE_RANK: Readonly<Record<DriveUploadProgress["phase"], number>> = { preparing: 0, uploading: 1, finalizing: 2 };
/** On a resume, these mean the pending row is gone or unusable: start over with new ids. */
const RESTART_CODES: ReadonlySet<string> = new Set(["not_found", "expired", "conflict", "trashed", "too_many_attempts", "upload_start_failed"]);

interface Job {
  key: string;
  /** Dropped once done; kept for retry otherwise. */
  source: DriveUploadSource | null;
  target: DriveUploadTarget;
  plan: DriveUploadPlan | null;
  entry: DriveUploadEntry;
  controller: AbortController | null;
  /** The uploadDriveFile call whose progress counts (0 = none): a late callback of a settled one is dropped. */
  attempt: number;
  /** The next run commits first: a pending row may already hold this plan's bytes. */
  resume: boolean;
  /** A pending row may exist for `plan` (an attempt is running, or the last one may have got past begin). */
  reserved: boolean;
}

function sourceName(source: DriveUploadSource): string {
  if (typeof source.name === "string") return source.name;
  const name = (source.file as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

function sourceSize(source: DriveUploadSource): number {
  const size = Number(source.file?.size);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

export function createDriveUploadQueue(deps: DriveUploadQueueDeps): DriveUploadQueue {
  const { transport } = deps;
  const concurrency = Math.max(1, Math.trunc(deps.concurrency ?? DEFAULT_CONCURRENCY) || DEFAULT_CONCURRENCY);
  const now = deps.now ?? Date.now;
  const jobs = new Map<string, Job>();
  const running = new Set<Job>();
  const listeners = new Set<() => void>();
  let snapshot: readonly DriveUploadEntry[] = Object.freeze([]);
  let localIds: ReadonlySet<string> = new Set();
  let progressTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  function publish(): void {
    if (progressTimer !== null) {
      clearTimeout(progressTimer);
      progressTimer = null;
    }
    const entries = [...jobs.values()].map((job) => job.entry);
    snapshot = Object.freeze(entries);
    localIds = new Set(entries.filter((e) => ACTIVE_STATES.has(e.state) && e.itemId !== "").map((e) => e.itemId));
    for (const listener of [...listeners]) listener();
  }

  function setEntry(job: Job, patch: Partial<DriveUploadEntry>): void {
    job.entry = Object.freeze({ ...job.entry, ...patch });
  }

  function update(job: Job, patch: Partial<DriveUploadEntry>): void {
    setEntry(job, patch);
    publish();
  }

  function progress(job: Job, attempt: number, p: DriveUploadProgress): void {
    // Only the running attempt moves its entry, and only forward: a trailing SDK callback must never put a failed,
    // cancelled or done entry back to uploading, where nothing would ever settle it again.
    if (job.attempt !== attempt || !RUNNING_STATES.has(job.entry.state)) return;
    const state: DriveUploadState = p.phase;
    if (PHASE_RANK[p.phase] < PHASE_RANK[job.entry.state as DriveUploadProgress["phase"]]) return;
    if (state !== job.entry.state) {
      update(job, { state, loaded: p.loaded });
      return;
    }
    setEntry(job, { loaded: p.loaded });
    if (progressTimer === null) {
      progressTimer = setTimeout(() => {
        progressTimer = null;
        publish();
      }, DRIVE_UPLOAD_PROGRESS_INTERVAL_MS);
    }
  }

  function canStart(job: Job): boolean {
    if (running.size >= concurrency) return false;
    for (const other of running) if (other.plan?.multipart) return false;
    return !(job.plan?.multipart && running.size > 0);
  }

  function pump(): void {
    for (const job of jobs.values()) {
      if (job.entry.state !== "queued") continue;
      // First in, first out: a multipart file at the head waits until it can run alone.
      if (!canStart(job)) return;
      start(job);
    }
  }

  function start(job: Job): void {
    const controller = new AbortController();
    job.controller = controller;
    running.add(job);
    update(job, { state: "preparing", loaded: 0, errorCode: null });
    void run(job, controller).finally(() => {
      running.delete(job);
      job.controller = null;
      pump();
    });
  }

  /** A fresh plan with new ids; on a planning failure the entry fails and null comes back. */
  function replan(job: Job): DriveUploadPlan | null {
    if (!job.source) return null;
    try {
      return planDriveUpload(job.source, job.target);
    } catch (err) {
      job.plan = null;
      job.resume = false;
      job.reserved = false;
      update(job, { state: "failed", errorCode: driveErrorCode(err) ?? "generic" });
      return null;
    }
  }

  async function run(job: Job, controller: AbortController): Promise<void> {
    let restarted = false;
    for (;;) {
      const plan = job.plan;
      const source = job.source;
      if (!plan || !source) {
        update(job, { state: "failed", errorCode: "generic" });
        return;
      }
      const resume = job.resume;
      job.reserved = true;
      const attempt = ++attempts;
      job.attempt = attempt;
      try {
        const result = await uploadDriveFile(source, job.target, {
          transport,
          signal: controller.signal,
          plan,
          resume,
          keepPendingOnFailure: true,
          onProgress: (p) => progress(job, attempt, p),
        }).finally(() => {
          if (job.attempt === attempt) job.attempt = 0;
        });
        job.source = null;
        job.resume = false;
        job.reserved = false;
        update(job, { state: "done", loaded: result.sizeBytes, sizeBytes: result.sizeBytes, errorCode: null });
        return;
      } catch (err) {
        const code = driveErrorCode(err) ?? "generic";
        if (controller.signal.aborted || code === "aborted") {
          // uploadDriveFile already released the pending row.
          job.resume = false;
          job.reserved = false;
          update(job, { state: "cancelled", errorCode: null });
          return;
        }
        if (resume && !restarted && RESTART_CODES.has(code)) {
          restarted = true;
          await transport.abort(plan.itemId).catch(() => undefined);
          const fresh = replan(job);
          if (!fresh) return;
          job.plan = fresh;
          job.resume = false;
          update(job, { itemId: fresh.itemId, state: "preparing", loaded: 0, errorCode: null });
          continue;
        }
        // Without a row (the store is off, begin was refused) Retry begins again instead of committing a row that
        // does not exist, and clearing the entry has nothing to release.
        const left = resume || !driveUploadReservedNothing(err);
        job.resume = left;
        job.reserved = left;
        update(job, { state: "failed", errorCode: code });
        return;
      }
    }
  }

  /** Best-effort release of a pending row nobody will finish. */
  function release(job: Job): void {
    if (job.reserved && job.plan) void transport.abort(job.plan.itemId).catch(() => undefined);
    job.reserved = false;
    job.resume = false;
  }

  return {
    enqueue(files, target) {
      const keys: string[] = [];
      for (const source of files) {
        let plan: DriveUploadPlan | null = null;
        let errorCode: DriveUploadEntry["errorCode"] = null;
        try {
          plan = planDriveUpload(source, target);
        } catch (err) {
          errorCode = driveErrorCode(err) ?? "generic";
        }
        let key = plan?.itemId ?? newDocumentId();
        while (jobs.has(key)) key = newDocumentId();
        const entry: DriveUploadEntry = Object.freeze({
          key,
          itemId: plan?.itemId ?? "",
          name: plan?.name ?? sourceName(source),
          sizeBytes: plan?.sizeBytes ?? sourceSize(source),
          target: Object.freeze({ ...(plan?.target ?? target) }),
          state: plan ? "queued" : "failed",
          loaded: 0,
          errorCode,
          createdAt: now(),
        });
        jobs.set(key, { key, source, target: entry.target, plan, entry, controller: null, attempt: 0, resume: false, reserved: false });
        keys.push(key);
      }
      if (keys.length > 0) publish();
      pump();
      return keys;
    },

    cancel(key) {
      const job = jobs.get(key);
      if (!job) return;
      const { state } = job.entry;
      if (RUNNING_STATES.has(state)) {
        job.controller?.abort();
        return;
      }
      if (state !== "queued" && state !== "failed") return;
      release(job);
      update(job, { state: "cancelled", errorCode: null });
    },

    retry(key) {
      const job = jobs.get(key);
      if (!job || !job.source) return;
      const { state } = job.entry;
      if (state !== "failed" && state !== "cancelled") return;
      if (state === "cancelled" || !job.plan) {
        const plan = replan(job);
        if (!plan) return;
        job.plan = plan;
        job.resume = false;
        job.reserved = false;
      }
      update(job, { itemId: job.plan?.itemId ?? "", state: "queued", loaded: 0, errorCode: null });
      pump();
    },

    clearFinished() {
      let changed = false;
      for (const [key, job] of jobs) {
        if (ACTIVE_STATES.has(job.entry.state)) continue;
        if (job.entry.state === "failed") release(job);
        jobs.delete(key);
        changed = true;
      }
      if (changed) publish();
    },

    activeCount() {
      let count = 0;
      for (const job of jobs.values()) if (ACTIVE_STATES.has(job.entry.state)) count++;
      return count;
    },

    localItemIds: () => localIds,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,
  };
}

/** The part of `window` the leave guard uses. */
export interface DriveUploadLeaveTarget {
  addEventListener(type: "beforeunload", listener: (event: BeforeUnloadEvent) => void): void;
  removeEventListener(type: "beforeunload", listener: (event: BeforeUnloadEvent) => void): void;
}

/**
 * While `queue` has anything queued or running, leaving the page (reload, close, typing an address) asks the
 * browser's "leave site?" question, so running uploads are not dropped silently. Returns the uninstall.
 */
export function guardDriveUploadsOnLeave(queue: DriveUploadQueue, target: DriveUploadLeaveTarget): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Engines that predate preventDefault() here (Chrome and Edge before 119) ask only when returnValue is set.
    event.returnValue = true;
  };
  let armed = false;
  const sync = () => {
    const busy = queue.activeCount() > 0;
    if (busy === armed) return;
    armed = busy;
    if (busy) target.addEventListener("beforeunload", onBeforeUnload);
    else target.removeEventListener("beforeunload", onBeforeUnload);
  };
  const unsubscribe = queue.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    if (armed) target.removeEventListener("beforeunload", onBeforeUnload);
    armed = false;
  };
}

let sharedQueue: DriveUploadQueue | null = null;

/** The tab's queue: one per page load, so uploads keep going across route changes, guarded against leaving the page. */
export function sharedDriveUploadQueue(): DriveUploadQueue {
  if (!sharedQueue) {
    sharedQueue = createDriveUploadQueue({ transport: sharedDriveUploadTransport() });
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") guardDriveUploadsOnLeave(sharedQueue, window);
  }
  return sharedQueue;
}
