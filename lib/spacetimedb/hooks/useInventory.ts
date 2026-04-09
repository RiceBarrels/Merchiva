"use client";
// SpacetimeDB migration layer — inventory
// Returns [data, isReady] pattern matching useTable from spacetimedb/react.
// Backed by Supabase until the generated SpacetimeDB client is available.
// TODO: replace internals with:
//   const [items] = useTable(tables.inventoryItem.where(r => r.organizationId.eq(orgId)));

import { useState, useEffect, useCallback } from "react";
import {
  getInventoryItems,
  getInventoryTransactions,
} from "@/lib/db/inventory";
import { createClient } from "@/lib/supabase/client";
import { getCached, setCache } from "@/lib/cache";
import type { InventoryItem, InventoryTransaction } from "@/lib/types";

type InvCache = { items: InventoryItem[]; transactions: InventoryTransaction[] };

export function useInventory(organizationId: string | null) {
  const cacheKey = organizationId ? `inventory_${organizationId}` : null;

  const [items, setItems] = useState<InventoryItem[]>(
    () => (cacheKey ? getCached<InvCache>(cacheKey)?.items ?? [] : [])
  );
  const [transactions, setTransactions] = useState<InventoryTransaction[]>(
    () => (cacheKey ? getCached<InvCache>(cacheKey)?.transactions ?? [] : [])
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  const refresh = useCallback(() => {
    if (!organizationId) return;
    setRefreshing(true);
    Promise.all([getInventoryItems(), getInventoryTransactions()])
      .then(([inv, tx]) => {
        setItems(inv);
        setTransactions(tx);
        if (cacheKey) setCache(cacheKey, { items: inv, transactions: tx });
      })
      .catch((err) => console.error("[useInventory]", err))
      .finally(() => {
        setRefreshing(false);
        setIsReady(true);
      });
  }, [organizationId, cacheKey]);

  useEffect(() => {
    if (!organizationId) return;
    refresh();
  }, [organizationId, refresh]);

  return { items, setItems, transactions, setTransactions, refreshing, isReady, userId, refresh } as const;
}
