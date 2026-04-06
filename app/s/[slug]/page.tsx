import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteBySlugServer, getSitePagesServer, getPageElementsServer } from "@/lib/db/sites";
import { SiteRenderer } from "@/components/site-renderer";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteBySlugServer(slug);
  if (!site) return {};
  return {
    title: site.metaTitle ?? site.name,
    description: site.metaDescription ?? undefined,
  };
}

export default async function PublishedSiteHomePage({ params }: Props) {
  const { slug } = await params;
  const site = await getSiteBySlugServer(slug);
  if (!site) notFound();

  const pages = await getSitePagesServer(site.id);
  const homePage = pages.find((p) => p.isHome) ?? pages[0];
  if (!homePage) {
    // Site exists but has no pages — render an empty branded shell
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: site.theme.backgroundColor,
          color: site.theme.textColor,
          fontFamily: site.theme.bodyFont + ", Inter, system-ui, sans-serif",
        }}
      >
        <p style={{ opacity: 0.5 }}>{site.name} — coming soon</p>
      </div>
    );
  }

  const elements = await getPageElementsServer(homePage.id);

  return (
    <main style={{ minHeight: "100vh" }}>
      <SiteRenderer elements={elements} theme={site.theme} />
    </main>
  );
}
