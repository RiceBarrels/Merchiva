/**
 * Daily sales, as the app's screens define them — shared by viewSales,
 * viewFinance, viewForecast and proposeSchedule.
 *
 * Sales come from two tables (see lib/spacetimedb/hooks/useSales.ts):
 *   - `sales_record`: a daily aggregate (`hour` null) or an hourly row;
 *   - `payment`: one row per built-in POS sale. Refunded payments are
 *     excluded and a partial refund is subtracted.
 * Money stays in integer cents until the caller presents it.
 */

import { centsOf, toMajor } from "@/lib/money";
import { timestampToMs } from "@/lib/spacetimedb/timestamp";
import type { SalesRecord } from "@/lib/types";
import type { Row } from "@/lib/merchiva/tools/rows";
import { zonedDateKey } from "@/lib/merchiva/tools/store-time";

export interface PaymentLite {
  status: string;
  createdAtMs: number;
  amountCents: number;
  refundAmountCents: number;
}

export interface SalesRowLite {
  date: string;
  /** null = daily aggregate; 0-23 = hourly row. */
  hour: number | null;
  actualCents: number;
  predicted: number;
  weather: string;
  footTraffic: number;
  isHoliday: boolean;
}

export function toPaymentLite(r: Row): PaymentLite {
  return {
    status: String(r?.status ?? ""),
    createdAtMs: timestampToMs(r?.createdAt),
    amountCents: centsOf(r, "amount"),
    refundAmountCents: centsOf(r, "refundAmount"),
  };
}

export function toSalesRowLite(r: Row): SalesRowLite {
  return {
    date: String(r?.date ?? ""),
    hour: r?.hour == null ? null : Number(r.hour),
    actualCents: centsOf(r, "actual"),
    predicted: Number(r?.predicted ?? 0) || 0,
    weather: String(r?.weather ?? ""),
    footTraffic: Number(r?.footTraffic ?? 0) || 0,
    isHoliday: !!r?.isHoliday,
  };
}

/** POS takings per store day: every payment except refunded ones, net of partial refunds. */
export function posNetCentsByDay(payments: readonly PaymentLite[], timeZone: string | null): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const p of payments) {
    if (p.status === "refunded" || !Number.isFinite(p.createdAtMs)) continue;
    const net = p.amountCents - p.refundAmountCents;
    if (net <= 0) continue;
    const day = zonedDateKey(p.createdAtMs, timeZone);
    byDay.set(day, (byDay.get(day) ?? 0) + net);
  }
  return byDay;
}

/**
 * Daily sales in cents: daily `sales_record` rows plus POS takings for the
 * same day — the Sales page's history. Hourly rows are left out; they break
 * down a day that already has (or is summed into) its own total.
 */
export function dailySalesCents(
  rows: readonly SalesRowLite[],
  payments: readonly PaymentLite[],
  timeZone: string | null,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (r.hour != null || !r.date) continue;
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.actualCents);
  }
  for (const [day, cents] of posNetCentsByDay(payments, timeZone)) {
    byDay.set(day, (byDay.get(day) ?? 0) + cents);
  }
  return byDay;
}

/**
 * The forecast engine's input, built like components/sales-forecast.tsx:
 * every `sales_record` row (daily and hourly) plus one synthetic daily row
 * per day of POS takings.
 */
export function forecastSalesHistory(
  rows: readonly SalesRowLite[],
  payments: readonly PaymentLite[],
  timeZone: string | null,
): SalesRecord[] {
  const fromRecords: SalesRecord[] = rows
    .filter((r) => r.date)
    .map((r) => ({
      date: r.date,
      hour: r.hour == null ? undefined : r.hour,
      actual: toMajor(r.actualCents),
      predicted: r.predicted,
      weather: r.weather,
      footTraffic: r.footTraffic,
      isHoliday: r.isHoliday,
    }));
  const fromPayments: SalesRecord[] = [...posNetCentsByDay(payments, timeZone)].map(([date, cents]) => ({
    date,
    hour: undefined,
    actual: toMajor(cents),
    predicted: 0,
    weather: "",
    footTraffic: 0,
    isHoliday: false,
  }));
  return [...fromRecords, ...fromPayments];
}

/** Daily totals from `since` on, oldest first, as engine-ready `SalesRecord`s. */
export function dailySalesRecords(daily: Map<string, number>, since: string): SalesRecord[] {
  return [...daily]
    .filter(([date]) => date >= since)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, cents]) => ({
      date,
      hour: undefined,
      actual: toMajor(cents),
      predicted: 0,
      weather: "",
      footTraffic: 0,
      isHoliday: false,
    }));
}
