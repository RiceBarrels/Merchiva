/**
 * Purchase-order totals, computed from the order's own lines. Pure.
 *
 * "Algorithms compute, AI explains": orderFromSupplier and createPurchaseOrder
 * never take a subtotal or total from the model. One that understated a total
 * would record a wrong PO and, worse, slip past the autonomy gate's
 * auto-approve cap (lib/merchiva/autonomy.ts). Each line is unitCost ×
 * quantity in exact cents (lib/money.ts), summed once and converted once.
 */

import { toCents, toMajor } from "@/lib/money";

export interface OrderTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** Lines with no usable unit cost: their value is unknown, not zero. */
  unpricedLines: number;
  /** Lines with a negative quantity or unit cost; left out of the sums. */
  invalidLines: number;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Totals for an order's `items` (`[{quantity | qty, unitCost | cost, …}]`, the
 * fields orderFromSupplier reads) plus `tax`. A missing quantity counts as 0,
 * as the order itself does; a negative or unreadable tax counts as 0, since
 * tax can only add to an order.
 */
export function computeOrderTotals(items: unknown, tax?: unknown): OrderTotals {
  let subtotalCents = 0;
  let unpricedLines = 0;
  let invalidLines = 0;
  for (const raw of Array.isArray(items) ? items : []) {
    const line = (raw ?? {}) as Record<string, unknown>;
    const quantity = finite(line.quantity ?? line.qty) ?? 0;
    const unitCost = finite(line.unitCost ?? line.cost);
    if (quantity < 0 || (unitCost !== null && unitCost < 0)) {
      invalidLines += 1;
      continue;
    }
    if (unitCost === null) {
      unpricedLines += 1;
      continue;
    }
    // One rounding per line, of the line's own value: a sub-cent unit cost
    // (0.125 a cup) stays exact across a large quantity.
    subtotalCents += toCents(unitCost * quantity);
  }
  const taxCents = Math.max(0, toCents(finite(tax) ?? 0));
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents, unpricedLines, invalidLines };
}

/**
 * {@link computeOrderTotals} for recording a PO: a negative line would pull the
 * sums down, so it stops the order instead of being left out.
 */
export function computeOrderTotalsStrict(items: unknown, tax?: unknown): OrderTotals {
  const totals = computeOrderTotals(items, tax);
  if (totals.invalidLines > 0) throw new Error("Order quantities and unit costs cannot be negative.");
  return totals;
}

/** The same totals in major units, for the reducers and the order email. */
export function orderAmounts(totals: OrderTotals): { subtotal: number; tax: number; total: number } {
  return {
    subtotal: toMajor(totals.subtotalCents),
    tax: toMajor(totals.taxCents),
    total: toMajor(totals.totalCents),
  };
}

/**
 * Overwrites the model's `subtotal` / `tax` / `total` on an order action's
 * params with the computed ones, so the approval card shows what will be
 * recorded. With no priced line there is no amount to show (the PO goes out
 * as "pending quote"), so subtotal and total are removed instead.
 */
export function applyOrderTotals(params: Record<string, unknown>): OrderTotals {
  const totals = computeOrderTotals(params.items, params.tax);
  const amounts = orderAmounts(totals);
  const lines = Array.isArray(params.items) ? params.items.length : 0;
  const priced = lines - totals.unpricedLines - totals.invalidLines > 0;
  if (params.tax !== undefined) params.tax = amounts.tax;
  if (priced) {
    params.subtotal = amounts.subtotal;
    params.total = amounts.total;
  } else {
    delete params.subtotal;
    delete params.total;
  }
  return totals;
}
