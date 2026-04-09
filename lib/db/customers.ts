// @ts-nocheck
import { createClient } from "@/lib/supabase/client";
/**
 * Site customer system — stores in site_customers, site_memberships, site_orders, site_bookings
 *
 * Required SQL (run in Supabase):
 *
 * create table if not exists site_customers (
 *   id uuid primary key default gen_random_uuid(),
 *   site_id uuid not null references sites(id) on delete cascade,
 *   email text not null,
 *   password_hash text not null,
 *   name text not null default '',
 *   phone text,
 *   created_at timestamptz not null default now(),
 *   unique(site_id, email)
 * );
 * alter table site_customers enable row level security;
 * create policy "public read own" on site_customers for select using (true);
 * create policy "public insert" on site_customers for insert with check (true);
 * create policy "public update own" on site_customers for update using (true);
 *
 * create table if not exists site_memberships (
 *   id uuid primary key default gen_random_uuid(),
 *   site_id uuid not null references sites(id) on delete cascade,
 *   customer_id uuid not null references site_customers(id) on delete cascade,
 *   plan text not null default 'free',
 *   started_at timestamptz not null default now(),
 *   expires_at timestamptz,
 *   unique(site_id, customer_id)
 * );
 * alter table site_memberships enable row level security;
 * create policy "public all" on site_memberships for all using (true) with check (true);
 *
 * create table if not exists site_orders (
 *   id uuid primary key default gen_random_uuid(),
 *   site_id uuid not null references sites(id) on delete cascade,
 *   customer_id uuid references site_customers(id) on delete set null,
 *   items jsonb not null default '[]',
 *   total numeric not null default 0,
 *   status text not null default 'pending',
 *   created_at timestamptz not null default now()
 * );
 * alter table site_orders enable row level security;
 * create policy "public all" on site_orders for all using (true) with check (true);
 *
 * create table if not exists site_bookings (
 *   id uuid primary key default gen_random_uuid(),
 *   site_id uuid not null references sites(id) on delete cascade,
 *   customer_id uuid references site_customers(id) on delete set null,
 *   date text not null,
 *   time text not null,
 *   party_size integer not null default 1,
 *   name text not null default '',
 *   phone text not null default '',
 *   notes text not null default '',
 *   status text not null default 'pending',
 *   created_at timestamptz not null default now()
 * );
 * alter table site_bookings enable row level security;
 * create policy "public all" on site_bookings for all using (true) with check (true);
 */

import type { SiteCustomer, SiteMembership, SiteOrder, SiteBooking, CartItem } from "@/lib/types";

// ─── Password hashing (Web Crypto — no external package) ──────────────────────

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customerFromDb(row: any): SiteCustomer {
  return {
    id: row.id,
    siteId: row.site_id,
    email: row.email,
    name: row.name ?? "",
    phone: row.phone ?? null,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function membershipFromDb(row: any): SiteMembership {
  return {
    id: row.id,
    siteId: row.site_id,
    customerId: row.customer_id,
    plan: row.plan ?? "free",
    startedAt: row.started_at,
    expiresAt: row.expires_at ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orderFromDb(row: any): SiteOrder {
  return {
    id: row.id,
    siteId: row.site_id,
    customerId: row.customer_id,
    items: row.items ?? [],
    total: Number(row.total),
    status: row.status ?? "pending",
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bookingFromDb(row: any): SiteBooking {
  return {
    id: row.id,
    siteId: row.site_id,
    customerId: row.customer_id ?? null,
    date: row.date,
    time: row.time,
    partySize: Number(row.party_size),
    name: row.name ?? "",
    phone: row.phone ?? "",
    notes: row.notes ?? "",
    status: row.status ?? "pending",
    createdAt: row.created_at,
  };
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function registerCustomer(
  siteId: string,
  email: string,
  password: string,
  name: string,
  phone?: string
): Promise<SiteCustomer> {
  const supabase = createClient();
  const hash = await hashPassword(password);
  const { data, error } = await supabase
    .from("site_customers")
    .insert({
      site_id: siteId,
      email: email.toLowerCase().trim(),
      password_hash: hash,
      name: name.trim(),
      phone: phone?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return customerFromDb(data);
}

export async function loginCustomer(
  siteId: string,
  email: string,
  password: string
): Promise<SiteCustomer | null> {
  const supabase = createClient();
  const hash = await hashPassword(password);
  const { data, error } = await supabase
    .from("site_customers")
    .select("*")
    .eq("site_id", siteId)
    .eq("email", email.toLowerCase().trim())
    .eq("password_hash", hash)
    .maybeSingle();
  if (error) throw error;
  return data ? customerFromDb(data) : null;
}

export async function getCustomerById(id: string): Promise<SiteCustomer | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? customerFromDb(data) : null;
}

export async function updateCustomer(
  id: string,
  updates: Partial<Pick<SiteCustomer, "name" | "phone">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  const { error } = await supabase.from("site_customers").update(payload).eq("id", id);
  if (error) throw error;
}

// ─── Memberships ──────────────────────────────────────────────────────────────

export async function getMembership(siteId: string, customerId: string): Promise<SiteMembership | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_memberships")
    .select("*")
    .eq("site_id", siteId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data ? membershipFromDb(data) : null;
}

export async function upsertMembership(
  siteId: string,
  customerId: string,
  plan: "free" | "basic" | "premium"
): Promise<SiteMembership> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_memberships")
    .upsert(
      { site_id: siteId, customer_id: customerId, plan, started_at: new Date().toISOString() },
      { onConflict: "site_id,customer_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return membershipFromDb(data);
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function createOrder(
  siteId: string,
  customerId: string | null,
  items: CartItem[],
  total: number
): Promise<SiteOrder> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_orders")
    .insert({
      site_id: siteId,
      customer_id: customerId,
      items,
      total,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return orderFromDb(data);
}

export async function getCustomerOrders(siteId: string, customerId: string): Promise<SiteOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_orders")
    .select("*")
    .eq("site_id", siteId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(orderFromDb);
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function createBooking(
  siteId: string,
  fields: Omit<SiteBooking, "id" | "siteId" | "status" | "createdAt">
): Promise<SiteBooking> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_bookings")
    .insert({
      site_id: siteId,
      customer_id: fields.customerId,
      date: fields.date,
      time: fields.time,
      party_size: fields.partySize,
      name: fields.name,
      phone: fields.phone,
      notes: fields.notes,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return bookingFromDb(data);
}

export async function getCustomerBookings(siteId: string, customerId: string): Promise<SiteBooking[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_bookings")
    .select("*")
    .eq("site_id", siteId)
    .eq("customer_id", customerId)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(bookingFromDb);
}
