"use client";

import { useEffect, useState, use } from "react";
import { getSiteBySlug, getPages, getPageBySlug } from "@/lib/db/sites";
import { SiteRenderer } from "@/components/site-renderer";
import type { Site, SitePage } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/context";

interface Props {
  params: Promise<{ slug: string; pageSlug: string }>;
}

export default function PublishedSiteSubPage({ params }: Props) {
  const t = useT();
  const { slug, pageSlug } = use(params);

  const [site, setSite] = useState<Site | null>(null);
  const [page, setPage] = useState<SitePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getSiteBySlug(slug)
      .then(async (foundSite) => {
        if (!foundSite) { setNotFound(true); return; }
        setSite(foundSite);
        const foundPage = await getPageBySlug(foundSite.id, pageSlug);
        if (!foundPage) { setNotFound(true); return; }
        setPage(foundPage);
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

  if (notFound || !site || !page) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-2xl font-bold mb-2">{t("storefront.notFound.page")}</h1>
        <p className="text-muted-foreground text-sm">{t("storefront.notFound.pageDesc")}</p>
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100vh" }}>
      <SiteRenderer elements={page.elements} theme={site.theme} />
    </main>
  );
}
