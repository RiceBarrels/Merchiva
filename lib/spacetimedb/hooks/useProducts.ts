"use client";
// Compatibility hook: sellable products now live on inventory_item rows.
// A row is a product when retailEnabled is true.

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import { dateKey } from "@/lib/date-key";
import { centsOf, multiplyCents, toCents, toMajor } from "@/lib/money";
import { timestampToMs } from "@/lib/spacetimedb/timestamp";
import type { Product } from "@/lib/types";

function rowIdString(id: unknown): string {
  const value = id as { toHexString?: () => string; toString?: () => string } | null | undefined;
  if (typeof value?.toHexString === "function") return value.toHexString();
  return String(value ?? "");
}

/** Units and revenue for one product, aggregated from completed POS sales. */
interface SoldTotals {
  thisMonth: number;
  lastMonth: number;
  revenue: number;
}

/**
 * Units sold and revenue per product name, from `payment.items`.
 *
 * These three fields used to be hardcoded to 0 for every row, so "Total
 * Revenue" on /manager/products was always $0, the revenue chart was a flat
 * line, "top product" was whatever happened to sort first, and the two
 * demand-based pricing suggestions could never fire because both require
 * `unitsSoldLastMonth > 0`.
 *
 * `payment.items` is a JSON array of `{ name, quantity, price? }` (the same
 * shape components/item-forecast.tsx reads). Revenue is summed in cents from
 * the line's own price when it carries one, and from the product's current
 * retail price otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function soldTotalsByName(payments: readonly any[], organizationId: string): Map<string, SoldTotals> {
  const now = new Date();
  const thisMonthPrefix = dateKey(now).slice(0, 7);
  const lastMonthPrefix = dateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);

  const out = new Map<string, SoldTotals & { revenueCents: number }>();
  for (const payment of payments) {
    if (payment.organizationId !== organizationId) continue;
    if (payment.status !== "completed") continue;
    const ms = timestampToMs(payment.createdAt);
    if (!Number.isFinite(ms)) continue;
    const monthPrefix = dateKey(new Date(ms)).slice(0, 7);
    if (monthPrefix !== thisMonthPrefix && monthPrefix !== lastMonthPrefix) continue;

    let lines: Array<{ name?: unknown; quantity?: unknown; price?: unknown }>;
    try {
      const parsed = JSON.parse(String(payment.items ?? "[]"));
      if (!Array.isArray(parsed)) continue;
      lines = parsed;
    } catch {
      continue;
    }

    for (const line of lines) {
      const name = String(line?.name ?? "").trim().toLowerCase();
      const quantity = Number(line?.quantity ?? 0);
      if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
      const entry = out.get(name) ?? { thisMonth: 0, lastMonth: 0, revenue: 0, revenueCents: 0 };
      if (monthPrefix === thisMonthPrefix) {
        entry.thisMonth += quantity;
        const unitCents = typeof line?.price === "number" ? toCents(line.price) : centsOf(line, "price");
        if (unitCents > 0) entry.revenueCents += multiplyCents(unitCents, quantity);
      } else {
        entry.lastMonth += quantity;
      }
      out.set(name, entry);
    }
  }
  // Convert once, at the end.
  const totals = new Map<string, SoldTotals>();
  for (const [name, entry] of out) {
    totals.set(name, { thisMonth: entry.thisMonth, lastMonth: entry.lastMonth, revenue: toMajor(entry.revenueCents) });
  }
  return totals;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inventoryRowToProduct(row: any, sold?: SoldTotals): Product {
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
    unitsSoldThisMonth: sold?.thisMonth ?? 0,
    unitsSoldLastMonth: sold?.lastMonth ?? 0,
    // Lines that carried no unit price fall back to the product's own retail
    // price, which is the only other figure available.
    revenue: sold
      ? sold.revenue > 0
        ? sold.revenue
        : toMajor(multiplyCents(toCents(price), sold.thisMonth))
      : 0,
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
  const [rawPayments] = useTable(tables.payment);

  const sold = useMemo(
    () => (organizationId ? soldTotalsByName(rawPayments, organizationId) : new Map<string, SoldTotals>()),
    [rawPayments, organizationId],
  );

  const products = useMemo<Product[]>(() => {
    if (!organizationId) return [];
    return rawItems
      .filter((row) => String(row.organizationId) === organizationId)
      .filter((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = row as any;
        return item.retailEnabled === true && Number(item.retailPrice ?? 0) > 0;
      })
      .map((row) => inventoryRowToProduct(row, sold.get(String(row.name ?? "").trim().toLowerCase())));
  }, [rawItems, organizationId, sold]);

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
