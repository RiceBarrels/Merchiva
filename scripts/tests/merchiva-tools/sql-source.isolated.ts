// Isolated fixture for scripts/tests/merchiva-tools/sql-source.test.ts — NOT auto-discovered by
// `bun test` (no .test. in the name). It stubs "server-only" with mock.module and replaces the
// global fetch with a fake SpacetimeDB SQL endpoint, which would leak into other test files
// sharing a process, so it runs in its own.
//
// It drives Mr. Merchiva's read tools end to end — buildMerchivaTools → the per-request SQL
// source → HTTP-SQL JSON → the SDK-shaped decoder → each tool — and checks:
//   * every tool reads as the caller (their token, their store) and gets the same output it
//     gets from the same rows handed over as SDK rows;
//   * a table loads once per request, concurrent calls share the load in flight, a failed load
//     is retried by the next call;
//   * a rejected token or failed query is a tool error, never a throw, and never logs the token;
//   * an organization id that is not a uuid never reaches the SQL.

import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { buildMerchivaTools, merchivaToolsEnabled } = await import("@/lib/merchiva/tools");
const { createSqlToolSource } = await import("@/lib/merchiva/tools/sql-source");
const { MERCHIVA_TOOL_NAMES } = await import("@/lib/merchiva/tools/names");
const { viewFinanceTool } = await import("@/lib/merchiva/tools/view-finance");
const { viewForecastTool } = await import("@/lib/merchiva/tools/view-forecast");
const { viewRestockSuggestionsTool } = await import("@/lib/merchiva/tools/view-restock-suggestions");
const { proposeScheduleTool } = await import("@/lib/merchiva/tools/propose-schedule");
const { addDaysToKey } = await import("@/lib/merchiva/tools/store-time");
const { ID_SOURCES } = await import("@/lib/merchiva/tools/id-sources");
const { CALL, fakeConn, fakeCtx } = await import("./fixtures");
const { sdkIdentity, sdkTimestamp, sdkUuid, sqlResponseText, tableForSql } = await import("./sql-fixtures");

type Rows = Record<string, unknown>[];
type ToolOut = Record<string, unknown>;
type Runnable = { execute?: (args: unknown, options: typeof CALL) => unknown };

const ORG = "0199a001-0000-7000-8000-000000000001";
const TOKEN = "caller-token-7f3a9c";
const TODAY = "2026-09-27";
const at = (key: string, hour: number) => sdkTimestamp(Date.parse(`${key}T${String(hour).padStart(2, "0")}:00:00Z`));
const made = at("2026-01-05", 9);

// ── One store, as SDK rows ──────────────────────────────────────────────────

const ann = sdkUuid(1);
const bo = sdkUuid(2);
const barista = sdkUuid(10);
const milk = sdkUuid(40);
const clockIn = sdkUuid(70);
const dayOne = sdkUuid(80);

const member = (id: typeof ann, n: number, displayName: string, role: string, rateCents?: bigint) => ({
  id, organizationId: ORG, userId: sdkIdentity(n), role, displayName, email: `${n}@example.com`, permissions: "{}",
  status: "active", joinedAt: made, punchInCode: rateCents ? "1234" : undefined,
  hourlyRate: rateCents ? Number(rateCents) / 100 : undefined, hourlyRateCents: rateCents, hasPunchCode: !!rateCents,
});
const shift = (n: number, date: string) => ({
  id: sdkUuid(n), organizationId: ORG, memberId: ann.toString(), staffName: "Ann Lee", staffRole: "Barista",
  staffRoles: '["Barista"]', date, shiftType: "morning", startTime: "07:00", endTime: "14:00", predictedDemand: "medium", createdAt: made,
});
const availability = (n: number, who: number) => ({
  id: sdkUuid(n), userId: sdkIdentity(who), organizationId: ORG, type: "permanent", startDate: undefined, endDate: undefined,
  days: "[true,true,true,true,true,true,true]", dayTimes: "[]", status: "available", fullDay: true,
  startTime: undefined, endTime: undefined, comments: "", createdAt: made,
});
const item = (id: typeof milk, name: string, stock: number, extra: Record<string, unknown>) => ({
  id, organizationId: ORG, name, category: "Dairy", currentStock: stock, minStock: 10, maxStock: 60, unit: "L",
  costPerUnit: 1.25, supplier: "Dairy Co", lastRestocked: "2026-09-01", lossRate: 0, squareItemId: undefined,
  createdAt: made, updatedAt: made, minOrderQty: 6, unitsPerCase: 6, description: undefined, unitContentAmount: undefined,
  unitContentUnit: undefined, retailEnabled: undefined, retailPrice: undefined, retailDescription: undefined,
  retailImageUrl: undefined, retailUsageQty: undefined, expirationDate: undefined, expirationBatches: undefined,
  costPerUnitCents: 125n, retailPriceCents: undefined, ...extra,
});

const DATA: Record<string, Rows> = {
  orgMember: [member(ann, 1, "Ann Lee", "owner", 2000n), member(bo, 2, "Bo Chen", "staff")],
  staffMember: [{ id: sdkUuid(3), organizationId: ORG, name: "Cy Temp", role: "Cashier", hourlyRate: 15, availability: "{}", createdAt: made, updatedAt: made, hourlyRateCents: 1500n }],
  staffRole: [{ id: barista, organizationId: ORG, name: "Barista", color: "#000", icon: "coffee", description: "", permissions: "{}", createdAt: made, updatedAt: made }],
  roleTask: [{
    id: sdkUuid(11), roleId: barista.toString(), organizationId: ORG, title: "Open the machine", description: "", startTime: "07:00",
    endTime: undefined, sortOrder: 0, requiresEvidence: true, notifyChats: "[]", createdAt: made, orgId: ORG,
  }],
  shift: [shift(20, "2026-09-25"), shift(21, "2026-09-28")],
  shiftPreset: [{ id: sdkUuid(30), organizationId: ORG, name: "morning", startTime: "07:00", endTime: "14:00", color: "#fff", sortOrder: 0, createdAt: made }],
  staffAvailability: [availability(31, 1), availability(32, 2)],
  timeOffRequest: [{
    id: sdkUuid(33), userId: sdkIdentity(2), organizationId: ORG, startDate: "2026-10-01", endDate: "2026-10-02", fullDays: true,
    startTime: undefined, endTime: undefined, comments: "", status: "pending", reviewedBy: undefined, reviewedAt: undefined, createdAt: made,
  }],
  shiftTrade: [{
    id: sdkUuid(34), organizationId: ORG, shiftId: sdkUuid(21).toString(), requesterId: ann.toString(), targetId: "", targetShiftId: undefined,
    type: "giveaway", status: "pending", managerApproved: false, managerId: undefined, comments: "", createdAt: made,
    broadcastToAll: true, acceptedById: undefined,
  }],
  inventoryItem: [item(milk, "Milk", 3, {}), item(sdkUuid(41), "Latte", 100, { category: "Drinks", minStock: 0, retailEnabled: true, retailPrice: 4.5, retailPriceCents: 450n })],
  supplier: [{
    id: sdkUuid(50), organizationId: ORG, name: "Dairy Co", contactName: "Dee", email: "dee@example.com", phone: undefined, address: undefined,
    paymentTerms: undefined, notes: undefined, rating: 4, createdAt: made, language: "zh",
  }],
  salesRecord: Array.from({ length: 10 }, (_, i) => ({
    id: sdkUuid(100 + i), organizationId: ORG, date: addDaysToKey(TODAY, -(i + 1)), hour: undefined, actual: 100 + i * 10, predicted: undefined,
    weather: undefined, footTraffic: undefined, isHoliday: false, squareOrderIds: "[]", createdAt: made,
  })),
  settings: [{ organizationId: ORG, paymentCurrency: "EUR", openingHours: undefined }],
  payment: [
    { amountCents: 1250n, status: "completed", createdAt: at("2026-09-25", 15), n: 60 },
    { amountCents: 800n, status: "refunded", createdAt: at("2026-09-26", 15), n: 61 },
  ].map(({ n, ...p }) => ({
    id: sdkUuid(n), organizationId: ORG, userId: undefined, orderId: undefined, amount: Number(p.amountCents) / 100, currency: "USD", method: "card",
    processorId: undefined, processorResponse: undefined, customerName: undefined, notes: undefined, items: undefined, taxAmount: 0,
    discountAmount: 0, refundAmount: undefined, refundReason: undefined, refundedAt: undefined, taxAmountCents: 0n,
    discountAmountCents: 0n, refundAmountCents: undefined, ...p,
  })),
  expense: [{
    id: sdkUuid(65), organizationId: ORG, category: "Rent", description: "Rent", amount: 1000, date: "2026-09-01", recurring: true,
    recurringPeriod: "Monthly", receiptUrl: undefined, notes: undefined, createdAt: made, amountCents: 100000n,
  }],
  punchEvent: [
    { id: clockIn, action: "in", at: at("2026-09-25", 7), pairEventId: undefined },
    { id: sdkUuid(71), action: "out", at: at("2026-09-25", 15), pairEventId: clockIn.toString() },
  ].map((p) => ({ organizationId: ORG, memberId: ann.toString(), pin: "0000", closed: true, createdAt: made, ...p })),
  inventoryTransaction: Array.from({ length: 14 }, (_, i) => ({
    id: sdkUuid(200 + i), organizationId: ORG, itemId: milk.toString(), itemName: "Milk", type: "out", quantity: 4, note: "",
    date: addDaysToKey(TODAY, -(i + 1)), createdAt: made, operatorMemberId: undefined, operatorName: undefined, evidenceUrls: undefined,
    expirationDate: undefined, batchExpirationDate: undefined,
  })),
  trainingDay: [{ id: dayOne, organizationId: ORG, dayNumber: 1, title: "Espresso", description: "<p>Grind</p>", sortOrder: 0, createdAt: made, updatedAt: made }],
  trainingObjective: [{
    id: sdkUuid(81), organizationId: ORG, dayId: dayOne.toString(), text: "<p>Pull a <b>double</b> shot</p>", mediaUrl: undefined,
    mediaType: undefined, sortOrder: 0, createdAt: made, updatedAt: made,
  }],
};

// ── The fake SQL endpoint ───────────────────────────────────────────────────

const requests: { url: string; auth: string | null; sql: string }[] = [];
let failWith: number | null = null;
let gate: Promise<void> | null = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const sql = String(init?.body ?? "");
  requests.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), sql });
  if (gate) await gate;
  if (failWith) return new Response(failWith === 401 ? "" : "internal error", { status: failWith });
  const m = /^SELECT (.+) FROM (\w+) WHERE /.exec(sql);
  const table = m ? tableForSql(m[2]) : undefined;
  if (!m || !table) return new Response(`no such table in: ${sql}`, { status: 400 });
  return new Response(sqlResponseText(table, DATA[table] ?? [], m[1] === "*" ? undefined : m[1].split(", ")));
}) as typeof fetch;

const tablesQueried = () => requests.map((r) => /FROM (\w+)/.exec(r.sql)?.[1]);

function toolsFor(allowed: readonly string[] = MERCHIVA_TOOL_NAMES, organizationId = ORG) {
  const set = buildMerchivaTools({ token: TOKEN, organizationId, allowed: allowed as typeof MERCHIVA_TOOL_NAMES, today: TODAY });
  return {
    names: Object.keys(set),
    run: async (name: string, args: unknown = {}) => (await (set[name] as Runnable).execute!(args, CALL)) as ToolOut,
  };
}

beforeEach(() => {
  requests.length = 0;
  failWith = null;
  gate = null;
});

// ── Reading as the caller ───────────────────────────────────────────────────

describe("the tools read as the calling member", () => {
  test("every query carries the caller's token and names their store", async () => {
    const { run } = toolsFor();
    for (const name of MERCHIVA_TOOL_NAMES) expect((await run(name)).error, name).toBeUndefined();
    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) {
      expect(r.auth).toBe(`Bearer ${TOKEN}`);
      expect(r.url).toEndWith("/sql");
      expect(r.sql).toMatch(new RegExp(`WHERE (organization_id|org_id) = '${ORG}'`));
    }
  });

  test("tools need only the caller's token — not the service token", () => {
    delete process.env.SPACETIMEDB_SERVICE_TOKEN;
    expect(merchivaToolsEnabled(TOKEN)).toBe(true);
    expect(merchivaToolsEnabled("")).toBe(false);
    expect(merchivaToolsEnabled(null)).toBe(false);
  });

  test("only the permitted tools are built", () => {
    expect(toolsFor(["viewSales", "viewFinance"]).names.sort()).toEqual(["viewFinance", "viewSales"]);
  });

  test("history comes in the app's windows (400 days of sales, 120 of stock movements); settings without credentials", async () => {
    const { run } = toolsFor();
    await run("viewSales");
    await run("viewRestockSuggestions");
    await run("viewFinance");
    const sql = requests.map((r) => r.sql);
    expect(sql).toContain(`SELECT * FROM sales_record WHERE organization_id = '${ORG}' AND date >= '2025-08-23'`);
    expect(sql).toContain(`SELECT * FROM inventory_transaction WHERE organization_id = '${ORG}' AND date >= '2026-05-30'`);
    expect(sql).toContain(`SELECT organization_id, payment_currency, opening_hours FROM settings WHERE organization_id = '${ORG}'`);
  });
});

// ── Output: identical to the same rows as SDK rows ──────────────────────────

describe("each tool, end to end", () => {
  const conn = fakeConn(DATA);
  const sdkCtx = () => fakeCtx(conn, TODAY, null, ORG);

  test.each([
    ["viewFinance", viewFinanceTool, { period: "this_month" }],
    ["viewForecast", viewForecastTool, { days: 3 }],
    ["viewRestockSuggestions", viewRestockSuggestionsTool, {}],
    ["proposeSchedule", proposeScheduleTool, { weekStart: "2026-09-28", days: 2 }],
  ] as const)("%s gives the same result as from subscription rows", async (name, build, args) => {
    const viaSql = await toolsFor().run(name, args);
    const viaSdk = (await (build(sdkCtx()) as Runnable).execute!(args, CALL)) as ToolOut;
    expect(viaSql.error).toBeUndefined();
    expect(viaSql).toEqual(viaSdk);
  });

  test("the engine results carry the store's numbers", async () => {
    const { run } = toolsFor();
    const finance = await run("viewFinance", { period: "this_month" });
    expect(finance).toMatchObject({ currency: "EUR", revenue: 12.5, expenses: 1000, netProfit: -987.5 });
    expect((finance.labor as { hours: number; cost: number })).toMatchObject({ hours: 8, cost: 160 });
    const restock = (await run("viewRestockSuggestions")) as { suggestions: { itemId: string; name: string; unitCost: number }[]; bySupplier: { supplierId: string }[] };
    expect(restock.suggestions.map((s) => [s.itemId, s.name, s.unitCost])).toEqual([[milk.toString(), "Milk", 1.25]]);
    expect(restock.bySupplier[0].supplierId).toBe(sdkUuid(50).toString());
    const forecast = await run("viewForecast", { days: 3 });
    expect(forecast.notEnoughData).toBeUndefined();
    expect((forecast.days as unknown[]).length).toBe(3);
    const schedule = (await run("proposeSchedule", { weekStart: "2026-09-28", days: 2 })) as { shifts: { staffName: string; memberId: string }[] };
    expect(schedule.shifts.some((s) => s.memberId === bo.toString())).toBe(true);
  });

  test("viewTeam, viewRoles, viewShiftPresets, viewSuppliers", async () => {
    const { run } = toolsFor();
    expect((await run("viewTeam")).team).toEqual([
      { kind: "member", memberId: ann.toString(), name: "Ann Lee", accessLevel: "owner", hasPunchInCode: true },
      { kind: "member", memberId: bo.toString(), name: "Bo Chen", accessLevel: "staff", hasPunchInCode: false },
      { kind: "placeholder", staffMemberId: sdkUuid(3).toString(), name: "Cy Temp", jobRole: "Cashier" },
    ]);
    const roles = await run("viewRoles");
    const [role] = roles.roles as { id: string; tasks: { id: string; startTime: string | null; endTime: string | null }[] }[];
    expect(role.id).toBe(barista.toString());
    expect(role.tasks).toEqual([
      { id: sdkUuid(11).toString(), title: "Open the machine", description: "", startTime: "07:00", endTime: null, requiresEvidence: true },
    ]);
    expect(roles.training).toEqual([
      { dayId: dayOne.toString(), dayNumber: 1, title: "Espresso", objectives: [{ objectiveId: sdkUuid(81).toString(), text: "Pull a double shot" }] },
    ]);
    expect((await run("viewShiftPresets")).presets).toEqual([{ id: sdkUuid(30).toString(), name: "morning", startTime: "07:00", endTime: "14:00" }]);
    expect((await run("viewSuppliers")).suppliers).toEqual([
      { id: sdkUuid(50).toString(), name: "Dairy Co", contactName: "Dee", email: "dee@example.com", phone: null, language: "zh" },
    ]);
  });

  test("viewScheduleHistory, viewUpcomingShifts, viewAvailability", async () => {
    const { run } = toolsFor();
    const past = (await run("viewScheduleHistory", { days: 7 })).shifts as { id: string; date: string; roles: string }[];
    expect(past.map((s) => [s.id, s.date, s.roles])).toEqual([[sdkUuid(20).toString(), "2026-09-25", '["Barista"]']]);
    const upcoming = (await run("viewUpcomingShifts")).shifts as { id: string }[];
    expect(upcoming.map((s) => s.id)).toEqual([sdkUuid(21).toString()]);
    const avail = await run("viewAvailability");
    expect((avail.availability as { staffName: string; availableDays: string[] }[]).map((a) => [a.staffName, a.availableDays.length])).toEqual([
      ["Ann Lee", 7],
      ["Bo Chen", 7],
    ]);
    expect(avail.pendingTimeOff).toEqual([{ requestId: sdkUuid(33).toString(), staffName: "Bo Chen", startDate: "2026-10-01", endDate: "2026-10-02", fullDays: true }]);
    expect(avail.pendingShiftTrades).toEqual([{ tradeId: sdkUuid(34).toString(), requester: "Ann Lee", type: "giveaway", managerApproved: false }]);
  });

  test("viewInventory, viewProducts, viewSales", async () => {
    const { run } = toolsFor();
    const low = await run("viewInventory", { lowOnly: true });
    expect(low.items).toEqual([{
      id: milk.toString(), name: "Milk", category: "Dairy", stock: 3, min: 10, max: 60, unit: "L", supplier: "Dairy Co",
      minOrderQty: 6, unitsPerCase: 6, unitContentAmount: null, unitContentUnit: null,
    }]);
    expect(low).toMatchObject({ totalItems: 2, filter: "lowOnly", count: 1 });
    // One item by the id a page or an earlier tool gave.
    const one = await run("viewInventory", { itemId: sdkUuid(41).toString() });
    expect((one.items as { name: string }[]).map((i) => i.name)).toEqual(["Latte"]);
    const products = (await run("viewProducts")).products as { id: string; name: string; price: number }[];
    expect(products.map((p) => [p.id, p.name, p.price])).toEqual([[sdkUuid(41).toString(), "Latte", 4.5]]);
    const sales = await run("viewSales", { days: 3 });
    // Daily records of 120, 110 and 100 on the 24th-26th, plus the completed payment (12.50 on the
    // 25th); the refunded one is left out.
    expect(sales.total).toBe(342.5);
    expect(sales.daily).toEqual([
      { date: "2026-09-24", weekday: "Thu", revenue: 120 },
      { date: "2026-09-25", weekday: "Fri", revenue: 122.5 },
      { date: "2026-09-26", weekday: "Sat", revenue: 100 },
    ]);
    // The store's own currency, from settings.
    expect(sales).toMatchObject({ currency: "EUR", range: { period: "last_3_days", start: "2026-09-24", end: "2026-09-27" } });
    // A calendar range the engine sums: 09-25 and 09-26 only.
    const days = await run("viewSales", { from: "2026-09-25", to: "2026-09-26" });
    expect(days.total).toBe(222.5);
  });

  test("every id an action takes is where ID_SOURCES says, hyphenated as the actions match it", async () => {
    const { run } = toolsFor();
    const args: Record<string, unknown> = { proposeSchedule: { weekStart: "2026-09-28", days: 2 } };
    /** The values at a path like `roles[].tasks[].id`; a trailing "(…)" note is not part of it. */
    const valuesAt = (out: unknown, field: string): unknown[] =>
      field
        .replace(/\s*\(.*\)$/, "")
        .split(".")
        .reduce<unknown[]>((vals, seg) => {
          const key = seg.replace(/\[\]$/, "");
          const next = vals.map((v) => (v as Record<string, unknown> | null)?.[key]);
          return seg.endsWith("[]") ? next.flatMap((v) => (Array.isArray(v) ? v : [])) : next;
        }, [out]);
    for (const source of ID_SOURCES) {
      for (const { tool, field } of source.from) {
        const values = valuesAt(await run(tool, args[tool] ?? {}), field).filter((v) => v != null);
        expect(values.length, `${tool} ${field}`).toBeGreaterThan(0);
        for (const v of values) expect(String(v), `${tool} ${field}`).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      }
    }
  });
});

// ── Loads: once per request, shared while in flight ─────────────────────────

describe("the request's data source", () => {
  test("a table loads once per request; a new request loads it again", async () => {
    const first = toolsFor();
    await first.run("viewUpcomingShifts");
    await first.run("viewScheduleHistory");
    await first.run("viewForecast");
    expect(tablesQueried().filter((t) => t === "shift")).toHaveLength(1);
    await toolsFor().run("viewUpcomingShifts");
    expect(tablesQueried().filter((t) => t === "shift")).toHaveLength(2);
  });

  test("tool calls running together share the load in flight", async () => {
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    const { run } = toolsFor();
    const calls = [run("viewTeam"), run("viewAvailability"), run("viewFinance"), run("viewUpcomingShifts"), run("viewScheduleHistory")];
    await new Promise((r) => setTimeout(r, 5));
    release();
    for (const out of await Promise.all(calls)) expect(out.error).toBeUndefined();
    const queried = tablesQueried();
    expect(queried.filter((t) => t === "org_member")).toHaveLength(1);
    expect(queried.filter((t) => t === "shift")).toHaveLength(1);
    expect(new Set(queried).size).toBe(queried.length);
  });

  test("a tool call loads only the tables it reads", async () => {
    await toolsFor().run("viewInventory");
    expect(tablesQueried()).toEqual(["inventory_item"]);
  });

  test("reading a table the tool did not declare is an error, not an empty table", async () => {
    const source = createSqlToolSource({ token: TOKEN, organizationId: ORG, today: TODAY });
    const data = await source.load(["shift"]);
    expect([...data.db.shift!.iter()]).toHaveLength(2);
    expect(() => data.db.orgMember).toThrow("orgMember was not loaded");

    // The subscription-row fake the engine-tool tests run on does the same.
    const read = fakeCtx(fakeConn(DATA), TODAY, null, ORG).exec(
      "probe",
      ["shift"],
      async (d, table: "shift" | "orgMember") => [...d.db[table]!.iter()].length,
    );
    expect(await read("shift")).toBe(2);
    await expect(read("orgMember")).rejects.toThrow("orgMember was not loaded");
  });
});

// ── Failures ────────────────────────────────────────────────────────────────

describe("failures come back as tool errors", () => {
  function captureLogs() {
    const lines: string[] = [];
    const saved = { log: console.log, warn: console.warn, error: console.error };
    for (const k of ["log", "warn", "error"] as const) console[k] = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
    return { lines, restore: () => Object.assign(console, saved) };
  }

  test("an expired token: the step fails, the token is never logged, the next call tries again", async () => {
    const logs = captureLogs();
    const { run } = toolsFor();
    failWith = 401;
    let out: ToolOut;
    try {
      out = await run("viewTeam");
    } finally {
      logs.restore();
    }
    expect(out.error).toBe("live store data unavailable");
    expect(String(out.detail)).toContain("session was rejected (401)");
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(logs.lines.join("\n")).not.toContain(TOKEN);
    expect(logs.lines.some((l) => l.includes("viewTeam failed"))).toBe(true);

    failWith = null;
    expect((await run("viewTeam")).error).toBeUndefined();
    expect(tablesQueried().filter((t) => t === "org_member").length).toBe(2);
  });

  test("a failing query is an error the model can read", async () => {
    const logs = captureLogs();
    failWith = 500;
    const out = await toolsFor().run("viewSales").finally(logs.restore);
    expect(out.error).toBe("live store data unavailable");
    expect(String(out.detail)).toMatch(/query failed \(500\): internal error/);
  });

  test("an organization id that is not a uuid never reaches the SQL", async () => {
    const logs = captureLogs();
    const { run } = toolsFor(MERCHIVA_TOOL_NAMES, `${ORG}' OR '1'='1`);
    const outs = await Promise.all(MERCHIVA_TOOL_NAMES.map((name) => run(name))).finally(logs.restore);
    for (const out of outs) {
      expect(out.error).toBe("live store data unavailable");
      expect(String(out.detail)).toContain("not a uuid");
    }
    expect(requests).toHaveLength(0);
  });
});
