/**
 * The store Mr. Merchiva's scenario eval (merchiva-scenarios.ts) runs against: the user's own
 * setup at the time of the "给我排一下班" report — one owner member (Muheng Fan) with no
 * availability and no punch-in code, one placeholder staff member without a login, no job roles,
 * opening hours set, a few weeks of shifts, a little sales and inventory data.
 *
 * A second store, COFFEE_ORG, is the same shop at the time of the "岗位的id是有问题的" report: its
 * one job role, "Staff", with no tasks yet.
 *
 * Nothing here reaches a real database. `installFakeStore` replaces the global fetch: requests to
 * SpacetimeDB's HTTP SQL endpoint are answered from these rows, encoded exactly as the endpoint
 * encodes them (scripts/tests/merchiva-tools/sql-fixtures.ts), so the read tools run their real
 * source and decoder; requests to OpenRouter pass through; anything else is refused. WebSocket is
 * refused too, so no SpacetimeDB client can connect.
 *
 * Dates are relative to the machine's calendar day, so the scenarios hold on any day.
 */

import { toCamelCase } from "spacetimedb";
import { todayKey } from "@/lib/date-key";
import { addDaysToKey, mondayKeyOf, weekdayOfKey } from "@/lib/merchiva/tools/store-time";
import type { SqlElement, SqlType } from "@/lib/merchiva/tools/sql-rows";
import { TOOL_TABLES, type ToolTable } from "@/lib/merchiva/tools/tool-tables";
import {
  SCHEMAS,
  sdkIdentity,
  sdkTimestamp,
  sdkUuid,
  sqlResponseText,
  tableForSql,
} from "@/scripts/tests/merchiva-tools/sql-fixtures";

type FixtureRow = Record<string, unknown>;

export const ORG = "0199a001-0000-7000-8000-00000000f00d";
/** The caller's token the tools send; the fake endpoint only answers it. */
export const TOKEN = "eval-caller-token";
export const TIME_ZONE = "America/Los_Angeles";
export const STORE_NAME = "Fan's Coffee";

export const TODAY = todayKey();
export const THIS_MONDAY = mondayKeyOf(TODAY);
export const LAST_MONDAY = addDaysToKey(THIS_MONDAY, -7);
/** The Monday the scheduling engine (and the schedule page's "next week") starts on. */
export const NEXT_MONDAY = addDaysToKey(TODAY, weekdayOfKey(TODAY) === 0 ? 1 : 8 - weekdayOfKey(TODAY));

const MADE = sdkTimestamp(Date.parse(`${addDaysToKey(TODAY, -120)}T09:00:00Z`));

// ── People ──────────────────────────────────────────────────────────────────

export const OWNER = { id: sdkUuid(1).toString(), name: "Muheng Fan" };
export const PLACEHOLDER = { id: sdkUuid(2).toString(), name: "Alex Chen", role: "Staff" };

// ── Inventory ───────────────────────────────────────────────────────────────

interface ItemSpec {
  n: number;
  name: string;
  category: string;
  stock: number;
  min: number;
  max: number;
  unit: string;
  supplier: string;
  costCents: number;
  retailCents?: number;
}

const ITEMS: ItemSpec[] = [
  { n: 40, name: "Whole Milk", category: "Dairy", stock: 3, min: 10, max: 40, unit: "L", supplier: "Dairy Co", costCents: 125 },
  { n: 41, name: "Oat Milk", category: "Dairy", stock: 8, min: 6, max: 24, unit: "L", supplier: "Dairy Co", costCents: 310 },
  { n: 42, name: "Espresso Beans", category: "Coffee", stock: 12, min: 5, max: 30, unit: "kg", supplier: "Bean Bros", costCents: 1850 },
  { n: 43, name: "Paper Cups 12oz", category: "Packaging", stock: 450, min: 200, max: 1000, unit: "pcs", supplier: "Bean Bros", costCents: 9 },
  { n: 44, name: "Latte", category: "Drinks", stock: 100, min: 0, max: 0, unit: "cup", supplier: "", costCents: 90, retailCents: 450 },
];

/** The item the inventory scenario has open. */
export const OPEN_ITEM = { id: sdkUuid(41).toString(), name: "Oat Milk", stock: 8, unit: "L" };

// ── Sales: 35 days of daily records, with cents so totals match exactly ─────

const WEEKDAY_BASE_CENTS = [82_040, 54_015, 56_230, 60_110, 64_375, 90_220, 110_480];

export const DAILY_SALES_CENTS: ReadonlyArray<{ date: string; cents: number }> = Array.from({ length: 35 }, (_, i) => {
  const date = addDaysToKey(TODAY, -(i + 1));
  return { date, cents: WEEKDAY_BASE_CENTS[weekdayOfKey(date)] + (i % 4) * 1_250 };
}).reverse();

/** Sales in cents over `from..to` (both included). */
export function salesCentsBetween(from: string, to: string): number {
  return DAILY_SALES_CENTS.filter((d) => d.date >= from && d.date <= to).reduce((sum, d) => sum + d.cents, 0);
}

// ── Row completion: every published column gets a value ─────────────────────

let spareUuid = 5_000;

function defaultFor(type: SqlType): unknown {
  const kind = Object.keys(type)[0];
  if (kind === "Sum") return undefined;
  if (kind === "String") return "";
  if (kind === "Bool") return false;
  if (kind === "I64" || kind === "U64") return 0n;
  if (kind === "Product") {
    const elements = (type.Product as { elements?: SqlElement[] }).elements ?? [];
    const special = elements[0]?.name?.some;
    if (special === "__uuid__") return sdkUuid(spareUuid++);
    if (special === "__identity__") return sdkIdentity(999);
    return MADE;
  }
  return 0;
}

function row(table: ToolTable, values: FixtureRow): FixtureRow {
  const out: FixtureRow = {};
  for (const el of SCHEMAS[table]) {
    const key = toCamelCase(el.name?.some ?? "");
    out[key] = key in values ? values[key] : defaultFor(el.algebraic_type);
  }
  return out;
}

// ── Shifts: last week and this week ─────────────────────────────────────────

interface ShiftSpec {
  n: number;
  date: string;
  who: "owner" | "placeholder";
  start: string;
  end: string;
  type: string;
}

const SHIFTS: ShiftSpec[] = [
  // Muheng Fan, Monday to Saturday of last week and of this week.
  ...[0, 1, 2, 3, 4, 5].map((d) => ({ n: 20 + d, date: addDaysToKey(LAST_MONDAY, d), who: "owner" as const, start: "09:00", end: "17:00", type: "morning" })),
  ...[0, 1, 2, 3, 4, 5].map((d) => ({ n: 30 + d, date: addDaysToKey(THIS_MONDAY, d), who: "owner" as const, start: "09:00", end: "17:00", type: "morning" })),
  // Alex Chen (no login), this Saturday and Sunday.
  { n: 36, date: addDaysToKey(THIS_MONDAY, 5), who: "placeholder", start: "12:00", end: "20:00", type: "afternoon" },
  { n: 37, date: addDaysToKey(THIS_MONDAY, 6), who: "placeholder", start: "12:00", end: "20:00", type: "afternoon" },
];

/** Shifts dated inside `from..to`, for the checks. */
export function shiftsBetween(from: string, to: string): ReadonlyArray<{ date: string; name: string }> {
  return SHIFTS.filter((s) => s.date >= from && s.date <= to).map((s) => ({
    date: s.date,
    name: s.who === "owner" ? OWNER.name : PLACEHOLDER.name,
  }));
}

export const OPENING_HOURS = {
  mon: { open: "08:00", close: "18:00" },
  tue: { open: "08:00", close: "18:00" },
  wed: { open: "08:00", close: "18:00" },
  thu: { open: "08:00", close: "18:00" },
  fri: { open: "08:00", close: "18:00" },
  sat: { open: "10:00", close: "18:00" },
  sun: { open: "10:00", close: "18:00" },
};

// ── The tables ──────────────────────────────────────────────────────────────

const DATA: Partial<Record<ToolTable, FixtureRow[]>> = {
  orgMember: [
    row("orgMember", {
      id: sdkUuid(1), organizationId: ORG, userId: sdkIdentity(1), role: "owner", displayName: OWNER.name,
      email: "owner@example.com", permissions: "{}", status: "active", joinedAt: MADE, hasPunchCode: false,
    }),
  ],
  staffMember: [
    row("staffMember", {
      id: sdkUuid(2), organizationId: ORG, name: PLACEHOLDER.name, role: PLACEHOLDER.role, hourlyRate: 18,
      availability: "{}", createdAt: MADE, updatedAt: MADE, hourlyRateCents: 1800n,
    }),
  ],
  shift: SHIFTS.map((s) =>
    row("shift", {
      id: sdkUuid(s.n), organizationId: ORG, memberId: s.who === "owner" ? OWNER.id : undefined,
      staffName: s.who === "owner" ? OWNER.name : PLACEHOLDER.name, staffRoles: "[]", date: s.date,
      shiftType: s.type, startTime: s.start, endTime: s.end, predictedDemand: "medium", createdAt: MADE,
    }),
  ),
  inventoryItem: ITEMS.map((i) =>
    row("inventoryItem", {
      id: sdkUuid(i.n), organizationId: ORG, name: i.name, category: i.category, currentStock: i.stock,
      minStock: i.min, maxStock: i.max, unit: i.unit, costPerUnit: i.costCents / 100, supplier: i.supplier,
      lastRestocked: addDaysToKey(TODAY, -6), createdAt: MADE, updatedAt: MADE, costPerUnitCents: BigInt(i.costCents),
      ...(i.retailCents
        ? { retailEnabled: true, retailPrice: i.retailCents / 100, retailPriceCents: BigInt(i.retailCents) }
        : {}),
    }),
  ),
  supplier: [
    row("supplier", { id: sdkUuid(50), organizationId: ORG, name: "Dairy Co", contactName: "Dee", email: "orders@dairy.example", rating: 4, createdAt: MADE, language: "en" }),
    row("supplier", { id: sdkUuid(51), organizationId: ORG, name: "Bean Bros", contactName: "Ben", email: "sales@beans.example", rating: 5, createdAt: MADE, language: "en" }),
  ],
  salesRecord: DAILY_SALES_CENTS.map((d, i) =>
    row("salesRecord", { id: sdkUuid(100 + i), organizationId: ORG, date: d.date, actual: d.cents / 100, isHoliday: false, squareOrderIds: "[]", createdAt: MADE }),
  ),
  settings: [
    row("settings", { organizationId: ORG, paymentCurrency: "USD", openingHours: JSON.stringify(OPENING_HOURS), timezone: TIME_ZONE }),
  ],
  expense: [
    row("expense", { id: sdkUuid(60), organizationId: ORG, category: "Rent", description: "Shop rent", amount: 2400, date: `${TODAY.slice(0, 8)}01`, recurring: true, recurringPeriod: "Monthly", createdAt: MADE, amountCents: 240_000n }),
  ],
  inventoryTransaction: Array.from({ length: 14 }, (_, i) =>
    row("inventoryTransaction", {
      id: sdkUuid(200 + i), organizationId: ORG, itemId: sdkUuid(40).toString(), itemName: "Whole Milk", type: "out",
      quantity: 3, note: "", date: addDaysToKey(TODAY, -(i + 1)), createdAt: MADE,
    }),
  ),
};

/** Every id an action block may carry, per parameter name. */
export const FIXTURE_IDS: Readonly<Record<string, readonly string[]>> = {
  memberId: [OWNER.id],
  staffMemberId: [PLACEHOLDER.id],
  shiftId: SHIFTS.map((s) => sdkUuid(s.n).toString()),
  itemId: ITEMS.map((i) => sdkUuid(i.n).toString()),
  inventoryItemId: ITEMS.map((i) => sdkUuid(i.n).toString()),
  productId: ITEMS.filter((i) => i.retailCents).map((i) => sdkUuid(i.n).toString()),
  supplierId: [sdkUuid(50).toString(), sdkUuid(51).toString()],
  // No roles, tasks, training, time off or trades exist in this store.
  roleId: [],
  taskId: [],
  dayId: [],
  objectiveId: [],
  requestId: [],
  tradeId: [],
};

/**
 * The `context` the dashboard sends with a message (merchiva-chat-dashboard.tsx storeContext),
 * for this store. With tools on only the slim overview of it reaches the prompt.
 */
export function storeContext(upcomingHolidays: unknown[]): Record<string, unknown> {
  return {
    storeName: STORE_NAME,
    today: TODAY,
    timeZone: TIME_ZONE,
    openingHours: OPENING_HOURS,
    hoursStatus: "set",
    countryCode: "US",
    upcomingHolidays,
    inventory: ITEMS.map((i) => ({ id: sdkUuid(i.n).toString(), name: i.name, category: i.category, stock: i.stock, min: i.min, max: i.max, unit: i.unit, supplier: i.supplier })),
    suppliers: [
      { id: sdkUuid(50).toString(), name: "Dairy Co", language: "en" },
      { id: sdkUuid(51).toString(), name: "Bean Bros", language: "en" },
    ],
    todayShifts: shiftsBetween(TODAY, TODAY),
    upcomingShifts: [],
    team: [{ id: OWNER.id, name: OWNER.name, hasPunchInCode: false }],
    recentSales: DAILY_SALES_CENTS.slice(-7).map((d) => ({ date: d.date, revenue: d.cents / 100 })),
    todaySales: [],
    products: ITEMS.filter((i) => i.retailCents).map((i) => ({ id: sdkUuid(i.n).toString(), name: i.name, price: (i.retailCents ?? 0) / 100, category: i.category })),
    unreadNotifications: 0,
    insights: [],
    roles: [],
    shiftPresets: [],
    availability: [],
    timeOffRequests: [],
    shiftTrades: [],
  };
}

// ── The coffee shop of the "岗位的id是有问题的" report ─────────────────────

export const COFFEE_ORG = "0199a001-0000-7000-8000-00000000c0ff";

/**
 * Its only job role. `id` is hyphenated, the form a staff_role id reaches the model in (viewRoles)
 * and the form role_task.roleId stores; `uuid` is the SDK value the client cache holds.
 */
export const STAFF_ROLE = {
  uuid: sdkUuid(70),
  id: sdkUuid(70).toString(),
  name: "Staff",
  color: "#44403c",
  icon: "user",
  description: "General shift work",
} as const;

/** The same shop's rows under COFFEE_ORG, plus the Staff role; no role has a task yet. */
const COFFEE_DATA: Partial<Record<ToolTable, FixtureRow[]>> = {
  ...Object.fromEntries(
    Object.entries(DATA).map(([table, rows]) => [table, (rows ?? []).map((r) => ({ ...r, organizationId: COFFEE_ORG }))]),
  ),
  staffRole: [
    row("staffRole", {
      id: STAFF_ROLE.uuid, organizationId: COFFEE_ORG, name: STAFF_ROLE.name, color: STAFF_ROLE.color, icon: STAFF_ROLE.icon,
      description: STAFF_ROLE.description, permissions: "[]", createdAt: MADE, updatedAt: MADE,
    }),
  ],
  roleTask: [],
};

export const COFFEE_IDS: Readonly<Record<string, readonly string[]>> = { ...FIXTURE_IDS, roleId: [STAFF_ROLE.id] };

/** storeContext for the coffee shop: its roles[] as the dashboard sends them. */
export function coffeeStoreContext(upcomingHolidays: unknown[]): Record<string, unknown> {
  return {
    ...storeContext(upcomingHolidays),
    roles: [
      { id: STAFF_ROLE.id, name: STAFF_ROLE.name, color: STAFF_ROLE.color, icon: STAFF_ROLE.icon, description: STAFF_ROLE.description, tasks: [] },
    ],
  };
}

const STORES: ReadonlyMap<string, Partial<Record<ToolTable, FixtureRow[]>>> = new Map([
  [ORG, DATA],
  [COFFEE_ORG, COFFEE_DATA],
]);

// ── The fake network ────────────────────────────────────────────────────────

export interface FakeStoreLog {
  /** Every SQL query the tools ran. */
  sql: string[];
  /** Requests refused because they were neither the fake SQL endpoint nor OpenRouter. */
  blocked: string[];
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

/** Routes the SQL endpoint to the fixture, OpenRouter to the network, and refuses the rest. */
export function installFakeStore(): FakeStoreLog {
  const log: FakeStoreLog = { sql: [], blocked: [] };
  const realFetch = globalThis.fetch.bind(globalThis);

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (/^\/v1\/database\/[^/]+\/sql$/.test(url.pathname)) {
      const sql = String(init?.body ?? "");
      log.sql.push(sql);
      if (new Headers(init?.headers).get("authorization") !== `Bearer ${TOKEN}`) return new Response("", { status: 401 });
      const m = /^SELECT (.+) FROM (\w+) WHERE (\w+) = '([^']+)'/.exec(sql);
      const table = m ? tableForSql(m[2]) : undefined;
      const store = m ? STORES.get(m[4]) : undefined;
      if (!m || !table || !store) return new Response(`eval: unexpected query ${sql}`, { status: 400 });
      const columns = m[1] === "*" ? undefined : m[1].split(", ");
      return new Response(sqlResponseText(table, store[table] ?? [], columns));
    }
    if (url.hostname === "openrouter.ai") return realFetch(input, init);
    log.blocked.push(url.origin);
    throw new Error(`eval: refused a request to ${url.origin}`);
  };
  globalThis.fetch = Object.assign(fakeFetch, { preconnect: () => {} }) as typeof fetch;

  class RefusedWebSocket {
    constructor(target: string | URL) {
      log.blocked.push(String(target));
      throw new Error("eval: WebSocket connections are refused");
    }
  }
  globalThis.WebSocket = RefusedWebSocket as unknown as typeof WebSocket;
  return log;
}

/** The published table names the fixture serves (for the run header). */
export function servedTables(): string[] {
  const tables = new Set([...STORES.values()].flatMap((data) => Object.keys(data) as ToolTable[]));
  return [...tables].map((t) => TOOL_TABLES[t].sql);
}
