"use client";

import { useEffect, useState, use } from "react";
import { Loader2 } from "lucide-react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSiteById, getPages } from "@/lib/db/sites";
import { createPage } from "@/lib/spacetimedb/actions";
import { getProducts } from "@/lib/db/products";
import { usePermissions } from "@/lib/context/permissions";
import { useSidebarOpen } from "@/components/sidebar";
import { BuilderEditor } from "@/components/builder/editor";
import type { Site, SitePage, Product } from "@/lib/types";
import { useT } from "@/lib/i18n/context";

export default function BuilderPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const t = useT();
  const { siteId } = use(params);
  const { organizationId } = usePermissions();
  const openSidebar = useSidebarOpen();

  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<SitePage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to SpacetimeDB tables for live updates
  const siteRows = useTable(tables.site);
  const pageRows = useTable(tables.sitePage);

  // Load data when tables are ready
  useEffect(() => {
    if (!siteId || !organizationId) return;

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

        if (p.length === 0 && s) {
          try {
            await createPage(siteId, "Home", "index", 0);
          } catch (err) {
            console.error("Failed to auto-create index page:", err);
          }
          return;
        }

        setPages(p);
      } catch (err) {
        console.error("Failed to load builder data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // Re-run when SpacetimeDB table subscriptions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, organizationId, siteRows, pageRows]);

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

  return (
    <BuilderEditor
      site={site}
      pages={pages}
      products={products}
      organizationId={organizationId ?? ""}
    />
  );
}
