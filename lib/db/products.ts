// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { Product } from "@/lib/types";

function rowIdString(id: unknown): string {
  const value = id as { toHexString?: () => string; toString?: () => string } | null | undefined;
  if (typeof value?.toHexString === "function") return value.toHexString();
  return String(value ?? "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromInventoryRow(row: any): Product {
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
    availableStoreIds: null,
  };
}

export async function getProducts(): Promise<Product[]> {
  const c = getConnection();
  if (!c) return [];
  const orgId = getActiveOrgId();
  const rows = (c as any).db.inventoryItem.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === orgId)
    .filter((r: any) => r.retailEnabled === true && Number(r.retailPrice ?? 0) > 0)
    .map(fromInventoryRow)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProductById(id: string): Promise<Product | null> {
  const c = getConnection();
  if (!c) return null;
  const orgId = getActiveOrgId();
  const rows = (c as any).db.inventoryItem.iter();
  const match = Array.from(rows).find(
    (r: any) =>
      rowIdString(r.id) === id &&
      r.organizationId === orgId &&
      r.retailEnabled === true &&
      Number(r.retailPrice ?? 0) > 0,
  );
  return match ? fromInventoryRow(match) : null;
}

export async function addProduct(
  product: Omit<Product, "id">,
  userId: string,
): Promise<Product> {
  console.warn(
    "[products] addProduct: writes should go through SpacetimeDB actions.ts",
  );
  throw new Error("addProduct: use SpacetimeDB reducers via actions.ts");
}

export async function updateProduct(
  id: string,
  updates: Partial<Product>,
): Promise<void> {
  console.warn(
    "[products] updateProduct: writes should go through SpacetimeDB actions.ts",
  );
  throw new Error("updateProduct: use SpacetimeDB reducers via actions.ts");
}

export async function deleteProduct(id: string): Promise<void> {
  console.warn(
    "[products] deleteProduct: writes should go through SpacetimeDB actions.ts",
  );
  throw new Error("deleteProduct: use SpacetimeDB reducers via actions.ts");
}
