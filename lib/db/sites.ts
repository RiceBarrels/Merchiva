// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { Site, SitePage, SiteElement, SiteTheme, SiteComponent, SiteFeatures } from "@/lib/types";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonField<T>(value: string | T, fallback: T): T {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value ?? fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function siteFromRow(row: any): Site {
  return {
    id: row.id.toString(),
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    theme: parseJsonField(row.theme, defaultTheme()),
    features: { ...defaultFeatures(), ...parseJsonField(row.features, {}) },
    published: row.published ?? false,
    customDomain: row.customDomain ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageFromRow(row: any): SitePage {
  return {
    id: row.id.toString(),
    siteId: row.siteId,
    name: row.name ?? "Untitled",
    slug: row.slug ?? "index",
    elements: parseJsonField(row.elements, []) as SiteElement[],
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function componentFromRow(row: any): SiteComponent {
  return {
    id: row.id.toString(),
    organizationId: row.organizationId,
    siteId: row.siteId ?? null,
    name: row.name,
    description: row.description ?? null,
    elementData: parseJsonField(row.elementData, {} as SiteElement),
    category: row.category ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
  };
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export async function getSites(organizationId: string): Promise<Site[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.site.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId)
    .map(siteFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getSiteById(id: string): Promise<Site | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.site.iter();
  const row = Array.from(rows).find((r: any) => r.id.toString() === id);
  return row ? siteFromRow(row) : null;
}

export async function getSiteBySlug(slug: string): Promise<Site | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.site.iter();
  const row = Array.from(rows).find((r: any) => r.slug === slug && r.published);
  return row ? siteFromRow(row) : null;
}

export async function createSite(
  organizationId: string,
  name: string,
  slug: string
): Promise<Site> {
  console.warn("[sites] createSite: writes should go through @/lib/spacetimedb/actions.ts");
  // Return an optimistic placeholder
  return {
    id: crypto.randomUUID(),
    organizationId,
    name,
    slug,
    theme: defaultTheme(),
    features: defaultFeatures(),
    published: false,
    customDomain: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateSite(
  id: string,
  updates: Partial<Pick<Site, "name" | "slug" | "theme" | "features" | "published" | "customDomain">>
): Promise<void> {
  console.warn("[sites] updateSite: writes should go through @/lib/spacetimedb/actions.ts");
}

export async function deleteSite(id: string): Promise<void> {
  console.warn("[sites] deleteSite: writes should go through @/lib/spacetimedb/actions.ts");
}

// ─── Pages ────────────────────────────────────────────────────────────────────

export async function getPages(siteId: string): Promise<SitePage[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.sitePage.iter();
  return Array.from(rows)
    .filter((r: any) => r.siteId === siteId)
    .map(pageFromRow)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getPageBySlug(siteId: string, slug: string): Promise<SitePage | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.sitePage.iter();
  const row = Array.from(rows).find((r: any) => r.siteId === siteId && r.slug === slug);
  return row ? pageFromRow(row) : null;
}

export async function createPage(
  siteId: string,
  name: string,
  slug: string,
  sortOrder = 0
): Promise<SitePage> {
  console.warn("[sites] createPage: writes should go through @/lib/spacetimedb/actions.ts");
  return {
    id: crypto.randomUUID(),
    siteId,
    name,
    slug,
    elements: [],
    sortOrder,
    createdAt: new Date().toISOString(),
  };
}

export async function updatePage(
  id: string,
  updates: Partial<Pick<SitePage, "name" | "slug" | "elements" | "sortOrder">>
): Promise<void> {
  console.warn("[sites] updatePage: writes should go through @/lib/spacetimedb/actions.ts");
}

export async function deletePage(id: string): Promise<void> {
  console.warn("[sites] deletePage: writes should go through @/lib/spacetimedb/actions.ts");
}

// ─── Component Library ────────────────────────────────────────────────────────

export async function getSavedComponents(orgId: string): Promise<SiteComponent[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.siteComponent.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === orgId)
    .map(componentFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function saveComponent(
  orgId: string,
  siteId: string,
  name: string,
  category: string | null,
  elementData: SiteElement,
  userId: string
): Promise<SiteComponent> {
  console.warn("[sites] saveComponent: writes should go through @/lib/spacetimedb/actions.ts");
  return {
    id: crypto.randomUUID(),
    organizationId: orgId,
    siteId,
    name,
    description: null,
    elementData,
    category: category || null,
    createdBy: userId,
    createdAt: new Date().toISOString(),
  };
}

export async function deleteComponent(id: string): Promise<void> {
  console.warn("[sites] deleteComponent: writes should go through @/lib/spacetimedb/actions.ts");
}
