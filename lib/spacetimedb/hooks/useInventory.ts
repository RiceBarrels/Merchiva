"use client";
// SpacetimeDB — inventory
// Reads from the real-time SpacetimeDB cache via useTable.

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type { InventoryItem, InventoryTransaction } from "@/lib/types";

export function useInventory(_organizationId: string | null) {
  const { organizationId } = usePermissions();

  const [rawItems, itemsReady]  = useTable(tables.inventoryItem);
  const [rawTx,    txReady]     = useTable(tables.inventoryTransaction);

  const items = useMemo<InventoryItem[]>(() => {
    if (!organizationId) return [];
    return rawItems
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id:           r.id.toString(),
        name:         r.name,
        category:     r.category,
        currentStock: r.currentStock,
        minStock:     r.minStock,
        maxStock:     r.maxStock,
        unit:         r.unit,
        costPerUnit:  r.costPerUnit,
        supplier:     r.supplier,
        lastRestocked: r.lastRestocked,
        lossRate:     r.lossRate,
        status: (
          r.currentStock <= 0 ? "out_of_stock" :
          r.currentStock <= r.minStock ? "low_stock" : "in_stock"
        ) as InventoryItem["status"],
      }));
  }, [rawItems, organizationId]);

  const transactions = useMemo<InventoryTransaction[]>(() => {
    if (!organizationId) return [];
    return rawTx
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id:       r.id.toString(),
        itemId:   r.itemId ?? "",
        itemName: r.itemName,
        type:     r.type as InventoryTransaction["type"],
        quantity: r.quantity,
        date:     r.date,
        note:     r.note,
      }));
  }, [rawTx, organizationId]);

  const isReady = itemsReady && txReady;

  return {
    items,
    transactions,
    isReady,
    refreshing: false,
    userId: null,
    // setters are no-ops — mutations go through SpacetimeDB reducers
    setItems: () => {},
    setTransactions: () => {},
    refresh: () => {},
  } as const;
}
