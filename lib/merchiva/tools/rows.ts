/**
 * Row access shared by Mr. Merchiva's read tools.
 *
 * Pure: a tool body receives the rows it reads as an argument instead of
 * loading them, so the engine tools and their tests use the same code. The
 * rows are loaded as the calling member by lib/merchiva/tools/sql-source.ts
 * (server-only), decoded into the SDK's row shapes (sql-rows.ts).
 */

import type { Shift } from "@/lib/types";
import type { ToolTable } from "@/lib/merchiva/tools/tool-tables";

// SpacetimeDB rows arrive in the SDK's row shapes; the tools read a few
// columns from many tables, so they are handled untyped at this edge only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = any;

/** The rows one tool call reads, in the shape of an SDK connection's cache: `db.<table>.iter()`. */
export interface ToolData {
  db: Partial<Record<ToolTable, { iter(): Iterable<Row> }>>;
}

/**
 * Wraps a tool executor: loads the org's rows of `tables` for it, logs, and
 * turns a failure into a result the model can recover from. Built in tools.ts.
 * `tables` must name every table the body passes to `orgRows`.
 */
export type ToolExec = <A>(
  label: string,
  tables: readonly ToolTable[],
  fn: (data: ToolData, args: A) => Promise<unknown>,
) => (args: A) => Promise<unknown>;

/** What every tool builder receives from `buildMerchivaTools`. */
export interface ToolContext {
  organizationId: string;
  /** The store's calendar day, `YYYY-MM-DD` (see store-time.ts). */
  today: string;
  /** The store's IANA zone when the client sent one, else null. */
  timeZone: string | null;
  exec: ToolExec;
}

/**
 * A uuid in the hyphenated form the whole client uses: hooks map `id` with
 * `toString()`, reference columns (`shift.memberId`, `punch_event.memberId`,
 * `inventory_transaction.itemId`) hold that form, and client-side actions look
 * rows up by it (`String(r.id) === shiftId` in updateShift, `s.id.toString()`
 * in orderFromSupplier / updateSupplier). The module's reducers accept it too.
 */
export function uuidText(v: unknown): string {
  return v == null ? "" : String(v);
}

/**
 * Primary key as the model sees it and hands back in action blocks. It was
 * `toHexString()` (32 bare hex chars), which every reducer accepted but the
 * client-side lookups above did not — updateShift / orderFromSupplier with a
 * tool-provided id failed with "not found".
 */
export function rowId(r: Row): string {
  return uuidText(r?.id);
}

/** A stored uuid reference in hyphenated lowercase, whether it was written hyphenated or bare. */
export function canonicalUuid(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  const hex = s.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return s;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** An identity column decodes to an object with toHexString(); always return a string. */
export function idHex(u: unknown): string {
  const v = u as { toHexString?: () => string } | null | undefined;
  return typeof v?.toHexString === "function" ? v.toHexString() : String(u ?? "");
}

/** option<T> columns come back as the value, or undefined/null when unset. */
export function opt<T>(v: T | null | undefined): T | null {
  return v == null ? null : v;
}

export function jsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || !v.trim()) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** `shift.staffRoles` is a JSON string[]; a legacy bare name reads as one role (as in useStaffing). */
function parseStaffRoles(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [raw];
  } catch {
    return [raw];
  }
}

/** A `shift` row as the engines take it — the mapping lib/spacetimedb/hooks/useStaffing.ts uses. */
export function toShift(r: Row): Shift {
  return {
    id: uuidText(r?.id),
    memberId: r?.memberId ? String(r.memberId) : null,
    staffName: String(r?.staffName ?? ""),
    staffRole: r?.staffRole ? String(r.staffRole) : null,
    staffRoles: parseStaffRoles(r?.staffRoles),
    date: String(r?.date ?? ""),
    shiftType: String(r?.shiftType ?? "morning") as Shift["shiftType"],
    startTime: String(r?.startTime ?? ""),
    endTime: String(r?.endTime ?? ""),
    predictedDemand: String(r?.predictedDemand ?? "medium") as Shift["predictedDemand"],
  };
}

/** All rows of a table for one org. */
export function orgRows(data: ToolData, table: ToolTable, organizationId: string): Row[] {
  const t = data?.db?.[table];
  if (!t || typeof t.iter !== "function") return [];
  return [...t.iter()].filter((r: Row) => {
    const oid = r?.organizationId;
    // organizationId is sometimes an option<string> (e.g. role_task) → unwrap.
    const v = oid && typeof oid === "object" && "some" in oid ? oid.some : oid;
    return v === organizationId;
  });
}
