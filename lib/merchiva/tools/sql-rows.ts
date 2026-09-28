/**
 * Rows from SpacetimeDB's HTTP SQL endpoint, decoded into the shapes the SDK
 * gives a subscription's rows. Pure.
 *
 * Mr. Merchiva's read tools were written against SDK rows (lib/merchiva/tools/rows.ts
 * and every mapper after it), and now read as the calling member over the SQL
 * endpoint instead (sql-source.ts). Decoding into the SDK's own classes keeps
 * every mapper, and every tool's output, exactly as it was.
 *
 * The endpoint answers `[{ schema: { elements }, rows }]`. Each row is an array
 * in column order, each value SATS-JSON encoded (probed against maincloud):
 *
 *   uuid       [<u128 as a decimal integer literal, up to 39 digits>]
 *   identity   ["0x<64 hex digits>"]
 *   timestamp  [<microseconds since the epoch>]
 *   option     [0, value] = some, [1, []] = none — any sum is [variant index, value]
 *   i64 / u64  an integer literal; f64 a float literal; i32 an integer; bool true/false
 *
 * A u128 does not fit in a double, so integer literals are quoted before
 * `JSON.parse` and the schema turns them back into bigints. No table the tools
 * read has a connection-id column, so that type is not special-cased.
 *
 * Column names are the published snake_case names; the SDK's accessors are
 * their camelCase (`organization_id` → `organizationId`), which is how the
 * generated bindings name them too (scripts/tests/merchiva-tools/sql-rows.test.ts).
 */

import { Identity, TimeDuration, Timestamp, Uuid, toCamelCase } from "spacetimedb";
import type { Row } from "@/lib/merchiva/tools/rows";

/** A SATS algebraic type as the endpoint writes it: `{ "<Kind>": body }`. */
export type SqlType = Record<string, unknown>;

export interface SqlElement {
  name?: { some?: string } | null;
  algebraic_type: SqlType;
}

/** One statement's result. */
export interface SqlStatementResult {
  schema: { elements: SqlElement[] };
  rows: unknown[][];
}

/**
 * Quote every integer literal of 16 or more digits outside strings, so
 * `JSON.parse` keeps it exactly (a uuid's u128 has up to 39). Floats keep
 * their `.` or exponent and are left alone.
 */
export function quoteBigIntegers(text: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < text.length && /[0-9.eE+-]/.test(text[j])) j++;
      const token = text.slice(i, j);
      out += /^-?\d{16,}$/.test(token) ? `"${token}"` : token;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const BIG_INTEGERS = new Set(["I64", "U64", "I128", "U128", "I256", "U256"]);
const SMALL_NUMBERS = new Set(["I8", "U8", "I16", "U16", "I32", "U32", "F32", "F64"]);

function elementName(el: SqlElement | undefined): string | undefined {
  return el?.name?.some ?? undefined;
}

function bigint(raw: unknown): bigint {
  return BigInt(String(raw));
}

/** A special product's one field, whether written as `[v]` or `{ "__name__": v }`. */
function onlyField(raw: unknown, name: string): unknown {
  if (Array.isArray(raw)) return raw[0];
  if (raw && typeof raw === "object") return (raw as Record<string, unknown>)[name];
  return raw;
}

function decodeProduct(elements: SqlElement[], raw: unknown): unknown {
  if (elements.length === 1) {
    const name = elementName(elements[0]);
    if (name === "__uuid__") return new Uuid(bigint(onlyField(raw, name)));
    if (name === "__identity__") {
      const v = onlyField(raw, name);
      return new Identity(typeof v === "string" ? v : bigint(v));
    }
    if (name === "__timestamp_micros_since_unix_epoch__") return new Timestamp(bigint(onlyField(raw, name)));
    if (name === "__time_duration_micros__") return new TimeDuration(bigint(onlyField(raw, name)));
  }
  const values = Array.isArray(raw) ? raw : [];
  const out: Record<string, unknown> = {};
  elements.forEach((el, i) => {
    out[toCamelCase(elementName(el) ?? `_${i}`)] = decodeSqlValue(el.algebraic_type, values[i]);
  });
  return out;
}

function decodeSum(variants: SqlElement[], raw: unknown): unknown {
  let index: number;
  let inner: unknown;
  if (Array.isArray(raw)) {
    index = Number(raw[0]);
    inner = raw[1];
  } else if (raw && typeof raw === "object") {
    const key = Object.keys(raw)[0];
    index = variants.findIndex((v) => elementName(v) === key);
    inner = (raw as Record<string, unknown>)[key];
  } else {
    throw new Error(`Unreadable sum value: ${JSON.stringify(raw)}`);
  }
  const variant = variants[index];
  if (!variant) throw new Error(`Unknown sum variant ${index}`);
  const names = variants.map(elementName);
  const value = decodeSqlValue(variant.algebraic_type, inner);
  // The SDK's special cases: an option is its value or undefined, a result is { ok } / { err }.
  if (names.length === 2 && names[0] === "some" && names[1] === "none") return index === 0 ? value : undefined;
  if (names.length === 2 && names[0] === "ok" && names[1] === "err") return index === 0 ? { ok: value } : { err: value };
  return { tag: elementName(variant), value };
}

/** One value of `type`, as the SDK would hand it over. */
export function decodeSqlValue(type: SqlType, raw: unknown): unknown {
  const kind = Object.keys(type)[0];
  const body = type[kind];
  if (kind === "Product") return decodeProduct((body as { elements?: SqlElement[] })?.elements ?? [], raw);
  if (kind === "Sum") return decodeSum((body as { variants?: SqlElement[] })?.variants ?? [], raw);
  if (kind === "Array") {
    const element = body as SqlType;
    if (Object.keys(element)[0] === "U8") {
      if (typeof raw === "string") return Uint8Array.from(raw.replace(/^0x/, "").match(/../g) ?? [], (h) => parseInt(h, 16));
      return Uint8Array.from(Array.isArray(raw) ? raw.map(Number) : []);
    }
    return (Array.isArray(raw) ? raw : []).map((v) => decodeSqlValue(element, v));
  }
  if (kind === "String") return raw == null ? "" : String(raw);
  if (kind === "Bool") return raw === true;
  if (BIG_INTEGERS.has(kind)) return bigint(raw);
  // serde writes a non-finite float as null.
  if (SMALL_NUMBERS.has(kind)) return raw == null ? NaN : Number(raw);
  return raw;
}

/** One statement's rows, keyed by camelCase column name. */
export function decodeSqlRows(result: SqlStatementResult): Row[] {
  const elements = result.schema.elements;
  const names = elements.map((el, i) => toCamelCase(elementName(el) ?? `col${i}`));
  return result.rows.map((values) => {
    const row: Record<string, unknown> = {};
    elements.forEach((el, i) => {
      row[names[i]] = decodeSqlValue(el.algebraic_type, values[i]);
    });
    return row;
  });
}

/** The endpoint's response body → the rows of its one statement. Throws on any other shape. */
export function decodeSqlResponse(text: string): Row[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(quoteBigIntegers(text));
  } catch {
    throw new Error("SQL response is not JSON");
  }
  const first = Array.isArray(parsed) ? (parsed[0] as Partial<SqlStatementResult> | undefined) : undefined;
  if (!first || !Array.isArray(first.schema?.elements) || !Array.isArray(first.rows)) {
    throw new Error("unexpected SQL response shape");
  }
  return decodeSqlRows(first as SqlStatementResult);
}
