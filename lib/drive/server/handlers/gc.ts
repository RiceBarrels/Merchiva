// GET /api/cron/drive-gc — every 15 minutes (vercel.json). Drains drive_blob_gc,
// the Blob work the module queues but cannot do itself (it holds no Blob
// credentials), as the service identity:
//
//   1. service_drive_sweep(500): pending uploads past their window get a
//      'verify' job, trash past its retention is deleted. It also registers the
//      service identity as a drive_service_reader, the rule that lets step 2 see
//      the queue. A failed sweep is logged and the drain goes on (after a direct
//      service_ensure_drive_reader, so even a first run can read the queue).
//   2. Three service-token SELECTs, each with its own LIMIT: the 'verify' jobs,
//      the 'delete' jobs past their hold ("due"), and the deletes still inside it
//      ("held"). The hold is filtered in SQL, so no number of held jobs can crowd
//      a due delete or a verify out of its window: a member who cancels uploads
//      in a loop only fills the held window.
//   3. 'verify' first (an upload whose commit never arrived): HEAD the key. Found →
//      service_commit_drive_upload with the observed size (the module still
//      rejects an empty or oversize blob); missing → service_fail_drive_upload
//      ('upload_expired'). A failed commit is reported, never acknowledged.
//      Then the due deletes: del() in chunks of 100; a chunk that throws is
//      retried key by key, and a blob that is already gone counts as deleted.
//      While the due window comes back full it is acknowledged and read again,
//      up to DRIVE_GC_DUE_PASSES_MAX times, so a backlog drains at the budget's
//      pace rather than 1000 keys a run. Last, the held keys are deleted again.
//   4. service_ack_drive_blob_gc for the finished keys (≤ 1000 per call), after
//      each window. The module keeps a 'delete' that is still inside its hold, so
//      a PUT that lands late is deleted again on the next run; those re-deletes
//      are logged as `held`, not counted in `deleted`. service_fail_drive_blob_gc
//      for the rest, grouped by message with digits masked ("try again in 31
//      seconds" and "… 32 seconds" are one report), at most
//      DRIVE_GC_FAIL_CALLS_MAX calls: past that the remaining keys share the last
//      calls under one message, so each still counts an attempt. The module turns
//      a job 'dead' at the tenth.
//   5. Dead jobs are counted and logged at error level; nothing retries them.
// New work stops after `budgetMs` (240 s of the route's 300 s); what is left
// waits for the next run (`stoppedEarly`). A key that is not a Drive blob key is
// never deleted: it is reported as failed until it goes dead.
//
// The dialect has no ORDER BY, and a timestamp column compares to an RFC 3339
// string literal, never to a number (checked on SpacetimeDB 2.10.1, through the
// service RLS rule, at microsecond precision). A full held window is logged as
// drive.gc.held_window_full: the held keys past it are not deleted again this
// run, and are deleted once their hold ends (≤ upload window + 1 h), like any
// due key. A due backlog still left after the last pass is logged as
// drive.gc.delete_window_full.
//
// Auth (requireCron, shared with the reconcile cron): `Authorization: Bearer
// $CRON_SECRET`, which Vercel sends. Unconfigured storage or no CRON_SECRET →
// 503; a wrong secret → 401. Unlike the older cron at /api/merchiva/scan, these
// fail closed.

import { parseDriveBlobKey } from "@/lib/drive/rules";
import { bearerToken, driveHttpError, errorResponse, reducerFailure } from "@/lib/drive/server/http";
import { dedupeRowsBy, sqlNumber, sqlString, type SqlRow } from "@/lib/drive/server/sql-rows";
import type { DriveRouteHandler, DriveServerDeps } from "./types";

export interface DriveGcSummary {
  /** The sweep reducer succeeded. */
  swept: boolean;
  /** 'delete' keys past their hold removed from the store (or already gone) and acknowledged. */
  deleted: number;
  /** 'verify' jobs settled: committed, or failed as never uploaded. */
  verified: number;
  /** Keys reported with service_fail_drive_blob_gc. */
  failed: number;
  /** Jobs the module gave up on, counted after this run's reports (at most DRIVE_GC_QUERY_LIMIT). */
  dead: number;
  /** The budget ran out before every job was tried. */
  stoppedEarly: boolean;
}

/** Of the route's 300 s maxDuration; the rest is for the acknowledgements and the ≤ 100 fail reports. */
export const DRIVE_GC_BUDGET_MS = 240_000;
/** Rows read per window: verify, due, held and dead jobs (the local 2.10 server's /sql accepts LIMIT, not ORDER BY). */
export const DRIVE_GC_QUERY_LIMIT = 1000;
/** Due-window reads per run while it keeps coming back full: at most this × DRIVE_GC_QUERY_LIMIT deletes. */
export const DRIVE_GC_DUE_PASSES_MAX = 20;
/** service_fail_drive_blob_gc calls per run (ST §4.5). */
export const DRIVE_GC_FAIL_CALLS_MAX = 100;
const GC_SWEEP_MAX_ITEMS = 500;
const GC_DELETE_CHUNK = 100;
/** = the module's DRIVE_GC_KEYS_MAX (spacetimedb/src/drive/service.ts). */
const GC_KEYS_PER_CALL = 1000;
const GC_VERIFY_PARALLEL = 8;
/** = the module's DRIVE_GC_ERROR_MAX. */
const GC_ERROR_MAX = 500;
const GC_DEAD_LOG_KEYS = 10;
const NO_STORE = { "Cache-Control": "private, no-store" };

const GC_JOB_COLUMNS = "blob_key, organization_id, item_id, action, declared_bytes, attempts";
export const DRIVE_GC_VERIFY_QUERY = `SELECT ${GC_JOB_COLUMNS} FROM drive_blob_gc WHERE action = 'verify' LIMIT ${DRIVE_GC_QUERY_LIMIT}`;
export const DRIVE_GC_DEAD_QUERY = `SELECT blob_key FROM drive_blob_gc WHERE action = 'dead' LIMIT ${DRIVE_GC_QUERY_LIMIT}`;

/**
 * The 'delete' jobs past their hold at `nowMs` ("due"), or still inside it
 * ("held"). `hold_until <= now` is the module's own test: serviceAckDriveBlobGc
 * keeps a job while holdUntil > now, and drops it otherwise.
 */
export function driveGcDeleteQuery(window: "due" | "held", nowMs: number): string {
  const op = window === "due" ? "<=" : ">";
  return `SELECT ${GC_JOB_COLUMNS}, hold_until FROM drive_blob_gc `
    + `WHERE action = 'delete' AND hold_until ${op} '${new Date(nowMs).toISOString()}' LIMIT ${DRIVE_GC_QUERY_LIMIT}`;
}

interface GcVerify { blobKey: string; itemId: string }
/** `held`: still inside its hold, so the module keeps the job after the ack and this run only re-deletes it. */
interface GcDelete { blobKey: string; held: boolean }
interface FailGroup { message: string; keys: string[] }
interface FailCall { error: string; keys: string[] }

/** What one run has done so far. `failures` groups keys by message with digits masked. */
interface GcRun {
  summary: DriveGcSummary;
  /** The run's clock, in ms: every window is read against it. */
  startedMs: number;
  /** Keys this run has read, so a later window never handles one twice. */
  seen: Set<string>;
  /** Held deletes re-deleted this run (not in `summary.deleted`). */
  held: number;
  /** Finished keys not acknowledged yet. */
  acks: string[];
  failures: Map<string, FailGroup>;
  overBudget(): boolean;
}

/** Compares every byte of the expected secret whatever the input, so the time taken says nothing about a prefix. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/** Only Vercel Cron (or an operator holding CRON_SECRET) may run the Drive crons. */
export function requireCron(deps: DriveServerDeps, req: Request): void {
  const config = deps.config();
  if (!config) throw driveHttpError("not_configured", "File storage is not configured");
  if (!config.cronSecret) throw driveHttpError("not_configured", "CRON_SECRET is not set");
  const given = bearerToken(req.headers.get("authorization"));
  if (!given || !sameSecret(given, config.cronSecret)) throw driveHttpError("unauthenticated", "Wrong cron secret");
}

/** The message of anything thrown, at most 500 chars (Blob and SpacetimeDB errors carry no credentials). */
export function failureText(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "unknown error";
  return text.slice(0, GC_ERROR_MAX);
}

/** @vercel/blob's BlobNotFoundError, recognized without importing the SDK (the handlers stay free of it). */
function isBlobNotFound(err: unknown): boolean {
  return err instanceof Error
    && (err.constructor.name === "BlobNotFoundError" || /requested blob does not exist/i.test(err.message));
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A `timestamp` column in ms: /sql sends `[micros]`; `{ __timestamp_micros_since_unix_epoch__ }` and a bare number also read. 0 when unreadable. */
function sqlTimestampMs(row: SqlRow, column: string): number {
  const value = row[column];
  const micros = Array.isArray(value) ? value[0]
    : value !== null && typeof value === "object" ? (value as Record<string, unknown>).__timestamp_micros_since_unix_epoch__
    : value;
  return sqlNumber({ micros }, "micros") / 1000;
}

/** Keys group by message with digits masked, under the group's first message ("try again in 31 s" and "… 32 s" are one report). */
function fail(run: GcRun, blobKey: string, message: string): void {
  const text = message.slice(0, GC_ERROR_MAX);
  const group = text.replace(/\d+/g, "#");
  const existing = run.failures.get(group);
  if (existing) existing.keys.push(blobKey);
  else run.failures.set(group, { message: text, keys: [blobKey] });
}

/**
 * The service_fail_drive_blob_gc calls for a run: one per message group and
 * 1000 keys, at most DRIVE_GC_FAIL_CALLS_MAX. Past the cap the remaining keys
 * share the last calls under one message, so every failed key still counts an
 * attempt. `merged` = messages folded that way; `dropped` is non-empty only past
 * DRIVE_GC_FAIL_CALLS_MAX × 1000 keys, which the query windows never reach.
 */
function planFailReports(groups: Iterable<FailGroup>): { calls: FailCall[]; merged: number; dropped: string[] } {
  const calls = [...groups].flatMap((g) => chunksOf(g.keys, GC_KEYS_PER_CALL).map((keys) => ({ error: g.message, keys })));
  if (calls.length <= DRIVE_GC_FAIL_CALLS_MAX) return { calls, merged: 0, dropped: [] };
  const total = calls.reduce((n, call) => n + call.keys.length, 0);
  const reserve = Math.min(DRIVE_GC_FAIL_CALLS_MAX, Math.ceil(total / GC_KEYS_PER_CALL));
  const kept = calls.slice(0, DRIVE_GC_FAIL_CALLS_MAX - reserve);
  const rest = calls.slice(kept.length);
  const merged = new Set(rest.map((call) => call.error)).size;
  const error = `${merged} different errors, e.g. ${rest[0].error}`.slice(0, GC_ERROR_MAX);
  const shared = chunksOf(rest.flatMap((call) => call.keys), GC_KEYS_PER_CALL).map((keys) => ({ error, keys }));
  return { calls: [...kept, ...shared.slice(0, reserve)], merged, dropped: shared.slice(reserve).flatMap((call) => call.keys) };
}

export function createDriveGcHandler(deps: DriveServerDeps, opts: { budgetMs?: number } = {}): DriveRouteHandler {
  const budgetMs = opts.budgetMs ?? DRIVE_GC_BUDGET_MS;

  async function sweep(): Promise<boolean> {
    try {
      await deps.call("sweep", { maxItems: GC_SWEEP_MAX_ITEMS });
      return true;
    } catch (err) {
      deps.log("error", "drive.gc.sweep_failed", { code: reducerFailure(err).code });
    }
    try {
      await deps.call("ensureReader", {});
    } catch (err) {
      deps.log("error", "drive.gc.reader_failed", { code: reducerFailure(err).code });
    }
    return false;
  }

  async function select(query: string): Promise<SqlRow[]> {
    try {
      return await deps.sql(query, null);
    } catch (err) {
      throw reducerFailure(err);
    }
  }

  /** The key parsed, or null; a non-empty key that is not a Drive blob key is reported, never deleted. */
  function driveKey(run: GcRun, blobKey: string): ReturnType<typeof parseDriveBlobKey> {
    const key = parseDriveBlobKey(blobKey);
    if (!key && blobKey !== "") fail(run, blobKey, "not a Drive blob key: never deleted");
    return key;
  }

  /** One 'delete' window, minus the keys this run has already read. `full`: the LIMIT cut it, so more may wait. */
  async function readDeletes(run: GcRun, window: "due" | "held"): Promise<{ jobs: GcDelete[]; full: boolean }> {
    const rows = await select(driveGcDeleteQuery(window, run.startedMs));
    const jobs: GcDelete[] = [];
    for (const row of dedupeRowsBy(rows, "blob_key")) {
      const blobKey = sqlString(row, "blob_key");
      if (run.seen.has(blobKey)) continue;
      run.seen.add(blobKey);
      if (driveKey(run, blobKey)) jobs.push({ blobKey, held: sqlTimestampMs(row, "hold_until") > run.startedMs });
    }
    return { jobs, full: rows.length >= DRIVE_GC_QUERY_LIMIT };
  }

  /** The three windows, read before any work. */
  async function readJobs(run: GcRun): Promise<{ verifies: GcVerify[]; due: GcDelete[]; dueFull: boolean; held: GcDelete[] }> {
    const verifyRows = await select(DRIVE_GC_VERIFY_QUERY);
    const due = await readDeletes(run, "due");
    const held = await readDeletes(run, "held");
    if (held.full) deps.log("warn", "drive.gc.held_window_full", { held: held.jobs.length });
    const verifies: GcVerify[] = [];
    for (const row of dedupeRowsBy(verifyRows, "blob_key")) {
      const blobKey = sqlString(row, "blob_key");
      // Read as 'verify', then as 'delete': the upload was cancelled in between, and the delete wins (as in the module).
      if (run.seen.has(blobKey)) continue;
      run.seen.add(blobKey);
      const key = driveKey(run, blobKey);
      if (key) verifies.push({ blobKey, itemId: sqlString(row, "item_id") || key.itemId });
    }
    return { verifies, due: due.jobs, dueFull: due.full, held: held.jobs };
  }

  /**
   * Due windows after the first, while the last one came back full: each is
   * read after the previous one was acknowledged (which removed its jobs). Stops
   * at DRIVE_GC_DUE_PASSES_MAX windows, at the budget, at a window with nothing
   * new (only keys that failed earlier in this run), or at a failed read.
   */
  async function drainDueBacklog(run: GcRun, firstFull: boolean): Promise<void> {
    let full = firstFull;
    let passes = 1;
    while (full && passes < DRIVE_GC_DUE_PASSES_MAX && !stop(run)) {
      const next = await readDeletes(run, "due").catch((err: unknown) => {
        deps.log("error", "drive.gc.due_query_failed", { passes, code: reducerFailure(err).code });
        return null;
      });
      if (!next) break;
      passes++;
      full = next.full;
      if (next.jobs.length === 0) break;
      await drainDeletes(run, next.jobs);
      await flushAcks(run);
    }
    if (full) deps.log("warn", "drive.gc.delete_window_full", { passes, deleted: run.summary.deleted });
  }

  /** True once the budget is spent (and records it). */
  function stop(run: GcRun): boolean {
    if (!run.overBudget()) return false;
    run.summary.stoppedEarly = true;
    return true;
  }

  function deleted(run: GcRun, job: GcDelete): void {
    run.acks.push(job.blobKey);
    if (job.held) run.held++;
    else run.summary.deleted++;
  }

  /** null when the key is gone (deleted now, or already); otherwise the failure message. */
  async function deleteOne(key: string): Promise<string | null> {
    try {
      await deps.blob.del([key]);
      return null;
    } catch (err) {
      return isBlobNotFound(err) ? null : `delete: ${failureText(err)}`;
    }
  }

  async function drainDeletes(run: GcRun, jobs: readonly GcDelete[]): Promise<void> {
    for (const chunk of chunksOf(jobs, GC_DELETE_CHUNK)) {
      if (stop(run)) return;
      try {
        await deps.blob.del(chunk.map((job) => job.blobKey));
        for (const job of chunk) deleted(run, job);
        continue;
      } catch (err) {
        deps.log("warn", "drive.gc.delete_chunk_failed", { keys: chunk.length, error: failureText(err) });
      }
      for (const job of chunk) {
        if (stop(run)) return;
        const failure = await deleteOne(job.blobKey);
        if (failure !== null) fail(run, job.blobKey, failure);
        else deleted(run, job);
      }
    }
  }

  /** null when the job is settled (committed, or failed as never uploaded); otherwise the failure message. */
  async function settleVerify(job: GcVerify): Promise<string | null> {
    let head;
    try {
      head = await deps.blob.head(job.blobKey);
    } catch (err) {
      return `head: ${failureText(err)}`;
    }
    try {
      if (head) {
        await deps.call("commitUpload", { itemId: job.itemId, blobKey: job.blobKey, observedBytes: head.size, etag: head.etag });
      } else {
        await deps.call("failUpload", { itemId: job.itemId, blobKey: job.blobKey, reason: "upload_expired" });
      }
      return null;
    } catch (err) {
      return `${head ? "commit" : "fail_upload"}: [drive.${reducerFailure(err).code}] ${failureText(err)}`;
    }
  }

  async function drainVerifies(run: GcRun, jobs: readonly GcVerify[]): Promise<void> {
    for (const batch of chunksOf(jobs, GC_VERIFY_PARALLEL)) {
      if (stop(run)) return;
      const outcomes = await Promise.all(batch.map(settleVerify));
      batch.forEach((job, i) => {
        const failure = outcomes[i];
        if (failure !== null) {
          fail(run, job.blobKey, failure);
          return;
        }
        run.acks.push(job.blobKey);
        run.summary.verified++;
      });
    }
  }

  /** Acknowledges the finished keys so far, and forgets them. */
  async function flushAcks(run: GcRun): Promise<void> {
    for (const chunk of chunksOf(run.acks.splice(0), GC_KEYS_PER_CALL)) {
      try {
        await deps.call("ackGc", { blobKeysJson: JSON.stringify(chunk) });
      } catch (err) {
        // The keys stay queued: the next run deletes / re-verifies them, which is idempotent.
        deps.log("error", "drive.gc.ack_failed", { keys: chunk.length, code: reducerFailure(err).code });
      }
    }
  }

  /** The number of keys reported. */
  async function reportFailures(failures: ReadonlyMap<string, FailGroup>): Promise<number> {
    const { calls, merged, dropped } = planFailReports(failures.values());
    if (merged > 0) deps.log("warn", "drive.gc.fail_reports_merged", { messages: merged, calls: calls.length });
    if (dropped.length > 0) {
      deps.log("error", "drive.gc.fail_reports_dropped", {
        count: dropped.length, keys: dropped.slice(0, GC_DEAD_LOG_KEYS).join(","),
      });
    }
    let reported = 0;
    for (const call of calls) {
      try {
        await deps.call("failGc", { blobKeysJson: JSON.stringify(call.keys), error: call.error });
        reported += call.keys.length;
      } catch (err) {
        deps.log("error", "drive.gc.fail_report_failed", { keys: call.keys.length, code: reducerFailure(err).code });
      }
    }
    return reported;
  }

  async function countDead(): Promise<number> {
    let rows: SqlRow[];
    try {
      rows = dedupeRowsBy(await deps.sql(DRIVE_GC_DEAD_QUERY, null), "blob_key");
    } catch (err) {
      deps.log("error", "drive.gc.dead_query_failed", { code: reducerFailure(err).code });
      return 0;
    }
    if (rows.length > 0) {
      deps.log("error", "drive.gc.dead", {
        count: rows.length,
        keys: rows.slice(0, GC_DEAD_LOG_KEYS).map((row) => sqlString(row, "blob_key")).join(","),
      });
    }
    return rows.length;
  }

  return async (req) => {
    try {
      requireCron(deps, req);
      const started = deps.now();
      const run: GcRun = {
        summary: { swept: false, deleted: 0, verified: 0, failed: 0, dead: 0, stoppedEarly: false },
        startedMs: started,
        seen: new Set(),
        held: 0,
        acks: [],
        failures: new Map(),
        overBudget: () => deps.now() - started >= budgetMs,
      };
      run.summary.swept = await sweep();
      const { verifies, due, dueFull, held } = await readJobs(run);
      await drainVerifies(run, verifies);
      await drainDeletes(run, due);
      await flushAcks(run);
      await drainDueBacklog(run, dueFull);
      await drainDeletes(run, held);
      await flushAcks(run);
      run.summary.failed = await reportFailures(run.failures);
      run.summary.dead = await countDead();
      deps.log("info", "drive.gc.done", { ...run.summary, held: run.held });
      return deps.json(req, run.summary, { headers: NO_STORE });
    } catch (err) {
      return errorResponse(deps, req, err);
    }
  };
}
