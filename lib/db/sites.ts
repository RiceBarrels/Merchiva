import { createClient } from "@/lib/supabase/client";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Site, SitePage, SiteElement, SiteTheme } from "@/lib/types";

// ─── Default theme ────────────────────────────────────────────────────────────

export function defaultTheme(): SiteTheme {
  return {
    primaryColor: "#2563eb",
    secondaryColor: "#64748b",
    accentColor: "#f59e0b",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
    headingFont: "Inter",
    bodyFont: "Inter",
    baseFontSize: 16,
    borderRadius: 8,
    maxContentWidth: 1200,
    sectionPadding: 48,
  };
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function siteFromDb(row: any): Site {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    published: row.published ?? false,
    theme: (row.theme as SiteTheme) ?? defaultTheme(),
    metaTitle: row.meta_title ?? null,
    metaDescription: row.meta_description ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageFromDb(row: any): SitePage {
  return {
    id: row.id,
    siteId: row.site_id,
    title: row.title,
    slug: row.slug,
    isHome: row.is_home ?? false,
    metaTitle: row.meta_title ?? null,
    metaDescription: row.meta_description ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function elementFromDb(row: any): SiteElement {
  return {
    id: row.id,
    siteId: row.site_id,
    pageId: row.page_id,
    parentId: row.parent_id ?? null,
    type: row.type,
    props: row.props ?? {},
    sortOrder: row.sort_order ?? 0,
  };
}

// Nests flat elements into a tree by parentId
function buildTree(elements: SiteElement[]): SiteElement[] {
  const map = new Map<string, SiteElement>();
  elements.forEach((el) => map.set(el.id, { ...el, children: [] }));
  const roots: SiteElement[] = [];
  elements.forEach((el) => {
    if (el.parentId && map.has(el.parentId)) {
      map.get(el.parentId)!.children!.push(map.get(el.id)!);
    } else {
      roots.push(map.get(el.id)!);
    }
  });
  return roots.sort((a, b) => a.sortOrder - b.sortOrder);
}

// ─── Client-side queries (browser Supabase) ───────────────────────────────────

export async function getSiteById(id: string): Promise<Site | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return siteFromDb(data);
}

export async function getSitePages(siteId: string): Promise<SitePage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("*")
    .eq("site_id", siteId)
    .order("is_home", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(pageFromDb);
}

export async function getPageElements(pageId: string): Promise<SiteElement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_elements")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return buildTree((data ?? []).map(elementFromDb));
}

export async function updateTheme(siteId: string, theme: SiteTheme): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sites")
    .update({ theme })
    .eq("id", siteId);
  if (error) throw error;
}

export async function getOrgSites(organizationId: string): Promise<Site[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(siteFromDb);
}

export async function createSite(
  organizationId: string,
  userId: string,
  name: string,
  slug: string
): Promise<Site> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      name,
      slug,
      published: false,
      theme: defaultTheme(),
    })
    .select()
    .single();
  if (error) throw error;
  return siteFromDb(data);
}

// ─── Server-side queries (for published site rendering) ───────────────────────

export async function getSiteBySlugServer(slug: string): Promise<Site | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .single();
  if (error) return null;
  return siteFromDb(data);
}

export async function getSitePagesServer(siteId: string): Promise<SitePage[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("*")
    .eq("site_id", siteId)
    .order("is_home", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(pageFromDb);
}

export async function getPageElementsServer(pageId: string): Promise<SiteElement[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("site_elements")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return buildTree((data ?? []).map(elementFromDb));
}
