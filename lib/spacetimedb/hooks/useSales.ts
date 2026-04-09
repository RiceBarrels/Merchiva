"use client";
// SpacetimeDB — sales records

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type { SalesRecord } from "@/lib/types";

export function useSales() {
  const { organizationId } = usePermissions();

  const [rawRecords, isReady] = useTable(tables.salesRecord);

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

  // 30-day history: all daily records (no hour field)
  const history = useMemo<SalesRecord[]>(
    () => allRecords.filter((r) => r.hour === undefined),
    [allRecords]
  );

  // Today's hourly records: records with an hour field
  const today = new Date().toISOString().slice(0, 10);
  const hourly = useMemo<SalesRecord[]>(
    () => allRecords.filter((r) => r.hour !== undefined && r.date === today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRecords]
  );

  return {
    history,
    hourly,
    isReady,
    refreshing: false,
    refresh: () => {},
  } as const;
}
