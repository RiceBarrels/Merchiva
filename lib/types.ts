// ─── User Profile & Org Summary ──────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastActiveOrgId: string | null;
}

export interface OrgSummary {
  id: string;
  name: string;
  // When set, this org is a sub-store of the given parent org id. Sub-stores
  // share staff, products, chat, design, and sites with their parent + sibling
  // sub-stores. Inventory and sales forecasts stay strictly per-org.
  parentOrgId?: string | null;
  // Store image (UploadThing URL) — shown wherever the user picks a store.
  logoUrl?: string | null;
}

// ─── Permissions & Team ───────────────────────────────────────────────────────

export interface PermissionSection {
  view: boolean;
  edit?: boolean;
  invite?: boolean;
}

export interface Permissions {
  dashboard: PermissionSection;
  inventory: PermissionSection;
  sales: PermissionSection;
  staffing: PermissionSection;
  products: PermissionSection;
  settings: PermissionSection;
  team: PermissionSection;    // view=see team list, invite=send invites, edit=change roles/codes
  training_grading: PermissionSection; // view=see trainee grades, edit=grade trainees
  merchiva: PermissionSection; // view=can use the Mr. Merchiva assistant (chat + quick dialog)
}

export type OrgRole = "owner" | "manager" | "staff";
export type MemberStatus = "active" | "disabled";

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  permissions: Permissions;
  status: MemberStatus;
  punchInCode?: string | null;
}

export interface OrgInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrgRole;
  permissions: Permissions;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export type InventoryStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface InventoryExpirationBatch {
  expiresOn?: string | null; // ISO date string YYYY-MM-DD; empty/null = unknown
  quantity: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  costPerUnit: number;
  supplier: string;
  lastRestocked: string; // ISO date string
  status: InventoryStatus;
  lossRate: number; // percentage
  minOrderQty?: number; // supplier minimum order (units); undefined = unset
  unitsPerCase?: number; // units per case/box; order in multiples of this
  unitContentAmount?: number; // amount inside one unit/case/bottle/bag
  unitContentUnit?: string; // g, kg, ml, l, oz, lb, fl_oz, gal
  retailEnabled?: boolean; // true = sellable in POS/storefront
  retailPrice?: number;
  retailDescription?: string;
  retailImageUrl?: string;
  retailUsageQty?: number; // inventory quantity consumed by one sale
  expirationBatches?: InventoryExpirationBatch[];
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  itemName: string;
  type: "in" | "out" | "loss" | "adjustment";
  quantity: number;
  date: string;
  note: string;
  operatorMemberId?: string;
  operatorName?: string;
  createdAt?: Date;
  evidenceUrls?: { url: string; type: string }[];
  batchExpirationDate?: string;
}

// ─── Sales ───────────────────────────────────────────────────────────────────

export interface SalesRecord {
  date: string; // ISO date string
  hour?: number; // 0-23 for hourly records
  actual: number;
  predicted: number;
  weather: string;
  footTraffic: number;
  isHoliday: boolean;
}

export interface SalesForecast {
  date: string;
  predicted: number;
  confidence: number; // 0-100
  factors: {
    weather: string;
    footTraffic: "low" | "medium" | "high";
    isHoliday: boolean;
    dayOfWeek: string;
  };
}

// ─── Staffing ────────────────────────────────────────────────────────────────

export type ShiftType = "morning" | "afternoon" | "evening" | "closing";

export interface ShiftPreset {
  id: string;
  organizationId: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  sortOrder: number;
}

export interface StaffRole {
  id: string;
  name: string;
  color: string;
  icon: string;        // Lucide icon name e.g. "coffee", "chef-hat", "truck"
  description: string; // What this role does
  permissions: StaffRolePermissions;
}

export interface RoleTask {
  id: string;
  roleId: string;
  organizationId: string | null;
  title: string;
  description: string;
  startTime: string | null; // "06:00" or null if no time constraint
  endTime: string | null;   // "08:00" or null
  sortOrder: number;
  requiresEvidence: boolean;
  notifyChats: string[]; // conversation IDs to notify on completion
}

export interface StaffRolePermissions {
  canViewSchedule?: boolean;
  canEditSchedule?: boolean;
  canViewInventory?: boolean;
  canEditInventory?: boolean;
  canViewSales?: boolean;
  canHandleCash?: boolean;
  canCloseStore?: boolean;
}

export interface Shift {
  id: string;
  memberId: string | null;
  staffName: string;
  staffRole: string | null; // legacy single role
  staffRoles: string[]; // multiple roles
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  predictedDemand: "low" | "medium" | "high";
}

export interface StaffingRecommendation {
  date: string;
  shift: ShiftType;
  recommendedCount: number;
  currentScheduled: number;
  reason: string;
}

export interface DayTime {
  enabled: boolean;
  fullDay: boolean;
  startTime: string;
  endTime: string;
}

export interface StaffAvailability {
  id: string;
  userId: string;
  organizationId: string;
  type: "permanent" | "temporary";
  startDate: string | null;
  endDate: string | null;
  days: boolean[]; // 7 elements, Sun(0)–Sat(6) — kept for backward compat
  dayTimes: DayTime[]; // 7 elements, Sun(0)–Sat(6) — per-day time config
  status: string;
  fullDay: boolean; // legacy global toggle
  startTime: string | null; // legacy global time
  endTime: string | null; // legacy global time
  comments: string;
}

export interface TimeOffRequest {
  id: string;
  userId: string;
  organizationId: string;
  startDate: string;
  endDate: string;
  fullDays: boolean;
  startTime: string | null;
  endTime: string | null;
  comments: string;
  status: "pending" | "approved" | "denied";
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface ShiftTrade {
  id: string;
  organizationId: string;
  shiftId: string;
  requesterId: string;
  broadcastToAll: boolean;
  targetId: string | null;
  acceptedById: string | null;
  targetShiftId: string | null;
  type: "trade" | "cover";
  status: "pending" | "accepted" | "denied" | "cancelled";
  managerApproved: boolean;
  managerId: string | null;
  comments: string;
  createdAt: string;
}

// ─── Notifications ─────────────────────────────────────────────────────────

export type NotificationType = "inventory_low" | "shift_trade" | "time_off" | "team" | "order" | "general";

export interface AppNotification {
  id: string;
  organizationId: string;
  targetId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

// ─── Locations ─────────────────────────────────────────────────────────────

export interface Location {
  id: string;
  organizationId: string;
  name: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
}

// ─── Waste Log ─────────────────────────────────────────────────────────────

export type WasteReason = "expired" | "damaged" | "overproduction" | "other";

export interface WasteLog {
  id: string;
  organizationId: string;
  itemId: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  reason: WasteReason;
  costPerUnit: number;
  totalCost: number;
  date: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

// ─── Suppliers ──────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  organizationId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string | null;
  notes: string | null;
  rating: number;
  createdAt: string;
  language: string | null;
}

// ─── Purchase Orders ────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id: string;
  organizationId: string;
  supplierId: string;
  status: string;
  items: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export type ExpenseCategory = "rent" | "utilities" | "supplies" | "payroll" | "marketing" | "other";

export interface Expense {
  id: string;
  organizationId: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
  recurringPeriod: string | null;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: string;
}

// ─── Todos ──────────────────────────────────────────────────────────────────

export interface Todo {
  id: string;
  userId: string;
  organizationId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export interface ChatConversation {
  id: string;
  organizationId: string;
  type: "direct" | "group";
  name: string | null;
  createdBy: string | null;
  createdAt: string;
  // True when Mr. Merchiva participates in this conversation.
  merchivaEnabled?: boolean;
  // Joined fields
  members?: ChatMember[];
  lastMessage?: ChatMessage | null;
}

export interface ChatMember {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: string;
  // Joined
  displayName?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  replyToId: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  // True when this message was authored by Mr. Merchiva (rendered as the bot
  // regardless of senderId).
  isMerchiva?: boolean;
  // Raw speech-to-text transcript when `content` is an AI summary of a voice
  // message (walkie-talkie surfaces).
  voiceTranscript?: string | null;
  // Joined
  senderName?: string;
}

// ─── Products ────────────────────────────────────────────────────────────────

export type ProductAlert = "none" | "underperforming" | "remove";

export interface ProductInventoryUsage {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unit: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  unitsSoldThisMonth: number;
  unitsSoldLastMonth: number;
  revenue: number;
  margin: number; // percentage
  rating: number; // 1-5
  trend: "up" | "down" | "stable";
  alert: ProductAlert;
  alertReason?: string;
  imageUrl?: string;
  description?: string;
  inventoryUsage?: ProductInventoryUsage[];
  nameI18n?: Record<string, string>;
  images?: string[];
  // The org id this product was created under. Surfaced to the UI so multi-
  // store pages can label which store owns each row.
  organizationId?: string;
  // When set, only the listed store ids may sell this product. undefined =
  // sold at every store in the share group (default). Empty array = sold
  // nowhere right now (hidden from all storefronts but still in the catalog).
  availableStoreIds?: string[] | null;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  inventoryValue: number;
  lowStockItems: number;
  todaySalesPredicted: number;
  todaySalesActual: number;
  staffScheduledToday: number;
  staffNeededToday: number;
  productsAtRisk: number;
  totalProducts: number;
}
