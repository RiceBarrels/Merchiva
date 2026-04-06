import { createClient } from "@/lib/supabase/client";
import type { Site, SitePage, SiteElement, SiteTheme } from "@/lib/types";

// ─── Default theme ────────────────────────────────────────────────────────────

export const DEFAULT_THEME: SiteTheme = {
  primaryColor: "#111827",
  secondaryColor: "#6b7280",
  accentColor: "#2563eb",
  bgColor: "#ffffff",
  textColor: "#111827",
  headingFont: "Inter",
  bodyFont: "Inter",
  borderRadius: "0.375rem",
};

// ─── Mappers ──────────────────────────────────────────────────────────────────

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

// ─── Site queries ─────────────────────────────────────────────────────────────

export async function getSites(organizationId: string): Promise<Site[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(siteFromDb);
}

export async function getSite(id: string): Promise<Site | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return siteFromDb(data);
}

export async function getSiteBySlug(slug: string): Promise<Site | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();
  if (error) return null;
  return siteFromDb(data);
}

export async function createSite(params: {
  organizationId: string;
  userId: string;
  name: string;
  slug: string;
}): Promise<Site> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      name: params.name,
      slug: params.slug,
      status: "draft",
      theme: DEFAULT_THEME,
    })
    .select()
    .single();
  if (error) throw error;
  return siteFromDb(data);
}

export async function updateSite(
  id: string,
  updates: Partial<Pick<Site, "name" | "slug" | "theme">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.theme !== undefined) payload.theme = updates.theme;
  const { error } = await supabase.from("sites").update(payload).eq("id", id);
  if (error) throw error;
}

export async function publishSite(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sites")
    .update({ status: "published" })
    .eq("id", id);
  if (error) throw error;
}

export async function unpublishSite(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sites")
    .update({ status: "draft" })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSite(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("sites").delete().eq("id", id);
  if (error) throw error;
}

// ─── Page queries ─────────────────────────────────────────────────────────────

export async function getPages(siteId: string): Promise<SitePage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(pageFromDb);
}

export async function createPage(params: {
  siteId: string;
  organizationId: string;
  name: string;
  slug: string;
  sortOrder: number;
}): Promise<SitePage> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_pages")
    .insert({
      site_id: params.siteId,
      organization_id: params.organizationId,
      name: params.name,
      slug: params.slug,
      sort_order: params.sortOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return pageFromDb(data);
}

export async function updatePage(
  id: string,
  updates: Partial<Pick<SitePage, "name" | "slug" | "sortOrder">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
  const { error } = await supabase.from("site_pages").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deletePage(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("site_pages").delete().eq("id", id);
  if (error) throw error;
}

// ─── Element queries ──────────────────────────────────────────────────────────

export async function getElements(pageId: string): Promise<SiteElement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_elements")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(elementFromDb);
}

export async function getPageElementsBySlug(
  siteSlug: string
): Promise<{ pages: SitePage[]; elementsByPage: Record<string, SiteElement[]> } | null> {
  const supabase = createClient();
  // Fetch site
  const { data: siteData, error: siteError } = await supabase
    .from("sites")
    .select("id")
    .eq("slug", siteSlug)
    .eq("status", "published")
    .single();
  if (siteError || !siteData) return null;

  // Fetch pages
  const { data: pagesData, error: pagesError } = await supabase
    .from("site_pages")
    .select("*")
    .eq("site_id", siteData.id)
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

  return { pages, elementsByPage };
}

export async function savePageElements(
  pageId: string,
  siteId: string,
  organizationId: string,
  elements: SiteElement[]
): Promise<void> {
  const supabase = createClient();
  // Delete existing elements for this page
  const { error: deleteError } = await supabase
    .from("site_elements")
    .delete()
    .eq("page_id", pageId);
  if (deleteError) throw deleteError;
  if (elements.length === 0) return;
  // Insert updated elements
  const { error: insertError } = await supabase.from("site_elements").insert(
    elements.map((el, i) => ({
      id: el.id,
      site_id: siteId,
      page_id: pageId,
      organization_id: organizationId,
      type: el.type,
      props: el.props,
      sort_order: i,
    }))
  );
  if (insertError) throw insertError;
}
