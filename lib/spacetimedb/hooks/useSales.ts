"use client";
// SpacetimeDB migration layer — sales
// TODO: replace internals with:
//   const [records] = useTable(tables.salesRecord.where(r => r.organizationId.eq(orgId)));

import { useState, useEffect, useCallback } from "react";
import { getSalesHistory, getTodayHourlyRecords } from "@/lib/db/sales";
import { getCached, setCache } from "@/lib/cache";
import type { SalesRecord } from "@/lib/types";

type SalesCache = { history: SalesRecord[]; hourly: SalesRecord[] };

export function useSales() {
  const [history, setHistory] = useState<SalesRecord[]>(
    () => getCached<SalesCache>("sales_30d")?.history ?? []
  );
  const [hourly, setHourly] = useState<SalesRecord[]>(
    () => getCached<SalesCache>("sales_30d")?.hourly ?? []
  );
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([getSalesHistory(30), getTodayHourlyRecords()])
      .then(([hist, hrly]) => {
        setHistory(hist);
        setHourly(hrly);
        setCache("sales_30d", { history: hist, hourly: hrly });
      })
      .catch((err) => console.error("[useSales]", err))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { history, hourly, refreshing, refresh } as const;
}
