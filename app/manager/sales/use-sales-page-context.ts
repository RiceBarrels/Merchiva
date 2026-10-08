"use client";

import { useMemo } from "react";
import { salesPageContext } from "@/lib/merchiva/data-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";
import type { SalesRecord } from "@/lib/types";

/** Tells Mr. Merchiva what the sales page shows: the days of history on file and the open tab. */
export function useSalesPageContext(s: { history: readonly SalesRecord[]; tab: string | null }): void {
  const { history, tab } = s;
  // useSales sorts the daily history by day.
  const days = history.length;
  const from = history[0]?.date ?? null;
  const to = history[history.length - 1]?.date ?? null;
  const context = useMemo(
    () => salesPageContext({ tab, days, range: from && to ? { from, to } : null }),
    [tab, days, from, to],
  );
  useMerchivaPageContext(context);
}
