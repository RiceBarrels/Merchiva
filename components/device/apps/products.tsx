"use client";

// "Products" lite app: a price-lookup screen for frontline staff. Type a
// name, tap a row, see the price big. Read-only — editing, cost / margin and
// POS sync stay in /manager/products.

import { useMemo, useState } from "react";
import { Package, ShoppingBag, Tag } from "lucide-react";
import { LiteSubPage } from "./lite-page";
import { useT } from "@/lib/i18n/context";
import { useCurrency } from "@/lib/currency";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";
import type { Product } from "@/lib/types";
import type { LiteAppProps } from "./types";
import { LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSearch, LiteSection } from "./lite";

const MAX_ROWS = 60;

export function ProductsLite({ organizationId, surface }: LiteAppProps) {
  const t = useT();
  const { format } = useCurrency();
  const { products, isReady } = useProducts(organizationId);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  const all = useMemo(
    () =>
      products
        .filter((p) => !p.organizationId || p.organizationId === organizationId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products, organizationId],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, MAX_ROWS);
    return all
      .filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, MAX_ROWS);
  }, [all, query]);

  if (!isReady) return <LiteLoading />;

  return (
    <LiteScreen>
      <LiteSearch
        value={query}
        onChange={setQuery}
        placeholder={t("device.lite.products.searchPlaceholder")}
        autoFocus={surface === "store"}
      />

      {all.length === 0 ? (
        <LiteEmpty
          icon={ShoppingBag}
          title={t("device.lite.products.noProducts")}
          description={t("device.lite.products.noProductsSub")}
        />
      ) : shown.length === 0 ? (
        <LiteEmpty
          icon={Package}
          title={t("device.lite.products.noMatch")}
          description={t("device.lite.products.noMatchSub")}
        />
      ) : (
        <LiteSection title={query.trim() ? t("device.lite.products.results") : t("device.lite.products.all")}>
          <div className="space-y-2">
            {shown.map((p) => (
              <LiteRow
                key={p.id}
                icon={Tag}
                title={p.name}
                sub={p.category}
                right={<span className="text-[17px] font-semibold">{format(p.price)}</span>}
                chevron
                onClick={() => setSelected(p)}
              />
            ))}
          </div>
        </LiteSection>
      )}

      <LiteSubPage
        surface={surface}
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        cancelLabel={t("device.lite.products.close")}
        maxWidth={480}
      >
        {selected && <ProductDetail product={selected} price={format(selected.price)} />}
      </LiteSubPage>
    </LiteScreen>
  );
}

function ProductDetail({ product, price }: { product: Product; price: string }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4 pb-2">
      {product.imageUrl && (
        <div className="overflow-hidden rounded-lg border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            className="mx-auto max-h-56 w-full object-contain"
          />
        </div>
      )}

      <div className="rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <Tag className="h-4 w-4" />
          {t("device.lite.products.priceLabel")}
        </div>
        <div className="mt-1.5 font-mono text-[44px] font-semibold leading-none tabular-nums tracking-tight">{price}</div>
      </div>

      <LiteRow icon={Package} title={product.category} sub={t("device.lite.products.categoryLabel")} />

      {product.description && (
        <p className="px-1 text-[15px] leading-snug text-muted-foreground">{product.description}</p>
      )}
    </div>
  );
}
