import { commitActivation, createTab, findByUrlKey, insertTab, patchEntryUrl, pushEntry, replaceEntry, urlKeyOf, type IdGen } from "./model";
import { MAX_TABS, currentEntry, type EntryKey, type TabId, type TabUrl, type TabsSnapshot } from "./types";

/*
 * The deep-link step of the tab store's boot policy (tab-state §9.2, store.ts bootState): a cold
 * load on a tab URL that is no reload, app launch or org switch — a bookmark, a login `?next=`, a
 * notification tap. The browser already shows the URL, so this only places it in the restored
 * tabs and activates the tab that holds it; nothing navigates. Pure, so the rules are unit-tested.
 */

export interface DeepLinkBoot {
  readonly state: TabsSnapshot;
  /** The entry that holds the boot URL: access validation never removes it. */
  readonly protectEntryKey: EntryKey | null;
}

/**
 * Places `url` in the restored tabs (`activeId` is the restored active tab):
 * - a tab already showing the URL is reused, hidden or not;
 * - otherwise a new tab is appended, or at MAX_TABS the active tab's entry is replaced;
 * - the single-tab phone layout (single-tab.ts) never appends or reveals one: it could neither show
 *   nor close it, so every notification tap would leave one more hidden tab, and switching to a
 *   hidden tab would hide the page the user was on behind that tab's old history. Only the tab on
 *   screen is reused; otherwise the URL is pushed onto it, so Back returns to the page the user
 *   was on.
 */
export function placeDeepLink(
  st: TabsSnapshot,
  activeId: TabId,
  url: TabUrl,
  now: number,
  ids: IdGen,
  singleTab: boolean,
): DeepLinkBoot {
  const key = urlKeyOf(url);
  const shown = singleTab ? st.tabs.find((tab) => tab.id === activeId) : undefined;
  const existing = singleTab ? (shown && urlKeyOf(currentEntry(shown).url) === key ? shown : null) : findByUrlKey(st, key);
  if (existing) {
    const entry = currentEntry(existing);
    return { state: commitActivation(patchEntryUrl(st, entry.key, url), existing.id, now), protectEntryKey: entry.key };
  }
  if (!singleTab && st.tabs.length < MAX_TABS) {
    const tab = createTab(url, now, ids);
    return { state: commitActivation(insertTab(st, tab, "end", null), tab.id, now), protectEntryKey: tab.history.entries[0].key };
  }
  const placed = singleTab ? pushEntry(st, activeId, url, now, ids) : replaceEntry(st, activeId, url, now, ids);
  return { state: commitActivation(placed.state, activeId, now), protectEntryKey: placed.entry?.key ?? null };
}
