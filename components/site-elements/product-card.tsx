"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

interface ProductCardProps {
  productId?: string;
  product?: Product;
  layout?: "card" | "list" | "minimal";
  showPrice?: boolean;
  showDescription?: boolean;
  showAddToCart?: boolean;
  isEditor?: boolean;
  themeColor?: string;
}

const PLACEHOLDER: Product = {
  id: "placeholder",
  name: "Sample Product",
  category: "Category",
  price: 12.99,
  cost: 4.0,
  unitsSoldThisMonth: 0,
  unitsSoldLastMonth: 0,
  revenue: 0,
  margin: 69,
  rating: 4.5,
  trend: "stable",
  alert: "none",
};

export function ProductCard({
  productId,
  product: productProp,
  layout = "card",
  showPrice = true,
  showDescription = true,
  showAddToCart = true,
  isEditor = false,
  themeColor = "#0f172a",
}: ProductCardProps) {
  const [product, setProduct] = useState<Product | null>(productProp ?? null);
  const [loading, setLoading] = useState(!productProp && !!productId);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (productProp || !productId || isEditor) return;
    const supabase = createClient();
    supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => {
        if (data) {
          setProduct({
            id: data.id,
            name: data.name,
            category: data.category,
            price: Number(data.price),
            cost: Number(data.cost),
            unitsSoldThisMonth: Number(data.units_sold_this_month),
            unitsSoldLastMonth: Number(data.units_sold_last_month),
            revenue: Number(data.revenue),
            margin: Number(data.margin),
            rating: Number(data.rating),
            trend: data.trend,
            alert: data.alert,
            alertReason: data.alert_reason ?? undefined,
          });
        }
      })
      .catch((err: unknown) => console.error("ProductCard fetch failed:", err))
      .finally(() => setLoading(false));
  }, [productId, productProp, isEditor]);

  const display = isEditor ? PLACEHOLDER : product;

  function handleAddToCart() {
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  if (loading) {
    return (
      <div className="border border-stone-200 bg-white p-4 animate-pulse" style={{ borderRadius: "0.3rem" }}>
        <div className="h-32 bg-stone-100 mb-3" style={{ borderRadius: "0.3rem" }} />
        <div className="h-4 bg-stone-100 w-3/4 mb-2" style={{ borderRadius: "0.3rem" }} />
        <div className="h-3 bg-stone-100 w-1/2" style={{ borderRadius: "0.3rem" }} />
      </div>
    );
  }

  if (!display) {
    return (
      <div className="border border-stone-200 bg-stone-50 p-4 text-stone-400 text-sm flex items-center gap-2" style={{ borderRadius: "0.3rem" }}>
        <Package className="h-4 w-4" />
        No product selected
      </div>
    );
  }

  if (layout === "list") {
    return (
      <div className="border border-stone-200 bg-white flex items-center gap-4 p-3" style={{ borderRadius: "0.3rem" }}>
        <div className="w-14 h-14 bg-stone-100 flex items-center justify-center flex-shrink-0" style={{ borderRadius: "0.3rem" }}>
          <Package className="h-5 w-5 text-stone-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-900 text-sm truncate">{display.name}</p>
          {showDescription && (
            <p className="text-xs text-stone-500 truncate">{display.category}</p>
          )}
        </div>
        {showPrice && (
          <p className="font-mono text-sm font-semibold text-stone-900 flex-shrink-0">
            ${display.price.toFixed(2)}
          </p>
        )}
        {showAddToCart && (
          <button
            onClick={handleAddToCart}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: themeColor, borderRadius: "0.3rem" }}
          >
            <ShoppingCart className="h-3 w-3" />
            {added ? "Added" : "Add"}
          </button>
        )}
      </div>
    );
  }

  if (layout === "minimal") {
    return (
      <div className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
        <span className="text-sm text-stone-800">{display.name}</span>
        {showPrice && (
          <span className="font-mono text-sm font-semibold text-stone-900">
            ${display.price.toFixed(2)}
          </span>
        )}
      </div>
    );
  }

  // card layout (default)
  return (
    <div className="border border-stone-200 bg-white overflow-hidden" style={{ borderRadius: "0.3rem" }}>
      <div className="h-40 bg-stone-100 flex items-center justify-center">
        <Package className="h-8 w-8 text-stone-300" />
      </div>
      <div className="p-3">
        <p className="font-medium text-stone-900 text-sm">{display.name}</p>
        {showDescription && (
          <p className="text-xs text-stone-500 mt-0.5">{display.category}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          {showPrice && (
            <span className="font-mono text-base font-semibold text-stone-900">
              ${display.price.toFixed(2)}
            </span>
          )}
          {showAddToCart && (
            <button
              onClick={handleAddToCart}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white transition-colors"
              style={{ backgroundColor: themeColor, borderRadius: "0.3rem" }}
            >
              <ShoppingCart className="h-3 w-3" />
              {added ? "Added!" : "Add to Cart"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
