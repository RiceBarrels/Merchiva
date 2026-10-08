// The GC cron's 'delete' windows: due jobs (past their hold) and held jobs are
// read by separate queries, so a member who begins and cancels uploads in a
// loop (each cancel queues two held keys for 4 h) can no longer fill the window
// that due deletes are read from — delete forever, trash expiry, rejected
// uploads. A full due window is acknowledged and read again, up to
// DRIVE_GC_DUE_PASSES_MAX times per run.

import { describe, expect, test } from "bun:test";
import type { DriveDeps } from "../../../spacetimedb/src/drive/context";
import { cleanDriveName, driveBlobKey } from "../../../spacetimedb/src/drive/logic";
import { defineDriveReducers } from "../../../spacetimedb/src/drive/reducers";
import { defineDriveServiceReducers } from "../../../spacetimedb/src/drive/service";
import { defineDriveTrashReducers } from "../../../spacetimedb/src/drive/trash";
import type { DriveSchema } from "../../../spacetimedb/src/drive/types";
import { defineDriveUploadReducers } from "../../../spacetimedb/src/drive/uploads";
import { driveThumbKeyFor } from "@/lib/drive/rules";
import { DRIVE_GC_DUE_PASSES_MAX, DRIVE_GC_QUERY_LIMIT, createDriveGcHandler } from "@/lib/drive/server/handlers/gc";
import type { SqlRow } from "@/lib/drive/server/sql-rows";
import type { DriveStdbCallKey } from "@/lib/drive/server/stdb-calls";
import {
  FakeTimestamp, SERVICE_IDENTITY, createDriveWorld, loadModule, moduleStubs, registerServiceIdentity, type FakeDb,
  type FakeMember,
} from "./fake-db";
import { NOW, makeDeps, sqlError, testConfig } from "./fake-deps";
import { SECRET, cronRequest, heldJob, job, keyOf, keysOf, run, serveGcQuery, setup } from "./gc-fixture";

const HOUR_MS = 3_600_000;

/** The thumbnail key of job n, held like its blob key (a cancelled upload queues both). */
const heldThumb = (n: number): SqlRow => ({ ...heldJob(n), blob_key: driveThumbKeyFor(keyOf(n).key) });

describe("GC delete windows (fake /sql)", () => {
  test("a due delete behind more than 1000 held jobs in table order is deleted in the same run", async () => {
    // 600 cancelled uploads (blob + thumbnail key, each held), then one file deleted forever (due now).
    const flood = Array.from({ length: 600 }, (_, i) => [heldJob(i + 1), heldThumb(i + 1)]).flat();
    const victim = job(9000, "delete", { hold_until: [(NOW - 1000) * 1000] });
    const s = setup({ jobs: [...flood, victim] });
    const summary = await run(s);
    expect(s.dels[0]).toEqual([keyOf(9000).key]);
    expect(s.dropped.has(keyOf(9000).key)).toBe(true);
    expect(summary).toMatchObject({ deleted: 1, failed: 0, stoppedEarly: false });
    // The held window still re-deletes up to its LIMIT, and the module keeps those jobs.
    expect(s.dels.slice(1).flat()).toHaveLength(DRIVE_GC_QUERY_LIMIT);
    expect([...s.dropped]).toEqual([keyOf(9000).key]);
    expect(s.logs.find((l) => l.event === "drive.gc.held_window_full")?.fields.held).toBe(DRIVE_GC_QUERY_LIMIT);
    expect(s.logs.some((l) => l.event === "drive.gc.delete_window_full")).toBe(false);
  });

  test(`a backlog drains ${DRIVE_GC_DUE_PASSES_MAX} windows per run at most; what is left is logged`, async () => {
    const total = DRIVE_GC_DUE_PASSES_MAX * DRIVE_GC_QUERY_LIMIT + 500;
    const s = setup({ jobs: Array.from({ length: total }, (_, i) => job(i + 1, "delete")) });
    const summary = await run(s);
    expect(s.timeline.filter((step) => step === "sql:due")).toHaveLength(DRIVE_GC_DUE_PASSES_MAX);
    expect(summary).toMatchObject({ deleted: DRIVE_GC_DUE_PASSES_MAX * DRIVE_GC_QUERY_LIMIT, stoppedEarly: false });
    expect(s.dropped.size).toBe(DRIVE_GC_DUE_PASSES_MAX * DRIVE_GC_QUERY_LIMIT);
    expect(s.logs.find((l) => l.event === "drive.gc.delete_window_full")).toMatchObject({
      level: "warn", fields: { passes: DRIVE_GC_DUE_PASSES_MAX, deleted: DRIVE_GC_DUE_PASSES_MAX * DRIVE_GC_QUERY_LIMIT },
    });
  });

  test("a due window with nothing new (only keys that failed this run) ends the drain; each key is reported once", async () => {
    const s = setup({
      jobs: Array.from({ length: 1100 }, (_, i) => job(i + 1, "delete")),
      onDel: () => {
        throw new Error("Vercel Blob: down");
      },
    });
    const summary = await run(s);
    expect(s.timeline.filter((step) => step === "sql:due")).toHaveLength(2);
    expect(s.dels).toHaveLength(10 + DRIVE_GC_QUERY_LIMIT); // ten chunks, then each key alone
    const fails = s.calls.filter((c) => c.key === "failGc").map((c) => keysOf(c.args.blobKeysJson));
    expect(fails.map((keys) => keys.length)).toEqual([DRIVE_GC_QUERY_LIMIT]);
    expect(summary).toMatchObject({ deleted: 0, failed: DRIVE_GC_QUERY_LIMIT });
    expect(s.logs.find((l) => l.event === "drive.gc.delete_window_full")?.fields.passes).toBe(2);
  });

  test("a failed read of a later due window is logged; the work done is kept and the held window still runs", async () => {
    let dueReads = 0;
    const s = setup({
      jobs: [...Array.from({ length: 1005 }, (_, i) => job(i + 1, "delete")), heldJob(5000)],
      beforeSql: (query) => {
        if (query.includes("hold_until <=") && ++dueReads === 2) throw sqlError(500, "internal error");
      },
    });
    const summary = await run(s);
    expect(summary).toMatchObject({ deleted: DRIVE_GC_QUERY_LIMIT, failed: 0 });
    expect(s.dels.flat()).toContain(keyOf(5000).key);
    expect(s.logs.find((l) => l.event === "drive.gc.due_query_failed")).toMatchObject({
      level: "error", fields: { passes: 1, code: "upstream" },
    });
    expect(s.logs.find((l) => l.event === "drive.gc.delete_window_full")?.fields.passes).toBe(1);
  });
});

// ── End to end with the module's reducers ────────────────────────────────────

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const R = {
  ...defineDriveReducers(stdb, deps), ...defineDriveTrashReducers(stdb, deps), ...defineDriveUploadReducers(stdb, deps),
  ...defineDriveServiceReducers(stdb, deps),
};
const SERVICE_REDUCERS: Partial<Record<DriveStdbCallKey, unknown>> = {
  sweep: R.serviceDriveSweep, ensureReader: R.serviceEnsureDriveReader, ackGc: R.serviceAckDriveBlobGc,
  failGc: R.serviceFailDriveBlobGc,
};

function begin(db: FakeDb, by: FakeMember, name: string, size: bigint): { itemId: string; blobKey: string } {
  const itemId = crypto.randomUUID();
  const blobKey = driveBlobKey(by.organizationId, itemId, crypto.randomUUID(), cleanDriveName(name) ?? name);
  db.run(R.beginDriveUpload, by, {
    organizationId: by.organizationId, itemId, space: "my", parentId: "", ownerMemberId: "", name,
    mimeType: "application/pdf", sizeBytes: size, blobKey, actingMemberId: "",
  });
  return { itemId, blobKey };
}

/** The GC route against the fake module: /sql serves drive_blob_gc in table order, calls run the service reducers. */
function moduleGc(db: FakeDb) {
  const deleted: string[] = [];
  const fake = makeDeps({
    config: testConfig({ cronSecret: SECRET }),
    onSql: (query) => serveGcQuery(query, db.rows("driveBlobGc").map((r) => ({
      blob_key: r.blobKey, organization_id: r.organizationId, item_id: r.itemId, action: r.action,
      declared_bytes: Number(r.declaredBytes), attempts: r.attempts,
      hold_until: [Number((r.holdUntil as FakeTimestamp).microsSinceUnixEpoch)],
    }))),
    onCall: (key, args) => {
      const reducer = SERVICE_REDUCERS[key];
      if (!reducer) throw new Error(`unexpected call ${key}`);
      db.run(reducer, SERVICE_IDENTITY, args);
    },
  });
  fake.deps.now = () => Number(db.nowMicros / 1000n);
  fake.deps.blob.del = async (keys) => {
    deleted.push(...keys);
  };
  const handler = createDriveGcHandler(fake.deps);
  return { deleted, logs: fake.logs, runOnce: async () => (await handler(cronRequest())).json() };
}

describe("GC delete windows (module reducers)", () => {
  test("a staff begin → abort loop cannot keep a file deleted forever in the store", async () => {
    const { db, orgA } = createDriveWorld();
    registerServiceIdentity(db);
    for (let i = 0; i < 600; i++) {
      const { itemId } = begin(db, orgA.staff, "a.pdf", 1n);
      db.run(R.abortDriveUpload, orgA.staff, { itemId });
    }
    const victim = begin(db, orgA.owner, "secret.pdf", 10n);
    db.run(R.serviceCommitDriveUpload, SERVICE_IDENTITY, { itemId: victim.itemId, blobKey: victim.blobKey, observedBytes: 10n, etag: "e" });
    const entries = { organizationId: orgA.organizationId, itemIds: JSON.stringify([victim.itemId]), documentIds: "[]", actingMemberId: "" };
    db.run(R.trashDriveEntries, orgA.owner, entries);
    db.run(R.deleteDriveEntriesForever, orgA.owner, entries);
    const victimKeys = [victim.blobKey, driveThumbKeyFor(victim.blobKey)];
    const jobs = () => db.rows("driveBlobGc");
    expect(jobs()).toHaveLength(1202);
    db.advance(60_000_000n); // the cron runs a minute later

    const gc = moduleGc(db);
    expect(await gc.runOnce()).toMatchObject({ deleted: 2, failed: 0, stoppedEarly: false });
    expect(gc.deleted.slice(0, 2).sort()).toEqual([...victimKeys].sort());
    expect(jobs().some((r) => victimKeys.includes(String(r.blobKey)))).toBe(false); // the module dropped them on the ack
    expect(jobs()).toHaveLength(1200); // ...and kept every held job

    // Once the holds end (upload window + 1 h), the flood is an ordinary backlog: drained in one run, window by window.
    db.advance(BigInt(5 * HOUR_MS) * 1000n);
    const later = moduleGc(db);
    expect(await later.runOnce()).toMatchObject({ deleted: 1200, failed: 0, stoppedEarly: false });
    expect(jobs()).toHaveLength(0);
  });
});
