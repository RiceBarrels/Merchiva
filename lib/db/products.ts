// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { Product } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): Product {
  return {
    id: typeof row.id === "string" ? row.id : row.id?.toString?.() ?? "",
    name: row.name,
    category: row.category,
    price: Number(row.price) || 0,
    cost: Number(row.cost) || 0,
    unitsSoldThisMonth: Number(row.unitsSoldThisMonth) || 0,
    unitsSoldLastMonth: Number(row.unitsSoldLastMonth) || 0,
    revenue: Number(row.revenue) || 0,
    margin: Number(row.margin) || 0,
    rating: Number(row.rating) || 0,
    trend: row.trend,
    alert: row.alert,
    alertReason: row.alertReason ?? undefined,
    description: row.description ?? undefined,
    nameI18n: row.nameI18n ? (() => { try { return JSON.parse(row.nameI18n); } catch { return undefined; } })() : undefined,
    images: row.images ?? undefined,
    pageTemplate: row.pageTemplate ?? null,
  };
}

export async function getProducts(): Promise<Product[]> {
  const c = getConnection();
  if (!c) return [];
  const orgId = getActiveOrgId();
  const rows = (c as any).db.product.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === orgId)
    .map(fromRow)
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getProductById(id: string): Promise<Product | null> {
  const c = getConnection();
  if (!c) return null;
  const orgId = getActiveOrgId();
  const rows = (c as any).db.product.iter();
  const match = Array.from(rows).find(
    (r: any) => (r.id?.toString?.() ?? r.id) === id && r.organizationId === orgId
  );
  return match ? fromRow(match) : null;
}

export async function addProduct(
  product: Omit<Product, "id">,
  userId: string
): Promise<Product> {
  console.warn(
    "[products] addProduct: writes should go through SpacetimeDB actions.ts"
  );
  throw new Error("addProduct: use SpacetimeDB reducers via actions.ts");
}

export async function updateProduct(
  id: string,
  updates: Partial<Product>
): Promise<void> {
  console.warn(
    "[products] updateProduct: writes should go through SpacetimeDB actions.ts"
  );
  throw new Error("updateProduct: use SpacetimeDB reducers via actions.ts");
}

export async function deleteProduct(id: string): Promise<void> {
  console.warn(
    "[products] deleteProduct: writes should go through SpacetimeDB actions.ts"
  );
  throw new Error("deleteProduct: use SpacetimeDB reducers via actions.ts");
}
