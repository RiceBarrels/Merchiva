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
  pos: PermissionSection;
  team: PermissionSection;    // view=see team list, invite=send invites, edit=change roles/codes
  website: PermissionSection; // view=see builder, edit=modify sites
  training_grading: PermissionSection; // view=see trainee grades, edit=grade trainees
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

export interface InventoryItem {
  id: string;
  name: string;
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
  // Joined
  senderName?: string;
}

// ─── Products ────────────────────────────────────────────────────────────────

export type ProductAlert = "none" | "underperforming" | "remove";

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
  nameI18n?: Record<string, string>;
  images?: string[];
  pageTemplate?: SiteElement[] | null;
  // The org id this product was created under. Surfaced to the UI so multi-
  // store pages can label which store owns each row.
  organizationId?: string;
  // When set, only the listed store ids may sell this product. undefined =
  // sold at every store in the share group (default). Empty array = sold
  // nowhere right now (hidden from all storefronts but still in the catalog).
  availableStoreIds?: string[] | null;
}

// ─── Design (fixed-size HTML canvas, e.g. posters/social images) ────────────

export interface Design {
  id: string;
  organizationId: string;
  name: string;
  width: number;
  height: number;
  html: string;
  preset: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Site Builder ────────────────────────────────────────────────────────────

export interface SiteTheme {
  primary: string;      // hex — buttons, headings accent
  secondary: string;    // hex — muted text, borders
  accent: string;       // hex — highlights, CTAs
  background: string;   // hex — page bg
  text: string;         // hex — body text
  headingFont: string;  // CSS font-family value
  bodyFont: string;     // CSS font-family value
  borderRadius: number; // px applied to cards/buttons
  presetName?: string;
}

export interface SiteConfig {
  id: string;
  organizationId: string;
  name: string;
  subdomain: string;
  published: boolean;
  theme: SiteTheme;
  createdAt: string;
  updatedAt: string;
}

export interface PricingItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  badge?: string;   // e.g. "Popular", "New"
  category?: string;
}

export interface TestimonialData {
  id: string;
  authorName: string;
  rating: number;       // 1–5
  content: string;
  date?: string;        // ISO date string
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export type ElementType =
  | "text" | "image" | "button" | "layout" | "fixed" | "divider"
  | "hero" | "nav" | "footer" | "spacer" | "columns"
  | "product-card" | "booking-form" | "coupon-banner"
  | "pricing-table" | "testimonial" | "faq" | "gallery"
  | "custom-html" | "login-form" | "code-block" | "membership-widget"
  | "cart" | "checkout" | "reward" | "icon" | "menu-grid"
  | "viewport"
  | "container"; // legacy alias — do not use in new code

export interface SiteElement {
  id: string;
  type: ElementType;
  props: Record<string, unknown>;
  children?: SiteElement[];
  // Free-form canvas position (editor-only, ignored by published renderer)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // Page-template lock: when true, the node cannot be deleted or cut
  // by the user (style/position editing still allowed). Locked nodes
  // come from preset page templates.
  locked?: boolean;
  // Optional human-readable label shown in the lock badge.
  lockLabel?: string;
}

export interface PageMetadata {
  title?: string;
  description?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  keywords?: string;
  robots?: string;
  canonicalUrl?: string;
}

export interface SitePage {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  elements: SiteElement[];
  sortOrder: number;
  html?: string;
  metadata?: PageMetadata;
  createdAt: string;
}

export interface SiteFeatures {
  auth: boolean;
  cart: boolean;
  checkout: boolean;
  products: boolean;
  subscriptions: boolean;
  rewards: boolean;
  booking: boolean;
  account: boolean;
}

export interface Site {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  theme: SiteTheme;
  features: SiteFeatures;
  published: boolean;
  customDomain: string | null;
  values?: Record<string, string>;
  // User-overridden design tokens, keyed by CSS custom property name
  // (e.g. "--mv-color-brand-primary"). Falls back to globals.css defaults
  // for any token not listed here. Persisted in features._tokens.
  tokens?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
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

// ─── Membership ───────────────────────────────────────────────────────────────

export interface MembershipTier {
  id: string;
  siteId: string;
  name: string;
  description: string | null;
  price: number;
  pricePeriod: "monthly" | "yearly" | "one-time" | "free";
  color: string;
  icon: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
}

export interface MembershipPerk {
  id: string;
  tierId: string;
  type: "discount" | "freebie" | "coupon" | "points-multiplier" | "custom";
  name: string;
  description: string | null;
  couponCode: string | null;
  discountValue: number | null;
  discountType: "percent" | "fixed" | null;
  cooldownHours: number | null;
  frequency: number | null;
  minPurchase: number | null;
  validDays: number[] | null;   // 0=Sun…6=Sat, null=any day
  validHours: [number, number] | null; // [startHour, endHour], null=any time
  active: boolean;
  sortOrder: number;
}

export interface PerkClaim {
  id: string;
  perkId: string;
  customerId: string;
  claimedAt: string;
  usedAt: string | null;
  couponCode: string | null;
  expiresAt: string | null;
}

export interface SiteCustomer {
  id: string;
  siteId: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: string;
}

export interface CustomerPoints {
  customerId: string;
  siteId: string;
  points: number;
  lifetimePoints: number;
}

export interface SiteOrder {
  id: string;
  siteId: string;
  customerId: string | null;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  customerName?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface SiteBooking {
  id: string;
  siteId: string;
  customerId: string | null;
  date: string;
  time: string;
  partySize: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
}

// ─── POS / Payments ───────────────────────────────────────────────────────────

export interface CartItem {
  id: string;        // product id, or "custom-{uid}" for manual entries
  name: string;
  price: number;
  quantity: number;
  category?: string;
}

// ─── Site storefront cart (public-facing, used in site-customer-context) ─────

export interface SiteCartItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export type PaymentMethod = "card" | "cash" | "other";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export interface Payment {
  id: string;
  organizationId: string;
  userId?: string | null;
  orderId?: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  processorId?: string | null;
  processorResponse?: Record<string, unknown> | null;
  customerName?: string | null;
  notes?: string | null;
  items?: CartItem[] | null;
  taxAmount: number;
  discountAmount: number;
  refundAmount?: number | null;
  refundReason?: string | null;
  refundedAt?: string | null;
  createdAt: string;
}

// ─── Coupons ───────────────────────────────────────────────────────────────

export interface Coupon {
  id: string;
  organizationId: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minPurchase: number;
  maxUses: number;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  active: boolean;
  description: string | null;
  createdAt: string;
}

// ─── Queue ─────────────────────────────────────────────────────────────────

export interface QueueEntry {
  id: string;
  organizationId: string;
  customerName: string;
  partySize: number;
  phone: string | null;
  status: "waiting" | "seated" | "cancelled" | "no_show";
  estimatedWait: number;
  notes: string | null;
  queuedAt: string;
  seatedAt: string | null;
}

// ─── SiteElementType alias for backward compatibility
export type SiteElementType = ElementType;

// ─── Site Membership (simple plan-based, distinct from MembershipTier system) ──

export interface SiteMembership {
  id: string;
  siteId: string;
  customerId: string;
  plan: string;
  startedAt: string;
  expiresAt: string | null;
}

// ─── Component Library ────────────────────────────────────────────────────────

export interface SiteComponent {
  id: string;
  organizationId: string;
  siteId: string | null;
  name: string;
  description: string | null;
  elementData: SiteElement;
  category: string | null;
  createdBy: string | null;
  createdAt: string;
}
