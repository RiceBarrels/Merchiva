// Shared fixture of the GC cron tests: job rows as /sql sends them, and a
// handler wired to a fake /sql that serves the queue like the server does (one
// action per window, the hold compared with the query's RFC 3339 literal, cut
// at the LIMIT in table order) and a fake ack that drops what the module would.

import { expect } from "bun:test";
import { driveBlobKey } from "@/lib/drive/rules";
import {
  DRIVE_GC_DEAD_QUERY, DRIVE_GC_QUERY_LIMIT, DRIVE_GC_VERIFY_QUERY, createDriveGcHandler, type DriveGcSummary,
} from "@/lib/drive/server/handlers/gc";
import type { DriveHeadResult } from "@/lib/drive/server/handlers/types";
import type { SqlRow } from "@/lib/drive/server/sql-rows";
import { NOW, ORG, makeDeps, testConfig, type FakeOptions } from "./fake-deps";

export const SECRET = "cron-secret-0123456789abcdef";
const PATH = "/api/cron/drive-gc";

export function uuid(n: number): string {
  return `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
export function keyOf(n: number): { itemId: string; key: string } {
  const itemId = uuid(n);
  return { itemId, key: driveBlobKey(ORG, itemId, uuid(100_000 + n), `file-${n}.pdf`) };
}
export function job(n: number, action: "delete" | "verify" | "dead", overrides: Partial<SqlRow> = {}): SqlRow {
  const { itemId, key } = keyOf(n);
  return { blob_key: key, organization_id: ORG, item_id: itemId, action, declared_bytes: 5000, attempts: 0, ...overrides };
}
/** A 'delete' still inside its hold, hold_until as /sql sends a timestamp: `[micros]`. */
export const heldJob = (n: number): SqlRow => job(n, "delete", { hold_until: [(NOW + 3_600_000) * 1000] });
export const head = (size: number): DriveHeadResult => ({ size, contentType: "application/pdf", etag: `"e${size}"`, uploadedAt: NOW });
export const keysOf = (json: unknown) => JSON.parse(String(json)) as string[];

export function cronRequest(secret: string | null = SECRET): Request {
  return new Request(`http://localhost${PATH}`, { headers: secret === null ? {} : { authorization: `Bearer ${secret}` } });
}

/** hold_until in µs: `[micros]` or the tagged object; 0 (due) when absent. */
export function holdMicros(row: SqlRow): number {
  const value = row.hold_until;
  if (Array.isArray(value)) return Number(value[0]);
  if (value !== null && typeof value === "object") {
    return Number((value as Record<string, unknown>).__timestamp_micros_since_unix_epoch__);
  }
  return 0;
}

/** The rows the server would answer `query` with: its action, its hold bound (RFC 3339, exact to the µs), its LIMIT. */
export function serveGcQuery(query: string, rows: readonly SqlRow[]): SqlRow[] {
  const action = /action = '(\w+)'/.exec(query)?.[1];
  const hold = /hold_until (<=|>) '([^']+)'/.exec(query);
  const boundMicros = hold ? Date.parse(hold[2]) * 1000 : 0;
  const due = (row: SqlRow) => holdMicros(row) <= boundMicros;
  return rows
    .filter((row) => row.action === action && (!hold || due(row) === (hold[1] === "<=")))
    .slice(0, DRIVE_GC_QUERY_LIMIT);
}

export function sqlLabel(query: string): string {
  if (query === DRIVE_GC_VERIFY_QUERY) return "sql:verify";
  if (query === DRIVE_GC_DEAD_QUERY) return "sql:dead";
  if (query.includes("hold_until <=")) return "sql:due";
  if (query.includes("hold_until >")) return "sql:held";
  return `sql:${query}`;
}

export interface Setup extends FakeOptions {
  jobs?: SqlRow[];
  dead?: SqlRow[];
  /** Called with every del() batch; throw to fail it. */
  onDel?: (keys: string[]) => void;
  /** Called before the fake /sql answers; throw to fail the query. */
  beforeSql?: (query: string) => void;
  clockStep?: number;
}

export function setup(opts: Setup = {}) {
  const { jobs, dead, onDel, beforeSql, clockStep, ...fakeOptions } = opts;
  const timeline: string[] = [];
  const holdOf = new Map((jobs ?? []).map((row) => [String(row.blob_key), holdMicros(row)]));
  /** Keys the module dropped on an ack: every acknowledged key but a 'delete' still inside its hold. */
  const dropped = new Set<string>();
  const fake = makeDeps({
    config: testConfig({ cronSecret: SECRET }),
    ...fakeOptions,
    onCall: async (key, args, token) => {
      timeline.push(`call:${key}`);
      await opts.onCall?.(key, args, token);
      if (key !== "ackGc") return;
      for (const blobKey of keysOf(args.blobKeysJson)) {
        if ((holdOf.get(blobKey) ?? 0) <= NOW * 1000) dropped.add(blobKey);
      }
    },
    onSql: (query, token) => {
      timeline.push(sqlLabel(query));
      beforeSql?.(query);
      if (opts.onSql) return opts.onSql(query, token);
      if (query === DRIVE_GC_DEAD_QUERY) return (dead ?? []).slice(0, DRIVE_GC_QUERY_LIMIT);
      return serveGcQuery(query, (jobs ?? []).filter((row) => !dropped.has(String(row.blob_key))));
    },
    onHead: (pathname) => {
      timeline.push("head");
      opts.onHead?.(pathname);
    },
  });
  const dels: string[][] = [];
  fake.deps.blob.del = async (keys) => {
    timeline.push("del");
    dels.push([...keys]);
    onDel?.([...keys]);
  };
  let clock = NOW;
  fake.deps.now = () => {
    clock += clockStep ?? 0;
    return clock;
  };
  const handler = createDriveGcHandler(fake.deps, { budgetMs: 10_000 });
  return { ...fake, timeline, dels, dropped, handler };
}

export async function run(s: ReturnType<typeof setup>): Promise<DriveGcSummary> {
  const res = await s.handler(cronRequest());
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  return (await res.json()) as DriveGcSummary;
}
