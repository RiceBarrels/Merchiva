/**
 * Server-side bridge between the /merchivaAdmin console and SpacetimeDB.
 *
 *  - adminSql(query)          read any PUBLIC table via the HTTP SQL endpoint,
 *                             decoded into plain JSON-friendly objects
 *                             (camelCase keys, uuid strings, identity hex,
 *                             timestamps as unix millis, option none → null).
 *  - adminCall(reducer, args) call any reducer (but the notifications cron's
 *                             claim / finish) as the service identity over
 *                             the cached service WebSocket connection. Args are
 *                             plain JSON and coerced to SDK types using the
 *                             generated reducer schema (identity hex strings,
 *                             timestamps as millis/ISO, uuids as strings).
 *
 * The module treats the service identity as a virtual owner of every org and
 * as a site admin, so every org-scoped and admin-only reducer works here.
 */

import "server-only";

import { Identity, Timestamp, Uuid } from "spacetimedb";
import { notifyAdminCallRefusal, notifyAdminSqlRefusal } from "@/lib/notifications/server/admin-sql";
import { reducers as reducerSchemas } from "@/lib/spacetimedb/generated";
import { getServiceConn } from "@/lib/spacetimedb/service-client";

const WS_BASE = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const HTTP_BASE = WS_BASE.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/$/, "");
const MODULE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "merchiva";

export type AdminRow = Record<string, unknown>;

// ─── SQL (reads) ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SatsType = Record<string, any>;

interface SqlResultRaw {
  schema: { elements: Array<{ name: { some?: string }; algebraic_type: SatsType }> };
  rows: unknown[][];
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * JSON.parse loses precision on u128 uuids / u64 counters. Quote every integer
 * literal with 16+ digits (outside strings) so it survives as a string; the
 * schema-driven decoder turns it back into the right shape.
 */
function quoteBigIntegers(text: string): string {
  let out = "";
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < text.length && /[0-9.eE+-]/.test(text[j])) j++;
      const tok = text.slice(i, j);
      out += /^-?\d{16,}$/.test(tok) ? `"${tok}"` : tok;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function camel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function uuidFromU128(raw: unknown): string {
  const hex = BigInt(String(raw)).toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function bigToJson(raw: unknown): number | string {
  const b = BigInt(String(raw));
  return b <= MAX_SAFE && b >= MIN_SAFE ? Number(b) : b.toString();
}

function decodeValue(type: SatsType, raw: unknown): unknown {
  const key = Object.keys(type)[0];
  const body = type[key];
  switch (key) {
    case "Product": {
      const elements: Array<{ name: { some?: string }; algebraic_type: SatsType }> = body.elements ?? [];
      if (elements.length === 1) {
        const n = elements[0].name?.some;
        const inner = Array.isArray(raw) ? raw[0] : raw;
        if (n === "__uuid__") return uuidFromU128(inner);
        if (n === "__identity__") return String(inner).replace(/^0x/, "");
        if (n === "__connection_id__") return String(inner).replace(/^0x/, "");
        if (n === "__timestamp_micros_since_unix_epoch__") return Number(BigInt(String(inner)) / 1000n);
        if (n === "__time_duration_micros__") return bigToJson(inner);
      }
      const obj: AdminRow = {};
      const arr = Array.isArray(raw) ? raw : [];
      elements.forEach((el, i) => {
        obj[camel(el.name?.some ?? `_${i}`)] = decodeValue(el.algebraic_type, arr[i]);
      });
      return obj;
    }
    case "Sum": {
      const variants: Array<{ name: { some?: string }; algebraic_type: SatsType }> = body.variants ?? [];
      let idx: number;
      let inner: unknown;
      if (Array.isArray(raw)) {
        [idx, inner] = raw as [number, unknown];
      } else if (raw && typeof raw === "object") {
        const k = Object.keys(raw as object)[0];
        idx = variants.findIndex((v) => v.name?.some === k);
        inner = (raw as Record<string, unknown>)[k];
      } else {
        return raw;
      }
      const variant = variants[idx];
      const name = variant?.name?.some;
      if (name === "none") return null;
      if (name === "some") return decodeValue(variant.algebraic_type, inner);
      return { tag: name, value: decodeValue(variant.algebraic_type, inner) };
    }
    case "Array":
      return (Array.isArray(raw) ? raw : []).map((v) => decodeValue(body, v));
    case "U64":
    case "I64":
    case "U128":
    case "I128":
    case "U256":
    case "I256":
      return bigToJson(raw);
    default:
      return raw;
  }
}

/**
 * Run a read-only SQL query (SpacetimeDB SQL dialect: `SELECT * FROM table
 * [WHERE col = 'x']`; column names are snake_case). Returns decoded rows.
 * A query naming notification_delivery is refused (lib/notifications/server/admin-sql.ts).
 */
export async function adminSql(query: string): Promise<AdminRow[]> {
  if (!/^\s*select\b/i.test(query) || query.includes(";")) {
    throw new Error("Only single SELECT statements are allowed");
  }
  const refusal = notifyAdminSqlRefusal(query);
  if (refusal) throw new Error(refusal);
  const token = process.env.SPACETIMEDB_SERVICE_TOKEN;
  const res = await fetch(`${HTTP_BASE}/v1/database/${MODULE}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: query,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SpacetimeDB SQL failed (${res.status}): ${text.slice(0, 300)}`);
  const results = JSON.parse(quoteBigIntegers(text)) as SqlResultRaw[];
  const first = results[0];
  if (!first) return [];
  const cols = first.schema.elements;
  return first.rows.map((values) => {
    const row: AdminRow = {};
    cols.forEach((col, i) => {
      row[camel(col.name?.some ?? `col${i}`)] = decodeValue(col.algebraic_type, values[i]);
    });
    return row;
  });
}

// ─── Reducer calls (writes) ────────────────────────────────────────────────────

interface AlgType {
  tag: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
}

function coerceArg(type: AlgType, raw: unknown): unknown {
  switch (type.tag) {
    case "Product": {
      const els: Array<{ name: string; algebraicType: AlgType }> = type.value?.elements ?? [];
      if (els.length === 1) {
        const n = els[0].name;
        if (n === "__identity__") {
          if (raw instanceof Identity) return raw;
          return Identity.fromString(String(raw).replace(/^0x/, ""));
        }
        if (n === "__timestamp_micros_since_unix_epoch__") {
          if (raw instanceof Timestamp) return raw;
          const ms = typeof raw === "number" ? raw : Date.parse(String(raw));
          if (!Number.isFinite(ms)) throw new Error(`Invalid timestamp: ${String(raw)}`);
          return Timestamp.fromDate(new Date(ms));
        }
        if (n === "__uuid__") {
          if (raw instanceof Uuid) return raw;
          return Uuid.parse(String(raw));
        }
      }
      const src = (raw ?? {}) as Record<string, unknown>;
      const obj: Record<string, unknown> = {};
      for (const el of els) obj[el.name] = coerceArg(el.algebraicType, src[el.name]);
      return obj;
    }
    case "Sum": {
      const variants: Array<{ name: string; algebraicType: AlgType }> = type.value?.variants ?? [];
      const some = variants.find((v) => v.name === "some");
      if (some && variants.some((v) => v.name === "none")) {
        if (raw === null || raw === undefined) return undefined;
        return coerceArg(some.algebraicType, raw);
      }
      return raw;
    }
    case "Array":
      return (Array.isArray(raw) ? raw : []).map((v) => coerceArg(type.value, v));
    case "U64":
    case "I64":
    case "U128":
    case "I128":
    case "U256":
    case "I256":
      return BigInt(raw as string | number);
    case "F32":
    case "F64":
    case "U8":
    case "U16":
    case "U32":
    case "I8":
    case "I16":
    case "I32": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Expected a number, got ${String(raw)}`);
      return n;
    }
    case "Bool":
      return raw === true || raw === "true";
    case "String":
      return raw == null ? "" : String(raw);
    default:
      return raw;
  }
}

interface ReducerSchema {
  name: string;
  accessorName: string;
  paramsType: { elements: Array<{ name: string; algebraicType: AlgType }> };
}

/** All reducer accessor names (camelCase) with their parameter shapes. */
export function listReducers(): Array<{ name: string; params: Array<{ name: string; type: string }> }> {
  const map = reducerSchemas as unknown as Record<string, ReducerSchema>;
  return Object.values(map)
    .map((r) => ({
      name: r.accessorName,
      params: r.paramsType.elements.map((el) => ({ name: el.name, type: describeType(el.algebraicType) })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function describeType(type: AlgType): string {
  switch (type.tag) {
    case "Product": {
      const els: Array<{ name: string; algebraicType: AlgType }> = type.value?.elements ?? [];
      if (els.length === 1) {
        if (els[0].name === "__identity__") return "identity";
        if (els[0].name === "__timestamp_micros_since_unix_epoch__") return "timestamp";
        if (els[0].name === "__uuid__") return "uuid";
      }
      return `{${els.map((e) => `${e.name}: ${describeType(e.algebraicType)}`).join(", ")}}`;
    }
    case "Sum": {
      const variants: Array<{ name: string; algebraicType: AlgType }> = type.value?.variants ?? [];
      const some = variants.find((v) => v.name === "some");
      if (some && variants.some((v) => v.name === "none")) return `${describeType(some.algebraicType)}?`;
      return variants.map((v) => v.name).join(" | ");
    }
    case "Array":
      return `${describeType(type.value)}[]`;
    case "F32":
    case "F64":
    case "U8":
    case "U16":
    case "U32":
    case "I8":
    case "I16":
    case "I32":
    case "U64":
    case "I64":
      return "number";
    case "Bool":
      return "boolean";
    case "String":
      return "string";
    default:
      return type.tag.toLowerCase();
  }
}

/**
 * Call a reducer (camelCase accessor name, e.g. "updateMemberPermissions") as
 * the service identity. Resolves when the transaction commits; rejects with the
 * reducer's error message when it throws. The notification delivery claim /
 * finish reducers are refused (lib/notifications/server/admin-sql.ts).
 */
export async function adminCall(reducer: string, args: Record<string, unknown> = {}): Promise<void> {
  const refusal = notifyAdminCallRefusal(reducer);
  if (refusal) throw new Error(refusal);
  const schema = (reducerSchemas as unknown as Record<string, ReducerSchema>)[reducer];
  if (!schema) throw new Error(`Unknown reducer: ${reducer}`);
  const coerced = coerceArg({ tag: "Product", value: schema.paramsType }, args) as Record<string, unknown>;

  const conn = await getServiceConn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (conn.reducers as any)[reducer];
  if (typeof fn !== "function") throw new Error(`Reducer not available on connection: ${reducer}`);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Reducer ${reducer} timed out after 20s`)), 20_000);
  });
  try {
    await Promise.race([fn(coerced) as Promise<void>, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
