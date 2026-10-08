"use client";

import { useMemo } from "react";
import { financesPageContext } from "@/lib/merchiva/data-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

/** Tells Mr. Merchiva which finances tab is open. */
export function useFinancesPageContext(tab: string): void {
  const context = useMemo(() => financesPageContext(tab), [tab]);
  useMerchivaPageContext(context);
}
