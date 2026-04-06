import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteBySlugServer, getSitePagesServer, getPageElementsServer } from "@/lib/db/sites";
import { SiteRenderer } from "@/components/site-renderer";

interface Props {
  params: Promise<{ slug: string; pageSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  const site = await getSiteBySlugServer(slug);
  if (!site) return {};

  const pages = await getSitePagesServer(site.id);
  const page = pages.find((p) => p.slug === pageSlug);

  return {
    title: page?.metaTitle ?? `${page?.title ?? pageSlug} — ${site.name}`,
    description: page?.metaDescription ?? site.metaDescription ?? undefined,
  };
}

export default async function PublishedSiteSubPage({ params }: Props) {
  const { slug, pageSlug } = await params;
  const site = await getSiteBySlugServer(slug);
  if (!site) notFound();

  const pages = await getSitePagesServer(site.id);
  const page = pages.find((p) => p.slug === pageSlug);
  if (!page) notFound();

  const elements = await getPageElementsServer(page.id);

  return (
    <main style={{ minHeight: "100vh" }}>
      <SiteRenderer elements={elements} theme={site.theme} />
    </main>
  );
}
