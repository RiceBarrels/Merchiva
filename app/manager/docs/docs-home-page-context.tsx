"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { parseDocsHomeParams } from "@/components/docs/home/doc-list-model";
import { docsHomePageContext } from "@/lib/merchiva/workspace-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

/**
 * Tells Mr. Merchiva which documents the Docs home lists. On /manager its scope, owner filter,
 * sort and search live in the URL (use-docs-home-state.ts), so they are read from there rather
 * than from inside DocsHome. Renders nothing; sits inside the page's Suspense for useSearchParams.
 */
export function DocsHomePageContext() {
  const searchParams = useSearchParams();
  const { scope, owner, sort, q } = parseDocsHomeParams(searchParams);
  const context = useMemo(() => docsHomePageContext({ scope, owner, sort, search: q }), [scope, owner, sort, q]);
  useMerchivaPageContext(context);
  return null;
}
