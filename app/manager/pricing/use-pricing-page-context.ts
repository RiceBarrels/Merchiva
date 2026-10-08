"use client";

import { useMemo } from "react";
import { pricingPageContext, type PricingPageState } from "@/lib/merchiva/data-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

/** Tells Mr. Merchiva what the pricing page shows: how many products and the overview's search. */
export function usePricingPageContext(s: PricingPageState): void {
  const { ready, products, search } = s;
  const context = useMemo(() => pricingPageContext({ ready, products, search }), [ready, products, search]);
  useMerchivaPageContext(context);
}
