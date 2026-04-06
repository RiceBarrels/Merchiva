import { createClient } from "@/lib/supabase/client";
import type { Site, SitePage, SiteElement, SiteTheme } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function siteFromDb(row: any): Site {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    published: row.published ?? false,
    theme: (row.theme ?? DEFAULT_THEME) as SiteTheme,
    customCss: row.custom_css ?? "",
    faviconUrl: row.favicon_url ?? null,
    metaTitle: row.meta_title ?? null,
    metaDescription: row.meta_description ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageFromDb(row: any): SitePage {
  return {
    id: row.id,
    siteId: row.site_id,
    title: row.title,
    slug: row.slug,
    sortOrder: row.sort_order ?? 0,
    isHome: row.is_home ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function elementFromDb(row: any): SiteElement {
  return {
    id: row.id,
    pageId: row.page_id,
    parentId: row.parent_id ?? null,
    type: row.type,
    props: row.props ?? {},
    styles: row.styles ?? {},
    sortOrder: row.sort_order ?? 0,
  };
}

export const DEFAULT_THEME: SiteTheme = {
  primaryColor: "#1c1917",
  secondaryColor: "#44403c",
  accentColor: "#d6d3d1",
  fontHeading: "Inter",
  fontBody: "Inter",
  borderRadius: "0.3rem",
  backgroundColor: "#ffffff",
  textColor: "#1c1917",
};

// ─── Sites ───────────────────────────────────────────────────────────────────

export async function getSites(organizationId: string): Promise<Site[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");
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

export async function createSite(
  userId: string,
  organizationId: string,
  name: string,
  slug: string
): Promise<Site> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      name,
      slug,
      published: false,
      theme: DEFAULT_THEME,
      custom_css: "",
    })
    .select()
    .single();
  if (error) throw error;
  return siteFromDb(data);
}

export async function updateSite(id: string, updates: Partial<Site>): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.published !== undefined) payload.published = updates.published;
  if (updates.theme !== undefined) payload.theme = updates.theme;
  if (updates.customCss !== undefined) payload.custom_css = updates.customCss;
  if (updates.faviconUrl !== undefined) payload.favicon_url = updates.faviconUrl;
  if (updates.metaTitle !== undefined) payload.meta_title = updates.metaTitle;
  if (updates.metaDescription !== undefined) payload.meta_description = updates.metaDescription;
  const { error } = await supabase.from("sites").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteSite(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("sites").delete().eq("id", id);
  if (error) throw error;
}

// ─── Pages ───────────────────────────────────────────────────────────────────

export async function getPages(siteId: string): Promise<SitePage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_pages")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(pageFromDb);
}

export async function createPage(
  siteId: string,
  title: string,
  slug: string,
  sortOrder: number,
  isHome: boolean
): Promise<SitePage> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_pages")
    .insert({ site_id: siteId, title, slug, sort_order: sortOrder, is_home: isHome })
    .select()
    .single();
  if (error) throw error;
  return pageFromDb(data);
}

export async function updatePage(id: string, updates: Partial<SitePage>): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
  if (updates.isHome !== undefined) payload.is_home = updates.isHome;
  const { error } = await supabase.from("site_pages").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deletePage(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("site_pages").delete().eq("id", id);
  if (error) throw error;
}

// ─── Elements ────────────────────────────────────────────────────────────────

export async function getElements(pageId: string): Promise<SiteElement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_elements")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(elementFromDb);
}

export async function saveElements(pageId: string, elements: SiteElement[]): Promise<void> {
  const supabase = createClient();
  await supabase.from("site_elements").delete().eq("page_id", pageId);
  if (elements.length === 0) return;
  const { error } = await supabase.from("site_elements").insert(
    elements.map((el, i) => ({
      id: el.id,
      page_id: pageId,
      parent_id: el.parentId ?? null,
      type: el.type,
      props: el.props,
      styles: el.styles,
      sort_order: i,
    }))
  );
  if (error) throw error;
}
