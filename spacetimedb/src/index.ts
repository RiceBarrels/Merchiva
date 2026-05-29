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

import { schema, t, table } from 'spacetimedb/server';
import { Identity } from 'spacetimedb';

// ─── Helper: throw on unauthorized ───────────────────────────────────────────

function unauthorized(msg = 'Unauthorized'): never {
  throw new Error(msg);
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
    // should prompt the user to configure in /~/settings).
    openingHours: t.option(t.string()).default(undefined),
    // ISO country code (e.g. "US", "CN") used to look up regional public
    // holidays so the AI can flag them when proposing schedules. Optional —
    // defaults to undefined; the chat helper falls back to locale inference.
    countryCode: t.option(t.string()).default(undefined),
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
    ],
  },
  {
    id: t.uuid().primaryKey(),
    roleId: t.string(),
    organizationId: t.option(t.string()),
    title: t.string(),
    description: t.string(),
    startTime: t.option(t.string()),
    endTime: t.option(t.string()),
    sortOrder: t.i32(),
    requiresEvidence: t.bool(),
    notifyChats: t.string(),  // JSON-encoded string[]
    createdAt: t.timestamp(),
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

// ─── Products ─────────────────────────────────────────────────────────────────

const productTable = table(
  {
    name: 'product',
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
    price: t.number(),
    cost: t.number(),
    unitsSoldThisMonth: t.i32(),
    unitsSoldLastMonth: t.i32(),
    revenue: t.number(),
    margin: t.number(),
    rating: t.number(),
    trend: t.string(),          // "up" | "down" | "stable"
    alert: t.string(),          // "none" | "underperforming" | "remove"
    alertReason: t.option(t.string()),
    imageUrl: t.option(t.string()),
    description: t.option(t.string()),
    nameI18n: t.option(t.string()),
    options: t.option(t.string()),      // JSON: [{"name","price","des","imgUrl","color"}]
    squareItemId: t.option(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
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
  }
);

// ─── AI Chat History ─────────────────────────────────────────────────────────

const aiChatHistoryTable = table(
  {
    name: 'ai_chat_history',
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
    messages: t.string(),
    summary: t.option(t.string()),
    updatedAt: t.timestamp(),
  }
);

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

const trainingFinalGradeTable = table(
  {
    name: 'training_final_grade',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byTraineeId', algorithm: 'btree', columns: ['traineeId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    traineeId: t.string(),
    score: t.i32(),                     // 0..100
    comment: t.option(t.string()),
    gradedBy: t.identity(),
    gradedAt: t.timestamp(),
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
  }
);

// ─── Schedule Proposal (AI-drafted 7-day shift suggestions) ──────────────────

const scheduleProposalTable = table(
  {
    name: 'schedule_proposal',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    organizationId: t.string(),
    weekStart: t.string(),             // YYYY-MM-DD (idempotency key with org)
    weekEnd: t.string(),               // YYYY-MM-DD
    // JSON-encoded array: [{ date, staffName, staffRoles, startTime, endTime, shiftType }]
    shifts: t.string(),
    // 'draft' = waiting for owner action; 'committed' = inserted as real shifts;
    // 'rejected' = owner declined. Auto-committed proposals are inserted as
    // shifts AND saved as 'committed' for audit.
    status: t.string(),
    generatedBy: t.string(),
    generatedAt: t.timestamp(),
    decidedAt: t.option(t.timestamp()),
  }
);

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
    evidenceUrl: t.option(t.string()),   // UploadThing URL (image)
    note: t.option(t.string()),          // free-text note from the staff member
    completedAt: t.option(t.timestamp()),
    completedBy: t.option(t.identity()),
    skipReason: t.option(t.string()),
    createdAt: t.timestamp(),
    createdBy: t.identity(),
    // Legacy plural column kept to satisfy the deployed schema. Unused by app
    // code; remove via a manual migration if/when we ship a destructive deploy.
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
  product: productTable,
  payment: paymentTable,
  chatConversation: chatConversationTable,
  chatMember: chatMemberTable,
  chatMessage: chatMessageTable,
  todo: todoTable,
  punchEvent: punchEventTable,
  storeDevice: storeDeviceTable,
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
  expense: expenseTable,
  coupon: couponTable,
  queueEntry: queueEntryTable,
  aiChatHistory: aiChatHistoryTable,
  aiChatSession: aiChatSessionTable,
  aiJob: aiJobTable,
  trainingDay: trainingDayTable,
  trainingObjective: trainingObjectiveTable,
  trainingObjectiveGrade: trainingObjectiveGradeTable,
  trainingDayGrade: trainingDayGradeTable,
  trainingFinalGrade: trainingFinalGradeTable,
  dailyBriefing: dailyBriefingTable,
  scheduleProposal: scheduleProposalTable,
  roleTaskAssignment: roleTaskAssignmentTable,
  design: designTable,
  pushSubscription: pushSubscriptionTable,
  blogPost: blogPostTable,
});

export default spacetimedb;

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

/** Set the user's email, password hash, and display name after first connect. */
export const createUser = spacetimedb.reducer(
  {
    email: t.string(),
    passwordHash: t.option(t.string()),
    displayName: t.option(t.string()),
  },
  (ctx, { email, passwordHash, displayName }) => {
    const existing = ctx.db.user.identity.find(ctx.sender);
    if (existing) {
      ctx.db.user.identity.update({
        ...existing,
        email,
        passwordHash: passwordHash ?? existing.passwordHash,
        displayName: displayName ?? existing.displayName,
      });
    } else {
      ctx.db.user.insert({
        identity: ctx.sender,
        email,
        passwordHash,
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
    if (!existingUser) throw new Error('Invalid email or password');
    if (!existingUser.passwordHash) throw new Error('Account has no password set');
    if (existingUser.passwordHash !== passwordHash) throw new Error('Invalid email or password');

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
    ctx.db.user.insert({ ...existingUser, identity: newIdentity });

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

/** Create a new organization and make the caller its owner. */
export const createOrg = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const user = ctx.db.user.identity.find(ctx.sender);
    if (!user) unauthorized('Must be logged in');

    const orgId = ctx.newUuidV4();
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
    });
  }
);

/** Update organization name. Owner only. */
export const updateOrg = spacetimedb.reducer(
  { organizationId: t.string(), name: t.string() },
  (ctx, { organizationId, name }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role !== 'owner') unauthorized('Owner only');

    const org = [...ctx.db.organization.iter()]
      .find(o => o.id.toString() === organizationId);
    if (!org) throw new Error('Organization not found');
    // Note: update requires primaryKey index – rebuild with delete + insert
    ctx.db.organization.delete(org);
    ctx.db.organization.insert({ ...org, name });
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

    const org = [...ctx.db.organization.iter()]
      .find(o => o.id.toString() === args.organizationId);
    if (!org) throw new Error('Organization not found');

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

    const token = ctx.newUuidV4().toString();
    const expiresAt = new (ctx.timestamp.constructor as any)(
      ctx.timestamp.microsSinceUnixEpoch + BigInt(7 * 24 * 60 * 60 * 1_000_000) // 7 days
    );

    ctx.db.orgInvitation.insert({
      id: ctx.newUuidV4(),
      organizationId,
      email,
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
    if (!invite) throw new Error('Invitation not found');
    if (invite.acceptedAt !== undefined) throw new Error('Invitation already used');
    if (invite.expiresAt.microsSinceUnixEpoch < ctx.timestamp.microsSinceUnixEpoch) {
      throw new Error('Invitation expired');
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
    if (!target) throw new Error('Member not found');
    if (target.role === 'owner') throw new Error('Cannot modify owner');

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
    if (!target) throw new Error('Member not found');

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
    if (!member) throw new Error('Not a member');
    if (member.role === 'owner') throw new Error('Owner cannot leave; transfer ownership first');
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
    if (!target) throw new Error('Member not found');

    const isSelf = target.id.toString() === caller.id.toString();
    if (!isSelf) {
      const perms = JSON.parse(caller.permissions);
      const canEditTeam = caller.role === 'owner' || perms?.team?.edit === true;
      if (!canEditTeam) unauthorized('Cannot change another member\'s punch-in code');
    }

    // Validate code shape when setting (exactly 4 digits). Clearing is always allowed.
    if (code !== undefined) {
      if (!/^[0-9]{4}$/.test(code)) throw new Error('Code must be 4 digits');
      // Prevent collisions within the same org so punch-in lookups remain unambiguous.
      const collision = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
        .find(m => m.id.toString() !== memberId && m.punchInCode === code);
      if (collision) throw new Error('Code already in use at this store');
    }

    ctx.db.orgMember.delete(target);
    ctx.db.orgMember.insert({ ...target, punchInCode: code });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PUNCH CLOCK REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const recordPunch = spacetimedb.reducer(
  {
    organizationId: t.string(),
    code: t.string(),
    action: t.string(), // "in" | "out" | "break-start" | "break-end"
  },
  (ctx, { organizationId, code, action }) => {
    findActiveMember(ctx, organizationId);

    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.punchInCode === code && m.status === 'active');
    if (!target) throw new Error('Invalid punch-in code');

    const memberId = target.id.toString();
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
      else throw new Error('NEEDS_EXPLICIT_ACTION');
    }

    switch (resolved) {
      case 'in':
        if (isOnShift) throw new Error('Already on shift');
        break;
      case 'out':
        if (!isOnShift) throw new Error('Not on shift');
        if (isOnBreak) throw new Error('End break before punching out');
        break;
      case 'break-start':
        if (!isOnShift) throw new Error('Not on shift');
        if (isOnBreak) throw new Error('Already on break');
        break;
      case 'break-end':
        if (!isOnBreak) throw new Error('Not on break');
        break;
      default:
        throw new Error('Invalid action: ' + resolved);
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
      pin: code,
      action: resolved,
      at: ctx.timestamp,
      closed: resolved === 'out' || resolved === 'break-end',
      pairEventId: pairId,
      createdAt: ctx.timestamp,
    });
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
    if (!device) throw new Error('Device not found');
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
    if (!device) throw new Error('Device not found');
    ctx.db.storeDevice.delete(device);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

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
    if (!existing) throw new Error('Settings not found');

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
      supplier: args.supplier,
      lastRestocked: args.lastRestocked,
      lossRate: 0,
      squareItemId: undefined,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
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
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.inventory?.edit) unauthorized('No inventory edit permission');

    const item = findItemInOrg(ctx.db.inventoryItem, args.organizationId, args.itemId);
    const wasAboveMin = item.currentStock > item.minStock;
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
      supplier: args.supplier,
      lastRestocked: args.lastRestocked,
      lossRate: args.lossRate,
      updatedAt: ctx.timestamp,
    });

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
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const addProduct = spacetimedb.reducer(
  {
    organizationId: t.string(),
    name: t.string(),
    category: t.string(),
    price: t.number(),
    cost: t.number(),
    imageUrl: t.option(t.string()),
    description: t.option(t.string()),
    nameI18n: t.option(t.string()),
    options: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.products?.edit) unauthorized('No products edit permission');

    ctx.db.product.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      name: args.name,
      category: args.category,
      price: args.price,
      cost: args.cost,
      unitsSoldThisMonth: 0,
      unitsSoldLastMonth: 0,
      revenue: 0,
      margin: args.price > 0 ? ((args.price - args.cost) / args.price) * 100 : 0,
      rating: 5,
      trend: 'stable',
      alert: 'none',
      alertReason: undefined,
      imageUrl: args.imageUrl,
      description: args.description,
      nameI18n: args.nameI18n,
      options: args.options,
      squareItemId: undefined,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateProduct = spacetimedb.reducer(
  {
    organizationId: t.string(),
    productId: t.string(),
    name: t.string(),
    category: t.string(),
    price: t.number(),
    cost: t.number(),
    trend: t.string(),
    alert: t.string(),
    alertReason: t.option(t.string()),
    imageUrl: t.option(t.string()),
    description: t.option(t.string()),
    nameI18n: t.option(t.string()),
    options: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.products?.edit) unauthorized('No products edit permission');

    const product = findItemInOrg(ctx.db.product, args.organizationId, args.productId);
    ctx.db.product.delete(product);
    ctx.db.product.insert({
      ...product,
      name: args.name,
      category: args.category,
      price: args.price,
      cost: args.cost,
      margin: args.price > 0 ? ((args.price - args.cost) / args.price) * 100 : 0,
      trend: args.trend,
      alert: args.alert,
      alertReason: args.alertReason,
      imageUrl: args.imageUrl,
      description: args.description,
      nameI18n: args.nameI18n,
      options: args.options,
      updatedAt: ctx.timestamp,
    });
  }
);

export const deleteProduct = spacetimedb.reducer(
  { organizationId: t.string(), productId: t.string() },
  (ctx, { organizationId, productId }) => {
    const member = findActiveMember(ctx, organizationId);
    const perms = JSON.parse(member.permissions);
    if (!perms.products?.edit) unauthorized('No products edit permission');

    const product = findItemInOrg(ctx.db.product, organizationId, productId);
    ctx.db.product.delete(product);
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
  if (!wantedName) throw new Error('staffName is required');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = staffRows.find((m: any) => m.name.trim().toLowerCase() === wantedLower);
  if (match) return { memberId: match.id.toString(), name: match.name };

  throw new Error(
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
      throw new Error('At least one role is required for a shift (pass staffRoles, e.g. ["barista"]).');
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
      throw new Error(
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
    for (const task of [...ctx.db.roleTask.iter()]) {
      if (task.organizationId === organizationId && task.roleId === roleId) {
        ctx.db.roleTask.delete(task);
      }
    }

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
    if (!req) throw new Error('Request not found');

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
    if (!trade) throw new Error('Trade not found');

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
      currency: args.currency,
      method: args.method,
      status: 'completed',
      processorId: undefined,
      processorResponse: undefined,
      customerName: args.customerName,
      notes: args.notes,
      items: args.items,
      taxAmount: args.taxAmount,
      discountAmount: args.discountAmount,
      refundAmount: undefined,
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
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'completed') throw new Error('Only completed payments can be refunded');

    ctx.db.payment.delete(payment);
    ctx.db.payment.insert({
      ...payment,
      status: 'refunded',
      refundAmount,
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
  },
  (ctx, { conversationId, content, replyToId, attachmentUrl, attachmentType, attachmentName }) => {
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
    });

    // Bump conversation updatedAt
    const conv = [...ctx.db.chatConversation.iter()]
      .find(c => c.id.toString() === conversationId);
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
          link: '/~/chat',
          read: false,
          createdAt: ctx.timestamp,
        });
      }
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
    if (!page) throw new Error('Page not found');

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
    ctx.db.siteBooking.insert({
      id: ctx.newUuidV4(),
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
    if (!task) throw new Error('Role task not found');

    ctx.db.roleTask.delete(task);
    ctx.db.roleTask.insert({
      ...task,
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
    if (!task) throw new Error('Role task not found');

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
    if (!page) throw new Error('Page not found');

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
    if (!message) throw new Error('Message not found');

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
    if (!tier) throw new Error('Tier not found');

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
    if (!tier) throw new Error('Tier not found');

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
    if (!perk) throw new Error('Perk not found');

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
    if (!perk) throw new Error('Perk not found');

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
    if (!order) throw new Error('Order not found');

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
    if (!booking) throw new Error('Booking not found');

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
    if (!existing) throw new Error('Customer points record not found');
    if (existing.points < points) throw new Error('Insufficient points');

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
    if (!invite) throw new Error('Invitation not found');

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
    if (!todo) throw new Error('Todo not found');

    ctx.db.todo.delete(todo);
    ctx.db.todo.insert({ ...todo, completed });
  }
);

export const deleteTodo = spacetimedb.reducer(
  { todoId: t.string() },
  (ctx, { todoId }) => {
    const todo = [...ctx.db.todo.byUserId.filter(ctx.sender)]
      .find(t => t.id.toString() === todoId);
    if (!todo) throw new Error('Todo not found');

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
    if (!notif) throw new Error('Notification not found');
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
    if (!notif) throw new Error('Notification not found');
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
      totalCost,
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
    if (!log) throw new Error('Waste log not found');
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
    if (!loc) throw new Error('Location not found');

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
    if (!loc) throw new Error('Location not found');
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
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');
    const sup = [...ctx.db.supplier.byOrganizationId.filter(args.organizationId)]
      .find(s => s.id.toString() === args.supplierId);
    if (!sup) throw new Error('Supplier not found');
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
    if (!sup) throw new Error('Supplier not found');
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
      tax: args.tax,
      total: args.total,
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
    if (!po) throw new Error('Purchase order not found');
    ctx.db.purchaseOrder.delete(po);
    ctx.db.purchaseOrder.insert({
      ...po,
      status,
      ...(status === 'sent' ? { sentAt: ctx.timestamp } : {}),
      ...(status === 'received' ? { receivedAt: ctx.timestamp } : {}),
    });
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
    if (!exp) throw new Error('Expense not found');
    ctx.db.expense.delete(exp);
    ctx.db.expense.insert({
      ...exp,
      category: args.category,
      description: args.description,
      amount: args.amount,
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
    if (!exp) throw new Error('Expense not found');
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
    if (!c) throw new Error('Coupon not found');
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
    if (!c) throw new Error('Coupon not found');
    ctx.db.coupon.delete(c);
  }
);

export const redeemCoupon = spacetimedb.reducer(
  { organizationId: t.string(), code: t.string() },
  (ctx, { organizationId, code }) => {
    findActiveMember(ctx, organizationId);
    const c = [...ctx.db.coupon.byCode.filter(code.toUpperCase())]
      .find(c => c.organizationId === organizationId);
    if (!c) throw new Error('Coupon not found');
    if (!c.active) throw new Error('Coupon is inactive');
    if (c.usedCount >= c.maxUses && c.maxUses > 0) throw new Error('Coupon usage limit reached');
    const today = new Date().toISOString().slice(0, 10);
    if (today < c.validFrom || today > c.validUntil) throw new Error('Coupon expired');
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
    if (!e) throw new Error('Queue entry not found');
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
    if (!e) throw new Error('Queue entry not found');
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
  if (!item) throw new Error('Record not found');
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findActiveMember(ctx: any, organizationId: string) {
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

// ═══════════════════════════════════════════════════════════════════════════════
// AI CHAT HISTORY REDUCERS
// ═══════════════════════════════════════════════════════════════════════════════

export const saveAiChatHistory = spacetimedb.reducer(
  {
    organizationId: t.string(),
    messages: t.string(),
    summary: t.option(t.string()),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    const existing = [...ctx.db.aiChatHistory.byUserId.filter(ctx.sender)]
      .find((r: { organizationId: string }) => r.organizationId === args.organizationId);
    if (existing) {
      ctx.db.aiChatHistory.id.update({
        ...existing,
        messages: args.messages,
        summary: args.summary ?? existing.summary,
        updatedAt: ctx.timestamp,
      });
    } else {
      ctx.db.aiChatHistory.insert({
        id: ctx.newUuidV4(),
        organizationId: args.organizationId,
        userId: ctx.sender,
        messages: args.messages,
        summary: args.summary ?? undefined,
        updatedAt: ctx.timestamp,
      });
    }
  }
);

export const clearAiChatHistory = spacetimedb.reducer(
  {
    organizationId: t.string(),
  },
  (ctx, args) => {
    findActiveMember(ctx, args.organizationId);
    const existing = [...ctx.db.aiChatHistory.byUserId.filter(ctx.sender)]
      .find((r: { organizationId: string }) => r.organizationId === args.organizationId);
    if (existing) {
      ctx.db.aiChatHistory.id.update({
        ...existing,
        messages: '[]',
        updatedAt: ctx.timestamp,
      });
    }
  }
);

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
    if (!existing) throw new Error('Session not found');
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
    if (!existing) throw new Error('Session not found');
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
    const existing = [...ctx.db.aiJob.iter()]
      .find((r: { id: { toString(): string }; organizationId: string }) =>
        r.id.toString() === args.jobId && r.organizationId === args.organizationId
      );
    if (!existing) throw new Error('Job not found');
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
    const existing = [...ctx.db.aiJob.iter()]
      .find((r: { id: { toString(): string }; organizationId: string }) =>
        r.id.toString() === args.jobId && r.organizationId === args.organizationId
      );
    if (!existing) throw new Error('Job not found');
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
    const existing = [...ctx.db.aiJob.iter()]
      .find((r: { id: { toString(): string }; organizationId: string }) =>
        r.id.toString() === args.jobId && r.organizationId === args.organizationId
      );
    if (!existing) throw new Error('Job not found');
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
    const existing = [...ctx.db.aiJob.iter()]
      .find((r: { id: { toString(): string }; organizationId: string }) =>
        r.id.toString() === args.jobId && r.organizationId === args.organizationId
      );
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

    // Cascade: delete objectives, day-grades, and objective-grades attached to this day.
    for (const obj of [...ctx.db.trainingObjective.iter()]) {
      if (obj.organizationId !== organizationId || obj.dayId !== dayId) continue;
      for (const g of [...ctx.db.trainingObjectiveGrade.iter()]) {
        if (g.organizationId === organizationId && g.objectiveId === obj.id.toString()) {
          ctx.db.trainingObjectiveGrade.delete(g);
        }
      }
      ctx.db.trainingObjective.delete(obj);
    }
    for (const g of [...ctx.db.trainingDayGrade.iter()]) {
      if (g.organizationId === organizationId && g.dayId === dayId) {
        ctx.db.trainingDayGrade.delete(g);
      }
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
    for (const g of [...ctx.db.trainingObjectiveGrade.iter()]) {
      if (g.organizationId === organizationId && g.objectiveId === objectiveId) {
        ctx.db.trainingObjectiveGrade.delete(g);
      }
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

    // Verify the objective belongs to this org.
    findItemInOrg(ctx.db.trainingObjective, args.organizationId, args.objectiveId);

    for (const g of [...ctx.db.trainingObjectiveGrade.iter()]) {
      if (
        g.organizationId === args.organizationId &&
        g.traineeId === args.traineeId &&
        g.objectiveId === args.objectiveId
      ) {
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

    for (const g of [...ctx.db.trainingObjectiveGrade.iter()]) {
      if (
        g.organizationId === args.organizationId &&
        g.traineeId === args.traineeId &&
        g.objectiveId === args.objectiveId
      ) {
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

    findItemInOrg(ctx.db.trainingDay, args.organizationId, args.dayId);

    for (const g of [...ctx.db.trainingDayGrade.iter()]) {
      if (
        g.organizationId === args.organizationId &&
        g.traineeId === args.traineeId &&
        g.dayId === args.dayId
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
  }
);

// ── Grading: final overall (upsert) ─────────────────────────────────────────

export const setTrainingFinalGrade = spacetimedb.reducer(
  {
    organizationId: t.string(),
    traineeId: t.string(),
    score: t.i32(),                  // 0..100
    comment: t.option(t.string()),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    requireGradingPermission(member);

    for (const g of [...ctx.db.trainingFinalGrade.iter()]) {
      if (
        g.organizationId === args.organizationId &&
        g.traineeId === args.traineeId
      ) {
        ctx.db.trainingFinalGrade.delete(g);
      }
    }

    ctx.db.trainingFinalGrade.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      traineeId: args.traineeId,
      score: args.score,
      comment: args.comment,
      gradedBy: ctx.sender,
      gradedAt: ctx.timestamp,
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
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    for (const row of [...ctx.db.dailyBriefing.iter()]) {
      if (row.organizationId === args.organizationId && row.date === args.date) {
        ctx.db.dailyBriefing.delete(row);
      }
    }

    ctx.db.dailyBriefing.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      date: args.date,
      content: args.content,
      summary: args.summary,
      generatedBy: args.generatedBy,
      generatedAt: ctx.timestamp,
    });
  }
);

/**
 * Save a 7-day schedule proposal. Idempotent on (orgId, weekStart) — calling
 * again overwrites a still-draft proposal for the same week. Committed
 * proposals are kept for audit and won't be re-overwritten.
 */
export const saveScheduleProposal = spacetimedb.reducer(
  {
    organizationId: t.string(),
    weekStart: t.string(),
    weekEnd: t.string(),
    shifts: t.string(),
    status: t.string(),
    generatedBy: t.string(),
  },
  (ctx, args) => {
    const member = findActiveMember(ctx, args.organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    for (const row of [...ctx.db.scheduleProposal.iter()]) {
      if (
        row.organizationId === args.organizationId &&
        row.weekStart === args.weekStart &&
        row.status === 'draft'
      ) {
        ctx.db.scheduleProposal.delete(row);
      }
    }

    ctx.db.scheduleProposal.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      weekStart: args.weekStart,
      weekEnd: args.weekEnd,
      shifts: args.shifts,
      status: args.status,
      generatedBy: args.generatedBy,
      generatedAt: ctx.timestamp,
      decidedAt: args.status === 'committed' ? ctx.timestamp : undefined,
    });
  }
);

/** Mark a schedule proposal as committed (owner accepted it). */
export const commitScheduleProposal = spacetimedb.reducer(
  { organizationId: t.string(), proposalId: t.string() },
  (ctx, { organizationId, proposalId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const proposal = [...ctx.db.scheduleProposal.iter()]
      .find(p => p.id.toString() === proposalId && p.organizationId === organizationId);
    if (!proposal) throw new Error('Proposal not found');
    ctx.db.scheduleProposal.delete(proposal);
    ctx.db.scheduleProposal.insert({
      ...proposal,
      status: 'committed',
      decidedAt: ctx.timestamp,
    });
  }
);

/** Mark a schedule proposal as rejected. */
export const rejectScheduleProposal = spacetimedb.reducer(
  { organizationId: t.string(), proposalId: t.string() },
  (ctx, { organizationId, proposalId }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role === 'staff') unauthorized('Manager or owner required');

    const proposal = [...ctx.db.scheduleProposal.iter()]
      .find(p => p.id.toString() === proposalId && p.organizationId === organizationId);
    if (!proposal) throw new Error('Proposal not found');
    ctx.db.scheduleProposal.delete(proposal);
    ctx.db.scheduleProposal.insert({
      ...proposal,
      status: 'rejected',
      decidedAt: ctx.timestamp,
    });
  }
);

/** Toggle whether AI-generated schedules auto-commit when no shifts exist. */
export const setAutoCommitSchedules = spacetimedb.reducer(
  { organizationId: t.string(), autoCommit: t.bool() },
  (ctx, { organizationId, autoCommit }) => {
    const member = findActiveMember(ctx, organizationId);
    if (member.role !== 'owner') unauthorized('Owner only');

    const existing = [...ctx.db.settings.byOrganizationId.filter(organizationId)][0];
    if (!existing) throw new Error('Settings not found');
    ctx.db.settings.delete(existing);
    ctx.db.settings.insert({
      ...existing,
      autoCommitSchedules: autoCommit,
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
    if (!existing) throw new Error('Settings not found');
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
    if (!task) throw new Error('Role task not found');
    const member = [...ctx.db.staffMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId);
    if (!member) throw new Error('Staff member not found');

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
  },
  (ctx, { organizationId, assignmentId, evidenceUrl, note }) => {
    findActiveMember(ctx, organizationId);

    const existing = [...ctx.db.roleTaskAssignment.byOrganizationId.filter(organizationId)]
      .find(a => a.id.toString() === assignmentId);
    if (!existing) throw new Error('Assignment not found');

    ctx.db.roleTaskAssignment.delete(existing);
    ctx.db.roleTaskAssignment.insert({
      ...existing,
      status: 'completed',
      evidenceUrl: evidenceUrl ?? existing.evidenceUrl,
      note: note ?? existing.note,
      completedAt: ctx.timestamp,
      completedBy: ctx.sender,
      skipReason: undefined,
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
    if (!existing) throw new Error('Assignment not found');

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
    if (!existing) throw new Error('Assignment not found');

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
  },
  (ctx, { organizationId, taskId, memberId, evidenceUrl, note }) => {
    findActiveMember(ctx, organizationId);

    const task = [...ctx.db.roleTask.byOrganizationId.filter(organizationId)]
      .find(r => r.id.toString() === taskId);
    if (!task) throw new Error('Role task not found');

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
      evidenceUrls: undefined,
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
    if (!target) throw new Error('User not found');
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
    if (dup) throw new Error('Slug already in use');
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
    if (!existing) throw new Error('Post not found');
    if (existing.slug !== slug) {
      const dup = [...ctx.db.blogPost.bySlug.filter(slug)][0];
      if (dup) throw new Error('Slug already in use');
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

export const deleteBlogPost = spacetimedb.reducer(
  { postId: t.string() },
  (ctx, { postId }) => {
    requireAdmin(ctx);
    const existing = [...ctx.db.blogPost.iter()].find((p) => p.id.toString() === postId);
    if (!existing) throw new Error('Post not found');
    ctx.db.blogPost.delete(existing);
  }
);
