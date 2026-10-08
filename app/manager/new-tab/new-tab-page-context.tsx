"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { newTabPageContext } from "@/lib/merchiva/workspace-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

/**
 * Tells Mr. Merchiva the tab is on the New Tab page, with the search it was opened with (`?q=`).
 * Renders nothing; sits inside the page's Suspense for useSearchParams.
 */
export function NewTabPageContext() {
  const query = useSearchParams()?.get("q") ?? "";
  const context = useMemo(() => newTabPageContext(query), [query]);
  useMerchivaPageContext(context);
  return null;
}
