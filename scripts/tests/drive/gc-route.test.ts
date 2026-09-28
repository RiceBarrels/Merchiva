// GET /api/cron/drive-gc: fails closed without CRON_SECRET, then sweep → the
// verify, due and held SELECTs (one window each) → HEAD / del() → ack / fail,
// in that order; 'verify' jobs commit when the blob is there and fail the
// upload when it is not; a key is acknowledged only once its work is done; held
// deletes never crowd out verify jobs; at most 100 fail reports per run. The
// window-by-window drain of a backlog is in gc-windows.test.ts.

import { describe, expect, test } from "bun:test";
import { driveThumbKeyFor } from "@/lib/drive/rules";
import {
  DRIVE_GC_DEAD_QUERY, DRIVE_GC_FAIL_CALLS_MAX, DRIVE_GC_QUERY_LIMIT, DRIVE_GC_VERIFY_QUERY,
  createDriveGcHandler, driveGcDeleteQuery, requireCron,
} from "@/lib/drive/server/handlers/gc";
import { DriveHttpError } from "@/lib/drive/server/http";
import { NOW, makeDeps, readBody, reducerError, sqlError, testConfig } from "./fake-deps";
import { SECRET, cronRequest, head, heldJob, job, keyOf, keysOf, run, setup } from "./gc-fixture";

describe("requireCron", () => {
  test("503 without storage config or CRON_SECRET, 401 for a missing or wrong bearer", () => {
    const status = (config: ReturnType<typeof testConfig> | null, secret: string | null) => {
      const fake = makeDeps({ config });
      try {
        requireCron(fake.deps, cronRequest(secret));
        return 200;
      } catch (err) {
        return err instanceof DriveHttpError ? err.status : -1;
      }
    };
    expect(status(null, SECRET)).toBe(503);
    expect(status(testConfig({ cronSecret: null }), SECRET)).toBe(503);
    expect(status(testConfig({ cronSecret: SECRET }), null)).toBe(401);
    expect(status(testConfig({ cronSecret: SECRET }), "wrong")).toBe(401);
    expect(status(testConfig({ cronSecret: SECRET }), `${SECRET}x`)).toBe(401);
    expect(status(testConfig({ cronSecret: SECRET }), SECRET.slice(0, -1))).toBe(401);
    expect(status(testConfig({ cronSecret: SECRET }), SECRET)).toBe(200);
  });
});

describe("GET /api/cron/drive-gc", () => {
  test("fails closed: 503 without CRON_SECRET or storage, 401 for a wrong secret, and nothing runs", async () => {
    for (const [config, secret, expected] of [
      [testConfig({ cronSecret: null }), SECRET, 503],
      [null, SECRET, 503],
      [testConfig({ cronSecret: SECRET }), "nope", 401],
      [testConfig({ cronSecret: SECRET }), null, 401],
    ] as const) {
      const fake = makeDeps({ config });
      const res = await createDriveGcHandler(fake.deps)(cronRequest(secret));
      expect(res.status).toBe(expected);
      expect((await readBody(res)).code).toBe(expected === 503 ? "not_configured" : "unauthenticated");
      expect(fake.calls).toHaveLength(0);
      expect(fake.sqls).toHaveLength(0);
    }
  });

  test("order: sweep, verify / due / held SELECTs, HEAD, commit / fail, del, ack, fail report, dead count", async () => {
    const s = setup({
      jobs: [job(1, "delete"), job(2, "verify"), job(3, "verify")],
      blobs: { [keyOf(2).key]: head(4000) },
    });
    const summary = await run(s);
    expect(s.timeline).toEqual([
      "call:sweep", "sql:verify", "sql:due", "sql:held", "head", "head", "call:commitUpload", "call:failUpload", "del", "call:ackGc",
      "sql:dead",
    ]);
    expect(s.sqls).toEqual([
      { query: DRIVE_GC_VERIFY_QUERY, token: null },
      { query: driveGcDeleteQuery("due", NOW), token: null },
      { query: driveGcDeleteQuery("held", NOW), token: null },
      { query: DRIVE_GC_DEAD_QUERY, token: null },
    ]);
    expect(DRIVE_GC_VERIFY_QUERY).toBe(
      "SELECT blob_key, organization_id, item_id, action, declared_bytes, attempts FROM drive_blob_gc WHERE action = 'verify' LIMIT 1000",
    );
    // The hold is filtered in SQL: a timestamp column compares to an RFC 3339 literal (not to a number).
    const at = Date.UTC(2026, 8, 27, 12, 0, 0, 123);
    const columns = "SELECT blob_key, organization_id, item_id, action, declared_bytes, attempts, hold_until FROM drive_blob_gc ";
    expect(driveGcDeleteQuery("due", at)).toBe(
      `${columns}WHERE action = 'delete' AND hold_until <= '2026-09-27T12:00:00.123Z' LIMIT 1000`,
    );
    expect(driveGcDeleteQuery("held", at)).toBe(
      `${columns}WHERE action = 'delete' AND hold_until > '2026-09-27T12:00:00.123Z' LIMIT 1000`,
    );
    expect(s.calls[0]).toEqual({ key: "sweep", args: { maxItems: 500 } });
    expect(summary).toEqual({ swept: true, deleted: 1, verified: 2, failed: 0, dead: 0, stoppedEarly: false });
  });

  test("verify: a stored blob commits with the observed size and etag; a missing one fails as upload_expired; both are acknowledged", async () => {
    const s = setup({ jobs: [job(2, "verify"), job(3, "verify")], blobs: { [keyOf(2).key]: head(4000) } });
    await run(s);
    expect(s.calls.find((c) => c.key === "commitUpload")?.args).toEqual({
      itemId: keyOf(2).itemId, blobKey: keyOf(2).key, observedBytes: 4000, etag: "\"e4000\"",
    });
    expect(s.calls.find((c) => c.key === "failUpload")?.args).toEqual({
      itemId: keyOf(3).itemId, blobKey: keyOf(3).key, reason: "upload_expired",
    });
    const ack = s.calls.find((c) => c.key === "ackGc");
    expect(keysOf(ack?.args.blobKeysJson).sort()).toEqual([keyOf(2).key, keyOf(3).key].sort());
    expect(s.dels).toHaveLength(0);
  });

  test("a verify whose commit or HEAD fails is reported, never acknowledged", async () => {
    const s = setup({
      jobs: [job(2, "verify"), job(4, "verify")],
      blobs: { [keyOf(2).key]: head(4000) },
      onHead: (pathname) => {
        if (pathname === keyOf(4).key) throw new Error("Vercel Blob: service unavailable");
      },
      onCall: (key) => {
        if (key === "commitUpload") throw reducerError("service_commit_drive_upload", 530, "[drive.not_found] Upload not found");
      },
    });
    const summary = await run(s);
    expect(s.calls.some((c) => c.key === "ackGc")).toBe(false);
    const fails = s.calls.filter((c) => c.key === "failGc").map((c) => ({ keys: keysOf(c.args.blobKeysJson), error: String(c.args.error) }));
    expect(fails).toHaveLength(2);
    expect(fails.find((f) => f.keys[0] === keyOf(2).key)?.error).toStartWith("commit: [drive.not_found]");
    expect(fails.find((f) => f.keys[0] === keyOf(4).key)?.error).toBe("head: Vercel Blob: service unavailable");
    expect(summary).toMatchObject({ verified: 0, failed: 2 });
  });

  test("deletes go in chunks of 100; a full due window is acknowledged and the next one read in the same run; ≤ 1000 keys per ack", async () => {
    const deletes = Array.from({ length: 1250 }, (_, i) => job(i + 1, "delete"));
    const verifies = Array.from({ length: 250 }, (_, i) => job(5000 + i, "verify"));
    const s = setup({ jobs: [...deletes, ...verifies] });
    const summary = await run(s);
    expect(s.dels.map((chunk) => chunk.length)).toEqual([...Array(12).fill(100), 50]);
    expect(s.timeline.filter((step) => step === "sql:due")).toHaveLength(2);
    const acks = s.calls.filter((c) => c.key === "ackGc").map((c) => keysOf(c.args.blobKeysJson));
    expect(acks.map((keys) => keys.length)).toEqual([1000, 250, 250]);
    expect(new Set(acks.flat())).toEqual(new Set([...deletes, ...verifies].map((j) => String(j.blob_key))));
    expect(summary).toMatchObject({ deleted: 1250, verified: 250, failed: 0, stoppedEarly: false });
    expect(s.logs.some((l) => l.event === "drive.gc.delete_window_full")).toBe(false);
  });

  test("more than 1000 held deletes cannot crowd out a verify job: it still settles in the same run", async () => {
    const held = Array.from({ length: 1200 }, (_, i) => heldJob(i + 1));
    const s = setup({ jobs: [...held, job(9000, "verify")], blobs: { [keyOf(9000).key]: head(4000) } });
    const summary = await run(s);
    expect(s.calls.find((c) => c.key === "commitUpload")?.args).toMatchObject({ itemId: keyOf(9000).itemId, observedBytes: 4000 });
    // The held keys in the held window are still re-deleted (a late PUT may land) and acknowledged; the module keeps them.
    expect(s.dels.flat()).toHaveLength(DRIVE_GC_QUERY_LIMIT);
    const acks = s.calls.filter((c) => c.key === "ackGc").flatMap((c) => keysOf(c.args.blobKeysJson));
    expect(acks).toContain(keyOf(9000).key);
    expect(acks).toHaveLength(DRIVE_GC_QUERY_LIMIT + 1);
    // ...but a re-delete is not a finished job: `deleted` stays 0 and the log says how many were held.
    expect(summary).toMatchObject({ deleted: 0, verified: 1, failed: 0, stoppedEarly: false });
    expect(s.logs.find((l) => l.event === "drive.gc.held_window_full")).toMatchObject({ level: "warn", fields: { held: 1000 } });
    expect(s.logs.some((l) => l.event === "drive.gc.delete_window_full")).toBe(false);
    expect(s.logs.find((l) => l.event === "drive.gc.done")?.fields.held).toBe(DRIVE_GC_QUERY_LIMIT);
  });

  test("keys past their hold are deleted first and only they count as deleted", async () => {
    const past = job(2, "delete", { hold_until: { __timestamp_micros_since_unix_epoch__: (NOW - 60_000) * 1000 } });
    const s = setup({ jobs: [heldJob(1), past, job(3, "delete")] });
    const summary = await run(s);
    expect(s.dels).toEqual([[keyOf(2).key, keyOf(3).key], [keyOf(1).key]]);
    expect(summary).toMatchObject({ deleted: 2 });
    expect(s.logs.find((l) => l.event === "drive.gc.done")?.fields.held).toBe(1);
  });

  test("a key read as 'verify' and then as 'delete' (cancelled in between) is only deleted", async () => {
    const s = setup({ onSql: (query) => (query === DRIVE_GC_DEAD_QUERY ? [] : [job(8, query === DRIVE_GC_VERIFY_QUERY ? "verify" : "delete")]) });
    const summary = await run(s);
    expect(s.heads).toHaveLength(0);
    expect(s.dels).toEqual([[keyOf(8).key]]);
    expect(summary).toMatchObject({ deleted: 1, verified: 0 });
  });

  test("a chunk that throws is retried key by key: a blob already gone counts as deleted, other errors are reported", async () => {
    const bad = keyOf(2).key;
    const gone = keyOf(3).key;
    const s = setup({
      jobs: [job(1, "delete"), job(2, "delete"), job(3, "delete")],
      onDel: (keys) => {
        if (keys.length > 1) throw new Error("Vercel Blob: rate limited");
        if (keys[0] === bad) throw new Error("Vercel Blob: internal error");
        if (keys[0] === gone) {
          class BlobNotFoundError extends Error {}
          throw new BlobNotFoundError("Vercel Blob: The requested blob does not exist");
        }
      },
    });
    const summary = await run(s);
    expect(s.dels).toEqual([[keyOf(1).key, bad, gone], [keyOf(1).key], [bad], [gone]]);
    const ack = s.calls.find((c) => c.key === "ackGc");
    expect(keysOf(ack?.args.blobKeysJson)).toEqual([keyOf(1).key, gone]);
    const fail = s.calls.find((c) => c.key === "failGc");
    expect(keysOf(fail?.args.blobKeysJson)).toEqual([bad]);
    expect(fail?.args.error).toBe("delete: Vercel Blob: internal error");
    expect(summary).toMatchObject({ deleted: 2, failed: 1 });
  });

  test("failures are grouped by message, one report per message", async () => {
    const s = setup({
      jobs: [job(1, "delete"), job(2, "delete"), job(3, "delete")],
      onDel: (keys) => {
        throw new Error(keys.length > 1 || keys[0] !== keyOf(3).key ? "Vercel Blob: down" : "Vercel Blob: other");
      },
    });
    await run(s);
    const fails = s.calls.filter((c) => c.key === "failGc").map((c) => [c.args.error, keysOf(c.args.blobKeysJson)]);
    expect(fails).toEqual([
      ["delete: Vercel Blob: down", [keyOf(1).key, keyOf(2).key]],
      ["delete: Vercel Blob: other", [keyOf(3).key]],
    ]);
  });

  test("messages that differ only in digits share one report, under the first message", async () => {
    let wait = 30;
    const s = setup({
      jobs: [job(1, "delete"), job(2, "delete"), job(3, "delete")],
      onDel: () => {
        wait++;
        throw new Error(`Vercel Blob: Too many requests, try again in ${wait} seconds (429)`);
      },
    });
    const summary = await run(s);
    const fails = s.calls.filter((c) => c.key === "failGc").map((c) => [c.args.error, keysOf(c.args.blobKeysJson)]);
    expect(fails).toEqual([
      ["delete: Vercel Blob: Too many requests, try again in 32 seconds (429)", [keyOf(1).key, keyOf(2).key, keyOf(3).key]],
    ]);
    expect(summary.failed).toBe(3);
  });

  test("at most 100 fail reports per run: past the cap the remaining keys share the last call, so each still counts", async () => {
    // Letters only, so digit masking keeps all 150 messages apart.
    const word = (i: number) => String.fromCharCode(97 + (i % 26), 97 + Math.floor(i / 26));
    const jobs = Array.from({ length: 150 }, (_, i) => job(i + 1, "delete"));
    const s = setup({
      jobs,
      onDel: (keys) => {
        throw new Error(keys.length > 1 ? "Vercel Blob: chunk" : `Vercel Blob: error ${word(jobs.findIndex((j) => j.blob_key === keys[0]))}`);
      },
    });
    const summary = await run(s);
    const fails = s.calls.filter((c) => c.key === "failGc").map((c) => ({ error: String(c.args.error), keys: keysOf(c.args.blobKeysJson) }));
    expect(fails).toHaveLength(DRIVE_GC_FAIL_CALLS_MAX);
    expect(fails[0]).toEqual({ error: "delete: Vercel Blob: error aa", keys: [keyOf(1).key] });
    const last = fails[DRIVE_GC_FAIL_CALLS_MAX - 1];
    expect(last.keys).toEqual(jobs.slice(99).map((j) => String(j.blob_key)));
    expect(last.error).toBe(`51 different errors, e.g. delete: Vercel Blob: error ${word(99)}`);
    expect(new Set(fails.flatMap((f) => f.keys)).size).toBe(150);
    expect(summary.failed).toBe(150);
    expect(s.logs.find((l) => l.event === "drive.gc.fail_reports_merged")).toMatchObject({
      level: "warn", fields: { messages: 51, calls: DRIVE_GC_FAIL_CALLS_MAX },
    });
  });

  test("a failed sweep is logged, the reader is registered directly, and the queue is still drained", async () => {
    const s = setup({
      jobs: [job(1, "delete")],
      onCall: (key) => {
        if (key === "sweep") throw reducerError("service_drive_sweep", 500, "internal error");
      },
    });
    const summary = await run(s);
    expect(s.timeline.slice(0, 3)).toEqual(["call:sweep", "call:ensureReader", "sql:verify"]);
    expect(s.dels).toEqual([[keyOf(1).key]]);
    expect(summary).toMatchObject({ swept: false, deleted: 1 });
    expect(s.logs.some((l) => l.level === "error" && l.event === "drive.gc.sweep_failed")).toBe(true);
  });

  test("rows repeated by the dialect are handled once; a key that is not a Drive key is never deleted", async () => {
    const s = setup({
      jobs: [job(1, "delete"), job(1, "delete"), job(5, "delete", { blob_key: "users/avatar.png" }), job(6, "verify", { blob_key: "" })],
    });
    const summary = await run(s);
    expect(s.dels).toEqual([[keyOf(1).key]]);
    const fail = s.calls.find((c) => c.key === "failGc");
    expect(keysOf(fail?.args.blobKeysJson)).toEqual(["users/avatar.png"]);
    expect(summary).toMatchObject({ deleted: 1, failed: 1 });
  });

  test("dead jobs are counted and logged at error level with the first keys", async () => {
    const dead = Array.from({ length: 12 }, (_, i) => job(i + 1, "dead"));
    const s = setup({ dead });
    const summary = await run(s);
    expect(summary.dead).toBe(12);
    const log = s.logs.find((l) => l.event === "drive.gc.dead");
    expect(log?.level).toBe("error");
    expect(log?.fields.count).toBe(12);
    expect(String(log?.fields.keys).split(",")).toEqual(dead.slice(0, 10).map((r) => String(r.blob_key)));
  });

  test("the budget stops new work; verify jobs go first; finished keys are still acknowledged and nothing else is", async () => {
    const jobs = [...Array.from({ length: 300 }, (_, i) => job(i + 1, "delete")), job(900, "verify")];
    // Each clock read adds 3 s, 10 s budget: verify batch at 3 s, delete chunks at 6 s and 9 s, none at 12 s.
    const s = setup({ jobs, clockStep: 3000 });
    const summary = await run(s);
    expect(s.heads).toEqual([keyOf(900).key]);
    expect(s.dels).toHaveLength(2);
    const ack = s.calls.find((c) => c.key === "ackGc");
    expect(keysOf(ack?.args.blobKeysJson)).toHaveLength(201);
    expect(summary).toMatchObject({ deleted: 200, verified: 1, failed: 0, stoppedEarly: true });
  });

  test("any of the three first job queries failing is an error response; nothing is verified or deleted", async () => {
    for (const failing of [DRIVE_GC_VERIFY_QUERY, driveGcDeleteQuery("due", NOW), driveGcDeleteQuery("held", NOW)]) {
      const s = setup({
        onSql: (query) => {
          if (query === failing) throw sqlError(500, "internal error");
          return [job(1, "delete"), job(2, "verify")];
        },
      });
      const res = await s.handler(cronRequest());
      expect(res.status).toBe(502);
      expect((await readBody(res)).code).toBe("upstream");
      expect(s.dels).toHaveLength(0);
      expect(s.heads).toHaveLength(0);
      expect(s.calls.some((c) => c.key === "ackGc" || c.key === "failGc")).toBe(false);
    }
  });

  test("a failed acknowledgement is logged (the keys are simply redone next run)", async () => {
    const s = setup({
      jobs: [job(1, "delete")],
      onCall: (key) => {
        if (key === "ackGc") throw reducerError("service_ack_drive_blob_gc", 500, "internal error");
      },
    });
    const summary = await run(s);
    expect(summary.deleted).toBe(1);
    expect(s.logs.some((l) => l.level === "error" && l.event === "drive.gc.ack_failed")).toBe(true);
  });

  test("thumbnail keys are ordinary delete jobs", async () => {
    const thumb = driveThumbKeyFor(keyOf(7).key);
    const s = setup({ jobs: [job(7, "delete", { blob_key: thumb })] });
    await run(s);
    expect(s.dels).toEqual([[thumb]]);
  });
});
