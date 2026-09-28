"use client";

import { useMemo } from "react";
import { reportsPageContext } from "@/lib/merchiva/data-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

interface Bounds {
  start: string;
  end: string;
}

/** Tells Mr. Merchiva which periods the reports page covers (its sales and staff range pickers). */
export function useReportsPageContext(s: {
  salesRange: string;
  salesBounds: Bounds;
  staffRange: string;
  staffBounds: Bounds;
}): void {
  const { salesRange, staffRange } = s;
  const { start: salesFrom, end: salesTo } = s.salesBounds;
  const { start: staffFrom, end: staffTo } = s.staffBounds;
  const context = useMemo(
    () =>
      reportsPageContext({
        sales: { range: salesRange, from: salesFrom, to: salesTo },
        staff: { range: staffRange, from: staffFrom, to: staffTo },
      }),
    [salesRange, salesFrom, salesTo, staffRange, staffFrom, staffTo],
  );
  useMerchivaPageContext(context);
}
