/**
 * migrate-supabase-to-stdb.ts
 *
 * One-time migration: reads all data from Supabase (via service role key)
 * and writes it into SpacetimeDB via reducers.
 *
 * Prerequisites:
 *   - Node.js 22+ (native WebSocket)
 *   - .env.local must contain SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *     NEXT_PUBLIC_SPACETIMEDB_URI, NEXT_PUBLIC_SPACETIMEDB_MODULE
 *   - STDB_TOKEN env var must be set to your SpacetimeDB token (from localStorage
 *     after logging in, or from `spacetime login` output)
 *
 * Run:
 *   STDB_TOKEN=<your_token> bun run migrate
 *
 * Tables NOT migrated (no suitable reducer):
 *   - settings (no create/update reducer)
 *   - shift_presets (no reducer)
 *   - staff_availability (no reducer)
 *   - role_tasks (no reducer)
 *   - site_components (no reducer)
 *   - site_memberships (no reducer)
 *   - chat_members (created automatically by createConversation)
 *   - chat_messages (can only send as the migration identity)
 *   - todos (no reducer)
 */

import * as fs from "fs";
import * as path from "path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { DbConnection } from "../lib/spacetimedb/generated/index.js";

// ─── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STDB_URI = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const STDB_MODULE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "bizops";
const STDB_TOKEN = process.env.STDB_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!STDB_TOKEN) {
  console.error("❌  Missing STDB_TOKEN env var.");
  console.error("    Set it to the value stored in localStorage under 'stdb_token' after logging in.");
  process.exit(1);
}

// ─── Supabase client (service role — bypasses RLS) ────────────────────────────
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── SpacetimeDB connection ───────────────────────────────────────────────────
let conn: ReturnType<typeof DbConnection.builder> extends infer B
  ? B extends { build(): infer C }
    ? C
    : never
  : never;

async function connectStdb(): Promise<typeof conn> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("SpacetimeDB connection timeout")), 15000);
    const builder = DbConnection.builder()
      .withUri(STDB_URI)
      .withDatabaseName(STDB_MODULE)
      .withToken(STDB_TOKEN!)
      .onConnect((c) => {
        clearTimeout(timeout);
        resolve(c as any);
      })
      .onConnectError((_ctx: any, err: any) => {
        clearTimeout(timeout);
        reject(err);
      });
    builder.build();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch all rows from a Supabase table, paging by 1000. */
async function fetchAll<T>(table: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + 999);
    if (error) {
      // Table may not exist in this project (e.g. sites, chat tables)
      if (error.code === "42P01") return [];
      throw new Error(`Supabase fetch ${table}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

/**
 * Call a reducer, then wait up to `timeoutMs` for a new row to appear
 * in `getRows()`. Returns the new row, or null on timeout.
 */
async function callAndWait<T extends { id: { toString(): string } }>(
  label: string,
  reducerCall: () => void,
  getRows: () => T[],
  timeoutMs = 8000
): Promise<T | null> {
  const before = new Set(getRows().map((r) => r.id.toString()));
  reducerCall();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(200);
    const after = getRows();
    const newRow = after.find((r) => !before.has(r.id.toString()));
    if (newRow) return newRow;
  }
  console.warn(`  ⚠️  ${label}: timed out waiting for new row`);
  return null;
}

/** Progress logger */
function progress(table: string, done: number, total: number) {
  process.stdout.write(`\r  ${table}: ${done}/${total}`);
  if (done === total) process.stdout.write("\n");
}

// ─── ID maps (Supabase UUID → SpacetimeDB string) ─────────────────────────────
const orgMap = new Map<string, string>();       // supabase org_id → stdb org_id
const inventoryMap = new Map<string, string>(); // supabase item_id → stdb item_id
const staffMemberMap = new Map<string, string>(); // supabase staff_id → stdb staff_id
const shiftMap = new Map<string, string>();     // supabase shift_id → stdb shift_id
const siteMap = new Map<string, string>();      // supabase site_id → stdb site_id
const customerMap = new Map<string, string>();  // supabase customer_id → stdb customer_id
const tierMap = new Map<string, string>();      // supabase tier_id → stdb tier_id
const perkMap = new Map<string, string>();      // supabase perk_id → stdb perk_id
const orderMap = new Map<string, string>();     // supabase order_id → stdb order_id
const convMap = new Map<string, string>();      // supabase conv_id → stdb conv_id

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌  Connecting to SpacetimeDB…");
  conn = await connectStdb() as any;
  console.log("✅  Connected. Identity:", (conn as any).identity?.toString());

  // Subscribe to all tables so we can watch for new rows
  console.log("📡  Subscribing to all tables…");
  await new Promise<void>((resolve) => {
    (conn as any).subscriptionBuilder()
      .onApplied(() => resolve())
      .subscribe([
        "SELECT * FROM organization",
        "SELECT * FROM org_member",
        "SELECT * FROM org_invitation",
        "SELECT * FROM inventory_item",
        "SELECT * FROM inventory_transaction",
        "SELECT * FROM sales_record",
        "SELECT * FROM staff_role",
        "SELECT * FROM staff_member",
        "SELECT * FROM shift",
        "SELECT * FROM product",
        "SELECT * FROM site",
        "SELECT * FROM site_page",
        "SELECT * FROM site_customer",
        "SELECT * FROM membership_tier",
        "SELECT * FROM membership_perk",
        "SELECT * FROM perk_claim",
        "SELECT * FROM customer_points",
        "SELECT * FROM site_order",
        "SELECT * FROM site_booking",
        "SELECT * FROM payment",
        "SELECT * FROM chat_conversation",
      ]);
    setTimeout(resolve, 5000);
  });
  console.log("✅  Subscriptions active.\n");

  const db = (conn as any).db;

  // Helper accessors
  const getOrgs = () => db?.organization ? [...db.organization.iter()] : [];
  const getInventory = () => db?.inventoryItem ? [...db.inventoryItem.iter()] : [];
  const getStaffMembers = () => db?.staffMember ? [...db.staffMember.iter()] : [];
  const getShifts = () => db?.shift ? [...db.shift.iter()] : [];
  const getSites = () => db?.site ? [...db.site.iter()] : [];
  const getCustomers = () => db?.siteCustomer ? [...db.siteCustomer.iter()] : [];
  const getTiers = () => db?.membershipTier ? [...db.membershipTier.iter()] : [];
  const getPerks = () => db?.membershipPerk ? [...db.membershipPerk.iter()] : [];
  const getOrders = () => db?.siteOrder ? [...db.siteOrder.iter()] : [];
  const getConvs = () => db?.chatConversation ? [...db.chatConversation.iter()] : [];

  // ── 1. Organizations ────────────────────────────────────────────────────────
  console.log("📦  Migrating organizations…");
  const sbOrgs = await fetchAll<any>("organizations");
  let done = 0;
  for (const org of sbOrgs) {
    const newOrg = await callAndWait(
      `org:${org.name}`,
      () => (conn as any).reducers.createOrg({ name: org.name }),
      getOrgs,
    );
    if (newOrg) {
      orgMap.set(org.id, newOrg.id.toString());
    }
    progress("organizations", ++done, sbOrgs.length);
  }

  // ── 2. Org Invitations (non-member invite records) ─────────────────────────
  console.log("📦  Migrating org_invitations…");
  const sbInvites = await fetchAll<any>("org_invitations");
  done = 0;
  for (const inv of sbInvites) {
    const stdbOrgId = orgMap.get(inv.organization_id);
    if (!stdbOrgId) { done++; continue; }
    try {
      (conn as any).reducers.inviteToOrg({
        organizationId: stdbOrgId,
        email: inv.email,
        role: inv.role ?? "staff",
        permissions: typeof inv.permissions === "string"
          ? inv.permissions
          : JSON.stringify(inv.permissions ?? {}),
      });
      await sleep(150);
    } catch (e: any) {
      console.error(`  ⚠️  invite ${inv.email}: ${e.message ?? e}`);
    }
    progress("org_invitations", ++done, sbInvites.length);
  }

  // ── 3. Staff Roles ──────────────────────────────────────────────────────────
  console.log("📦  Migrating staff_roles…");
  const sbRoles = await fetchAll<any>("staff_roles");
  done = 0;
  for (const r of sbRoles) {
    // staff_roles.user_id maps to org via org_members; use first mapped org as fallback
    const stdbOrgId = orgMap.size > 0 ? [...orgMap.values()][0] : null;
    if (!stdbOrgId) { done++; continue; }
    try {
      (conn as any).reducers.addStaffRole({
        organizationId: stdbOrgId,
        name: r.name,
        color: r.color ?? "#44403c",
        icon: "",
        description: "",
        permissions: typeof r.permissions === "string"
          ? r.permissions
          : JSON.stringify(r.permissions ?? {}),
      });
      await sleep(150);
    } catch (e: any) {
      console.error(`  ⚠️  staff_role ${r.name}: ${e.message ?? e}`);
    }
    progress("staff_roles", ++done, sbRoles.length);
  }

  // ── 4. Staff Members ────────────────────────────────────────────────────────
  console.log("📦  Migrating staff_members…");
  const sbStaff = await fetchAll<any>("staff_members");
  done = 0;
  for (const s of sbStaff) {
    const stdbOrgId = orgMap.size > 0 ? [...orgMap.values()][0] : null;
    if (!stdbOrgId) { done++; continue; }
    const newMember = await callAndWait(
      `staff:${s.name}`,
      () => (conn as any).reducers.addStaffMember({
        organizationId: stdbOrgId,
        name: s.name,
        role: s.role ?? "Staff",
        hourlyRate: Number(s.hourly_rate ?? 0),
      }),
      getStaffMembers,
    );
    if (newMember) staffMemberMap.set(s.id, newMember.id.toString());
    progress("staff_members", ++done, sbStaff.length);
  }

  // ── 5. Inventory Items ──────────────────────────────────────────────────────
  console.log("📦  Migrating inventory_items…");
  const sbItems = await fetchAll<any>("inventory_items");
  done = 0;
  for (const item of sbItems) {
    const stdbOrgId = orgMap.size > 0 ? [...orgMap.values()][0] : null;
    if (!stdbOrgId) { done++; continue; }
    const newItem = await callAndWait(
      `item:${item.name}`,
      () => (conn as any).reducers.addInventoryItem({
        organizationId: stdbOrgId,
        name: item.name,
        category: item.category ?? "Other",
        currentStock: Number(item.current_stock ?? 0),
        minStock: Number(item.min_stock ?? 0),
        maxStock: Number(item.max_stock ?? 100),
        unit: item.unit ?? "units",
        costPerUnit: Number(item.cost_per_unit ?? 0),
        supplier: item.supplier ?? "",
        lastRestocked: item.last_restocked
          ? new Date(item.last_restocked).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      }),
      getInventory,
    );
    if (newItem) inventoryMap.set(item.id, newItem.id.toString());
    progress("inventory_items", ++done, sbItems.length);
  }

  // ── 6. Inventory Transactions ───────────────────────────────────────────────
  console.log("📦  Migrating inventory_transactions…");
  const sbTx = await fetchAll<any>("inventory_transactions");
  done = 0;
  for (const tx of sbTx) {
    const stdbOrgId = orgMap.size > 0 ? [...orgMap.values()][0] : null;
    if (!stdbOrgId) { done++; continue; }
    try {
      (conn as any).reducers.addInventoryTransaction({
        organizationId: stdbOrgId,
        itemId: tx.item_id ? inventoryMap.get(tx.item_id) ?? null : null,
        itemName: tx.item_name ?? "",
        type: tx.type ?? "adjustment",
        quantity: Number(tx.quantity ?? 0),
        note: tx.note ?? "",
        date: tx.date
          ? new Date(tx.date).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      });
      await sleep(100);
    } catch (e: any) {
      console.error(`  ⚠️  tx ${tx.id}: ${e.message ?? e}`);
    }
    progress("inventory_transactions", ++done, sbTx.length);
  }

  // ── 7. Products ─────────────────────────────────────────────────────────────
  console.log("📦  Migrating products…");
  const sbProducts = await fetchAll<any>("products");
  done = 0;
  for (const p of sbProducts) {
    const stdbOrgId = orgMap.size > 0 ? [...orgMap.values()][0] : null;
    if (!stdbOrgId) { done++; continue; }
    try {
      (conn as any).reducers.addProduct({
        organizationId: stdbOrgId,
        name: p.name,
        category: p.category ?? "Other",
        price: Number(p.price ?? 0),
        cost: Number(p.cost ?? 0),
      });
      await sleep(150);
    } catch (e: any) {
      console.error(`  ⚠️  product ${p.name}: ${e.message ?? e}`);
    }
    progress("products", ++done, sbProducts.length);
  }

  // ── 8. Sales Records ────────────────────────────────────────────────────────
  console.log("📦  Migrating sales_records…");
  const sbSales = await fetchAll<any>("sales_records");
  done = 0;
  for (const s of sbSales) {
    const stdbOrgId = orgMap.size > 0 ? [...orgMap.values()][0] : null;
    if (!stdbOrgId) { done++; continue; }
    try {
      (conn as any).reducers.addSalesRecord({
        organizationId: stdbOrgId,
        date: new Date(s.date).toISOString().slice(0, 10),
        hour: s.hour != null ? Number(s.hour) : null,
        actual: Number(s.actual ?? 0),
        predicted: s.predicted != null ? Number(s.predicted) : null,
        weather: s.weather ?? null,
        footTraffic: s.foot_traffic != null ? Number(s.foot_traffic) : null,
        isHoliday: Boolean(s.is_holiday),
      });
      await sleep(100);
    } catch (e: any) {
      console.error(`  ⚠️  sales ${s.date}: ${e.message ?? e}`);
    }
    progress("sales_records", ++done, sbSales.length);
  }

  // ── 9. Shifts ───────────────────────────────────────────────────────────────
  console.log("📦  Migrating shifts…");
  const sbShifts = await fetchAll<any>("shifts");
  done = 0;
  for (const sh of sbShifts) {
    const stdbOrgId = orgMap.size > 0 ? [...orgMap.values()][0] : null;
    if (!stdbOrgId) { done++; continue; }
    const newShift = await callAndWait(
      `shift:${sh.id}`,
      () => (conn as any).reducers.addShift({
        organizationId: stdbOrgId,
        memberId: sh.member_id ? staffMemberMap.get(sh.member_id) ?? null : null,
        staffName: sh.staff_name ?? "",
        staffRole: sh.staff_role ?? null,
        staffRoles: "[]",
        date: new Date(sh.date).toISOString().slice(0, 10),
        shiftType: sh.shift_type ?? "morning",
        startTime: sh.start_time ?? "09:00:00",
        endTime: sh.end_time ?? "17:00:00",
        predictedDemand: sh.predicted_demand ?? "medium",
      }),
      getShifts,
    );
    if (newShift) shiftMap.set(sh.id, newShift.id.toString());
    progress("shifts", ++done, sbShifts.length);
  }

  // ── 10. Time Off Requests ───────────────────────────────────────────────────
  // Note: createTimeOffRequest uses ctx.sender as userId — all migrated requests
  // will be attributed to the migration runner's identity.
  const sbTimeOff = await fetchAll<any>("time_off_requests").catch(() => []);
  if (sbTimeOff.length > 0) {
    console.log("📦  Migrating time_off_requests…");
    done = 0;
    for (const t of sbTimeOff) {
      const stdbOrgId = orgMap.size > 0 ? [...orgMap.values()][0] : null;
      if (!stdbOrgId) { done++; continue; }
      try {
        (conn as any).reducers.createTimeOffRequest({
          organizationId: stdbOrgId,
          startDate: new Date(t.start_date).toISOString().slice(0, 10),
          endDate: new Date(t.end_date).toISOString().slice(0, 10),
          fullDays: Boolean(t.full_days ?? true),
          startTime: t.start_time ?? null,
          endTime: t.end_time ?? null,
          comments: t.comments ?? "",
        });
        await sleep(150);
      } catch (e: any) {
        console.error(`  ⚠️  time_off ${t.id}: ${e.message ?? e}`);
      }
      progress("time_off_requests", ++done, sbTimeOff.length);
    }
  }

  // ── 11. Sites ───────────────────────────────────────────────────────────────
  console.log("📦  Migrating sites…");
  const sbSites = await fetchAll<any>("sites").catch(() => []);
  done = 0;
  for (const s of sbSites) {
    const stdbOrgId = orgMap.get(s.organization_id) ?? (orgMap.size > 0 ? [...orgMap.values()][0] : null);
    if (!stdbOrgId) { done++; continue; }
    const newSite = await callAndWait(
      `site:${s.name}`,
      () => (conn as any).reducers.createSite({
        organizationId: stdbOrgId,
        name: s.name ?? "My Site",
        slug: s.slug ?? s.name?.toLowerCase().replace(/\s+/g, "-") ?? "site",
        theme: typeof s.theme === "string" ? s.theme : JSON.stringify(s.theme ?? {}),
        features: typeof s.features === "string" ? s.features : JSON.stringify(s.features ?? []),
      }),
      getSites,
    );
    if (newSite) siteMap.set(s.id, newSite.id.toString());
    progress("sites", ++done, sbSites.length);
  }

  // ── 12. Site Pages ──────────────────────────────────────────────────────────
  const sbPages = await fetchAll<any>("site_pages").catch(() => []);
  if (sbPages.length > 0) {
    console.log("📦  Migrating site_pages…");
    done = 0;
    for (const p of sbPages) {
      const stdbSiteId = siteMap.get(p.site_id);
      const stdbOrgId = orgMap.get(p.organization_id) ?? (orgMap.size > 0 ? [...orgMap.values()][0] : null);
      if (!stdbSiteId || !stdbOrgId) { done++; continue; }
      try {
        (conn as any).reducers.addPage({
          organizationId: stdbOrgId,
          siteId: stdbSiteId,
          name: p.name ?? "Page",
          slug: p.slug ?? "page",
          elements: typeof p.elements === "string" ? p.elements : JSON.stringify(p.elements ?? []),
          sortOrder: Number(p.sort_order ?? 0),
        });
        await sleep(150);
      } catch (e: any) {
        console.error(`  ⚠️  page ${p.name}: ${e.message ?? e}`);
      }
      progress("site_pages", ++done, sbPages.length);
    }
  }

  // ── 13. Site Customers ──────────────────────────────────────────────────────
  const sbCustomers = await fetchAll<any>("site_customers").catch(() => []);
  if (sbCustomers.length > 0) {
    console.log("📦  Migrating site_customers…");
    done = 0;
    for (const c of sbCustomers) {
      const stdbSiteId = siteMap.get(c.site_id);
      if (!stdbSiteId) { done++; continue; }
      const newCustomer = await callAndWait(
        `customer:${c.email}`,
        () => (conn as any).reducers.registerCustomer({
          siteId: stdbSiteId,
          email: c.email,
          name: c.name ?? null,
          phone: c.phone ?? null,
        }),
        getCustomers,
      );
      if (newCustomer) customerMap.set(c.id, newCustomer.id.toString());
      progress("site_customers", ++done, sbCustomers.length);
    }
  }

  // ── 14. Membership Tiers ────────────────────────────────────────────────────
  const sbTiers = await fetchAll<any>("membership_tiers").catch(() => []);
  if (sbTiers.length > 0) {
    console.log("📦  Migrating membership_tiers…");
    done = 0;
    for (const t of sbTiers) {
      const stdbSiteId = siteMap.get(t.site_id);
      const stdbOrgId = orgMap.get(t.organization_id) ?? (orgMap.size > 0 ? [...orgMap.values()][0] : null);
      if (!stdbSiteId || !stdbOrgId) { done++; continue; }
      const newTier = await callAndWait(
        `tier:${t.name}`,
        () => (conn as any).reducers.createMembershipTier({
          organizationId: stdbOrgId,
          siteId: stdbSiteId,
          name: t.name,
          description: t.description ?? null,
          price: Number(t.price ?? 0),
          pricePeriod: t.price_period ?? "month",
          color: t.color ?? "#44403c",
          icon: t.icon ?? "star",
          sortOrder: Number(t.sort_order ?? 0),
          isDefault: Boolean(t.is_default ?? false),
        }),
        getTiers,
      );
      if (newTier) tierMap.set(t.id, newTier.id.toString());
      progress("membership_tiers", ++done, sbTiers.length);
    }
  }

  // ── 15. Membership Perks ────────────────────────────────────────────────────
  const sbPerks = await fetchAll<any>("membership_perks").catch(() => []);
  if (sbPerks.length > 0) {
    console.log("📦  Migrating membership_perks…");
    done = 0;
    for (const p of sbPerks) {
      const stdbTierId = tierMap.get(p.tier_id);
      const stdbOrgId = orgMap.get(p.organization_id) ?? (orgMap.size > 0 ? [...orgMap.values()][0] : null);
      if (!stdbTierId || !stdbOrgId) { done++; continue; }
      const newPerk = await callAndWait(
        `perk:${p.name}`,
        () => (conn as any).reducers.addPerk({
          organizationId: stdbOrgId,
          tierId: stdbTierId,
          type: p.type ?? "discount",
          name: p.name,
          description: p.description ?? null,
          couponCode: p.coupon_code ?? null,
          discountValue: p.discount_value != null ? Number(p.discount_value) : null,
          discountType: p.discount_type ?? null,
          cooldownHours: p.cooldown_hours != null ? Number(p.cooldown_hours) : null,
          frequency: p.frequency != null ? Number(p.frequency) : null,
          minPurchase: p.min_purchase != null ? Number(p.min_purchase) : null,
          sortOrder: Number(p.sort_order ?? 0),
        }),
        getPerks,
      );
      if (newPerk) perkMap.set(p.id, newPerk.id.toString());
      progress("membership_perks", ++done, sbPerks.length);
    }
  }

  // ── 16. Customer Points ─────────────────────────────────────────────────────
  const sbPoints = await fetchAll<any>("customer_points").catch(() => []);
  if (sbPoints.length > 0) {
    console.log("📦  Migrating customer_points…");
    done = 0;
    for (const p of sbPoints) {
      const stdbSiteId = siteMap.get(p.site_id);
      const stdbCustomerId = customerMap.get(p.customer_id);
      if (!stdbSiteId || !stdbCustomerId) { done++; continue; }
      try {
        (conn as any).reducers.addPoints({
          siteId: stdbSiteId,
          customerId: stdbCustomerId,
          points: Number(p.points ?? 0),
        });
        await sleep(100);
      } catch (e: any) {
        console.error(`  ⚠️  points ${p.customer_id}: ${e.message ?? e}`);
      }
      progress("customer_points", ++done, sbPoints.length);
    }
  }

  // ── 17. Site Orders ─────────────────────────────────────────────────────────
  const sbOrders = await fetchAll<any>("site_orders").catch(() => []);
  if (sbOrders.length > 0) {
    console.log("📦  Migrating site_orders…");
    done = 0;
    for (const o of sbOrders) {
      const stdbSiteId = siteMap.get(o.site_id);
      if (!stdbSiteId) { done++; continue; }
      const newOrder = await callAndWait(
        `order:${o.id}`,
        () => (conn as any).reducers.createSiteOrder({
          siteId: stdbSiteId,
          customerId: o.customer_id ? customerMap.get(o.customer_id) ?? null : null,
          items: typeof o.items === "string" ? o.items : JSON.stringify(o.items ?? []),
          total: Number(o.total ?? 0),
          customerName: o.customer_name ?? null,
          customerEmail: o.customer_email ?? null,
          notes: o.notes ?? null,
        }),
        getOrders,
      );
      if (newOrder) orderMap.set(o.id, newOrder.id.toString());
      progress("site_orders", ++done, sbOrders.length);
    }
  }

  // ── 18. Site Bookings ───────────────────────────────────────────────────────
  const sbBookings = await fetchAll<any>("site_bookings").catch(() => []);
  if (sbBookings.length > 0) {
    console.log("📦  Migrating site_bookings…");
    done = 0;
    for (const b of sbBookings) {
      const stdbSiteId = siteMap.get(b.site_id);
      if (!stdbSiteId) { done++; continue; }
      try {
        (conn as any).reducers.createSiteBooking({
          siteId: stdbSiteId,
          customerId: b.customer_id ? customerMap.get(b.customer_id) ?? null : null,
          date: new Date(b.date).toISOString().slice(0, 10),
          time: b.time ?? "12:00:00",
          partySize: Number(b.party_size ?? 1),
          name: b.name ?? "Guest",
          phone: b.phone ?? null,
          email: b.email ?? null,
          notes: b.notes ?? null,
        });
        await sleep(150);
      } catch (e: any) {
        console.error(`  ⚠️  booking ${b.id}: ${e.message ?? e}`);
      }
      progress("site_bookings", ++done, sbBookings.length);
    }
  }

  // ── 19. Payments ────────────────────────────────────────────────────────────
  const sbPayments = await fetchAll<any>("payments").catch(() => []);
  if (sbPayments.length > 0) {
    console.log("📦  Migrating payments…");
    done = 0;
    for (const p of sbPayments) {
      const stdbOrgId = orgMap.get(p.organization_id) ?? (orgMap.size > 0 ? [...orgMap.values()][0] : null);
      if (!stdbOrgId) { done++; continue; }
      try {
        (conn as any).reducers.createPayment({
          organizationId: stdbOrgId,
          amount: Number(p.amount ?? 0),
          currency: p.currency ?? "USD",
          method: p.method ?? "cash",
          customerName: p.customer_name ?? null,
          notes: p.notes ?? null,
          items: p.items ? (typeof p.items === "string" ? p.items : JSON.stringify(p.items)) : null,
          taxAmount: Number(p.tax_amount ?? 0),
          discountAmount: Number(p.discount_amount ?? 0),
        });
        await sleep(150);
      } catch (e: any) {
        console.error(`  ⚠️  payment ${p.id}: ${e.message ?? e}`);
      }
      progress("payments", ++done, sbPayments.length);
    }
  }

  // ── 20. Chat Conversations ──────────────────────────────────────────────────
  const sbConvs = await fetchAll<any>("chat_conversations").catch(() => []);
  if (sbConvs.length > 0) {
    console.log("📦  Migrating chat_conversations…");
    done = 0;
    const identity = (conn as any).identity?.toString() ?? "";
    for (const c of sbConvs) {
      const stdbOrgId = orgMap.get(c.organization_id) ?? (orgMap.size > 0 ? [...orgMap.values()][0] : null);
      if (!stdbOrgId) { done++; continue; }
      const newConv = await callAndWait(
        `conv:${c.id}`,
        () => (conn as any).reducers.createConversation({
          organizationId: stdbOrgId,
          type: c.type ?? "group",
          name: c.name ?? null,
          memberUserIds: JSON.stringify([identity]),
        }),
        getConvs,
      );
      if (newConv) convMap.set(c.id, newConv.id.toString());
      progress("chat_conversations", ++done, sbConvs.length);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n✅  Migration complete!\n");
  console.log("ID mappings created:");
  console.log(`  Organizations:  ${orgMap.size}`);
  console.log(`  Inventory items: ${inventoryMap.size}`);
  console.log(`  Staff members:  ${staffMemberMap.size}`);
  console.log(`  Shifts:         ${shiftMap.size}`);
  console.log(`  Sites:          ${siteMap.size}`);
  console.log(`  Customers:      ${customerMap.size}`);
  console.log(`  Tiers:          ${tierMap.size}`);
  console.log(`  Perks:          ${perkMap.size}`);
  console.log(`  Orders:         ${orderMap.size}`);
  console.log(`  Conversations:  ${convMap.size}`);
  console.log("\n⚠️  NOT migrated (no reducer available):");
  console.log("  settings, shift_presets, staff_availability, role_tasks,");
  console.log("  site_components, site_memberships, perk_claims, todos, chat_messages");

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌  Migration failed:", err);
  process.exit(1);
});
