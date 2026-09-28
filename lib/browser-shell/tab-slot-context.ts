import { createContext, useContext } from "react";
import type { TabId } from "./types";

/**
 * The tab whose keep-alive slot a page renders in (TabPageOutlet). Null outside the browser shell
 * and in the boot slot before the tab store binds; hooks then fall back to the rendered tab.
 */
export const TabSlotContext = createContext<TabId | null>(null);

/** Tab id of the slot this component renders in, or null (see TabSlotContext). */
export function useTabSlotId(): TabId | null {
  return useContext(TabSlotContext);
}
