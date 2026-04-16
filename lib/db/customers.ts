// @ts-nocheck
import { getConnection } from "@/lib/spacetimedb/client";
import type { SiteCustomer, SiteMembership, SiteOrder, SiteBooking, CartItem } from "@/lib/types";

// --- Password hashing (Web Crypto) ----------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Mappers ---------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customerFromRow(r: any): SiteCustomer {
  return {
    id: r.id.toString(),
    siteId: r.siteId,
    email: r.email,
    name: r.name ?? "",
    phone: r.phone ?? null,
    createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function membershipFromRow(r: any): SiteMembership {
  return {
    id: r.id.toString(),
    siteId: r.siteId,
    customerId: r.customerId,
    plan: r.plan ?? "free",
    startedAt: r.startedAt ? String(r.startedAt) : new Date().toISOString(),
    expiresAt: r.expiresAt ? String(r.expiresAt) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orderFromRow(r: any): SiteOrder {
  return {
    id: r.id.toString(),
    siteId: r.siteId,
    customerId: r.customerId ?? null,
    items: r.items ? (typeof r.items === "string" ? JSON.parse(r.items) : r.items) : [],
    total: Number(r.total),
    status: r.status ?? "pending",
    createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bookingFromRow(r: any): SiteBooking {
  return {
    id: r.id.toString(),
    siteId: r.siteId,
    customerId: r.customerId ?? null,
    date: r.date,
    time: r.time,
    partySize: Number(r.partySize),
    name: r.name ?? "",
    phone: r.phone ?? "",
    notes: r.notes ?? "",
    status: r.status ?? "pending",
    createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
  };
}

// --- Customers -------------------------------------------------------------

export async function registerCustomer(
  siteId: string,
  email: string,
  password: string,
  name: string,
  phone?: string
): Promise<SiteCustomer> {
  console.warn("[SpacetimeDB] registerCustomer: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    siteId,
    email: email.toLowerCase().trim(),
    name: name.trim(),
    phone: phone?.trim() || null,
    createdAt: new Date().toISOString(),
  };
}

export async function loginCustomer(
  siteId: string,
  email: string,
  password: string
): Promise<SiteCustomer | null> {
  // Cannot verify password_hash from SpacetimeDB local cache (not stored client-side)
  // Look up customer by site + email as a best-effort match
  const c = getConnection();
  if (!c) return null;
  const normalEmail = email.toLowerCase().trim();
  const rows = (c as any).db.siteCustomer.iter();
  for (const r of rows) {
    if (r.siteId === siteId && r.email === normalEmail) {
      return customerFromRow(r);
    }
  }
  return null;
}

export async function getCustomerById(id: string): Promise<SiteCustomer | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.siteCustomer.iter();
  for (const r of rows) {
    if (r.id === id) return customerFromRow(r);
  }
  return null;
}

export async function updateCustomer(
  id: string,
  updates: Partial<Pick<SiteCustomer, "name" | "phone">>
): Promise<void> {
  console.warn("[SpacetimeDB] updateCustomer: writes not yet implemented via reducers");
}

// --- Memberships -----------------------------------------------------------

export async function getMembership(siteId: string, customerId: string): Promise<SiteMembership | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.siteMembership.iter();
  for (const r of rows) {
    if (r.siteId === siteId && r.customerId === customerId) {
      return membershipFromRow(r);
    }
  }
  return null;
}

export async function upsertMembership(
  siteId: string,
  customerId: string,
  plan: "free" | "basic" | "premium"
): Promise<SiteMembership> {
  console.warn("[SpacetimeDB] upsertMembership: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    siteId,
    customerId,
    plan,
    startedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

// --- Orders ----------------------------------------------------------------

export async function createOrder(
  siteId: string,
  customerId: string | null,
  items: CartItem[],
  total: number
): Promise<SiteOrder> {
  console.warn("[SpacetimeDB] createOrder: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    siteId,
    customerId,
    items,
    total,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export async function getCustomerOrders(siteId: string, customerId: string): Promise<SiteOrder[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.siteOrder.iter();
  return Array.from(rows)
    .filter((r: any) => r.siteId === siteId && r.customerId === customerId)
    .map(orderFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// --- Bookings --------------------------------------------------------------

export async function createBooking(
  siteId: string,
  fields: Omit<SiteBooking, "id" | "siteId" | "status" | "createdAt">
): Promise<SiteBooking> {
  console.warn("[SpacetimeDB] createBooking: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    siteId,
    customerId: fields.customerId,
    date: fields.date,
    time: fields.time,
    partySize: fields.partySize,
    name: fields.name,
    phone: fields.phone,
    notes: fields.notes,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export async function getCustomerBookings(siteId: string, customerId: string): Promise<SiteBooking[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.siteBooking.iter();
  return Array.from(rows)
    .filter((r: any) => r.siteId === siteId && r.customerId === customerId)
    .map(bookingFromRow)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
