"use client";

import { useEffect, useState, useCallback, use } from "react";
import { Loader2 } from "lucide-react";
import { Editor } from "@craftjs/core";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSiteById, getPages } from "@/lib/db/sites";
import { createPage } from "@/lib/spacetimedb/actions";
import { buildPageTemplate, PAGE_TEMPLATES } from "@/lib/builder/page-templates";
import { getProducts } from "@/lib/db/products";
import { usePermissions } from "@/lib/context/permissions";
import { useSidebarOpen } from "@/components/sidebar";
import { BuilderEditor } from "@/components/builder/editor";
import { MobileBuilderLayout } from "@/components/builder/mobile/mobile-builder";
import { resolver } from "@/components/builder/craft-components/resolver";
import { RenderNode } from "@/components/builder/render-node";
import type { Site, SitePage, Product } from "@/lib/types";
import { useT } from "@/lib/i18n/context";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function BuilderPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const t = useT();
  const isMobile = useIsMobile();
  const { siteId } = use(params);
  const { organizationId } = usePermissions();
  const openSidebar = useSidebarOpen();

  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<SitePage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePageId, setActivePageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const siteRows = useTable(tables.site);
  const pageRows = useTable(tables.sitePage);

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
  }, [siteId, organizationId, siteRows, pageRows]);

  const handlePageSwitch = useCallback((pageId: string) => {
    setActivePageId(pageId);
  }, []);

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

  if (isMobile) {
    return (
      <Editor
        key={activePageId}
        resolver={resolver}
        enabled={true}
        onRender={RenderNode}
      >
        <MobileBuilderLayout
          site={site}
          pages={pages}
          activePageId={activePageId || pages[0]?.id || ""}
          onPageSwitch={handlePageSwitch}
          saving={saving}
          savedAt={savedAt}
        />
      </Editor>
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
