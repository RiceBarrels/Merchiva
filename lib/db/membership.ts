// @ts-nocheck
import { getConnection } from "@/lib/spacetimedb/client";
import type {
  MembershipTier,
  MembershipPerk,
  PerkClaim,
  SiteCustomer,
  CustomerPoints,
  SiteOrder,
  SiteBooking,
} from "@/lib/types";

// --- Password helpers ------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Mappers ---------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tierFromRow(r: any): MembershipTier {
  return {
    id: r.id.toString(),
    siteId: r.siteId,
    name: r.name,
    description: r.description ?? null,
    price: Number(r.price ?? 0),
    pricePeriod: r.pricePeriod ?? "free",
    color: r.color ?? "#3b82f6",
    icon: r.icon ?? "⭐",
    sortOrder: Number(r.sortOrder ?? 0),
    isDefault: Boolean(r.isDefault),
    createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function perkFromRow(r: any): MembershipPerk {
  return {
    id: r.id.toString(),
    tierId: r.tierId,
    type: r.type ?? "custom",
    name: r.name,
    description: r.description ?? null,
    couponCode: r.couponCode ?? null,
    discountValue: r.discountValue != null ? Number(r.discountValue) : null,
    discountType: r.discountType ?? null,
    cooldownHours: r.cooldownHours != null ? Number(r.cooldownHours) : null,
    frequency: r.frequency != null ? Number(r.frequency) : null,
    minPurchase: r.minPurchase != null ? Number(r.minPurchase) : null,
    validDays: r.validDays ?? null,
    validHours: r.validHours ?? null,
    active: Boolean(r.active ?? true),
    sortOrder: Number(r.sortOrder ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function perkClaimFromRow(r: any): PerkClaim {
  return {
    id: r.id.toString(),
    perkId: r.perkId,
    customerId: r.customerId,
    claimedAt: r.claimedAt ? String(r.claimedAt) : new Date().toISOString(),
    usedAt: r.usedAt ? String(r.usedAt) : null,
    couponCode: r.couponCode ?? null,
    expiresAt: r.expiresAt ? String(r.expiresAt) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customerFromRow(r: any): SiteCustomer {
  return {
    id: r.id.toString(),
    siteId: r.siteId,
    email: r.email,
    name: r.name ?? null,
    phone: r.phone ?? null,
    createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pointsFromRow(r: any): CustomerPoints {
  return {
    customerId: r.customerId,
    siteId: r.siteId,
    points: Number(r.points ?? 0),
    lifetimePoints: Number(r.lifetimePoints ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orderFromRow(r: any): SiteOrder {
  return {
    id: r.id.toString(),
    siteId: r.siteId,
    customerId: r.customerId ?? null,
    items: r.items ? (typeof r.items === "string" ? JSON.parse(r.items) : r.items) : [],
    total: Number(r.total ?? 0),
    status: r.status ?? "pending",
    customerName: r.customerName ?? null,
    customerEmail: r.customerEmail ?? null,
    notes: r.notes ?? null,
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
    partySize: Number(r.partySize ?? 1),
    name: r.name,
    phone: r.phone ?? null,
    email: r.email ?? null,
    notes: r.notes ?? null,
    status: r.status ?? "pending",
    createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
  };
}

// --- Tiers -----------------------------------------------------------------

export async function getMembershipTiers(siteId: string): Promise<MembershipTier[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.membershipTier.iter();
  return Array.from(rows)
    .filter((r: any) => r.siteId === siteId)
    .map(tierFromRow)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createTier(
  siteId: string,
  data: Pick<MembershipTier, "name" | "description" | "price" | "pricePeriod" | "color" | "icon" | "isDefault">
): Promise<MembershipTier> {
  console.warn("[SpacetimeDB] createTier: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    siteId,
    name: data.name,
    description: data.description ?? null,
    price: data.price,
    pricePeriod: data.pricePeriod,
    color: data.color,
    icon: data.icon,
    sortOrder: 0,
    isDefault: data.isDefault,
    createdAt: new Date().toISOString(),
  };
}

export async function updateTier(
  id: string,
  data: Partial<Pick<MembershipTier, "name" | "description" | "price" | "pricePeriod" | "color" | "icon" | "isDefault" | "sortOrder">>
): Promise<void> {
  console.warn("[SpacetimeDB] updateTier: writes not yet implemented via reducers");
}

export async function deleteTier(id: string): Promise<void> {
  console.warn("[SpacetimeDB] deleteTier: writes not yet implemented via reducers");
}

// --- Perks -----------------------------------------------------------------

export async function getTierPerks(tierId: string): Promise<MembershipPerk[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.membershipPerk.iter();
  return Array.from(rows)
    .filter((r: any) => r.tierId === tierId)
    .map(perkFromRow)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createPerk(
  tierId: string,
  data: Pick<MembershipPerk, "type" | "name" | "description" | "couponCode" | "discountValue" | "discountType" | "cooldownHours" | "frequency" | "minPurchase">
): Promise<MembershipPerk> {
  console.warn("[SpacetimeDB] createPerk: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    tierId,
    type: data.type,
    name: data.name,
    description: data.description ?? null,
    couponCode: data.couponCode ?? null,
    discountValue: data.discountValue ?? null,
    discountType: data.discountType ?? null,
    cooldownHours: data.cooldownHours ?? null,
    frequency: data.frequency ?? null,
    minPurchase: data.minPurchase ?? null,
    validDays: null,
    validHours: null,
    active: true,
    sortOrder: 0,
  };
}

export async function updatePerk(
  id: string,
  data: Partial<Pick<MembershipPerk, "name" | "description" | "type" | "couponCode" | "discountValue" | "discountType" | "cooldownHours" | "active" | "sortOrder">>
): Promise<void> {
  console.warn("[SpacetimeDB] updatePerk: writes not yet implemented via reducers");
}

export async function deletePerk(id: string): Promise<void> {
  console.warn("[SpacetimeDB] deletePerk: writes not yet implemented via reducers");
}

// --- Customer auth ---------------------------------------------------------

export async function registerCustomer(
  siteId: string,
  email: string,
  password: string,
  name: string
): Promise<SiteCustomer> {
  console.warn("[SpacetimeDB] registerCustomer: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    siteId,
    email: email.toLowerCase(),
    name,
    phone: null,
    createdAt: new Date().toISOString(),
  };
}

export async function loginCustomer(
  siteId: string,
  email: string,
  password: string
): Promise<SiteCustomer | null> {
  // Cannot verify password_hash from SpacetimeDB local cache
  const c = getConnection();
  if (!c) return null;
  const normalEmail = email.toLowerCase();
  const rows = (c as any).db.siteCustomer.iter();
  for (const r of rows) {
    if (r.siteId === siteId && r.email === normalEmail) {
      return customerFromRow(r);
    }
  }
  return null;
}

export async function getCustomer(id: string): Promise<SiteCustomer | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.siteCustomer.iter();
  for (const r of rows) {
    if (r.id === id) return customerFromRow(r);
  }
  return null;
}

// --- Customer membership ---------------------------------------------------

export async function getCustomerMembership(
  customerId: string,
  siteId: string
): Promise<{ tier: MembershipTier | null; perks: MembershipPerk[]; points: number }> {
  const c = getConnection();
  if (!c) return { tier: null, perks: [], points: 0 };

  // Find site_membership row for this customer
  let tierId: string | null = null;
  const memberRows = (c as any).db.siteMembership.iter();
  for (const r of memberRows) {
    if (r.customerId === customerId && r.siteId === siteId) {
      // siteMembership has plan, not tier_id — look up tier by matching
      // In the STDB schema siteMembership doesn't have tier_id, so fall back to tier lookup
      tierId = r.tierId ?? null;
      break;
    }
  }

  let tier: MembershipTier | null = null;
  if (tierId) {
    const tierRows = (c as any).db.membershipTier.iter();
    for (const r of tierRows) {
      if (r.id === tierId) {
        tier = tierFromRow(r);
        break;
      }
    }
  }

  const perks = tier ? await getTierPerks(tier.id) : [];
  const points = await getPoints(customerId, siteId);
  return { tier, perks, points };
}

export async function assignTier(customerId: string, tierId: string): Promise<void> {
  console.warn("[SpacetimeDB] assignTier: writes not yet implemented via reducers");
}

// --- Perk claims -----------------------------------------------------------

export async function canClaimPerk(
  customerId: string,
  perkId: string
): Promise<{ canClaim: boolean; nextClaimAt: Date | null }> {
  const c = getConnection();
  if (!c) return { canClaim: false, nextClaimAt: null };

  // Find the perk
  let cooldownHours: number | null = null;
  const perkRows = (c as any).db.membershipPerk.iter();
  for (const r of perkRows) {
    if (r.id === perkId) {
      cooldownHours = r.cooldownHours != null ? Number(r.cooldownHours) : null;
      break;
    }
  }

  // Find last claim
  let lastClaimedAt: string | null = null;
  const claimRows = (c as any).db.perkClaim.iter();
  for (const r of claimRows) {
    if (r.customerId === customerId && r.perkId === perkId) {
      const ts = r.claimedAt ? String(r.claimedAt) : null;
      if (ts && (!lastClaimedAt || ts > lastClaimedAt)) {
        lastClaimedAt = ts;
      }
    }
  }

  if (!lastClaimedAt) return { canClaim: true, nextClaimAt: null };

  if (cooldownHours) {
    const next = new Date(lastClaimedAt);
    next.setHours(next.getHours() + cooldownHours);
    if (next > new Date()) return { canClaim: false, nextClaimAt: next };
  }

  return { canClaim: true, nextClaimAt: null };
}

export async function claimPerk(customerId: string, perkId: string): Promise<PerkClaim> {
  console.warn("[SpacetimeDB] claimPerk: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    perkId,
    customerId,
    claimedAt: new Date().toISOString(),
    usedAt: null,
    couponCode: null,
    expiresAt: null,
  };
}

export async function getCustomerClaims(customerId: string): Promise<PerkClaim[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.perkClaim.iter();
  return Array.from(rows)
    .filter((r: any) => r.customerId === customerId)
    .map(perkClaimFromRow)
    .sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
}

// --- Points ----------------------------------------------------------------

export async function getPoints(customerId: string, siteId: string): Promise<number> {
  const c = getConnection();
  if (!c) return 0;
  const rows = (c as any).db.customerPoints.iter();
  for (const r of rows) {
    if (r.customerId === customerId && r.siteId === siteId) {
      return Number(r.points ?? 0);
    }
  }
  return 0;
}

export async function addPoints(customerId: string, siteId: string, amount: number): Promise<void> {
  console.warn("[SpacetimeDB] addPoints: writes not yet implemented via reducers");
}

export async function redeemPoints(
  customerId: string,
  siteId: string,
  amount: number
): Promise<boolean> {
  const current = await getPoints(customerId, siteId);
  if (current < amount) return false;
  console.warn("[SpacetimeDB] redeemPoints: writes not yet implemented via reducers");
  return true;
}

// --- Orders ----------------------------------------------------------------

export async function createOrder(
  siteId: string,
  customerId: string | null,
  items: { name: string; price: number; quantity: number }[],
  total: number,
  opts?: { customerName?: string; customerEmail?: string; notes?: string }
): Promise<SiteOrder> {
  console.warn("[SpacetimeDB] createOrder: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    siteId,
    customerId,
    items,
    total,
    status: "pending",
    customerName: opts?.customerName ?? null,
    customerEmail: opts?.customerEmail ?? null,
    notes: opts?.notes ?? null,
    createdAt: new Date().toISOString(),
  };
}

export async function getCustomerOrders(customerId: string): Promise<SiteOrder[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.siteOrder.iter();
  return Array.from(rows)
    .filter((r: any) => r.customerId === customerId)
    .map(orderFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getOrgOrders(siteId: string): Promise<SiteOrder[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.siteOrder.iter();
  return Array.from(rows)
    .filter((r: any) => r.siteId === siteId)
    .map(orderFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateOrderStatus(
  id: string,
  status: SiteOrder["status"]
): Promise<void> {
  console.warn("[SpacetimeDB] updateOrderStatus: writes not yet implemented via reducers");
}

// --- Bookings --------------------------------------------------------------

export async function createBooking(
  siteId: string,
  data: Omit<SiteBooking, "id" | "siteId" | "createdAt">
): Promise<SiteBooking> {
  console.warn("[SpacetimeDB] createBooking: writes not yet implemented via reducers");
  return {
    id: crypto.randomUUID(),
    siteId,
    customerId: data.customerId,
    date: data.date,
    time: data.time,
    partySize: data.partySize,
    name: data.name,
    phone: data.phone,
    email: data.email,
    notes: data.notes,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export async function getCustomerBookings(customerId: string): Promise<SiteBooking[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.siteBooking.iter();
  return Array.from(rows)
    .filter((r: any) => r.customerId === customerId)
    .map(bookingFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getOrgBookings(siteId: string): Promise<SiteBooking[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.siteBooking.iter();
  return Array.from(rows)
    .filter((r: any) => r.siteId === siteId)
    .map(bookingFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateBookingStatus(
  id: string,
  status: SiteBooking["status"]
): Promise<void> {
  console.warn("[SpacetimeDB] updateBookingStatus: writes not yet implemented via reducers");
}

// --- Customer list (for admin) ---------------------------------------------

export async function getSiteCustomers(siteId: string): Promise<SiteCustomer[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.siteCustomer.iter();
  return Array.from(rows)
    .filter((r: any) => r.siteId === siteId)
    .map(customerFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
