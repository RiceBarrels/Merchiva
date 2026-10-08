// Reading values out of the HTTP /sql endpoint's JSON rows (lib/spacetimedb/sql.ts).
// Shapes verified against maincloud: a timestamp column is `[micros]`, an option
// column is `[0, value]` (some) or `[1, []]` (none).

import type { SqlResult } from "@/lib/spacetimedb/sql";

/** The first row of the first result set, or null. */
export function firstRow(results: SqlResult[]): unknown[] | null {
  const row = results[0]?.rows?.[0];
  return Array.isArray(row) ? row : null;
}

/** Microseconds since the epoch from a timestamp column, or null. */
export function sqlMicros(v: unknown): number | null {
  return Array.isArray(v) && typeof v[0] === "number" ? v[0] : null;
}

/** Whether an option column holds a value. */
export function sqlIsSome(v: unknown): boolean {
  return Array.isArray(v) && v[0] === 0;
}

/** A `t.option(t.string())` column's string, or null for none / anything else. */
export function sqlOptionString(v: unknown): string | null {
  return sqlIsSome(v) && typeof (v as unknown[])[1] === "string" ? ((v as unknown[])[1] as string) : null;
}

/** A uuid, the only shape an id may have before it is spliced into SQL text. */
export const SQL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
