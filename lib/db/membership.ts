import type {
  MembershipTier,
  MembershipPerk,
  PerkClaim,
  SiteCustomer,
  CustomerPoints,
  SiteOrder,
  SiteBooking,
} from "@/lib/types";

// ─── Password helpers ─────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tierFromDb(row: any): MembershipTier {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    description: row.description ?? null,
    price: row.price ?? 0,
    pricePeriod: row.price_period ?? "free",
    color: row.color ?? "#3b82f6",
    icon: row.icon ?? "⭐",
    sortOrder: row.sort_order ?? 0,
    isDefault: row.is_default ?? false,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function perkFromDb(row: any): MembershipPerk {
  return {
    id: row.id,
    tierId: row.tier_id,
    type: row.type ?? "custom",
    name: row.name,
    description: row.description ?? null,
    couponCode: row.coupon_code ?? null,
    discountValue: row.discount_value ?? null,
    discountType: row.discount_type ?? null,
    cooldownHours: row.cooldown_hours ?? null,
    frequency: row.frequency ?? null,
    minPurchase: row.min_purchase ?? null,
    validDays: row.valid_days ?? null,
    validHours: row.valid_hours ?? null,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function perkClaimFromDb(row: any): PerkClaim {
  return {
    id: row.id,
    perkId: row.perk_id,
    customerId: row.customer_id,
    claimedAt: row.claimed_at,
    usedAt: row.used_at ?? null,
    couponCode: row.coupon_code ?? null,
    expiresAt: row.expires_at ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customerFromDb(row: any): SiteCustomer {
  return {
    id: row.id,
    siteId: row.site_id,
    email: row.email,
    name: row.name ?? null,
    phone: row.phone ?? null,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pointsFromDb(row: any): CustomerPoints {
  return {
    customerId: row.customer_id,
    siteId: row.site_id,
    points: row.points ?? 0,
    lifetimePoints: row.lifetime_points ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orderFromDb(row: any): SiteOrder {
  return {
    id: row.id,
    siteId: row.site_id,
    customerId: row.customer_id ?? null,
    items: row.items ?? [],
    total: row.total ?? 0,
    status: row.status ?? "pending",
    customerName: row.customer_name ?? null,
    customerEmail: row.customer_email ?? null,
    notes: row.notes ?? null,
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
    partySize: row.party_size ?? 1,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    notes: row.notes ?? null,
    status: row.status ?? "pending",
    createdAt: row.created_at,
  };
}

// ─── Tiers ────────────────────────────────────────────────────────────────────

export async function getMembershipTiers(siteId: string): Promise<MembershipTier[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("membership_tiers")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(tierFromDb);
}

export async function createTier(
  siteId: string,
  data: Pick<MembershipTier, "name" | "description" | "price" | "pricePeriod" | "color" | "icon" | "isDefault">
): Promise<MembershipTier> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("membership_tiers")
    .insert({
      site_id: siteId,
      name: data.name,
      description: data.description,
      price: data.price,
      price_period: data.pricePeriod,
      color: data.color,
      icon: data.icon,
      is_default: data.isDefault,
      sort_order: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return tierFromDb(row);
}

export async function updateTier(
  id: string,
  data: Partial<Pick<MembershipTier, "name" | "description" | "price" | "pricePeriod" | "color" | "icon" | "isDefault" | "sortOrder">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.description !== undefined) payload.description = data.description;
  if (data.price !== undefined) payload.price = data.price;
  if (data.pricePeriod !== undefined) payload.price_period = data.pricePeriod;
  if (data.color !== undefined) payload.color = data.color;
  if (data.icon !== undefined) payload.icon = data.icon;
  if (data.isDefault !== undefined) payload.is_default = data.isDefault;
  if (data.sortOrder !== undefined) payload.sort_order = data.sortOrder;
  const { error } = await supabase.from("membership_tiers").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteTier(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("membership_tiers").delete().eq("id", id);
  if (error) throw error;
}

// ─── Perks ────────────────────────────────────────────────────────────────────

export async function getTierPerks(tierId: string): Promise<MembershipPerk[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("membership_perks")
    .select("*")
    .eq("tier_id", tierId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(perkFromDb);
}

export async function createPerk(
  tierId: string,
  data: Pick<MembershipPerk, "type" | "name" | "description" | "couponCode" | "discountValue" | "discountType" | "cooldownHours" | "frequency" | "minPurchase">
): Promise<MembershipPerk> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("membership_perks")
    .insert({
      tier_id: tierId,
      type: data.type,
      name: data.name,
      description: data.description,
      coupon_code: data.couponCode,
      discount_value: data.discountValue,
      discount_type: data.discountType,
      cooldown_hours: data.cooldownHours,
      frequency: data.frequency,
      min_purchase: data.minPurchase,
      active: true,
      sort_order: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return perkFromDb(row);
}

export async function updatePerk(
  id: string,
  data: Partial<Pick<MembershipPerk, "name" | "description" | "type" | "couponCode" | "discountValue" | "discountType" | "cooldownHours" | "active" | "sortOrder">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.description !== undefined) payload.description = data.description;
  if (data.type !== undefined) payload.type = data.type;
  if (data.couponCode !== undefined) payload.coupon_code = data.couponCode;
  if (data.discountValue !== undefined) payload.discount_value = data.discountValue;
  if (data.discountType !== undefined) payload.discount_type = data.discountType;
  if (data.cooldownHours !== undefined) payload.cooldown_hours = data.cooldownHours;
  if (data.active !== undefined) payload.active = data.active;
  if (data.sortOrder !== undefined) payload.sort_order = data.sortOrder;
  const { error } = await supabase.from("membership_perks").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deletePerk(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("membership_perks").delete().eq("id", id);
  if (error) throw error;
}

// ─── Customer auth ────────────────────────────────────────────────────────────

export async function registerCustomer(
  siteId: string,
  email: string,
  password: string,
  name: string
): Promise<SiteCustomer> {
  const supabase = createClient();
  // Check duplicate
  const { data: existing } = await supabase
    .from("site_customers")
    .select("id")
    .eq("site_id", siteId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (existing) throw new Error("Email already registered");

  const passwordHash = await hashPassword(password);
  const { data: row, error } = await supabase
    .from("site_customers")
    .insert({
      site_id: siteId,
      email: email.toLowerCase(),
      name,
      password_hash: passwordHash,
    })
    .select()
    .single();
  if (error) throw error;
  return customerFromDb(row);
}

export async function loginCustomer(
  siteId: string,
  email: string,
  password: string
): Promise<SiteCustomer | null> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("site_customers")
    .select("*")
    .eq("site_id", siteId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const hash = await hashPassword(password);
  if (hash !== row.password_hash) return null;
  return customerFromDb(row);
}

export async function getCustomer(id: string): Promise<SiteCustomer | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? customerFromDb(data) : null;
}

// ─── Customer membership ──────────────────────────────────────────────────────

export async function getCustomerMembership(
  customerId: string,
  siteId: string
): Promise<{ tier: MembershipTier | null; perks: MembershipPerk[]; points: number }> {
  const supabase = createClient();
  const { data: memberRow } = await supabase
    .from("site_memberships")
    .select("tier_id")
    .eq("customer_id", customerId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (!memberRow?.tier_id) {
    const pts = await getPoints(customerId, siteId);
    return { tier: null, perks: [], points: pts };
  }

  const { data: tierRow } = await supabase
    .from("membership_tiers")
    .select("*")
    .eq("id", memberRow.tier_id)
    .maybeSingle();

  const tier = tierRow ? tierFromDb(tierRow) : null;
  const perks = tier ? await getTierPerks(tier.id) : [];
  const points = await getPoints(customerId, siteId);
  return { tier, perks, points };
}

export async function assignTier(customerId: string, tierId: string): Promise<void> {
  const supabase = createClient();
  // Upsert membership record
  const { data: tier } = await supabase
    .from("membership_tiers")
    .select("site_id")
    .eq("id", tierId)
    .single();
  if (!tier) throw new Error("Tier not found");
  const { error } = await supabase
    .from("site_memberships")
    .upsert(
      { customer_id: customerId, site_id: tier.site_id, tier_id: tierId },
      { onConflict: "customer_id,site_id" }
    );
  if (error) throw error;
}

// ─── Perk claims ──────────────────────────────────────────────────────────────

export async function canClaimPerk(
  customerId: string,
  perkId: string
): Promise<{ canClaim: boolean; nextClaimAt: Date | null }> {
  const supabase = createClient();

  const { data: perk } = await supabase
    .from("membership_perks")
    .select("cooldown_hours, frequency")
    .eq("id", perkId)
    .maybeSingle();

  if (!perk) return { canClaim: false, nextClaimAt: null };

  const { data: lastClaim } = await supabase
    .from("perk_claims")
    .select("claimed_at")
    .eq("customer_id", customerId)
    .eq("perk_id", perkId)
    .order("claimed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastClaim) return { canClaim: true, nextClaimAt: null };

  if (perk.cooldown_hours) {
    const next = new Date(lastClaim.claimed_at);
    next.setHours(next.getHours() + perk.cooldown_hours);
    if (next > new Date()) return { canClaim: false, nextClaimAt: next };
  }

  return { canClaim: true, nextClaimAt: null };
}

export async function claimPerk(customerId: string, perkId: string): Promise<PerkClaim> {
  const { canClaim } = await canClaimPerk(customerId, perkId);
  if (!canClaim) throw new Error("Perk not available yet");

  const supabase = createClient();
  const { data: perk } = await supabase
    .from("membership_perks")
    .select("coupon_code")
    .eq("id", perkId)
    .single();

  const { data: row, error } = await supabase
    .from("perk_claims")
    .insert({
      perk_id: perkId,
      customer_id: customerId,
      coupon_code: perk?.coupon_code ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return perkClaimFromDb(row);
}

export async function getCustomerClaims(customerId: string): Promise<PerkClaim[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("perk_claims")
    .select("*")
    .eq("customer_id", customerId)
    .order("claimed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(perkClaimFromDb);
}

// ─── Points ───────────────────────────────────────────────────────────────────

export async function getPoints(customerId: string, siteId: string): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from("customer_points")
    .select("points")
    .eq("customer_id", customerId)
    .eq("site_id", siteId)
    .maybeSingle();
  return data?.points ?? 0;
}

export async function addPoints(customerId: string, siteId: string, amount: number): Promise<void> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("customer_points")
    .select("points, lifetime_points")
    .eq("customer_id", customerId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("customer_points")
      .update({
        points: existing.points + amount,
        lifetime_points: existing.lifetime_points + amount,
      })
      .eq("customer_id", customerId)
      .eq("site_id", siteId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("customer_points")
      .insert({ customer_id: customerId, site_id: siteId, points: amount, lifetime_points: amount });
    if (error) throw error;
  }
}

export async function redeemPoints(
  customerId: string,
  siteId: string,
  amount: number
): Promise<boolean> {
  const current = await getPoints(customerId, siteId);
  if (current < amount) return false;
  const supabase = createClient();
  const { error } = await supabase
    .from("customer_points")
    .update({ points: current - amount })
    .eq("customer_id", customerId)
    .eq("site_id", siteId);
  if (error) throw error;
  return true;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function createOrder(
  siteId: string,
  customerId: string | null,
  items: { name: string; price: number; quantity: number }[],
  total: number,
  opts?: { customerName?: string; customerEmail?: string; notes?: string }
): Promise<SiteOrder> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("site_orders")
    .insert({
      site_id: siteId,
      customer_id: customerId,
      items,
      total,
      status: "pending",
      customer_name: opts?.customerName ?? null,
      customer_email: opts?.customerEmail ?? null,
      notes: opts?.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return orderFromDb(row);
}

export async function getCustomerOrders(customerId: string): Promise<SiteOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_orders")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(orderFromDb);
}

export async function getOrgOrders(siteId: string): Promise<SiteOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_orders")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(orderFromDb);
}

export async function updateOrderStatus(
  id: string,
  status: SiteOrder["status"]
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("site_orders")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function createBooking(
  siteId: string,
  data: Omit<SiteBooking, "id" | "siteId" | "createdAt">
): Promise<SiteBooking> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("site_bookings")
    .insert({
      site_id: siteId,
      customer_id: data.customerId,
      date: data.date,
      time: data.time,
      party_size: data.partySize,
      name: data.name,
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return bookingFromDb(row);
}

export async function getCustomerBookings(customerId: string): Promise<SiteBooking[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_bookings")
    .select("*")
    .eq("customer_id", customerId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(bookingFromDb);
}

export async function getOrgBookings(siteId: string): Promise<SiteBooking[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_bookings")
    .select("*")
    .eq("site_id", siteId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(bookingFromDb);
}

export async function updateBookingStatus(
  id: string,
  status: SiteBooking["status"]
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("site_bookings")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

// ─── Customer list (for admin) ────────────────────────────────────────────────

export async function getSiteCustomers(siteId: string): Promise<SiteCustomer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_customers")
    .select("id, site_id, email, name, phone, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(customerFromDb);
}
