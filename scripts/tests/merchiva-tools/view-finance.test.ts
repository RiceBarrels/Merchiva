import { describe, expect, test } from "bun:test";
import {
  computeFinance,
  resolveFinancePeriod,
  toExpenseLite,
  toPayrollMember,
  viewFinanceTool,
  type ExpenseLite,
  type FinanceInput,
} from "@/lib/merchiva/tools/view-finance";
import type { PaymentLite, SalesRowLite } from "@/lib/merchiva/tools/sales-history";
import type { PayrollEvent } from "@/lib/payroll";
import { zonedMidnightMs } from "@/lib/merchiva/tools/store-time";
import { CALL, fakeConn, fakeCtx, identity, ts, uuid } from "./fixtures";

const TODAY = "2026-09-26"; // a Saturday
const LA = "America/Los_Angeles";
const h = (hours: number) => hours * 3_600_000;

describe("resolveFinancePeriod", () => {
  test("mirrors the Finances page's range selector", () => {
    expect(resolveFinancePeriod(TODAY, {})).toEqual({ label: "this_month", start: "2026-09-01", end: "2026-09-30" });
    expect(resolveFinancePeriod(TODAY, { period: "last_month" })).toMatchObject({ start: "2026-08-01", end: "2026-08-31" });
    expect(resolveFinancePeriod(TODAY, { period: "this_quarter" })).toMatchObject({ start: "2026-07-01", end: "2026-09-30" });
    expect(resolveFinancePeriod(TODAY, { period: "this_year" })).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
    expect(resolveFinancePeriod(TODAY, { period: "this_week" })).toMatchObject({ start: "2026-09-21", end: "2026-09-27" });
    expect(resolveFinancePeriod(TODAY, { period: "last_week" })).toMatchObject({ start: "2026-09-14", end: "2026-09-20" });
    expect(resolveFinancePeriod("2026-01-15", { period: "last_month" })).toMatchObject({ start: "2025-12-01", end: "2025-12-31" });
  });

  test("days wins over period", () => {
    expect(resolveFinancePeriod(TODAY, { period: "this_year", days: 7 })).toEqual({ label: "last_7_days", start: "2026-09-20", end: TODAY });
  });
});

function input(over: Partial<FinanceInput>): FinanceInput {
  return {
    today: TODAY,
    timeZone: LA,
    nowMs: zonedMidnightMs(TODAY, LA) + h(12),
    period: resolveFinancePeriod(TODAY, {}),
    payments: [],
    expenses: [],
    salesRows: [],
    members: [],
    punches: [],
    ...over,
  };
}

const expense = (date: string, cents: number, category = "Supplies", extra: Partial<ExpenseLite> = {}): ExpenseLite => ({
  category,
  description: `${category} ${date}`,
  amountCents: cents,
  date,
  recurring: false,
  recurringPeriod: null,
  ...extra,
});
const paid = (key: string, hourOfDay: number, cents: number, status = "completed"): PaymentLite => ({
  status,
  createdAtMs: zonedMidnightMs(key, LA) + h(hourOfDay),
  amountCents: cents,
  refundAmountCents: 0,
});

describe("computeFinance — overview", () => {
  test("revenue is completed payments inside the store's period; totals are exact cents", () => {
    const out = computeFinance(
      input({
        payments: [
          paid("2026-09-01", 0.5, 10), // 00:30 on the 1st, store time — inside September
          paid("2026-08-31", 23.5, 999_99), // 23:30 on Aug 31 — outside
          paid("2026-09-10", 12, 20),
          paid("2026-09-11", 12, 5000, "refunded"),
          paid("2026-09-12", 12, 7000, "pending"),
        ],
        expenses: [expense("2026-09-01", 10), expense("2026-09-15", 5, "Rent"), expense("2026-08-31", 100_00)],
      }),
    );
    expect(out.revenue).toBe(0.3);
    expect(out.expenses).toBe(0.15);
    expect(out.netProfit).toBe(0.15);
    expect(out.profitMarginPct).toBe(50);
    expect(out.expensesByCategory).toEqual([
      { category: "Supplies", amount: 0.1, count: 1 },
      { category: "Rent", amount: 0.05, count: 1 },
    ]);
  });

  test("margin is 0 with no revenue, and the six-month chart ends with this month", () => {
    const out = computeFinance(input({ expenses: [expense("2026-04-03", 1234)] }));
    expect(out.profitMarginPct).toBe(0);
    expect(out.last6Months.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(out.last6Months[0]).toEqual({ month: "2026-04", revenue: 0, expenses: 12.34 });
  });

  test("sales uses the Sales page definition: daily rows plus POS takings", () => {
    const salesRows: SalesRowLite[] = [
      { date: "2026-09-05", hour: null, actualCents: 100_00, predicted: 0, weather: "", footTraffic: 0, isHoliday: false },
      { date: "2026-09-05", hour: 12, actualCents: 40_00, predicted: 0, weather: "", footTraffic: 0, isHoliday: false },
    ];
    const out = computeFinance(input({ salesRows, payments: [paid("2026-09-05", 13, 25_50)] }));
    expect(out.sales).toBe(125.5);
    expect(out.revenue).toBe(25.5);
  });
});

describe("computeFinance — payroll", () => {
  test("punch hours × rate in cents, with the page's 15/h default", () => {
    const start = zonedMidnightMs("2026-09-22", LA) + h(9);
    const punch = (id: string, memberId: string, action: string, atMs: number, pair: string | null = null): PayrollEvent => ({
      id, memberId, action, atMs, closed: true, pairEventId: pair,
    });
    const out = computeFinance(
      input({
        members: [
          { id: "m-ann", name: "Ann", active: true, rateCents: 2025 },
          { id: "m-bo", name: "Bo", active: true, rateCents: null },
          { id: "m-cy", name: "Cy", active: false, rateCents: 9999 },
        ],
        punches: [
          punch("a1", "m-ann", "in", start),
          punch("a2", "m-ann", "out", start + h(8), "a1"),
          punch("a3", "m-ann", "break-start", start + h(3)),
          punch("a4", "m-ann", "break-end", start + h(3.5), "a3"),
          punch("b1", "m-bo", "in", start),
          punch("b2", "m-bo", "out", start + h(4), "b1"),
          punch("c1", "m-cy", "in", start),
          punch("c2", "m-cy", "out", start + h(4), "c1"),
        ],
        payments: [paid("2026-09-22", 12, 1000_00)],
      }),
    );
    // Ann: 7.5 h × 20.25 = 151.875 → 151.88; Bo: 4 h × 15 = 60. Cy is not active.
    expect(out.labor.staff).toEqual([
      { name: "Ann", hours: 7.5, hourlyRate: 20.25, pay: 151.88 },
      { name: "Bo", hours: 4, hourlyRate: 15, pay: 60 },
    ]);
    expect(out.labor.cost).toBe(211.88);
    expect(out.labor.hours).toBe(11.5);
    expect(out.labor.pctOfRevenue).toBe(21.2);
    expect(out.labor.defaultRateUsedFor).toEqual(["Bo"]);
  });
});

describe("computeFinance — cash flow", () => {
  test("balance, 30-day average, projection with a monthly bill, and bills due this week", () => {
    const rent = expense("2026-01-28", 1000_00, "Rent", { recurring: true, recurringPeriod: null });
    const salesRows: SalesRowLite[] = ["2026-09-24", "2026-09-25"].map((date) => ({
      date, hour: null, actualCents: 100_00, predicted: 0, weather: "", footTraffic: 0, isHoliday: false,
    }));
    const out = computeFinance(input({ payments: [paid("2026-09-02", 12, 5000_00)], expenses: [rent], salesRows }));
    expect(out.cashFlow.balance).toBe(4000);
    expect(out.cashFlow.avgDailySales).toBe(100);
    // 31 days from today (Sat 26th) to Oct 26th: 10 weekend days at 60, 21 weekdays at 100 → +2700;
    // rent (monthly on the 28th, a null period counts as Monthly) falls due once, on Sep 28th.
    expect(out.cashFlow.projectedIn30Days).toBe(4000 + 2700 - 1000);
    expect(out.cashFlow.lowestProjected).toEqual({ date: "2026-09-28", balance: 3220 });
    expect(out.cashFlow.dueNext7Days).toEqual([{ name: "Rent 2026-01-28", amount: 1000, date: "2026-09-28" }]);
  });
});

describe("viewFinance tool", () => {
  test("reads the org's rows it declares and adds currency and notes", async () => {
    const memberId = uuid();
    const conn = fakeConn({
      payment: [
        { organizationId: "org-1", status: "completed", createdAt: ts(zonedMidnightMs("2026-09-03", LA) + h(10)), amount: 12.5 },
        { organizationId: "org-2", status: "completed", createdAt: ts(zonedMidnightMs("2026-09-03", LA) + h(10)), amount: 999 },
      ],
      expense: [{ organizationId: "org-1", category: "Rent", description: "Rent", amount: 2.5, amountCents: 250n, date: "2026-09-01", recurring: false }],
      salesRecord: [],
      orgMember: [{ organizationId: "org-1", id: memberId, userId: identity("aa"), displayName: "Ann", status: "active", hourlyRate: 20 }],
      punchEvent: [],
      settings: [{ organizationId: "org-1", paymentCurrency: "EUR" }],
    });
    const t = viewFinanceTool(fakeCtx(conn, TODAY, LA));
    const out = (await t.execute!({ period: "this_month" }, CALL)) as Record<string, unknown>;
    expect(out.currency).toBe("EUR");
    expect(out.revenue).toBe(12.5);
    expect(out.expenses).toBe(2.5);
    expect(out.netProfit).toBe(10);
    expect(Array.isArray(out.notes)).toBe(true);
  });

  test("mappers: member rate set via either column; expense cents exact", () => {
    expect(toPayrollMember({ id: uuid(7), displayName: "A", status: "active", hourlyRateCents: 1234n }).rateCents).toBe(1234);
    expect(toPayrollMember({ id: uuid(8), displayName: "B", status: "active" }).rateCents).toBeNull();
    expect(toExpenseLite({ category: "Rent", amount: 0.1 }).amountCents).toBe(10);
  });
});
