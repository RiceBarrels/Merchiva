/**
 * BizOps — SpacetimeDB 2.0 Module
 *
 * This module defines all tables and reducers for the BizOps platform.
 * It replaces Supabase as the backend, providing real-time multiplayer
 * state with built-in auth via SpacetimeDB Identity.
 *
 * Auth model:
 *   - ctx.sender (Identity) identifies the caller — no JWT required
 *   - The `user` table maps Identity → user profile
 *   - The `orgMember` table maps Identity + orgId → role/permissions
 *   - Reducers enforce authorization by checking orgMember records
 */

import { schema, t, table, SenderError } from 'spacetimedb/server';
import { Identity, Uuid } from 'spacetimedb';

// ─── Helper: throw on unauthorized ───────────────────────────────────────────


/**
 * Parse the canonical string form of a uuid back into a `Uuid`.
 *
 * Every table in this module has a `t.uuid()` primary key, but every reducer
 * argument and every cross-table reference is a `string` — so the natural
 * lookup `ctx.db.foo.id.find(someIdString)` does not type-check, and the code
 * fell back to `[...ctx.db.foo.iter()].find(r => r.id.toString() === id)`:
 * a full table scan to find one row by its primary key. The SDK ships no
 * string parser for `Uuid` (only `fromRandomBytesV4` / `fromCounterV7`), hence
 * this.
 *
 * Returns `undefined` for anything that is not a well-formed uuid, so callers
 * can treat a malformed id the same as a missing row instead of throwing.
 */
function uuidFromString(id: string): Uuid | undefined {
  const hex = id.replace(/-/g, '');
  if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) return undefined;
  try {
    return new Uuid(BigInt('0x' + hex));
  } catch {
    return undefined;
  }
}

/**
 * Primary-key lookup by string id. Replaces a full scan; the row type is
 * inferred from the table handle, so call sites keep full type safety.
 */
function findById<Row>(
  tbl: { id: { find(key: Uuid): Row | undefined } },
  id: string,
): Row | undefined {
  const uuid = uuidFromString(id);
  return uuid ? tbl.id.find(uuid) : undefined;
}

// ─── Money ───────────────────────────────────────────────────────────────────
//
// Every currency column in this module is an f64, which cannot represent most
// decimal amounts exactly. Summing a day of sales, or subtracting a refund from
// a charge, drifts. SpacetimeDB has no way to change a column's type in place,
// so each money column has gained a sibling `*Cents` column holding the exact
// value as an integer number of minor units. Writers set both; `migrateMoneyV1`
// backfills the history; readers should prefer the cents column and treat the
// f64 as a legacy fallback (see lib/money.ts on the client).

/** Round a major-unit amount to an exact minor-unit integer. */
function toCents(amount: number): bigint {
  if (!Number.isFinite(amount)) return 0n;
  // `amount * 100` is itself a float operation and carries its own error:
  // 1.005 * 100 is 100.49999999999999, which Math.round sends DOWN to 100 —
  // half a cent lost on exactly the values a person is most likely to type.
  // Normalising through a fixed-precision string first pins the product to the
  // decimal that was actually meant, and only then rounds to the nearest cent.
  return BigInt(Math.round(Number((amount * 100).toFixed(4))));
}

/** Same, preserving "not set" for optional columns. */
function toCentsOpt(amount: number | undefined): bigint | undefined {
  return amount === undefined || amount === null ? undefined : toCents(amount);
}

/** Placeholder written into punch_event.pin — the real code is never stored. */
const PUNCH_PIN_REDACTED = '----';

function unauthorized(msg = 'Unauthorized'): never {
  throw new SenderError(msg);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Users & Auth ────────────────────────────────────────────────────────────

const userTable = table(
  {
    name: 'user',
    public: true,
    indexes: [
      { accessor: 'byEmail', algorithm: 'btree', columns: ['email'] },
    ],
  },
  {
    identity: t.identity().primaryKey(),
    email: t.string(),
    passwordHash: t.option(t.string()),
    displayName: t.option(t.string()),
    avatarUrl: t.option(t.string()),
    lastActiveOrgId: t.option(t.string()),
    createdAt: t.timestamp(),
    // Site-wide admin flag (controls /admins access). Promoted via the
    // claimFirstAdmin (bootstrap) and setUserAdmin (admin-only) reducers.
    isAdmin: t.option(t.bool()).default(undefined),
  }
);

// ─── Organizations ────────────────────────────────────────────────────────────

const organizationTable = table(
  {
    name: 'organization',
    public: true,
    indexes: [
      { accessor: 'byOwnerId', algorithm: 'btree', columns: ['ownerId'] },
      { accessor: 'byOrgIdText', algorithm: 'btree', columns: ['orgIdText'] },
      { accessor: 'byRootOrgId', algorithm: 'btree', columns: ['rootOrgId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    ownerId: t.identity(),
    name: t.string(),
    createdAt: t.timestamp(),
    // Stripe SaaS subscription state (server-managed; webhook-updated). All
    // optional so existing rows stay backwards-compatible. `.default(undefined)`
    // is required by the SpacetimeDB migrator for new option columns added to
    // an existing table — without it, the migrator refuses to publish.
    stripeCustomerId: t.option(t.string()).default(undefined),
    subscriptionStatus: t.option(t.string()).default(undefined),      // 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'
    subscriptionPriceId: t.option(t.string()).default(undefined),     // Stripe price id, identifies plan + interval
    subscriptionInterval: t.option(t.string()).default(undefined),    // 'month' | 'year' (derived from price)
    currentPeriodEnd: t.option(t.timestamp()).default(undefined),
    // Multi-store hierarchy — when set, this org is a sub-store of the given
    // parent org id. Sub-stores share staff/products/chat/design/sites with
    // their parent + sibling sub-stores. Inventory and sales forecasts stay
    // strictly per-org. Two-level only — sub-stores cannot themselves have
    // children.
    parentOrgId: t.option(t.string()).default(undefined),
    // Store image (UploadThing URL) — shown wherever the user picks a store.
    logoUrl: t.option(t.string()).default(undefined),
    // ── RLS / query support (appended; keep at the END) ──────────────────────
    // `id` is a uuid, but every other table references an org by a STRING
    // column. SpacetimeDB SQL refuses to join uuid against string, and refuses
    // to compare `option` columns AT ALL — so neither `id` nor `parentOrgId`
    // can appear in a row-level-security rule or in a subscription WHERE.
    // These two plain-string mirrors exist so they can:
    //   orgIdText  = id.toString()
    //   rootOrgId  = parentOrgId ?? id.toString()   (share-group root)
    // Backfilled by the `migrateSecurityV1` reducer and maintained by
    // createOrganization / updateOrgParent. Also lets reducers replace
    // `[...organization.iter()].find(...)` full scans with an index lookup.
    orgIdText: t.string().default(''),
    rootOrgId: t.string().default(''),
  }
);

// ─── Org Members ─────────────────────────────────────────────────────────────

const orgMemberTable = table(
  {
    name: 'org_member',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    userId: t.identity(),
    role: t.string(),          // "owner" | "manager" | "staff"
    displayName: t.string(),
    email: t.string(),
    permissions: t.string(),   // JSON-encoded Permissions object
    status: t.string(),        // "active" | "disabled"
    joinedAt: t.timestamp(),
    punchInCode: t.option(t.string()).default(undefined),
    // Hourly pay rate for payroll. Optional so pre-existing rows default to
    // null ("rate not set"). MUST stay the last column — see migration rules.
    hourlyRate: t.option(t.number()).default(undefined),
    // ── Money in minor units (appended; keep at the END) ─────────────────────
    // The f64 columns above accumulate representation error: 0.1 + 0.2 is not
    // 0.3, so refunds stop reconciling with charges and payroll totals drift a
    // cent at a time. SpacetimeDB cannot change a column's type, so the exact
    // value lives alongside as an integer count of minor units and the f64 is
    // kept only as a legacy mirror. Backfilled by `migrateMoneyV1`.
    hourlyRateCents: t.option(t.i64()).default(undefined),
  }
);

// ─── Org Invitations ──────────────────────────────────────────────────────────

const orgInvitationTable = table(
  {
    name: 'org_invitation',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byToken', algorithm: 'hash', columns: ['token'] },
      { accessor: 'byEmail', algorithm: 'btree', columns: ['email'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    email: t.string(),
    role: t.string(),
    permissions: t.string(),   // JSON-encoded Permissions
    token: t.string(),
    expiresAt: t.timestamp(),
    acceptedAt: t.option(t.timestamp()),
    createdAt: t.timestamp(),
  }
);

// ─── Settings ─────────────────────────────────────────────────────────────────

const settingsTable = table(
  {
    name: 'settings',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'hash', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    businessName: t.option(t.string()),
    businessType: t.option(t.string()),
    timezone: t.string(),
    squareConnected: t.bool(),
    squareAccessToken: t.option(t.string()),
    squareRefreshToken: t.option(t.string()),
    squareTokenExpiresAt: t.option(t.timestamp()),
    squareMerchantId: t.option(t.string()),
    squareLocationId: t.option(t.string()),
    squareLastSyncedAt: t.option(t.timestamp()),
    paymentTaxRate: t.number(),
    paymentCurrency: t.string(),
    locationLatitude: t.option(t.string()),
    locationLongitude: t.option(t.string()),
    googlePlacesId: t.option(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    // Auto-commit AI-generated 7-day schedule proposals as real shifts when no
    // shifts exist for the upcoming week. Default true; owners can opt out.
    autoCommitSchedules: t.option(t.bool()).default(undefined),
    // JSON-encoded weekly hours map. Shape:
    //   {"mon":{"open":"07:00","close":"21:00","closed":false},
    //    "tue":{...}, ..., "sun":{"closed":true}}
    // Read by the auto-scheduler so AI shifts align with open/close, and by
    // public site code that needs to render hours. null/missing = unset (AI
    // should prompt the user to configure in /manager/settings).
    openingHours: t.option(t.string()).default(undefined),
    // ISO country code (e.g. "US", "CN") used to look up regional public
    // holidays so the AI can flag them when proposing schedules. Optional —
    // defaults to undefined; the chat helper falls back to locale inference.
    countryCode: t.option(t.string()).default(undefined),
    // JSON-encoded Mr. Merchiva autonomy config (see lib/merchiva/autonomy.ts
    // AutonomyConfig: { enabled, mode, perCategory, caps }). Governs which
    // assistant actions auto-execute vs. require one-click approval. Optional —
    // null/missing means "use the app default" (low-risk auto, sensitive
    // proposed). Kept at the END for safe migration.
    assistantConfig: t.option(t.string()).default(undefined),
    // JSON-encoded BetaFeaturesConfig. Default null/missing means all beta
    // surfaces are hidden until enabled in /manager/settings. Kept at the END for
    // safe migration.
    betaFeatures: t.option(t.string()).default(undefined),
    // External scheduling integration. Kept at the END for safe migrations.
    // Provider examples: "7shifts", "homebase", "deputy", "when_i_work".
    // Do not persist short-lived provider bearer tokens here; server routes
    // mint them as needed using environment-held app credentials.
    scheduleProvider: t.option(t.string()).default(undefined),
    scheduleConnected: t.option(t.bool()).default(undefined),
    scheduleCompanyGuid: t.option(t.string()).default(undefined),
    scheduleCompanyId: t.option(t.string()).default(undefined),
    scheduleLocationId: t.option(t.string()).default(undefined),
    scheduleLastSyncedAt: t.option(t.timestamp()).default(undefined),
    scheduleLastSyncStatus: t.option(t.string()).default(undefined),
    scheduleLastSyncSummary: t.option(t.string()).default(undefined),
    // Store-level fixed supplier inbox prefix. Email shape:
    //   <supplierInboundPrefix>-inbound@merchiva.com
    // Optional for existing stores; missing rows derive a stable m-<orgid> prefix.
    supplierInboundPrefix: t.option(t.string()).default(undefined),
    // JSON-encoded string[] of catalog app ids "installed" on the store /
    // personal device surfaces (see lib/device-apps.ts). Required apps
    // (punch-in, schedule, staff, channels, Mr. Merchiva, inventory) are
    // always on and not stored here. null/missing = nothing extra installed.
    // Kept at the END for safe migration.
    deviceApps: t.option(t.string()).default(undefined),
  }
);

// ─── Inventory Items ──────────────────────────────────────────────────────────

const inventoryItemTable = table(
  {
    name: 'inventory_item',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    name: t.string(),
    category: t.string(),
    currentStock: t.number(),
    minStock: t.number(),
    maxStock: t.number(),
    unit: t.string(),
    costPerUnit: t.number(),
    supplier: t.string(),
    lastRestocked: t.string(),  // ISO date string "YYYY-MM-DD"
    lossRate: t.number(),
    squareItemId: t.option(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    // Ordering specs (appended — keep at the END for safe migration). Used by
    // Mr. Merchiva's restock ordering to round up to whole cases and respect a
    // supplier minimum. null = unset (order in raw units, no minimum).
    minOrderQty: t.option(t.number()).default(undefined),    // smallest quantity the supplier accepts (in units)
    unitsPerCase: t.option(t.number()).default(undefined),   // units per case/box; order in multiples of this
    // Product/recipe planning metadata (appended — keep at the END for safe
    // migrations). `unitContentAmount` is the amount inside one inventory unit:
    // e.g. one bottle = 946 ml, one bag = 2.5 kg.
    description: t.option(t.string()).default(undefined),
    unitContentAmount: t.option(t.number()).default(undefined),
    unitContentUnit: t.option(t.string()).default(undefined),
    // Retail metadata (appended only). A retail-enabled inventory item is
    // sellable in POS/storefront; a normal inventory item is stock-only.
    retailEnabled: t.option(t.bool()).default(undefined),
    retailPrice: t.option(t.number()).default(undefined),
    retailDescription: t.option(t.string()).default(undefined),
    retailImageUrl: t.option(t.string()).default(undefined),
    retailUsageQty: t.option(t.number()).default(undefined),
    // Legacy single expiration date column. SpacetimeDB cannot drop columns via
    // automatic migration; the app no longer reads/writes this field.
    expirationDate: t.option(t.string()).default(undefined),
    // JSON array of batch-level expiration quantities:
    // [{ expiresOn: "YYYY-MM-DD" | null, quantity: number }].
    expirationBatches: t.option(t.string()).default(undefined),
    // ── Money in minor units (appended; keep at the END) ─────────────────────
    // The f64 columns above accumulate representation error: 0.1 + 0.2 is not
    // 0.3, so refunds stop reconciling with charges and payroll totals drift a
    // cent at a time. SpacetimeDB cannot change a column's type, so the exact
    // value lives alongside as an integer count of minor units and the f64 is
    // kept only as a legacy mirror. Backfilled by `migrateMoneyV1`.
    costPerUnitCents: t.option(t.i64()).default(undefined),
    retailPriceCents: t.option(t.i64()).default(undefined),
  }
);

// ─── Inventory Transactions ───────────────────────────────────────────────────

const inventoryTransactionTable = table(
  {
    name: 'inventory_transaction',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byItemId', algorithm: 'btree', columns: ['itemId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    itemId: t.option(t.string()),
    itemName: t.string(),
    type: t.string(),   // "in" | "out" | "loss" | "adjustment"
    quantity: t.number(),
    note: t.string(),
    date: t.string(),   // ISO date string
    createdAt: t.timestamp(),
    // Store-device usage tracking (appended — keep at END for safe migration).
    // operatorMemberId is the org_member id of the punched-in user who made the
    // change at the store device. Null when the change came from the regular
    // web app (logged-in identity is already known via ctx.sender).
    operatorMemberId: t.option(t.string()).default(undefined),
    operatorName: t.option(t.string()).default(undefined),
    // JSON array of uploaded note/evidence files: [{ url, type }].
    evidenceUrls: t.option(t.string()).default(undefined),
    // Legacy single expiration date column. The app now uses batchExpirationDate.
    expirationDate: t.option(t.string()).default(undefined),
    // Optional batch expiration date captured during stock adjustments.
    batchExpirationDate: t.option(t.string()).default(undefined),
  }
);

// ─── Sales Records ────────────────────────────────────────────────────────────

const salesRecordTable = table(
  {
    name: 'sales_record',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byDate', algorithm: 'btree', columns: ['date'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    date: t.string(),             // ISO date string
    hour: t.option(t.i32()),      // null = daily aggregate; 0-23 = hourly
    actual: t.number(),
    predicted: t.option(t.number()),
    weather: t.option(t.string()),
    footTraffic: t.option(t.i32()),
    isHoliday: t.bool(),
    squareOrderIds: t.string(),   // JSON-encoded string[]
    createdAt: t.timestamp(),
  }
);

// ─── Staff Roles ──────────────────────────────────────────────────────────────

const staffRoleTable = table(
  {
    name: 'staff_role',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    name: t.string(),
    color: t.string(),
    icon: t.string(),
    description: t.string(),
    permissions: t.string(),  // JSON-encoded StaffRolePermissions
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// ─── Role Tasks ───────────────────────────────────────────────────────────────

const roleTaskTable = table(
  {
    name: 'role_task',
    public: true,
    indexes: [
      { accessor: 'byRoleId', algorithm: 'btree', columns: ['roleId'] },
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byOrgId', algorithm: 'btree', columns: ['orgId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    roleId: t.string(),
    // Legacy. `option` columns cannot be compared or joined in SpacetimeDB SQL,
    // so this one cannot appear in an RLS rule — see `orgId` below.
    organizationId: t.option(t.string()),
    title: t.string(),
    description: t.string(),
    startTime: t.option(t.string()),
    endTime: t.option(t.string()),
    sortOrder: t.i32(),
    requiresEvidence: t.bool(),
    notifyChats: t.string(),  // JSON-encoded string[]
    createdAt: t.timestamp(),
    // Non-option mirror of `organizationId` (appended; keep at the END). This
    // is the column the row-level-security rule joins on — the original is
    // `t.option(t.string())`, and publishing an RLS rule that references it
    // fails with "Unexpected type: (expected) String != (some: String |
    // none: ())". Backfilled by `migrateSecurityV1`; written by both role-task
    // reducers alongside the legacy column.
    orgId: t.string().default(''),
  }
);

// ─── Staff Members ────────────────────────────────────────────────────────────

const staffMemberTable = table(
  {
    name: 'staff_member',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    name: t.string(),
    role: t.string(),
    hourlyRate: t.number(),
    availability: t.string(),  // JSON-encoded string[]
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    // ── Money in minor units (appended; keep at the END) ─────────────────────
    // The f64 columns above accumulate representation error: 0.1 + 0.2 is not
    // 0.3, so refunds stop reconciling with charges and payroll totals drift a
    // cent at a time. SpacetimeDB cannot change a column's type, so the exact
    // value lives alongside as an integer count of minor units and the f64 is
    // kept only as a legacy mirror. Backfilled by `migrateMoneyV1`.
    hourlyRateCents: t.option(t.i64()).default(undefined),
  }
);

// ─── Shift Presets ────────────────────────────────────────────────────────────

const shiftPresetTable = table(
  {
    name: 'shift_preset',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    name: t.string(),
    startTime: t.string(),
    endTime: t.string(),
    color: t.string(),
    sortOrder: t.i32(),
    createdAt: t.timestamp(),
  }
);

// ─── Shifts ───────────────────────────────────────────────────────────────────

const shiftTable = table(
  {
    name: 'shift',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byMemberId', algorithm: 'btree', columns: ['memberId'] },
      { accessor: 'byDate', algorithm: 'btree', columns: ['date'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    memberId: t.option(t.string()),
    staffName: t.string(),
    staffRole: t.option(t.string()),
    staffRoles: t.string(),    // JSON-encoded string[]
    date: t.string(),          // ISO date string
    shiftType: t.string(),     // "morning" | "afternoon" | "evening" | "closing"
    startTime: t.string(),
    endTime: t.string(),
    predictedDemand: t.string(), // "low" | "medium" | "high"
    createdAt: t.timestamp(),
  }
);

// ─── Staff Availability ───────────────────────────────────────────────────────

const staffAvailabilityTable = table(
  {
    name: 'staff_availability',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    userId: t.identity(),
    organizationId: t.string(),
    type: t.string(),           // "permanent" | "temporary"
    startDate: t.option(t.string()),
    endDate: t.option(t.string()),
    days: t.string(),           // JSON-encoded boolean[7]
    dayTimes: t.string(),       // JSON-encoded DayTime[7]
    status: t.string(),         // "available" | etc.
    fullDay: t.bool(),
    startTime: t.option(t.string()),
    endTime: t.option(t.string()),
    comments: t.string(),
    createdAt: t.timestamp(),
  }
);

// ─── Time Off Requests ────────────────────────────────────────────────────────

const timeOffRequestTable = table(
  {
    name: 'time_off_request',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    userId: t.identity(),
    organizationId: t.string(),
    startDate: t.string(),
    endDate: t.string(),
    fullDays: t.bool(),
    startTime: t.option(t.string()),
    endTime: t.option(t.string()),
    comments: t.string(),
    status: t.string(),         // "pending" | "approved" | "denied"
    reviewedBy: t.option(t.string()),
    reviewedAt: t.option(t.timestamp()),
    createdAt: t.timestamp(),
  }
);

// ─── Shift Trades ─────────────────────────────────────────────────────────────

const shiftTradeTable = table(
  {
    name: 'shift_trade',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byRequesterId', algorithm: 'btree', columns: ['requesterId'] },
      { accessor: 'byTargetId', algorithm: 'btree', columns: ['targetId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    shiftId: t.string(),
    requesterId: t.string(),   // org_member ID
    targetId: t.string(),      // org_member ID, "" for broadcasts
    targetShiftId: t.option(t.string()),
    type: t.string(),           // "trade" | "cover"
    status: t.string(),         // "pending" | "accepted" | "denied" | "cancelled"
    managerApproved: t.bool(),
    managerId: t.option(t.string()),
    comments: t.string(),
    createdAt: t.timestamp(),
    broadcastToAll: t.bool().default(false),
    acceptedById: t.option(t.string()).default(undefined),
  }
);

// ─── Payments ─────────────────────────────────────────────────────────────────

const paymentTable = table(
  {
    name: 'payment',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byStatus', algorithm: 'btree', columns: ['status'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    userId: t.option(t.string()),
    orderId: t.option(t.string()),
    amount: t.number(),
    currency: t.string(),
    method: t.string(),          // "card" | "cash" | "other"
    status: t.string(),          // "pending" | "completed" | "failed" | "refunded"
    processorId: t.option(t.string()),
    processorResponse: t.option(t.string()),  // JSON-encoded
    customerName: t.option(t.string()),
    notes: t.option(t.string()),
    items: t.option(t.string()),   // JSON-encoded CartItem[]
    taxAmount: t.number(),
    discountAmount: t.number(),
    refundAmount: t.option(t.number()),
    refundReason: t.option(t.string()),
    refundedAt: t.option(t.timestamp()),
    createdAt: t.timestamp(),
    // ── Money in minor units (appended; keep at the END) ─────────────────────
    // The f64 columns above accumulate representation error: 0.1 + 0.2 is not
    // 0.3, so refunds stop reconciling with charges and payroll totals drift a
    // cent at a time. SpacetimeDB cannot change a column's type, so the exact
    // value lives alongside as an integer count of minor units and the f64 is
    // kept only as a legacy mirror. Backfilled by `migrateMoneyV1`.
    amountCents: t.option(t.i64()).default(undefined),
    taxAmountCents: t.option(t.i64()).default(undefined),
    discountAmountCents: t.option(t.i64()).default(undefined),
    refundAmountCents: t.option(t.i64()).default(undefined),
  }
);

// ─── Chat ─────────────────────────────────────────────────────────────────────

const chatConversationTable = table(
  {
    name: 'chat_conversation',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    type: t.string(),    // "direct" | "group"
    name: t.option(t.string()),
    createdBy: t.option(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    // When true, Mr. Merchiva is "in" this conversation: he must reply when
    // @mentioned, and otherwise runs a cheap relevance check before chiming in.
    // Added at end of table per migration rules; .default(undefined) lets
    // existing rows migrate without data loss.
    merchivaEnabled: t.option(t.bool()).default(undefined),
  }
);

const chatMemberTable = table(
  {
    name: 'chat_member',
    public: true,
    indexes: [
      { accessor: 'byConversationId', algorithm: 'btree', columns: ['conversationId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    conversationId: t.string(),
    userId: t.identity(),
    joinedAt: t.timestamp(),
  }
);

const chatMessageTable = table(
  {
    name: 'chat_message',
    public: true,
    indexes: [
      { accessor: 'byConversationId', algorithm: 'btree', columns: ['conversationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    conversationId: t.string(),
    senderId: t.identity(),
    content: t.string(),
    createdAt: t.timestamp(),
    replyToId: t.option(t.uuid()).default(undefined),
    attachmentUrl: t.option(t.string()).default(undefined),
    attachmentType: t.option(t.string()).default(undefined),
    attachmentName: t.option(t.string()).default(undefined),
    // True for messages authored by Mr. Merchiva. The row is inserted by the
    // triggering user's identity (no server identity yet), so the client uses
    // this flag — not senderId — to render the bot's name/avatar. Added at end
    // per migration rules; .default(undefined) migrates existing rows safely.
    isMerchiva: t.option(t.bool()).default(undefined),
    // Raw speech-to-text transcript when `content` is an AI summary of a
    // walkie-talkie voice message. Appended last per migration rules.
    voiceTranscript: t.option(t.string()).default(undefined),
  }
);

// ─── Todos ────────────────────────────────────────────────────────────────────

const todoTable = table(
  {
    name: 'todo',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    userId: t.identity(),
    organizationId: t.string(),
    title: t.string(),
    completed: t.bool(),
    sortOrder: t.i32(),
    createdAt: t.timestamp(),
  }
);

// ─── Punch Events ────────────────────────────────────────────────────────────

const punchEventTable = table(
  {
    name: 'punch_event',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byMemberId', algorithm: 'btree', columns: ['memberId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    memberId: t.string(),
    pin: t.string(),
    action: t.string(),   // "in" | "out" | "break-start" | "break-end"
    at: t.timestamp(),
    closed: t.bool(),
    pairEventId: t.option(t.string()),
    createdAt: t.timestamp(),
  }
);

// ─── Store Devices ──────────────────────────────────────────────────────────

const storeDeviceTable = table(
  {
    name: 'store_device',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byDeviceId', algorithm: 'btree', columns: ['deviceId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    deviceId: t.string(),
    name: t.string(),
    enabled: t.bool(),
    lastSeenAt: t.timestamp(),
    registeredBy: t.identity(),
    createdAt: t.timestamp(),
  }
);

// ─── Device log-in requests ──────────────────────────────────────────────────
// QR handshake between a shared store device and a team member's personal
// phone. The store device publishes a pending nonce (encoded in its QR); the
// phone scans it and approves as the calling member, optionally recording a
// punch at the same time; the store device then consumes the approval.

const deviceLoginRequestTable = table(
  {
    name: 'device_login_request',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byDeviceId', algorithm: 'btree', columns: ['deviceId'] },
      { accessor: 'byNonce', algorithm: 'btree', columns: ['nonce'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    deviceId: t.string(),
    nonce: t.string(),
    status: t.string(),              // "pending" | "approved" | "consumed" | "expired"
    memberId: t.option(t.string()),  // approving org_member id
    intent: t.option(t.string()),    // "login" | "punch-in" | "punch-out"
    createdAt: t.timestamp(),
    expiresAt: t.timestamp(),
  }
);

// ─── Sites ────────────────────────────────────────────────────────────────────

const siteTable = table(
  {
    name: 'site',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'bySlug', algorithm: 'hash', columns: ['slug'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    name: t.string(),
    slug: t.string(),
    theme: t.string(),     // JSON-encoded SiteTheme
    features: t.string(),  // JSON-encoded SiteFeatures
    published: t.bool(),
    customDomain: t.option(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const sitePageTable = table(
  {
    name: 'site_page',
    public: true,
    indexes: [
      { accessor: 'bySiteId', algorithm: 'btree', columns: ['siteId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    siteId: t.string(),
    name: t.string(),
    slug: t.string(),
    elements: t.string(),  // JSON-encoded SiteElement[]
    sortOrder: t.i32(),
    createdAt: t.timestamp(),
    html: t.option(t.string()).default(undefined),
    metadata: t.option(t.string()).default(undefined),
  }
);

const siteComponentTable = table(
  {
    name: 'site_component',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'bySiteId', algorithm: 'btree', columns: ['siteId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    siteId: t.option(t.string()),
    name: t.string(),
    description: t.option(t.string()),
    elementData: t.string(),  // JSON-encoded SiteElement
    category: t.option(t.string()),
    createdBy: t.option(t.string()),
    createdAt: t.timestamp(),
  }
);

// ─── Site Customers ───────────────────────────────────────────────────────────

const siteCustomerTable = table(
  {
    name: 'site_customer',
    public: true,
    indexes: [
      { accessor: 'bySiteId', algorithm: 'btree', columns: ['siteId'] },
      { accessor: 'byEmail', algorithm: 'btree', columns: ['email'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    siteId: t.string(),
    email: t.string(),
    name: t.option(t.string()),
    phone: t.option(t.string()),
    createdAt: t.timestamp(),
  }
);

// ─── Membership Tiers ─────────────────────────────────────────────────────────

const membershipTierTable = table(
  {
    name: 'membership_tier',
    public: true,
    indexes: [
      { accessor: 'bySiteId', algorithm: 'btree', columns: ['siteId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    siteId: t.string(),
    name: t.string(),
    description: t.option(t.string()),
    price: t.number(),
    pricePeriod: t.string(),   // "monthly" | "yearly" | "one-time" | "free"
    color: t.string(),
    icon: t.string(),
    sortOrder: t.i32(),
    isDefault: t.bool(),
    createdAt: t.timestamp(),
  }
);

// ─── Membership Perks ─────────────────────────────────────────────────────────

const membershipPerkTable = table(
  {
    name: 'membership_perk',
    public: true,
    indexes: [
      { accessor: 'byTierId', algorithm: 'btree', columns: ['tierId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    tierId: t.string(),
    type: t.string(),           // "discount" | "freebie" | "coupon" | "points-multiplier" | "custom"
    name: t.string(),
    description: t.option(t.string()),
    couponCode: t.option(t.string()),
    discountValue: t.option(t.number()),
    discountType: t.option(t.string()),  // "percent" | "fixed"
    cooldownHours: t.option(t.number()),
    frequency: t.option(t.number()),
    minPurchase: t.option(t.number()),
    validDays: t.option(t.string()),    // JSON-encoded number[] | null
    validHours: t.option(t.string()),   // JSON-encoded [startHour, endHour] | null
    active: t.bool(),
    sortOrder: t.i32(),
    createdAt: t.timestamp(),
  }
);

// ─── Perk Claims ──────────────────────────────────────────────────────────────

const perkClaimTable = table(
  {
    name: 'perk_claim',
    public: true,
    indexes: [
      { accessor: 'byPerkId', algorithm: 'btree', columns: ['perkId'] },
      { accessor: 'byCustomerId', algorithm: 'btree', columns: ['customerId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    perkId: t.string(),
    customerId: t.string(),
    claimedAt: t.timestamp(),
    usedAt: t.option(t.timestamp()),
    couponCode: t.option(t.string()),
    expiresAt: t.option(t.timestamp()),
  }
);

// ─── Customer Points ──────────────────────────────────────────────────────────

const customerPointsTable = table(
  {
    name: 'customer_points',
    public: true,
    indexes: [
      { accessor: 'bySiteId', algorithm: 'btree', columns: ['siteId'] },
      { accessor: 'byCustomerId', algorithm: 'btree', columns: ['customerId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    customerId: t.string(),
    siteId: t.string(),
    points: t.i32(),
    lifetimePoints: t.i32(),
    updatedAt: t.timestamp(),
  }
);

// ─── Site Memberships ─────────────────────────────────────────────────────────

const siteMembershipTable = table(
  {
    name: 'site_membership',
    public: true,
    indexes: [
      { accessor: 'bySiteId', algorithm: 'btree', columns: ['siteId'] },
      { accessor: 'byCustomerId', algorithm: 'btree', columns: ['customerId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    siteId: t.string(),
    customerId: t.string(),
    plan: t.string(),
    startedAt: t.timestamp(),
    expiresAt: t.option(t.timestamp()),
  }
);

// ─── Site Orders ──────────────────────────────────────────────────────────────

const siteOrderTable = table(
  {
    name: 'site_order',
    public: true,
    indexes: [
      { accessor: 'bySiteId', algorithm: 'btree', columns: ['siteId'] },
      { accessor: 'byCustomerId', algorithm: 'btree', columns: ['customerId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    siteId: t.string(),
    customerId: t.option(t.string()),
    items: t.string(),         // JSON-encoded { name, price, quantity }[]
    total: t.number(),
    status: t.string(),        // "pending" | "confirmed" | "completed" | "cancelled"
    customerName: t.option(t.string()),
    customerEmail: t.option(t.string()),
    notes: t.option(t.string()),
    createdAt: t.timestamp(),
  }
);

// ─── Site Bookings ────────────────────────────────────────────────────────────

const siteBookingTable = table(
  {
    name: 'site_booking',
    public: true,
    indexes: [
      { accessor: 'bySiteId', algorithm: 'btree', columns: ['siteId'] },
      { accessor: 'byCustomerId', algorithm: 'btree', columns: ['customerId'] },
      { accessor: 'byDate', algorithm: 'btree', columns: ['date'] },
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    siteId: t.string(),
    customerId: t.option(t.string()),
    date: t.string(),
    time: t.string(),
    partySize: t.i32(),
    name: t.string(),
    phone: t.option(t.string()),
    email: t.option(t.string()),
    notes: t.option(t.string()),
    status: t.string(),        // "pending" | "confirmed" | "cancelled"
    createdAt: t.timestamp(),
    // Denormalised owning org (appended; keep at the END). Bookings carry
    // customer PII (name/phone/email) and previously could only be traced to an
    // org via site.id — a uuid, which SpacetimeDB SQL cannot join against this
    // table's string `siteId`. Without this column the table cannot be covered
    // by RLS at all. Backfilled by `migrateSecurityV1`.
    organizationId: t.string().default(''),
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Notifications ───────────────────────────────────────────────────────────

const notificationTable = table(
  {
    name: 'notification',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byTargetId', algorithm: 'btree', columns: ['targetId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    targetId: t.identity(),
    type: t.string(),             // "inventory_low" | "shift_trade" | "time_off" | "team" | "order" | "general"
    title: t.string(),
    body: t.string(),
    link: t.option(t.string()),   // optional deep link e.g. "/staffing"
    read: t.bool(),
    createdAt: t.timestamp(),
  }
);

// ─── Locations ───────────────────────────────────────────────────────────────

const locationTable = table(
  {
    name: 'location',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    name: t.string(),
    address: t.option(t.string()),
    phone: t.option(t.string()),
    isDefault: t.bool(),
    sortOrder: t.number(),
    createdAt: t.timestamp(),
  }
);

// ─── Suppliers ───────────────────────────────────────────────────────────────

const supplierTable = table(
  {
    name: 'supplier',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    name: t.string(),
    contactName: t.option(t.string()),
    email: t.option(t.string()),
    phone: t.option(t.string()),
    address: t.option(t.string()),
    paymentTerms: t.option(t.string()),  // "net30" | "net60" | "cod" | "prepaid"
    notes: t.option(t.string()),
    rating: t.number(),                   // 1-5 performance rating
    createdAt: t.timestamp(),
    language: t.option(t.string()).default(undefined), // supplier communication language; reducers default new rows to "en"
  }
);

// ─── Purchase Orders ─────────────────────────────────────────────────────────

const purchaseOrderTable = table(
  {
    name: 'purchase_order',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'bySupplierId', algorithm: 'btree', columns: ['supplierId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    supplierId: t.string(),
    status: t.string(),            // "draft" | "sent" | "received" | "cancelled"
    items: t.string(),             // JSON: { itemId, itemName, quantity, unit, unitCost, total }[]
    subtotal: t.number(),
    tax: t.number(),
    total: t.number(),
    notes: t.option(t.string()),
    sentAt: t.option(t.timestamp()),
    receivedAt: t.option(t.timestamp()),
    createdAt: t.timestamp(),
    // ── Money in minor units (appended; keep at the END) ─────────────────────
    // The f64 columns above accumulate representation error: 0.1 + 0.2 is not
    // 0.3, so refunds stop reconciling with charges and payroll totals drift a
    // cent at a time. SpacetimeDB cannot change a column's type, so the exact
    // value lives alongside as an integer count of minor units and the f64 is
    // kept only as a legacy mirror. Backfilled by `migrateMoneyV1`.
    subtotalCents: t.option(t.i64()).default(undefined),
    taxCents: t.option(t.i64()).default(undefined),
    totalCents: t.option(t.i64()).default(undefined),
  }
);

// ─── Supplier Messages ─────────────────────────────────────────────────────────
// Threaded log of communication between Mr. Merchiva (on behalf of the org) and
// a supplier — outbound POs/follow-ups, inbound replies (Phase 2), and system
// notes. One row per message. `poId` links it to the purchase order it concerns
// (optional, since not every message is tied to a specific PO).
const supplierMessageTable = table(
  {
    name: 'supplier_message',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'bySupplierId', algorithm: 'btree', columns: ['supplierId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    supplierId: t.string(),
    poId: t.option(t.string()),       // linked purchase_order id, if any
    direction: t.string(),            // 'outbound' | 'inbound' | 'system'
    channel: t.string(),              // 'email' (Phase 1); 'sms' later
    subject: t.option(t.string()),
    body: t.string(),
    status: t.option(t.string()),     // 'sent' | 'failed' | 'received'
    createdAt: t.timestamp(),
  }
);

// ─── Expenses ────────────────────────────────────────────────────────────────

const expenseTable = table(
  {
    name: 'expense',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byDate', algorithm: 'btree', columns: ['date'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    category: t.string(),          // "rent" | "utilities" | "supplies" | "payroll" | "marketing" | "other"
    description: t.string(),
    amount: t.number(),
    date: t.string(),              // YYYY-MM-DD
    recurring: t.bool(),
    recurringPeriod: t.option(t.string()), // "weekly" | "monthly" | "yearly"
    receiptUrl: t.option(t.string()),
    notes: t.option(t.string()),
    createdAt: t.timestamp(),
    // ── Money in minor units (appended; keep at the END) ─────────────────────
    // The f64 columns above accumulate representation error: 0.1 + 0.2 is not
    // 0.3, so refunds stop reconciling with charges and payroll totals drift a
    // cent at a time. SpacetimeDB cannot change a column's type, so the exact
    // value lives alongside as an integer count of minor units and the f64 is
    // kept only as a legacy mirror. Backfilled by `migrateMoneyV1`.
    amountCents: t.option(t.i64()).default(undefined),
  }
);

// ─── Coupons ─────────────────────────────────────────────────────────────────

const couponTable = table(
  {
    name: 'coupon',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byCode', algorithm: 'btree', columns: ['code'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    code: t.string(),
    discountType: t.string(),      // "percent" | "fixed"
    discountValue: t.number(),     // percentage or dollar amount
    minPurchase: t.number(),
    maxUses: t.i32(),
    usedCount: t.i32(),
    validFrom: t.string(),         // YYYY-MM-DD
    validUntil: t.string(),        // YYYY-MM-DD
    active: t.bool(),
    description: t.option(t.string()),
    createdAt: t.timestamp(),
  }
);

// ─── Queue (Walk-in) ─────────────────────────────────────────────────────────

const queueEntryTable = table(
  {
    name: 'queue_entry',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    customerName: t.string(),
    partySize: t.i32(),
    phone: t.option(t.string()),
    status: t.string(),            // "waiting" | "seated" | "cancelled" | "no_show"
    estimatedWait: t.i32(),        // minutes
    notes: t.option(t.string()),
    queuedAt: t.timestamp(),
    seatedAt: t.option(t.timestamp()),
  }
);

// ─── Waste Log ───────────────────────────────────────────────────────────────

const wasteLogTable = table(
  {
    name: 'waste_log',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byDate', algorithm: 'btree', columns: ['date'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    itemId: t.option(t.string()),
    itemName: t.string(),
    quantity: t.number(),
    unit: t.string(),
    reason: t.string(),           // "expired" | "damaged" | "overproduction" | "other"
    costPerUnit: t.number(),
    totalCost: t.number(),
    date: t.string(),             // YYYY-MM-DD
    notes: t.option(t.string()),
    createdBy: t.option(t.string()), // member display name
    createdAt: t.timestamp(),
    // ── Money in minor units (appended; keep at the END) ─────────────────────
    // The f64 columns above accumulate representation error: 0.1 + 0.2 is not
    // 0.3, so refunds stop reconciling with charges and payroll totals drift a
    // cent at a time. SpacetimeDB cannot change a column's type, so the exact
    // value lives alongside as an integer count of minor units and the f64 is
    // kept only as a legacy mirror. Backfilled by `migrateMoneyV1`.
    costPerUnitCents: t.option(t.i64()).default(undefined),
    totalCostCents: t.option(t.i64()).default(undefined),
  }
);

// ─── AI Chat History ─────────────────────────────────────────────────────────

// ─── AI Chat Sessions ────────────────────────────────────────────────────────

const aiChatSessionTable = table(
  {
    name: 'ai_chat_session',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    userId: t.identity(),
    title: t.string(),
    messages: t.string(),
    summary: t.option(t.string()),
    archived: t.bool(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// ─── AI background jobs ─────────────────────────────────────────────────────
// Each row tracks one AI generation that runs server-side via waitUntil. The
// client enqueues the prompt + closes its socket; the server keeps streaming
// chunks into `partialText`. When done, `status` flips to 'done' and the
// client (next time it's open) parses `finalText` for action blocks and
// executes them locally.
const aiJobTable = table(
  {
    name: 'ai_job',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'bySessionId', algorithm: 'btree', columns: ['sessionId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    sessionId: t.string(),
    userId: t.identity(),
    prompt: t.string(),
    status: t.string(), // 'pending' | 'running' | 'done' | 'failed'
    partialText: t.string(),
    finalText: t.option(t.string()),
    error: t.option(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    // Marked true after the client has consumed finalText and executed any
    // action blocks. Lets the client distinguish "new result, please apply"
    // from "already-done, just display".
    consumed: t.bool(),
  }
);

// ─── Training: Curriculum Days ───────────────────────────────────────────────

const trainingDayTable = table(
  {
    name: 'training_day',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    dayNumber: t.i32(),
    title: t.string(),
    description: t.option(t.string()),
    sortOrder: t.i32(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// ─── Training: Curriculum Objectives ─────────────────────────────────────────

const trainingObjectiveTable = table(
  {
    name: 'training_objective',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byDayId', algorithm: 'btree', columns: ['dayId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    dayId: t.string(),
    text: t.string(),
    mediaUrl: t.option(t.string()),
    mediaType: t.option(t.string()),   // 'image' | 'video'
    sortOrder: t.i32(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// ─── Training: Per-Objective Grades ──────────────────────────────────────────

const trainingObjectiveGradeTable = table(
  {
    name: 'training_objective_grade',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byTraineeId', algorithm: 'btree', columns: ['traineeId'] },
      { accessor: 'byObjectiveId', algorithm: 'btree', columns: ['objectiveId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    traineeId: t.string(),              // org_member id of the trainee
    objectiveId: t.string(),
    status: t.string(),                 // 'pass' | 'fail'
    comment: t.option(t.string()),
    gradedBy: t.identity(),
    gradedAt: t.timestamp(),
  }
);

// ─── Training: Per-Day Grades ────────────────────────────────────────────────

const trainingDayGradeTable = table(
  {
    name: 'training_day_grade',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byTraineeId', algorithm: 'btree', columns: ['traineeId'] },
      { accessor: 'byDayId', algorithm: 'btree', columns: ['dayId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    traineeId: t.string(),
    dayId: t.string(),
    rating: t.i32(),                    // 1..5
    comment: t.option(t.string()),
    gradedBy: t.identity(),
    gradedAt: t.timestamp(),
  }
);

// ─── Training: Final Grade ───────────────────────────────────────────────────

// ─── Training: Review Requests ───────────────────────────────────────────────

const trainingReviewRequestTable = table(
  {
    name: 'training_review_request',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byTraineeId', algorithm: 'btree', columns: ['traineeId'] },
      { accessor: 'byDayId', algorithm: 'btree', columns: ['dayId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    traineeId: t.string(),              // org_member id of the trainee
    dayId: t.string(),
    status: t.string(),                 // 'pending' | 'resolved'
    createdAt: t.timestamp(),
    resolvedAt: t.option(t.timestamp()),
    resolvedBy: t.option(t.identity()),
  }
);

// ─── Daily Briefing (AI-generated morning insights) ──────────────────────────

const dailyBriefingTable = table(
  {
    name: 'daily_briefing',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    date: t.string(),                  // YYYY-MM-DD (idempotency key with org)
    content: t.string(),               // markdown body — bullet list of insights
    summary: t.option(t.string()),     // one-line headline
    generatedBy: t.string(),           // model name
    generatedAt: t.timestamp(),
    // JSON-encoded array of AI-proposed one-click actions:
    // [{ label, action, params }] where `action` is a Mr. Merchiva action name
    // and `params` is its argument object. Rendered as approval cards in the
    // briefing. Added at end of table per migration rules; .default(undefined)
    // lets existing rows migrate without data loss.
    actions: t.option(t.string()).default(undefined),
    // Retired columns. Nothing writes them any more; they stay in the schema
    // only because dropping a column is a destructive migration.
    problemKeys: t.option(t.string()).default(undefined),
    hour: t.option(t.i32()).default(undefined),
  }
);

// ─── Schedule Proposal (AI-drafted 7-day shift suggestions) ──────────────────

// One row per (roleTask, member, dueAt) assignment. Materializes a recurring
// role task into a concrete to-do that a specific staff member has to complete
// by a due time. Evidence (image URL + optional text note) is stored on the
// completion side so managers can audit what was actually done.
const roleTaskAssignmentTable = table(
  {
    name: 'role_task_assignment',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byMemberId', algorithm: 'btree', columns: ['memberId'] },
      { accessor: 'byTaskId', algorithm: 'btree', columns: ['taskId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    taskId: t.string(),                  // RoleTask.id this assignment instantiates
    memberId: t.string(),                // StaffMember.id assigned to do the work
    dueAt: t.timestamp(),                // when it has to be done by
    status: t.string(),                  // 'pending' | 'completed' | 'skipped'
    evidenceUrl: t.option(t.string()),   // legacy: first evidence URL (kept for back-compat)
    note: t.option(t.string()),          // free-text note from the staff member
    completedAt: t.option(t.timestamp()),
    completedBy: t.option(t.identity()),
    skipReason: t.option(t.string()),
    createdAt: t.timestamp(),
    createdBy: t.identity(),
    // JSON-encoded array of { url, type } — supports multiple images/videos as
    // evidence. `evidenceUrl` above stays populated with the first item so older
    // readers keep working. Added at end of table per migration rules;
    // .default(undefined) lets existing rows migrate without data loss.
    evidenceUrls: t.option(t.string()).default(undefined),
  }
);

// ─── Design ───────────────────────────────────────────────────────────────────
// Standalone HTML "design" surface for posters, social images, signage. Unlike
// `site`, each design is a single fixed-size HTML document — no pages, slugs,
// theme JSON, or publish flag. Stored as a flat HTML string so the same iframe
// editor primitives (HtmlCanvas / HtmlElementPalette / HtmlPropertiesPanel)
// drive it.
const designTable = table(
  {
    name: 'design',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    name: t.string(),
    width: t.i32(),
    height: t.i32(),
    html: t.string(),
    preset: t.option(t.string()),   // e.g. "instagram-square", "a4-portrait"
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// ─── Push Subscriptions ──────────────────────────────────────────────────────
// Web Push subscriptions for the browser Notifications API. One row per
// (user identity, browser/device). Stored at end of schema per migration rules.

const pushSubscriptionTable = table(
  {
    name: 'push_subscription',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byTargetId', algorithm: 'btree', columns: ['targetId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    targetId: t.identity(),
    endpoint: t.string(),     // unique per subscription, used as dedup key on client
    p256dh: t.string(),       // public key from subscription.keys.p256dh
    auth: t.string(),         // auth secret from subscription.keys.auth
    userAgent: t.option(t.string()),
    createdAt: t.timestamp(),
  }
);

// ─── Blog Posts ──────────────────────────────────────────────────────────────
// Public marketing blog (rendered at /blogs, edited at /admins/blogs). Globally
// scoped — no organizationId. Author is the WorkOS-authenticated admin who
// wrote it; we mirror their SpacetimeDB identity here for attribution.

const blogPostTable = table(
  {
    name: 'blog_post',
    public: true,
    indexes: [
      { accessor: 'bySlug', algorithm: 'hash', columns: ['slug'] },
      { accessor: 'byStatus', algorithm: 'btree', columns: ['status'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    slug: t.string(),
    title: t.string(),
    excerpt: t.string(),
    contentMd: t.string(),
    coverImage: t.option(t.string()),
    status: t.string(),               // "draft" | "published"
    authorIdentity: t.identity(),
    authorName: t.option(t.string()),
    publishedAt: t.option(t.timestamp()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECRET TABLES (private — never readable by a client, at any access level)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Row-level security scopes a client to its own organization's rows, but RLS is
// ROW level: it cannot hide one column of a row the client is otherwise allowed
// to see. Anything that must never reach a client — even a client that legally
// owns the surrounding row — has to live in its own `public: false` table.
//
// Three things qualified, and all three used to sit in world-readable tables:
//   user.passwordHash            → user_secret
//   settings square/clover tokens -> org_secret
//   org_member.punchInCode       → member_punch_code (public, but RLS'd to self)
//
// `migrateSecurityV1` copies existing values across and blanks the originals.
// The legacy columns stay in their tables (SpacetimeDB cannot drop columns via
// automatic migration) but are never read or written again.

/** Password hashes. Only `loginWithPassword` / `setPassword` read this. */
const userSecretTable = table(
  {
    name: 'user_secret',
    public: false,
  },
  {
    identity: t.identity().primaryKey(),
    passwordHash: t.string(),
    updatedAt: t.timestamp(),
  }
);

/** Per-org POS OAuth credentials. Only reducers and the service identity read this. */
const orgSecretTable = table(
  {
    name: 'org_secret',
    public: false,
  },
  {
    organizationId: t.string().primaryKey(),
    squareAccessToken: t.option(t.string()),
    squareRefreshToken: t.option(t.string()),
    squareTokenExpiresAt: t.option(t.timestamp()),
    cloverAccessToken: t.option(t.string()),
    cloverMerchantId: t.option(t.string()),
    updatedAt: t.timestamp(),
  }
);

// ─── Member punch codes ──────────────────────────────────────────────────────
//
// The punch-in PIN doubles as the manager "unlock this device" secret, so it is
// NOT enough to scope it to the organization: a staff member who can read every
// colleague's row can read their manager's unlock PIN and take the store tablet
// out of kiosk mode. This table is public so a user can still see THEIR OWN
// code, but its RLS rule matches `userId = :sender` only.
//
// Verification of somebody else's PIN is done by the `verifyManagerPin`
// reducer, never by comparing strings in the browser.
//
const memberPunchCodeTable = table(
  {
    name: 'member_punch_code',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    memberId: t.string().primaryKey(),
    organizationId: t.string(),
    userId: t.identity(),
    code: t.string(),
    updatedAt: t.timestamp(),
  }
);


/**
 * Result of the most recent PIN → operator resolution for one device identity.
 *
 * The shared store tablet identifies whoever is standing in front of it by a
 * 4-digit PIN. It used to do that by scanning the subscribed org_member rows in
 * the browser, which only worked because every client held every colleague's
 * PIN. `resolveDeviceOperator` does the match inside the database and writes
 * the answer here; the RLS rule on this table is `identity = :sender`, so a
 * device only ever sees its own result. Reducers cannot return values, hence
 * the round trip through a row.
 */
const deviceOperatorSessionTable = table(
  {
    name: 'device_operator_session',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    identity: t.identity().primaryKey(),
    organizationId: t.string(),
    memberId: t.string(),
    memberName: t.string(),
    role: t.string(),
    resolvedAt: t.timestamp(),
  }
);

/** One row; records which one-shot data migrations have already run. */
const migrationStateTable = table(
  {
    name: 'migration_state',
    public: false,
  },
  {
    name: t.string().primaryKey(),
    appliedAt: t.timestamp(),
    note: t.string(),
  }
);

// ─── Service Identity ────────────────────────────────────────────────────────
//
// Approved identities allowed to call service-only reducers (cron, server-side
// fan-out). Bootstrapped first-caller-wins by the registerServiceIdentity
// reducer, then locked: only existing service identities can add more.
//
const serviceIdentityTable = table(
  {
    // MUST be public. Every table's RLS rule joins this one to grant the
    // server-side service identity cross-tenant read access, and an RLS rule
    // cannot reference a private table: the whole rule set fails to evaluate
    // with "no such table: `service_identity`" and EVERY query returns that
    // error, for every caller. (Found the hard way in production on
    // 2026-09-15 — the database is effectively unreadable until this is
    // public.) It holds no secret: an identity is a public key hash, not a
    // credential, and calling a service reducer still requires the token.
    name: 'service_identity',
    public: true,
  },
  {
    identity: t.identity().primaryKey(),
    label: t.string(),
    registeredAt: t.timestamp(),
  }
);

// ─── Platform Admins (/merchivaAdmin console) ─────────────────────────────────
//
// Standalone username/password super-admin accounts for the /merchivaAdmin
// console. Credentials are verified server-side (Next.js route handlers) via
// the service identity — clients never touch these reducers directly.
// `platform_admin` is public (username + audit fields only); the password hash
// lives in the private `platform_admin_secret` table so only reducers can read
// it. Both tables are keyed by username.
//
const platformAdminTable = table(
  {
    name: 'platform_admin',
    public: true,
  },
  {
    username: t.string().primaryKey(),
    createdAt: t.timestamp(),
    createdBy: t.string(),
    lastLoginAt: t.option(t.timestamp()),
  }
);

const platformAdminSecretTable = table(
  {
    name: 'platform_admin_secret',
    public: false,
  },
  {
    username: t.string().primaryKey(),
    passwordHash: t.string(),
    updatedAt: t.timestamp(),
  }
);

// ─── User Briefing Preference ────────────────────────────────────────────────
//
// Retired table. No reducer reads or writes it any more; it stays in the
// schema only because dropping a table is a destructive migration.
//
const userBriefingPrefTable = table(
  {
    name: 'user_briefing_pref',
    public: true,
  },
  {
    userId: t.identity().primaryKey(),
    briefingTime: t.string(),   // "HH:mm" — legacy single time; still the fallback
    timezone: t.string(),       // IANA, e.g. "Asia/Shanghai"
    enabled: t.bool(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    hours: t.option(t.string()).default(undefined),
  }
);

// ─── AI Usage ────────────────────────────────────────────────────────────────
//
// One row per AI/LLM API call. Written server-side by the service identity via
// serviceRecordAiUsage (the API routes have no logged-in connection). Public so
// the per-org dashboard can subscribe and admins can aggregate via SQL.
//
// Cost is stored pre-computed so the dashboard never re-derives pricing:
//   inputCost  = inputTokens  / 1_000_000 * 2
//   outputCost = outputTokens / 1_000_000 * 10
//   cost       = inputCost + outputCost
//
// `day` (YYYY-MM-DD) and `month` (YYYY-MM) are stamped UTC by the caller so the
// client/SQL can group without timezone math.
//
const aiUsageTable = table(
  {
    name: 'ai_usage',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    userId: t.string(),        // hex identity of the caller, or "" when unknown
    feature: t.string(),       // "mr_merchiva" | "design_chat" | "morning_briefing" | ...
    model: t.string(),
    inputTokens: t.number(),
    outputTokens: t.number(),
    inputCost: t.number(),
    outputCost: t.number(),
    cost: t.number(),
    day: t.string(),           // YYYY-MM-DD (UTC)
    month: t.string(),         // YYYY-MM (UTC)
    createdAt: t.timestamp(),
    // Short human-readable summary of what the call did — usually the first
    // ~100 chars of the user's prompt, or a fixed label for non-prompt calls
    // (e.g. "Generated morning briefing"). Added at end per migration rules.
    description: t.option(t.string()).default(undefined),
  }
);

// ─── AI Usage Quota ──────────────────────────────────────────────────────────
//
// Optional per-org monthly cap, set by a site admin. null limit = unlimited.
// One row per organization. Enforcement is advisory (surfaced in the dashboard);
// hard blocking would live in the API routes if/when desired.
//
const aiUsageQuotaTable = table(
  {
    name: 'ai_usage_quota',
    public: true,
  },
  {
    organizationId: t.string().primaryKey(),
    monthlyTokenLimit: t.option(t.number()),
    monthlyCostLimit: t.option(t.number()),
    updatedAt: t.timestamp(),
  }
);

// ─── Docs ────────────────────────────────────────────────────────────────────
//
// Collaborative documents (Merchiva Docs). Content is a Yjs CRDT: the latest
// compacted state lives in document_snapshot; edits made since then are
// appended to document_update (auto-inc id = commit order) and clients merge
// snapshot + log. Like every table in this module these are public — reads are
// NOT access-filtered server-side; every write is authorized by the docs
// reducers (requireDoc / docRoleFor, near the end of this file).
//
const documentTable = table(
  {
    name: 'document',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.string().primaryKey(),              // client-generated lowercase UUID v4 (reducers can't return ids)
    organizationId: t.string(),
    ownerMemberId: t.string(),                // org_member id
    title: t.string(),                        // '' → UI shows "Untitled document"
    excerpt: t.string(),                      // ≤ 280 chars of plain text
    icon: t.option(t.string()),               // emoji
    visibility: t.string(),                   // 'org_edit' | 'org_view' | 'private'
    templateId: t.option(t.string()),         // 'blank' | template key | 'import:docx' | …
    pageSetup: t.option(t.string()),          // JSON DocPageSetup
    wordCount: t.u32(),                       // computed client-side (Intl.Segmenter)
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),                 // content writes bump it at most every 30 s
    lastEditorMemberId: t.option(t.string()),
    trashedAt: t.option(t.timestamp()),
    trashedByMemberId: t.option(t.string()),
  }
);

const documentUpdateTable = table(
  {
    name: 'document_update',
    public: true,
    indexes: [
      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),       // monotone in commit order (gaps possible)
    documentId: t.string(),
    organizationId: t.string(),
    payload: t.byteArray(),                   // Yjs update (v1 encoding)
    byteLength: t.u32(),
    sessionId: t.string(),                    // SpacetimeYjsProvider instance — echo suppression only
    memberId: t.string(),
    createdAt: t.timestamp(),
  }
);

const documentSnapshotTable = table(
  {
    name: 'document_snapshot',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    documentId: t.string().primaryKey(),
    organizationId: t.string(),
    state: t.byteArray(),                     // Y.encodeStateAsUpdate — covers every update id ≤ throughUpdateId
    throughUpdateId: t.u64(),                 // 0 = seeded at creation (template / import / copy)
    byteLength: t.u32(),
    html: t.string(),                         // export / server-side readers
    plainText: t.string(),
    compactedAt: t.timestamp(),
    compactedByMemberId: t.string(),
  }
);

const documentPresenceTable = table(
  {
    name: 'document_presence',
    public: true,
    indexes: [
      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },
      { accessor: 'byConnectionId', algorithm: 'btree', columns: ['connectionId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    documentId: t.string(),
    organizationId: t.string(),
    connectionId: t.string(),                 // server-stamped ctx.connectionId hex
    identity: t.identity(),                   // ctx.sender
    memberId: t.string(),
    yClientId: t.u32(),                       // Y.Doc clientID of that tab
    name: t.string(),
    color: t.string(),                        // '#rrggbb'
    canEdit: t.bool(),                        // server-computed; compaction election
    awareness: t.byteArray(),                 // y-protocols encodeAwarenessUpdate(awareness, [yClientId])
    updatedAt: t.timestamp(),
  }
);

const documentCommentTable = table(
  {
    name: 'document_comment',
    public: true,
    indexes: [
      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },
      { accessor: 'byThreadId', algorithm: 'btree', columns: ['threadId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    documentId: t.string(),
    organizationId: t.string(),
    threadId: t.string(),                     // client UUID; equals the Tiptap comment mark attr `threadId`
    parentId: t.option(t.string()),           // undefined = thread root; otherwise the root comment id
    authorMemberId: t.string(),
    authorIdentity: t.identity(),
    body: t.string(),
    quotedText: t.option(t.string()),         // root only
    mentions: t.option(t.string()),           // JSON string[] of org_member ids
    status: t.string(),                       // root: 'open' | 'resolved'; replies: 'open'
    resolvedAt: t.option(t.timestamp()),
    resolvedByMemberId: t.option(t.string()),
    createdAt: t.timestamp(),
    editedAt: t.option(t.timestamp()),
    anchor: t.option(t.byteArray()),          // root only: encoded Yjs relative positions (lib/docs/comment-anchors.ts); commenters can't write the mark
  }
);

const documentVersionTable = table(
  {
    name: 'document_version',
    public: true,
    indexes: [
      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    documentId: t.string(),
    organizationId: t.string(),
    kind: t.string(),                         // 'auto' | 'named' | 'restore'
    name: t.option(t.string()),
    state: t.byteArray(),                     // full Y state (independent of gc)
    throughUpdateId: t.u64(),
    byteLength: t.u32(),
    wordCount: t.u32(),
    createdAt: t.timestamp(),
    createdByMemberId: t.string(),
  }
);

const documentStarTable = table(
  {
    name: 'document_star',
    public: true,
    indexes: [
      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    documentId: t.string(),
    organizationId: t.string(),
    memberId: t.string(),
    createdAt: t.timestamp(),
  }
);

const documentAccessTable = table(
  {
    name: 'document_access',
    public: true,
    indexes: [
      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    documentId: t.string(),
    organizationId: t.string(),
    memberId: t.string(),
    role: t.string(),                         // 'viewer' | 'commenter' | 'editor'
    grantedByMemberId: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const spacetimedb = schema({
  user: userTable,
  organization: organizationTable,
  orgMember: orgMemberTable,
  orgInvitation: orgInvitationTable,
  settings: settingsTable,
  inventoryItem: inventoryItemTable,
  inventoryTransaction: inventoryTransactionTable,
  salesRecord: salesRecordTable,
  staffRole: staffRoleTable,
  roleTask: roleTaskTable,
  staffMember: staffMemberTable,
  shiftPreset: shiftPresetTable,
  shift: shiftTable,
  staffAvailability: staffAvailabilityTable,
  timeOffRequest: timeOffRequestTable,
  shiftTrade: shiftTradeTable,
  payment: paymentTable,
  chatConversation: chatConversationTable,
  chatMember: chatMemberTable,
  chatMessage: chatMessageTable,
  todo: todoTable,
  punchEvent: punchEventTable,
  storeDevice: storeDeviceTable,
  deviceLoginRequest: deviceLoginRequestTable,
  site: siteTable,
  sitePage: sitePageTable,
  siteComponent: siteComponentTable,
  siteCustomer: siteCustomerTable,
  membershipTier: membershipTierTable,
  membershipPerk: membershipPerkTable,
  perkClaim: perkClaimTable,
  customerPoints: customerPointsTable,
  siteMembership: siteMembershipTable,
  siteOrder: siteOrderTable,
  siteBooking: siteBookingTable,
  notification: notificationTable,
  wasteLog: wasteLogTable,
  location: locationTable,
  supplier: supplierTable,
  purchaseOrder: purchaseOrderTable,
  supplierMessage: supplierMessageTable,
  expense: expenseTable,
  coupon: couponTable,
  queueEntry: queueEntryTable,
  aiChatSession: aiChatSessionTable,
  aiJob: aiJobTable,
  trainingDay: trainingDayTable,
  trainingObjective: trainingObjectiveTable,
  trainingObjectiveGrade: trainingObjectiveGradeTable,
  trainingDayGrade: trainingDayGradeTable,
  trainingReviewRequest: trainingReviewRequestTable,
  dailyBriefing: dailyBriefingTable,
  roleTaskAssignment: roleTaskAssignmentTable,
  design: designTable,
  pushSubscription: pushSubscriptionTable,
  blogPost: blogPostTable,
  serviceIdentity: serviceIdentityTable,
  userSecret: userSecretTable,
  orgSecret: orgSecretTable,
  memberPunchCode: memberPunchCodeTable,
  deviceOperatorSession: deviceOperatorSessionTable,
  migrationState: migrationStateTable,
  userBriefingPref: userBriefingPrefTable,
  aiUsage: aiUsageTable,
  aiUsageQuota: aiUsageQuotaTable,
  platformAdmin: platformAdminTable,
  platformAdminSecret: platformAdminSecretTable,
  document: documentTable,
  documentUpdate: documentUpdateTable,
  documentSnapshot: documentSnapshotTable,
  documentPresence: documentPresenceTable,
  documentComment: documentCommentTable,
  documentVersion: documentVersionTable,
  documentStar: documentStarTable,
  documentAccess: documentAccessTable,
});

export default spacetimedb;

// ═══════════════════════════════════════════════════════════════════════════════
// ROW-LEVEL SECURITY
// ═══════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS
// ---------------
// Every table below used to be readable, in full, by anyone who knew the module
// name — and the module name ships in the client bundle as
// NEXT_PUBLIC_SPACETIMEDB_MODULE. A plain unauthenticated
//
//     curl -d "SELECT * FROM settings" https://<host>/v1/database/<module>/sql
//
// returned every tenant's Square OAuth tokens. `public: true` in SpacetimeDB
// means "any client may read every row", not "any authenticated client may read
// its own rows". Scoping the client's subscription query does nothing: the
// client chooses its own query.
//
// A `clientVisibilityFilter` is the only real boundary. It is enforced by the
// database for BOTH the WebSocket subscription path and the HTTP /sql path.
//
// HOW IT WORKS
// ------------
//   * A rule is `SELECT <alias>.* FROM ...` returning rows of exactly ONE table.
//   * Several rules on the same table are OR'd together.
//   * A table with NO rule stays fully world-readable — so the default is
//     dangerous, and every new table must be added here. See RLS_UNFILTERED.
//   * `:sender` binds to the calling identity.
//
// DIALECT LIMITS THAT SHAPED THESE RULES (all verified against the live module)
// ---------------------------------------------------------------------------
//   * `option` columns cannot be compared or joined AT ALL:
//         Unexpected type: (expected) String != (some: String | none: ())
//     So no rule may reference an `t.option(...)` column. This is also why
//     `organization.parentOrgId` cannot drive share-group visibility.
//   * uuid cannot be joined against string:
//         Unexpected type: (expected) String != (__uuid__: U128)
//     Every table keys its parent by a STRING column while primary keys are
//     `t.uuid()`, so joins to `organization.id` / `site.id` / `chat_conversation.id`
//     are impossible. `organization.orgIdText` and `site_booking.organizationId`
//     were added to work around exactly this.
//   * `IN` is not supported ("Unsupported expression"); only
//     = < > <= >= != <> combined with AND / OR against literals.
//
// THE SERVICE RULE
// ----------------
// /merchivaAdmin and the server-side cron/fan-out routes read across every
// tenant using SPACETIMEDB_SERVICE_TOKEN, which is an ordinary identity and is
// therefore subject to RLS. Each table gets a second rule granting that
// identity full read access, following the documented "admin" pattern
// (`JOIN service_identity s WHERE s.identity = :sender`). Without it the whole
// admin console goes blank the moment these filters are published.

/**
 * Tables scoped to "an active membership in the owning organization".
 *
 * Each entry is a table name, or `[table, column]` when the scoping column is
 * not called `organizationId`. The column MUST NOT be `t.option(...)`: publish
 * rejects a rule that touches one with
 *   Unexpected type: (expected) String != (some: String | none: ())
 * `role_task` is the case in point — its `organizationId` is an option, so it
 * scopes on the `orgId` mirror instead. `bun run check:rls` enforces this.
 */
const RLS_ORG_SCOPED: Array<string | [table: string, column: string]> = [
  'ai_chat_session', 'ai_job', 'ai_usage', 'ai_usage_quota',
  'chat_conversation', 'coupon', 'daily_briefing', 'design',
  'device_login_request', 'document', 'document_access', 'document_comment',
  'document_presence', 'document_snapshot', 'document_star', 'document_update',
  'document_version', 'expense', 'inventory_item', 'inventory_transaction',
  'location', 'org_invitation', 'payment', 'punch_event', 'purchase_order',
  'queue_entry', ['role_task', 'orgId'], 'role_task_assignment', 'sales_record',
  'settings', 'shift', 'shift_preset', 'shift_trade', 'site', 'site_booking',
  'site_component', 'staff_availability', 'staff_member', 'staff_role',
  'store_device', 'supplier', 'supplier_message', 'time_off_request',
  'training_day', 'training_day_grade', 'training_objective',
  'training_objective_grade', 'training_review_request', 'waste_log',
];

/**
 * Tables scoped to a single user by an `identity` column. These hold personal
 * data that colleagues have no business reading — a browser push keypair, a
 * private notification, a personal todo list, a punch-in PIN.
 */
const RLS_SELF_SCOPED: Array<[table: string, column: string]> = [
  ['notification', 'targetId'],
  ['push_subscription', 'targetId'],
  ['todo', 'userId'],
  ['user_briefing_pref', 'userId'],
  ['member_punch_code', 'userId'],
  ['device_operator_session', 'identity'],
];

/**
 * Website-builder / loyalty tables. The features were removed in "slim down to
 * core ops", but the tables, their reducers and their customer PII are still
 * deployed. Until they are dropped for real they are readable by nothing except
 * the service identity — no client rule at all.
 */
const RLS_SERVICE_ONLY = [
  'site_page', 'site_customer', 'site_order', 'site_membership',
  'membership_tier', 'membership_perk', 'perk_claim', 'customer_points',
  'platform_admin',
];

/**
 * Deliberately NOT filtered, with the reason. Anything not listed here and not
 * covered by a rule above is an oversight, not a decision.
 *
 *   blog_post        — public marketing content rendered by unauthenticated SSR
 *                      (lib/spacetimedb/sql.ts). Holds no tenant data.
 *   service_identity — every other table's service rule joins it, and a rule
 *                      that references a private table makes the ENTIRE rule
 *                      set fail to evaluate. It cannot carry its own rule
 *                      either: that would be self-referential. Contents are
 *                      identity hashes and labels — not credentials.
 *
 * Private (`public: false`) tables need no rule; they are unreadable by any
 * client: platform_admin_secret, user_secret, org_secret, migration_state.
 */
const RLS_UNFILTERED = ['blog_post', 'service_identity'];
void RLS_UNFILTERED;

const rlsRules: Record<string, ReturnType<typeof spacetimedb.clientVisibilityFilter.sql>> = {};

/** Full read access for the server-side service identity. */
function serviceRule(tableName: string) {
  return `SELECT x.* FROM ${tableName} x JOIN service_identity s WHERE s.identity = :sender`;
}

/** ['table', 'column'] for every org-scoped entry, defaulting the column. */
const orgScopedPairs: Array<[string, string]> = RLS_ORG_SCOPED.map((e) =>
  typeof e === 'string' ? [e, 'organizationId'] : e
);

for (const [tbl, col] of orgScopedPairs) {
  rlsRules[`rls_${tbl}_member`] = spacetimedb.clientVisibilityFilter.sql(
    `SELECT x.* FROM ${tbl} x ` +
    `JOIN org_member m ON x.${col} = m.organizationId ` +
    `WHERE m.userId = :sender AND m.status = 'active'`
  );
}
for (const [tbl, col] of RLS_SELF_SCOPED) {
  rlsRules[`rls_${tbl}_self`] = spacetimedb.clientVisibilityFilter.sql(
    `SELECT * FROM ${tbl} WHERE ${col} = :sender`
  );
}
for (const tbl of [...orgScopedPairs.map(([t2]) => t2), ...RLS_SELF_SCOPED.map(([t2]) => t2),
                   ...RLS_SERVICE_ONLY,
                   'org_member', 'organization', 'user', 'chat_member', 'chat_message']) {
  rlsRules[`rls_${tbl}_service`] = spacetimedb.clientVisibilityFilter.sql(serviceRule(tbl));
}

// ─── Hand-written rules ──────────────────────────────────────────────────────

// org_member: your own memberships, plus everyone in an org where you are an
// active member (the team page, chat author names and the schedule all need
// colleague rows). The punch-in PIN is NOT in this table any more — RLS is row
// level and could not have hidden that one column from a colleague.
rlsRules.rls_org_member_self = spacetimedb.clientVisibilityFilter.sql(
  `SELECT * FROM org_member WHERE userId = :sender`
);
rlsRules.rls_org_member_colleagues = spacetimedb.clientVisibilityFilter.sql(
  `SELECT peer.* FROM org_member peer ` +
  `JOIN org_member me ON peer.organizationId = me.organizationId ` +
  `WHERE me.userId = :sender AND me.status = 'active'`
);

// organization: orgs you own, plus orgs you are an active member of. Joins go
// through `orgIdText` because `id` is a uuid — see the dialect notes above.
rlsRules.rls_organization_owner = spacetimedb.clientVisibilityFilter.sql(
  `SELECT * FROM organization WHERE ownerId = :sender`
);
rlsRules.rls_organization_member = spacetimedb.clientVisibilityFilter.sql(
  `SELECT o.* FROM organization o ` +
  `JOIN org_member m ON o.orgIdText = m.organizationId ` +
  `WHERE m.userId = :sender AND m.status = 'active'`
);

// user: yourself, plus colleagues (needed for display names / avatars).
// `passwordHash` has moved to the private `user_secret` table, so the colleague
// rule no longer hands out credentials.
rlsRules.rls_user_self = spacetimedb.clientVisibilityFilter.sql(
  `SELECT * FROM user WHERE identity = :sender`
);
rlsRules.rls_user_colleagues = spacetimedb.clientVisibilityFilter.sql(
  `SELECT u.* FROM user u ` +
  `JOIN org_member theirs ON u.identity = theirs.userId ` +
  `JOIN org_member mine ON theirs.organizationId = mine.organizationId ` +
  `WHERE mine.userId = :sender AND mine.status = 'active'`
);

// chat: membership-scoped rather than org-scoped — you see a conversation's
// messages only if you are in it. `chat_conversation.id` is a uuid and
// `chat_message.conversationId` a string, so the join has to go through
// chat_member, which keys the conversation the same (string) way.
rlsRules.rls_chat_member_peers = spacetimedb.clientVisibilityFilter.sql(
  `SELECT peer.* FROM chat_member peer ` +
  `JOIN chat_member me ON peer.conversationId = me.conversationId ` +
  `WHERE me.userId = :sender`
);
rlsRules.rls_chat_message_mine = spacetimedb.clientVisibilityFilter.sql(
  `SELECT msg.* FROM chat_message msg ` +
  `JOIN chat_member me ON msg.conversationId = me.conversationId ` +
  `WHERE me.userId = :sender`
);

export const rowLevelSecurity = spacetimedb.exportGroup(rlsRules);

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Auto-insert a user record when a new client connects for the first time. */
export const onConnect = spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.user.identity.find(ctx.sender);
  if (!existing) {
    ctx.db.user.insert({
      identity: ctx.sender,
      email: '',
      passwordHash: undefined,
      displayName: undefined,
      avatarUrl: undefined,
      lastActiveOrgId: undefined,
      createdAt: ctx.timestamp,
      isAdmin: undefined,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Password storage ────────────────────────────────────────────────────────
//
// `user` is a public table: a client can read its own row, and (via RLS) its
// colleagues' rows. A password hash must not be in there — RLS is row level and
// cannot hide a single column. Hashes live in the private `user_secret` table,
// which no client can read at any access level.
//
// The legacy `user.passwordHash` column cannot be dropped (SpacetimeDB has no
// automatic column removal), so it is blanked by `migrateSecurityV1` and never
// written again. `readPasswordHash` still falls back to it so a login attempt
// that arrives before the migration has run does not fail.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readPasswordHash(ctx: any, user: { identity: unknown; passwordHash?: string }): string | undefined {
  const secret = ctx.db.userSecret.identity.find(user.identity);
  if (secret) return secret.passwordHash as string;
  return user.passwordHash;               // pre-migration fallback
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writePasswordHash(ctx: any, identity: unknown, passwordHash: string): void {
  const existing = ctx.db.userSecret.identity.find(identity);
  if (existing) {
    ctx.db.userSecret.identity.update({ ...existing, passwordHash, updatedAt: ctx.timestamp });
  } else {
    ctx.db.userSecret.insert({ identity, passwordHash, updatedAt: ctx.timestamp });
  }
}

/** Set the user's email, password hash, and display name after first connect. */
export const createUser = spacetimedb.reducer(
  {
    email: t.string(),
    passwordHash: t.option(t.string()),
    displayName: t.option(t.string()),
  },
  (ctx, { email, passwordHash, displayName }) => {
    if (passwordHash) writePasswordHash(ctx, ctx.sender, passwordHash);
    const existing = ctx.db.user.identity.find(ctx.sender);
    if (existing) {
      ctx.db.user.identity.update({
        ...existing,
        email,
        // Never store the hash on the public row again.
        passwordHash: undefined,
        displayName: displayName ?? existing.displayName,
      });
    } else {
      ctx.db.user.insert({
        identity: ctx.sender,
        email,
        passwordHash: undefined,
        displayName,
        avatarUrl: undefined,
        lastActiveOrgId: undefined,
        createdAt: ctx.timestamp,
        isAdmin: undefined,
      });
    }
  }
);

/**
 * Authenticate with email + password hash when no stored token is available.
 * Migrates all user data from the old Identity to the calling Identity so the
 * new token can fully replace the old one.
 */
export const loginWithPassword = spacetimedb.reducer(
  {
    email: t.string(),
    passwordHash: t.string(),
  },
  (ctx, { email, passwordHash }) => {
    // Find existing account by email
    const existingUser = [...ctx.db.user.byEmail.filter(email)][0];
    if (!existingUser) throw new SenderError('Invalid email or password');
    const storedHash = readPasswordHash(ctx, existingUser);
    if (!storedHash) throw new SenderError('Account has no password set');
    if (storedHash !== passwordHash) throw new SenderError('Invalid email or password');

    const oldIdentity = existingUser.identity;
    const newIdentity = ctx.sender;

    // If same identity (token is already valid), nothing to migrate
    if (oldIdentity.toString() === newIdentity.toString()) return;

    // Delete the auto-created empty user row for the new anonymous identity
    const autoCreated = ctx.db.user.identity.find(newIdentity);
    if (autoCreated && autoCreated.email === '') {
      ctx.db.user.delete(autoCreated);
    }

    // Migrate user record to new identity
    ctx.db.user.delete(existingUser);
    ctx.db.user.insert({ ...existingUser, identity: newIdentity, passwordHash: undefined });

    // Move the password hash onto the new identity, then drop the old secret.
    const oldSecret = ctx.db.userSecret.identity.find(oldIdentity);
    writePasswordHash(ctx, newIdentity, storedHash);
    if (oldSecret) ctx.db.userSecret.delete(oldSecret);

    // Migrate org memberships
    for (const m of [...ctx.db.orgMember.byUserId.filter(oldIdentity)]) {
      ctx.db.orgMember.id.update({ ...m, userId: newIdentity });
    }

    // Migrate staff availability
    for (const a of [...ctx.db.staffAvailability.byUserId.filter(oldIdentity)]) {
      ctx.db.staffAvailability.id.update({ ...a, userId: newIdentity });
    }

    // Migrate time-off requests
    for (const r of [...ctx.db.timeOffRequest.byUserId.filter(oldIdentity)]) {
      ctx.db.timeOffRequest.id.update({ ...r, userId: newIdentity });
    }

    // Migrate chat memberships
    for (const cm of [...ctx.db.chatMember.byUserId.filter(oldIdentity)]) {
      ctx.db.chatMember.id.update({ ...cm, userId: newIdentity });
    }

    // Migrate todos
    for (const td of [...ctx.db.todo.byUserId.filter(oldIdentity)]) {
      ctx.db.todo.id.update({ ...td, userId: newIdentity });
    }

    // ── Identity-keyed rows that were previously left behind ────────────────
    // These were never migrated before. It did not show because every client
    // subscribed to every row of these tables and filtered in JavaScript; now
    // that RLS scopes them by `:sender`, an un-migrated row would simply
    // vanish for the user (lost notifications, dead push subscriptions, a
    // punch-in PIN that no longer opens the store device).
    for (const n of [...ctx.db.notification.iter()]) {
      if (n.targetId.toString() === oldIdentity.toString()) {
        ctx.db.notification.id.update({ ...n, targetId: newIdentity });
      }
    }
    for (const p of [...ctx.db.pushSubscription.iter()]) {
      if (p.targetId.toString() === oldIdentity.toString()) {
        ctx.db.pushSubscription.id.update({ ...p, targetId: newIdentity });
      }
    }
    for (const c of [...ctx.db.memberPunchCode.byUserId.filter(oldIdentity)]) {
      ctx.db.memberPunchCode.memberId.update({ ...c, userId: newIdentity });
    }
    const pref = ctx.db.userBriefingPref.userId.find(oldIdentity);
    if (pref) {
      ctx.db.userBriefingPref.delete(pref);
      ctx.db.userBriefingPref.insert({ ...pref, userId: newIdentity });
    }
  }
);

/** Update the user's profile. */
export const updateProfile = spacetimedb.reducer(
  {
    displayName: t.option(t.string()),
    avatarUrl: t.option(t.string()),
  },
  (ctx, { displayName, avatarUrl }) => {
    const user = ctx.db.user.identity.find(ctx.sender);
    if (!user) unauthorized('User not found');
    ctx.db.user.identity.update({ ...user, displayName, avatarUrl });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ORG REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new organization and make the caller its owner.
 *
 * Optional `parentOrgId` makes this a sub-store of an existing org. Validated:
 * caller must own the parent, and the parent itself must be a root org (no
 * grandparenting — sub-store hierarchy is one level deep on purpose to keep
 * sharing semantics obvious).
 */
export const createOrg = spacetimedb.reducer(
  { name: t.string(), parentOrgId: t.option(t.string()) },
  (ctx, { name, parentOrgId }) => {
    const user = ctx.db.user.identity.find(ctx.sender);
    if (!user) unauthorized('Must be logged in');

    // Validate parent if provided.
    let resolvedParentId: string | undefined = undefined;
    if (parentOrgId && parentOrgId.length > 0) {
      const parent = [...ctx.db.organization.byOrgIdText.filter(parentOrgId)][0];
      if (!parent) throw new SenderError('Parent organization not found');
      if (parent.ownerId.toString() !== ctx.sender.toString() && !isServiceCaller(ctx)) {
        unauthorized('Only the parent organization owner can add a sub-store');
      }
      if (parent.parentOrgId) {
        throw new SenderError('Sub-stores cannot themselves have sub-stores');
      }
      resolvedParentId = parentOrgId;
    }

    const orgId = ctx.newUuidV4();
    const orgIdText = orgId.toString();
    ctx.db.organization.insert({
      id: orgId,
      ownerId: ctx.sender,
      name,
      createdAt: ctx.timestamp,
      stripeCustomerId: undefined,
      subscriptionStatus: undefined,
      subscriptionPriceId: undefined,
      subscriptionInterval: undefined,
      currentPeriodEnd: undefined,
      parentOrgId: resolvedParentId,
      logoUrl: undefined,
      // Mirrors of `id` / `parentOrgId` as plain strings. RLS and subscription
      // WHERE clauses cannot touch a uuid or an option column, so these are the
      // only way this row is reachable by a filter. Keep them in sync on every
      // write that changes id or parent.
      orgIdText,
      rootOrgId: resolvedParentId ?? orgIdText,
    });

    const defaultPermissions = JSON.stringify({
      dashboard: { view: true },
      inventory: { view: true, edit: true },
      sales: { view: true },
      staffing: { view: true, edit: true },
      products: { view: true, edit: true },
      settings: { view: true },
      pos: { view: true, edit: true },
      team: { view: true, invite: true, edit: true },
      website: { view: true, edit: true },
    });

    ctx.db.orgMember.insert({
      id: ctx.newUuidV4(),
      organizationId: orgId.toString(),
      userId: ctx.sender,
      role: 'owner',
      displayName: user.displayName ?? user.email,
      email: user.email,
      permissions: defaultPermissions,
      status: 'active',
      joinedAt: ctx.timestamp,
      punchInCode: undefined,
      hourlyRate: undefined,
      hourlyRateCents: undefined,
    });

    // Initialize default settings for the org — seed businessName from org name
    ctx.db.settings.insert({
      id: ctx.newUuidV4(),
      organizationId: orgId.toString(),
      businessName: name,
      businessType: undefined,
      timezone: 'America/Los_Angeles',
      squareConnected: false,
      squareAccessToken: undefined,
      squareRefreshToken: undefined,
      squareTokenExpiresAt: undefined,
      squareMerchantId: undefined,
      squareLocationId: undefined,
      squareLastSyncedAt: undefined,
      paymentTaxRate: 0,
      paymentCurrency: 'USD',
      locationLatitude: undefined,
      locationLongitude: undefined,
      googlePlacesId: undefined,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
      autoCommitSchedules: undefined,
      openingHours: undefined,
      countryCode: undefined,
      assistantConfig: undefined,
      betaFeatures: undefined,
      scheduleProvider: undefined,
      scheduleConnected: undefined,
      scheduleCompanyGuid: undefined,
      scheduleCompanyId: undefined,
      scheduleLocationId: undefined,
      scheduleLastSyncedAt: undefined,
      scheduleLastSyncStatus: undefined,
      scheduleLastSyncSummary: undefined,
      supplierInboundPrefix: defaultSupplierInboundPrefix(orgId.toString()),
      deviceApps: undefined,
    });
  }
);

/** Update organization name. Owner only. */
export const updateOrg = spacetimedb.reducer(
  { organizationId: t.string(), name: t.string() },
  (ctx, { organizationId, name }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role !== 'owner') unauthorized('Owner only');

    const org = [...ctx.db.organization.byOrgIdText.filter(organizationId)][0];
    if (!org) throw new SenderError('Organization not found');
    // Note: update requires primaryKey index – rebuild with delete + insert
    ctx.db.organization.delete(org);
    ctx.db.organization.insert({ ...org, name });
  }
);

/** Update the organization's store image URL. Owner only. Pass undefined/"" to clear. */
export const updateOrgLogo = spacetimedb.reducer(
  { organizationId: t.string(), logoUrl: t.option(t.string()) },
  (ctx, { organizationId, logoUrl }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role !== 'owner') unauthorized('Owner only');

    const org = [...ctx.db.organization.byOrgIdText.filter(organizationId)][0];
    if (!org) throw new SenderError('Organization not found');
    ctx.db.organization.delete(org);
    ctx.db.organization.insert({
      ...org,
      logoUrl: logoUrl && logoUrl.length > 0 ? logoUrl : undefined,
    });
  }
);

/**
 * Change the parent-store relationship for an org. Owner only.
 *
 * Pass `parentOrgId = undefined` (or empty string) to detach an org from its
 * parent and turn it into a root org. Pass an org id to attach as a sub-store.
 * Same validation as createOrg: caller must own the parent, parent must itself
 * be a root org, target cannot be its own parent.
 */
export const updateOrgParent = spacetimedb.reducer(
  { organizationId: t.string(), parentOrgId: t.option(t.string()) },
  (ctx, { organizationId, parentOrgId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role !== 'owner') unauthorized('Owner only');

    const org = [...ctx.db.organization.byOrgIdText.filter(organizationId)][0];
    if (!org) throw new SenderError('Organization not found');

    // Detach branch — accept null/undefined/"" to clear parent.
    if (!parentOrgId || parentOrgId.length === 0) {
      ctx.db.organization.delete(org);
      ctx.db.organization.insert({
        ...org, parentOrgId: undefined, rootOrgId: org.id.toString(),
      });
      return;
    }

    if (parentOrgId === organizationId) throw new SenderError('Org cannot be its own parent');

    const parent = [...ctx.db.organization.byOrgIdText.filter(parentOrgId)][0];
    if (!parent) throw new SenderError('Parent organization not found');
    if (parent.ownerId.toString() !== ctx.sender.toString() && !isServiceCaller(ctx)) {
      unauthorized('Only the parent organization owner can attach a sub-store');
    }
    if (parent.parentOrgId) {
      throw new SenderError('Sub-stores cannot themselves have sub-stores');
    }
    // If this org is currently a parent of others, we can't make it a child too.
    const hasChildren = [...ctx.db.organization.byRootOrgId.filter(organizationId)]
      .some(o => o.orgIdText !== organizationId);
    if (hasChildren) {
      throw new SenderError('Cannot attach an org that already has sub-stores');
    }

    ctx.db.organization.delete(org);
    ctx.db.organization.insert({ ...org, parentOrgId, rootOrgId: parentOrgId });
  }
);

/**
 * Sync the org's Stripe subscription state. Owner-only.
 *
 * The webhook flow: Stripe → /api/billing/webhook (server validates the
 * signature) → server returns 200 → client (settings page) fetches sub state
 * from /api/billing/sync → client calls this reducer with its user identity.
 * Since only owners can pay, owner-only is the right gate.
 *
 * Any field passed as undefined is left unchanged. Pass empty string to
 * explicitly clear. Use null for option fields by passing the literal "" (we
 * map "" → undefined on the row).
 */
export const updateOrgSubscription = spacetimedb.reducer(
  {
    organizationId: t.string(),
    stripeCustomerId: t.option(t.string()),
    subscriptionStatus: t.option(t.string()),
    subscriptionPriceId: t.option(t.string()),
    subscriptionInterval: t.option(t.string()),
    currentPeriodEnd: t.option(t.timestamp()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role !== 'owner') unauthorized('Owner only');

    const org = [...ctx.db.organization.byOrgIdText.filter(args.organizationId)][0];
    if (!org) throw new SenderError('Organization not found');

    ctx.db.organization.delete(org);
    ctx.db.organization.insert({
      ...org,
      stripeCustomerId: args.stripeCustomerId ?? org.stripeCustomerId,
      subscriptionStatus: args.subscriptionStatus ?? org.subscriptionStatus,
      subscriptionPriceId: args.subscriptionPriceId ?? org.subscriptionPriceId,
      subscriptionInterval: args.subscriptionInterval ?? org.subscriptionInterval,
      currentPeriodEnd: args.currentPeriodEnd ?? org.currentPeriodEnd,
    });
  }
);

/** Invite a user to the organization. Owner/manager only. */
export const inviteToOrg = spacetimedb.reducer(
  {
    organizationId: t.string(),
    email: t.string(),
    role: t.string(),
    permissions: t.string(),  // JSON-encoded Permissions
  },
  (ctx, { organizationId, email, role, permissions }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    // Only owner can invite managers
    if (role === 'manager' && member.role !== 'owner') unauthorized('Owner only can invite managers');

    // One live seat per email: no invite for existing members, no duplicate
    // pending invitations (each would show up as another pending person).
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new SenderError('Email is required');
    for (const m of ctx.db.orgMember.byOrganizationId.filter(organizationId)) {
      if (m.status !== 'removed' && String(m.email).trim().toLowerCase() === normalizedEmail) {
        throw new SenderError('This person is already a member of the organization');
      }
    }
    for (const inv of ctx.db.orgInvitation.byOrganizationId.filter(organizationId)) {
      if (
        inv.acceptedAt === undefined &&
        inv.expiresAt.microsSinceUnixEpoch > ctx.timestamp.microsSinceUnixEpoch &&
        String(inv.email).trim().toLowerCase() === normalizedEmail
      ) {
        throw new SenderError('An invitation for this email is already pending');
      }
    }

    const token = ctx.newUuidV4().toString();
    const expiresAt = new (ctx.timestamp.constructor as any)(
      ctx.timestamp.microsSinceUnixEpoch + BigInt(7 * 24 * 60 * 60 * 1_000_000) // 7 days
    );

    ctx.db.orgInvitation.insert({
      id: ctx.newUuidV4(),
      organizationId,
      email: normalizedEmail,
      role,
      permissions,
      token,
      expiresAt,
      acceptedAt: undefined,
      createdAt: ctx.timestamp,
    });
  }
);

/** Accept an org invitation by token. */
export const acceptInvitation = spacetimedb.reducer(
  { token: t.string() },
  (ctx, { token }) => {
    const user = ctx.db.user.identity.find(ctx.sender);
    if (!user) unauthorized('Must be logged in');

    const invite = [...ctx.db.orgInvitation.byToken.filter(token)][0];
    if (!invite) throw new SenderError('Invitation not found');
    if (invite.acceptedAt !== undefined) throw new SenderError('Invitation already used');
    if (invite.expiresAt.microsSinceUnixEpoch < ctx.timestamp.microsSinceUnixEpoch) {
      throw new SenderError('Invitation expired');
    }

    ctx.db.orgMember.insert({
      id: ctx.newUuidV4(),
      organizationId: invite.organizationId,
      userId: ctx.sender,
      role: invite.role,
      displayName: user.displayName ?? user.email,
      email: user.email,
      permissions: invite.permissions,
      status: 'active',
      joinedAt: ctx.timestamp,
      punchInCode: undefined,
      hourlyRate: undefined,
      hourlyRateCents: undefined,
    });

    // Mark invitation as accepted (delete + reinsert)
    ctx.db.orgInvitation.delete(invite);
    ctx.db.orgInvitation.insert({ ...invite, acceptedAt: ctx.timestamp });

    const joinName = user.displayName ?? user.email;
    notifyOrgMembers(ctx, invite.organizationId, 'team',
      'New team member',
      `${joinName} has joined the team`,
      '/team', ctx.sender);
  }
);

/** Update own display name across user profile and all org memberships. */
export const updateDisplayName = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const user = ctx.db.user.identity.find(ctx.sender);
    if (!user) unauthorized('User not found');
    ctx.db.user.identity.update({ ...user, displayName });
    for (const m of [...ctx.db.orgMember.byUserId.filter(ctx.sender)]) {
      ctx.db.orgMember.delete(m);
      ctx.db.orgMember.insert({ ...m, displayName });
    }
  }
);

/** Update a member's role and permissions. Owner only. */
export const updateMemberPermissions = spacetimedb.reducer(
  {
    organizationId: t.string(),
    memberId: t.string(),
    role: t.string(),
    permissions: t.string(),
  },
  (ctx, { organizationId, memberId, role, permissions }) => {
    const caller = findActiveMember(ctx, organizationId);
    if (caller.role !== 'owner') unauthorized('Owner only');

    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId);
    if (!target) throw new SenderError('Member not found');
    if (target.role === 'owner') throw new SenderError('Cannot modify owner');
    // Clients that omit a field send "" — persisting it would strip the
    // member's role (and slip past `role === 'staff'` gates elsewhere).
    if (!role.trim()) throw new SenderError('Role is required');
    if (!permissions.trim()) throw new SenderError('Permissions are required');

    ctx.db.orgMember.delete(target);
    ctx.db.orgMember.insert({ ...target, role, permissions });
  }
);

/** Disable or re-enable a member. Owner only. */
export const setMemberStatus = spacetimedb.reducer(
  { organizationId: t.string(), memberId: t.string(), status: t.string() },
  (ctx, { organizationId, memberId, status }) => {
    const caller = findActiveMember(ctx, organizationId);
    if (caller.role !== 'owner') unauthorized('Owner only');

    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId);
    if (!target) throw new SenderError('Member not found');

    ctx.db.orgMember.delete(target);
    ctx.db.orgMember.insert({ ...target, status });
  }
);

/** Leave an organization. */
export const leaveOrg = spacetimedb.reducer(
  { organizationId: t.string() },
  (ctx, { organizationId }) => {
    const member = [...ctx.db.orgMember.byUserId.filter(ctx.sender)]
      .find(m => m.organizationId === organizationId);
    if (!member) throw new SenderError('Not a member');
    if (member.role === 'owner') throw new SenderError('Owner cannot leave; transfer ownership first');
    ctx.db.orgMember.delete(member);
  }
);

/**
 * Set or clear a member's punch-in code.
 * - A user may always set/clear their own code.
 * - An owner or a member with `team.edit` permission may set/clear another
 *   member's code in the same organization.
 * Pass `code: undefined` (option) to clear the code.
 */
export const setPunchInCode = spacetimedb.reducer(
  {
    organizationId: t.string(),
    memberId: t.string(),
    code: t.option(t.string()),
  },
  (ctx, { organizationId, memberId, code }) => {
    const caller = findActiveMember(ctx, organizationId);
    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId);
    if (!target) throw new SenderError('Member not found');

    const isSelf = target.id.toString() === caller.id.toString();
    if (!isSelf) {
      const perms = JSON.parse(caller.permissions);
      const canEditTeam = caller.role === 'owner' || perms?.team?.edit === true;
      if (!canEditTeam) unauthorized('Cannot change another member\'s punch-in code');
    }

    // Validate code shape when setting (exactly 4 digits). Clearing is always allowed.
    if (code !== undefined) {
      if (!/^[0-9]{4}$/.test(code)) throw new SenderError('Code must be 4 digits');
      // Prevent collisions within the same org so punch-in lookups remain unambiguous.
      const collision = [...ctx.db.memberPunchCode.byOrganizationId.filter(organizationId)]
        .find(c => c.memberId !== memberId && c.code === code);
      if (collision) throw new SenderError('Code already in use at this store');
    }

    // The code now lives in `member_punch_code`, whose RLS rule matches
    // `userId = :sender` — a colleague can no longer read it. Writing it back
    // onto the org_member row would undo that, so the legacy column is always
    // cleared here.
    const existingCode = ctx.db.memberPunchCode.memberId.find(memberId);
    if (code === undefined) {
      if (existingCode) ctx.db.memberPunchCode.delete(existingCode);
    } else if (existingCode) {
      ctx.db.memberPunchCode.memberId.update({
        ...existingCode, organizationId, userId: target.userId, code, updatedAt: ctx.timestamp,
      });
    } else {
      ctx.db.memberPunchCode.insert({
        memberId, organizationId, userId: target.userId, code, updatedAt: ctx.timestamp,
      });
    }

    if (target.punchInCode !== undefined) {
      ctx.db.orgMember.delete(target);
      ctx.db.orgMember.insert({ ...target, punchInCode: undefined });
    }
  }
);

/**
 * Verify that `code` belongs to an active owner/manager of this org.
 *
 * The store tablet's "exit kiosk mode" gate and the settings page used to do
 * this by scanning the subscribed org_member rows in the browser and comparing
 * `m.punchInCode === input`. That required every staff member's client to hold
 * every manager's unlock PIN — the check and the secret were on the same side
 * of the trust boundary. Both callers now go through this reducer, and the PIN
 * never leaves the database.
 */
/**
 * Resolve a punch-in PIN to the member it belongs to, for the shared store
 * tablet. Writes the answer to `device_operator_session` for the calling
 * identity only. Throws if the PIN matches nobody, so a failed unlock is
 * indistinguishable from a wrong code.
 */
export const resolveDeviceOperator = spacetimedb.reducer(
  { organizationId: t.string(), code: t.string() },
  (ctx, { organizationId, code }) => {
    findActiveMember(ctx, organizationId);
    if (!/^[0-9]{4}$/.test(code)) throw new SenderError('PIN_NOT_RECOGNIZED');

    const entry = [...ctx.db.memberPunchCode.byOrganizationId.filter(organizationId)]
      .find(c => c.code === code);
    if (!entry) throw new SenderError('PIN_NOT_RECOGNIZED');

    const member = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === entry.memberId);
    if (!member || member.status !== 'active') throw new SenderError('PIN_NOT_RECOGNIZED');

    const row = {
      identity: ctx.sender,
      organizationId,
      memberId: member.id.toString(),
      memberName: member.displayName,
      role: member.role,
      resolvedAt: ctx.timestamp,
    };
    const existing = ctx.db.deviceOperatorSession.identity.find(ctx.sender);
    if (existing) ctx.db.deviceOperatorSession.identity.update(row);
    else ctx.db.deviceOperatorSession.insert(row);
  }
);

/** Forget the resolved operator (device lock / sign-out). */
export const clearDeviceOperator = spacetimedb.reducer(
  {},
  (ctx) => {
    const existing = ctx.db.deviceOperatorSession.identity.find(ctx.sender);
    if (existing) ctx.db.deviceOperatorSession.delete(existing);
  }
);

export const verifyManagerPin = spacetimedb.reducer(
  { organizationId: t.string(), code: t.string() },
  (ctx, { organizationId, code }) => {
    findActiveMember(ctx, organizationId);   // caller must belong to this org
    if (!/^[0-9]{4}$/.test(code)) throw new SenderError('Invalid code');

    const match = [...ctx.db.memberPunchCode.byOrganizationId.filter(organizationId)]
      .find(c => c.code === code);
    if (!match) throw new SenderError('Invalid code');

    const member = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === match.memberId);
    if (!member || member.status !== 'active') throw new SenderError('Invalid code');
    if (member.role !== 'owner' && member.role !== 'manager') {
      throw new SenderError('Invalid code');
    }
    // Success is the absence of a SenderError — reducers cannot return values.
  }
);

/**
 * Set or clear a member's hourly pay rate.
 * Owner or `team.edit` permission only — members cannot set their own rate.
 * Pass `rate: undefined` (option) to clear it.
 */
export const setMemberHourlyRate = spacetimedb.reducer(
  {
    organizationId: t.string(),
    memberId: t.string(),
    rate: t.option(t.number()),
  },
  (ctx, { organizationId, memberId, rate }) => {
    const caller = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(caller.permissions);
    const canEditTeam = caller.role === 'owner' || perms?.team?.edit === true;
    if (!canEditTeam) unauthorized('Cannot change pay rates');

    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId);
    if (!target) throw new SenderError('Member not found');

    if (rate !== undefined && (!Number.isFinite(rate) || rate < 0)) {
      throw new SenderError('Rate must be a non-negative number');
    }

    ctx.db.orgMember.delete(target);
    ctx.db.orgMember.insert({
      ...target,
      hourlyRate: rate,
      hourlyRateCents: toCentsOpt(rate),
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PUNCH CLOCK REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

function canManagePunches(caller: { role: string; permissions: string }): boolean {
  const perms = JSON.parse(caller.permissions);
  return (
    caller.role === 'owner' ||
    caller.role === 'manager' ||
    perms?.staffing?.edit === true ||
    perms?.team?.edit === true ||
    perms?.pos?.edit === true
  );
}

function timestampMicros(timestamp: { microsSinceUnixEpoch?: bigint; __timestamp_micros_since_unix_epoch__?: bigint }): bigint {
  return timestamp.microsSinceUnixEpoch ?? timestamp.__timestamp_micros_since_unix_epoch__ ?? 0n;
}

// Shared punch state machine used by recordPunch (PIN on a store device) and
// approveDeviceLogin (QR scan from a personal phone). `action` may be "auto".
function applyPunch(
  ctx: any,
  organizationId: string,
  member: { id: { toString(): string } },
  action: string,
) {
    const memberId = member.id.toString();
    const memberEvents = [...ctx.db.punchEvent.byMemberId.filter(memberId)]
      .filter(e => e.organizationId === organizationId);

    const openIn = memberEvents.find(e => e.action === 'in' && !e.closed);
    const openBreak = memberEvents.find(e => e.action === 'break-start' && !e.closed);
    const isOnShift = !!openIn;
    const isOnBreak = !!openBreak;

    let resolved = action;
    if (action === 'auto') {
      if (!isOnShift) resolved = 'in';
      else if (isOnBreak) resolved = 'break-end';
      else throw new SenderError('NEEDS_EXPLICIT_ACTION');
    }

    switch (resolved) {
      case 'in':
        if (isOnShift) throw new SenderError('Already on shift');
        break;
      case 'out':
        if (!isOnShift) throw new SenderError('Not on shift');
        if (isOnBreak) throw new SenderError('End break before punching out');
        break;
      case 'break-start':
        if (!isOnShift) throw new SenderError('Not on shift');
        if (isOnBreak) throw new SenderError('Already on break');
        break;
      case 'break-end':
        if (!isOnBreak) throw new SenderError('Not on break');
        break;
      default:
        throw new SenderError('Invalid action: ' + resolved);
    }

    let pairId: string | undefined = undefined;
    if (resolved === 'out' && openIn) {
      pairId = openIn.id.toString();
      ctx.db.punchEvent.delete(openIn);
      ctx.db.punchEvent.insert({ ...openIn, closed: true });
      if (openBreak) {
        ctx.db.punchEvent.delete(openBreak);
        ctx.db.punchEvent.insert({ ...openBreak, closed: true });
      }
    }
    if (resolved === 'break-end' && openBreak) {
      pairId = openBreak.id.toString();
      ctx.db.punchEvent.delete(openBreak);
      ctx.db.punchEvent.insert({ ...openBreak, closed: true });
    }

    ctx.db.punchEvent.insert({
      id: ctx.newUuidV4(),
      organizationId,
      memberId,
      // The raw PIN is deliberately not persisted — punch_event rows are
      // visible to the whole org and the code doubles as the manager unlock
      // secret. It is verified above and then discarded.
      pin: PUNCH_PIN_REDACTED,
      action: resolved,
      at: ctx.timestamp,
      closed: resolved === 'out' || resolved === 'break-end',
      pairEventId: pairId,
      createdAt: ctx.timestamp,
    });
}

export const recordPunch = spacetimedb.reducer(
  {
    organizationId: t.string(),
    code: t.string(),
    action: t.string(), // "in" | "out" | "break-start" | "break-end"
  },
  (ctx, { organizationId, code, action }) => {
    findActiveMember(ctx, organizationId);

    // Codes moved to the private-by-RLS `member_punch_code` table.
    const entry = [...ctx.db.memberPunchCode.byOrganizationId.filter(organizationId)]
      .find(c => c.code === code);
    if (!entry) throw new SenderError('Invalid punch-in code');

    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === entry.memberId && m.status === 'active');
    if (!target) throw new SenderError('Invalid punch-in code');

    // The PIN was verified above; it is deliberately not passed on, because
    // nothing downstream may persist it — see PUNCH_PIN_REDACTED.
    applyPunch(ctx, organizationId, target, action);
  }
);

export const managerRecordPunch = spacetimedb.reducer(
  {
    organizationId: t.string(),
    memberId: t.string(),
    action: t.string(), // "in" | "out"
  },
  (ctx, { organizationId, memberId, action }) => {
    const caller = findActiveMember(ctx, organizationId);
    if (!canManagePunches(caller)) unauthorized('No attendance edit permission');

    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId && m.status === 'active');
    if (!target) throw new SenderError('Member not found');

    const memberEvents = [...ctx.db.punchEvent.byMemberId.filter(memberId)]
      .filter(e => e.organizationId === organizationId);
    const openIn = memberEvents.find(e => e.action === 'in' && !e.closed);
    const openBreak = memberEvents.find(e => e.action === 'break-start' && !e.closed);

    if (action === 'in') {
      if (openIn) throw new SenderError('Already on shift');
      ctx.db.punchEvent.insert({
        id: ctx.newUuidV4(),
        organizationId,
        memberId,
        pin: PUNCH_PIN_REDACTED,
        action: 'in',
        at: ctx.timestamp,
        closed: false,
        pairEventId: undefined,
        createdAt: ctx.timestamp,
      });
      return;
    }

    if (action === 'out') {
      if (!openIn) throw new SenderError('Not on shift');
      const pairId = openIn.id.toString();
      ctx.db.punchEvent.delete(openIn);
      ctx.db.punchEvent.insert({ ...openIn, closed: true });
      if (openBreak) {
        ctx.db.punchEvent.delete(openBreak);
        ctx.db.punchEvent.insert({ ...openBreak, closed: true });
      }
      ctx.db.punchEvent.insert({
        id: ctx.newUuidV4(),
        organizationId,
        memberId,
        pin: PUNCH_PIN_REDACTED,
        action: 'out',
        at: ctx.timestamp,
        closed: true,
        pairEventId: pairId,
        createdAt: ctx.timestamp,
      });
      return;
    }

    throw new SenderError('Invalid action: ' + action);
  }
);

export const managerSetPunchWindow = spacetimedb.reducer(
  {
    organizationId: t.string(),
    memberId: t.string(),
    dayStartAt: t.timestamp(),
    dayEndAt: t.timestamp(),
    startAt: t.timestamp(),
    endAt: t.option(t.timestamp()),
  },
  (ctx, { organizationId, memberId, dayStartAt, dayEndAt, startAt, endAt }) => {
    const caller = findActiveMember(ctx, organizationId);
    if (!canManagePunches(caller)) unauthorized('No attendance edit permission');

    const dayStartMicros = timestampMicros(dayStartAt);
    const dayEndMicros = timestampMicros(dayEndAt);
    const startMicros = timestampMicros(startAt);
    const endMicros = endAt ? timestampMicros(endAt) : undefined;

    if (dayEndMicros <= dayStartMicros) throw new SenderError('Invalid attendance date');
    if (startMicros < dayStartMicros || startMicros >= dayEndMicros) throw new SenderError('Start time is outside selected date');
    if (endMicros !== undefined && endMicros <= startMicros) throw new SenderError('End time must be after start time');

    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId && m.status === 'active');
    if (!target) throw new SenderError('Member not found');

    const memberEvents = [...ctx.db.punchEvent.byMemberId.filter(memberId)]
      .filter(e => e.organizationId === organizationId);
    const dayEvents = memberEvents
      .filter(e => {
        const micros = timestampMicros(e.at);
        return micros >= dayStartMicros && micros < dayEndMicros;
      })
      .sort((a, b) => timestampMicros(a.at) < timestampMicros(b.at) ? -1 : 1);

    const inEvent = dayEvents.find(e => e.action === 'in' && !e.closed)
      ?? dayEvents.find(e => e.action === 'in');
    const closed = endAt !== undefined;
    let inEventId: string;

    if (inEvent) {
      inEventId = inEvent.id.toString();
      ctx.db.punchEvent.delete(inEvent);
      ctx.db.punchEvent.insert({
        ...inEvent,
        pin: PUNCH_PIN_REDACTED,
        at: startAt,
        closed,
      });
    } else {
      const id = ctx.newUuidV4();
      inEventId = id.toString();
      ctx.db.punchEvent.insert({
        id,
        organizationId,
        memberId,
        pin: PUNCH_PIN_REDACTED,
        action: 'in',
        at: startAt,
        closed,
        pairEventId: undefined,
        createdAt: ctx.timestamp,
      });
    }

    const existingOut = memberEvents.find(e => e.action === 'out' && e.pairEventId === inEventId)
      ?? dayEvents.find(e => e.action === 'out');

    if (endAt !== undefined) {
      if (existingOut) {
        ctx.db.punchEvent.delete(existingOut);
        ctx.db.punchEvent.insert({
          ...existingOut,
          pin: PUNCH_PIN_REDACTED,
          at: endAt,
          closed: true,
          pairEventId: inEventId,
        });
      } else {
        ctx.db.punchEvent.insert({
          id: ctx.newUuidV4(),
          organizationId,
          memberId,
          pin: PUNCH_PIN_REDACTED,
          action: 'out',
          at: endAt,
          closed: true,
          pairEventId: inEventId,
          createdAt: ctx.timestamp,
        });
      }

      const openBreak = memberEvents.find(e => e.action === 'break-start' && !e.closed);
      if (openBreak) {
        ctx.db.punchEvent.delete(openBreak);
        ctx.db.punchEvent.insert({ ...openBreak, closed: true });
      }
    } else if (existingOut) {
      ctx.db.punchEvent.delete(existingOut);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// STORE DEVICE REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const registerDevice = spacetimedb.reducer(
  {
    organizationId: t.string(),
    deviceId: t.string(),
    name: t.string(),
  },
  (ctx, { organizationId, deviceId, name }) => {
    findActiveMember(ctx, organizationId);
    const existing = [...ctx.db.storeDevice.byOrganizationId.filter(organizationId)]
      .find(d => d.deviceId === deviceId);
    if (existing) {
      ctx.db.storeDevice.delete(existing);
      ctx.db.storeDevice.insert({
        ...existing,
        name,
        enabled: true,
        lastSeenAt: ctx.timestamp,
      });
    } else {
      ctx.db.storeDevice.insert({
        id: ctx.newUuidV4(),
        organizationId,
        deviceId,
        name,
        enabled: true,
        lastSeenAt: ctx.timestamp,
        registeredBy: ctx.sender,
        createdAt: ctx.timestamp,
      });
    }
  }
);

export const updateStoreDevice = spacetimedb.reducer(
  {
    organizationId: t.string(),
    deviceId: t.string(),
    name: t.option(t.string()),
    enabled: t.option(t.bool()),
  },
  (ctx, { organizationId, deviceId, name, enabled }) => {
    findActiveMember(ctx, organizationId);
    const device = [...ctx.db.storeDevice.byOrganizationId.filter(organizationId)]
      .find(d => d.deviceId === deviceId);
    if (!device) throw new SenderError('Device not found');
    ctx.db.storeDevice.delete(device);
    ctx.db.storeDevice.insert({
      ...device,
      name: name ?? device.name,
      enabled: enabled ?? device.enabled,
      lastSeenAt: ctx.timestamp,
    });
  }
);

export const removeStoreDevice = spacetimedb.reducer(
  {
    organizationId: t.string(),
    deviceId: t.string(),
  },
  (ctx, { organizationId, deviceId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role !== 'owner' && member.role !== 'manager') unauthorized('Only owners/managers can remove devices');
    const device = [...ctx.db.storeDevice.byOrganizationId.filter(organizationId)]
      .find(d => d.deviceId === deviceId);
    if (!device) throw new SenderError('Device not found');
    ctx.db.storeDevice.delete(device);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE LOG-IN (QR handshake) REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

const DEVICE_LOGIN_TTL_MICROS = BigInt(120 * 1_000_000);      // 2 minutes
const DEVICE_LOGIN_PRUNE_MICROS = BigInt(60 * 60 * 1_000_000); // 1 hour

export const createDeviceLoginRequest = spacetimedb.reducer(
  {
    organizationId: t.string(),
    deviceId: t.string(),
    nonce: t.string(),
  },
  (ctx, { organizationId, deviceId, nonce }) => {
    findActiveMember(ctx, organizationId);
    if (!nonce || nonce.length < 8) throw new SenderError('Invalid nonce');

    const now = ctx.timestamp.microsSinceUnixEpoch;
    for (const row of [...ctx.db.deviceLoginRequest.byOrganizationId.filter(organizationId)]) {
      const stale = now - row.createdAt.microsSinceUnixEpoch > DEVICE_LOGIN_PRUNE_MICROS;
      const samePending = row.deviceId === deviceId && row.status === 'pending';
      if (stale || samePending) ctx.db.deviceLoginRequest.delete(row);
    }

    ctx.db.deviceLoginRequest.insert({
      id: ctx.newUuidV4(),
      organizationId,
      deviceId,
      nonce,
      status: 'pending',
      memberId: undefined,
      intent: undefined,
      createdAt: ctx.timestamp,
      expiresAt: new (ctx.timestamp.constructor as any)(now + DEVICE_LOGIN_TTL_MICROS),
    });
  }
);

export const approveDeviceLogin = spacetimedb.reducer(
  {
    nonce: t.string(),
    intent: t.string(), // "login" | "punch-in" | "punch-out"
  },
  (ctx, { nonce, intent }) => {
    const row = [...ctx.db.deviceLoginRequest.byNonce.filter(nonce)][0];
    if (!row) throw new SenderError('QR code not recognised');
    if (row.status !== 'pending') throw new SenderError('QR code already used');
    if (row.expiresAt.microsSinceUnixEpoch < ctx.timestamp.microsSinceUnixEpoch) {
      ctx.db.deviceLoginRequest.delete(row);
      ctx.db.deviceLoginRequest.insert({ ...row, status: 'expired' });
      throw new SenderError('QR code expired — refresh it on the store device');
    }
    if (intent !== 'login' && intent !== 'punch-in' && intent !== 'punch-out') {
      throw new SenderError('Invalid intent: ' + intent);
    }

    const member = findActiveMember(ctx, row.organizationId) as unknown as {
      id: { toString(): string };
      punchInCode?: string;
    };

    if (intent === 'punch-in' || intent === 'punch-out') {
      applyPunch(ctx, row.organizationId, member, intent === 'punch-in' ? 'in' : 'out');
    }

    ctx.db.deviceLoginRequest.delete(row);
    ctx.db.deviceLoginRequest.insert({
      ...row,
      status: 'approved',
      memberId: member.id.toString(),
      intent,
    });
  }
);

export const consumeDeviceLogin = spacetimedb.reducer(
  {
    id: t.uuid(),
  },
  (ctx, { id }) => {
    // `id` already arrives as a uuid here, so this is a direct PK lookup.
    const row = ctx.db.deviceLoginRequest.id.find(id);
    if (!row) throw new SenderError('Request not found');
    findActiveMember(ctx, row.organizationId);
    ctx.db.deviceLoginRequest.delete(row);
    ctx.db.deviceLoginRequest.insert({ ...row, status: 'consumed' });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

function defaultSupplierInboundPrefix(organizationId: string): string {
  const compact = organizationId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `m-${(compact || 'store').slice(0, 8)}`;
}

function normalizeSupplierInboundPrefix(prefix: string): string {
  const raw = prefix.trim().toLowerCase();
  const local = raw.includes('@') ? raw.split('@')[0] : raw;
  const withoutSuffix = local.endsWith('-inbound') ? local.slice(0, -'-inbound'.length) : local;
  return withoutSuffix
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function validateSupplierInboundPrefix(prefix: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(prefix)) {
    throw new SenderError('Supplier inbox prefix must be 3-32 characters: lowercase letters, numbers, and hyphens only.');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function settingsSupplierInboundPrefix(settings: any | undefined, organizationId: string): string {
  return settings?.supplierInboundPrefix
    ? normalizeSupplierInboundPrefix(settings.supplierInboundPrefix)
    : defaultSupplierInboundPrefix(organizationId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function supplierInboundPrefixAvailable(ctx: any, organizationId: string, prefix: string): boolean {
  for (const org of ctx.db.organization.iter()) {
    const orgId = org.id.toString();
    if (orgId === organizationId) continue;
    const settings = [...ctx.db.settings.byOrganizationId.filter(orgId)][0];
    if (settingsSupplierInboundPrefix(settings, orgId) === prefix) return false;
  }
  return true;
}

/** Update org settings. Owner/manager with settings.view permission only. */
export const updateSettings = spacetimedb.reducer(
  {
    organizationId: t.string(),
    businessName: t.option(t.string()),
    businessType: t.option(t.string()),
    timezone: t.string(),
    paymentTaxRate: t.number(),
    paymentCurrency: t.string(),
    locationLatitude: t.option(t.string()),
    locationLongitude: t.option(t.string()),
    googlePlacesId: t.option(t.string()),
  },
  (ctx, { organizationId, businessName, businessType, timezone, paymentTaxRate, paymentCurrency, locationLatitude, locationLongitude, googlePlacesId }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.settings?.view) unauthorized('No settings permission');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');

    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      businessName,
      businessType,
      timezone,
      paymentTaxRate,
      paymentCurrency,
      locationLatitude,
      locationLongitude,
      googlePlacesId,
      updatedAt: ctx.timestamp,
    });
  }
);

export const setSupplierInboundPrefix = spacetimedb.reducer(
  {
    organizationId: t.string(),
    prefix: t.string(),
  },
  (ctx, { organizationId, prefix }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.settings?.view) unauthorized('No settings permission');

    const normalized = normalizeSupplierInboundPrefix(prefix);
    validateSupplierInboundPrefix(normalized);
    if (!supplierInboundPrefixAvailable(ctx, organizationId, normalized)) {
      throw new SenderError('Supplier inbox prefix is already taken.');
    }

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');

    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      supplierInboundPrefix: normalized,
      updatedAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTORY REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addInventoryItem = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    category: t.string(),
    currentStock: t.number(),
    minStock: t.number(),
    maxStock: t.number(),
    unit: t.string(),
    costPerUnit: t.number(),
    supplier: t.string(),
    lastRestocked: t.string(),
    minOrderQty: t.option(t.number()),
    unitsPerCase: t.option(t.number()),
    description: t.option(t.string()),
    unitContentAmount: t.option(t.number()),
    unitContentUnit: t.option(t.string()),
    retailEnabled: t.option(t.bool()),
    retailPrice: t.option(t.number()),
    retailDescription: t.option(t.string()),
    retailImageUrl: t.option(t.string()),
    retailUsageQty: t.option(t.number()),
    expirationBatches: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.inventory?.edit) unauthorized('No inventory edit permission');

    ctx.db.inventoryItem.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      name: args.name,
      category: args.category,
      currentStock: args.currentStock,
      minStock: args.minStock,
      maxStock: args.maxStock,
      unit: args.unit,
      costPerUnit: args.costPerUnit,
      costPerUnitCents: toCents(args.costPerUnit),
      supplier: args.supplier,
      lastRestocked: args.lastRestocked,
      lossRate: 0,
      squareItemId: undefined,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
      minOrderQty: args.minOrderQty,
      unitsPerCase: args.unitsPerCase,
      description: args.description,
      unitContentAmount: args.unitContentAmount,
      unitContentUnit: args.unitContentUnit,
      retailEnabled: args.retailEnabled,
      retailPrice: args.retailPrice,
      retailPriceCents: toCentsOpt(args.retailPrice),
      retailDescription: args.retailDescription,
      retailImageUrl: args.retailImageUrl,
      retailUsageQty: args.retailUsageQty,
      expirationDate: undefined,
      expirationBatches: args.expirationBatches,
    });
  }
);

export const updateInventoryItem = spacetimedb.reducer(
  {
    organizationId: t.string(),
    itemId: t.string(),
    name: t.string(),
    category: t.string(),
    currentStock: t.number(),
    minStock: t.number(),
    maxStock: t.number(),
    unit: t.string(),
    costPerUnit: t.number(),
    supplier: t.string(),
    lastRestocked: t.string(),
    lossRate: t.number(),
    minOrderQty: t.option(t.number()),
    unitsPerCase: t.option(t.number()),
    description: t.option(t.string()),
    unitContentAmount: t.option(t.number()),
    unitContentUnit: t.option(t.string()),
    retailEnabled: t.option(t.bool()),
    retailPrice: t.option(t.number()),
    retailDescription: t.option(t.string()),
    retailImageUrl: t.option(t.string()),
    retailUsageQty: t.option(t.number()),
    expirationBatches: t.option(t.string()),
    batchExpirationDate: t.option(t.string()),
    operatorMemberId: t.option(t.string()),
    operatorName: t.option(t.string()),
    stockNote: t.option(t.string()),
    evidenceUrls: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.inventory?.edit) unauthorized('No inventory edit permission');

    const item = findItemInOrg(ctx.db.inventoryItem, args.organizationId, args.itemId);
    const wasAboveMin = item.currentStock > item.minStock;
    const stockDelta = args.currentStock - item.currentStock;
    ctx.db.inventoryItem.delete(item);
    ctx.db.inventoryItem.insert({
      ...item,
      name: args.name,
      category: args.category,
      currentStock: args.currentStock,
      minStock: args.minStock,
      maxStock: args.maxStock,
      unit: args.unit,
      costPerUnit: args.costPerUnit,
      costPerUnitCents: toCents(args.costPerUnit),
      supplier: args.supplier,
      lastRestocked: args.lastRestocked,
      lossRate: args.lossRate,
      updatedAt: ctx.timestamp,
      minOrderQty: args.minOrderQty,
      unitsPerCase: args.unitsPerCase,
      description: args.description,
      unitContentAmount: args.unitContentAmount,
      unitContentUnit: args.unitContentUnit,
      retailEnabled: args.retailEnabled,
      retailPrice: args.retailPrice,
      retailPriceCents: toCentsOpt(args.retailPrice),
      retailDescription: args.retailDescription,
      retailImageUrl: args.retailImageUrl,
      retailUsageQty: args.retailUsageQty,
      expirationDate: undefined,
      expirationBatches: args.expirationBatches,
    });

    if (stockDelta !== 0) {
      const stockNote = args.stockNote?.trim();
      ctx.db.inventoryTransaction.insert({
        id: ctx.newUuidV4(),
        organizationId: args.organizationId,
        itemId: args.itemId,
        itemName: args.name,
        type: stockDelta > 0 ? 'in' : 'adjustment',
        quantity: Math.abs(stockDelta),
        note: stockNote && stockNote.length > 0
          ? stockNote
          : stockDelta > 0 ? 'Stock added via edit' : 'Stock adjusted via edit',
        date: args.lastRestocked,
        createdAt: ctx.timestamp,
        operatorMemberId: args.operatorMemberId,
        operatorName: args.operatorName,
        evidenceUrls: args.evidenceUrls,
        expirationDate: undefined,
        batchExpirationDate: args.batchExpirationDate,
      });
    }

    if (wasAboveMin && args.currentStock <= args.minStock) {
      notifyOrgMembers(ctx, args.organizationId, 'inventory_low',
        `Low stock: ${args.name}`,
        `${args.name} is at ${args.currentStock} ${item.unit} (min: ${args.minStock})`,
        '/inventory');
    }
  }
);

export const deleteInventoryItem = spacetimedb.reducer(
  { organizationId: t.string(), itemId: t.string() },
  (ctx, { organizationId, itemId }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.inventory?.edit) unauthorized('No inventory edit permission');

    const item = findItemInOrg(ctx.db.inventoryItem, organizationId, itemId);
    ctx.db.inventoryItem.delete(item);
  }
);

export const addInventoryTransaction = spacetimedb.reducer(
  {
    organizationId: t.string(),
    itemId: t.option(t.string()),
    itemName: t.string(),
    type: t.string(),
    quantity: t.number(),
    note: t.string(),
    date: t.string(),
    operatorMemberId: t.option(t.string()),
    operatorName: t.option(t.string()),
    evidenceUrls: t.option(t.string()),
    batchExpirationDate: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.inventory?.edit) unauthorized('No inventory edit permission');

    ctx.db.inventoryTransaction.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      itemId: args.itemId,
      itemName: args.itemName,
      type: args.type,
      quantity: args.quantity,
      note: args.note,
      date: args.date,
      createdAt: ctx.timestamp,
      operatorMemberId: args.operatorMemberId,
      operatorName: args.operatorName,
      evidenceUrls: args.evidenceUrls,
      expirationDate: undefined,
      batchExpirationDate: args.batchExpirationDate,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SALES REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addSalesRecord = spacetimedb.reducer(
  {
    organizationId: t.string(),
    date: t.string(),
    hour: t.option(t.i32()),
    actual: t.number(),
    predicted: t.option(t.number()),
    weather: t.option(t.string()),
    footTraffic: t.option(t.i32()),
    isHoliday: t.bool(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.sales?.view) unauthorized('No sales permission');

    ctx.db.salesRecord.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      date: args.date,
      hour: args.hour,
      actual: args.actual,
      predicted: args.predicted,
      weather: args.weather,
      footTraffic: args.footTraffic,
      isHoliday: args.isHoliday,
      squareOrderIds: '[]',
      createdAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// STAFFING REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addStaffMember = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    role: t.string(),
    hourlyRate: t.number(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.staffing?.edit) unauthorized('No staffing edit permission');

    ctx.db.staffMember.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      name: args.name,
      role: args.role,
      hourlyRate: args.hourlyRate,
      hourlyRateCents: toCents(args.hourlyRate),
      availability: '[]',
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateStaffMember = spacetimedb.reducer(
  {
    organizationId: t.string(),
    staffMemberId: t.string(),
    name: t.string(),
    role: t.string(),
    hourlyRate: t.number(),
    availability: t.string(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.staffing?.edit) unauthorized('No staffing edit permission');

    const sm = findItemInOrg(ctx.db.staffMember, args.organizationId, args.staffMemberId);
    ctx.db.staffMember.delete(sm);
    ctx.db.staffMember.insert({
      ...sm,
      name: args.name,
      role: args.role,
      hourlyRate: args.hourlyRate,
      hourlyRateCents: toCents(args.hourlyRate),
      availability: args.availability,
      updatedAt: ctx.timestamp,
    });
  }
);

export const deleteStaffMember = spacetimedb.reducer(
  { organizationId: t.string(), staffMemberId: t.string() },
  (ctx, { organizationId, staffMemberId }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.staffing?.edit) unauthorized('No staffing edit permission');

    const sm = findItemInOrg(ctx.db.staffMember, organizationId, staffMemberId);
    ctx.db.staffMember.delete(sm);
  }
);

// Resolve `staffName` to a real team-member row, or throw. Used by addShift
// and updateShift so the AI (or a misbehaving client) can't write a shift for
// a person who doesn't exist on the team. The personnel page sources the team
// roster from `org_member` (displayName), so that's the primary lookup; we
// fall back to the legacy `staff_member` table for older orgs that haven't
// migrated. Match is case-insensitive on the trimmed name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveStaffForShift(
  ctx: any,
  organizationId: string,
  staffName: string,
  memberId: string | undefined,
): { memberId: string; name: string } {
  const wantedName = (staffName ?? '').trim();
  const wantedLower = wantedName.toLowerCase();

  // Primary: org_member rows (active only — disabled members can't take shifts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgRows = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
    .filter((m: any) => m.status === 'active');
  if (memberId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = orgRows.find((m: any) => m.id.toString() === memberId);
    if (byId) return { memberId: byId.id.toString(), name: byId.displayName };
  }
  if (wantedName) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byName = orgRows.find((m: any) => (m.displayName ?? '').trim().toLowerCase() === wantedLower);
    if (byName) return { memberId: byName.id.toString(), name: byName.displayName };
  }

  // Legacy fallback: staff_member table (pre-personnel-merge orgs).
  const staffRows = [...ctx.db.staffMember.byOrganizationId.filter(organizationId)];
  if (memberId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = staffRows.find((m: any) => m.id.toString() === memberId);
    if (byId) return { memberId: byId.id.toString(), name: byId.name };
  }
  if (!wantedName) throw new SenderError('staffName is required');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = staffRows.find((m: any) => m.name.trim().toLowerCase() === wantedLower);
  if (match) return { memberId: match.id.toString(), name: match.name };

  throw new SenderError(
    `Unknown staffName "${wantedName}" — not on the team roster. Add the person first or use an exact name.`,
  );
}

export const addShift = spacetimedb.reducer(
  {
    organizationId: t.string(),
    memberId: t.option(t.string()),
    staffName: t.string(),
    staffRole: t.option(t.string()),
    staffRoles: t.string(),
    date: t.string(),
    shiftType: t.string(),
    startTime: t.string(),
    endTime: t.string(),
    predictedDemand: t.string(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.staffing?.edit) unauthorized('No staffing edit permission');

    // Every shift must be tied to at least one role — otherwise it can't be
    // staffed against the day's role checklist or surfaced under a role view.
    // We also verify each role NAME exists in staff_role for this org so the
    // AI (or a misbehaving client) can't write phantom roles that won't render
    // on the personnel page.
    let rolesParsed: unknown[];
    try { rolesParsed = JSON.parse(args.staffRoles); } catch { rolesParsed = []; }
    const rolesRequested = (Array.isArray(rolesParsed) ? rolesParsed : [])
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.trim())
      .filter((r) => r !== '');
    if (rolesRequested.length === 0) {
      throw new SenderError('At least one role is required for a shift (pass staffRoles, e.g. ["barista"]).');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgRoles = [...ctx.db.staffRole.byOrganizationId.filter(args.organizationId)] as any[];
    const orgRoleByLower = new Map<string, string>(
      orgRoles.map((r) => [String(r.name).trim().toLowerCase(), String(r.name)]),
    );
    const canonicalRoles: string[] = [];
    const missing: string[] = [];
    for (const rn of rolesRequested) {
      const canonical = orgRoleByLower.get(rn.toLowerCase());
      if (canonical) canonicalRoles.push(canonical);
      else missing.push(rn);
    }
    if (missing.length > 0) {
      const valid = orgRoles.map((r) => String(r.name)).join(', ') || '(no roles defined yet)';
      throw new SenderError(
        `Unknown role(s) ${JSON.stringify(missing)} — use one of: ${valid}. Create the role first via addRole if it should exist.`,
      );
    }

    const resolved = resolveStaffForShift(ctx, args.organizationId, args.staffName, args.memberId);

    // Store the canonical (case-correct) role names so the personnel page's
    // name match always succeeds. Also default the legacy single `staffRole`
    // column to the first canonical role if the caller didn't pass one.
    const canonicalRolesJson = JSON.stringify(canonicalRoles);
    const legacyStaffRole = args.staffRole ?? canonicalRoles[0];

    ctx.db.shift.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      memberId: resolved.memberId,
      staffName: resolved.name,
      staffRole: legacyStaffRole,
      staffRoles: canonicalRolesJson,
      date: args.date,
      shiftType: args.shiftType,
      startTime: args.startTime,
      endTime: args.endTime,
      predictedDemand: args.predictedDemand,
      createdAt: ctx.timestamp,
    });
  }
);

export const updateShift = spacetimedb.reducer(
  {
    organizationId: t.string(),
    shiftId: t.string(),
    memberId: t.option(t.string()),
    staffName: t.string(),
    staffRole: t.option(t.string()),
    staffRoles: t.string(),
    date: t.string(),
    shiftType: t.string(),
    startTime: t.string(),
    endTime: t.string(),
    predictedDemand: t.string(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.staffing?.edit) unauthorized('No staffing edit permission');

    const shift = findItemInOrg(ctx.db.shift, args.organizationId, args.shiftId);

    // If staffName changed (or no memberId was supplied), re-resolve against
    // the team roster. Same guard as addShift — keeps ghost names out of the
    // shift table.
    const resolved = resolveStaffForShift(
      ctx,
      args.organizationId,
      args.staffName || shift.staffName,
      args.memberId ?? shift.memberId ?? undefined,
    );

    ctx.db.shift.delete(shift);
    ctx.db.shift.insert({
      ...shift,
      memberId: resolved.memberId,
      staffName: resolved.name,
      staffRole: args.staffRole,
      staffRoles: args.staffRoles,
      date: args.date,
      shiftType: args.shiftType,
      startTime: args.startTime,
      endTime: args.endTime,
      predictedDemand: args.predictedDemand,
    });
  }
);

export const deleteShift = spacetimedb.reducer(
  { organizationId: t.string(), shiftId: t.string() },
  (ctx, { organizationId, shiftId }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.staffing?.edit) unauthorized('No staffing edit permission');

    const shift = findItemInOrg(ctx.db.shift, organizationId, shiftId);
    ctx.db.shift.delete(shift);
  }
);

// ─── Staff Roles ──────────────────────────────────────────────────────────────

// org_member.role holds "owner" | "manager" | "staff" or a staff_role name.
const BUILTIN_MEMBER_ROLES = new Set(['owner', 'manager', 'staff']);

/** Staff roles are looked up by case-insensitive name across the app, so two
 *  rows with the same name collapse into one and edit/delete the wrong row. */
function assertUniqueStaffRoleName(ctx: any, organizationId: string, name: string, exceptRoleId?: string) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) throw new SenderError('Role name is required');
  for (const r of ctx.db.staffRole.byOrganizationId.filter(organizationId)) {
    if (exceptRoleId && r.id.toString() === exceptRoleId) continue;
    if (String(r.name).trim().toLowerCase() === wanted) {
      throw new SenderError(`A role named "${name.trim()}" already exists`);
    }
  }
}

/** Point members holding staff-role `fromName` at `toName`. Built-in org
 *  roles (owner / manager / staff) are never rewritten, members are never
 *  moved ONTO owner/manager, and nothing moves while another staff_role row
 *  (legacy duplicate) still carries the same name. */
function reassignMembersRole(ctx: any, organizationId: string, roleId: string, fromName: string, toName: string) {
  const from = fromName.trim().toLowerCase();
  const to = toName.trim().toLowerCase();
  if (!from || BUILTIN_MEMBER_ROLES.has(from)) return;
  if (to === 'owner' || to === 'manager') return;
  for (const r of ctx.db.staffRole.byOrganizationId.filter(organizationId)) {
    if (r.id.toString() !== roleId && String(r.name).trim().toLowerCase() === from) return;
  }
  for (const m of [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]) {
    if (m.role === 'owner') continue;
    if (String(m.role).trim().toLowerCase() !== from) continue;
    ctx.db.orgMember.delete(m);
    ctx.db.orgMember.insert({ ...m, role: toName });
  }
}

export const addStaffRole = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    color: t.string(),
    icon: t.string(),
    description: t.string(),
    permissions: t.string(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    assertUniqueStaffRoleName(ctx, args.organizationId, args.name);

    ctx.db.staffRole.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      name: args.name,
      color: args.color,
      icon: args.icon,
      description: args.description,
      permissions: args.permissions,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateStaffRole = spacetimedb.reducer(
  {
    organizationId: t.string(),
    roleId: t.string(),
    name: t.string(),
    color: t.string(),
    icon: t.string(),
    description: t.string(),
    permissions: t.string(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const role = findItemInOrg(ctx.db.staffRole, args.organizationId, args.roleId);
    const oldName = String(role.name);
    if (!args.name.trim()) throw new SenderError('Role name is required');
    if (oldName.trim().toLowerCase() !== args.name.trim().toLowerCase()) {
      // Renaming onto a built-in org role would move every holder to it
      // (e.g. "Cashier" → "Owner" promotes all cashiers).
      if (BUILTIN_MEMBER_ROLES.has(args.name.trim().toLowerCase())) {
        throw new SenderError('This role name is reserved');
      }
      assertUniqueStaffRoleName(ctx, args.organizationId, args.name, args.roleId);
    }
    ctx.db.staffRole.delete(role);
    ctx.db.staffRole.insert({
      ...role,
      name: args.name,
      color: args.color,
      icon: args.icon,
      description: args.description,
      permissions: args.permissions,
      updatedAt: ctx.timestamp,
    });
    // Members reference the role by name — carry them over to the new name.
    if (oldName !== args.name) reassignMembersRole(ctx, args.organizationId, args.roleId, oldName, args.name);
  }
);

export const deleteStaffRole = spacetimedb.reducer(
  { organizationId: t.string(), roleId: t.string() },
  (ctx, { organizationId, roleId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const role = findItemInOrg(ctx.db.staffRole, organizationId, roleId);

    // Cascade: drop the role's tasks so they don't appear in the daily checklist
    // as ghost entries under a missing role.
    for (const task of [...ctx.db.roleTask.byRoleId.filter(roleId)]) {
      if (task.organizationId === organizationId) {
        ctx.db.roleTask.delete(task);
      }
    }

    // Members holding this role fall back to plain staff instead of pointing
    // at a role that no longer exists.
    reassignMembersRole(ctx, organizationId, roleId, String(role.name), 'staff');
    ctx.db.staffRole.delete(role);
  }
);

// ─── Availability ─────────────────────────────────────────────────────────────

export const upsertAvailability = spacetimedb.reducer(
  {
    organizationId: t.string(),
    existingId: t.option(t.string()),
    type: t.string(),
    startDate: t.option(t.string()),
    endDate: t.option(t.string()),
    days: t.string(),
    dayTimes: t.string(),
    status: t.string(),
    fullDay: t.bool(),
    startTime: t.option(t.string()),
    endTime: t.option(t.string()),
    comments: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    if (args.existingId) {
      const existing = [...ctx.db.staffAvailability.byUserId.filter(ctx.sender)]
        .find(a => a.id.toString() === args.existingId);
      if (existing) {
        ctx.db.staffAvailability.delete(existing);
        ctx.db.staffAvailability.insert({
          ...existing,
          type: args.type,
          startDate: args.startDate,
          endDate: args.endDate,
          days: args.days,
          dayTimes: args.dayTimes,
          status: args.status,
          fullDay: args.fullDay,
          startTime: args.startTime,
          endTime: args.endTime,
          comments: args.comments,
        });
        return;
      }
    }

    ctx.db.staffAvailability.insert({
      id: ctx.newUuidV4(),
      userId: ctx.sender,
      organizationId: args.organizationId,
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      days: args.days,
      dayTimes: args.dayTimes,
      status: args.status,
      fullDay: args.fullDay,
      startTime: args.startTime,
      endTime: args.endTime,
      comments: args.comments,
      createdAt: ctx.timestamp,
    });
  }
);

// ─── Time Off Requests ────────────────────────────────────────────────────────

export const createTimeOffRequest = spacetimedb.reducer(
  {
    organizationId: t.string(),
    startDate: t.string(),
    endDate: t.string(),
    fullDays: t.bool(),
    startTime: t.option(t.string()),
    endTime: t.option(t.string()),
    comments: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    const member = findActiveMember(ctx, args.organizationId);
    ctx.db.timeOffRequest.insert({
      id: ctx.newUuidV4(),
      userId: ctx.sender,
      organizationId: args.organizationId,
      startDate: args.startDate,
      endDate: args.endDate,
      fullDays: args.fullDays,
      startTime: args.fullDays ? undefined : args.startTime,
      endTime: args.fullDays ? undefined : args.endTime,
      comments: args.comments,
      status: 'pending',
      reviewedBy: undefined,
      reviewedAt: undefined,
      createdAt: ctx.timestamp,
    });

    const memberName = (member as { displayName?: string }).displayName || 'A team member';
    const managers = [...ctx.db.orgMember.byOrganizationId.filter(args.organizationId)]
      .filter((m: { role: string; status: string }) => (m.role === 'owner' || m.role === 'manager') && m.status === 'active');
    for (const mgr of managers) {
      if ((mgr as { userId: { toString(): string } }).userId.toString() === ctx.sender.toString()) continue;
      ctx.db.notification.insert({
        id: ctx.newUuidV4(),
        organizationId: args.organizationId,
        targetId: (mgr as { userId: typeof ctx.sender }).userId,
        type: 'time_off',
        title: 'Time off request',
        body: `${memberName} requested time off ${args.startDate} – ${args.endDate}`,
        link: '/staffing',
        read: false,
        createdAt: ctx.timestamp,
      });
    }
  }
);

export const updateTimeOffStatus = spacetimedb.reducer(
  {
    organizationId: t.string(),
    requestId: t.string(),
    status: t.string(),
  },
  (ctx, { organizationId, requestId, status }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const req = [...ctx.db.timeOffRequest.byOrganizationId.filter(organizationId)]
      .find(r => r.id.toString() === requestId);
    if (!req) throw new SenderError('Request not found');

    ctx.db.timeOffRequest.delete(req);
    ctx.db.timeOffRequest.insert({
      ...req,
      status,
      reviewedBy: member.id.toString(),
      reviewedAt: ctx.timestamp,
    });

    ctx.db.notification.insert({
      id: ctx.newUuidV4(),
      organizationId,
      targetId: req.userId,
      type: 'time_off',
      title: `Time off ${status}`,
      body: `Your time off request (${req.startDate} – ${req.endDate}) has been ${status}`,
      link: '/staffing',
      read: false,
      createdAt: ctx.timestamp,
    });
  }
);

// ─── Shift Trades ─────────────────────────────────────────────────────────────

export const createShiftTrade = spacetimedb.reducer(
  {
    organizationId: t.string(),
    shiftId: t.string(),
    requesterId: t.string(),
    broadcastToAll: t.bool(),
    targetId: t.string(),
    targetShiftId: t.option(t.string()),
    type: t.string(),
    comments: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    ctx.db.shiftTrade.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      shiftId: args.shiftId,
      requesterId: args.requesterId,
      targetId: args.targetId,
      targetShiftId: args.targetShiftId,
      type: args.type,
      status: 'pending',
      managerApproved: false,
      managerId: undefined,
      comments: args.comments,
      createdAt: ctx.timestamp,
      broadcastToAll: args.broadcastToAll,
      acceptedById: undefined,
    });

    const requester = [...ctx.db.orgMember.byOrganizationId.filter(args.organizationId)]
      .find((m: { id: { toString(): string } }) => m.id.toString() === args.requesterId);
    const requesterName = requester ? (requester as { displayName: string }).displayName : 'A team member';

    if (args.broadcastToAll) {
      notifyOrgMembers(ctx, args.organizationId, 'shift_trade',
        `Shift ${args.type} request`,
        `${requesterName} is looking for someone to ${args.type === 'cover' ? 'cover' : 'trade'} their shift`,
        '/staffing', ctx.sender);
    } else if (args.targetId) {
      const target = [...ctx.db.orgMember.byOrganizationId.filter(args.organizationId)]
        .find((m: { id: { toString(): string } }) => m.id.toString() === args.targetId);
      if (target) {
        ctx.db.notification.insert({
          id: ctx.newUuidV4(),
          organizationId: args.organizationId,
          targetId: (target as { userId: { toString(): string } }).userId as unknown as typeof ctx.sender,
          type: 'shift_trade',
          title: `Shift ${args.type} request`,
          body: `${requesterName} wants to ${args.type === 'cover' ? 'have you cover' : 'trade'} a shift with you`,
          link: '/staffing',
          read: false,
          createdAt: ctx.timestamp,
        });
      }
    }
  }
);

export const updateShiftTradeStatus = spacetimedb.reducer(
  {
    organizationId: t.string(),
    tradeId: t.string(),
    status: t.string(),
  },
  (ctx, { organizationId, tradeId, status }) => {
    const member = findActiveMember(ctx, organizationId);

    const trade = [...ctx.db.shiftTrade.byOrganizationId.filter(organizationId)]
      .find(t => t.id.toString() === tradeId);
    if (!trade) throw new SenderError('Trade not found');

    const canEditStaffing = member.role === 'owner' ||
      (() => { try { const p = JSON.parse(member.permissions); return p?.staffing?.edit === true; } catch { return false; } })();
    const isParticipant =
      trade.requesterId === member.id.toString() ||
      (trade.targetId !== '' && trade.targetId === member.id.toString());
    const canAcceptBroadcast = trade.broadcastToAll && trade.requesterId !== member.id.toString();

    if (!canEditStaffing && !isParticipant && !canAcceptBroadcast) unauthorized('Not a participant');

    const isApprover = canEditStaffing && status === 'accepted' && trade.status === 'accepted';
    const isStaffAccepting = !canEditStaffing && status === 'accepted';

    ctx.db.shiftTrade.delete(trade);
    ctx.db.shiftTrade.insert({
      ...trade,
      status,
      acceptedById: isStaffAccepting ? member.id.toString() : trade.acceptedById,
      managerApproved: isApprover,
      managerId: isApprover ? member.id.toString() : trade.managerId,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENTS REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createPayment = spacetimedb.reducer(
  {
    organizationId: t.string(),
    amount: t.number(),
    currency: t.string(),
    method: t.string(),
    customerName: t.option(t.string()),
    notes: t.option(t.string()),
    items: t.option(t.string()),
    taxAmount: t.number(),
    discountAmount: t.number(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    ctx.db.payment.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      userId: ctx.sender.toString(),
      orderId: undefined,
      amount: args.amount,
      amountCents: toCents(args.amount),
      currency: args.currency,
      method: args.method,
      status: 'completed',
      processorId: undefined,
      processorResponse: undefined,
      customerName: args.customerName,
      notes: args.notes,
      items: args.items,
      taxAmount: args.taxAmount,
      taxAmountCents: toCents(args.taxAmount),
      discountAmount: args.discountAmount,
      discountAmountCents: toCents(args.discountAmount),
      refundAmount: undefined,
      refundAmountCents: undefined,
      refundReason: undefined,
      refundedAt: undefined,
      createdAt: ctx.timestamp,
    });
  }
);

export const refundPayment = spacetimedb.reducer(
  {
    organizationId: t.string(),
    paymentId: t.string(),
    refundAmount: t.number(),
    refundReason: t.string(),
  },
  (ctx, { organizationId, paymentId, refundAmount, refundReason }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required to refund');

    const payment = [...ctx.db.payment.byOrganizationId.filter(organizationId)]
      .find(p => p.id.toString() === paymentId);
    if (!payment) throw new SenderError('Payment not found');
    if (payment.status !== 'completed') throw new SenderError('Only completed payments can be refunded');

    ctx.db.payment.delete(payment);
    ctx.db.payment.insert({
      ...payment,
      status: 'refunded',
      refundAmount,
      refundAmountCents: toCents(refundAmount),
      refundReason,
      refundedAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createConversation = spacetimedb.reducer(
  {
    organizationId: t.string(),
    type: t.string(),
    name: t.option(t.string()),
    memberUserIds: t.string(),  // JSON-encoded Identity[] hex strings
  },
  (ctx, { organizationId, type, name, memberUserIds }) => {
    const member = findActiveMember(ctx, organizationId);

    const convId = ctx.newUuidV4();
    ctx.db.chatConversation.insert({
      id: convId,
      organizationId,
      type,
      name,
      createdBy: member.id.toString(),
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
      merchivaEnabled: undefined,
    });

    const senderHex = ctx.sender.toString();
    const requested: string[] = memberUserIds ? JSON.parse(memberUserIds) : [];
    const allHex = Array.from(new Set([senderHex, ...requested]));

    for (const hex of allHex) {
      ctx.db.chatMember.insert({
        id: ctx.newUuidV4(),
        conversationId: convId.toString(),
        userId: new Identity(hex),
        joinedAt: ctx.timestamp,
      });
    }
  }
);

export const sendMessage = spacetimedb.reducer(
  {
    conversationId: t.string(),
    content: t.string(),
    replyToId: t.option(t.uuid()),
    attachmentUrl: t.option(t.string()),
    attachmentType: t.option(t.string()),
    attachmentName: t.option(t.string()),
    voiceTranscript: t.option(t.string()),
  },
  (ctx, { conversationId, content, replyToId, attachmentUrl, attachmentType, attachmentName, voiceTranscript }) => {
    // Verify sender is in the conversation
    const isMember = [...ctx.db.chatMember.byUserId.filter(ctx.sender)]
      .some(m => m.conversationId === conversationId);
    if (!isMember) unauthorized('Not a conversation member');

    ctx.db.chatMessage.insert({
      id: ctx.newUuidV4(),
      conversationId,
      senderId: ctx.sender,
      content,
      createdAt: ctx.timestamp,
      replyToId,
      attachmentUrl,
      attachmentType,
      attachmentName,
      isMerchiva: undefined,
      voiceTranscript,
    });

    // Bump conversation updatedAt
    const conv = findById(ctx.db.chatConversation, conversationId);
    if (conv) {
      ctx.db.chatConversation.delete(conv);
      ctx.db.chatConversation.insert({ ...conv, updatedAt: ctx.timestamp });
    }

    // Fan out notification rows for every other member of the conversation.
    // The client (web push) and Tauri bridge both subscribe to this table and
    // surface OS-level alerts when a row arrives for the local identity.
    if (conv) {
      const senderName = [...ctx.db.orgMember.byUserId.filter(ctx.sender)]
        .find(m => m.organizationId === conv.organizationId)?.displayName ?? 'New message';
      const preview = content.length > 140 ? content.slice(0, 137) + '...' : content;
      const body = (attachmentUrl && !content) ? '[attachment]' : preview;

      const members = [...ctx.db.chatMember.byConversationId.filter(conversationId)];
      for (const m of members) {
        if (m.userId.toString() === ctx.sender.toString()) continue;
        ctx.db.notification.insert({
          id: ctx.newUuidV4(),
          organizationId: conv.organizationId,
          targetId: m.userId,
          type: 'team',
          title: senderName,
          body,
          link: '/manager/channel',
          read: false,
          createdAt: ctx.timestamp,
        });
      }
    }
  }
);

// Toggle whether Mr. Merchiva participates in a conversation. Any member of the
// conversation may invite/remove him. Only meaningful for group chats.
export const setConversationMerchiva = spacetimedb.reducer(
  {
    conversationId: t.string(),
    enabled: t.bool(),
  },
  (ctx, { conversationId, enabled }) => {
    const isMember = [...ctx.db.chatMember.byUserId.filter(ctx.sender)]
      .some(m => m.conversationId === conversationId);
    if (!isMember) unauthorized('Not a conversation member');

    const conv = findById(ctx.db.chatConversation, conversationId);
    if (!conv) return;
    ctx.db.chatConversation.delete(conv);
    ctx.db.chatConversation.insert({
      ...conv,
      merchivaEnabled: enabled ? true : undefined,
      updatedAt: ctx.timestamp,
    });
  }
);

// Post a Mr. Merchiva reply into a conversation. There's no server identity
// yet, so the Next.js API route calls this with the triggering user's token —
// the row is therefore inserted under that user's identity but flagged
// isMerchiva=true so clients render it as the bot. Requires the conversation to
// have Merchiva enabled and the caller to be a member.
export const sendMerchivaMessage = spacetimedb.reducer(
  {
    conversationId: t.string(),
    content: t.string(),
  },
  (ctx, { conversationId, content }) => {
    const isMember = [...ctx.db.chatMember.byUserId.filter(ctx.sender)]
      .some(m => m.conversationId === conversationId);
    if (!isMember) unauthorized('Not a conversation member');

    const conv = findById(ctx.db.chatConversation, conversationId);
    if (!conv || conv.merchivaEnabled !== true) {
      unauthorized('Mr. Merchiva is not in this conversation');
      return;
    }

    ctx.db.chatMessage.insert({
      id: ctx.newUuidV4(),
      conversationId,
      senderId: ctx.sender,
      content,
      createdAt: ctx.timestamp,
      replyToId: undefined,
      attachmentUrl: undefined,
      attachmentType: undefined,
      attachmentName: undefined,
      isMerchiva: true,
      voiceTranscript: undefined,
    });

    ctx.db.chatConversation.delete(conv);
    ctx.db.chatConversation.insert({ ...conv, updatedAt: ctx.timestamp });

    // Notify every member except whoever triggered the reply.
    const preview = content.length > 140 ? content.slice(0, 137) + '...' : content;
    const members = [...ctx.db.chatMember.byConversationId.filter(conversationId)];
    for (const m of members) {
      if (m.userId.toString() === ctx.sender.toString()) continue;
      ctx.db.notification.insert({
        id: ctx.newUuidV4(),
        organizationId: conv.organizationId,
        targetId: m.userId,
        type: 'team',
        title: 'Mr. Merchiva',
        body: preview,
        link: '/manager/channel',
        read: false,
        createdAt: ctx.timestamp,
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SITE REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createSite = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    slug: t.string(),
    theme: t.string(),
    features: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    const siteId = ctx.newUuidV4();
    ctx.db.site.insert({
      id: siteId,
      organizationId: args.organizationId,
      name: args.name,
      slug: args.slug,
      theme: args.theme,
      features: args.features,
      published: false,
      customDomain: undefined,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateSite = spacetimedb.reducer(
  {
    organizationId: t.string(),
    siteId: t.string(),
    name: t.string(),
    slug: t.string(),
    theme: t.string(),
    features: t.string(),
    published: t.bool(),
    customDomain: t.option(t.string()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    const site = findItemInOrg(ctx.db.site, args.organizationId, args.siteId);
    ctx.db.site.delete(site);
    ctx.db.site.insert({
      ...site,
      name: args.name,
      slug: args.slug,
      theme: args.theme,
      features: args.features,
      published: args.published,
      customDomain: args.customDomain,
      updatedAt: ctx.timestamp,
    });
  }
);

export const deleteSite = spacetimedb.reducer(
  { organizationId: t.string(), siteId: t.string() },
  (ctx, { organizationId, siteId }) => {
    findActiveMember(ctx, organizationId);
    const site = findItemInOrg(ctx.db.site, organizationId, siteId);
    ctx.db.site.delete(site);
  }
);

// ─── Design reducers ──────────────────────────────────────────────────────────

export const createDesign = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    width: t.i32(),
    height: t.i32(),
    html: t.string(),
    preset: t.option(t.string()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    ctx.db.design.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      name: args.name,
      width: args.width,
      height: args.height,
      html: args.html,
      preset: args.preset,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateDesign = spacetimedb.reducer(
  {
    organizationId: t.string(),
    designId: t.string(),
    name: t.string(),
    width: t.i32(),
    height: t.i32(),
    html: t.string(),
    preset: t.option(t.string()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    const design = findItemInOrg(ctx.db.design, args.organizationId, args.designId);
    ctx.db.design.delete(design);
    ctx.db.design.insert({
      ...design,
      name: args.name,
      width: args.width,
      height: args.height,
      html: args.html,
      preset: args.preset,
      updatedAt: ctx.timestamp,
    });
  }
);

export const deleteDesign = spacetimedb.reducer(
  { organizationId: t.string(), designId: t.string() },
  (ctx, { organizationId, designId }) => {
    findActiveMember(ctx, organizationId);
    const design = findItemInOrg(ctx.db.design, organizationId, designId);
    ctx.db.design.delete(design);
  }
);

export const addPage = spacetimedb.reducer(
  {
    organizationId: t.string(),
    siteId: t.string(),
    name: t.string(),
    slug: t.string(),
    elements: t.string(),
    sortOrder: t.i32(),
    html: t.option(t.string()),
    metadata: t.option(t.string()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    ctx.db.sitePage.insert({
      id: ctx.newUuidV4(),
      siteId: args.siteId,
      name: args.name,
      slug: args.slug,
      elements: args.elements,
      sortOrder: args.sortOrder,
      html: args.html,
      metadata: args.metadata,
      createdAt: ctx.timestamp,
    });
  }
);

export const updatePage = spacetimedb.reducer(
  {
    organizationId: t.string(),
    pageId: t.string(),
    name: t.string(),
    slug: t.string(),
    elements: t.string(),
    sortOrder: t.i32(),
    html: t.option(t.string()),
    metadata: t.option(t.string()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    const page = [...ctx.db.sitePage.iter()]
      .find(p => p.id.toString() === args.pageId);
    if (!page) throw new SenderError('Page not found');

    ctx.db.sitePage.delete(page);
    ctx.db.sitePage.insert({
      ...page,
      name: args.name,
      slug: args.slug,
      elements: args.elements,
      sortOrder: args.sortOrder,
      html: args.html,
      metadata: args.metadata,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createMembershipTier = spacetimedb.reducer(
  {
    organizationId: t.string(),
    siteId: t.string(),
    name: t.string(),
    description: t.option(t.string()),
    price: t.number(),
    pricePeriod: t.string(),
    color: t.string(),
    icon: t.string(),
    sortOrder: t.i32(),
    isDefault: t.bool(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    ctx.db.membershipTier.insert({
      id: ctx.newUuidV4(),
      siteId: args.siteId,
      name: args.name,
      description: args.description,
      price: args.price,
      pricePeriod: args.pricePeriod,
      color: args.color,
      icon: args.icon,
      sortOrder: args.sortOrder,
      isDefault: args.isDefault,
      createdAt: ctx.timestamp,
    });
  }
);

export const addPerk = spacetimedb.reducer(
  {
    organizationId: t.string(),
    tierId: t.string(),
    type: t.string(),
    name: t.string(),
    description: t.option(t.string()),
    couponCode: t.option(t.string()),
    discountValue: t.option(t.number()),
    discountType: t.option(t.string()),
    cooldownHours: t.option(t.number()),
    frequency: t.option(t.number()),
    minPurchase: t.option(t.number()),
    sortOrder: t.i32(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    ctx.db.membershipPerk.insert({
      id: ctx.newUuidV4(),
      tierId: args.tierId,
      type: args.type,
      name: args.name,
      description: args.description,
      couponCode: args.couponCode,
      discountValue: args.discountValue,
      discountType: args.discountType,
      cooldownHours: args.cooldownHours,
      frequency: args.frequency,
      minPurchase: args.minPurchase,
      validDays: undefined,
      validHours: undefined,
      active: true,
      sortOrder: args.sortOrder,
      createdAt: ctx.timestamp,
    });
  }
);

export const claimPerk = spacetimedb.reducer(
  {
    perkId: t.string(),
    customerId: t.string(),
    couponCode: t.option(t.string()),
    expiresAt: t.option(t.timestamp()),
  },
  (ctx, args) => {
    ctx.db.perkClaim.insert({
      id: ctx.newUuidV4(),
      perkId: args.perkId,
      customerId: args.customerId,
      claimedAt: ctx.timestamp,
      usedAt: undefined,
      couponCode: args.couponCode,
      expiresAt: args.expiresAt,
    });
  }
);

export const addPoints = spacetimedb.reducer(
  {
    siteId: t.string(),
    customerId: t.string(),
    points: t.i32(),
  },
  (ctx, { siteId, customerId, points }) => {
    const existing = [...ctx.db.customerPoints.byCustomerId.filter(customerId)]
      .find(cp => cp.siteId === siteId);

    if (existing) {
      ctx.db.customerPoints.delete(existing);
      ctx.db.customerPoints.insert({
        ...existing,
        points: existing.points + points,
        lifetimePoints: points > 0 ? existing.lifetimePoints + points : existing.lifetimePoints,
        updatedAt: ctx.timestamp,
      });
    } else {
      ctx.db.customerPoints.insert({
        id: ctx.newUuidV4(),
        customerId,
        siteId,
        points,
        lifetimePoints: Math.max(0, points),
        updatedAt: ctx.timestamp,
      });
    }
  }
);

// ─── Site Customer Registration ───────────────────────────────────────────────

export const registerCustomer = spacetimedb.reducer(
  {
    siteId: t.string(),
    email: t.string(),
    name: t.option(t.string()),
    phone: t.option(t.string()),
  },
  (ctx, args) => {
    const existing = [...ctx.db.siteCustomer.bySiteId.filter(args.siteId)]
      .find(c => c.email === args.email);
    if (existing) return; // idempotent

    ctx.db.siteCustomer.insert({
      id: ctx.newUuidV4(),
      siteId: args.siteId,
      email: args.email,
      name: args.name,
      phone: args.phone,
      createdAt: ctx.timestamp,
    });
  }
);

// ─── Site Orders & Bookings ───────────────────────────────────────────────────

export const createSiteOrder = spacetimedb.reducer(
  {
    siteId: t.string(),
    customerId: t.option(t.string()),
    items: t.string(),
    total: t.number(),
    customerName: t.option(t.string()),
    customerEmail: t.option(t.string()),
    notes: t.option(t.string()),
  },
  (ctx, args) => {
    ctx.db.siteOrder.insert({
      id: ctx.newUuidV4(),
      siteId: args.siteId,
      customerId: args.customerId,
      items: args.items,
      total: args.total,
      status: 'pending',
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      notes: args.notes,
      createdAt: ctx.timestamp,
    });
  }
);

export const createSiteBooking = spacetimedb.reducer(
  {
    siteId: t.string(),
    customerId: t.option(t.string()),
    date: t.string(),
    time: t.string(),
    partySize: t.i32(),
    name: t.string(),
    phone: t.option(t.string()),
    email: t.option(t.string()),
    notes: t.option(t.string()),
  },
  (ctx, args) => {
    // Resolve the owning org so the row can be covered by RLS. site.id is a
    // uuid and args.siteId a string, so this mapping cannot live in SQL.
    const site = findById(ctx.db.site, args.siteId);
    if (!site) throw new SenderError('Site not found');
    ctx.db.siteBooking.insert({
      id: ctx.newUuidV4(),
      organizationId: site.organizationId,
      siteId: args.siteId,
      customerId: args.customerId,
      date: args.date,
      time: args.time,
      partySize: args.partySize,
      name: args.name,
      phone: args.phone,
      email: args.email,
      notes: args.notes,
      status: 'pending',
      createdAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE TASKS REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addRoleTask = spacetimedb.reducer(
  {
    organizationId: t.string(),
    roleId: t.string(),
    title: t.string(),
    description: t.string(),
    startTime: t.option(t.string()),
    endTime: t.option(t.string()),
    sortOrder: t.i32(),
    requiresEvidence: t.bool(),
    notifyChats: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    ctx.db.roleTask.insert({
      id: ctx.newUuidV4(),
      roleId: args.roleId,
      organizationId: args.organizationId,
      orgId: args.organizationId,
      title: args.title,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      sortOrder: args.sortOrder,
      requiresEvidence: args.requiresEvidence,
      notifyChats: args.notifyChats,
      createdAt: ctx.timestamp,
    });
  }
);

export const updateRoleTask = spacetimedb.reducer(
  {
    organizationId: t.string(),
    roleTaskId: t.string(),
    title: t.string(),
    description: t.string(),
    startTime: t.option(t.string()),
    endTime: t.option(t.string()),
    sortOrder: t.i32(),
    requiresEvidence: t.bool(),
    notifyChats: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    const task = [...ctx.db.roleTask.byOrganizationId.filter(args.organizationId)]
      .find(r => r.id.toString() === args.roleTaskId);
    if (!task) throw new SenderError('Role task not found');

    ctx.db.roleTask.delete(task);
    ctx.db.roleTask.insert({
      ...task,
      orgId: args.organizationId,
      title: args.title,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      sortOrder: args.sortOrder,
      requiresEvidence: args.requiresEvidence,
      notifyChats: args.notifyChats,
    });
  }
);

export const deleteRoleTask = spacetimedb.reducer(
  { organizationId: t.string(), roleTaskId: t.string() },
  (ctx, { organizationId, roleTaskId }) => {
    findActiveMember(ctx, organizationId);

    const task = [...ctx.db.roleTask.byOrganizationId.filter(organizationId)]
      .find(r => r.id.toString() === roleTaskId);
    if (!task) throw new SenderError('Role task not found');

    ctx.db.roleTask.delete(task);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SHIFT PRESETS REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addShiftPreset = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    startTime: t.string(),
    endTime: t.string(),
    color: t.string(),
    sortOrder: t.i32(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    ctx.db.shiftPreset.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      name: args.name,
      startTime: args.startTime,
      endTime: args.endTime,
      color: args.color,
      sortOrder: args.sortOrder,
      createdAt: ctx.timestamp,
    });
  }
);

export const updateShiftPreset = spacetimedb.reducer(
  {
    organizationId: t.string(),
    presetId: t.string(),
    name: t.string(),
    startTime: t.string(),
    endTime: t.string(),
    color: t.string(),
    sortOrder: t.i32(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    const preset = findItemInOrg(ctx.db.shiftPreset, args.organizationId, args.presetId);
    ctx.db.shiftPreset.delete(preset);
    ctx.db.shiftPreset.insert({
      ...preset,
      name: args.name,
      startTime: args.startTime,
      endTime: args.endTime,
      color: args.color,
      sortOrder: args.sortOrder,
    });
  }
);

export const deleteShiftPreset = spacetimedb.reducer(
  { organizationId: t.string(), presetId: t.string() },
  (ctx, { organizationId, presetId }) => {
    findActiveMember(ctx, organizationId);

    const preset = findItemInOrg(ctx.db.shiftPreset, organizationId, presetId);
    ctx.db.shiftPreset.delete(preset);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SITE PAGES/COMPONENTS REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const deletePage = spacetimedb.reducer(
  { organizationId: t.string(), pageId: t.string() },
  (ctx, { organizationId, pageId }) => {
    findActiveMember(ctx, organizationId);

    const page = [...ctx.db.sitePage.iter()]
      .find(p => p.id.toString() === pageId);
    if (!page) throw new SenderError('Page not found');

    ctx.db.sitePage.delete(page);
  }
);

export const saveComponent = spacetimedb.reducer(
  {
    organizationId: t.string(),
    siteId: t.option(t.string()),
    name: t.string(),
    description: t.option(t.string()),
    elementData: t.string(),
    category: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);

    ctx.db.siteComponent.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      siteId: args.siteId,
      name: args.name,
      description: args.description,
      elementData: args.elementData,
      category: args.category,
      createdBy: member.id.toString(),
      createdAt: ctx.timestamp,
    });
  }
);

export const deleteComponent = spacetimedb.reducer(
  { organizationId: t.string(), componentId: t.string() },
  (ctx, { organizationId, componentId }) => {
    findActiveMember(ctx, organizationId);

    const component = findItemInOrg(ctx.db.siteComponent, organizationId, componentId);
    ctx.db.siteComponent.delete(component);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL CHAT REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addMembersToConversation = spacetimedb.reducer(
  {
    conversationId: t.string(),
    userIds: t.string(),  // JSON-encoded string[] of Identity hex strings
  },
  (ctx, { conversationId, userIds }) => {
    // Verify caller is a member of the conversation
    const callerMembership = [...ctx.db.chatMember.byUserId.filter(ctx.sender)]
      .some(m => m.conversationId === conversationId);
    if (!callerMembership) unauthorized('Not a conversation member');

    const ids: string[] = JSON.parse(userIds);
    for (const uid of ids) {
      // Skip duplicates — the chat_member table doesn't enforce uniqueness on
      // (conversationId, userId), so re-adding a member would silently bloat
      // the table. Cheap pre-check keeps it idempotent.
      const already = [...ctx.db.chatMember.byUserId.filter(new Identity(uid))]
        .some((m) => m.conversationId === conversationId);
      if (already) continue;
      ctx.db.chatMember.insert({
        id: ctx.newUuidV4(),
        conversationId,
        userId: new Identity(uid),
        joinedAt: ctx.timestamp,
      });
    }
  }
);

export const deleteMessage = spacetimedb.reducer(
  { conversationId: t.string(), messageId: t.string() },
  (ctx, { conversationId, messageId }) => {
    // Verify caller is a member of the conversation
    const callerMembership = [...ctx.db.chatMember.byUserId.filter(ctx.sender)]
      .some(m => m.conversationId === conversationId);
    if (!callerMembership) unauthorized('Not a conversation member');

    const message = [...ctx.db.chatMessage.byConversationId.filter(conversationId)]
      .find(m => m.id.toString() === messageId);
    if (!message) throw new SenderError('Message not found');

    // Only the sender can delete their own message
    if (message.senderId.toString() !== ctx.sender.toString()) {
      unauthorized('Can only delete your own messages');
    }

    ctx.db.chatMessage.delete(message);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL MEMBERSHIP REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const updateTier = spacetimedb.reducer(
  {
    organizationId: t.string(),
    tierId: t.string(),
    name: t.string(),
    description: t.option(t.string()),
    price: t.number(),
    pricePeriod: t.string(),
    color: t.string(),
    icon: t.string(),
    sortOrder: t.i32(),
    isDefault: t.bool(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    const tier = [...ctx.db.membershipTier.iter()]
      .find(t => t.id.toString() === args.tierId);
    if (!tier) throw new SenderError('Tier not found');

    ctx.db.membershipTier.delete(tier);
    ctx.db.membershipTier.insert({
      ...tier,
      name: args.name,
      description: args.description,
      price: args.price,
      pricePeriod: args.pricePeriod,
      color: args.color,
      icon: args.icon,
      sortOrder: args.sortOrder,
      isDefault: args.isDefault,
    });
  }
);

export const deleteTier = spacetimedb.reducer(
  { organizationId: t.string(), tierId: t.string() },
  (ctx, { organizationId, tierId }) => {
    findActiveMember(ctx, organizationId);

    const tier = [...ctx.db.membershipTier.iter()]
      .find(t => t.id.toString() === tierId);
    if (!tier) throw new SenderError('Tier not found');

    ctx.db.membershipTier.delete(tier);
  }
);

export const updatePerk = spacetimedb.reducer(
  {
    organizationId: t.string(),
    perkId: t.string(),
    type: t.string(),
    name: t.string(),
    description: t.option(t.string()),
    couponCode: t.option(t.string()),
    discountValue: t.option(t.number()),
    discountType: t.option(t.string()),
    cooldownHours: t.option(t.number()),
    frequency: t.option(t.number()),
    minPurchase: t.option(t.number()),
    active: t.bool(),
    sortOrder: t.i32(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);

    const perk = [...ctx.db.membershipPerk.iter()]
      .find(p => p.id.toString() === args.perkId);
    if (!perk) throw new SenderError('Perk not found');

    ctx.db.membershipPerk.delete(perk);
    ctx.db.membershipPerk.insert({
      ...perk,
      type: args.type,
      name: args.name,
      description: args.description,
      couponCode: args.couponCode,
      discountValue: args.discountValue,
      discountType: args.discountType,
      cooldownHours: args.cooldownHours,
      frequency: args.frequency,
      minPurchase: args.minPurchase,
      active: args.active,
      sortOrder: args.sortOrder,
    });
  }
);

export const deletePerk = spacetimedb.reducer(
  { organizationId: t.string(), perkId: t.string() },
  (ctx, { organizationId, perkId }) => {
    findActiveMember(ctx, organizationId);

    const perk = [...ctx.db.membershipPerk.iter()]
      .find(p => p.id.toString() === perkId);
    if (!perk) throw new SenderError('Perk not found');

    ctx.db.membershipPerk.delete(perk);
  }
);

export const assignTier = spacetimedb.reducer(
  {
    siteId: t.string(),
    customerId: t.string(),
    plan: t.string(),
  },
  (ctx, { siteId, customerId, plan }) => {
    const existing = [...ctx.db.siteMembership.byCustomerId.filter(customerId)]
      .find(m => m.siteId === siteId);

    if (existing) {
      ctx.db.siteMembership.delete(existing);
      ctx.db.siteMembership.insert({
        ...existing,
        plan,
      });
    } else {
      ctx.db.siteMembership.insert({
        id: ctx.newUuidV4(),
        siteId,
        customerId,
        plan,
        startedAt: ctx.timestamp,
        expiresAt: undefined,
      });
    }
  }
);

export const updateOrderStatus = spacetimedb.reducer(
  {
    organizationId: t.string(),
    orderId: t.string(),
    status: t.string(),
  },
  (ctx, { organizationId, orderId, status }) => {
    findActiveMember(ctx, organizationId);

    const order = [...ctx.db.siteOrder.iter()]
      .find(o => o.id.toString() === orderId);
    if (!order) throw new SenderError('Order not found');

    ctx.db.siteOrder.delete(order);
    ctx.db.siteOrder.insert({ ...order, status });
  }
);

export const updateBookingStatus = spacetimedb.reducer(
  {
    organizationId: t.string(),
    bookingId: t.string(),
    status: t.string(),
  },
  (ctx, { organizationId, bookingId, status }) => {
    findActiveMember(ctx, organizationId);

    const booking = [...ctx.db.siteBooking.iter()]
      .find(b => b.id.toString() === bookingId);
    if (!booking) throw new SenderError('Booking not found');

    ctx.db.siteBooking.delete(booking);
    ctx.db.siteBooking.insert({ ...booking, status });
  }
);

export const redeemPoints = spacetimedb.reducer(
  {
    siteId: t.string(),
    customerId: t.string(),
    points: t.i32(),
  },
  (ctx, { siteId, customerId, points }) => {
    const existing = [...ctx.db.customerPoints.byCustomerId.filter(customerId)]
      .find(cp => cp.siteId === siteId);
    if (!existing) throw new SenderError('Customer points record not found');
    if (existing.points < points) throw new SenderError('Insufficient points');

    ctx.db.customerPoints.delete(existing);
    ctx.db.customerPoints.insert({
      ...existing,
      points: existing.points - points,
      updatedAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL ORG REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const cancelInvitation = spacetimedb.reducer(
  { organizationId: t.string(), invitationId: t.string() },
  (ctx, { organizationId, invitationId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const invite = [...ctx.db.orgInvitation.byOrganizationId.filter(organizationId)]
      .find(i => i.id.toString() === invitationId);
    if (!invite) throw new SenderError('Invitation not found');

    ctx.db.orgInvitation.delete(invite);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TODOS REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addTodo = spacetimedb.reducer(
  { organizationId: t.string(), title: t.string() },
  (ctx, { organizationId, title }) => {
    findActiveMember(ctx, organizationId);

    ctx.db.todo.insert({
      id: ctx.newUuidV4(),
      userId: ctx.sender,
      organizationId,
      title,
      completed: false,
      sortOrder: 0,
      createdAt: ctx.timestamp,
    });
  }
);

export const toggleTodo = spacetimedb.reducer(
  { todoId: t.string(), completed: t.bool() },
  (ctx, { todoId, completed }) => {
    const todo = [...ctx.db.todo.byUserId.filter(ctx.sender)]
      .find(t => t.id.toString() === todoId);
    if (!todo) throw new SenderError('Todo not found');

    ctx.db.todo.delete(todo);
    ctx.db.todo.insert({ ...todo, completed });
  }
);

export const deleteTodo = spacetimedb.reducer(
  { todoId: t.string() },
  (ctx, { todoId }) => {
    const todo = [...ctx.db.todo.byUserId.filter(ctx.sender)]
      .find(t => t.id.toString() === todoId);
    if (!todo) throw new SenderError('Todo not found');

    // Verify ownership
    if (todo.userId.toString() !== ctx.sender.toString()) {
      unauthorized('Can only delete your own todos');
    }

    ctx.db.todo.delete(todo);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createNotification = spacetimedb.reducer(
  {
    organizationId: t.string(),
    targetIdentity: t.identity(),
    type: t.string(),
    title: t.string(),
    body: t.string(),
    link: t.option(t.string()),
  },
  (ctx, { organizationId, targetIdentity, type, title, body, link }) => {
    findActiveMember(ctx, organizationId);
    ctx.db.notification.insert({
      id: ctx.newUuidV4(),
      organizationId,
      targetId: targetIdentity,
      type,
      title,
      body,
      link: link ?? undefined,
      read: false,
      createdAt: ctx.timestamp,
    });
  }
);

export const markNotificationRead = spacetimedb.reducer(
  { notificationId: t.string() },
  (ctx, { notificationId }) => {
    const notif = [...ctx.db.notification.byTargetId.filter(ctx.sender)]
      .find(n => n.id.toString() === notificationId);
    if (!notif) throw new SenderError('Notification not found');
    ctx.db.notification.id.update({ ...notif, read: true });
  }
);

export const markAllNotificationsRead = spacetimedb.reducer(
  { organizationId: t.string() },
  (ctx, { organizationId }) => {
    const unread = [...ctx.db.notification.byTargetId.filter(ctx.sender)]
      .filter(n => n.organizationId === organizationId && !n.read);
    for (const notif of unread) {
      ctx.db.notification.id.update({ ...notif, read: true });
    }
  }
);

export const dismissNotification = spacetimedb.reducer(
  { notificationId: t.string() },
  (ctx, { notificationId }) => {
    const notif = [...ctx.db.notification.byTargetId.filter(ctx.sender)]
      .find(n => n.id.toString() === notificationId);
    if (!notif) throw new SenderError('Notification not found');
    ctx.db.notification.delete(notif);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// WASTE LOG REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addWasteLog = spacetimedb.reducer(
  {
    organizationId: t.string(),
    itemId: t.option(t.string()),
    itemName: t.string(),
    quantity: t.number(),
    unit: t.string(),
    reason: t.string(),
    costPerUnit: t.number(),
    date: t.string(),
    notes: t.option(t.string()),
    operatorMemberId: t.option(t.string()),
    operatorName: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.inventory?.edit) unauthorized('No inventory edit permission');

    const totalCost = args.quantity * args.costPerUnit;

    ctx.db.wasteLog.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      itemId: args.itemId,
      itemName: args.itemName,
      quantity: args.quantity,
      unit: args.unit,
      reason: args.reason,
      costPerUnit: args.costPerUnit,
      costPerUnitCents: toCents(args.costPerUnit),
      totalCost,
      totalCostCents: toCents(totalCost),
      date: args.date,
      notes: args.notes,
      createdBy: (member as { displayName?: string }).displayName ?? undefined,
      createdAt: ctx.timestamp,
    });

    // Auto-deduct from inventory if linked to an item
    if (args.itemId) {
      const item = [...ctx.db.inventoryItem.byOrganizationId.filter(args.organizationId)]
        .find(i => i.id.toString() === args.itemId);
      if (item) {
        const newStock = Math.max(0, item.currentStock - args.quantity);
        const wasAboveMin = item.currentStock > item.minStock;
        ctx.db.inventoryItem.delete(item);
        ctx.db.inventoryItem.insert({ ...item, currentStock: newStock, updatedAt: ctx.timestamp });

        // Also record as a loss transaction
        ctx.db.inventoryTransaction.insert({
          id: ctx.newUuidV4(),
          organizationId: args.organizationId,
          itemId: args.itemId,
          itemName: args.itemName,
          type: 'loss',
          quantity: args.quantity,
          note: `Waste: ${args.reason}${args.notes ? ' — ' + args.notes : ''}`,
          date: args.date,
          createdAt: ctx.timestamp,
          operatorMemberId: args.operatorMemberId,
          operatorName: args.operatorName,
          evidenceUrls: undefined,
          expirationDate: undefined,
          batchExpirationDate: undefined,
        });

        if (wasAboveMin && newStock <= item.minStock) {
          notifyOrgMembers(ctx, args.organizationId, 'inventory_low',
            `Low stock: ${item.name}`,
            `${item.name} dropped to ${newStock} ${item.unit} after waste disposal`,
            '/inventory');
        }
      }
    }
  }
);

export const deleteWasteLog = spacetimedb.reducer(
  { organizationId: t.string(), wasteLogId: t.string() },
  (ctx, { organizationId, wasteLogId }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.inventory?.edit) unauthorized('No inventory edit permission');

    const log = [...ctx.db.wasteLog.byOrganizationId.filter(organizationId)]
      .find(w => w.id.toString() === wasteLogId);
    if (!log) throw new SenderError('Waste log not found');
    ctx.db.wasteLog.delete(log);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// LOCATION REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addLocation = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    address: t.option(t.string()),
    phone: t.option(t.string()),
    isDefault: t.bool(),
    sortOrder: t.number(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    if (args.isDefault) {
      const existing = [...ctx.db.location.byOrganizationId.filter(args.organizationId)]
        .filter(l => l.isDefault);
      for (const loc of existing) {
        ctx.db.location.delete(loc);
        ctx.db.location.insert({ ...loc, isDefault: false });
      }
    }

    ctx.db.location.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      name: args.name,
      address: args.address,
      phone: args.phone,
      isDefault: args.isDefault,
      sortOrder: args.sortOrder,
      createdAt: ctx.timestamp,
    });
  }
);

export const updateLocation = spacetimedb.reducer(
  {
    organizationId: t.string(),
    locationId: t.string(),
    name: t.string(),
    address: t.option(t.string()),
    phone: t.option(t.string()),
    isDefault: t.bool(),
    sortOrder: t.number(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const loc = [...ctx.db.location.byOrganizationId.filter(args.organizationId)]
      .find(l => l.id.toString() === args.locationId);
    if (!loc) throw new SenderError('Location not found');

    if (args.isDefault && !loc.isDefault) {
      const others = [...ctx.db.location.byOrganizationId.filter(args.organizationId)]
        .filter(l => l.isDefault && l.id.toString() !== args.locationId);
      for (const o of others) {
        ctx.db.location.delete(o);
        ctx.db.location.insert({ ...o, isDefault: false });
      }
    }

    ctx.db.location.delete(loc);
    ctx.db.location.insert({
      ...loc,
      name: args.name,
      address: args.address,
      phone: args.phone,
      isDefault: args.isDefault,
      sortOrder: args.sortOrder,
    });
  }
);

export const deleteLocation = spacetimedb.reducer(
  { organizationId: t.string(), locationId: t.string() },
  (ctx, { organizationId, locationId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const loc = [...ctx.db.location.byOrganizationId.filter(organizationId)]
      .find(l => l.id.toString() === locationId);
    if (!loc) throw new SenderError('Location not found');
    ctx.db.location.delete(loc);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIER & PURCHASE ORDER REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addSupplier = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    contactName: t.option(t.string()),
    email: t.option(t.string()),
    phone: t.option(t.string()),
    address: t.option(t.string()),
    paymentTerms: t.option(t.string()),
    notes: t.option(t.string()),
    language: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    ctx.db.supplier.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      name: args.name,
      contactName: args.contactName,
      email: args.email,
      phone: args.phone,
      address: args.address,
      paymentTerms: args.paymentTerms,
      notes: args.notes,
      rating: 5,
      createdAt: ctx.timestamp,
      language: args.language ?? 'en',
    });
  }
);

export const updateSupplier = spacetimedb.reducer(
  {
    organizationId: t.string(),
    supplierId: t.string(),
    name: t.string(),
    contactName: t.option(t.string()),
    email: t.option(t.string()),
    phone: t.option(t.string()),
    address: t.option(t.string()),
    paymentTerms: t.option(t.string()),
    notes: t.option(t.string()),
    rating: t.number(),
    language: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    const sup = [...ctx.db.supplier.byOrganizationId.filter(args.organizationId)]
      .find(s => s.id.toString() === args.supplierId);
    if (!sup) throw new SenderError('Supplier not found');
    ctx.db.supplier.delete(sup);
    ctx.db.supplier.insert({
      ...sup,
      name: args.name,
      contactName: args.contactName,
      email: args.email,
      phone: args.phone,
      address: args.address,
      paymentTerms: args.paymentTerms,
      notes: args.notes,
      rating: args.rating,
      language: args.language ?? sup.language ?? 'en',
    });
  }
);

export const deleteSupplier = spacetimedb.reducer(
  { organizationId: t.string(), supplierId: t.string() },
  (ctx, { organizationId, supplierId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    const sup = [...ctx.db.supplier.byOrganizationId.filter(organizationId)]
      .find(s => s.id.toString() === supplierId);
    if (!sup) throw new SenderError('Supplier not found');
    ctx.db.supplier.delete(sup);
  }
);

export const createPurchaseOrder = spacetimedb.reducer(
  {
    organizationId: t.string(),
    supplierId: t.string(),
    items: t.string(),
    subtotal: t.number(),
    tax: t.number(),
    total: t.number(),
    notes: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    ctx.db.purchaseOrder.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      supplierId: args.supplierId,
      status: 'draft',
      items: args.items,
      subtotal: args.subtotal,
      subtotalCents: toCents(args.subtotal),
      tax: args.tax,
      taxCents: toCents(args.tax),
      total: args.total,
      totalCents: toCents(args.total),
      notes: args.notes,
      sentAt: undefined,
      receivedAt: undefined,
      createdAt: ctx.timestamp,
    });
  }
);

export const updatePurchaseOrderStatus = spacetimedb.reducer(
  { organizationId: t.string(), orderId: t.string(), status: t.string() },
  (ctx, { organizationId, orderId, status }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    const po = [...ctx.db.purchaseOrder.byOrganizationId.filter(organizationId)]
      .find(p => p.id.toString() === orderId);
    if (!po) throw new SenderError('Purchase order not found');
    ctx.db.purchaseOrder.delete(po);
    ctx.db.purchaseOrder.insert({
      ...po,
      status,
      ...(status === 'sent' ? { sentAt: ctx.timestamp } : {}),
      ...(status === 'received' ? { receivedAt: ctx.timestamp } : {}),
    });
  }
);

// Notify only the org's active owners/managers (vs. notifyOrgMembers which hits
// everyone). Used to escalate supplier-ordering problems to people who can act.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notifyManagers(ctx: any, organizationId: string, type: string, title: string, body: string, link?: string) {
  const managers = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
    .filter((m: { status: string; role: string }) =>
      m.status === 'active' && (m.role === 'owner' || m.role === 'manager'));
  for (const m of managers) {
    ctx.db.notification.insert({
      id: ctx.newUuidV4(),
      organizationId,
      targetId: m.userId,
      type,
      title,
      body,
      link: link ?? undefined,
      read: false,
      createdAt: ctx.timestamp,
    });
  }
}

// Mr. Merchiva orders inventory from a supplier. Creates the purchase order and
// logs the outbound message in one atomic step. The actual email is sent by the
// Next route BEFORE calling this (Resend can't run inside a reducer); `emailed`
// records whether that send succeeded. When it didn't (no supplier email, or a
// send failure), the PO is kept as a `draft` and managers are notified so a
// human can finish it.
export const recordSupplierOrder = spacetimedb.reducer(
  {
    organizationId: t.string(),
    supplierId: t.string(),
    supplierName: t.string(),
    items: t.string(),
    subtotal: t.number(),
    tax: t.number(),
    total: t.number(),
    notes: t.option(t.string()),
    summary: t.string(),
    emailed: t.bool(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const poId = ctx.newUuidV4();
    ctx.db.purchaseOrder.insert({
      id: poId,
      organizationId: args.organizationId,
      supplierId: args.supplierId,
      status: args.emailed ? 'sent' : 'draft',
      items: args.items,
      subtotal: args.subtotal,
      subtotalCents: toCents(args.subtotal),
      tax: args.tax,
      taxCents: toCents(args.tax),
      total: args.total,
      totalCents: toCents(args.total),
      notes: args.notes,
      sentAt: args.emailed ? ctx.timestamp : undefined,
      receivedAt: undefined,
      createdAt: ctx.timestamp,
    });

    ctx.db.supplierMessage.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      supplierId: args.supplierId,
      poId: poId.toString(),
      direction: 'outbound',
      channel: 'email',
      subject: undefined,
      body: args.summary,
      status: args.emailed ? 'sent' : 'failed',
      createdAt: ctx.timestamp,
    });

    if (!args.emailed) {
      notifyManagers(
        ctx,
        args.organizationId,
        'order',
        'Purchase order needs your attention',
        `Mr. Merchiva couldn't email ${args.supplierName} — the order was saved as a draft. Add a supplier email or send it manually.`,
        '/manager/suppliers',
      );
    }
  }
);

// Append a message to a supplier thread. Used for follow-ups, inbound replies
// (Phase 2), and system notes. `escalate=true` also pings managers (e.g. when a
// supplier raises a problem that needs a human decision).
export const logSupplierMessage = spacetimedb.reducer(
  {
    organizationId: t.string(),
    supplierId: t.string(),
    supplierName: t.string(),
    poId: t.option(t.string()),
    direction: t.string(),
    channel: t.string(),
    subject: t.option(t.string()),
    body: t.string(),
    status: t.option(t.string()),
    escalate: t.bool(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    ctx.db.supplierMessage.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      supplierId: args.supplierId,
      poId: args.poId,
      direction: args.direction,
      channel: args.channel,
      subject: args.subject,
      body: args.body,
      status: args.status,
      createdAt: ctx.timestamp,
    });
    if (args.escalate) {
      notifyManagers(
        ctx,
        args.organizationId,
        'order',
        `Supplier issue: ${args.supplierName}`,
        args.body.length > 160 ? args.body.slice(0, 159) + '…' : args.body,
        '/manager/suppliers',
      );
    }
  }
);

// Service-identity variant of logSupplierMessage. Used by the inbound supplier
// webhook (Phase 2), which receives supplier email replies and the AI's
// responses server-side — there's no logged-in user to authorize the write, so
// it runs as the service identity. Same insert + manager escalation.
export const serviceLogSupplierMessage = spacetimedb.reducer(
  {
    organizationId: t.string(),
    supplierId: t.string(),
    supplierName: t.string(),
    poId: t.option(t.string()),
    direction: t.string(),
    channel: t.string(),
    subject: t.option(t.string()),
    body: t.string(),
    status: t.option(t.string()),
    escalate: t.bool(),
  },
  (ctx, args) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');
    ctx.db.supplierMessage.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      supplierId: args.supplierId,
      poId: args.poId,
      direction: args.direction,
      channel: args.channel,
      subject: args.subject,
      body: args.body,
      status: args.status,
      createdAt: ctx.timestamp,
    });
    if (args.escalate) {
      notifyManagers(
        ctx,
        args.organizationId,
        'order',
        `Supplier issue: ${args.supplierName}`,
        args.body.length > 160 ? args.body.slice(0, 159) + '…' : args.body,
        '/manager/suppliers',
      );
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSE REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addExpense = spacetimedb.reducer(
  {
    organizationId: t.string(),
    category: t.string(),
    description: t.string(),
    amount: t.number(),
    date: t.string(),
    recurring: t.bool(),
    recurringPeriod: t.option(t.string()),
    receiptUrl: t.option(t.string()),
    notes: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    ctx.db.expense.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      category: args.category,
      description: args.description,
      amount: args.amount,
      amountCents: toCents(args.amount),
      date: args.date,
      recurring: args.recurring,
      recurringPeriod: args.recurringPeriod,
      receiptUrl: args.receiptUrl,
      notes: args.notes,
      createdAt: ctx.timestamp,
    });
  }
);

export const updateExpense = spacetimedb.reducer(
  {
    organizationId: t.string(),
    expenseId: t.string(),
    category: t.string(),
    description: t.string(),
    amount: t.number(),
    date: t.string(),
    recurring: t.bool(),
    recurringPeriod: t.option(t.string()),
    receiptUrl: t.option(t.string()),
    notes: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    const exp = [...ctx.db.expense.byOrganizationId.filter(args.organizationId)]
      .find(e => e.id.toString() === args.expenseId);
    if (!exp) throw new SenderError('Expense not found');
    ctx.db.expense.delete(exp);
    ctx.db.expense.insert({
      ...exp,
      category: args.category,
      description: args.description,
      amount: args.amount,
      amountCents: toCents(args.amount),
      date: args.date,
      recurring: args.recurring,
      recurringPeriod: args.recurringPeriod,
      receiptUrl: args.receiptUrl,
      notes: args.notes,
    });
  }
);

export const deleteExpense = spacetimedb.reducer(
  { organizationId: t.string(), expenseId: t.string() },
  (ctx, { organizationId, expenseId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    const exp = [...ctx.db.expense.byOrganizationId.filter(organizationId)]
      .find(e => e.id.toString() === expenseId);
    if (!exp) throw new SenderError('Expense not found');
    ctx.db.expense.delete(exp);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// COUPON REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addCoupon = spacetimedb.reducer(
  {
    organizationId: t.string(), code: t.string(), discountType: t.string(),
    discountValue: t.number(), minPurchase: t.number(), maxUses: t.i32(),
    validFrom: t.string(), validUntil: t.string(), description: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    ctx.db.coupon.insert({
      id: ctx.newUuidV4(), organizationId: args.organizationId, code: args.code.toUpperCase(),
      discountType: args.discountType, discountValue: args.discountValue,
      minPurchase: args.minPurchase, maxUses: args.maxUses, usedCount: 0,
      validFrom: args.validFrom, validUntil: args.validUntil, active: true,
      description: args.description, createdAt: ctx.timestamp,
    });
  }
);

export const updateCoupon = spacetimedb.reducer(
  {
    organizationId: t.string(), couponId: t.string(), code: t.string(),
    discountType: t.string(), discountValue: t.number(), minPurchase: t.number(),
    maxUses: t.i32(), validFrom: t.string(), validUntil: t.string(),
    active: t.bool(), description: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    const c = [...ctx.db.coupon.byOrganizationId.filter(args.organizationId)]
      .find(c => c.id.toString() === args.couponId);
    if (!c) throw new SenderError('Coupon not found');
    ctx.db.coupon.delete(c);
    ctx.db.coupon.insert({ ...c, code: args.code.toUpperCase(), discountType: args.discountType,
      discountValue: args.discountValue, minPurchase: args.minPurchase, maxUses: args.maxUses,
      validFrom: args.validFrom, validUntil: args.validUntil, active: args.active, description: args.description });
  }
);

export const deleteCoupon = spacetimedb.reducer(
  { organizationId: t.string(), couponId: t.string() },
  (ctx, { organizationId, couponId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    const c = [...ctx.db.coupon.byOrganizationId.filter(organizationId)]
      .find(c => c.id.toString() === couponId);
    if (!c) throw new SenderError('Coupon not found');
    ctx.db.coupon.delete(c);
  }
);

export const redeemCoupon = spacetimedb.reducer(
  { organizationId: t.string(), code: t.string() },
  (ctx, { organizationId, code }) => {
    findActiveMember(ctx, organizationId);
    const c = [...ctx.db.coupon.byCode.filter(code.toUpperCase())]
      .find(c => c.organizationId === organizationId);
    if (!c) throw new SenderError('Coupon not found');
    if (!c.active) throw new SenderError('Coupon is inactive');
    if (c.usedCount >= c.maxUses && c.maxUses > 0) throw new SenderError('Coupon usage limit reached');
    const today = new Date().toISOString().slice(0, 10);
    if (today < c.validFrom || today > c.validUntil) throw new SenderError('Coupon expired');
    ctx.db.coupon.delete(c);
    ctx.db.coupon.insert({ ...c, usedCount: c.usedCount + 1 });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// QUEUE REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addQueueEntry = spacetimedb.reducer(
  {
    organizationId: t.string(), customerName: t.string(), partySize: t.i32(),
    phone: t.option(t.string()), estimatedWait: t.i32(), notes: t.option(t.string()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    ctx.db.queueEntry.insert({
      id: ctx.newUuidV4(), organizationId: args.organizationId, customerName: args.customerName,
      partySize: args.partySize, phone: args.phone, status: 'waiting',
      estimatedWait: args.estimatedWait, notes: args.notes,
      queuedAt: ctx.timestamp, seatedAt: undefined,
    });
  }
);

export const updateQueueStatus = spacetimedb.reducer(
  { organizationId: t.string(), entryId: t.string(), status: t.string() },
  (ctx, { organizationId, entryId, status }) => {
    findActiveMember(ctx, organizationId);
    const e = [...ctx.db.queueEntry.byOrganizationId.filter(organizationId)]
      .find(e => e.id.toString() === entryId);
    if (!e) throw new SenderError('Queue entry not found');
    ctx.db.queueEntry.delete(e);
    ctx.db.queueEntry.insert({ ...e, status,
      ...(status === 'seated' ? { seatedAt: ctx.timestamp } : {}),
    });
  }
);

export const deleteQueueEntry = spacetimedb.reducer(
  { organizationId: t.string(), entryId: t.string() },
  (ctx, { organizationId, entryId }) => {
    findActiveMember(ctx, organizationId);
    const e = [...ctx.db.queueEntry.byOrganizationId.filter(organizationId)]
      .find(e => e.id.toString() === entryId);
    if (!e) throw new SenderError('Queue entry not found');
    ctx.db.queueEntry.delete(e);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS — CLOVER DISCONNECT
// ═══════════════════════════════════════════════════════════════════════════════

/** No-op reducer for Clover disconnect (no Clover fields in settings table yet). */
export const disconnectClover = spacetimedb.reducer(
  { organizationId: t.string() },
  (ctx, { organizationId }) => {
    findActiveMember(ctx, organizationId);
    // No-op: Clover integration fields not yet in settings table
  }
);

export const setScheduleIntegration = spacetimedb.reducer(
  {
    organizationId: t.string(),
    provider: t.string(),
    companyGuid: t.option(t.string()),
    companyId: t.option(t.string()),
    locationId: t.option(t.string()),
  },
  (ctx, { organizationId, provider, companyGuid, companyId, locationId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      scheduleProvider: provider,
      scheduleConnected: !!companyGuid,
      scheduleCompanyGuid: companyGuid,
      scheduleCompanyId: companyId,
      scheduleLocationId: locationId,
      scheduleLastSyncStatus: companyGuid ? 'connected' : 'selected',
      scheduleLastSyncSummary: companyGuid ? `${provider} connected` : `${provider} selected`,
      updatedAt: ctx.timestamp,
    });
  }
);

export const disconnectScheduleIntegration = spacetimedb.reducer(
  { organizationId: t.string() },
  (ctx, { organizationId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      scheduleProvider: undefined,
      scheduleConnected: undefined,
      scheduleCompanyGuid: undefined,
      scheduleCompanyId: undefined,
      scheduleLocationId: undefined,
      scheduleLastSyncedAt: undefined,
      scheduleLastSyncStatus: undefined,
      scheduleLastSyncSummary: undefined,
      updatedAt: ctx.timestamp,
    });
  }
);

export const serviceSetScheduleIntegration = spacetimedb.reducer(
  {
    organizationId: t.string(),
    provider: t.string(),
    companyGuid: t.option(t.string()),
    companyId: t.option(t.string()),
    locationId: t.option(t.string()),
    status: t.option(t.string()),
    summary: t.option(t.string()),
  },
  (ctx, { organizationId, provider, companyGuid, companyId, locationId, status, summary }) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      scheduleProvider: provider,
      scheduleConnected: !!companyGuid,
      scheduleCompanyGuid: companyGuid,
      scheduleCompanyId: companyId,
      scheduleLocationId: locationId,
      scheduleLastSyncStatus: status ?? (companyGuid ? 'connected' : 'selected'),
      scheduleLastSyncSummary: summary ?? (companyGuid ? `${provider} connected` : `${provider} selected`),
      updatedAt: ctx.timestamp,
    });
  }
);

export const serviceRecordScheduleSync = spacetimedb.reducer(
  {
    organizationId: t.string(),
    provider: t.string(),
    status: t.string(),
    summary: t.string(),
  },
  (ctx, { organizationId, provider, status, summary }) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      scheduleProvider: provider,
      scheduleLastSyncedAt: ctx.timestamp,
      scheduleLastSyncStatus: status,
      scheduleLastSyncSummary: summary,
      updatedAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

type AnyTable = {
  byOrganizationId: { filter(orgId: string): Iterable<{ id: { toString(): string } }> };
};

/** Find a row by organizationId + id string, throwing if not found. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findItemInOrg<T extends { id: { toString(): string } }>(
  tableHandle: { byOrganizationId: { filter(orgId: string): IterableIterator<T> } },
  organizationId: string,
  itemId: string
): T {
  const item = [...tableHandle.byOrganizationId.filter(organizationId)]
    .find(r => r.id.toString() === itemId);
  if (!item) throw new SenderError('Record not found');
  return item;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notifyOrgMembers(ctx: any, organizationId: string, type: string, title: string, body: string, link?: string, excludeIdentity?: { toString(): string }) {
  const members = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
    .filter((m: { status: string }) => m.status === 'active');
  for (const m of members) {
    if (excludeIdentity && m.userId.toString() === excludeIdentity.toString()) continue;
    ctx.db.notification.insert({
      id: ctx.newUuidV4(),
      organizationId,
      targetId: m.userId,
      type,
      title,
      body,
      link: link ?? undefined,
      read: false,
      createdAt: ctx.timestamp,
    });
  }
}

/** Look up the calling user's active org membership, throwing if not found. */
/**
 * Synthetic "owner" membership row returned for the service identity so that
 * every org-scoped reducer can be driven from the /merchivaAdmin console
 * (server-side, service token) without a real org_member row.
 */
// Every permission section the reducers ever check, all granted. Mirrors the
// shape of lib/db/team.ts ownerPermissions().
const SERVICE_FULL_PERMISSIONS = JSON.stringify({
  inventory: { view: true, edit: true },
  sales: { view: true, edit: true },
  staffing: { view: true, edit: true },
  pos: { view: true, edit: true },
  settings: { view: true, edit: true },
  team: { view: true, invite: true, edit: true },
  dashboard: { view: true },
  merchiva: { view: true },
  training_grading: { view: true, edit: true },
  finances: { view: true, edit: true },
  reports: { view: true, edit: true },
  products: { view: true, edit: true },
  pricing: { view: true, edit: true },
  customers: { view: true, edit: true },
  marketing: { view: true, edit: true },
  bookings: { view: true, edit: true },
  reviews: { view: true, edit: true },
  suppliers: { view: true, edit: true },
  training: { view: true, edit: true },
  chat: { view: true, edit: true },
  website: { view: true, edit: true },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serviceMember(ctx: any, organizationId: string) {
  return {
    id: { toString: () => 'service' },
    organizationId,
    userId: ctx.sender,
    role: 'owner',
    displayName: 'Merchiva Admin',
    email: '',
    permissions: SERVICE_FULL_PERMISSIONS,
    status: 'active',
    joinedAt: ctx.timestamp,
    punchInCode: undefined,
    hourlyRate: undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findActiveMember(ctx: any, organizationId: string) {
  // The service identity (used by the /merchivaAdmin console and cron jobs)
  // acts as a virtual owner of every organization.
  if (isServiceCaller(ctx)) return serviceMember(ctx, organizationId);
  const member = [...ctx.db.orgMember.byUserId.filter(ctx.sender)]
    .find((m: { organizationId: string; status: string }) =>
      m.organizationId === organizationId && m.status === 'active'
    );
  if (!member) unauthorized('Not an active member of this organization');
  return member as {
    id: { toString(): string };
    organizationId: string;
    role: string;
    permissions: string;
    status: string;
  };
}

/**
 * Compute the share-group org ids for a given org. Sub-stores share certain
 * resources (staff, products, chat, design, sites) with their parent + sibling
 * sub-stores. The share group is: root org + every org whose parentOrgId is
 * that root. For a root org, the group is { root, ...children }. For a sub-
 * store, the group is { root, ...all siblings (including self) }.
 *
 * Inventory and forecasts are NOT shared — they stay strictly per-org.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shareGroupOrgIds(ctx: any, organizationId: string): string[] {
  const org = [...ctx.db.organization.byOrgIdText.filter(organizationId)][0];
  if (!org) return [organizationId];
  // `rootOrgId` is maintained as (parentOrgId ?? own id), so one indexed lookup
  // returns the whole share group instead of scanning every organization twice.
  const rootId: string = (org.rootOrgId as string) || organizationId;
  const ids = new Set<string>([rootId]);
  for (const o of ctx.db.organization.byRootOrgId.filter(rootId)) {
    ids.add((o as { orgIdText: string }).orgIdText);
  }
  return [...ids];
}

/**
 * Like findActiveMember, but accepts membership in ANY org in the share group.
 * Used by reducers for resources that are shared across the parent/child tree
 * (products, chat messages). Returns the membership row found.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findShareGroupMember(ctx: any, organizationId: string) {
  if (isServiceCaller(ctx)) return serviceMember(ctx, organizationId);
  const groupIds = shareGroupOrgIds(ctx, organizationId);
  const member = [...ctx.db.orgMember.byUserId.filter(ctx.sender)]
    .find((m: { organizationId: string; status: string }) =>
      groupIds.includes(m.organizationId) && m.status === 'active'
    );
  if (!member) unauthorized('Not an active member of this organization or its share group');
  return member as {
    id: { toString(): string };
    organizationId: string;
    role: string;
    permissions: string;
    status: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI CHAT HISTORY REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// AI CHAT SESSION REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createAiChatSession = spacetimedb.reducer(
  {
    organizationId: t.string(),
    title: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    ctx.db.aiChatSession.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      userId: ctx.sender,
      title: args.title,
      messages: '[]',
      summary: undefined,
      archived: false,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const saveAiChatSession = spacetimedb.reducer(
  {
    organizationId: t.string(),
    sessionId: t.string(),
    messages: t.string(),
    title: t.option(t.string()),
    summary: t.option(t.string()),
    archived: t.option(t.bool()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    const existing = [...ctx.db.aiChatSession.byUserId.filter(ctx.sender)]
      .find((r: { id: { toString(): string }; organizationId: string }) =>
        r.id.toString() === args.sessionId && r.organizationId === args.organizationId
      );
    if (!existing) throw new SenderError('Session not found');
    ctx.db.aiChatSession.id.update({
      ...existing,
      messages: args.messages,
      title: args.title ?? existing.title,
      summary: args.summary ?? existing.summary,
      archived: args.archived ?? existing.archived,
      updatedAt: ctx.timestamp,
    });
  }
);

export const archiveAiChatSession = spacetimedb.reducer(
  {
    organizationId: t.string(),
    sessionId: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    const existing = [...ctx.db.aiChatSession.byUserId.filter(ctx.sender)]
      .find((r: { id: { toString(): string }; organizationId: string }) =>
        r.id.toString() === args.sessionId && r.organizationId === args.organizationId
      );
    if (!existing) throw new SenderError('Session not found');
    ctx.db.aiChatSession.id.update({
      ...existing,
      archived: true,
      updatedAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// AI JOB REDUCERS — background AI generation. The Next.js API enqueues a job,
// runs the model in a waitUntil background task, and streams chunks back into
// partialText. The owning client subscribes via useTable and renders updates.
// ═══════════════════════════════════════════════════════════════════════════════

export const createAiJob = spacetimedb.reducer(
  {
    organizationId: t.string(),
    sessionId: t.string(),
    prompt: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    ctx.db.aiJob.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      sessionId: args.sessionId,
      userId: ctx.sender,
      prompt: args.prompt,
      status: 'pending',
      partialText: '',
      finalText: undefined,
      error: undefined,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
      consumed: false,
    });
  }
);

export const appendAiJobChunk = spacetimedb.reducer(
  {
    organizationId: t.string(),
    jobId: t.string(),
    chunk: t.string(),
    setRunning: t.bool(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    // Primary-key lookup; the org check stays as an authorization guard so a
    // caller cannot touch another tenant's job by guessing its id.
    const existing = findById(ctx.db.aiJob, args.jobId);
    if (existing && existing.organizationId !== args.organizationId) {
      unauthorized('Job belongs to another organization');
    }
    if (!existing) throw new SenderError('Job not found');
    ctx.db.aiJob.id.update({
      ...existing,
      status: args.setRunning ? 'running' : existing.status,
      partialText: existing.partialText + args.chunk,
      updatedAt: ctx.timestamp,
    });
  }
);

export const finalizeAiJob = spacetimedb.reducer(
  {
    organizationId: t.string(),
    jobId: t.string(),
    finalText: t.option(t.string()),
    error: t.option(t.string()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    // Primary-key lookup; the org check stays as an authorization guard so a
    // caller cannot touch another tenant's job by guessing its id.
    const existing = findById(ctx.db.aiJob, args.jobId);
    if (existing && existing.organizationId !== args.organizationId) {
      unauthorized('Job belongs to another organization');
    }
    if (!existing) throw new SenderError('Job not found');
    ctx.db.aiJob.id.update({
      ...existing,
      status: args.error ? 'failed' : 'done',
      finalText: args.finalText,
      error: args.error,
      updatedAt: ctx.timestamp,
    });
  }
);

export const consumeAiJob = spacetimedb.reducer(
  {
    organizationId: t.string(),
    jobId: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    // Primary-key lookup; the org check stays as an authorization guard so a
    // caller cannot touch another tenant's job by guessing its id.
    const existing = findById(ctx.db.aiJob, args.jobId);
    if (existing && existing.organizationId !== args.organizationId) {
      unauthorized('Job belongs to another organization');
    }
    if (!existing) throw new SenderError('Job not found');
    ctx.db.aiJob.id.update({
      ...existing,
      consumed: true,
      updatedAt: ctx.timestamp,
    });
  }
);

export const deleteAiJob = spacetimedb.reducer(
  {
    organizationId: t.string(),
    jobId: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    // Primary-key lookup; the org check stays as an authorization guard so a
    // caller cannot touch another tenant's job by guessing its id.
    const existing = findById(ctx.db.aiJob, args.jobId);
    if (existing && existing.organizationId !== args.organizationId) {
      unauthorized('Job belongs to another organization');
    }
    if (existing) ctx.db.aiJob.delete(existing);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TRAINING REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

function requireGradingPermission(member: { role: string; permissions: string }) {
  if (member.role === 'owner' || member.role === 'manager') return;
  let perms: { training_grading?: { edit?: boolean } } = {};
  try {
    perms = JSON.parse(member.permissions);
  } catch {
    /* noop */
  }
  if (!perms.training_grading?.edit) unauthorized('No training_grading permission');
}

/** Trainers grade other people. A member with grading rights who is also a
 *  trainee must not pass, fail, clear, sign off or dismiss their own training.
 *  The service identity's virtual member id ('service') never matches. */
function forbidSelfGrading(member: { id: { toString(): string } }, traineeId: string) {
  if (member.id.toString() === traineeId) {
    throw new SenderError("You can't grade your own training");
  }
}

// ── Curriculum: Days ─────────────────────────────────────────────────────────

export const addTrainingDay = spacetimedb.reducer(
  {
    organizationId: t.string(),
    dayNumber: t.i32(),
    title: t.string(),
    description: t.option(t.string()),
    sortOrder: t.i32(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    ctx.db.trainingDay.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      dayNumber: args.dayNumber,
      title: args.title,
      description: args.description,
      sortOrder: args.sortOrder,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateTrainingDay = spacetimedb.reducer(
  {
    organizationId: t.string(),
    dayId: t.string(),
    dayNumber: t.i32(),
    title: t.string(),
    description: t.option(t.string()),
    sortOrder: t.i32(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const day = findItemInOrg(ctx.db.trainingDay, args.organizationId, args.dayId);
    ctx.db.trainingDay.delete(day);
    ctx.db.trainingDay.insert({
      ...day,
      dayNumber: args.dayNumber,
      title: args.title,
      description: args.description,
      sortOrder: args.sortOrder,
      updatedAt: ctx.timestamp,
    });
  }
);

export const deleteTrainingDay = spacetimedb.reducer(
  { organizationId: t.string(), dayId: t.string() },
  (ctx, { organizationId, dayId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const day = findItemInOrg(ctx.db.trainingDay, organizationId, dayId);

    // Cascade: delete objectives, day-grades, and objective-grades attached to
    // this day. Every lookup below goes through an existing btree index. The
    // previous version scanned training_objective_grade once per objective —
    // O(objectives x grades) on tables that only ever grow.
    for (const obj of [...ctx.db.trainingObjective.byDayId.filter(dayId)]) {
      if (obj.organizationId !== organizationId) continue;
      for (const g of [...ctx.db.trainingObjectiveGrade.byObjectiveId.filter(obj.id.toString())]) {
        if (g.organizationId === organizationId) ctx.db.trainingObjectiveGrade.delete(g);
      }
      ctx.db.trainingObjective.delete(obj);
    }
    for (const g of [...ctx.db.trainingDayGrade.byDayId.filter(dayId)]) {
      if (g.organizationId === organizationId) ctx.db.trainingDayGrade.delete(g);
    }
    for (const r of [...ctx.db.trainingReviewRequest.byDayId.filter(dayId)]) {
      if (r.organizationId === organizationId) ctx.db.trainingReviewRequest.delete(r);
    }

    ctx.db.trainingDay.delete(day);
  }
);

// ── Curriculum: Objectives ──────────────────────────────────────────────────

export const addTrainingObjective = spacetimedb.reducer(
  {
    organizationId: t.string(),
    dayId: t.string(),
    text: t.string(),
    mediaUrl: t.option(t.string()),
    mediaType: t.option(t.string()),
    sortOrder: t.i32(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    // Verify the day exists in this org.
    findItemInOrg(ctx.db.trainingDay, args.organizationId, args.dayId);

    ctx.db.trainingObjective.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      dayId: args.dayId,
      text: args.text,
      mediaUrl: args.mediaUrl,
      mediaType: args.mediaType,
      sortOrder: args.sortOrder,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateTrainingObjective = spacetimedb.reducer(
  {
    organizationId: t.string(),
    objectiveId: t.string(),
    text: t.string(),
    mediaUrl: t.option(t.string()),
    mediaType: t.option(t.string()),
    sortOrder: t.i32(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const obj = findItemInOrg(ctx.db.trainingObjective, args.organizationId, args.objectiveId);
    ctx.db.trainingObjective.delete(obj);
    ctx.db.trainingObjective.insert({
      ...obj,
      text: args.text,
      mediaUrl: args.mediaUrl,
      mediaType: args.mediaType,
      sortOrder: args.sortOrder,
      updatedAt: ctx.timestamp,
    });
  }
);

export const deleteTrainingObjective = spacetimedb.reducer(
  { organizationId: t.string(), objectiveId: t.string() },
  (ctx, { organizationId, objectiveId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const obj = findItemInOrg(ctx.db.trainingObjective, organizationId, objectiveId);
    for (const g of [...ctx.db.trainingObjectiveGrade.byObjectiveId.filter(objectiveId)]) {
      if (g.organizationId === organizationId) ctx.db.trainingObjectiveGrade.delete(g);
    }
    ctx.db.trainingObjective.delete(obj);
  }
);

// ── Grading: per-objective (upsert) ─────────────────────────────────────────

export const gradeTrainingObjective = spacetimedb.reducer(
  {
    organizationId: t.string(),
    traineeId: t.string(),
    objectiveId: t.string(),
    status: t.string(),              // 'pass' | 'fail'
    comment: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    requireGradingPermission(member);
    forbidSelfGrading(member, args.traineeId);

    // Verify the objective belongs to this org.
    findItemInOrg(ctx.db.trainingObjective, args.organizationId, args.objectiveId);

    for (const g of [...ctx.db.trainingObjectiveGrade.byObjectiveId.filter(args.objectiveId)]) {
      if (g.organizationId === args.organizationId && g.traineeId === args.traineeId) {
        ctx.db.trainingObjectiveGrade.delete(g);
      }
    }

    ctx.db.trainingObjectiveGrade.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      traineeId: args.traineeId,
      objectiveId: args.objectiveId,
      status: args.status,
      comment: args.comment,
      gradedBy: ctx.sender,
      gradedAt: ctx.timestamp,
    });
  }
);

export const clearTrainingObjectiveGrade = spacetimedb.reducer(
  {
    organizationId: t.string(),
    traineeId: t.string(),
    objectiveId: t.string(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    requireGradingPermission(member);
    forbidSelfGrading(member, args.traineeId);

    for (const g of [...ctx.db.trainingObjectiveGrade.byObjectiveId.filter(args.objectiveId)]) {
      if (g.organizationId === args.organizationId && g.traineeId === args.traineeId) {
        ctx.db.trainingObjectiveGrade.delete(g);
      }
    }
  }
);

// ── Grading: per-day (upsert) ───────────────────────────────────────────────

export const gradeTrainingDay = spacetimedb.reducer(
  {
    organizationId: t.string(),
    traineeId: t.string(),
    dayId: t.string(),
    rating: t.i32(),                 // 1..5
    comment: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    requireGradingPermission(member);
    forbidSelfGrading(member, args.traineeId);

    findItemInOrg(ctx.db.trainingDay, args.organizationId, args.dayId);

    for (const g of [...ctx.db.trainingDayGrade.byDayId.filter(args.dayId)]) {
      if (
        g.organizationId === args.organizationId &&
        g.traineeId === args.traineeId
      ) {
        ctx.db.trainingDayGrade.delete(g);
      }
    }

    ctx.db.trainingDayGrade.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      traineeId: args.traineeId,
      dayId: args.dayId,
      rating: args.rating,
      comment: args.comment,
      gradedBy: ctx.sender,
      gradedAt: ctx.timestamp,
    });

    // Grading a day settles any pending review request for it.
    for (const r of [...ctx.db.trainingReviewRequest.byDayId.filter(args.dayId)]) {
      if (
        r.organizationId === args.organizationId &&
        r.traineeId === args.traineeId &&
        r.status === 'pending'
      ) {
        ctx.db.trainingReviewRequest.delete(r);
        ctx.db.trainingReviewRequest.insert({
          ...r,
          status: 'resolved',
          resolvedAt: ctx.timestamp,
          resolvedBy: ctx.sender,
        });
      }
    }
  }
);

// ── Grading: final overall (upsert) ─────────────────────────────────────────

// ── Review requests (intern → trainer) ──────────────────────────────────────

/** Intern asks a trainer to review the day they just finished. Idempotent —
 *  an existing pending request for the same (trainee, day) is kept as-is. */
export const requestTrainingReview = spacetimedb.reducer(
  { organizationId: t.string(), dayId: t.string() },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    findItemInOrg(ctx.db.trainingDay, args.organizationId, args.dayId);

    const traineeId = member.id.toString();
    const existing = [...ctx.db.trainingReviewRequest.byDayId.filter(args.dayId)].find(
      (r) =>
        r.organizationId === args.organizationId &&
        r.traineeId === traineeId &&
        r.status === 'pending'
    );
    if (existing) return;

    ctx.db.trainingReviewRequest.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      traineeId,
      dayId: args.dayId,
      status: 'pending',
      createdAt: ctx.timestamp,
      resolvedAt: undefined,
      resolvedBy: undefined,
    });
  }
);

export const resolveTrainingReview = spacetimedb.reducer(
  { organizationId: t.string(), requestId: t.string() },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    requireGradingPermission(member);

    const req = findItemInOrg(ctx.db.trainingReviewRequest, args.organizationId, args.requestId);
    forbidSelfGrading(member, String(req.traineeId));
    ctx.db.trainingReviewRequest.delete(req);
    ctx.db.trainingReviewRequest.insert({
      ...req,
      status: 'resolved',
      resolvedAt: ctx.timestamp,
      resolvedBy: ctx.sender,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY BRIEFING + SCHEDULE PROPOSAL REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upsert today's morning briefing for an org. Idempotent on (orgId, date) —
 * calling again overwrites. Owner/manager only.
 */
export const saveDailyBriefing = spacetimedb.reducer(
  {
    organizationId: t.string(),
    date: t.string(),
    content: t.string(),
    summary: t.option(t.string()),
    generatedBy: t.string(),
    actions: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    // One briefing per (org, date) — replace whatever the day already has.
    for (const row of [...ctx.db.dailyBriefing.byOrganizationId.filter(args.organizationId)]) {
      if (row.date === args.date) ctx.db.dailyBriefing.delete(row);
    }

    ctx.db.dailyBriefing.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      date: args.date,
      content: args.content,
      summary: args.summary,
      generatedBy: args.generatedBy,
      generatedAt: ctx.timestamp,
      actions: args.actions,
      problemKeys: undefined,
      hour: undefined,
    });
  }
);

/**
 * Set Mr. Merchiva's autonomy config (JSON-encoded AutonomyConfig). Owner only —
 * granting the assistant autonomous write power is a trust decision, like the
 * auto-commit toggle. The client validates the JSON shape; we pass it through.
 */
export const setAssistantConfig = spacetimedb.reducer(
  { organizationId: t.string(), config: t.string() },
  (ctx, { organizationId, config }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role !== 'owner') unauthorized('Owner only');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      assistantConfig: config,
      updatedAt: ctx.timestamp,
    });
  }
);

/** Set org-level beta feature flags. */
export const setBetaFeatures = spacetimedb.reducer(
  { organizationId: t.string(), config: t.string() },
  (ctx, { organizationId, config }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.settings?.view) unauthorized('No settings permission');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      betaFeatures: config,
      updatedAt: ctx.timestamp,
    });
  }
);

/** Set which optional device apps are installed on /store + /personal.
 *  Owners / managers, or anyone with settings edit permission. */
export const setDeviceApps = spacetimedb.reducer(
  { organizationId: t.string(), config: t.string() },
  (ctx, { organizationId, config }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    const isManager = member.role === 'owner' || member.role === 'manager';
    if (!isManager && !perms.settings?.edit) unauthorized('No permission to manage device apps');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      deviceApps: config,
      updatedAt: ctx.timestamp,
    });
  }
);

// Owner/manager sets the store's weekly opening hours and (optionally) the
// country code used to look up public holidays. `openingHours` is a JSON
// string the client validates; we pass it through without re-parsing here.
export const updateOpeningHours = spacetimedb.reducer(
  {
    organizationId: t.string(),
    openingHours: t.option(t.string()),
    countryCode: t.option(t.string()),
  },
  (ctx, { organizationId, openingHours, countryCode }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new SenderError('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      openingHours: openingHours ?? existing.openingHours,
      countryCode: countryCode ?? existing.countryCode,
      updatedAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE TASK ASSIGNMENTS — todos materialized from RoleTask templates
// ═══════════════════════════════════════════════════════════════════════════════

// Manager assigns a role-task to a specific staff member with a due time.
export const assignRoleTask = spacetimedb.reducer(
  {
    organizationId: t.string(),
    taskId: t.string(),
    memberId: t.string(),
    dueAt: t.timestamp(),
  },
  (ctx, { organizationId, taskId, memberId, dueAt }) => {
    findActiveMember(ctx, organizationId);

    // Sanity-check that the referenced task and member belong to this org.
    const task = [...ctx.db.roleTask.byOrganizationId.filter(organizationId)]
      .find(r => r.id.toString() === taskId);
    if (!task) throw new SenderError('Role task not found');
    const member = [...ctx.db.staffMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId);
    if (!member) throw new SenderError('Staff member not found');

    ctx.db.roleTaskAssignment.insert({
      id: ctx.newUuidV4(),
      organizationId,
      taskId,
      memberId,
      dueAt,
      status: 'pending',
      evidenceUrl: undefined,
      note: undefined,
      completedAt: undefined,
      completedBy: undefined,
      skipReason: undefined,
      createdAt: ctx.timestamp,
      createdBy: ctx.sender,
      evidenceUrls: undefined,
    });
  }
);

// Staff member marks an assignment done. evidenceUrl/note are optional —
// even if the underlying RoleTask requires evidence, validation is on the
// client side so a manager can still complete on behalf of someone without
// re-uploading a photo.
export const completeRoleTask = spacetimedb.reducer(
  {
    organizationId: t.string(),
    assignmentId: t.string(),
    evidenceUrl: t.option(t.string()),
    note: t.option(t.string()),
    evidenceUrls: t.option(t.string()),  // JSON array of { url, type }
  },
  (ctx, { organizationId, assignmentId, evidenceUrl, note, evidenceUrls }) => {
    findActiveMember(ctx, organizationId);

    const existing = [...ctx.db.roleTaskAssignment.byOrganizationId.filter(organizationId)]
      .find(a => a.id.toString() === assignmentId);
    if (!existing) throw new SenderError('Assignment not found');

    ctx.db.roleTaskAssignment.delete(existing);
    ctx.db.roleTaskAssignment.insert({
      ...existing,
      status: 'completed',
      evidenceUrl: evidenceUrl ?? existing.evidenceUrl,
      note: note ?? existing.note,
      completedAt: ctx.timestamp,
      completedBy: ctx.sender,
      skipReason: undefined,
      evidenceUrls: evidenceUrls ?? existing.evidenceUrls,
    });
  }
);

// Marks an assignment as skipped — used when a task no longer applies (e.g.
// store closed early, equipment broken). Keeps the row for audit.
export const skipRoleTask = spacetimedb.reducer(
  {
    organizationId: t.string(),
    assignmentId: t.string(),
    reason: t.option(t.string()),
  },
  (ctx, { organizationId, assignmentId, reason }) => {
    findActiveMember(ctx, organizationId);

    const existing = [...ctx.db.roleTaskAssignment.byOrganizationId.filter(organizationId)]
      .find(a => a.id.toString() === assignmentId);
    if (!existing) throw new SenderError('Assignment not found');

    ctx.db.roleTaskAssignment.delete(existing);
    ctx.db.roleTaskAssignment.insert({
      ...existing,
      status: 'skipped',
      skipReason: reason,
      completedAt: ctx.timestamp,
      completedBy: ctx.sender,
    });
  }
);

// Manager removes an assignment that was created in error.
export const deleteRoleTaskAssignment = spacetimedb.reducer(
  { organizationId: t.string(), assignmentId: t.string() },
  (ctx, { organizationId, assignmentId }) => {
    findActiveMember(ctx, organizationId);

    const existing = [...ctx.db.roleTaskAssignment.byOrganizationId.filter(organizationId)]
      .find(a => a.id.toString() === assignmentId);
    if (!existing) throw new SenderError('Assignment not found');

    ctx.db.roleTaskAssignment.delete(existing);
  }
);

// One-shot completion: insert a row that's already marked "completed". This is
// the primary path — the staff member opens the Tasks tab, sees the role tasks
// for their org, taps "Complete" on one, uploads an evidence photo + optional
// note, and we record the completion directly. No pre-assignment step needed.
//
// memberId is optional — when the caller is a staff member completing their
// own task, the client can pass their StaffMember.id; if it's a manager
// completing on behalf of someone, pass that member's id; if neither is known,
// it stays empty (completedBy still records the identity).
export const recordTaskCompletion = spacetimedb.reducer(
  {
    organizationId: t.string(),
    taskId: t.string(),
    memberId: t.option(t.string()),
    evidenceUrl: t.option(t.string()),
    note: t.option(t.string()),
    evidenceUrls: t.option(t.string()),  // JSON array of { url, type }
  },
  (ctx, { organizationId, taskId, memberId, evidenceUrl, note, evidenceUrls }) => {
    findActiveMember(ctx, organizationId);

    const task = [...ctx.db.roleTask.byOrganizationId.filter(organizationId)]
      .find(r => r.id.toString() === taskId);
    if (!task) throw new SenderError('Role task not found');

    ctx.db.roleTaskAssignment.insert({
      id: ctx.newUuidV4(),
      organizationId,
      taskId,
      memberId: memberId ?? "",
      dueAt: ctx.timestamp,
      status: 'completed',
      evidenceUrl,
      note,
      completedAt: ctx.timestamp,
      completedBy: ctx.sender,
      skipReason: undefined,
      createdAt: ctx.timestamp,
      createdBy: ctx.sender,
      evidenceUrls,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PUSH SUBSCRIPTION REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

// Upsert the calling identity's subscription for a given endpoint. The endpoint
// is the unique identifier the browser hands us — if it changes (different
// device/browser), we insert a new row; if it matches, we update the keys.
export const savePushSubscription = spacetimedb.reducer(
  {
    organizationId: t.string(),
    endpoint: t.string(),
    p256dh: t.string(),
    auth: t.string(),
    userAgent: t.option(t.string()),
  },
  (ctx, { organizationId, endpoint, p256dh, auth, userAgent }) => {
    findActiveMember(ctx, organizationId);

    const existing = [...ctx.db.pushSubscription.byTargetId.filter(ctx.sender)]
      .find((row) => row.endpoint === endpoint && row.organizationId === organizationId);

    if (existing) {
      ctx.db.pushSubscription.delete(existing);
    }

    ctx.db.pushSubscription.insert({
      id: ctx.newUuidV4(),
      organizationId,
      targetId: ctx.sender,
      endpoint,
      p256dh,
      auth,
      userAgent,
      createdAt: ctx.timestamp,
    });
  }
);

// Remove a subscription by endpoint. Used when the user disables notifications,
// or when the server reports a 404/410 indicating the subscription has expired.
export const deletePushSubscription = spacetimedb.reducer(
  {
    organizationId: t.string(),
    endpoint: t.string(),
  },
  (ctx, { organizationId, endpoint }) => {
    findActiveMember(ctx, organizationId);

    const existing = [...ctx.db.pushSubscription.byTargetId.filter(ctx.sender)]
      .find((row) => row.endpoint === endpoint && row.organizationId === organizationId);

    if (existing) {
      ctx.db.pushSubscription.delete(existing);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireAdmin(ctx: any): void {
  if (isServiceCaller(ctx)) return;
  const me = ctx.db.user.identity.find(ctx.sender);
  if (!me || me.isAdmin !== true) unauthorized('Admin only');
}

// First-time bootstrap. The very first admin claims the role by matching their
// email against the one passed in. Only succeeds if no admins exist yet.
export const claimFirstAdmin = spacetimedb.reducer(
  { email: t.string() },
  (ctx, { email }) => {
    const anyAdmin = [...ctx.db.user.iter()].some((u) => u.isAdmin === true);
    if (anyAdmin) unauthorized('Admin already claimed');

    const me = ctx.db.user.identity.find(ctx.sender);
    if (!me) unauthorized('No user record');
    if (me.email !== email) unauthorized('Email mismatch');

    ctx.db.user.identity.update({ ...me, isAdmin: true });
  }
);

// Promote / demote another user. Caller must already be admin.
export const setUserAdmin = spacetimedb.reducer(
  { targetEmail: t.string(), isAdmin: t.bool() },
  (ctx, { targetEmail, isAdmin }) => {
    requireAdmin(ctx);
    const target = [...ctx.db.user.byEmail.filter(targetEmail)][0];
    if (!target) throw new SenderError('User not found');
    ctx.db.user.identity.update({ ...target, isAdmin });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOG POST REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createBlogPost = spacetimedb.reducer(
  {
    slug: t.string(),
    title: t.string(),
    excerpt: t.string(),
    contentMd: t.string(),
    coverImage: t.option(t.string()),
    status: t.string(),
    authorName: t.option(t.string()),
  },
  (ctx, { slug, title, excerpt, contentMd, coverImage, status, authorName }) => {
    requireAdmin(ctx);
    const dup = [...ctx.db.blogPost.bySlug.filter(slug)][0];
    if (dup) throw new SenderError('Slug already in use');
    const published = status === 'published' ? ctx.timestamp : undefined;
    ctx.db.blogPost.insert({
      id: ctx.newUuidV4(),
      slug,
      title,
      excerpt,
      contentMd,
      coverImage,
      status,
      authorIdentity: ctx.sender,
      authorName,
      publishedAt: published,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateBlogPost = spacetimedb.reducer(
  {
    postId: t.string(),
    slug: t.string(),
    title: t.string(),
    excerpt: t.string(),
    contentMd: t.string(),
    coverImage: t.option(t.string()),
    status: t.string(),
  },
  (ctx, { postId, slug, title, excerpt, contentMd, coverImage, status }) => {
    requireAdmin(ctx);
    const existing = [...ctx.db.blogPost.iter()].find((p) => p.id.toString() === postId);
    if (!existing) throw new SenderError('Post not found');
    if (existing.slug !== slug) {
      const dup = [...ctx.db.blogPost.bySlug.filter(slug)][0];
      if (dup) throw new SenderError('Slug already in use');
    }
    const wasPublished = existing.status === 'published';
    const nowPublished = status === 'published';
    ctx.db.blogPost.delete(existing);
    ctx.db.blogPost.insert({
      ...existing,
      slug,
      title,
      excerpt,
      contentMd,
      coverImage,
      status,
      publishedAt: !wasPublished && nowPublished ? ctx.timestamp : existing.publishedAt,
      updatedAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE IDENTITY REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isServiceCaller(ctx: any): boolean {
  return ctx.db.serviceIdentity.identity.find(ctx.sender) !== undefined;
}

/**
 * Bootstrap the first service identity.
 *
 * - If the service_identity table is EMPTY, ctx.sender is added. The operator
 *   runs scripts/bootstrap-service-identity.ts immediately after first deploy
 *   to claim this slot.
 * - If the table is non-empty, only an existing service identity may register
 *   another.
 *
 * NOTE: deploy + bootstrap must happen back-to-back. Any caller hitting this
 * before the operator races them and wins. The bootstrap script logs the
 * resulting identity hex so the operator can verify it's the expected one.
 */
export const registerServiceIdentity = spacetimedb.reducer(
  { label: t.string() },
  (ctx, { label }) => {
    const existingCount = [...ctx.db.serviceIdentity.iter()].length;
    if (existingCount > 0 && !isServiceCaller(ctx)) {
      unauthorized('Service identity already bootstrapped; only existing service may add more');
    }
    const already = ctx.db.serviceIdentity.identity.find(ctx.sender);
    if (already) return;
    ctx.db.serviceIdentity.insert({
      identity: ctx.sender,
      label,
      registeredAt: ctx.timestamp,
    });
  }
);

export const serviceRepairInventoryItem = spacetimedb.reducer(
  {
    organizationId: t.string(),
    itemId: t.string(),
    name: t.string(),
    category: t.string(),
    currentStock: t.number(),
    minStock: t.number(),
    maxStock: t.number(),
    unit: t.string(),
    costPerUnit: t.number(),
    supplier: t.string(),
    lastRestocked: t.string(),
    lossRate: t.number(),
    minOrderQty: t.option(t.number()),
    unitsPerCase: t.option(t.number()),
    description: t.option(t.string()),
    unitContentAmount: t.option(t.number()),
    unitContentUnit: t.option(t.string()),
    retailEnabled: t.option(t.bool()),
    retailPrice: t.option(t.number()),
    retailDescription: t.option(t.string()),
    retailImageUrl: t.option(t.string()),
    retailUsageQty: t.option(t.number()),
    expirationBatches: t.option(t.string()),
  },
  (ctx, args) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');

    const item = findItemInOrg(ctx.db.inventoryItem, args.organizationId, args.itemId);
    ctx.db.inventoryItem.delete(item);
    ctx.db.inventoryItem.insert({
      ...item,
      name: args.name,
      category: args.category,
      currentStock: args.currentStock,
      minStock: args.minStock,
      maxStock: args.maxStock,
      unit: args.unit,
      costPerUnit: args.costPerUnit,
      costPerUnitCents: toCents(args.costPerUnit),
      supplier: args.supplier,
      lastRestocked: args.lastRestocked,
      lossRate: args.lossRate,
      updatedAt: ctx.timestamp,
      minOrderQty: args.minOrderQty,
      unitsPerCase: args.unitsPerCase,
      description: args.description,
      unitContentAmount: args.unitContentAmount,
      unitContentUnit: args.unitContentUnit,
      retailEnabled: args.retailEnabled,
      retailPrice: args.retailPrice,
      retailPriceCents: toCentsOpt(args.retailPrice),
      retailDescription: args.retailDescription,
      retailImageUrl: args.retailImageUrl,
      retailUsageQty: args.retailUsageQty,
      expirationDate: undefined,
      expirationBatches: args.expirationBatches,
    });
  }
);

export const deleteBlogPost = spacetimedb.reducer(
  { postId: t.string() },
  (ctx, { postId }) => {
    requireAdmin(ctx);
    const existing = [...ctx.db.blogPost.iter()].find((p) => p.id.toString() === postId);
    if (!existing) throw new SenderError('Post not found');
    ctx.db.blogPost.delete(existing);
  }
);

/** Service-side: insert a notification targeting an arbitrary user identity. */
export const serviceCreateNotification = spacetimedb.reducer(
  {
    organizationId: t.string(),
    targetIdentity: t.identity(),
    type: t.string(),
    title: t.string(),
    body: t.string(),
    link: t.option(t.string()),
  },
  (ctx, { organizationId, targetIdentity, type, title, body, link }) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');
    ctx.db.notification.insert({
      id: ctx.newUuidV4(),
      organizationId,
      targetId: targetIdentity,
      type,
      title,
      body,
      link: link ?? undefined,
      read: false,
      createdAt: ctx.timestamp,
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// AI USAGE REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service-side: record one AI/LLM call's token usage + pre-computed cost.
 * Called by the API routes through the service identity (they have no
 * logged-in user connection). Costs are computed by the caller so pricing
 * stays in one place (lib/ai/usage.ts).
 */
export const serviceRecordAiUsage = spacetimedb.reducer(
  {
    organizationId: t.string(),
    userId: t.string(),
    feature: t.string(),
    model: t.string(),
    inputTokens: t.number(),
    outputTokens: t.number(),
    inputCost: t.number(),
    outputCost: t.number(),
    cost: t.number(),
    day: t.string(),
    month: t.string(),
    description: t.option(t.string()),
  },
  (ctx, args) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');
    ctx.db.aiUsage.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      userId: args.userId,
      feature: args.feature,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      inputCost: args.inputCost,
      outputCost: args.outputCost,
      cost: args.cost,
      day: args.day,
      month: args.month,
      createdAt: ctx.timestamp,
      description: args.description,
    });
  }
);

/** Admin-only: upsert an org's monthly AI usage quota (null = unlimited). */
export const setAiUsageQuota = spacetimedb.reducer(
  {
    organizationId: t.string(),
    monthlyTokenLimit: t.option(t.number()),
    monthlyCostLimit: t.option(t.number()),
  },
  (ctx, { organizationId, monthlyTokenLimit, monthlyCostLimit }) => {
    requireAdmin(ctx);
    const existing = ctx.db.aiUsageQuota.organizationId.find(organizationId);
    if (existing) {
      ctx.db.aiUsageQuota.organizationId.update({
        ...existing,
        monthlyTokenLimit,
        monthlyCostLimit,
        updatedAt: ctx.timestamp,
      });
    } else {
      ctx.db.aiUsageQuota.insert({
        organizationId,
        monthlyTokenLimit,
        monthlyCostLimit,
        updatedAt: ctx.timestamp,
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM ADMIN REDUCERS (/merchivaAdmin console — service identity only)
// ═══════════════════════════════════════════════════════════════════════════════
//
// All password hashing happens in the Next.js server (scrypt); reducers only
// compare opaque hash strings. Every reducer here requires the service
// identity, so browsers can never call them directly.

const PLATFORM_ADMIN_USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

function normalizePlatformAdminUsername(username: string): string {
  const u = username.trim().toLowerCase();
  if (!PLATFORM_ADMIN_USERNAME_RE.test(u)) {
    throw new SenderError('Username must be 2-32 chars: lowercase letters, digits, . _ -');
  }
  return u;
}

/** Create a platform admin. `createdBy` is the acting admin's username (or "seed"). */
export const platformAdminAdd = spacetimedb.reducer(
  { username: t.string(), passwordHash: t.string(), createdBy: t.string() },
  (ctx, { username, passwordHash, createdBy }) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');
    const u = normalizePlatformAdminUsername(username);
    if (!passwordHash) throw new SenderError('Password hash required');
    if (ctx.db.platformAdmin.username.find(u)) throw new SenderError('Admin already exists');
    ctx.db.platformAdmin.insert({
      username: u,
      createdAt: ctx.timestamp,
      createdBy,
      lastLoginAt: undefined,
    });
    const secret = ctx.db.platformAdminSecret.username.find(u);
    if (secret) ctx.db.platformAdminSecret.delete(secret);
    ctx.db.platformAdminSecret.insert({ username: u, passwordHash, updatedAt: ctx.timestamp });
  }
);

/** Delete a platform admin. The last remaining admin cannot be removed. */
export const platformAdminRemove = spacetimedb.reducer(
  { username: t.string() },
  (ctx, { username }) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');
    const u = username.trim().toLowerCase();
    const row = ctx.db.platformAdmin.username.find(u);
    if (!row) throw new SenderError('Admin not found');
    if ([...ctx.db.platformAdmin.iter()].length <= 1) {
      throw new SenderError('Cannot remove the last platform admin');
    }
    ctx.db.platformAdmin.delete(row);
    const secret = ctx.db.platformAdminSecret.username.find(u);
    if (secret) ctx.db.platformAdminSecret.delete(secret);
  }
);

/** Verify a login. Throws on mismatch; stamps lastLoginAt on success. */
export const platformAdminVerify = spacetimedb.reducer(
  { username: t.string(), passwordHash: t.string() },
  (ctx, { username, passwordHash }) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');
    const u = username.trim().toLowerCase();
    const secret = ctx.db.platformAdminSecret.username.find(u);
    const row = ctx.db.platformAdmin.username.find(u);
    if (!secret || !row || secret.passwordHash !== passwordHash) {
      throw new SenderError('Invalid username or password');
    }
    ctx.db.platformAdmin.username.update({ ...row, lastLoginAt: ctx.timestamp });
  }
);

/** Replace a platform admin's password hash. */
export const platformAdminSetPassword = spacetimedb.reducer(
  { username: t.string(), passwordHash: t.string() },
  (ctx, { username, passwordHash }) => {
    if (!isServiceCaller(ctx)) unauthorized('Service identity required');
    const u = username.trim().toLowerCase();
    if (!ctx.db.platformAdmin.username.find(u)) throw new SenderError('Admin not found');
    if (!passwordHash) throw new SenderError('Password hash required');
    const secret = ctx.db.platformAdminSecret.username.find(u);
    if (secret) ctx.db.platformAdminSecret.delete(secret);
    ctx.db.platformAdminSecret.insert({ username: u, passwordHash, updatedAt: ctx.timestamp });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// DOCS REDUCERS (Merchiva Docs — collaborative documents)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Access model — lib/docs/access.ts resolveDocAccess MUST match:
//   - Gate: the org owner (the service identity resolves to serviceMember(), a
//     virtual owner) or a member whose permissions resolve dashboard.view ===
//     true — the same check as can('dashboard','view') + PermissionGuard
//     section="dashboard" on the client (see docMemberGate).
//   - Inside the gate: org owners, org managers and the doc's owner → 'manager';
//     everyone else → the higher of the visibility role (org_edit → editor,
//     org_view → viewer, private → none) and any document_access grant.
//   - viewer: open, star, presence · commenter: + comment, reply, resolve ·
//     editor: + push, compact, versions, rename, meta · manager: + visibility,
//     grants, trash/restore/delete forever, delete any comment or version.
// Writes to a trashed doc are rejected except restore / delete forever.
// Presence is not a write to the doc: it stays allowed on a trashed doc, which
// managers can still open (a rejected heartbeat would end a session for good).
// Clearing a named version's name puts it back into autosave pruning, so it
// needs the same rights as deleting the version (creator or manager).
// Reducer errors carry a stable prefix `[doc.<code>] Human text` that
// lib/docs/errors.ts docErrorCode parses.

const DOC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DOC_VISIBILITIES = ['org_edit', 'org_view', 'private'] as const;
const DOC_GRANT_ROLES = ['viewer', 'commenter', 'editor'] as const;
const DOC_ROLE_RANK = { none: 0, viewer: 1, commenter: 2, editor: 3, manager: 4 } as const;
type DocRole = keyof typeof DOC_ROLE_RANK;
type DocGrantRole = (typeof DOC_GRANT_ROLES)[number];
type DocErrorCode = 'not_found' | 'forbidden' | 'trashed' | 'too_large' | 'invalid';
const DOC_TITLE_MAX = 200;
const DOC_EXCERPT_MAX = 280;
const DOC_TEXT_MAX_CHARS = 200_000;
const DOC_HTML_MAX_CHARS = 1_000_000;
const DOC_UPDATE_MAX_BYTES = 1_048_576;          // = DEFAULT_DOC_TUNING.updateMaxBytes
const DOC_STATE_MAX_BYTES = 8_388_608;           // = DEFAULT_DOC_TUNING.stateMaxBytes
const DOC_PRESENCE_MAX_BYTES = 16_384;
const DOC_PRESENCE_TTL_MICROS = 90_000_000n;
const DOC_TOUCH_GAP_MICROS = 30_000_000n;
const DOC_AUTO_VERSION_GAP_MICROS = 600_000_000n;
const DOC_AUTO_VERSION_KEEP = 50;
const DOC_NAMED_VERSION_MAX = 200;
const DOC_VERSION_NAME_MAX = 80;
const DOC_COMMENT_MAX = 4_000;
const DOC_QUOTE_MAX = 500;
const DOC_COMMENT_ANCHOR_MAX_BYTES = 1_024;       // = COMMENT_ANCHOR_MAX_BYTES in lib/docs/comment-anchors.ts
const DOC_COMMENT_ANCHOR_FORMAT = 1;
const DOC_MENTIONS_MAX = 20;
const DOC_TEMPLATE_ID_MAX = 64;
const DOC_SESSION_ID_MAX = 64;
const DOC_PAGE_SETUP_MAX = 512;
const DOC_ICON_MAX_CODEPOINTS = 8;               // one emoji, including ZWJ sequences
const DOC_PRESENCE_NAME_MAX = 80;
const DOC_PRESENCE_DEFAULT_COLOR = '#57534e';
const DOC_NOTIFY_BODY_MAX = 200;

/** The member shape the docs helpers need (a real org_member row or serviceMember()). */
type DocMemberLike = { id: { toString(): string }; role: string; permissions: string };
/** The document fields that decide access. */
type DocAccessSubject = { id: string; ownerMemberId: string; visibility: string };

function docError(code: DocErrorCode, message: string): SenderError {
  return new SenderError(`[doc.${code}] ${message}`);
}

function clampChars(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function cleanDocTitle(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, DOC_TITLE_MAX);
}

/** MUST stay identical to lib/docs/text.ts docExcerpt. */
function docExcerpt(plainText: string): string {
  return plainText.replace(/\s+/g, ' ').trim().slice(0, DOC_EXCERPT_MAX);
}

function isDocVisibility(v: string): boolean {
  return (DOC_VISIBILITIES as readonly string[]).includes(v);
}

function isDocGrantRole(v: string): v is DocGrantRole {
  return (DOC_GRANT_ROLES as readonly string[]).includes(v);
}

/**
 * Docs section gate. Mirrors the client exactly: app/manager/layout.tsx merges
 * the stored JSON over the role defaults (`{ ...defaults, ...JSON.parse(p) }`,
 * falling back to the defaults when the JSON is unreadable), and can() then
 * requires `dashboard.view === true` for non-owners. Both role defaults grant
 * dashboard.view, so a missing `dashboard` key or unreadable JSON passes, while
 * an explicit `dashboard: { view: false }` (or any non-true view) fails.
 */
function docMemberGate(member: { role: string; permissions: string }): boolean {
  if (member.role === 'owner') return true;
  let stored: unknown;
  try {
    stored = JSON.parse(member.permissions || '{}');
  } catch {
    return true;
  }
  if (stored === null || typeof stored !== 'object' || !('dashboard' in stored)) return true;
  const dashboard = (stored as { dashboard: unknown }).dashboard;
  return typeof dashboard === 'object' && dashboard !== null && (dashboard as { view?: unknown }).view === true;
}

/**
 * Role of `member` on `doc`. Evaluates the given member, never ctx.sender, so
 * notifyDocMembers / pruneDocPresence can use it for other members too. The
 * service identity is covered by its virtual owner member.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docRoleFor(ctx: any, doc: DocAccessSubject, member: DocMemberLike): DocRole {
  if (member.role === 'owner') return 'manager';
  if (!docMemberGate(member)) return 'none';
  const memberId = member.id.toString();
  if (member.role === 'manager' || doc.ownerMemberId === memberId) return 'manager';
  let role: DocRole = doc.visibility === 'org_edit' ? 'editor' : doc.visibility === 'org_view' ? 'viewer' : 'none';
  for (const grant of ctx.db.documentAccess.byDocumentId.filter(doc.id)) {
    if (grant.memberId !== memberId) continue;
    const granted = String(grant.role);
    if (isDocGrantRole(granted) && DOC_ROLE_RANK[granted] > DOC_ROLE_RANK[role]) role = granted;
  }
  return role;
}

/** findActiveMember, with its "Not an active member…" failure mapped to [doc.forbidden]. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findDocMember(ctx: any, organizationId: string): DocMemberLike {
  try {
    return findActiveMember(ctx, organizationId);
  } catch {
    throw docError('forbidden', 'Not an active member of this organization');
  }
}

/** Load a doc, resolve the caller's membership in ITS org and enforce a minimum role. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireDoc(ctx: any, documentId: string, min: Exclude<DocRole, 'none'>, opts: { allowTrashed?: boolean } = {}) {
  const doc = ctx.db.document.id.find(String(documentId).toLowerCase());
  if (!doc) throw docError('not_found', 'Document not found');
  const member = findDocMember(ctx, doc.organizationId);
  const role = docRoleFor(ctx, doc, member);
  if (DOC_ROLE_RANK[role] < DOC_ROLE_RANK[min]) throw docError('forbidden', 'You do not have access to this document');
  if (doc.trashedAt !== undefined && !opts.allowTrashed) throw docError('trashed', 'Document is in the trash');
  return { doc, member, role, memberId: member.id.toString() };
}

/** Throttled metadata bump so every keystroke batch doesn't rebroadcast the doc row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function touchDocument(ctx: any, doc: any, memberId: string): void {
  const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
  const lastTouched: bigint = doc.updatedAt.microsSinceUnixEpoch;
  if (doc.lastEditorMemberId === memberId && now - lastTouched < DOC_TOUCH_GAP_MICROS) return;
  ctx.db.document.id.update({ ...doc, updatedAt: ctx.timestamp, lastEditorMemberId: memberId });
}

/** After visibility / grant changes: drop presence of members who lost access and refresh canEdit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pruneDocPresence(ctx: any, doc: any): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = new Map<string, any>();
  for (const m of ctx.db.orgMember.byOrganizationId.filter(doc.organizationId)) members.set(m.id.toString(), m);
  for (const p of [...ctx.db.documentPresence.byDocumentId.filter(doc.id)]) {
    const m = members.get(p.memberId);
    const role: DocRole = m && m.status === 'active' ? docRoleFor(ctx, doc, m) : 'none';
    if (DOC_ROLE_RANK[role] < DOC_ROLE_RANK.viewer) {
      ctx.db.documentPresence.delete(p);
      continue;
    }
    const canEdit = DOC_ROLE_RANK[role] >= DOC_ROLE_RANK.editor;
    if (canEdit !== p.canEdit) ctx.db.documentPresence.id.update({ ...p, canEdit });
  }
}

/** Delete every row that belongs to a document, then the document itself. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function purgeDocumentRows(ctx: any, doc: any): void {
  const id: string = doc.id;
  for (const r of [...ctx.db.documentUpdate.byDocumentId.filter(id)]) ctx.db.documentUpdate.delete(r);
  const snap = ctx.db.documentSnapshot.documentId.find(id);
  if (snap) ctx.db.documentSnapshot.delete(snap);
  for (const r of [...ctx.db.documentPresence.byDocumentId.filter(id)]) ctx.db.documentPresence.delete(r);
  for (const r of [...ctx.db.documentComment.byDocumentId.filter(id)]) ctx.db.documentComment.delete(r);
  for (const r of [...ctx.db.documentVersion.byDocumentId.filter(id)]) ctx.db.documentVersion.delete(r);
  for (const r of [...ctx.db.documentStar.byDocumentId.filter(id)]) ctx.db.documentStar.delete(r);
  for (const r of [...ctx.db.documentAccess.byDocumentId.filter(id)]) ctx.db.documentAccess.delete(r);
  ctx.db.document.delete(doc);
}

function cleanCommentBody(raw: string): string {
  const body = raw.trim();
  if (!body) throw docError('invalid', 'Comment cannot be empty');
  if (body.length > DOC_COMMENT_MAX) throw docError('invalid', `Comments are limited to ${DOC_COMMENT_MAX} characters`);
  return body;
}

/**
 * Optional position anchor of a new thread: [format, count (2 or 4), (varuint length, bytes) × count], each entry a
 * Yjs relative position (range start/end, then the blocks holding them). Only this envelope and the size are checked;
 * clients resolve the positions and treat anything unusable as detached. Empty means none.
 */
function cleanCommentAnchor(raw: Uint8Array | undefined): Uint8Array | undefined {
  if (raw === undefined || raw.length === 0) return undefined;
  if (raw.length > DOC_COMMENT_ANCHOR_MAX_BYTES) throw docError('too_large', 'Comment anchor is too large');
  const invalid = () => docError('invalid', 'Invalid comment anchor');
  if (raw[0] !== DOC_COMMENT_ANCHOR_FORMAT || raw.length < 2 || (raw[1] !== 2 && raw[1] !== 4)) throw invalid();
  let offset = 2;
  for (let i = 0; i < raw[1]; i++) {
    let length = 0;
    let factor = 1;
    for (let used = 0; ; used++) {
      if (offset >= raw.length || used === 3) throw invalid();
      const byte = raw[offset++];
      length += (byte & 0x7f) * factor;
      if (byte < 0x80) break;
      factor *= 0x80;
    }
    // A relative position takes at least two bytes.
    if (length < 2 || offset + length > raw.length) throw invalid();
    offset += length;
  }
  if (offset !== raw.length) throw invalid();
  return raw;
}

/** JSON string[] → de-duplicated ids of ACTIVE members of the org (input order kept), at most DOC_MENTIONS_MAX. Bad JSON → []. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMentionIds(ctx: any, organizationId: string, raw: string | undefined): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return [];
  const active = new Set<string>();
  for (const m of ctx.db.orgMember.byOrganizationId.filter(organizationId)) {
    if (m.status === 'active') active.add(m.id.toString());
  }
  const out: string[] = [];
  for (const value of parsed) {
    if (out.length >= DOC_MENTIONS_MAX) break;
    if (typeof value !== 'string' || !active.has(value) || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findDocComment(ctx: any, documentId: string, commentId: string) {
  const wanted = String(commentId).toLowerCase();
  for (const c of ctx.db.documentComment.byDocumentId.filter(documentId)) {
    if (c.id.toString().toLowerCase() === wanted) return c;
  }
  throw docError('not_found', 'Comment not found');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findDocVersion(ctx: any, documentId: string, versionId: string) {
  const wanted = String(versionId).toLowerCase();
  for (const v of ctx.db.documentVersion.byDocumentId.filter(documentId)) {
    if (v.id.toString().toLowerCase() === wanted) return v;
  }
  return undefined;
}

function docLink(documentId: string, threadId?: string): string {
  return `/manager/docs/edit?id=${documentId}${threadId ? `&comment=${threadId}` : ''}`;
}

/**
 * Notify each distinct active member in `memberIds` (never the actor) who can
 * at least view the doc. Same row shape as notifyManagers; English copy like
 * the rest of the module's notifications.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notifyDocMembers(ctx: any, doc: any, actorMemberId: string, memberIds: readonly string[], title: string, body: string, threadId?: string, type = 'doc_comment'): void {
  const wanted = new Set(memberIds.filter((id) => id && id !== actorMemberId));
  if (wanted.size === 0) return;
  const docTitle: string = doc.title || 'Untitled document';
  for (const m of [...ctx.db.orgMember.byOrganizationId.filter(doc.organizationId)]) {
    const memberId: string = m.id.toString();
    if (m.status !== 'active' || !wanted.has(memberId)) continue;
    wanted.delete(memberId);
    if (DOC_ROLE_RANK[docRoleFor(ctx, doc, m)] < DOC_ROLE_RANK.viewer) continue;
    ctx.db.notification.insert({
      id: ctx.newUuidV4(),
      organizationId: doc.organizationId,
      targetId: m.userId,
      type,
      title,
      body: clampChars(`${docTitle}: ${body}`, DOC_NOTIFY_BODY_MAX),
      link: docLink(doc.id, threadId),
      read: false,
      createdAt: ctx.timestamp,
    });
  }
}

// ── Documents ────────────────────────────────────────────────────────────────

/** The client generates the id (reducers can't return values). */
export const createDocument = spacetimedb.reducer(
  {
    organizationId: t.string(),
    documentId: t.string(),
    title: t.string(),
    visibility: t.string(),
    templateId: t.option(t.string()),
    initialState: t.option(t.byteArray()),
    html: t.option(t.string()),
    plainText: t.option(t.string()),
    wordCount: t.option(t.u32()),
  },
  (ctx, args) => {
    const member = findDocMember(ctx, args.organizationId);
    if (!isServiceCaller(ctx) && !docMemberGate(member)) throw docError('forbidden', 'No access to Docs');
    const id = String(args.documentId).toLowerCase();
    if (!DOC_UUID_RE.test(id)) throw docError('invalid', 'Invalid document id');
    if (ctx.db.document.id.find(id)) throw docError('invalid', 'Document id already exists');
    if (!isDocVisibility(args.visibility)) throw docError('invalid', 'Unknown visibility');
    const init = args.initialState;
    if (init && init.length > DOC_STATE_MAX_BYTES) throw docError('too_large', 'Document is too large');

    const memberId = member.id.toString();
    const plainText = clampChars(args.plainText ?? '', DOC_TEXT_MAX_CHARS);
    const templateId = args.templateId ? clampChars(args.templateId.trim(), DOC_TEMPLATE_ID_MAX) : '';
    ctx.db.document.insert({
      id,
      organizationId: args.organizationId,
      ownerMemberId: memberId,
      title: cleanDocTitle(args.title),
      excerpt: docExcerpt(plainText),
      icon: undefined,
      visibility: args.visibility,
      templateId: templateId || undefined,
      pageSetup: undefined,
      wordCount: args.wordCount ?? 0,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
      lastEditorMemberId: memberId,
      trashedAt: undefined,
      trashedByMemberId: undefined,
    });
    if (init && init.length > 0) {
      ctx.db.documentSnapshot.insert({
        documentId: id,
        organizationId: args.organizationId,
        state: init,
        throughUpdateId: 0n,
        byteLength: init.length,
        html: clampChars(args.html ?? '', DOC_HTML_MAX_CHARS),
        plainText,
        compactedAt: ctx.timestamp,
        compactedByMemberId: memberId,
      });
    }
  }
);

/**
 * "Make a copy": copies the snapshot and update-log bytes server-side so the
 * client never has to load the source. The copied snapshot restarts at
 * throughUpdateId 0 and the copied rows get fresh auto-inc ids (in the source's
 * commit order), so the provider's maxAppliedId and compactDocument's strictly
 * increasing check both stay valid. The copy keeps the source's visibility.
 */
export const duplicateDocument = spacetimedb.reducer(
  { sourceDocumentId: t.string(), documentId: t.string(), title: t.string() },
  (ctx, args) => {
    const { doc: src, memberId } = requireDoc(ctx, args.sourceDocumentId, 'viewer');
    const id = String(args.documentId).toLowerCase();
    if (!DOC_UUID_RE.test(id)) throw docError('invalid', 'Invalid document id');
    if (ctx.db.document.id.find(id)) throw docError('invalid', 'Document id already exists');
    const now = ctx.timestamp;
    ctx.db.document.insert({
      ...src,
      id,
      ownerMemberId: memberId,
      title: cleanDocTitle(args.title),
      createdAt: now,
      updatedAt: now,
      lastEditorMemberId: memberId,
      trashedAt: undefined,
      trashedByMemberId: undefined,
    });
    const snap = ctx.db.documentSnapshot.documentId.find(src.id);
    if (snap) {
      ctx.db.documentSnapshot.insert({ ...snap, documentId: id, throughUpdateId: 0n, compactedAt: now, compactedByMemberId: memberId });
    }
    const rows = [...ctx.db.documentUpdate.byDocumentId.filter(src.id)]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const r of rows) {
      ctx.db.documentUpdate.insert({ ...r, id: 0n, documentId: id, memberId, createdAt: now });
    }
  }
);

export const renameDocument = spacetimedb.reducer(
  { documentId: t.string(), title: t.string() },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'editor');
    const title = cleanDocTitle(args.title);
    if (title === doc.title) return;
    // The row is rewritten anyway, so the rename also counts as a touch.
    ctx.db.document.id.update({ ...doc, title, updatedAt: ctx.timestamp, lastEditorMemberId: memberId });
  }
);

/** undefined = unchanged; '' clears icon / pageSetup (and empties the excerpt). */
export const updateDocumentMeta = spacetimedb.reducer(
  { documentId: t.string(), excerpt: t.option(t.string()), icon: t.option(t.string()), pageSetup: t.option(t.string()) },
  (ctx, args) => {
    const { doc } = requireDoc(ctx, args.documentId, 'editor');
    const next = { ...doc };
    if (args.excerpt !== undefined) next.excerpt = docExcerpt(args.excerpt);
    if (args.icon !== undefined) {
      const icon = [...args.icon.trim()].slice(0, DOC_ICON_MAX_CODEPOINTS).join('');
      next.icon = icon || undefined;
    }
    if (args.pageSetup !== undefined) {
      if (args.pageSetup === '') {
        next.pageSetup = undefined;
      } else {
        if (args.pageSetup.length > DOC_PAGE_SETUP_MAX) throw docError('invalid', 'Page setup is too large');
        let parsed: unknown;
        try {
          parsed = JSON.parse(args.pageSetup);
        } catch {
          throw docError('invalid', 'Page setup must be JSON');
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw docError('invalid', 'Page setup must be a JSON object');
        }
        next.pageSetup = args.pageSetup;
      }
    }
    if (next.excerpt === doc.excerpt && next.icon === doc.icon && next.pageSetup === doc.pageSetup) return;
    ctx.db.document.id.update(next);
  }
);

export const setDocumentVisibility = spacetimedb.reducer(
  { documentId: t.string(), visibility: t.string() },
  (ctx, args) => {
    const { doc } = requireDoc(ctx, args.documentId, 'manager');
    if (!isDocVisibility(args.visibility)) throw docError('invalid', 'Unknown visibility');
    if (doc.visibility === args.visibility) return;
    const next = { ...doc, visibility: args.visibility };
    ctx.db.document.id.update(next);
    pruneDocPresence(ctx, next);
  }
);

export const grantDocumentAccess = spacetimedb.reducer(
  { documentId: t.string(), memberId: t.string(), role: t.string() },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'manager');
    if (!isDocGrantRole(args.role)) throw docError('invalid', 'Unknown role');
    const targetId = String(args.memberId);
    if (targetId === doc.ownerMemberId) throw docError('invalid', 'The document owner already has full access');
    const target = [...ctx.db.orgMember.byOrganizationId.filter(doc.organizationId)]
      .find((m) => m.id.toString() === targetId && m.status === 'active');
    if (!target) throw docError('invalid', 'Member not found');

    const existing = [...ctx.db.documentAccess.byDocumentId.filter(doc.id)].find((g) => g.memberId === targetId);
    if (existing) {
      if (existing.role === args.role) return;
      ctx.db.documentAccess.id.update({ ...existing, role: args.role, grantedByMemberId: memberId, updatedAt: ctx.timestamp });
    } else {
      ctx.db.documentAccess.insert({
        id: ctx.newUuidV4(),
        documentId: doc.id,
        organizationId: doc.organizationId,
        memberId: targetId,
        role: args.role,
        grantedByMemberId: memberId,
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      const verb = args.role === 'viewer' ? 'view' : args.role === 'commenter' ? 'comment on' : 'edit';
      notifyDocMembers(ctx, doc, memberId, [targetId], 'Document shared with you', `You can now ${verb} it`, undefined, 'doc_share');
    }
    pruneDocPresence(ctx, doc);
  }
);

export const revokeDocumentAccess = spacetimedb.reducer(
  { documentId: t.string(), memberId: t.string() },
  (ctx, args) => {
    const { doc } = requireDoc(ctx, args.documentId, 'manager');
    const targetId = String(args.memberId);
    for (const g of [...ctx.db.documentAccess.byDocumentId.filter(doc.id)]) {
      if (g.memberId === targetId) ctx.db.documentAccess.delete(g);
    }
    pruneDocPresence(ctx, doc);
  }
);

export const trashDocument = spacetimedb.reducer(
  { documentId: t.string() },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'manager', { allowTrashed: true });
    if (doc.trashedAt !== undefined) return;
    ctx.db.document.id.update({ ...doc, trashedAt: ctx.timestamp, trashedByMemberId: memberId });
    for (const p of [...ctx.db.documentPresence.byDocumentId.filter(doc.id)]) ctx.db.documentPresence.delete(p);
  }
);

export const restoreDocument = spacetimedb.reducer(
  { documentId: t.string() },
  (ctx, args) => {
    const { doc } = requireDoc(ctx, args.documentId, 'manager', { allowTrashed: true });
    if (doc.trashedAt === undefined) return;
    ctx.db.document.id.update({ ...doc, trashedAt: undefined, trashedByMemberId: undefined });
  }
);

export const deleteDocumentForever = spacetimedb.reducer(
  { documentId: t.string() },
  (ctx, args) => {
    const { doc } = requireDoc(ctx, args.documentId, 'manager', { allowTrashed: true });
    if (doc.trashedAt === undefined) throw docError('invalid', 'Move the document to the trash first');
    purgeDocumentRows(ctx, doc);
  }
);

export const toggleDocumentStar = spacetimedb.reducer(
  { documentId: t.string() },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'viewer');
    const existing = [...ctx.db.documentStar.byDocumentId.filter(doc.id)].find((s) => s.memberId === memberId);
    if (existing) {
      ctx.db.documentStar.delete(existing);
      return;
    }
    ctx.db.documentStar.insert({
      id: ctx.newUuidV4(),
      documentId: doc.id,
      organizationId: doc.organizationId,
      memberId,
      createdAt: ctx.timestamp,
    });
  }
);

// ── Content sync ─────────────────────────────────────────────────────────────

export const pushDocumentUpdate = spacetimedb.reducer(
  { documentId: t.string(), sessionId: t.string(), payload: t.byteArray() },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'editor');
    const size = args.payload.length;
    if (size === 0) return;
    if (size > DOC_UPDATE_MAX_BYTES) throw docError('too_large', 'Edit is too large to sync');
    ctx.db.documentUpdate.insert({
      id: 0n,
      documentId: doc.id,
      organizationId: doc.organizationId,
      payload: args.payload,
      byteLength: size,
      sessionId: args.sessionId.slice(0, DOC_SESSION_ID_MAX),
      memberId,
      createdAt: ctx.timestamp,
    });
    touchDocument(ctx, doc, memberId);
  }
);

/**
 * Replace the snapshot with `state` (which MUST contain every update id ≤
 * throughUpdateId) and delete those update rows. Reducers run serially and
 * transactionally, so the check-then-delete is atomic. throughUpdateId must
 * STRICTLY advance: an equal-N race (two compactors) is a silent no-op for the
 * loser, never an overwrite.
 */
export const compactDocument = spacetimedb.reducer(
  {
    documentId: t.string(),
    throughUpdateId: t.u64(),
    state: t.byteArray(),
    html: t.string(),
    plainText: t.string(),
    wordCount: t.u32(),
  },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'editor');
    if (args.state.length === 0 || args.state.length > DOC_STATE_MAX_BYTES) {
      throw docError('too_large', 'Document is too large');
    }
    const current = ctx.db.documentSnapshot.documentId.find(doc.id);
    if (current && args.throughUpdateId <= current.throughUpdateId) return; // stale / duplicate

    const rows = [...ctx.db.documentUpdate.byDocumentId.filter(doc.id)];
    let maxId = current ? current.throughUpdateId : 0n;
    for (const r of rows) if (r.id > maxId) maxId = r.id;
    if (args.throughUpdateId > maxId) throw docError('invalid', 'Snapshot is ahead of the update log');

    const plainText = clampChars(args.plainText, DOC_TEXT_MAX_CHARS);
    const snapshot = {
      documentId: doc.id,
      organizationId: doc.organizationId,
      state: args.state,
      throughUpdateId: args.throughUpdateId,
      byteLength: args.state.length,
      html: clampChars(args.html, DOC_HTML_MAX_CHARS),
      plainText,
      compactedAt: ctx.timestamp,
      compactedByMemberId: memberId,
    };
    if (current) ctx.db.documentSnapshot.documentId.update(snapshot);
    else ctx.db.documentSnapshot.insert(snapshot);

    for (const r of rows) if (r.id <= args.throughUpdateId) ctx.db.documentUpdate.delete(r);

    const excerpt = docExcerpt(plainText);
    if (excerpt !== doc.excerpt || args.wordCount !== doc.wordCount) {
      ctx.db.document.id.update({ ...doc, excerpt, wordCount: args.wordCount });
    }
  }
);

// ── Versions ─────────────────────────────────────────────────────────────────

export const saveDocumentVersion = spacetimedb.reducer(
  {
    documentId: t.string(),
    kind: t.string(),
    name: t.option(t.string()),
    state: t.byteArray(),
    throughUpdateId: t.u64(),
    wordCount: t.u32(),
  },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'editor');
    if (args.kind !== 'auto' && args.kind !== 'named' && args.kind !== 'restore') {
      throw docError('invalid', 'Unknown version kind');
    }
    if (args.state.length === 0 || args.state.length > DOC_STATE_MAX_BYTES) {
      throw docError('too_large', 'Version is too large');
    }
    const name = args.name ? args.name.replace(/\s+/g, ' ').trim().slice(0, DOC_VERSION_NAME_MAX) : '';
    if (args.kind === 'named' && !name) throw docError('invalid', 'Named versions need a name');

    const versions = [...ctx.db.documentVersion.byDocumentId.filter(doc.id)];
    if (args.kind === 'auto') {
      let latest: (typeof versions)[number] | undefined;
      for (const v of versions) {
        if (v.kind !== 'auto') continue;
        if (!latest || v.createdAt.microsSinceUnixEpoch > latest.createdAt.microsSinceUnixEpoch) latest = v;
      }
      if (latest) {
        if (ctx.timestamp.microsSinceUnixEpoch - latest.createdAt.microsSinceUnixEpoch < DOC_AUTO_VERSION_GAP_MICROS) return;
        if (latest.throughUpdateId === args.throughUpdateId && latest.byteLength === args.state.length) return;
      }
    } else if (versions.filter((v) => v.kind !== 'auto').length >= DOC_NAMED_VERSION_MAX) {
      throw docError('invalid', 'Too many saved versions — delete some first');
    }

    ctx.db.documentVersion.insert({
      id: ctx.newUuidV4(),
      documentId: doc.id,
      organizationId: doc.organizationId,
      kind: args.kind,
      name: name || undefined,
      state: args.state,
      throughUpdateId: args.throughUpdateId,
      byteLength: args.state.length,
      wordCount: args.wordCount,
      createdAt: ctx.timestamp,
      createdByMemberId: memberId,
    });

    if (args.kind === 'auto') {
      const autos = [...ctx.db.documentVersion.byDocumentId.filter(doc.id)]
        .filter((v) => v.kind === 'auto')
        .sort((a, b) => (b.createdAt.microsSinceUnixEpoch > a.createdAt.microsSinceUnixEpoch ? 1 : -1));
      for (const old of autos.slice(DOC_AUTO_VERSION_KEEP)) ctx.db.documentVersion.delete(old);
    }
  }
);

export const renameDocumentVersion = spacetimedb.reducer(
  { documentId: t.string(), versionId: t.string(), name: t.string() },
  (ctx, args) => {
    const { doc, role, memberId } = requireDoc(ctx, args.documentId, 'editor');
    const v = findDocVersion(ctx, doc.id, args.versionId);
    if (!v) throw docError('not_found', 'Version not found');
    const name = args.name.replace(/\s+/g, ' ').trim().slice(0, DOC_VERSION_NAME_MAX);
    // Naming promotes to 'named' (exempt from auto pruning); clearing the name reverts.
    const kind = name ? 'named' : v.kind === 'restore' ? 'restore' : 'auto';
    if ((v.name ?? '') === name && v.kind === kind) return;
    // A demoted version is pruned once DOC_AUTO_VERSION_KEEP newer autosaves exist, so
    // demoting is a delayed delete: same rule as deleteDocumentVersion.
    if (v.kind === 'named' && kind === 'auto' && role !== 'manager' && v.createdByMemberId !== memberId) {
      throw docError('forbidden', 'Only the creator or a manager can clear the name of a version');
    }
    ctx.db.documentVersion.id.update({ ...v, name: name || undefined, kind });
  }
);

export const deleteDocumentVersion = spacetimedb.reducer(
  { documentId: t.string(), versionId: t.string() },
  (ctx, args) => {
    const { doc, role, memberId } = requireDoc(ctx, args.documentId, 'editor');
    const v = findDocVersion(ctx, doc.id, args.versionId);
    if (!v) return;
    if (role !== 'manager' && v.createdByMemberId !== memberId) {
      throw docError('forbidden', 'Only the creator or a manager can delete a version');
    }
    ctx.db.documentVersion.delete(v);
  }
);

// ── Presence ─────────────────────────────────────────────────────────────────

const DOC_AWARENESS_TEXT_ENCODER = new TextEncoder();
const DOC_AWARENESS_TEXT_DECODER = new TextDecoder();

/**
 * Pins presence awareness bytes to the caller. Peers feed the stored bytes to
 * y-protocols applyAwarenessUpdate, which applies EVERY (clientID, clock,
 * state) entry in them, so verbatim bytes would let any viewer relabel or move
 * another collaborator's caret (their clientID with a higher clock).
 *
 * Accepts exactly what encodeAwarenessUpdate(awareness, [yClientId]) produces
 * for the caller's own client: lib0 varUint count (1), varUint clientID
 * (= yClientId), varUint clock, varUint byteLength + UTF-8 JSON state (an
 * object or null), nothing after it. A non-null state is re-encoded with
 * `user.name` / `user.color` / `user.memberId` set to the server's values;
 * the clock and every other field are kept. Returns null for anything else.
 */
function sanitizeDocAwareness(
  bytes: Uint8Array,
  yClientId: number,
  user: { name: string; color: string; memberId: string },
): Uint8Array | null {
  let pos = 0;
  const readVarUint = (): number | null => {
    let num = 0;
    let mult = 1;
    while (pos < bytes.length) {
      const byte = bytes[pos++];
      num += (byte & 0x7f) * mult;
      if (byte < 0x80) return Number.isSafeInteger(num) ? num : null;
      mult *= 128;
    }
    return null;
  };
  if (readVarUint() !== 1) return null;
  const clientId = readVarUint();
  const clock = readVarUint();
  const length = readVarUint();
  if (clientId !== yClientId || clock === null || length === null || length !== bytes.length - pos) return null;

  let state: unknown;
  try {
    state = JSON.parse(DOC_AWARENESS_TEXT_DECODER.decode(bytes.subarray(pos)));
  } catch {
    return null;
  }
  if (state !== null && (typeof state !== 'object' || Array.isArray(state))) return null;
  if (state !== null) {
    const record = state as Record<string, unknown>;
    const prev = record.user;
    const base = prev !== null && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
    record.user = { ...base, name: user.name, color: user.color, memberId: user.memberId };
  }

  const json = DOC_AWARENESS_TEXT_ENCODER.encode(JSON.stringify(state));
  const head: number[] = [];
  for (let n of [1, clientId, clock, json.length]) {
    while (n > 0x7f) {
      head.push(0x80 | (n % 128));
      n = Math.floor(n / 128);
    }
    head.push(n);
  }
  const out = new Uint8Array(head.length + json.length);
  out.set(head, 0);
  out.set(json, head.length);
  return out;
}

export const upsertDocumentPresence = spacetimedb.reducer(
  { documentId: t.string(), yClientId: t.u32(), name: t.string(), color: t.string(), awareness: t.byteArray() },
  (ctx, args) => {
    // allowTrashed: presence is ephemeral and a trashed doc stays open for its managers.
    const { doc, role, memberId } = requireDoc(ctx, args.documentId, 'viewer', { allowTrashed: true });
    if (!ctx.connectionId) throw docError('invalid', 'Presence requires a live connection');
    if (args.awareness.length > DOC_PRESENCE_MAX_BYTES) throw docError('too_large', 'Presence state is too large');
    const name = args.name.replace(/\s+/g, ' ').trim().slice(0, DOC_PRESENCE_NAME_MAX);
    const color = /^#[0-9a-f]{6}$/i.test(args.color) ? args.color.toLowerCase() : DOC_PRESENCE_DEFAULT_COLOR;
    const awareness = sanitizeDocAwareness(args.awareness, args.yClientId, { name, color, memberId });
    if (!awareness) throw docError('invalid', 'Presence must be an awareness update for this client only');
    if (awareness.length > DOC_PRESENCE_MAX_BYTES) throw docError('too_large', 'Presence state is too large');
    const connectionId = ctx.connectionId.toHexString();
    const now = ctx.timestamp.microsSinceUnixEpoch;

    const rows = [...ctx.db.documentPresence.byDocumentId.filter(doc.id)];
    let mine: (typeof rows)[number] | undefined;
    for (const p of rows) {
      if (p.connectionId === connectionId && p.yClientId === args.yClientId) {
        mine = p;
        continue;
      }
      // Backstop for disconnects that were never delivered.
      if (now - p.updatedAt.microsSinceUnixEpoch > DOC_PRESENCE_TTL_MICROS) ctx.db.documentPresence.delete(p);
    }
    const row = {
      documentId: doc.id,
      organizationId: doc.organizationId,
      connectionId,
      identity: ctx.sender,
      memberId,
      yClientId: args.yClientId,
      name: name || 'Anonymous',
      color,
      canEdit: DOC_ROLE_RANK[role] >= DOC_ROLE_RANK.editor,
      awareness,
      updatedAt: ctx.timestamp,
    };
    if (mine) ctx.db.documentPresence.id.update({ ...row, id: mine.id });
    else ctx.db.documentPresence.insert({ ...row, id: ctx.newUuidV4() });
  }
);

/** Needs no role: removes only the caller's own rows (same connection or same identity). */
export const removeDocumentPresence = spacetimedb.reducer(
  { documentId: t.string(), yClientId: t.u32() },
  (ctx, args) => {
    const connectionId = ctx.connectionId ? ctx.connectionId.toHexString() : '';
    for (const p of [...ctx.db.documentPresence.byDocumentId.filter(String(args.documentId).toLowerCase())]) {
      if (p.yClientId !== args.yClientId) continue;
      if ((connectionId && p.connectionId === connectionId) || p.identity.isEqual(ctx.sender)) {
        ctx.db.documentPresence.delete(p);
      }
    }
  }
);

/**
 * Lifecycle: drop presence rows of the disconnecting connection. Must never
 * throw — the 90 s TTL sweep in upsertDocumentPresence and the client's
 * awareness timeout are the backstops if this doesn't run or fails.
 */
export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  try {
    if (!ctx.connectionId) return;
    const connectionId = ctx.connectionId.toHexString();
    for (const p of [...ctx.db.documentPresence.byConnectionId.filter(connectionId)]) {
      ctx.db.documentPresence.delete(p);
    }
  } catch {
    // Best effort by design (see above).
  }
});

// ── Comments ─────────────────────────────────────────────────────────────────

/** `anchor` (optional) positions the thread for members who can't write the comment mark (see cleanCommentAnchor). */
export const addDocumentComment = spacetimedb.reducer(
  {
    documentId: t.string(),
    threadId: t.string(),
    body: t.string(),
    quotedText: t.option(t.string()),
    mentions: t.option(t.string()),
    anchor: t.option(t.byteArray()),
  },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'commenter');
    const threadId = String(args.threadId).toLowerCase();
    if (!DOC_UUID_RE.test(threadId)) throw docError('invalid', 'Invalid thread id');
    if (!ctx.db.documentComment.byThreadId.filter(threadId).next().done) throw docError('invalid', 'Thread already exists');
    const body = cleanCommentBody(args.body);
    const quotedText = args.quotedText ? clampChars(args.quotedText.trim(), DOC_QUOTE_MAX) : '';
    const anchor = cleanCommentAnchor(args.anchor);
    const mentionIds = parseMentionIds(ctx, doc.organizationId, args.mentions);
    ctx.db.documentComment.insert({
      id: ctx.newUuidV4(),
      documentId: doc.id,
      organizationId: doc.organizationId,
      threadId,
      parentId: undefined,
      authorMemberId: memberId,
      authorIdentity: ctx.sender,
      body,
      quotedText: quotedText || undefined,
      mentions: mentionIds.length ? JSON.stringify(mentionIds) : undefined,
      status: 'open',
      resolvedAt: undefined,
      resolvedByMemberId: undefined,
      createdAt: ctx.timestamp,
      editedAt: undefined,
      anchor,
    });
    notifyDocMembers(ctx, doc, memberId, [doc.ownerMemberId, ...mentionIds], 'New comment', body, threadId);
  }
);

/** Replying to a resolved thread reopens it. */
export const replyDocumentComment = spacetimedb.reducer(
  { documentId: t.string(), threadId: t.string(), body: t.string(), mentions: t.option(t.string()) },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'commenter');
    const threadId = String(args.threadId).toLowerCase();
    const thread = [...ctx.db.documentComment.byThreadId.filter(threadId)].filter((c) => c.documentId === doc.id);
    const root = thread.find((c) => c.parentId === undefined);
    if (!root) throw docError('not_found', 'Thread not found');
    const body = cleanCommentBody(args.body);
    const mentionIds = parseMentionIds(ctx, doc.organizationId, args.mentions);
    ctx.db.documentComment.insert({
      id: ctx.newUuidV4(),
      documentId: doc.id,
      organizationId: doc.organizationId,
      threadId,
      parentId: root.id.toString(),
      authorMemberId: memberId,
      authorIdentity: ctx.sender,
      body,
      quotedText: undefined,
      mentions: mentionIds.length ? JSON.stringify(mentionIds) : undefined,
      status: 'open',
      resolvedAt: undefined,
      resolvedByMemberId: undefined,
      createdAt: ctx.timestamp,
      editedAt: undefined,
      anchor: undefined,
    });
    if (root.status === 'resolved') {
      ctx.db.documentComment.id.update({ ...root, status: 'open', resolvedAt: undefined, resolvedByMemberId: undefined });
    }
    const participants = thread.map((c) => c.authorMemberId);
    notifyDocMembers(ctx, doc, memberId, [...participants, ...mentionIds], 'New reply', body, threadId);
  }
);

export const editDocumentComment = spacetimedb.reducer(
  { documentId: t.string(), commentId: t.string(), body: t.string() },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'commenter');
    const c = findDocComment(ctx, doc.id, args.commentId);
    if (c.authorMemberId !== memberId) throw docError('forbidden', 'Only the author can edit a comment');
    const body = cleanCommentBody(args.body);
    if (body === c.body) return;
    ctx.db.documentComment.id.update({ ...c, body, editedAt: ctx.timestamp });
  }
);

export const resolveDocumentComment = spacetimedb.reducer(
  { documentId: t.string(), commentId: t.string(), resolved: t.bool() },
  (ctx, args) => {
    const { doc, memberId } = requireDoc(ctx, args.documentId, 'commenter');
    const c = findDocComment(ctx, doc.id, args.commentId);
    if (c.parentId !== undefined) throw docError('invalid', 'Only a thread can be resolved');
    const status = args.resolved ? 'resolved' : 'open';
    if (c.status === status) return;
    ctx.db.documentComment.id.update({
      ...c,
      status,
      resolvedAt: args.resolved ? ctx.timestamp : undefined,
      resolvedByMemberId: args.resolved ? memberId : undefined,
    });
  }
);

/** Deleting a thread's root deletes the whole thread. */
export const deleteDocumentComment = spacetimedb.reducer(
  { documentId: t.string(), commentId: t.string() },
  (ctx, args) => {
    const { doc, role, memberId } = requireDoc(ctx, args.documentId, 'viewer');
    const c = findDocComment(ctx, doc.id, args.commentId);
    if (c.authorMemberId !== memberId && role !== 'manager') {
      throw docError('forbidden', 'Only the author or a manager can delete a comment');
    }
    if (c.parentId === undefined) {
      for (const r of [...ctx.db.documentComment.byThreadId.filter(c.threadId)]) {
        if (r.documentId === doc.id) ctx.db.documentComment.delete(r);
      }
    } else {
      ctx.db.documentComment.delete(c);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-SHOT DATA MIGRATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Backfills everything the row-level-security work needs, and evacuates the
 * secrets that used to sit in world-readable tables.
 *
 * Run ONCE after publishing, as the service identity or a site admin:
 *
 *     bun run scripts/migrate-security-v1.ts
 *
 * Idempotent: re-running is a no-op apart from re-reporting. It is also safe to
 * run before the client is redeployed — the readers all fall back to the legacy
 * columns until this has run.
 *
 * Steps:
 *   1. organization.orgIdText / rootOrgId  — plain-string mirrors of the uuid
 *      primary key, required by the RLS joins and by the index lookups that
 *      replaced `[...organization.iter()].find(...)`.
 *   2. site_booking.organizationId         — bookings carry customer PII and
 *      previously could not be scoped to a tenant at all.
 *   3. user.passwordHash        → user_secret         (private table)
 *   4. settings square/clover tokens -> org_secret     (private table)
 *   5. org_member.punchInCode   → member_punch_code   (RLS: self only)
 *   6. punch_event.pin          → redacted in place
 *
 * Steps 3-6 blank the source column afterwards. SpacetimeDB cannot drop a
 * column via automatic migration, so the legacy columns remain in the schema
 * forever — but after this runs they are empty and nothing writes them.
 */
export const migrateSecurityV1 = spacetimedb.reducer(
  {},
  (ctx) => {
    if (!isServiceCaller(ctx)) requireAdmin(ctx);

    let orgs = 0, bookings = 0, secrets = 0, posTokens = 0, pins = 0, punches = 0;

    // ── 1. organization.orgIdText / rootOrgId ────────────────────────────────
    for (const org of [...ctx.db.organization.iter()]) {
      const idText = org.id.toString();
      const root = (org.parentOrgId as string | undefined) ?? idText;
      if (org.orgIdText === idText && org.rootOrgId === root) continue;
      ctx.db.organization.id.update({ ...org, orgIdText: idText, rootOrgId: root });
      orgs++;
    }

    // ── 2. site_booking.organizationId ───────────────────────────────────────
    // site.id is a uuid and site_booking.siteId a string, so this mapping has
    // to be built in JS — the database cannot express the join.
    const siteOrgById = new Map<string, string>();
    for (const site of ctx.db.site.iter()) {
      siteOrgById.set(site.id.toString(), site.organizationId);
    }
    for (const b of [...ctx.db.siteBooking.iter()]) {
      if (b.organizationId) continue;
      const orgId = siteOrgById.get(b.siteId);
      if (!orgId) continue;   // orphaned booking; stays invisible to every client
      ctx.db.siteBooking.id.update({ ...b, organizationId: orgId });
      bookings++;
    }

    // ── 2b. role_task.orgId ──────────────────────────────────────────────────
    let roleTasks = 0;
    for (const rt of [...ctx.db.roleTask.iter()]) {
      const orgId = (rt.organizationId as string | undefined) ?? '';
      if (rt.orgId === orgId) continue;
      ctx.db.roleTask.id.update({ ...rt, orgId });
      roleTasks++;
    }

    // ── 3. user.passwordHash → user_secret ───────────────────────────────────
    for (const u of [...ctx.db.user.iter()]) {
      const hash = u.passwordHash as string | undefined;
      if (!hash) continue;
      if (!ctx.db.userSecret.identity.find(u.identity)) {
        ctx.db.userSecret.insert({
          identity: u.identity, passwordHash: hash, updatedAt: ctx.timestamp,
        });
      }
      ctx.db.user.identity.update({ ...u, passwordHash: undefined });
      secrets++;
    }

    // ── 4. settings POS tokens → org_secret ──────────────────────────────────
    for (const s of [...ctx.db.settings.iter()]) {
      const hasToken = s.squareAccessToken !== undefined
        || s.squareRefreshToken !== undefined
        || s.squareTokenExpiresAt !== undefined;
      if (!hasToken) continue;
      const existing = ctx.db.orgSecret.organizationId.find(s.organizationId);
      const row = {
        organizationId: s.organizationId,
        squareAccessToken: s.squareAccessToken,
        squareRefreshToken: s.squareRefreshToken,
        squareTokenExpiresAt: s.squareTokenExpiresAt,
        cloverAccessToken: existing?.cloverAccessToken,
        cloverMerchantId: existing?.cloverMerchantId,
        updatedAt: ctx.timestamp,
      };
      if (existing) ctx.db.orgSecret.organizationId.update(row);
      else ctx.db.orgSecret.insert(row);
      ctx.db.settings.delete(s);
      ctx.db.settings.insert({
        ...s,
        squareAccessToken: undefined,
        squareRefreshToken: undefined,
        squareTokenExpiresAt: undefined,
      });
      posTokens++;
    }

    // ── 5. org_member.punchInCode → member_punch_code ────────────────────────
    for (const m of [...ctx.db.orgMember.iter()]) {
      const code = m.punchInCode as string | undefined;
      if (!code) continue;
      const memberId = m.id.toString();
      if (!ctx.db.memberPunchCode.memberId.find(memberId)) {
        ctx.db.memberPunchCode.insert({
          memberId,
          organizationId: m.organizationId,
          userId: m.userId,
          code,
          updatedAt: ctx.timestamp,
        });
      }
      ctx.db.orgMember.delete(m);
      ctx.db.orgMember.insert({ ...m, punchInCode: undefined });
      pins++;
    }

    // ── 6. punch_event.pin → redacted ────────────────────────────────────────
    for (const e of [...ctx.db.punchEvent.iter()]) {
      if (e.pin === PUNCH_PIN_REDACTED) continue;
      ctx.db.punchEvent.id.update({ ...e, pin: PUNCH_PIN_REDACTED });
      punches++;
    }

    const note = `orgs=${orgs} bookings=${bookings} roleTasks=${roleTasks} `
      + `passwords=${secrets} posTokens=${posTokens} pins=${pins} punchEvents=${punches}`;
    const prev = ctx.db.migrationState.name.find('security_v1');
    if (prev) ctx.db.migrationState.name.update({ ...prev, appliedAt: ctx.timestamp, note });
    else ctx.db.migrationState.insert({ name: 'security_v1', appliedAt: ctx.timestamp, note });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// RETENTION
// ═══════════════════════════════════════════════════════════════════════════════
//
// SpacetimeDB keeps the whole database resident in memory, and none of these
// tables ever shrank on their own: every punch, every stock movement, every
// notification and every AI job stayed forever, and every client downloaded all
// of it on connect. Subscriptions are now time-windowed on the client side
// (lib/spacetimedb/provider.tsx), which fixes the transfer but not the growth.
//
// `pruneOrgHistory` is the other half: it deletes rows older than `keepDays`
// for one organization. Owner/service only, and it refuses windows shorter than
// 30 days so a mistyped argument cannot wipe live data.
//
// Chat messages and documents are deliberately NOT pruned — they are content,
// not telemetry. Document history has its own compaction (`compactDocument`).

const MIN_RETENTION_DAYS = 30;
const MICROS_PER_DAY = 86_400_000_000n;

export const pruneOrgHistory = spacetimedb.reducer(
  {
    organizationId: t.string(),
    keepDays: t.i32(),
    dryRun: t.bool(),
  },
  (ctx, { organizationId, keepDays, dryRun }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role !== 'owner' && !isServiceCaller(ctx)) {
      unauthorized('Owner or service identity required');
    }
    if (keepDays < MIN_RETENTION_DAYS) {
      throw new SenderError(`keepDays must be at least ${MIN_RETENTION_DAYS}`);
    }

    const cutoff = timestampMicros(ctx.timestamp) - BigInt(keepDays) * MICROS_PER_DAY;
    const older = (ts: { microsSinceUnixEpoch?: bigint }) => timestampMicros(ts) < cutoff;

    let punches = 0, transactions = 0, notifications = 0, jobs = 0, usage = 0, briefings = 0;

    // Only closed punch pairs are removable — an open shift is live state.
    for (const e of [...ctx.db.punchEvent.byOrganizationId.filter(organizationId)]) {
      if (!e.closed || !older(e.createdAt)) continue;
      if (!dryRun) ctx.db.punchEvent.delete(e);
      punches++;
    }
    for (const tr of [...ctx.db.inventoryTransaction.byOrganizationId.filter(organizationId)]) {
      if (!older(tr.createdAt)) continue;
      if (!dryRun) ctx.db.inventoryTransaction.delete(tr);
      transactions++;
    }
    for (const n of [...ctx.db.notification.byOrganizationId.filter(organizationId)]) {
      if (!n.read || !older(n.createdAt)) continue;
      if (!dryRun) ctx.db.notification.delete(n);
      notifications++;
    }
    for (const j of [...ctx.db.aiJob.byOrganizationId.filter(organizationId)]) {
      if (j.status === 'pending' || j.status === 'running') continue;
      if (!older(j.createdAt)) continue;
      if (!dryRun) ctx.db.aiJob.delete(j);
      jobs++;
    }
    for (const u of [...ctx.db.aiUsage.byOrganizationId.filter(organizationId)]) {
      if (!older(u.createdAt)) continue;
      if (!dryRun) ctx.db.aiUsage.delete(u);
      usage++;
    }
    for (const b of [...ctx.db.dailyBriefing.byOrganizationId.filter(organizationId)]) {
      if (!older(b.generatedAt)) continue;
      if (!dryRun) ctx.db.dailyBriefing.delete(b);
      briefings++;
    }

    const note = `${dryRun ? 'dryRun ' : ''}org=${organizationId} keepDays=${keepDays} `
      + `punch=${punches} tx=${transactions} notif=${notifications} `
      + `aiJob=${jobs} aiUsage=${usage} briefing=${briefings}`;
    const key = `prune:${organizationId}`;
    const prev = ctx.db.migrationState.name.find(key);
    if (prev) ctx.db.migrationState.name.update({ ...prev, appliedAt: ctx.timestamp, note });
    else ctx.db.migrationState.insert({ name: key, appliedAt: ctx.timestamp, note });
  }
);

/** Delete expired device-login handshakes and stale document presence rows. */
export const pruneEphemeral = spacetimedb.reducer(
  {},
  (ctx) => {
    if (!isServiceCaller(ctx)) requireAdmin(ctx);
    const now = timestampMicros(ctx.timestamp);
    for (const r of [...ctx.db.deviceLoginRequest.iter()]) {
      if (timestampMicros(r.expiresAt) < now) ctx.db.deviceLoginRequest.delete(r);
    }
    // Presence rows are removed on disconnect, but a hard client crash leaves
    // one behind and it then renders as a permanent phantom cursor.
    const staleBefore = now - 3_600_000_000n;   // 1 hour
    for (const p of [...ctx.db.documentPresence.iter()]) {
      if (timestampMicros(p.updatedAt) < staleBefore) ctx.db.documentPresence.delete(p);
    }
  }
);

/**
 * Backfill the `*Cents` columns from their legacy f64 siblings.
 *
 * Run once after publishing, alongside `migrateSecurityV1`. Idempotent: a row
 * whose cents column is already set is skipped, so a partially-completed run
 * can simply be repeated.
 *
 * Conversion is `Math.round(value * 100)`. For values that were only ever
 * entered as ordinary prices this recovers the number the user actually typed —
 * an amount stored as 19.989999999999998 becomes 1999. It cannot recover an
 * amount that has already drifted by more than half a cent through repeated
 * arithmetic, which is precisely why the f64 columns are being retired.
 *
 * Ratios (settings.paymentTaxRate, inventory_item.lossRate), physical
 * quantities (unitContentAmount) and sub-cent AI cost telemetry are NOT
 * converted — they are not currency and cents would be the wrong unit.
 */
export const migrateMoneyV1 = spacetimedb.reducer(
  {},
  (ctx) => {
    if (!isServiceCaller(ctx)) requireAdmin(ctx);
    let payments = 0, expenses = 0, pos = 0, waste = 0, items = 0, staff = 0, members = 0;

    for (const r of [...ctx.db.payment.iter()]) {
      if (r.amountCents !== undefined) continue;
      ctx.db.payment.id.update({
        ...r,
        amountCents: toCents(r.amount),
        taxAmountCents: toCents(r.taxAmount),
        discountAmountCents: toCents(r.discountAmount),
        refundAmountCents: toCentsOpt(r.refundAmount),
      });
      payments++;
    }
    for (const r of [...ctx.db.expense.iter()]) {
      if (r.amountCents !== undefined) continue;
      ctx.db.expense.id.update({ ...r, amountCents: toCents(r.amount) });
      expenses++;
    }
    for (const r of [...ctx.db.purchaseOrder.iter()]) {
      if (r.totalCents !== undefined) continue;
      ctx.db.purchaseOrder.id.update({
        ...r,
        subtotalCents: toCents(r.subtotal),
        taxCents: toCents(r.tax),
        totalCents: toCents(r.total),
      });
      pos++;
    }
    for (const r of [...ctx.db.wasteLog.iter()]) {
      if (r.totalCostCents !== undefined) continue;
      ctx.db.wasteLog.id.update({
        ...r,
        costPerUnitCents: toCents(r.costPerUnit),
        totalCostCents: toCents(r.totalCost),
      });
      waste++;
    }
    for (const r of [...ctx.db.inventoryItem.iter()]) {
      if (r.costPerUnitCents !== undefined) continue;
      ctx.db.inventoryItem.id.update({
        ...r,
        costPerUnitCents: toCents(r.costPerUnit),
        retailPriceCents: toCentsOpt(r.retailPrice),
      });
      items++;
    }
    for (const r of [...ctx.db.staffMember.iter()]) {
      if (r.hourlyRateCents !== undefined) continue;
      ctx.db.staffMember.id.update({ ...r, hourlyRateCents: toCents(r.hourlyRate) });
      staff++;
    }
    for (const r of [...ctx.db.orgMember.iter()]) {
      if (r.hourlyRateCents !== undefined || r.hourlyRate === undefined) continue;
      ctx.db.orgMember.delete(r);
      ctx.db.orgMember.insert({ ...r, hourlyRateCents: toCentsOpt(r.hourlyRate) });
      members++;
    }

    const note = `payment=${payments} expense=${expenses} po=${pos} waste=${waste} `
      + `item=${items} staffMember=${staff} orgMember=${members}`;
    const prev = ctx.db.migrationState.name.find('money_v1');
    if (prev) ctx.db.migrationState.name.update({ ...prev, appliedAt: ctx.timestamp, note });
    else ctx.db.migrationState.insert({ name: 'money_v1', appliedAt: ctx.timestamp, note });
  }
);
