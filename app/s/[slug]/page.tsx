import { notFound } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { SiteRenderer } from "@/components/site-renderer";
import type { Site, SitePage, SiteElement, SiteTheme } from "@/lib/types";

// Public site renderer — no auth required.
// Fetches published site data server-side using anon key (RLS must allow public reads for published sites).

const DEFAULT_THEME: SiteTheme = {
  primaryColor: "#111827",
  secondaryColor: "#6b7280",
  accentColor: "#2563eb",
  bgColor: "#ffffff",
  textColor: "#111827",
  headingFont: "Inter",
  bodyFont: "Inter",
  borderRadius: "0.375rem",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function siteFromDb(row: any): Site {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    status: row.status ?? "draft",
    theme: row.theme ?? DEFAULT_THEME,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageFromDb(row: any): SitePage {
  return {
    id: row.id,
    siteId: row.site_id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function elementFromDb(row: any): SiteElement {
  return {
    id: row.id,
    pageId: row.page_id,
    siteId: row.site_id,
    organizationId: row.organization_id,
    type: row.type,
    props: row.props ?? {},
    sortOrder: Number(row.sort_order ?? 0),
  };
}

async function getPublishedSite(slug: string): Promise<{
  site: Site;
  pages: SitePage[];
  elementsByPage: Record<string, SiteElement[]>;
} | null> {
  // Using browser client with anon key — published sites should be publicly readable via RLS
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: siteData, error: siteError } = await supabase
    .from("sites")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (siteError || !siteData) return null;
  const site = siteFromDb(siteData);

  const { data: pagesData, error: pagesError } = await supabase
    .from("site_pages")
    .select("*")
    .eq("site_id", site.id)
    .order("sort_order", { ascending: true });

  if (pagesError) return null;
  const pages = (pagesData ?? []).map(pageFromDb);

  const elementsByPage: Record<string, SiteElement[]> = {};
  for (const page of pages) {
    const { data: elData } = await supabase
      .from("site_elements")
      .select("*")
      .eq("page_id", page.id)
      .order("sort_order", { ascending: true });
    elementsByPage[page.id] = (elData ?? []).map(elementFromDb);
  }

  return { site, pages, elementsByPage };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getPublishedSite(slug);
  if (!result) return { title: "Not Found" };
  return {
    title: result.site.name,
    description: `${result.site.name} — powered by BizOps`,
  };
}

export default async function PublishedSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getPublishedSite(slug);

  if (!result) notFound();

  const { site, pages, elementsByPage } = result;

  // Collect all elements across all pages in order
  const allElements: SiteElement[] = pages.flatMap((page) => elementsByPage[page.id] ?? []);

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: site.theme.bodyFont + ", Inter, system-ui, sans-serif",
        background: site.theme.bgColor,
        color: site.theme.textColor,
        margin: 0,
        padding: 0,
      }}
    >
      <SiteRenderer elements={allElements} theme={site.theme} />
    </div>
  );
}
