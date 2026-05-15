"use client";
// SpacetimeDB — products

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type { Product } from "@/lib/types";

export function useProducts(_organizationId: string | null) {
  const { organizationId } = usePermissions();

  const [rawProducts, isReady] = useTable(tables.product);

  const products = useMemo<Product[]>(() => {
    if (!organizationId) return [];
    console.log("[useProducts] raw:", rawProducts.length, "orgId:", organizationId, "sample orgIds:", rawProducts.slice(0, 3).map((r) => `"${r.organizationId}" (${typeof r.organizationId})`));
    return rawProducts
      .filter((r) => String(r.organizationId) === organizationId)
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
        nameI18N:           r.nameI18N ? (() => { try { return JSON.parse(r.nameI18N!); } catch { return undefined; } })() : undefined,
        squareItemId:       r.squareItemId ?? null,
      }));
  }, [rawProducts, organizationId]);

  return {
    products,
    isReady,
    refreshing: false,
    userId: null,
    setProducts: (_?: any) => {},
    refresh: () => {},
  };
}
