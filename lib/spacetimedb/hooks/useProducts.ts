"use client";
// SpacetimeDB migration layer — products
// TODO: replace internals with:
//   const [products] = useTable(tables.product.where(r => r.organizationId.eq(orgId)));

import { useState, useEffect, useCallback } from "react";
import { getProducts } from "@/lib/db/products";
import { createClient } from "@/lib/supabase/client";
import { getCached, setCache } from "@/lib/cache";
import type { Product } from "@/lib/types";

export function useProducts(organizationId: string | null) {
  const cacheKey = organizationId ? `products_${organizationId}` : null;

  const [products, setProducts] = useState<Product[]>(
    () => (cacheKey ? getCached<Product[]>(cacheKey) ?? [] : [])
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  const refresh = useCallback(() => {
    if (!organizationId) return;
    setRefreshing(true);
    getProducts()
      .then((p) => {
        setProducts(p);
        if (cacheKey) setCache(cacheKey, p);
      })
      .catch((err) => console.error("[useProducts]", err))
      .finally(() => {
        setRefreshing(false);
        setIsReady(true);
      });
  }, [organizationId, cacheKey]);

  useEffect(() => {
    if (!organizationId) return;
    refresh();
  }, [organizationId, refresh]);

  return { products, setProducts, refreshing, isReady, userId, refresh } as const;
}
