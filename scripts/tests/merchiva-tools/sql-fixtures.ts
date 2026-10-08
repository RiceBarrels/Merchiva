/**
 * HTTP-SQL fixtures for Mr. Merchiva's read tools.
 *
 *   sql-fixtures/schemas.json   the published column types of every table the
 *                               tools read (`spacetime describe --json`), keyed
 *                               by SDK accessor.
 *   sql-fixtures/captured.json  real responses of the SQL endpoint (maincloud),
 *                               one per table that had rows, kept byte-for-byte
 *                               in structure and encoding, with every value
 *                               replaced by a made-up one.
 *
 * `sqlResponseText` encodes SDK-shaped rows the way the endpoint does, so a
 * test can serve any data set; sql-rows.test.ts proves it reproduces the
 * captured responses exactly.
 */

import { Identity, Timestamp, Uuid, toCamelCase } from "spacetimedb";
import type { SqlElement, SqlType } from "@/lib/merchiva/tools/sql-rows";
import { TOOL_TABLES, type ToolTable } from "@/lib/merchiva/tools/tool-tables";
import captured from "./sql-fixtures/captured.json";
import schemas from "./sql-fixtures/schemas.json";

/** Raw response bodies, keyed by published table name. */
export const CAPTURED = captured as Record<string, string>;
/** Column elements, keyed by SDK accessor. */
export const SCHEMAS = schemas as unknown as Record<ToolTable, SqlElement[]>;

const name = (el: SqlElement) => el.name?.some ?? "";

/** One value in SATS JSON, as text (a u128 does not survive JSON.stringify of a number). */
export function encodeSqlValue(type: SqlType, v: unknown): string {
  const kind = Object.keys(type)[0];
  const body = type[kind] as { elements?: SqlElement[]; variants?: SqlElement[] };
  switch (kind) {
    case "Product": {
      const special = body.elements?.length === 1 ? name(body.elements[0]) : "";
      if (special === "__uuid__") return `[${(v instanceof Uuid ? v : Uuid.parse(String(v))).__uuid__}]`;
      if (special === "__identity__") return `[${JSON.stringify(`0x${v instanceof Identity ? v.toHexString() : String(v)}`)}]`;
      if (special === "__timestamp_micros_since_unix_epoch__") return `[${(v as Timestamp).microsSinceUnixEpoch}]`;
      throw new Error(`no encoder for product ${special}`);
    }
    case "Sum": {
      const variants = body.variants ?? [];
      if (name(variants[0]) !== "some") throw new Error("only options are encoded");
      return v == null ? "[1,[]]" : `[0,${encodeSqlValue(variants[0].algebraic_type, v)}]`;
    }
    case "String":
      return JSON.stringify(String(v));
    case "Bool":
      return v ? "true" : "false";
    case "I64":
    case "U64":
      return BigInt(v as bigint).toString();
    case "I32":
    case "U32":
      return String(Math.trunc(Number(v)));
    case "F64": {
      // serde writes a whole float with its ".0".
      const n = Number(v);
      return Number.isInteger(n) ? n.toFixed(1) : String(n);
    }
    default:
      throw new Error(`no encoder for ${kind}`);
  }
}

/** A whole response body for `rows` of `table` — only `columns` (published names) when given. */
export function sqlResponseText(table: ToolTable, rows: readonly Record<string, unknown>[], columns?: readonly string[]): string {
  const all = SCHEMAS[table];
  const elements = columns
    ? columns.map((c) => {
        const el = all.find((e) => name(e) === c);
        if (!el) throw new Error(`${table} has no column ${c}`);
        return el;
      })
    : all;
  const encoded = rows.map((r) => `[${elements.map((el) => encodeSqlValue(el.algebraic_type, r[toCamelCase(name(el))])).join(",")}]`);
  return (
    `[{"schema":${JSON.stringify({ elements })},"rows":[${encoded.join(",")}],` +
    `"total_duration_micros":1,"stats":{"rows_inserted":0,"rows_deleted":0,"rows_updated":0}}]`
  );
}

/** The accessor for a published table name, as the fake endpoint reads it off a query. */
export function tableForSql(sql: string): ToolTable | undefined {
  return (Object.keys(TOOL_TABLES) as ToolTable[]).find((t) => TOOL_TABLES[t].sql === sql);
}

// ── SDK-shaped values ────────────────────────────────────────────────────────

export const sdkUuid = (n: number) => Uuid.parse(`0199c000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
export const sdkIdentity = (n: number) => new Identity(`c200${n.toString(16).padStart(60, "0")}`);
export const sdkTimestamp = (ms: number) => new Timestamp(BigInt(ms) * 1000n);
