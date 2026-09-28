/**
 * The tables Mr. Merchiva's read tools read, and the query each one is loaded
 * with. Pure.
 *
 * Every query names one store, and the append-only history tables keep the
 * window the app's own subscription keeps (`orgSubscriptions` in
 * lib/spacetimedb/provider.tsx), so a tool sees what the page it mirrors sees
 * and a request never pulls a store's whole history. The queries run as the
 * calling member (sql-source.ts), so row-level security still decides which
 * rows come back; the WHERE only narrows them to the store being asked about.
 *
 * SpacetimeDB SQL has no parameter binding. The only values interpolated are
 * the organization id, refused unless it is a uuid, and a date computed from a
 * validated `YYYY-MM-DD` day.
 */

import { RESTOCK_HISTORY_DAYS } from "@/lib/merchiva/tools/view-restock-suggestions";
import { addDaysToKey, isDateKey } from "@/lib/merchiva/tools/store-time";

/**
 * Days of sales records loaded: `SALES_WINDOW_DAYS` in lib/spacetimedb/provider.tsx,
 * the history the Sales page, its forecast and the Finances page work from.
 * A test fails if the two drift apart.
 */
export const SALES_HISTORY_DAYS = 400;

interface TableSpec {
  /** Published (snake_case) table name. */
  sql: string;
  /** The plain-string org column; default `organization_id`. */
  orgColumn?: string;
  /** Only rows with `date >= today - windowDays` (`date` is a `YYYY-MM-DD` string column). */
  windowDays?: number;
  /** Only these columns (published names); default every column. */
  columns?: readonly string[];
}

/** Keyed by the SDK accessor name, which is what the tools pass to `orgRows`. */
export const TOOL_TABLES = {
  orgMember: { sql: "org_member" },
  staffMember: { sql: "staff_member" },
  staffRole: { sql: "staff_role" },
  // `role_task.organization_id` is an option column, and SpacetimeDB SQL cannot
  // compare one at all; `org_id` is its plain-string mirror, which the table's
  // RLS rule and the client's subscription use too.
  roleTask: { sql: "role_task", orgColumn: "org_id" },
  shift: { sql: "shift" },
  shiftPreset: { sql: "shift_preset" },
  staffAvailability: { sql: "staff_availability" },
  timeOffRequest: { sql: "time_off_request" },
  shiftTrade: { sql: "shift_trade" },
  inventoryItem: { sql: "inventory_item" },
  supplier: { sql: "supplier" },
  salesRecord: { sql: "sales_record", windowDays: SALES_HISTORY_DAYS },
  // The tools read two settings; the row also holds the store's POS
  // credentials, which have no business in a model's tool loop.
  settings: { sql: "settings", columns: ["organization_id", "payment_currency", "opening_hours"] },
  payment: { sql: "payment" },
  expense: { sql: "expense" },
  punchEvent: { sql: "punch_event" },
  inventoryTransaction: { sql: "inventory_transaction", windowDays: RESTOCK_HISTORY_DAYS },
  trainingDay: { sql: "training_day" },
  trainingObjective: { sql: "training_objective" },
} as const satisfies Record<string, TableSpec>;

export type ToolTable = keyof typeof TOOL_TABLES;

export const TOOL_TABLE_NAMES = Object.keys(TOOL_TABLES) as ToolTable[];

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** A hyphenated uuid — the form every `organization_id` column stores. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * The query that loads `table` for one store on the store's day `today`.
 * Throws for an organization id that is not a uuid, or a day that is not a
 * real `YYYY-MM-DD`, rather than let either reach the SQL text.
 */
export function toolTableQuery(table: ToolTable, organizationId: string, today: string): string {
  if (!isUuid(organizationId)) throw new Error("organizationId is not a uuid");
  const spec: TableSpec = TOOL_TABLES[table];
  const where = [`${spec.orgColumn ?? "organization_id"} = '${organizationId}'`];
  if (spec.windowDays) {
    if (!isDateKey(today)) throw new Error("today is not a YYYY-MM-DD day");
    where.push(`date >= '${addDaysToKey(today, -spec.windowDays)}'`);
  }
  return `SELECT ${spec.columns?.join(", ") ?? "*"} FROM ${spec.sql} WHERE ${where.join(" AND ")}`;
}
