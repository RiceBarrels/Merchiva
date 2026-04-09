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
    return rawProducts
      .filter((r) => r.organizationId === organizationId)
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
        alertReason:        r.alertReason ?? null,
        squareItemId:       r.squareItemId ?? null,
      }));
  }, [rawProducts, organizationId]);

  return {
    products,
    isReady,
    refreshing: false,
    userId: null,
    setProducts: () => {},
    refresh: () => {},
  } as const;
}
