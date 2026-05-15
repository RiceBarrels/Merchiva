"use client";

import { useEffect, useState, use } from "react";
import { Loader2 } from "lucide-react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSiteById, getPages } from "@/lib/db/sites";
import { createPage } from "@/lib/spacetimedb/actions";
import { buildPageTemplate, PAGE_TEMPLATES } from "@/lib/builder/page-templates";
import { getProducts } from "@/lib/db/products";
import { usePermissions } from "@/lib/context/permissions";
import { HtmlBuilderEditor } from "@/components/builder/html-editor";
import type { Site, SitePage, Product } from "@/lib/types";
import { useT } from "@/lib/i18n/context";

// Module-scope guard so concurrent effect runs (StrictMode dev double-mount or rapid
// pageRows-driven re-renders before the first createPage round-trip lands) cannot
// fire the default-page seeding more than once per site per tab.
const autoCreateAttempted = new Set<string>();

export default function BuilderPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const t = useT();
  const { siteId } = use(params);
  const { organizationId } = usePermissions();

  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<SitePage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePageId, setActivePageId] = useState("");

  const [, siteReady] = useTable(tables.site);
  const [pageRowsRaw, pageReady] = useTable(tables.sitePage);

  // Live page count for THIS site, derived from the live subscription. Use this
  // (not getPages, which returns [] until the cache syncs) to decide whether to
  // seed defaults — otherwise an unsynced cache reads as "empty" and re-seeds.
  const livePagesForSite = pageRowsRaw.filter((r: { siteId: string }) => r.siteId === siteId);

  useEffect(() => {
    if (!siteId || !organizationId) return;
    // Wait until the SpacetimeDB subscriptions are live; otherwise getPages may
    // return [] from an empty local cache and trigger a false "seed defaults" path.
    if (!siteReady || !pageReady) return;

    let cancelled = false;

    async function load() {
      try {
        const [s, p, pr] = await Promise.all([
          getSiteById(siteId),
          getPages(siteId),
          getProducts(),
        ]);
        if (cancelled) return;
        setSite(s);
        setProducts(pr);

        if (p.length === 0 && livePagesForSite.length === 0 && s && !autoCreateAttempted.has(siteId)) {
          autoCreateAttempted.add(siteId);
          try {
            await createPage(siteId, "Home", "index", 0);
            const templates = PAGE_TEMPLATES.filter((t) => t.id !== "blank");
            for (let i = 0; i < templates.length; i++) {
              const tpl = templates[i];
              const elements = buildPageTemplate(tpl.id);
              await createPage({
                siteId,
                name: tpl.defaultName,
                slug: tpl.defaultSlug,
                sortOrder: i + 1,
                elements: JSON.stringify(elements),
              });
            }
          } catch (err) {
            console.error("Failed to auto-create pages:", err);
            autoCreateAttempted.delete(siteId);
          }
          return;
        }

        setPages(p);
        if (!activePageId && p.length > 0) setActivePageId(p[0].id);
      } catch (err) {
        console.error("Failed to load builder data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, organizationId, siteReady, pageReady, livePagesForSite.length]);


  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        {t("builder.site.notFound")}
      </div>
    );
  }

  // Mobile and desktop both use the HTML-based builder.
  return (
    <HtmlBuilderEditor
      site={site}
      pages={pages}
      products={products}
      organizationId={organizationId ?? ""}
    />
  );
}
