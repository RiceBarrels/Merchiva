"use client";
// SpacetimeDB — products
//
// Products are shared across the parent/child share group. The hook returns
// every product belonging to any org in the share group, with `availableStoreIds`
// honored as the per-product visibility filter (null/empty default = available
// at every store in the group). Callers that want only the products actually
// sold at the current store should use the `productsForCurrentStore` array;
// the unfiltered `products` array exposes the catalog for editing.

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type { Product, ProductInventoryUsage } from "@/lib/types";
import { parseAvailableStoreIds, isProductVisibleAtStore } from "@/lib/share-group";

function parseInventoryUsage(value: string | null | undefined): ProductInventoryUsage[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        inventoryItemId: String(item?.inventoryItemId ?? ""),
        inventoryItemName: String(item?.inventoryItemName ?? ""),
        quantity: Number(item?.quantity ?? 0),
        unit: String(item?.unit ?? ""),
      }))
      .filter((item) => item.inventoryItemId && item.inventoryItemName && Number.isFinite(item.quantity));
  } catch {
    return [];
  }
}

export function useProducts(_organizationId: string | null) {
  const { organizationId, shareGroupOrgIds } = usePermissions();

  const [rawProducts, isReady] = useTable(tables.product);

  const products = useMemo<Product[]>(() => {
    if (!organizationId) return [];
    const groupIds = shareGroupOrgIds.length ? shareGroupOrgIds : [organizationId];
    return rawProducts
      .filter((r) => groupIds.includes(String(r.organizationId)))
      .map((r) => ({
        id:                 r.id.toString(),
        name:               r.name,
        category:           r.category,
        price:              r.price,
        cost:               r.cost,
        unitsSoldThisMonth: r.unitsSoldThisMonth,
        unitsSoldLastMonth: r.unitsSoldLastMonth,
        revenue:            r.revenue,
        margin:             r.margin,
        rating:             r.rating,
        trend:              r.trend as Product["trend"],
        alert:              r.alert as Product["alert"],
        alertReason:        r.alertReason ?? undefined,
        imageUrl:           r.imageUrl ?? undefined,
        description:        r.description ?? undefined,
        inventoryUsage:     parseInventoryUsage((r as unknown as { inventoryUsage?: string | null }).inventoryUsage ?? null),
        nameI18n:           r.nameI18N ? (() => { try { return JSON.parse(r.nameI18N!); } catch { return undefined; } })() : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        squareItemId:       (r as any).squareItemId ?? null,
        organizationId:     String(r.organizationId),
        availableStoreIds:  parseAvailableStoreIds(r.availableStoreIds ?? null),
      })) as Product[];
  }, [rawProducts, organizationId, shareGroupOrgIds]);

  // Products *actually* sold at the current store — applies availableStoreIds
  // filtering on top of the share-group lookup. Use for storefront / POS reads;
  // catalog editing should use `products` so the user can see+edit hidden ones.
  const productsForCurrentStore = useMemo<Product[]>(() => {
    if (!organizationId) return [];
    const groupIds = shareGroupOrgIds.length ? shareGroupOrgIds : [organizationId];
    return products.filter((p) =>
      isProductVisibleAtStore(
        p.organizationId ?? "",
        p.availableStoreIds ?? null,
        organizationId,
        groupIds,
      ),
    );
  }, [products, organizationId, shareGroupOrgIds]);

  return {
    products,
    productsForCurrentStore,
    isReady,
    refreshing: false,
    userId: null,
    setProducts: (_?: unknown) => {},
    refresh: () => {},
  };
}
