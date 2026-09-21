"use client";
// Compatibility hook: sellable products now live on inventory_item rows.
// A row is a product when retailEnabled is true.

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type { Product } from "@/lib/types";

function rowIdString(id: unknown): string {
  const value = id as { toHexString?: () => string; toString?: () => string } | null | undefined;
  if (typeof value?.toHexString === "function") return value.toHexString();
  return String(value ?? "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inventoryRowToProduct(row: any): Product {
  const id = rowIdString(row.id);
  const usageQty = Number(row.retailUsageQty ?? 1) || 1;
  const price = Number(row.retailPrice ?? 0) || 0;
  const cost = Math.round((Number(row.costPerUnit ?? 0) || 0) * usageQty * 100) / 100;
  return {
    id,
    name: row.name,
    category: row.category || "Retail",
    price,
    cost,
    unitsSoldThisMonth: 0,
    unitsSoldLastMonth: 0,
    revenue: 0,
    margin: price > 0 ? ((price - cost) / price) * 100 : 0,
    rating: 5,
    trend: "stable",
    alert: "none",
    alertReason: undefined,
    imageUrl: row.retailImageUrl ?? undefined,
    description: row.retailDescription ?? row.description ?? undefined,
    inventoryUsage: [{
      inventoryItemId: id,
      inventoryItemName: row.name,
      quantity: usageQty,
      unit: row.unit,
    }],
    organizationId: String(row.organizationId ?? ""),
  };
}

export function useProducts(_organizationId: string | null) {
  const { organizationId } = usePermissions();
  const [rawItems, isReady] = useTable(tables.inventoryItem);

  const products = useMemo<Product[]>(() => {
    if (!organizationId) return [];
    return rawItems
      .filter((row) => String(row.organizationId) === organizationId)
      .filter((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = row as any;
        return item.retailEnabled === true && Number(item.retailPrice ?? 0) > 0;
      })
      .map(inventoryRowToProduct);
  }, [rawItems, organizationId]);

  return {
    products,
    productsForCurrentStore: products,
    isReady,
    refreshing: false,
    userId: null,
    setProducts: (_?: unknown) => {},
    refresh: () => {},
  };
}
