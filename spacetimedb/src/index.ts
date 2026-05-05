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

    ctx.db.shift.insert({
      id: ctx.newUuidV4(),
      organizationId: args.organizationId,
      memberId: args.memberId,
      staffName: args.staffName,
      staffRole: args.staffRole,
      staffRoles: args.staffRoles,
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
    ctx.db.shift.delete(shift);
    ctx.db.shift.insert({
      ...shift,
      memberId: args.memberId,
      staffName: args.staffName,
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

    // Add creator as member
    ctx.db.chatMember.insert({
      id: ctx.newUuidV4(),
      conversationId: convId.toString(),
      userId: ctx.sender,
      joinedAt: ctx.timestamp,
    });
  }
);

export const sendMessage = spacetimedb.reducer(
  { conversationId: t.string(), content: t.string() },
  (ctx, { conversationId, content }) => {
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
    });

    // Bump conversation updatedAt
    const conv = [...ctx.db.chatConversation.iter()]
      .find(c => c.id.toString() === conversationId);
    if (conv) {
      ctx.db.chatConversation.delete(conv);
      ctx.db.chatConversation.insert({ ...conv, updatedAt: ctx.timestamp });
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
      ctx.db.chatMember.insert({
        id: ctx.newUuidV4(),
        conversationId,
        userId: uid as unknown as typeof ctx.sender,
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
