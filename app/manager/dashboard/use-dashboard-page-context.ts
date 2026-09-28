"use client";

import { useMemo } from "react";
import { dashboardPageContext } from "@/lib/merchiva/workspace-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

/** Tells Mr. Merchiva the tab is on the dashboard for `today` (a YYYY-MM-DD key). */
export function useDashboardPageContext(today: string): void {
  const context = useMemo(() => dashboardPageContext(today), [today]);
  useMerchivaPageContext(context);
}
