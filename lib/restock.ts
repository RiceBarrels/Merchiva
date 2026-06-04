import type { InventoryItem, InventoryTransaction } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RestockPriority = "critical" | "high" | "medium" | "low";

export type ConsumptionTrend = "increasing" | "stable" | "decreasing";

export interface RestockSuggestion {
  itemId: string;
  itemName: string;
  category: string;
  priority: RestockPriority;
  currentStock: number;
  maxStock: number;
  minStock: number;
  unit: string;
  dailyConsumptionRate: number;
  consumptionTrend: ConsumptionTrend;
  daysUntilStockout: number;
  recommendedOrderQty: number;
  estimatedCost: number;
  supplier: string;
  lastRestocked: string;
  costPerUnit: number;
  unitsPerCase?: number; // set when item ships in fixed-size cases
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / msPerDay;
}

function computeDailyConsumption(
  item: InventoryItem,
  transactions: InventoryTransaction[]
): { rate: number; trend: ConsumptionTrend } {
  const outTxns = transactions
    .filter((t) => t.itemId === item.id && (t.type === "out" || t.type === "loss"))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (outTxns.length === 0) {
    // Estimate from stock position since last restock
    const daysSinceRestock = Math.max(1, daysBetween(item.lastRestocked, new Date().toISOString()));
    const consumed = item.maxStock - item.currentStock;
    const rate = consumed > 0 ? consumed / daysSinceRestock : 0;
    return { rate: Math.round(rate * 100) / 100, trend: "stable" };
  }

  // Total consumed
  const totalConsumed = outTxns.reduce((sum, t) => sum + t.quantity, 0);
  const firstDate = outTxns[0].date;
  const lastDate = outTxns[outTxns.length - 1].date;
  const spanDays = Math.max(1, daysBetween(firstDate, lastDate) || 1);
  const rate = totalConsumed / spanDays;

  // Trend: compare first-half vs second-half consumption rates
  let trend: ConsumptionTrend = "stable";
  if (outTxns.length >= 4) {
    const mid = Math.floor(outTxns.length / 2);
    const firstHalf = outTxns.slice(0, mid);
    const secondHalf = outTxns.slice(mid);
    const firstHalfTotal = firstHalf.reduce((s, t) => s + t.quantity, 0);
    const secondHalfTotal = secondHalf.reduce((s, t) => s + t.quantity, 0);
    const firstHalfDays = Math.max(1, daysBetween(firstHalf[0].date, firstHalf[firstHalf.length - 1].date) || 1);
    const secondHalfDays = Math.max(1, daysBetween(secondHalf[0].date, secondHalf[secondHalf.length - 1].date) || 1);
    const firstRate = firstHalfTotal / firstHalfDays;
    const secondRate = secondHalfTotal / secondHalfDays;
    if (secondRate > firstRate * 1.2) trend = "increasing";
    else if (secondRate < firstRate * 0.8) trend = "decreasing";
  }

  return { rate: Math.round(rate * 100) / 100, trend };
}

function determinePriority(
  daysUntilStockout: number,
  currentStock: number,
  minStock: number
): RestockPriority {
  if (currentStock === 0 || daysUntilStockout <= 1) return "critical";
  if (daysUntilStockout <= 3 || currentStock <= minStock * 0.5) return "critical";
  if (daysUntilStockout <= 7 || currentStock <= minStock) return "high";
  if (daysUntilStockout <= 14 || currentStock <= minStock * 1.5) return "medium";
  return "low";
}

// Adjust a raw recommended quantity to what the supplier will actually accept:
// bump up to the minimum order quantity, then round up to a whole multiple of
// the case/pack size so we never order a partial case.
function applyOrderConstraints(
  qty: number,
  minOrderQty?: number,
  unitsPerCase?: number
): number {
  let result = qty;
  if (minOrderQty && minOrderQty > 0) {
    result = Math.max(result, minOrderQty);
  }
  if (unitsPerCase && unitsPerCase > 0) {
    result = Math.ceil(result / unitsPerCase) * unitsPerCase;
  }
  return result;
}

const PRIORITY_ORDER: Record<RestockPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Main Function ──────────────────────────────────────────────────────────

export function generateRestockSuggestions(
  items: InventoryItem[],
  transactions: InventoryTransaction[]
): RestockSuggestion[] {
  const suggestions: RestockSuggestion[] = [];

  for (const item of items) {
    const { rate, trend } = computeDailyConsumption(item, transactions);

    const daysUntilStockout =
      rate > 0 ? Math.round(item.currentStock / rate) : 999;

    const priority = determinePriority(daysUntilStockout, item.currentStock, item.minStock);

    // Only suggest restocking for items that actually need it
    if (priority === "low" && item.currentStock > item.minStock * 2) continue;

    // Order enough to fill back to max, at minimum fill to minStock
    const deficit = item.maxStock - item.currentStock;
    let recommendedOrderQty = Math.max(
      Math.ceil(deficit),
      Math.ceil(item.minStock - item.currentStock)
    );

    if (recommendedOrderQty <= 0) continue;

    // Respect supplier ordering constraints: never order below the supplier's
    // minimum, and round up to whole cases so we order in the packs they ship.
    recommendedOrderQty = applyOrderConstraints(
      recommendedOrderQty,
      item.minOrderQty,
      item.unitsPerCase
    );

    const estimatedCost = Math.round(recommendedOrderQty * item.costPerUnit * 100) / 100;

    suggestions.push({
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      priority,
      currentStock: item.currentStock,
      maxStock: item.maxStock,
      minStock: item.minStock,
      unit: item.unit,
      dailyConsumptionRate: rate,
      consumptionTrend: trend,
      daysUntilStockout,
      recommendedOrderQty,
      estimatedCost,
      supplier: item.supplier,
      lastRestocked: item.lastRestocked,
      costPerUnit: item.costPerUnit,
      unitsPerCase: item.unitsPerCase,
    });
  }

  // Sort by priority (critical first), then by days until stockout
  suggestions.sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.daysUntilStockout - b.daysUntilStockout;
  });

  return suggestions;
}

// ─── Purchase Order Formatter ───────────────────────────────────────────────

export function formatPurchaseOrder(
  suggestions: RestockSuggestion[]
): { headers: string[]; rows: string[][] } {
  const headers = [
    "Item",
    "Category",
    "Priority",
    "Current Stock",
    "Order Qty",
    "Unit",
    "Cost/Unit",
    "Est. Cost",
    "Supplier",
    "Days Until Stockout",
  ];

  const rows = suggestions.map((s) => [
    s.itemName,
    s.category,
    s.priority.charAt(0).toUpperCase() + s.priority.slice(1),
    String(s.currentStock),
    String(s.recommendedOrderQty),
    s.unit,
    `$${s.costPerUnit.toFixed(2)}`,
    `$${s.estimatedCost.toFixed(2)}`,
    s.supplier,
    s.daysUntilStockout >= 999 ? "N/A" : String(s.daysUntilStockout),
  ]);

  return { headers, rows };
}
