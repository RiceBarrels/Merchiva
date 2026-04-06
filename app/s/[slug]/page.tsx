"use client";

import { useEffect, useState, use } from "react";
import { SiteRenderer } from "@/components/site-renderer";
import { getSiteBySlug, getPages } from "@/lib/db/sites";
import { getProducts } from "@/lib/db/products";
import type { Site, SitePage } from "@/lib/types";
import type { Product } from "@/lib/types";
import { Loader2 } from "lucide-react";

export default function PublicSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = use(params);
  const { page: pageSlug } = use(searchParams);

  const [site, setSite] = useState<Site | null>(null);
  const [page, setPage] = useState<SitePage | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([
      getSiteBySlug(slug),
      getProducts(),
    ])
      .then(async ([foundSite, prods]) => {
        if (!foundSite) { setNotFound(true); return; }
        setSite(foundSite);
        setProducts(prods);
        const pages = await getPages(foundSite.id);
        const target = pageSlug
          ? pages.find((p) => p.slug === pageSlug) ?? pages[0]
          : pages[0];
        setPage(target ?? null);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, pageSlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !site) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-2xl font-bold mb-2">Site not found</h1>
        <p className="text-muted-foreground text-sm">This site doesn&apos;t exist or hasn&apos;t been published yet.</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-xl font-bold mb-2">{site.name}</h1>
        <p className="text-muted-foreground text-sm">No pages have been added to this site yet.</p>
      </div>
    );
  }

  return (
    <div>
      <SiteRenderer elements={page.elements} theme={site.theme} products={products} />
    </div>
  );
}
