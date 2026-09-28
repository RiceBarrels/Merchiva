"use client";

import { useMemo } from "react";
import { productsPageContext, type ProductsPageState } from "@/lib/merchiva/data-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

/** Tells Mr. Merchiva what the products page shows: counts, filters and whether a product is being added. */
export function useProductsPageContext(s: ProductsPageState): void {
  const { products, flagged, shown, category, search, flaggedOnly, adding } = s;
  const context = useMemo(
    () => productsPageContext({ products, flagged, shown, category, search, flaggedOnly, adding }),
    [products, flagged, shown, category, search, flaggedOnly, adding],
  );
  useMerchivaPageContext(context);
}
