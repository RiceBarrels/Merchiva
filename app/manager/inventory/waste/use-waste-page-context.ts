"use client";

import { useMemo } from "react";
import { dateKey } from "@/lib/date-key";
import { wastePageContext, type WastePeriod } from "@/lib/merchiva/data-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";
import { useNow } from "@/lib/use-now";

/** Tells Mr. Merchiva what the waste log shows: the period, the search and the entry being logged. */
export function useWastePageContext(s: {
  period: WastePeriod;
  entries: number;
  search: string;
  logging: boolean;
  itemId: string | null;
  itemName: string;
}): void {
  const { period, entries, search, logging, itemId, itemName } = s;
  // The period's days roll over at midnight on a page left open.
  const today = dateKey(useNow(60_000));
  const context = useMemo(
    () => wastePageContext({ today, period, entries, search, logging, itemId, itemName }),
    [today, period, entries, search, logging, itemId, itemName],
  );
  useMerchivaPageContext(context);
}
