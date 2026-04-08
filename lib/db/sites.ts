import { createClient } from "@/lib/supabase/client";
import type { Site, SitePage, SiteElement, SiteTheme, SiteComponent, SiteFeatures } from "@/lib/types";

// ─── Mappers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function siteFromDb(row: any): Site {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    theme: row.theme ?? defaultTheme(),
    features: { ...defaultFeatures(), ...(row.features ?? {}) },
    published: row.published ?? false,
    customDomain: row.custom_domain ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageFromDb(row: any): SitePage {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name ?? row.title ?? "Untitled",
    slug: row.slug ?? "index",
    elements: (row.elements as SiteElement[]) ?? [],
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultTheme(): SiteTheme {
  return {
    primary: "#18181b",
    secondary: "#71717a",
    accent: "#3b82f6",
    background: "#ffffff",
    text: "#09090b",
    headingFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    borderRadius: 6,
  };
}

export function defaultFeatures(): SiteFeatures {
  return { auth: false, cart: false, checkout: false, products: false, subscriptions: false, rewards: false, booking: false, account: false };
}

// ─── Sites ────────────────────────────────────────────────────────────────────

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

export async function getSiteById(id: string): Promise<Site | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? siteFromDb(data) : null;
}

export async function getSiteBySlug(slug: string): Promise<Site | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw error;
  return data ? siteFromDb(data) : null;
}

export async function createSite(
  organizationId: string,
  name: string,
  slug: string
): Promise<Site> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .insert({
      organization_id: organizationId,
      name,
      slug,
      theme: defaultTheme(),
      published: false,
    })
    .select()
    .single();
  if (error) throw error;
  return siteFromDb(data);
}

export async function updateSite(
  id: string,
  updates: Partial<Pick<Site, "name" | "slug" | "theme" | "features" | "published" | "customDomain">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.theme !== undefined) payload.theme = updates.theme;
  if (updates.features !== undefined) payload.features = updates.features;
  if (updates.published !== undefined) payload.published = updates.published;
  if (updates.customDomain !== undefined) payload.custom_domain = updates.customDomain;
  payload.updated_at = new Date().toISOString();
  const { error } = await supabase.from("sites").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteSite(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("sites").delete().eq("id", id);
  if (error) throw error;
}

// ─── Pages ────────────────────────────────────────────────────────────────────

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

export async function getPageBySlug(siteId: string, slug: string): Promise<SitePage | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? pageFromDb(data) : null;
}

export async function createPage(
  siteId: string,
  name: string,
  slug: string,
  sortOrder = 0
): Promise<SitePage> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_pages")
    .insert({
      site_id: siteId,
      name,
      title: name,
      slug,
      elements: [],
      sort_order: sortOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return pageFromDb(data);
}

export async function updatePage(
  id: string,
  updates: Partial<Pick<SitePage, "name" | "slug" | "elements" | "sortOrder">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.elements !== undefined) payload.elements = updates.elements;
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
  const { error } = await supabase.from("site_pages").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deletePage(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("site_pages").delete().eq("id", id);
  if (error) throw error;
}

// ─── Component Library ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function componentFromDb(row: any): SiteComponent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    siteId: row.site_id ?? null,
    name: row.name,
    description: row.description ?? null,
    elementData: row.element_data as SiteElement,
    category: row.category ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

export async function getSavedComponents(orgId: string): Promise<SiteComponent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_components")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(componentFromDb);
}

export async function saveComponent(
  orgId: string,
  siteId: string,
  name: string,
  category: string | null,
  elementData: SiteElement,
  userId: string
): Promise<SiteComponent> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_components")
    .insert({
      organization_id: orgId,
      site_id: siteId,
      name,
      category: category || null,
      element_data: elementData,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return componentFromDb(data);
}

export async function deleteComponent(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("site_components").delete().eq("id", id);
  if (error) throw error;
}
