"use client";
// SpacetimeDB — sales records + built-in POS payments
//
// Sales come from two sources in this app:
//   1. `sales_record` rows synced from Square/Clover, or written manually.
//   2. `payment` rows the built-in POS terminal creates on each completed sale.
// We surface both as one stream so anything reading `useSales()` (sales page,
// reports, dashboard widgets, Mr. Merchiva) automatically reflects POS activity
// without each caller having to merge the tables.

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import { centsOf, toCents, toMajor } from "@/lib/money";
import type { SalesRecord } from "@/lib/types";
import { dateKey, todayKey } from "@/lib/date-key";
import { timestampToMs } from "@/lib/spacetimedb/timestamp";


export function useSales() {
  const { organizationId } = usePermissions();

  const [rawRecords, isReady] = useTable(tables.salesRecord);
  const [rawPayments] = useTable(tables.payment);

  const allRecords = useMemo<SalesRecord[]>(() => {
    if (!organizationId) return [];
    return rawRecords
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        date:        r.date,
        hour:        r.hour ?? undefined,
        actual:      r.actual,
        predicted:   r.predicted ?? 0,
        weather:     r.weather ?? "",
        footTraffic: r.footTraffic ?? 0,
        isHoliday:   r.isHoliday,
      }));
  }, [rawRecords, organizationId]);

  // The store's own calendar day, not UTC — `sales_record.date` and the
  // hourly bucket below are both local.
  const today = todayKey();

  // POS payments → synthetic SalesRecord rows. Daily aggregate per date, plus
  // an hourly aggregate for today so the hourly chart matches what the till
  // rang up today. Refunded payments are excluded; partial refunds subtract.
  const posDaily = useMemo<SalesRecord[]>(() => {
    if (!organizationId) return [];
    const byDate = new Map<string, number>();
    for (const p of rawPayments) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = p as any;
      if (r.organizationId !== organizationId) continue;
      if (r.status === "refunded") continue;
      const ts = timestampToMs(r.createdAt);
      if (!Number.isFinite(ts)) continue;
      const date = dateKey(new Date(ts));
      // Exact: the payment table carries amountCents / refundAmountCents.
      const netCents = centsOf(r, "amount") - centsOf(r, "refundAmount");
      if (netCents <= 0) continue;
      byDate.set(date, (byDate.get(date) ?? 0) + netCents);
    }
    return Array.from(byDate, ([date, actualCents]) => ({
      date,
      hour: undefined,
      actual: toMajor(actualCents),
      predicted: 0,
      weather: "",
      footTraffic: 0,
      isHoliday: false,
    }));
  }, [rawPayments, organizationId]);

  const posHourlyToday = useMemo<SalesRecord[]>(() => {
    if (!organizationId) return [];
    const byHour = new Map<number, number>();
    for (const p of rawPayments) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = p as any;
      if (r.organizationId !== organizationId) continue;
      if (r.status === "refunded") continue;
      const ts = timestampToMs(r.createdAt);
      if (!Number.isFinite(ts)) continue;
      const d = new Date(ts);
      if (dateKey(d) !== today) continue;
      const netCents = centsOf(r, "amount") - centsOf(r, "refundAmount");
      if (netCents <= 0) continue;
      const hour = d.getHours();
      byHour.set(hour, (byHour.get(hour) ?? 0) + netCents);
    }
    return Array.from(byHour, ([hour, actualCents]) => ({
      date: today,
      hour,
      actual: toMajor(actualCents),
      predicted: 0,
      weather: "",
      footTraffic: 0,
      isHoliday: false,
    }));
  }, [rawPayments, organizationId, today]);

  // Daily history: merge sales_record daily rows with POS daily totals so a
  // store using only the built-in POS still shows a populated history.
  const history = useMemo<SalesRecord[]>(() => {
    const fromRecord = allRecords.filter((r) => r.hour === undefined);
    const byDate = new Map<string, SalesRecord>();
    for (const r of fromRecord) byDate.set(r.date, { ...r });
    for (const r of posDaily) {
      const existing = byDate.get(r.date);
      if (existing) {
        // Add in cents so merging a sales_record day with POS takings for the
        // same day cannot drift.
        existing.actual = toMajor(toCents(existing.actual) + toCents(r.actual));
      } else {
        byDate.set(r.date, { ...r });
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [allRecords, posDaily]);

  // Today's hourly: merge sales_record hourly rows (if any) with POS hourly.
  const hourly = useMemo<SalesRecord[]>(() => {
    const fromRecord = allRecords.filter(
      (r) => r.hour !== undefined && r.date === today,
    );
    const byHour = new Map<number, SalesRecord>();
    for (const r of fromRecord) byHour.set(r.hour as number, { ...r });
    for (const r of posHourlyToday) {
      const h = r.hour as number;
      const existing = byHour.get(h);
      if (existing) {
        existing.actual = toMajor(toCents(existing.actual) + toCents(r.actual));
      } else {
        byHour.set(h, { ...r });
      }
    }
    return Array.from(byHour.values()).sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRecords, posHourlyToday]);

  return {
    history,
    hourly,
    isReady,
    refreshing: false,
    refresh: () => {},
  } as const;
}
