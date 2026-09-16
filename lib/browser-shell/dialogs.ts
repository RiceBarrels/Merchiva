import { useMemo } from "react";
import {
  useDynamicUIElementSwipeProgress,
  useDynamicUIElementTitle,
  useOpenDynamicUIElementCount,
} from "@/components/ui/dynamic-ui-element";
import { useActiveTab, useTabHistory, useTabsSnapshot } from "./hooks";
import type { ActiveNavState } from "./types";

/** Closes the topmost DynamicUIElement dialog (plan §B1.6); implemented next to the other DOM contracts. */
export { closeTopDialog } from "./shell-dom";

/** Back/forward availability for the chromes' navigation buttons. */
export function useActiveNavState(): ActiveNavState {
  const openDialogs = useOpenDynamicUIElementCount();
  const dialogTitle = useDynamicUIElementTitle();
  const dialogSwipe = useDynamicUIElementSwipeProgress();
  const { tabs } = useTabsSnapshot();
  const tab = useActiveTab();
  const history = useTabHistory(tab?.id ?? null);

  return useMemo<ActiveNavState>(() => {
    const dialogOpen = openDialogs > 0;
    const openerId = tab?.openerTabId ?? null;
    const backClosesTab =
      !!tab && !history.canGoBack && openerId !== null && tabs.some((candidate) => candidate.id === openerId);
    return {
      canGoBack: dialogOpen || history.canGoBack || backClosesTab,
      canGoForward: !dialogOpen && history.canGoForward,
      dialogOpen,
      dialogTitle,
      dialogSwipe,
      backClosesTab,
    };
  }, [openDialogs, dialogTitle, dialogSwipe, tabs, tab, history]);
}
