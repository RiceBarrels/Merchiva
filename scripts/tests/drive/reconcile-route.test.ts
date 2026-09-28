// GET /api/cron/drive-reconcile: writes only on production without ?dryRun=1;
// sends each org's page of old Drive keys to the module (which alone decides
// what is an orphan), then finishes the org with the listing totals; the
// orphan brake parks an org for the run; a platform-size alert; a budget stop.

import { describe, expect, test } from "bun:test";
import { driveBlobKey, driveThumbKeyFor } from "@/lib/drive/rules";
import {
  DRIVE_RECONCILE_ORPHAN_AGE_MS, createDriveReconcileHandler, orgOfFolder, type DriveReconcileSummary,
} from "@/lib/drive/server/handlers/reconcile";
import type { DriveListPage, DriveStorageConfig } from "@/lib/drive/server/handlers/types";
import { NOW, ORG, OTHER_ORG, makeDeps, readBody, reducerError, testConfig, type FakeOptions } from "./fake-deps";
import * as server from "../../../spacetimedb/src/drive/logic";

const SECRET = "cron-secret-0123456789abcdef";
const THIRD_ORG = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const DAY = 24 * 60 * 60_000;
const OLD = NOW - DAY - 60_000;
const YOUNG = NOW - DAY + 60_000;

function uuid(n: number): string {
  return `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
const keyOf = (org: string, n: number) => driveBlobKey(org, uuid(n), uuid(500_000 + n), `scan-${n}.pdf`);
type Blob = DriveListPage["blobs"][number];
const blob = (pathname: string, size: number, uploadedAt = OLD): Blob => ({ pathname, size, uploadedAt });

interface Store {
  /** Pages of the folded `org/` listing. */
  folders: string[][];
  /** Pages per org prefix (`org/<id>/`). */
  pages: Record<string, Blob[][]>;
}

interface SetupOptions {
  config?: Partial<DriveStorageConfig>;
  onCall?: FakeOptions["onCall"];
  /** Every clock read advances this many ms (against a 10 s budget). */
  clockStep?: number;
}

function setup(store: Store, opts: SetupOptions = {}) {
  const fake = makeDeps({ config: testConfig({ cronSecret: SECRET, ...opts.config }), onCall: opts.onCall });
  const lists: Array<{ prefix: string; cursor?: string; mode?: string; limit?: number }> = [];
  fake.deps.blob.list = async ({ prefix, cursor, limit, mode }) => {
    lists.push({ prefix, cursor, mode, limit });
    const pages = mode === "folded" ? store.folders.map((folders) => ({ folders, blobs: [] as Blob[] }))
      : (store.pages[prefix] ?? [[]]).map((blobs) => ({ folders: [] as string[], blobs }));
    const index = cursor ? Number(cursor) : 0;
    const page = pages[index] ?? { folders: [], blobs: [] };
    const hasMore = index + 1 < pages.length;
    return { ...page, hasMore, ...(hasMore ? { cursor: String(index + 1) } : {}) };
  };
  let clock = NOW;
  fake.deps.now = () => {
    clock += opts.clockStep ?? 0;
    return clock;
  };
  // random() = 0.99 keeps the listed order (Fisher–Yates swaps each item with itself).
  const handler = createDriveReconcileHandler(fake.deps, { budgetMs: 10_000, random: () => 0.99 });
  return { ...fake, lists, handler };
}

function cron(query = "", secret: string | null = SECRET): Request {
  return new Request(`http://localhost/api/cron/drive-reconcile${query}`, {
    headers: secret === null ? {} : { authorization: `Bearer ${secret}` },
  });
}

async function summaryOf(res: Response): Promise<DriveReconcileSummary> {
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  return (await res.json()) as DriveReconcileSummary;
}

const sent = (args: Record<string, unknown>) => JSON.parse(String(args.blobsJson)) as Array<{ k: string; s: number; u: number }>;

const ONE_ORG: Store = {
  folders: [[`org/${ORG}/`]],
  pages: {
    [`org/${ORG}/`]: [[
      blob(keyOf(ORG, 1), 1000),
      blob(driveThumbKeyFor(keyOf(ORG, 1)), 20),
      blob(keyOf(ORG, 2), 3000, YOUNG),
      blob(`org/${ORG}/notes.txt`, 7),
      blob(keyOf(OTHER_ORG, 3), 50),
    ]],
  },
};

describe("orgOfFolder", () => {
  test("accepts org/<uuid>/ folders only", () => {
    expect(orgOfFolder(`org/${ORG}/`)).toBe(ORG);
    expect(orgOfFolder(`org/${ORG}`)).toBe(ORG);
    expect(orgOfFolder(`org/${ORG.toUpperCase()}/`)).toBeNull();
    expect(orgOfFolder("org/tmp/")).toBeNull();
    expect(orgOfFolder(`users/${ORG}/`)).toBeNull();
  });
});

describe("GET /api/cron/drive-reconcile", () => {
  test("the grace period equals the module's", () => {
    expect(DRIVE_RECONCILE_ORPHAN_AGE_MS).toBe(Number(server.DRIVE_ORPHAN_GRACE_MICROS / 1000n));
  });

  test("fails closed: 503 without CRON_SECRET, 401 for a wrong one, and nothing is listed", async () => {
    const noSecret = setup(ONE_ORG, { config: { cronSecret: null } });
    expect((await noSecret.handler(cron())).status).toBe(503);
    const wrong = setup(ONE_ORG);
    const res = await wrong.handler(cron("", "nope"));
    expect(res.status).toBe(401);
    expect((await readBody(res)).code).toBe("unauthenticated");
    expect([...noSecret.lists, ...wrong.lists]).toHaveLength(0);
  });

  test("off production it is a dry run: the store is listed and counted, nothing is written", async () => {
    const s = setup(ONE_ORG, { config: { reconcileLive: false } });
    const summary = await summaryOf(await s.handler(cron()));
    expect(summary).toEqual({
      mode: "dry_run", orgs: 1, blobs: 5, bytes: 4077, sentKeys: 0, braked: [], alert: false, stoppedEarly: false,
    });
    expect(s.calls).toHaveLength(0);
    expect(s.lists).toEqual([
      { prefix: "org/", cursor: undefined, mode: "folded", limit: 1000 },
      { prefix: `org/${ORG}/`, cursor: undefined, mode: undefined, limit: 1000 },
    ]);
  });

  test("?dryRun=1 on production is a dry run too", async () => {
    const s = setup(ONE_ORG, { config: { reconcileLive: true } });
    const summary = await summaryOf(await s.handler(cron("?dryRun=1")));
    expect(summary.mode).toBe("dry_run");
    expect(s.calls).toHaveLength(0);
  });

  test("live: only the org's own Drive keys older than a day are sent, then the org is finished with the listing totals", async () => {
    const s = setup(ONE_ORG, { config: { reconcileLive: true } });
    const summary = await summaryOf(await s.handler(cron()));
    expect(s.calls.map((c) => c.key)).toEqual(["enqueueOrphans", "finishReconcile"]);
    expect(s.calls[0].args.organizationId).toBe(ORG);
    expect(sent(s.calls[0].args)).toEqual([
      { k: keyOf(ORG, 1), s: 1000, u: OLD },
      { k: driveThumbKeyFor(keyOf(ORG, 1)), s: 20, u: OLD },
    ]);
    expect(s.calls[1].args).toEqual({ organizationId: ORG, measuredBytes: 4077, measuredCount: 5 });
    expect(summary).toEqual({
      mode: "live", orgs: 1, blobs: 5, bytes: 4077, sentKeys: 2, braked: [], alert: false, stoppedEarly: false,
    });
  });

  test("live: every page is reported, folders are paged, and folders that are not org/<uuid>/ are skipped", async () => {
    const s = setup({
      folders: [[`org/${ORG}/`, "org/tmp/"], [`org/${OTHER_ORG}/`]],
      pages: {
        [`org/${ORG}/`]: [[blob(keyOf(ORG, 1), 10)], [blob(keyOf(ORG, 2), 20)], [blob(keyOf(ORG, 3), 30, YOUNG)]],
        [`org/${OTHER_ORG}/`]: [[blob(keyOf(OTHER_ORG, 4), 40)]],
      },
    }, { config: { reconcileLive: true } });
    const summary = await summaryOf(await s.handler(cron()));
    expect(s.lists.filter((l) => l.mode === "folded").map((l) => l.cursor)).toEqual([undefined, "1"]);
    expect(s.calls.map((c) => [c.key, c.args.organizationId])).toEqual([
      ["enqueueOrphans", ORG], ["enqueueOrphans", ORG], ["finishReconcile", ORG],
      ["enqueueOrphans", OTHER_ORG], ["finishReconcile", OTHER_ORG],
    ]);
    expect(s.calls[2].args).toEqual({ organizationId: ORG, measuredBytes: 60, measuredCount: 3 });
    expect(summary).toMatchObject({ orgs: 2, blobs: 4, bytes: 100, sentKeys: 3 });
  });

  test("the orphan brake parks the org: its later pages and its finish are skipped, it is logged, other orgs go on", async () => {
    const s = setup({
      folders: [[`org/${ORG}/`, `org/${THIRD_ORG}/`]],
      pages: {
        [`org/${ORG}/`]: [[blob(keyOf(ORG, 1), 10)], [blob(keyOf(ORG, 2), 20)]],
        [`org/${THIRD_ORG}/`]: [[blob(keyOf(THIRD_ORG, 3), 30)]],
      },
    }, {
      config: { reconcileLive: true },
      onCall: (key, args) => {
        if (key === "enqueueOrphans" && args.organizationId === ORG) {
          throw reducerError("service_enqueue_orphan_drive_blobs", 530, "[drive.orphan_brake] Too many unknown files");
        }
      },
    });
    const summary = await summaryOf(await s.handler(cron()));
    expect(s.lists.filter((l) => l.prefix === `org/${ORG}/`)).toHaveLength(1);
    expect(s.calls.map((c) => [c.key, c.args.organizationId])).toEqual([
      ["enqueueOrphans", ORG], ["enqueueOrphans", THIRD_ORG], ["finishReconcile", THIRD_ORG],
    ]);
    expect(summary.braked).toEqual([ORG]);
    expect(summary.sentKeys).toBe(1);
    expect(s.logs.find((l) => l.event === "drive.reconcile.orphan_brake")?.level).toBe("error");
  });

  test("another report failure skips that org's finish and is logged; the run goes on", async () => {
    const s = setup({
      folders: [[`org/${ORG}/`, `org/${THIRD_ORG}/`]],
      pages: {
        [`org/${ORG}/`]: [[blob(keyOf(ORG, 1), 10)]],
        [`org/${THIRD_ORG}/`]: [[blob(keyOf(THIRD_ORG, 3), 30)]],
      },
    }, {
      config: { reconcileLive: true },
      onCall: (key, args) => {
        if (key === "enqueueOrphans" && args.organizationId === ORG) throw reducerError("service_enqueue_orphan_drive_blobs", 500, "boom");
      },
    });
    const summary = await summaryOf(await s.handler(cron()));
    expect(s.calls.filter((c) => c.key === "finishReconcile").map((c) => c.args.organizationId)).toEqual([THIRD_ORG]);
    expect(summary.braked).toEqual([]);
    expect(s.logs.some((l) => l.level === "error" && l.event === "drive.reconcile.report_failed")).toBe(true);
  });

  test("a store larger than DRIVE_PLATFORM_ALERT_BYTES raises the alert at error level", async () => {
    const over = setup(ONE_ORG, { config: { platformAlertBytes: 4000 } });
    expect((await summaryOf(await over.handler(cron()))).alert).toBe(true);
    expect(over.logs.find((l) => l.event === "drive.platform_bytes_alert")).toMatchObject({
      level: "error", fields: { bytes: 4077, threshold: 4000 },
    });
    const under = setup(ONE_ORG, { config: { platformAlertBytes: 5000 } });
    expect((await summaryOf(await under.handler(cron()))).alert).toBe(false);
    const unset = setup(ONE_ORG);
    expect((await summaryOf(await unset.handler(cron()))).alert).toBe(false);
  });

  test("the budget stops the run between pages; a cut-short org is not finished", async () => {
    const s = setup({
      folders: [[`org/${ORG}/`, `org/${THIRD_ORG}/`]],
      pages: {
        [`org/${ORG}/`]: [[blob(keyOf(ORG, 1), 10)], [blob(keyOf(ORG, 2), 20)], [blob(keyOf(ORG, 3), 30)]],
        [`org/${THIRD_ORG}/`]: [[blob(keyOf(THIRD_ORG, 4), 40)]],
      },
    }, { config: { reconcileLive: true }, clockStep: 2000 });
    const summary = await summaryOf(await s.handler(cron()));
    expect(summary.stoppedEarly).toBe(true);
    expect(s.calls.some((c) => c.key === "finishReconcile")).toBe(false);
    expect(s.lists.some((l) => l.prefix === `org/${THIRD_ORG}/`)).toBe(false);
  });

  test("the org order is shuffled with the injected random source", async () => {
    const store: Store = { folders: [[`org/${ORG}/`, `org/${OTHER_ORG}/`, `org/${THIRD_ORG}/`]], pages: {} };
    const fake = setup(store);
    await createDriveReconcileHandler(fake.deps, { random: () => 0 })(cron());
    // random() = 0 moves each last item to the front: [a, b, c] → [b, c, a].
    expect(fake.lists.filter((l) => l.mode === undefined).map((l) => l.prefix)).toEqual([
      `org/${OTHER_ORG}/`, `org/${THIRD_ORG}/`, `org/${ORG}/`,
    ]);
  });

  test("a failed folder listing is an error response", async () => {
    const s = setup(ONE_ORG);
    s.deps.blob.list = async () => {
      throw new Error("Vercel Blob: store suspended");
    };
    const res = await s.handler(cron());
    expect(res.status).toBe(502);
    expect((await readBody(res)).code).toBe("upstream");
  });
});
