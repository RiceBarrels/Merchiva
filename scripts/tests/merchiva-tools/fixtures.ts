/**
 * Row fakes for the engine-tool tests: just enough of the SpacetimeDB row
 * shapes (uuid / identity / timestamp objects) for the mappers to read.
 */

import type { ToolContext, ToolData, ToolExec } from "@/lib/merchiva/tools/rows";
import { TOOL_TABLE_NAMES } from "@/lib/merchiva/tools/tool-tables";

let seq = 0;

/** A Uuid-like id: `toString()` hyphenated, `toHexString()` bare, like the SDK class. */
export function uuid(n?: number) {
  const v = (n ?? ++seq).toString(16).padStart(32, "0");
  const text = `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
  return { toString: () => text, toHexString: () => v };
}

export function identity(hex: string) {
  return { toHexString: () => hex, toString: () => hex };
}

export function ts(ms: number) {
  return { microsSinceUnixEpoch: BigInt(ms) * 1000n };
}

/** Tool rows (the shape of an SDK connection's cache) whose tables iterate the given rows. */
export function fakeConn(tables: Record<string, unknown[]>) {
  const db: Record<string, { iter: () => unknown[] }> = {};
  for (const [name, rows] of Object.entries(tables)) db[name] = { iter: () => rows };
  return { db };
}

/**
 * A ToolContext whose exec runs the executor against `conn` directly, handing
 * it the rows the way the real source does (snapshot() in
 * lib/merchiva/tools/sql-source.ts): only the tables the tool declares, a
 * declared table the test gave no rows reading as empty, and a read of any
 * other table throwing. In production exec turns that throw into a tool error;
 * here it rejects the call, so a test that reaches a read the tool forgot to
 * declare fails whatever it asserts.
 */
export function fakeCtx(
  conn: ReturnType<typeof fakeConn>,
  today: string,
  timeZone: string | null = null,
  organizationId = "org-1",
): ToolContext {
  const exec: ToolExec = (_label, tables, fn) => (args) => {
    const db: ToolData["db"] = {};
    for (const name of TOOL_TABLE_NAMES) {
      const declared = tables.includes(name);
      Object.defineProperty(db, name, {
        enumerable: declared,
        get() {
          if (!declared) throw new Error(`${name} was not loaded for this tool; add it to the tool's tables`);
          return conn.db[name] ?? { iter: () => [] };
        },
      });
    }
    return fn({ db }, args);
  };
  return { organizationId, today, timeZone, exec };
}

export const CALL = { toolCallId: "test", messages: [] };
