"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getActiveOrgId } from "@/lib/spacetimedb/client";
import { offlineCache } from "@/lib/offline";
import type { OrgSnapshot } from "@/lib/offline";

const DEBOUNCE_MS = 30_000; // 30 seconds

/**
 * Subscribes to SpacetimeDB data changes and caches current org data
 * to IndexedDB for offline access. Debounced to avoid excessive writes.
 *
 * Call once in the app layout (inside SpacetimeProvider + AuthLoader).
 */
export function useOfflineSync(): {
  lastSynced: Date | null;
  isCaching: boolean;
} {
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isCaching, setIsCaching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to the relevant tables
  const [shifts] = useTable(tables.shift);
  const [inventoryItems] = useTable(tables.inventoryItem);
  const [todos] = useTable(tables.todo);
  const [notifications] = useTable(tables.notification);
  const [wasteLogs] = useTable(tables.wasteLog);

  const cacheData = useCallback(async () => {
    let orgId: string;
    try {
      orgId = getActiveOrgId();
    } catch {
      // Org not loaded yet, skip caching
      return;
    }

    setIsCaching(true);
    try {
      const snapshot: OrgSnapshot = {
        orgId,
        cachedAt: new Date().toISOString(),
        shifts: shifts.map((s) => ({ ...s })),
        inventoryItems: inventoryItems.map((i) => ({ ...i })),
        todos: todos.map((t) => ({ ...t })),
        notifications: notifications.map((n) => ({ ...n })),
        wasteLogs: wasteLogs.map((w) => ({ ...w })),
      };

      await offlineCache.cacheOrgData(orgId, snapshot);
      setLastSynced(new Date());
    } catch (err) {
      console.warn("[useOfflineSync] Failed to cache org data:", err);
    } finally {
      setIsCaching(false);
    }
  }, [shifts, inventoryItems, todos, notifications, wasteLogs]);

  // Debounced cache writes when data changes
  useEffect(() => {
    // Don't cache until we have at least some data
    if (
      shifts.length === 0 &&
      inventoryItems.length === 0 &&
      todos.length === 0 &&
      notifications.length === 0 &&
      wasteLogs.length === 0
    ) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      cacheData();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [cacheData, shifts, inventoryItems, todos, notifications, wasteLogs]);

  // Do an initial cache on mount (after a short delay to let data settle)
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      cacheData();
    }, 5000);

    return () => clearTimeout(initialTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { lastSynced, isCaching };
}
