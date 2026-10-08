/**
 * viewRestockSuggestions — lib/restock.ts `generateRestockSuggestions`, run on
 * the server with the inputs the Inventory page's Restock tab uses: the org's
 * inventory items and inventory transactions, mapped as
 * lib/spacetimedb/hooks/useInventory.ts maps them.
 *
 * The Restock tab only sees the recent window the client subscribes to, so the
 * tool works from that window (RESTOCK_HISTORY_DAYS) — daily usage, trend,
 * days until stockout and priority all depend on it. The tool's rows are
 * loaded for that window already (tool-tables.ts); it cuts to it again so the
 * result never depends on how much history reached it.
 *
 * The engine picks the items, priorities and order quantities (min order and
 * whole cases already applied). Costs are re-derived in cents from the exact
 * `costPerUnitCents` column and summed once, so the total the model quotes is
 * exact; suggestions are grouped by supplier, matched to the supplier table,
 * so an orderFromSupplier block can be written straight from the result.
 */

import { tool } from "ai";
import { z } from "zod";
import { centsOf, multiplyCents, toMajor } from "@/lib/money";
import { generateRestockSuggestions } from "@/lib/restock";
import type { InventoryItem, InventoryTransaction } from "@/lib/types";
import { canonicalUuid, opt, orgRows, rowId, type Row, type ToolContext } from "@/lib/merchiva/tools/rows";
import { addDaysToKey } from "@/lib/merchiva/tools/store-time";

/**
 * Days of stock movements the Restock tab works from: `HISTORY_WINDOW_DAYS` in
 * lib/spacetimedb/provider.tsx, which windows the client's inventory_transaction
 * subscription. A test fails if the two drift apart.
 */
export const RESTOCK_HISTORY_DAYS = 120;

/** The movements the Restock tab can see on `today` (the store's day): `date >= today - 120 days`. */
export function withinRestockWindow(transactions: InventoryTransaction[], today: string): InventoryTransaction[] {
  const since = addDaysToKey(today, -RESTOCK_HISTORY_DAYS);
  return transactions.filter((t) => t.date >= since);
}

export const viewRestockSuggestionsInput = z.object({
  supplier: z
    .string()
    .optional()
    .describe("Only suggestions for this supplier name. Omit for every supplier."),
});
export type ViewRestockSuggestionsArgs = z.infer<typeof viewRestockSuggestionsInput>;

export interface SupplierLite {
  id: string;
  name: string;
  language: string;
}

export function toInventoryItem(r: Row): InventoryItem {
  const currentStock = Number(r?.currentStock ?? 0) || 0;
  const minStock = Number(r?.minStock ?? 0) || 0;
  return {
    id: canonicalUuid(rowId(r)),
    name: String(r?.name ?? ""),
    category: String(r?.category ?? ""),
    currentStock,
    minStock,
    maxStock: Number(r?.maxStock ?? 0) || 0,
    unit: String(r?.unit ?? ""),
    costPerUnit: toMajor(centsOf(r, "costPerUnit")),
    supplier: String(r?.supplier ?? ""),
    lastRestocked: String(r?.lastRestocked ?? ""),
    lossRate: Number(r?.lossRate ?? 0) || 0,
    minOrderQty: opt(r?.minOrderQty) ?? undefined,
    unitsPerCase: opt(r?.unitsPerCase) ?? undefined,
    status: currentStock <= 0 ? "out_of_stock" : currentStock <= minStock ? "low_stock" : "in_stock",
  };
}

/** `itemId` is put in the same form `toInventoryItem` gives `id`, so the engine can match them. */
export function toInventoryTransaction(r: Row): InventoryTransaction {
  const itemId = opt(r?.itemId);
  return {
    id: rowId(r),
    itemId: itemId ? canonicalUuid(itemId) : "",
    itemName: String(r?.itemName ?? ""),
    type: String(r?.type ?? "adjustment") as InventoryTransaction["type"],
    quantity: Number(r?.quantity ?? 0) || 0,
    date: String(r?.date ?? ""),
    note: String(r?.note ?? ""),
  };
}

export function toSupplierLite(r: Row): SupplierLite {
  return { id: rowId(r), name: String(r?.name ?? ""), language: String(opt(r?.language) ?? "en") };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Engine suggestions, costed in cents and grouped by supplier. Pure. */
export function computeRestock(
  items: InventoryItem[],
  transactions: InventoryTransaction[],
  costCentsById: Map<string, number>,
  suppliers: SupplierLite[],
  onlySupplier?: string,
) {
  let suggestions = generateRestockSuggestions(items, transactions);
  if (onlySupplier?.trim()) suggestions = suggestions.filter((s) => norm(s.supplier) === norm(onlySupplier));

  const rows = suggestions.map((s) => {
    const unitCostCents = costCentsById.get(s.itemId) ?? 0;
    const costCents = multiplyCents(unitCostCents, s.recommendedOrderQty);
    return {
      itemId: s.itemId,
      name: s.itemName,
      priority: s.priority,
      stock: s.currentStock,
      min: s.minStock,
      max: s.maxStock,
      unit: s.unit,
      dailyUse: s.dailyConsumptionRate,
      trend: s.consumptionTrend,
      daysUntilStockout: s.daysUntilStockout >= 999 ? null : s.daysUntilStockout,
      orderQty: s.recommendedOrderQty,
      unitsPerCase: s.unitsPerCase ?? null,
      cases: s.unitsPerCase ? s.recommendedOrderQty / s.unitsPerCase : null,
      // The item's cost on file, so an orderFromSupplier line carries it and
      // the app can price the order; null when none is recorded.
      unitCost: unitCostCents > 0 ? toMajor(unitCostCents) : null,
      costCents,
      supplier: s.supplier,
    };
  });

  const bySupplier = new Map<string, { name: string; items: number; cents: number }>();
  for (const r of rows) {
    const key = norm(r.supplier);
    const cur = bySupplier.get(key) ?? { name: r.supplier, items: 0, cents: 0 };
    cur.items += 1;
    cur.cents += r.costCents;
    bySupplier.set(key, cur);
  }
  const supplierByName = new Map(suppliers.map((s) => [norm(s.name), s]));

  return {
    count: rows.length,
    critical: rows.filter((r) => r.priority === "critical").length,
    high: rows.filter((r) => r.priority === "high").length,
    totalEstimatedCost: toMajor(rows.reduce((s, r) => s + r.costCents, 0)),
    bySupplier: [...bySupplier.entries()]
      .sort((a, b) => b[1].cents - a[1].cents)
      .map(([key, v]) => {
        const match = key ? supplierByName.get(key) : undefined;
        return {
          supplier: v.name || null,
          supplierId: match?.id ?? null,
          supplierLanguage: match?.language ?? null,
          items: v.items,
          estimatedCost: toMajor(v.cents),
        };
      }),
    suggestions: rows.slice(0, 60).map(({ costCents, ...r }) => ({ ...r, estimatedCost: toMajor(costCents) })),
  };
}

const RESTOCK_TABLES = ["inventoryItem", "inventoryTransaction", "supplier"] as const;

export function viewRestockSuggestionsTool(ctx: ToolContext) {
  return tool({
    description:
      "Restock suggestions from the Inventory page's restock engine: which items to order, priority (critical/high/medium/low), days until stockout, daily usage, and the order quantity with supplier minimums and whole cases already applied, plus unit cost and estimated cost per item, per supplier and in total. Use these as-is in orderFromSupplier / updateInventory blocks (quantity = orderQty, caseCount = cases, unitsPerCase and unitCost as given) — never work out order quantities or costs yourself.",
    inputSchema: viewRestockSuggestionsInput,
    execute: ctx.exec("viewRestockSuggestions", RESTOCK_TABLES, async (data, { supplier }: ViewRestockSuggestionsArgs) => {
      const org = ctx.organizationId;
      const rawItems = orgRows(data, "inventoryItem", org);
      const costCentsById = new Map(rawItems.map((r) => [canonicalUuid(rowId(r)), centsOf(r, "costPerUnit")]));
      return computeRestock(
        rawItems.map(toInventoryItem),
        withinRestockWindow(orgRows(data, "inventoryTransaction", org).map(toInventoryTransaction), ctx.today),
        costCentsById,
        orgRows(data, "supplier", org).map(toSupplierLite),
        supplier,
      );
    }),
  });
}
