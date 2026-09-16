import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth/context";
import { usePermissions } from "@/lib/context/permissions";
import { createScopedListStorage } from "./scoped-list-storage";
import { canonicalizeUrl } from "./url";
import type { BrowsingHistoryItem, TabUrl } from "./types";

/** Dispatched on `window` after every local write. */
export const BROWSING_HISTORY_CHANGE_EVENT = "merchiva:history-change";
export const MAX_HISTORY_ITEMS = 200;
const MAX_TITLE_LEN = 200;

export interface BrowsingHistoryScope {
  readonly userId: string;
  readonly organizationId: string;
}

export function browsingHistoryStorageKey(scope: BrowsingHistoryScope): string {
  return `merchiva_history:v1:${scope.userId}:${scope.organizationId}`;
}

function isHistoryItem(value: unknown): value is BrowsingHistoryItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.url === "string" && typeof v.title === "string" && typeof v.at === "number" && Number.isFinite(v.at);
}

const storage = createScopedListStorage<BrowsingHistoryItem>(BROWSING_HISTORY_CHANGE_EVENT, isHistoryItem);

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LEN);
}

function sameUrl(a: string, b: string): boolean {
  const ka = canonicalizeUrl(a)?.key;
  return ka !== undefined && ka === canonicalizeUrl(b)?.key;
}

/**
 * Core-internal (called by the tab store on every committed URL change).
 * Newest first; a repeat visit to the URL already on top only refreshes its time/title.
 */
export function recordBrowsingVisit(scope: BrowsingHistoryScope, url: TabUrl, title: string, at: number = Date.now()): void {
  const canonical = canonicalizeUrl(url);
  if (!canonical || !canonical.tabbable) return;
  const key = browsingHistoryStorageKey(scope);
  const items = storage.read(key);
  const head = items[0];
  const nextTitle = cleanTitle(title);
  if (head && sameUrl(head.url, canonical.url)) {
    storage.write(key, [{ url: canonical.url, title: nextTitle || head.title, at }, ...items.slice(1)]);
    return;
  }
  storage.write(key, [{ url: canonical.url, title: nextTitle, at }, ...items].slice(0, MAX_HISTORY_ITEMS));
}

/** Core-internal (useSetTabTitle): updates the most recent visit of `url`. */
export function updateBrowsingHistoryTitle(scope: BrowsingHistoryScope, url: TabUrl, title: string): void {
  const nextTitle = cleanTitle(title);
  if (!nextTitle) return;
  const key = browsingHistoryStorageKey(scope);
  const items = storage.read(key);
  const index = items.findIndex((item) => sameUrl(item.url, url));
  if (index < 0 || items[index].title === nextTitle) return;
  const next = items.slice();
  next[index] = { ...items[index], title: nextTitle };
  storage.write(key, next);
}

export function clearBrowsingHistory(scope: BrowsingHistoryScope): void {
  storage.write(browsingHistoryStorageKey(scope), []);
}

function getServerHistory(): readonly BrowsingHistoryItem[] {
  return storage.empty;
}

/** Visited in-app URLs for the signed-in user and current org, newest first. */
export function useBrowsingHistory(): { entries: readonly BrowsingHistoryItem[]; clear(): void } {
  const { user } = useAuth();
  const { organizationId } = usePermissions();
  const userId = user?.id ?? null;
  const scope = useMemo<BrowsingHistoryScope | null>(
    () => (userId && organizationId ? { userId, organizationId } : null),
    [userId, organizationId],
  );

  const getSnapshot = useCallback(() => (scope ? storage.read(browsingHistoryStorageKey(scope)) : storage.empty), [scope]);
  const entries = useSyncExternalStore(storage.subscribe, getSnapshot, getServerHistory);

  const clear = useCallback(() => {
    if (scope) clearBrowsingHistory(scope);
  }, [scope]);

  return useMemo(() => ({ entries, clear }), [entries, clear]);
}
