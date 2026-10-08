/**
 * viewSales — daily revenue for a range of store days, as the Sales page counts it (daily sales
 * records + POS takings), with the range's total.
 *
 * The range is a calendar period (the same periods and Monday-to-Sunday weeks as viewFinance),
 * explicit from/to days, or the last N days. It used to be only "the last N days", so for "上周"
 * the model fetched 14 days, picked a week it worked out itself (the wrong one) and added it up
 * by hand. Now the engine sums the exact range in cents, every day carries its weekday, and the
 * result names the store's currency — without it the model labelled USD sales as 元.
 */

import { z } from "zod";
import { toMajor } from "@/lib/money";
import type { Row } from "@/lib/merchiva/tools/rows";
import { dailySalesCents, toPaymentLite, toSalesRowLite } from "@/lib/merchiva/tools/sales-history";
import { addDaysToKey, isDateKey, weekdayOfKey } from "@/lib/merchiva/tools/store-time";
import { SALES_HISTORY_DAYS } from "@/lib/merchiva/tools/tool-tables";
import { FINANCE_PERIODS, resolveFinancePeriod } from "@/lib/merchiva/tools/view-finance";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateKeyField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const viewSalesInput = z.object({
  period: z
    .enum(FINANCE_PERIODS)
    .optional()
    .describe("Calendar period: this_week / last_week (Monday–Sunday), this_month, last_month, this_quarter, this_year. Up to today."),
  from: dateKeyField.optional().describe("First day, YYYY-MM-DD. from/to win over period and days."),
  to: dateKeyField.optional().describe("Last day, YYYY-MM-DD. Default today."),
  days: z.number().int().min(1).max(90).optional().describe("The last N days up to today. Default 14 when no period or from/to is given."),
});
export type ViewSalesArgs = z.infer<typeof viewSalesInput>;

export interface SalesRange {
  /** The period's name, `from_to` for explicit days, or `last_<n>_days`. */
  period: string;
  start: string;
  end: string;
}

/** The store days a call covers. A period never runs past today. */
export function resolveSalesRange(today: string, args: ViewSalesArgs): SalesRange {
  const from = isDateKey(args.from) ? args.from : null;
  const to = isDateKey(args.to) ? args.to : null;
  if (from || to) {
    const end = to ?? today;
    const start = from ?? addDaysToKey(end, -13);
    return start <= end ? { period: "from_to", start, end } : { period: "from_to", start: end, end: start };
  }
  if (args.period) {
    const { start, end } = resolveFinancePeriod(today, { period: args.period });
    return { period: args.period, start, end: end < today ? end : today };
  }
  const days = args.days ?? 14;
  return { period: `last_${days}_days`, start: addDaysToKey(today, -days), end: today };
}

/** The tool's result for a range, from the daily totals in cents. Pure. */
export function salesView(daily: Map<string, number>, range: SalesRange, today: string, currency: string) {
  const days = [...daily]
    .filter(([date]) => date >= range.start && date <= range.end)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const totalCents = days.reduce((sum, [, cents]) => sum + cents, 0);
  const loadedFrom = addDaysToKey(today, -SALES_HISTORY_DAYS);
  // A string, not a list: the chat's step counts the result's longest list.
  const note = [
    "total is the exact sum of daily for this range; quote it, don't add the days up yourself.",
    range.start < loadedFrom ? `Sales before ${loadedFrom} are not loaded, so the range starts there in effect.` : "",
  ].filter(Boolean).join(" ");
  return {
    currency,
    today,
    range,
    total: toMajor(totalCents),
    daysWithSales: days.length,
    daily: days.map(([date, cents]) => ({ date, weekday: WEEKDAYS[weekdayOfKey(date)], revenue: toMajor(cents) })),
    note,
  };
}

/** The tool's description; the tool itself is built in lib/merchiva/tools.ts (server-only). */
export const VIEW_SALES_DESCRIPTION =
  "Daily revenue for a range of days as the Sales page counts it (daily sales records + POS takings), each day with its weekday, plus the range's exact total and the store's currency. For \"上周\" / last week pass period=last_week; for a month, period=this_month or last_month; for exact days, from/to. Quote total — never add days up yourself. Never invent revenue — fetch it here.";

/** The tool's result from the org's rows: `sales_record`, `payment` and its `settings` row. */
export function salesFromRows(
  rows: { salesRecord: readonly Row[]; payment: readonly Row[]; settings: Row | undefined },
  today: string,
  timeZone: string | null,
  args: ViewSalesArgs,
) {
  // Daily rows + POS payments, in cents (lib/money). Hourly rows are
  // left out: summing them with the day's own total counted it twice.
  const daily = dailySalesCents(rows.salesRecord.map(toSalesRowLite), rows.payment.map(toPaymentLite), timeZone);
  const currency = String(rows.settings?.paymentCurrency || "USD");
  return salesView(daily, resolveSalesRange(today, args), today, currency);
}
