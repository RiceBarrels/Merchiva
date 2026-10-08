"use client";

// Replaces the spreadsheet's URL instead of adding a history entry (sheets.md §10.2): a bad id or a wrong-type id
// leaving for Drive or its own editor, and `?new=1` leaving the URL. The Docs opener (useDocsOpenUrl) only pushes, so
// Back would land on the URL that redirects forward again. On /manager this is the shell's navigateActive in replace
// mode; a device panel has no URL of its own, so its opener override runs as before.

import { useCallback } from "react";

import { useDocsOpenOverride } from "@/components/docs/docs-open-context";
import { useTabActions } from "@/lib/browser-shell";

export function useSheetReplaceUrl(): (url: string) => void {
  const override = useDocsOpenOverride();
  const { navigateActive } = useTabActions();
  return useCallback(
    (url: string) => {
      if (override) override(url, "current");
      else navigateActive(url, { mode: "replace" });
    },
    [override, navigateActive],
  );
}
