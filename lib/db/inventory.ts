// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { InventoryItem, InventoryTransaction, InventoryStatus } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStatus(current: number, min: number): InventoryStatus {
  if (current === 0) return "out_of_stock";
  if (current < min) return "low_stock";
  return "in_stock";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function itemFromRow(row: any): InventoryItem {
  const currentStock = Number(row.currentStock);
  const minStock = Number(row.minStock);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    currentStock,
    minStock,
    maxStock: Number(row.maxStock),
    unit: row.unit,
    costPerUnit: Number(row.costPerUnit),
    supplier: row.supplier ?? "",
    lastRestocked: row.lastRestocked ?? "",
    status: computeStatus(currentStock, minStock),
    lossRate: Number(row.lossRate ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function txFromRow(row: any): InventoryTransaction {
  return {
    id: row.id,
    itemId: row.itemId ?? "",
    itemName: row.itemName,
    type: row.type,
    quantity: Number(row.quantity),
    date: row.date,
    note: row.note ?? "",
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const c = getConnection();
  if (!c) return [];
  const orgId = getActiveOrgId();
  const rows = (c as any).db.inventoryItem.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === orgId)
    .map(itemFromRow);
}

export async function addInventoryItem(
  item: Omit<InventoryItem, "id" | "status">,
  userId: string
): Promise<InventoryItem> {
  console.warn(
    "[inventory] addInventoryItem: writes should go through SpacetimeDB actions.ts"
  );
  throw new Error("addInventoryItem: use SpacetimeDB reducers via actions.ts");
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<InventoryItem>
): Promise<void> {
  console.warn(
    "[inventory] updateInventoryItem: writes should go through SpacetimeDB actions.ts"
  );
  throw new Error("updateInventoryItem: use SpacetimeDB reducers via actions.ts");
}

export async function deleteInventoryItem(id: string): Promise<void> {
  console.warn(
    "[inventory] deleteInventoryItem: writes should go through SpacetimeDB actions.ts"
  );
  throw new Error("deleteInventoryItem: use SpacetimeDB reducers via actions.ts");
}

export async function getInventoryTransactions(): Promise<InventoryTransaction[]> {
  const c = getConnection();
  if (!c) return [];
  const orgId = getActiveOrgId();
  const rows = (c as any).db.inventoryTransaction.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === orgId)
    .map(txFromRow);
}

export async function addInventoryTransaction(
  tx: Omit<InventoryTransaction, "id">,
  userId: string
): Promise<InventoryTransaction> {
  console.warn(
    "[inventory] addInventoryTransaction: writes should go through SpacetimeDB actions.ts"
  );
  throw new Error("addInventoryTransaction: use SpacetimeDB reducers via actions.ts");
}
