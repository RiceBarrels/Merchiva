/**
 * viewFinance — the Finances page's numbers, computed on the server.
 *
 * Mirrors app/manager/finances/page.tsx tab by tab, so Mr. Merchiva quotes
 * exactly what the owner sees there:
 *   Overview   revenue = completed payments taken in the period; expenses =
 *              expense rows dated in it; net profit, margin, 6-month chart.
 *   Expenses   the same rows by category.
 *   Cash flow  all-time balance, average daily sales over 30 days, a 30-day
 *              projection with recurring expenses, what falls due in 7 days.
 *   Payroll    punch-clock hours (lib/payroll) × each member's hourly rate,
 *              15/h when none is set.
 * Everything is added in integer cents (lib/money) and converted once, at the
 * end — the page itself still sums floats in places; these totals are exact.
 */

import { tool } from "ai";
import { z } from "zod";
import { centsOf, multiplyCents, toMajor } from "@/lib/money";
import { computeMemberPayroll, grossPayCents, toPayrollEvents, type PayrollEvent } from "@/lib/payroll";
import { orgRows, uuidText, type Row, type ToolContext } from "@/lib/merchiva/tools/rows";
import {
  dailySalesCents,
  toPaymentLite,
  toSalesRowLite,
  type PaymentLite,
  type SalesRowLite,
} from "@/lib/merchiva/tools/sales-history";
import {
  addDaysToKey,
  mondayKeyOf,
  weekdayOfKey,
  zonedMidnightMs,
} from "@/lib/merchiva/tools/store-time";

/** The Finances page's fallback rate for members with no hourly rate set. */
export const DEFAULT_HOURLY_RATE_CENTS = 1500;

export const FINANCE_PERIODS = [
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
] as const;
export type FinancePeriodName = (typeof FINANCE_PERIODS)[number];

export const viewFinanceInput = z.object({
  period: z
    .enum(FINANCE_PERIODS)
    .optional()
    .describe("Calendar period, as on the Finances page. Default this_month. Ignored when days is set."),
  days: z
    .number()
    .int()
    .min(1)
    .max(366)
    .optional()
    .describe("Use instead of period for a rolling window: the last N days up to today."),
});
export type ViewFinanceArgs = z.infer<typeof viewFinanceInput>;

export interface FinancePeriod {
  label: string;
  start: string;
  end: string;
}

export interface ExpenseLite {
  category: string;
  description: string;
  amountCents: number;
  date: string;
  recurring: boolean;
  recurringPeriod: string | null;
}

export interface PayrollMemberLite {
  id: string;
  name: string;
  active: boolean;
  /** null = no rate set → the page's default. */
  rateCents: number | null;
}

export interface FinanceInput {
  today: string;
  timeZone: string | null;
  nowMs: number;
  period: FinancePeriod;
  payments: readonly PaymentLite[];
  expenses: readonly ExpenseLite[];
  salesRows: readonly SalesRowLite[];
  members: readonly PayrollMemberLite[];
  punches: readonly PayrollEvent[];
}

export function toExpenseLite(r: Row): ExpenseLite {
  return {
    category: String(r?.category ?? ""),
    description: String(r?.description ?? ""),
    amountCents: centsOf(r, "amount"),
    date: String(r?.date ?? ""),
    recurring: !!r?.recurring,
    recurringPeriod: r?.recurringPeriod == null ? null : String(r.recurringPeriod),
  };
}

export function toPayrollMember(r: Row): PayrollMemberLite {
  return {
    id: uuidText(r?.id),
    name: String(r?.displayName ?? "—"),
    active: r?.status === "active",
    // Same test as the page: a rate is "set" when either column is.
    rateCents: r?.hourlyRate != null || r?.hourlyRateCents != null ? centsOf(r, "hourlyRate") : null,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** First day of the month `offset` months from `key`'s month. */
function monthStart(key: string, offset = 0): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1 + offset;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

/** The page's date-range selector, in store calendar days. `days` wins over `period`. */
export function resolveFinancePeriod(today: string, args: ViewFinanceArgs): FinancePeriod {
  if (args.days) {
    return { label: `last_${args.days}_days`, start: addDaysToKey(today, -(args.days - 1)), end: today };
  }
  const name: FinancePeriodName = args.period ?? "this_month";
  const monday = mondayKeyOf(today);
  switch (name) {
    case "this_week":
      return { label: name, start: monday, end: addDaysToKey(monday, 6) };
    case "last_week":
      return { label: name, start: addDaysToKey(monday, -7), end: addDaysToKey(monday, -1) };
    case "this_month":
      return { label: name, start: monthStart(today), end: addDaysToKey(monthStart(today, 1), -1) };
    case "last_month":
      return { label: name, start: monthStart(today, -1), end: addDaysToKey(monthStart(today), -1) };
    case "this_quarter": {
      const month = Number(today.slice(5, 7)) - 1;
      const back = -(month % 3);
      return { label: name, start: monthStart(today, back), end: addDaysToKey(monthStart(today, back + 3), -1) };
    }
    case "this_year": {
      const y = today.slice(0, 4);
      return { label: name, start: `${y}-01-01`, end: `${y}-12-31` };
    }
  }
}

/** Is a recurring expense due on `day`? The Cash Flow tab's rule, on calendar keys. */
function dueOn(exp: ExpenseLite, day: string): boolean {
  const period = exp.recurringPeriod ?? "Monthly";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp.date)) return false;
  const sameDayOfMonth = exp.date.slice(8, 10) === day.slice(8, 10);
  if (period === "Monthly") return sameDayOfMonth;
  if (period === "Weekly") return weekdayOfKey(exp.date) === weekdayOfKey(day);
  if (period === "Yearly") return exp.date.slice(5, 10) === day.slice(5, 10);
  return false;
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** The whole Finances page for one period. Pure; money in, cents throughout, major units out. */
export function computeFinance(input: FinanceInput) {
  const { today, timeZone, nowMs, period } = input;
  const startMs = zonedMidnightMs(period.start, timeZone);
  const endMs = zonedMidnightMs(addDaysToKey(period.end, 1), timeZone) - 1;
  const completed = input.payments.filter((p) => p.status === "completed" && Number.isFinite(p.createdAtMs));
  const inRange = (key: string, start: string, end: string) => key >= start && key <= end;

  // ── Overview ──
  const revenueCents = sum(completed.filter((p) => p.createdAtMs >= startMs && p.createdAtMs <= endMs).map((p) => p.amountCents));
  const periodExpenses = input.expenses.filter((e) => inRange(e.date, period.start, period.end));
  const expensesCents = sum(periodExpenses.map((e) => e.amountCents));
  const netCents = revenueCents - expensesCents;

  const daily = dailySalesCents(input.salesRows, input.payments, timeZone);
  const salesCents = sum([...daily].filter(([d]) => inRange(d, period.start, period.end)).map(([, c]) => c));

  const last6Months = [5, 4, 3, 2, 1, 0].map((back) => {
    const mStart = monthStart(today, -back);
    const mEnd = addDaysToKey(monthStart(today, -back + 1), -1);
    const mStartMs = zonedMidnightMs(mStart, timeZone);
    const mEndMs = zonedMidnightMs(addDaysToKey(mEnd, 1), timeZone) - 1;
    return {
      month: mStart.slice(0, 7),
      revenue: toMajor(sum(completed.filter((p) => p.createdAtMs >= mStartMs && p.createdAtMs <= mEndMs).map((p) => p.amountCents))),
      expenses: toMajor(sum(input.expenses.filter((e) => inRange(e.date, mStart, mEnd)).map((e) => e.amountCents))),
    };
  });

  // ── Expenses tab ──
  const byCategory = new Map<string, { cents: number; count: number }>();
  for (const e of periodExpenses) {
    const cur = byCategory.get(e.category) ?? { cents: 0, count: 0 };
    cur.cents += e.amountCents;
    cur.count += 1;
    byCategory.set(e.category, cur);
  }
  const expensesByCategory = [...byCategory]
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([category, v]) => ({ category, amount: toMajor(v.cents), count: v.count }));
  const largestExpenses = [...periodExpenses]
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 5)
    .map((e) => ({ date: e.date, category: e.category, description: e.description, amount: toMajor(e.amountCents) }));

  // ── Payroll tab ──
  const byMember = new Map<string, PayrollEvent[]>();
  for (const e of input.punches) {
    const list = byMember.get(e.memberId) ?? [];
    list.push(e);
    byMember.set(e.memberId, list);
  }
  const staff = input.members
    .filter((m) => m.active)
    .map((m) => {
      const pay = computeMemberPayroll(byMember.get(m.id) ?? [], startMs, endMs, nowMs);
      const rateCents = m.rateCents ?? DEFAULT_HOURLY_RATE_CENTS;
      return {
        name: m.name,
        hours: Math.round((pay.paidMs / 3_600_000) * 100) / 100,
        rateCents,
        defaultRate: m.rateCents == null,
        payCents: grossPayCents(pay.paidMs, rateCents),
      };
    })
    .filter((s) => s.hours > 0)
    .sort((a, b) => b.hours - a.hours);
  const laborCents = sum(staff.map((s) => s.payCents));
  const laborHours = Math.round(sum(staff.map((s) => s.hours)) * 100) / 100;

  // ── Cash flow tab ──
  const balanceCents = sum(completed.map((p) => p.amountCents)) - sum(input.expenses.map((e) => e.amountCents));
  const windowStart = addDaysToKey(today, -29);
  const recentDaily = input.salesRows.filter((r) => r.hour == null && r.date >= windowStart);
  const avgDailyCents = recentDaily.length ? Math.round(sum(recentDaily.map((r) => r.actualCents)) / recentDaily.length) : 0;
  const recurring = input.expenses.filter((e) => e.recurring);
  let running = balanceCents;
  let lowest = { date: today, cents: balanceCents };
  for (let i = 0; i <= 30; i++) {
    const day = addDaysToKey(today, i);
    const dow = weekdayOfKey(day);
    running += dow === 0 || dow === 6 ? multiplyCents(avgDailyCents, 0.6) : avgDailyCents;
    for (const e of recurring) if (dueOn(e, day)) running -= e.amountCents;
    if (running < lowest.cents) lowest = { date: day, cents: running };
  }
  const dueNext7Days: { name: string; amount: number; date: string }[] = [];
  for (const e of recurring) {
    for (let i = 0; i < 7; i++) {
      const day = addDaysToKey(today, i);
      if (dueOn(e, day)) dueNext7Days.push({ name: e.description || e.category, amount: toMajor(e.amountCents), date: day });
    }
  }

  return {
    period,
    revenue: toMajor(revenueCents),
    expenses: toMajor(expensesCents),
    netProfit: toMajor(netCents),
    profitMarginPct: revenueCents > 0 ? Math.round((netCents / revenueCents) * 1000) / 10 : 0,
    sales: toMajor(salesCents),
    expensesByCategory,
    largestExpenses,
    labor: {
      cost: toMajor(laborCents),
      hours: laborHours,
      pctOfRevenue: revenueCents > 0 ? Math.round((laborCents / revenueCents) * 1000) / 10 : null,
      staff: staff.slice(0, 20).map((s) => ({ name: s.name, hours: s.hours, hourlyRate: toMajor(s.rateCents), pay: toMajor(s.payCents) })),
      defaultRateUsedFor: staff.filter((s) => s.defaultRate).map((s) => s.name),
    },
    last6Months,
    cashFlow: {
      balance: toMajor(balanceCents),
      avgDailySales: toMajor(avgDailyCents),
      projectedIn30Days: toMajor(running),
      lowestProjected: { date: lowest.date, balance: toMajor(lowest.cents) },
      dueNext7Days: dueNext7Days.sort((a, b) => (a.date < b.date ? -1 : 1)),
    },
  };
}

const NOTES = [
  "revenue = completed POS payments in the period (Finances page); sales = daily sales records + POS takings (Sales page).",
  "netProfit = revenue - expenses. Labor is only inside expenses if it was logged as a Payroll expense.",
  "labor = punch-clock hours x hourly rate; defaultRateUsedFor lists staff costed at the default 15/h.",
  "cashFlow.balance is all-time revenue minus all-time expenses; the projection adds avgDailySales (60% on weekends) and subtracts recurring expenses.",
];

/** Everything the Finances page reads. */
const FINANCE_TABLES = ["payment", "settings", "expense", "salesRecord", "orgMember", "punchEvent"] as const;

export function viewFinanceTool(ctx: ToolContext) {
  return tool({
    description:
      "Finances as the Finances page shows them: revenue, expenses, net profit, margin, expenses by category, labor cost from punch-clock payroll, the last 6 months, and cash flow (balance, 30-day projection, bills due). All numbers are computed exactly — quote and explain them, never recompute. Use for profit, margin, cost, labor, cash-flow and P&L questions.",
    inputSchema: viewFinanceInput,
    execute: ctx.exec("viewFinance", FINANCE_TABLES, async (data, args: ViewFinanceArgs) => {
      const org = ctx.organizationId;
      const payments = orgRows(data, "payment", org).map(toPaymentLite);
      const settings = orgRows(data, "settings", org)[0];
      const summary = computeFinance({
        today: ctx.today,
        timeZone: ctx.timeZone,
        nowMs: Date.now(),
        period: resolveFinancePeriod(ctx.today, args ?? {}),
        payments,
        expenses: orgRows(data, "expense", org).map(toExpenseLite),
        salesRows: orgRows(data, "salesRecord", org).map(toSalesRowLite),
        members: orgRows(data, "orgMember", org).map(toPayrollMember),
        punches: toPayrollEvents(orgRows(data, "punchEvent", org), org),
      });
      const notes = [...NOTES];
      if (!ctx.timeZone && payments.length > 0) {
        notes.push("The store's time zone is unknown, so payment times were split into days by UTC; totals near midnight may land on the neighbouring day.");
      }
      return { currency: String(settings?.paymentCurrency || "USD"), today: ctx.today, ...summary, notes };
    }),
  });
}
