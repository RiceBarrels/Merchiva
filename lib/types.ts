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
}

// ─── Permissions & Team ───────────────────────────────────────────────────────

export interface PermissionSection {
  view: boolean;
  edit?: boolean;
}

export interface Permissions {
  dashboard: PermissionSection;
  inventory: PermissionSection;
  sales: PermissionSection;
  staffing: PermissionSection;
  products: PermissionSection;
  settings: PermissionSection;
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
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  itemName: string;
  type: "in" | "out" | "loss" | "adjustment";
  quantity: number;
  date: string;
  note: string;
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
  targetId: string;
  targetShiftId: string | null;
  type: "trade" | "cover";
  status: "pending" | "accepted" | "denied" | "cancelled";
  managerApproved: boolean;
  managerId: string | null;
  comments: string;
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

// ─── Website Builder ──────────────────────────────────────────────────────────

export type ElementType =
  | "text"
  | "image"
  | "button"
  | "container"
  | "divider"
  | "hero"
  | "nav"
  | "footer"
  | "spacer"
  | "columns"
  | "video"
  | "gallery"
  | "product-card"
  | "booking-form"
  | "coupon-banner"
  | "login-form"
  | "pricing-table"
  | "testimonial"
  | "faq"
  | "custom-html";

export interface SiteTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  borderRadius: string;
}

export interface SiteElement {
  id: string;
  pageId: string;
  siteId: string;
  organizationId: string;
  type: ElementType;
  props: Record<string, unknown>;
  sortOrder: number;
}

export interface SitePage {
  id: string;
  siteId: string;
  organizationId: string;
  name: string;
  slug: string;
  sortOrder: number;
  elements?: SiteElement[];
}

export interface Site {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  slug: string;
  status: "draft" | "published";
  theme: SiteTheme;
  createdAt: string;
  updatedAt: string;
  pages?: SitePage[];
}
