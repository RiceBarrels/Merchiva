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
    public: false,
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
  }
);

// ─── Org Invitations ──────────────────────────────────────────────────────────

const orgInvitationTable = table(
  {
    name: 'org_invitation',
    public: false,
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
    public: false,
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
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// ─── Inventory Items ──────────────────────────────────────────────────────────

const inventoryItemTable = table(
  {
    name: 'inventory_item',
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    targetId: t.string(),      // org_member ID
    targetShiftId: t.option(t.string()),
    type: t.string(),           // "trade" | "cover"
    status: t.string(),         // "pending" | "accepted" | "denied" | "cancelled"
    managerApproved: t.bool(),
    managerId: t.option(t.string()),
    comments: t.string(),
    createdAt: t.timestamp(),
  }
);

// ─── Products ─────────────────────────────────────────────────────────────────

const productTable = table(
  {
    name: 'product',
    public: false,
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
    squareItemId: t.option(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// ─── Payments ─────────────────────────────────────────────────────────────────

const paymentTable = table(
  {
    name: 'payment',
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
  }
);

const siteComponentTable = table(
  {
    name: 'site_component',
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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
    public: false,
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

/** Set the user's email and display name after first login. */
export const createUser = spacetimedb.reducer(
  {
    email: t.string(),
    displayName: t.option(t.string()),
  },
  (ctx, { email, displayName }) => {
    const existing = ctx.db.user.identity.find(ctx.sender);
    if (existing) {
      ctx.db.user.identity.update({ ...existing, email, displayName: displayName ?? existing.displayName });
    } else {
      ctx.db.user.insert({
        identity: ctx.sender,
        email,
        displayName,
        avatarUrl: undefined,
        lastActiveOrgId: undefined,
        createdAt: ctx.timestamp,
      });
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
    });

    // Initialize default settings for the org
    ctx.db.settings.insert({
      id: ctx.newUuidV4(),
      organizationId: orgId.toString(),
      businessName: undefined,
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
    });

    // Mark invitation as accepted (delete + reinsert)
    ctx.db.orgInvitation.delete(invite);
    ctx.db.orgInvitation.insert({ ...invite, acceptedAt: ctx.timestamp });
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
  },
  (ctx, { organizationId, businessName, businessType, timezone, paymentTaxRate, paymentCurrency }) => {
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
  }
);

// ─── Shift Trades ─────────────────────────────────────────────────────────────

export const createShiftTrade = spacetimedb.reducer(
  {
    organizationId: t.string(),
    shiftId: t.string(),
    requesterId: t.string(),
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
    });
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

    const isManager = member.role === 'owner' || member.role === 'manager';
    const isParticipant =
      trade.requesterId === member.id.toString() ||
      trade.targetId === member.id.toString();

    if (!isManager && !isParticipant) unauthorized('Not a participant');

    ctx.db.shiftTrade.delete(trade);
    ctx.db.shiftTrade.insert({
      ...trade,
      status,
      managerApproved: isManager && status === 'accepted',
      managerId: isManager ? member.id.toString() : trade.managerId,
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

/** Look up the calling user's active org membership, throwing if not found. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findActiveMember(ctx: any, organizationId: string) {
  const member = [...ctx.db.orgMember.byUserId.filter(ctx.sender)]
    .find((m: { organizationId: string; status: string }) =>
      m.organizationId === organizationId && m.status === 'active'
    );
  if (!member) unauthorized('Not an active member of this organization');
  return member as {
    id: { toHexString(): string };
    organizationId: string;
    role: string;
    permissions: string;
    status: string;
  };
}
