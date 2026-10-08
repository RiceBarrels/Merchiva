// Decoding SpacetimeDB's HTTP `/sql` answer for the Drive routes. Pure.
//
// The endpoint returns one result set per statement: a schema (column names as
// written in the query, e.g. `blob_key`) plus rows as positional JSON arrays.
// A row that matches several RLS rules comes back once PER RULE (a Store-space
// file its owner reads matches both the owner and the store rule), so readers
// must de-duplicate by id.

/** One decoded row: column name → JSON value (strings, numbers, booleans, or objects for uuid / identity / sum types). */
export type SqlRow = Record<string, unknown>;

/** The first result set of `spacetimeSql()` as objects keyed by column name. Unnamed columns are skipped. */
export function sqlRows(
  results: ReadonlyArray<{ schema: { elements: ReadonlyArray<{ name: { some?: string } }> }; rows: unknown[][] }>,
): SqlRow[] {
  const first = results[0];
  if (!first) return [];
  const names = first.schema.elements.map((column) => (typeof column.name?.some === "string" ? column.name.some : null));
  return first.rows.map((values) => {
    const row: SqlRow = {};
    names.forEach((name, i) => {
      if (name !== null) row[name] = Array.isArray(values) ? values[i] : undefined;
    });
    return row;
  });
}

/** Keeps the first row per value of `column` (compared as JSON, so object values work too). */
export function dedupeRowsBy(rows: readonly SqlRow[], column: string): SqlRow[] {
  const seen = new Set<string>();
  const out: SqlRow[] = [];
  for (const row of rows) {
    const key = JSON.stringify(row[column] ?? null);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** The column as a string; '' when absent or not a string. */
export function sqlString(row: SqlRow, column: string): string {
  const value = row[column];
  return typeof value === "string" ? value : "";
}

/** The column as a finite number (u64 may arrive as a number, a numeric string or a bigint); 0 otherwise. */
export function sqlNumber(row: SqlRow, column: string): number {
  const value = row[column];
  const n = typeof value === "number" ? value
    : typeof value === "bigint" ? Number(value)
    : typeof value === "string" && value.trim() !== "" ? Number(value)
    : NaN;
  return Number.isFinite(n) ? n : 0;
}
