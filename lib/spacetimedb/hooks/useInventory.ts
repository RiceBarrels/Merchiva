"use client";
// SpacetimeDB — inventory
// Reads from the real-time SpacetimeDB cache via useTable.

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type { InventoryExpirationBatch, InventoryItem, InventoryTransaction } from "@/lib/types";

function parseEvidenceUrls(value: unknown): { url: string; type: string }[] {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        const item = entry as { url?: unknown; type?: unknown };
        return {
          url: typeof item.url === "string" ? item.url : "",
          type: typeof item.type === "string" ? item.type : "image",
        };
      })
      .filter((item) => item.url.length > 0);
  } catch {
    return [];
  }
}

function parseExpirationBatches(value: unknown): InventoryExpirationBatch[] {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];

    const totals = new Map<string, number>();
    for (const entry of parsed) {
      const item = entry as { expiresOn?: unknown; quantity?: unknown };
      const rawDate = typeof item.expiresOn === "string" ? item.expiresOn.trim() : "";
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      totals.set(rawDate, (totals.get(rawDate) ?? 0) + quantity);
    }

    return [...totals.entries()]
      .sort(([a], [b]) => {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b);
      })
      .map(([expiresOn, quantity]) => ({
        expiresOn: expiresOn || null,
        quantity,
      }));
  } catch {
    return [];
  }
}

export function useInventory(_organizationId: string | null) {
  const { organizationId } = usePermissions();

  const [rawItems, itemsReady]  = useTable(tables.inventoryItem);
  const [rawTx,    txReady]     = useTable(tables.inventoryTransaction);

  const items = useMemo<InventoryItem[]>(() => {
    if (!organizationId) return [];
    return rawItems
      .filter((r) => r.organizationId === organizationId)
      .map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = r as any;
        return {
          id:           r.id.toString(),
          name:         r.name,
          description:  row.description ?? undefined,
          category:     r.category,
          currentStock: r.currentStock,
          minStock:     r.minStock,
          maxStock:     r.maxStock,
          unit:         r.unit,
          costPerUnit:  r.costPerUnit,
          supplier:     r.supplier,
          lastRestocked: r.lastRestocked,
          lossRate:     r.lossRate,
          minOrderQty:  r.minOrderQty ?? undefined,
          unitsPerCase: r.unitsPerCase ?? undefined,
          unitContentAmount: row.unitContentAmount ?? undefined,
          unitContentUnit: row.unitContentUnit ?? undefined,
          retailEnabled: row.retailEnabled ?? undefined,
          retailPrice: row.retailPrice ?? undefined,
          retailDescription: row.retailDescription ?? undefined,
          retailImageUrl: row.retailImageUrl ?? undefined,
          retailUsageQty: row.retailUsageQty ?? undefined,
          expirationBatches: parseExpirationBatches(row.expirationBatches),
          status: (
            r.currentStock <= 0 ? "out_of_stock" :
            r.currentStock <= r.minStock ? "low_stock" : "in_stock"
          ) as InventoryItem["status"],
        };
      });
  }, [rawItems, organizationId]);

  const transactions = useMemo<InventoryTransaction[]>(() => {
    if (!organizationId) return [];
    return rawTx
      .filter((r) => r.organizationId === organizationId)
      .map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = r as any;
        let createdAt: Date | undefined;
        if (row.createdAt && typeof row.createdAt.toDate === "function") {
          createdAt = row.createdAt.toDate() as Date;
        } else if (row.createdAt && typeof row.createdAt.microsSinceUnixEpoch === "bigint") {
          createdAt = new Date(Number(row.createdAt.microsSinceUnixEpoch / BigInt(1000)));
        }
        return {
          id:       r.id.toString(),
          itemId:   r.itemId ?? "",
          itemName: r.itemName,
          type:     r.type as InventoryTransaction["type"],
          quantity: r.quantity,
          date:     r.date,
          note:     r.note,
          operatorMemberId: row.operatorMemberId ?? undefined,
          operatorName: row.operatorName ?? undefined,
          createdAt,
          evidenceUrls: parseEvidenceUrls(row.evidenceUrls),
          batchExpirationDate: row.batchExpirationDate ?? undefined,
        };
      });
  }, [rawTx, organizationId]);

  const isReady = itemsReady && txReady;

  return {
    items,
    transactions,
    isReady,
    refreshing: false,
    userId: null,
    // setters are no-ops — mutations go through SpacetimeDB reducers
    setItems: (_?: any) => {},
    setTransactions: (_?: any) => {},
    refresh: () => {},
  };
}
