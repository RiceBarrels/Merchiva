"use client";

import { useEffect, useState, use } from "react";
import { Loader2 } from "lucide-react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSiteById, getPages, getPageBySlug } from "@/lib/db/sites";
import { getProducts } from "@/lib/db/products";
import { SiteRenderer, buildGoogleFontsUrl } from "@/components/site-renderer";
import { SiteHtmlRenderer } from "@/components/site-html-renderer";
import type { Site, SitePage, Product } from "@/lib/types";

export default function PreviewSubPage({
  params,
}: {
  params: Promise<{ siteId: string; pageSlug: string }>;
}) {
  const { siteId, pageSlug } = use(params);
  const [site, setSite] = useState<Site | null>(null);
  const [page, setPage] = useState<SitePage | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const siteRows = useTable(tables.site);
  const pageRows = useTable(tables.sitePage);

  useEffect(() => {
    if (!siteId) return;
    Promise.all([getSiteById(siteId), getPageBySlug(siteId, pageSlug)])
      .then(([s, p]) => {
        setSite(s);
        setPage(p);
        getProducts().then(setProducts).catch(() => {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId, pageSlug, siteRows, pageRows]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!site || !page) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Page not found.
      </div>
    );
  }

  const elements = page.elements ?? [];
  const googleFontsUrl = buildGoogleFontsUrl([
    site.theme.headingFont,
    site.theme.bodyFont,
  ]);

  const customFonts = new Set<string>();
  function collectFonts(els: typeof elements) {
    for (const el of els) {
      const style = (el.props?.style as Record<string, string>) || {};
      if (style.fontFamily) {
        const family = style.fontFamily.split(",")[0].trim().replace(/['"]/g, "");
        if (family) customFonts.add(family);
      }
      if (el.children) collectFonts(el.children);
    }
  }
  collectFonts(elements);

  const customFontsUrl = customFonts.size > 0
    ? `https://fonts.googleapis.com/css2?${[...customFonts].map(f => `family=${encodeURIComponent(f)}:wght@100;200;300;400;500;600;700;800;900`).join("&")}&display=swap`
    : null;

  return (
    <div>
      {googleFontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={googleFontsUrl} />
      )}
      {customFontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={customFontsUrl} />
      )}
      {page.html && page.html.trim().length > 0 ? (
        <SiteHtmlRenderer
          html={page.html}
          theme={site.theme}
          products={products}
          basePath={`/preview/${siteId}`}
          customValues={site.values}
          customTokens={site.tokens}
          valueContext={{ siteName: site.name }}
        />
      ) : (
        <SiteRenderer
          elements={elements}
          theme={site.theme}
          products={products}
          basePath={`/preview/${siteId}`}
        />
      )}
    </div>
  );
}
