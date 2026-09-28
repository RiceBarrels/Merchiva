/**
 * Where Mr. Merchiva's read tools get their rows — server-only.
 *
 * The tools read AS THE CALLING MEMBER: each table is loaded with the caller's
 * own token over SpacetimeDB's HTTP SQL endpoint, the one
 * lib/auth/verify-member.ts proves their membership on. Row-level security
 * then hands back exactly the rows that member's app would see. (They used to
 * read through the service identity, which the module's RLS rules give no rows
 * at all — in production every tool saw an empty store.)
 *
 * One source serves one request. A table is loaded the first time a tool call
 * needs it and kept for the rest of the request; tool calls running at the
 * same time share a load that is still in flight. A failed load is dropped, so
 * a later call tries again instead of repeating the error. Queries and their
 * windows are in tool-tables.ts; decoding into SDK row shapes in sql-rows.ts.
 */

import "server-only";

import type { Row, ToolData } from "@/lib/merchiva/tools/rows";
import { decodeSqlResponse } from "@/lib/merchiva/tools/sql-rows";
import { TOOL_TABLE_NAMES, toolTableQuery, type ToolTable } from "@/lib/merchiva/tools/tool-tables";

const WS_BASE = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000";
const HTTP_BASE = WS_BASE.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
const MODULE_NAME =
  process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ??
  "c200b446cd88a8dfa10c16c03d8f315007c61f331ff36bd711acba146a2f43aa";

const QUERY_TIMEOUT_MS = 15_000;

export interface ToolSource {
  /** The store's rows of every table in `tables`, each loaded at most once per request. */
  load(tables: readonly ToolTable[]): Promise<ToolData>;
}

/** Run one read-only query as the holder of `token`. Errors never carry the token. */
async function querySql(token: string, query: string): Promise<Row[]> {
  const url = `${HTTP_BASE.replace(/\/$/, "")}/v1/database/${MODULE_NAME}/sql`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
    body: query,
    cache: "no-store",
    signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`the caller's session was rejected (${res.status}); it may have expired`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`store data query failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return decodeSqlResponse(await res.text());
}

/**
 * The rows handed to a tool body. Reading a table the tool did not declare is
 * a bug in the tool, so it throws rather than look like an empty table.
 */
function snapshot(loaded: Map<ToolTable, Row[]>): ToolData {
  const db: ToolData["db"] = {};
  for (const name of TOOL_TABLE_NAMES) {
    Object.defineProperty(db, name, {
      enumerable: loaded.has(name),
      get() {
        const rows = loaded.get(name);
        if (!rows) throw new Error(`${name} was not loaded for this tool; add it to the tool's tables`);
        return { iter: () => rows };
      },
    });
  }
  return { db };
}

/**
 * A request's data source: the caller's `token`, the store they were verified
 * against, and the store's day (`YYYY-MM-DD`, which the history windows count
 * back from).
 */
export function createSqlToolSource(opts: { token: string; organizationId: string; today: string }): ToolSource {
  const loads = new Map<ToolTable, Promise<Row[]>>();

  const loadTable = (table: ToolTable): Promise<Row[]> => {
    const cached = loads.get(table);
    if (cached) return cached;
    const load = Promise.resolve()
      .then(() => querySql(opts.token, toolTableQuery(table, opts.organizationId, opts.today)))
      .catch((err: unknown) => {
        if (loads.get(table) === load) loads.delete(table);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${table}: ${msg}`);
      });
    loads.set(table, load);
    return load;
  };

  return {
    async load(tables) {
      const rows = await Promise.all(tables.map(loadTable));
      return snapshot(new Map(tables.map((t, i) => [t, rows[i]])));
    },
  };
}
