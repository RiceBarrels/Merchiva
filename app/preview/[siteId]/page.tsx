"use client";

import { useEffect, useState, use } from "react";

import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSiteById, getPages } from "@/lib/db/sites";
import { getProducts } from "@/lib/db/products";
import { SiteRenderer, buildGoogleFontsUrl } from "@/components/site-renderer";
import { SiteHtmlRenderer } from "@/components/site-html-renderer";
import type { Site, SitePage, Product } from "@/lib/types";
import { Spinner } from "@/components/ui/loaders/geometric";

export default function PreviewPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = use(params);
  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<SitePage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const siteRows = useTable(tables.site);
  const pageRows = useTable(tables.sitePage);

  useEffect(() => {
    if (!siteId) return;
    Promise.all([getSiteById(siteId), getPages(siteId)])
      .then(([s, p]) => {
        setSite(s);
        setPages(p);
        // Products need org context — load separately, don't block
        getProducts().then(setProducts).catch(() => {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId, siteRows, pageRows]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  if (!site || pages.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        No content to preview.
      </div>
    );
  }

  const activePage = pages[0];
  const elements = activePage.elements ?? [];
  const googleFontsUrl = buildGoogleFontsUrl([
    site.theme.headingFont,
    site.theme.bodyFont,
  ]);

  // Collect custom fonts from element styles
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
      {activePage.html && activePage.html.trim().length > 0 ? (
        <SiteHtmlRenderer
          html={activePage.html}
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
