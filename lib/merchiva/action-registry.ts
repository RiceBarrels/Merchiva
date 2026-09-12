import {
  addShift,
  updateShift,
  deleteShift,
  addStaffMember,
  updateStaffMember,
  deleteStaffMember,
  addStaffRole,
  updateStaffRole,
  deleteStaffRole,
  addRoleTask,
  updateRoleTask,
  deleteRoleTask,
  addProduct,
  updateProduct,
  deleteProduct,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  addInventoryTransaction,
  addSupplier,
  updateSupplier,
  deleteSupplier,
  createPurchaseOrder,
  createNotification,
  updateTimeOffStatus,
  managerApproveShiftTrade,
  addCoupon,
  updateCoupon,
  deleteCoupon,
  addTrainingDay,
  updateTrainingDay,
  deleteTrainingDay,
  addTrainingObjective,
  updateTrainingObjective,
  deleteTrainingObjective,
  setPunchInCode,
  recordSupplierOrder,
} from "@/lib/spacetimedb/actions";
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";

export type RiskLevel = "low" | "medium" | "high";

export type ActionCategory =
  | "scheduling"
  | "roles"
  | "inventory"
  | "products"
  | "pricing"
  | "suppliers"
  | "staffing"
  | "notifications"
  | "builder"
  | "training";

export interface ParameterDef {
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  description: string;
  enum?: string[];
}

export interface ActionDefinition {
  name: string;
  description: string;
  category: ActionCategory;
  parameters: Record<string, ParameterDef>;
  requiredPermission?: { section: string; action: "view" | "edit" };
  riskLevel: RiskLevel;
  execute: (params: Record<string, unknown>) => Promise<void>;
  toastMessage: (params: Record<string, unknown>) => string;
}

export interface ActionCatalogItem {
  name: string;
  description: string;
  category: ActionCategory;
  riskLevel: RiskLevel;
  requiredPermission?: { section: string; action: "view" | "edit" };
  parameters: Array<ParameterDef & { name: string }>;
}

const registry = new Map<string, ActionDefinition>();

function register(def: ActionDefinition) {
  registry.set(def.name, def);
}

function normalizeSupplierLanguage(value: unknown): "en" | "zh" | "es" | "fr" | "ar" | "hi" {
  const key = String(value ?? "en").trim().toLowerCase().split(/[-_]/)[0];
  return key === "zh" || key === "es" || key === "fr" || key === "ar" || key === "hi" ? key : "en";
}

function finiteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ─── Scheduling ────────────────────────────────────────────────────────────────

register({
  name: "addShift",
  description:
    "Add a shift for a staff member. At least one role (staffRoles) is required — the role drives the daily task checklist for the shift, so a shift with no role can't be assigned work.",
  category: "scheduling",
  parameters: {
    staffName: { type: "string", required: true, description: "Exact name from team roster" },
    date: { type: "string", required: true, description: "YYYY-MM-DD" },
    startTime: { type: "string", required: true, description: "HH:MM" },
    endTime: { type: "string", required: true, description: "HH:MM" },
    shiftType: { type: "string", required: false, description: "Shift type", enum: ["morning", "afternoon", "evening", "closing"] },
    staffRoles: {
      type: "array",
      required: true,
      description:
        "One or more JOB role names for this shift, e.g. [\"Morning Cashier\"]. Each name MUST exactly match a `name` from the top-level `roles[]` array in LIVE STORE DATA. NEVER use the team member's `permissionRole` (owner/manager/staff), NEVER use the shift type (morning/afternoon/evening/closing), and NEVER invent new role names. If no role in `roles[]` fits, ask the user to create one first via the addRole action — do not guess.",
    },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const roles = Array.isArray(p.staffRoles)
      ? (p.staffRoles as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    if (roles.length === 0) {
      throw new Error("staffRoles is required — pass at least one role for the shift.");
    }
    await addShift({
      memberId: p.memberId ? String(p.memberId) : null,
      staffName: String(p.staffName ?? ""),
      staffRole: p.staffRole ? String(p.staffRole) : roles[0],
      staffRoles: JSON.stringify(roles),
      date: String(p.date ?? ""),
      shiftType: String(p.shiftType ?? "morning"),
      startTime: String(p.startTime ?? "09:00"),
      endTime: String(p.endTime ?? "17:00"),
      predictedDemand: "medium",
    });
  },
  toastMessage: (p) => `Shift added: ${p.staffName} on ${p.date}`,
});

register({
  name: "updateShift",
  description: "Modify an existing shift's time or type",
  category: "scheduling",
  parameters: {
    shiftId: { type: "string", required: true, description: "ID of the shift to update" },
    date: { type: "string", required: false, description: "YYYY-MM-DD" },
    startTime: { type: "string", required: false, description: "HH:MM" },
    endTime: { type: "string", required: false, description: "HH:MM" },
    shiftType: { type: "string", required: false, description: "Shift type", enum: ["morning", "afternoon", "evening", "closing"] },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.date) data.date = String(p.date);
    if (p.startTime) data.startTime = String(p.startTime);
    if (p.endTime) data.endTime = String(p.endTime);
    if (p.shiftType) data.shiftType = String(p.shiftType);
    if (p.staffRoles) data.staffRoles = JSON.stringify(p.staffRoles);
    await updateShift(String(p.shiftId), data);
  },
  toastMessage: (p) => `Shift ${p.shiftId} updated`,
});

register({
  name: "deleteShift",
  description: "Delete a shift",
  category: "scheduling",
  parameters: {
    shiftId: { type: "string", required: true, description: "ID of the shift to delete" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    await deleteShift(String(p.shiftId));
  },
  toastMessage: () => "Shift deleted",
});

register({
  name: "approveTimeOff",
  description: "Approve or reject a time-off request",
  category: "scheduling",
  parameters: {
    requestId: { type: "string", required: true, description: "Time-off request ID" },
    approved: { type: "boolean", required: true, description: "true to approve, false to reject" },
    reason: { type: "string", required: false, description: "Reason for decision" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await updateTimeOffStatus(String(p.requestId), p.approved ? "approved" : "rejected");
  },
  toastMessage: (p) => `Time-off request ${p.approved ? "approved" : "rejected"}`,
});

register({
  name: "approveShiftTrade",
  description: "Approve or reject a shift trade request",
  category: "scheduling",
  parameters: {
    tradeId: { type: "string", required: true, description: "Shift trade ID" },
    approved: { type: "boolean", required: true, description: "true to approve, false to reject" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await managerApproveShiftTrade(String(p.tradeId), "", Boolean(p.approved));
  },
  toastMessage: (p) => `Shift trade ${p.approved ? "approved" : "rejected"}`,
});

// ─── Staff Members ─────────────────────────────────────────────────────────────

register({
  name: "addStaffMember",
  description: "Add a new team member as a placeholder (no email invite). Use inviteTeamMember instead when you have the person's email and want them to sign in.",
  category: "staffing",
  parameters: {
    name: { type: "string", required: true, description: "Staff member name" },
    role: { type: "string", required: false, description: "Role (default: Staff)" },
    hourlyRate: { type: "number", required: false, description: "Hourly pay rate" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await addStaffMember({
      name: String(p.name ?? ""),
      role: String(p.role ?? "Staff"),
      hourlyRate: Number(p.hourlyRate ?? 0),
      availability: "[]",
    });
  },
  toastMessage: (p) => `Staff added: ${p.name}`,
});

// Invite a person by email to join the org. Goes through the same flow the
// Settings page uses: inviteToOrg reducer creates an OrgInvitation row, we
// poll for its token, then POST to /api/team/send-invite-email to actually
// send the email. The recipient lands at /invite/{token} when they click it.
register({
  name: "inviteTeamMember",
  description:
    "Invite a person to join the organization by email. Creates an invitation row and sends an invite email with a sign-up link. Use this when the user gives you an email address (not just a name).",
  category: "staffing",
  parameters: {
    email: { type: "string", required: true, description: "Email address to invite" },
    role: {
      type: "string",
      required: false,
      description: "Role to invite as: 'staff' (default), 'manager', or 'owner'. Only owners can invite managers.",
      enum: ["staff", "manager", "owner"],
    },
    orgName: {
      type: "string",
      required: false,
      description:
        "Display name of the organization, used in the invite email. Read from `storeName` in LIVE STORE DATA.",
    },
    inviterEmail: {
      type: "string",
      required: false,
      description:
        "Email of the person sending the invite (you, the current user). The email greeting uses this — read it from the conversation if known; otherwise the placeholder 'a teammate' is used.",
    },
  },
  requiredPermission: { section: "team", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const email = String(p.email ?? "").trim();
    if (!email) throw new Error("email is required");
    const role = String(p.role ?? "staff").toLowerCase();
    if (!["staff", "manager", "owner"].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    // Default permissions blob — same shape the Settings UI uses.
    const { defaultPermissions } = await import("@/lib/db/team");
    const permissions = JSON.stringify(defaultPermissions());

    const { inviteToOrg } = await import("@/lib/spacetimedb/actions");
    await inviteToOrg({ email, role, permissions });

    // Poll for the freshly-created invitation row so we can email the token.
    // SpacetimeDB subscription lag is typically <500 ms; cap at ~3 s.
    const { getInvitations } = await import("@/lib/db/team");
    const { getActiveOrgId } = await import("@/lib/spacetimedb/client");
    const orgIdValue = getActiveOrgId();
    let token: string | null = null;
    for (let attempt = 0; attempt < 12 && !token; attempt++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const fresh = await getInvitations(orgIdValue);
        const match = fresh
          .filter((inv) => inv.email.toLowerCase() === email.toLowerCase() && !inv.acceptedAt)
          .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];
        if (match) token = match.token;
      } catch {
        // ignore intermittent fetch errors during early subscription
      }
    }

    if (!token) {
      // The invitation row was created but we couldn't fetch its token to email.
      // The user can still resend from /manager/settings → Team.
      throw new Error(
        "Invitation created but the email could not be queued — open /manager/settings → Team to resend.",
      );
    }

    const orgName = String(p.orgName ?? "your team");
    const inviterEmail = String(p.inviterEmail ?? "a teammate");
    const res = await fetch("/api/team/send-invite-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: email, token, orgName, inviterEmail, role }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Email send failed: ${detail.slice(0, 200)}`);
    }
  },
  toastMessage: (p) => `Invite sent to ${String(p.email ?? "")}`,
});

register({
  name: "updateStaffMember",
  description: "Update a staff member's info",
  category: "staffing",
  parameters: {
    staffMemberId: { type: "string", required: true, description: "Staff member ID" },
    name: { type: "string", required: false, description: "New name" },
    role: { type: "string", required: false, description: "New role" },
    hourlyRate: { type: "number", required: false, description: "New hourly rate" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.name) data.name = String(p.name);
    if (p.role) data.role = String(p.role);
    if (p.hourlyRate !== undefined) data.hourlyRate = Number(p.hourlyRate);
    await updateStaffMember(String(p.staffMemberId), data);
  },
  toastMessage: (p) => `Staff updated: ${p.name ?? p.staffMemberId}`,
});

register({
  name: "deleteStaffMember",
  description: "Remove a staff member",
  category: "staffing",
  parameters: {
    staffMemberId: { type: "string", required: true, description: "Staff member ID" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    await deleteStaffMember(String(p.staffMemberId));
  },
  toastMessage: () => "Staff member removed",
});

// Set a 4-digit punch-in code for an org member. Required before that person
// can clock in at the store on the punch-in screen. If a team member shows
// `hasPunchInCode: false` in LIVE STORE DATA, ASK THE USER what code to set —
// don't pick one yourself.
register({
  name: "setPunchInCode",
  description:
    "Set or change a team member's 4-digit punch-in code (clock-in PIN). If the user hasn't picked one yet, ASK what code they want before calling this — don't invent one. Codes must be unique within the org.",
  category: "staffing",
  parameters: {
    memberId: {
      type: "string",
      required: true,
      description: "org_member id from LIVE STORE DATA team[].id",
    },
    code: {
      type: "string",
      required: true,
      description: "Exactly 4 digits, e.g. \"1234\". Must be unique at this store.",
    },
  },
  requiredPermission: { section: "team", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const code = String(p.code ?? "").trim();
    if (!/^[0-9]{4}$/.test(code)) {
      throw new Error("Punch-in code must be exactly 4 digits.");
    }
    await setPunchInCode(String(p.memberId ?? ""), code);
  },
  toastMessage: (p) => `Punch-in code set for member ${String(p.memberId ?? "")}`,
});

// ─── Roles ─────────────────────────────────────────────────────────────────────

register({
  name: "addRole",
  description: "Create a new staff role/position",
  category: "roles",
  parameters: {
    name: { type: "string", required: true, description: "Role name" },
    description: { type: "string", required: false, description: "Role description" },
    color: { type: "string", required: false, description: "Hex color" },
    icon: { type: "string", required: false, description: "Lucide icon name" },
    permissions: { type: "string", required: false, description: "JSON permissions object" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await addStaffRole({
      name: String(p.name ?? p.title ?? ""),
      description: String(p.description ?? p.des ?? ""),
      color: String(p.color ?? "#44403c"),
      icon: String(p.icon ?? "user"),
      permissions: p.permissions ? String(p.permissions) : "{}",
    });
  },
  toastMessage: (p) => `Role created: ${p.name ?? p.title}`,
});

register({
  name: "updateRole",
  description: "Edit an existing role",
  category: "roles",
  parameters: {
    roleId: { type: "string", required: true, description: "Role ID" },
    name: { type: "string", required: false, description: "New name" },
    description: { type: "string", required: false, description: "New description" },
    color: { type: "string", required: false, description: "New hex color" },
    icon: { type: "string", required: false, description: "New Lucide icon name" },
    permissions: { type: "string", required: false, description: "New permissions JSON" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.name) data.name = String(p.name);
    if (p.description) data.description = String(p.description);
    if (p.color) data.color = String(p.color);
    if (p.icon) data.icon = String(p.icon);
    if (p.permissions) data.permissions = String(p.permissions);
    await updateStaffRole(String(p.roleId), data);
  },
  toastMessage: (p) => `Role updated: ${p.name ?? p.roleId}`,
});

register({
  name: "deleteRole",
  description: "Delete a role (reassign staff first)",
  category: "roles",
  parameters: {
    roleId: { type: "string", required: true, description: "Role ID to delete" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    await deleteStaffRole(String(p.roleId));
  },
  toastMessage: () => "Role deleted",
});

// ─── Role Tasks ────────────────────────────────────────────────────────────────

register({
  name: "addRoleTask",
  description: "Add a task/duty to a role",
  category: "roles",
  parameters: {
    roleId: { type: "string", required: true, description: "Role ID" },
    title: { type: "string", required: true, description: "Task title" },
    description: { type: "string", required: false, description: "Task description" },
    startTime: { type: "string", required: false, description: "Start time HH:MM" },
    endTime: { type: "string", required: false, description: "End time HH:MM" },
    requiresEvidence: { type: "boolean", required: false, description: "Requires photo proof" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "low",
  execute: async (p) => {
    await addRoleTask({
      roleId: String(p.roleId),
      title: String(p.title),
      description: String(p.description ?? p.des ?? ""),
      startTime: p.startTime ? String(p.startTime) : null,
      endTime: p.endTime ? String(p.endTime) : null,
      requiresEvidence: Boolean(p.requiresEvidence ?? false),
    });
  },
  toastMessage: (p) => `Task added: ${p.title}`,
});

register({
  name: "updateRoleTask",
  description: "Edit an existing role task",
  category: "roles",
  parameters: {
    taskId: { type: "string", required: true, description: "Task ID" },
    title: { type: "string", required: false, description: "New title" },
    description: { type: "string", required: false, description: "New description" },
    startTime: { type: "string", required: false, description: "New start time" },
    endTime: { type: "string", required: false, description: "New end time" },
    requiresEvidence: { type: "boolean", required: false, description: "Requires photo proof" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "low",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.title) data.title = String(p.title);
    if (p.description) data.description = String(p.description);
    if (p.startTime !== undefined) data.startTime = p.startTime ? String(p.startTime) : null;
    if (p.endTime !== undefined) data.endTime = p.endTime ? String(p.endTime) : null;
    if (p.requiresEvidence !== undefined) data.requiresEvidence = Boolean(p.requiresEvidence);
    await updateRoleTask(String(p.taskId), data);
  },
  toastMessage: (p) => `Task updated: ${p.title ?? p.taskId}`,
});

register({
  name: "deleteRoleTask",
  description: "Delete a role task",
  category: "roles",
  parameters: {
    taskId: { type: "string", required: true, description: "Task ID to delete" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await deleteRoleTask(String(p.taskId));
  },
  toastMessage: () => "Task deleted",
});

// ─── Products ──────────────────────────────────────────────────────────────────

register({
  name: "addProduct",
  description: "Create a new product",
  category: "products",
  parameters: {
    name: { type: "string", required: true, description: "Product name" },
    category: { type: "string", required: false, description: "Product category" },
    price: { type: "number", required: false, description: "Base price" },
    cost: { type: "number", required: false, description: "Cost price" },
    description: { type: "string", required: false, description: "Product description" },
    inventoryUsage: { type: "array", required: false, description: "Inventory consumed per product sold: [{inventoryItemId, inventoryItemName, quantity, unit}]" },
    variants: { type: "array", required: false, description: "Product variants [{name, price, description}]" },
  },
  requiredPermission: { section: "products", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    let price = Number(p.price ?? 0);
    const variants = Array.isArray(p.variants) ? p.variants as Record<string, unknown>[] : [];
    if (!price && variants.length > 0) {
      const prices = variants.map((v) => Number(v.price ?? 0)).filter((pr) => pr > 0);
      price = prices.length > 0 ? Math.min(...prices) : 0;
    }
    const options = variants.length > 0
      ? JSON.stringify(variants.map((v) => ({
          name: String(v.name ?? v.size ?? v.label ?? ""),
          price: Number(v.price ?? 0),
          des: String(v.description ?? v.des ?? ""),
          imgUrl: String(v.imgUrl ?? v.imageUrl ?? ""),
          color: String(v.color ?? ""),
        })))
      : null;
    await addProduct({
      name: String(p.name ?? p.productName ?? ""),
      category: String(p.category ?? "General"),
      price,
      cost: Number(p.cost ?? 0),
      imageUrl: null,
      description: p.description ? String(p.description) : null,
      nameI18N: null,
      options,
      inventoryUsage: Array.isArray(p.inventoryUsage) ? p.inventoryUsage : [],
    });
  },
  toastMessage: (p) => `Product added: ${p.name ?? p.productName}`,
});

register({
  name: "updateProduct",
  description: "Edit a product's info (name, description, category, price)",
  category: "products",
  parameters: {
    productId: { type: "string", required: true, description: "Product ID" },
    name: { type: "string", required: false, description: "New name" },
    category: { type: "string", required: false, description: "New category" },
    price: { type: "number", required: false, description: "New price" },
    cost: { type: "number", required: false, description: "New cost" },
    description: { type: "string", required: false, description: "New description" },
    inventoryUsage: { type: "array", required: false, description: "Inventory consumed per product sold: [{inventoryItemId, inventoryItemName, quantity, unit}]" },
  },
  requiredPermission: { section: "products", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.name) data.name = String(p.name);
    if (p.category) data.category = String(p.category);
    if (p.price !== undefined) data.price = Number(p.price);
    if (p.cost !== undefined) data.cost = Number(p.cost);
    if (p.description !== undefined) data.description = String(p.description);
    if (Array.isArray(p.inventoryUsage)) data.inventoryUsage = p.inventoryUsage;
    await updateProduct(String(p.productId), data);
  },
  toastMessage: (p) => `Product updated: ${p.name ?? p.productId}`,
});

register({
  name: "deleteProduct",
  description: "Delete/delist a product",
  category: "products",
  parameters: {
    productId: { type: "string", required: true, description: "Product ID" },
  },
  requiredPermission: { section: "products", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    await deleteProduct(String(p.productId));
  },
  toastMessage: () => "Product deleted",
});

// ─── Inventory ─────────────────────────────────────────────────────────────────

register({
  name: "addInventoryItem",
  description: "Add a new inventory item to track",
  category: "inventory",
  parameters: {
    name: { type: "string", required: true, description: "Item name" },
    category: { type: "string", required: false, description: "Category" },
    currentStock: { type: "number", required: false, description: "Initial stock" },
    minStock: { type: "number", required: false, description: "Minimum stock alert threshold" },
    maxStock: { type: "number", required: false, description: "Maximum stock capacity" },
    unit: { type: "string", required: false, description: "Unit (pcs, kg, lb, etc.)" },
    costPerUnit: { type: "number", required: false, description: "Cost per unit" },
    supplier: { type: "string", required: false, description: "Supplier name" },
    description: { type: "string", required: false, description: "Inventory item description" },
    minOrderQty: { type: "number", required: false, description: "Supplier minimum order quantity" },
    unitsPerCase: { type: "number", required: false, description: "Units per case/box" },
    unitContentAmount: { type: "number", required: false, description: "Weight or volume inside one unit" },
    unitContentUnit: { type: "string", required: false, description: "g, kg, oz, lb, ml, l, fl_oz, or gal" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await addInventoryItem({
      name: String(p.name ?? p.itemName ?? ""),
      category: String(p.category ?? "General"),
      currentStock: Number(p.currentStock ?? p.quantity ?? 0),
      minStock: Number(p.minStock ?? 0),
      maxStock: Number(p.maxStock ?? 0),
      unit: String(p.unit ?? "pcs"),
      costPerUnit: Number(p.costPerUnit ?? p.cost ?? 0),
      supplier: String(p.supplier ?? ""),
      lastRestocked: new Date().toISOString().slice(0, 10),
      description: p.description ? String(p.description) : null,
      minOrderQty: p.minOrderQty == null ? null : finiteNumber(p.minOrderQty),
      unitsPerCase: p.unitsPerCase == null ? null : finiteNumber(p.unitsPerCase),
      unitContentAmount: p.unitContentAmount == null ? null : finiteNumber(p.unitContentAmount),
      unitContentUnit: p.unitContentUnit ? String(p.unitContentUnit) : null,
    });
  },
  toastMessage: (p) => `Inventory item added: ${p.name ?? p.itemName}`,
});

register({
  name: "updateInventory",
  description: "Log an inventory transaction (stock in/out/adjustment)",
  category: "inventory",
  parameters: {
    itemName: { type: "string", required: true, description: "Item name" },
    type: { type: "string", required: true, description: "Transaction type", enum: ["in", "out", "adjustment"] },
    quantity: { type: "number", required: true, description: "Quantity" },
    notes: { type: "string", required: false, description: "Reason/notes" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await addInventoryTransaction({
      itemName: String(p.itemName ?? p.name ?? ""),
      type: String(p.type ?? "adjustment"),
      quantity: Number(p.quantity ?? 0),
      date: new Date().toISOString().slice(0, 10),
      notes: String(p.notes ?? p.reason ?? "Via Mr. Merchiva"),
    });
  },
  toastMessage: (p) => `Inventory updated: ${p.itemName ?? p.name}`,
});

register({
  name: "updateInventoryItem",
  description: "Edit inventory item info (min/max stock, unit, cost)",
  category: "inventory",
  parameters: {
    itemId: { type: "string", required: true, description: "Inventory item ID" },
    name: { type: "string", required: false, description: "New name" },
    category: { type: "string", required: false, description: "New category" },
    currentStock: { type: "number", required: false, description: "New current stock" },
    minStock: { type: "number", required: false, description: "New min stock" },
    maxStock: { type: "number", required: false, description: "New max stock" },
    unit: { type: "string", required: false, description: "New unit" },
    costPerUnit: { type: "number", required: false, description: "New cost per unit" },
    supplier: { type: "string", required: false, description: "New supplier name" },
    description: { type: "string", required: false, description: "Inventory item description" },
    minOrderQty: { type: "number", required: false, description: "Supplier minimum order quantity" },
    unitsPerCase: { type: "number", required: false, description: "Units per case/box" },
    unitContentAmount: { type: "number", required: false, description: "Weight or volume inside one unit" },
    unitContentUnit: { type: "string", required: false, description: "g, kg, oz, lb, ml, l, fl_oz, or gal" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.name) data.name = String(p.name);
    if (p.category) data.category = String(p.category);
    if (p.currentStock != null) data.currentStock = finiteNumber(p.currentStock);
    if (p.minStock != null) data.minStock = finiteNumber(p.minStock);
    if (p.maxStock != null) data.maxStock = finiteNumber(p.maxStock);
    if (p.unit) data.unit = String(p.unit);
    if (p.costPerUnit != null) data.costPerUnit = finiteNumber(p.costPerUnit);
    if (p.supplier != null) data.supplier = String(p.supplier);
    if (p.description !== undefined) data.description = p.description ? String(p.description) : null;
    if (p.minOrderQty !== undefined) data.minOrderQty = p.minOrderQty == null ? null : finiteNumber(p.minOrderQty);
    if (p.unitsPerCase !== undefined) data.unitsPerCase = p.unitsPerCase == null ? null : finiteNumber(p.unitsPerCase);
    if (p.unitContentAmount !== undefined) data.unitContentAmount = p.unitContentAmount == null ? null : finiteNumber(p.unitContentAmount);
    if (p.unitContentUnit !== undefined) data.unitContentUnit = p.unitContentUnit ? String(p.unitContentUnit) : null;
    await updateInventoryItem(String(p.itemId), data);
  },
  toastMessage: (p) => `Inventory item updated: ${p.name ?? p.itemId}`,
});

register({
  name: "deleteInventoryItem",
  description: "Delete an inventory item",
  category: "inventory",
  parameters: {
    itemId: { type: "string", required: true, description: "Inventory item ID" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    await deleteInventoryItem(String(p.itemId));
  },
  toastMessage: () => "Inventory item deleted",
});

// ─── Pricing / Coupons ─────────────────────────────────────────────────────────

register({
  name: "updatePrice",
  description: "Update a product's price",
  category: "pricing",
  parameters: {
    productId: { type: "string", required: true, description: "Product ID" },
    productName: { type: "string", required: false, description: "Product name (for display)" },
    newPrice: { type: "number", required: true, description: "New price" },
  },
  requiredPermission: { section: "products", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    if (p.productId) {
      await updateProduct(String(p.productId), { price: Number(p.newPrice ?? p.price ?? 0) });
    }
  },
  toastMessage: (p) => `Price updated: ${p.productName ?? p.name ?? p.productId}`,
});

register({
  name: "addCoupon",
  description: "Create a new coupon/discount code",
  category: "pricing",
  parameters: {
    code: { type: "string", required: true, description: "Coupon code" },
    discountType: { type: "string", required: true, description: "Discount type", enum: ["percentage", "fixed"] },
    discountValue: { type: "number", required: true, description: "Discount value" },
    expiresAt: { type: "string", required: false, description: "Expiry date YYYY-MM-DD" },
    maxUses: { type: "number", required: false, description: "Maximum number of uses" },
    minPurchase: { type: "number", required: false, description: "Minimum purchase amount" },
  },
  requiredPermission: { section: "products", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await addCoupon({
      code: String(p.code),
      discountType: String(p.discountType),
      discountValue: Number(p.discountValue),
      expiresAt: p.expiresAt ? String(p.expiresAt) : null,
      maxUses: p.maxUses ? Number(p.maxUses) : null,
      minPurchase: p.minPurchase ? Number(p.minPurchase) : null,
    });
  },
  toastMessage: (p) => `Coupon created: ${p.code}`,
});

register({
  name: "updateCoupon",
  description: "Edit an existing coupon",
  category: "pricing",
  parameters: {
    couponId: { type: "string", required: true, description: "Coupon ID" },
    code: { type: "string", required: false, description: "New code" },
    discountValue: { type: "number", required: false, description: "New discount value" },
    expiresAt: { type: "string", required: false, description: "New expiry date" },
    active: { type: "boolean", required: false, description: "Enable/disable coupon" },
  },
  requiredPermission: { section: "products", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.code) data.code = String(p.code);
    if (p.discountValue !== undefined) data.discountValue = Number(p.discountValue);
    if (p.expiresAt !== undefined) data.expiresAt = p.expiresAt ? String(p.expiresAt) : null;
    if (p.active !== undefined) data.active = Boolean(p.active);
    await updateCoupon(String(p.couponId), data);
  },
  toastMessage: (p) => `Coupon updated: ${p.code ?? p.couponId}`,
});

register({
  name: "deleteCoupon",
  description: "Delete a coupon",
  category: "pricing",
  parameters: {
    couponId: { type: "string", required: true, description: "Coupon ID" },
  },
  requiredPermission: { section: "products", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    await deleteCoupon(String(p.couponId));
  },
  toastMessage: () => "Coupon deleted",
});

// ─── Suppliers ─────────────────────────────────────────────────────────────────

register({
  name: "addSupplier",
  description: "Add a new supplier",
  category: "suppliers",
  parameters: {
    name: { type: "string", required: true, description: "Supplier name" },
    contactName: { type: "string", required: false, description: "Contact person" },
    email: { type: "string", required: false, description: "Email" },
    phone: { type: "string", required: false, description: "Phone" },
    address: { type: "string", required: false, description: "Address" },
    paymentTerms: { type: "string", required: false, description: "Payment terms" },
    notes: { type: "string", required: false, description: "Notes" },
    language: { type: "string", required: false, description: "Supplier communication language: en, zh, es, fr, ar, or hi. Defaults to en." },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await addSupplier({
      name: String(p.name ?? p.supplierName ?? ""),
      contactName: p.contactName ? String(p.contactName) : null,
      email: p.email ? String(p.email) : null,
      phone: p.phone ? String(p.phone) : null,
      address: p.address ? String(p.address) : null,
      paymentTerms: p.paymentTerms ? String(p.paymentTerms) : null,
      notes: p.notes ? String(p.notes) : null,
      language: normalizeSupplierLanguage(p.language),
    });
  },
  toastMessage: (p) => `Supplier added: ${p.name ?? p.supplierName}`,
});

register({
  name: "updateSupplier",
  description: "Edit supplier information",
  category: "suppliers",
  parameters: {
    supplierId: { type: "string", required: true, description: "Supplier ID" },
    name: { type: "string", required: false, description: "New name" },
    contactName: { type: "string", required: false, description: "New contact" },
    email: { type: "string", required: false, description: "New email" },
    phone: { type: "string", required: false, description: "New phone" },
    address: { type: "string", required: false, description: "New address" },
    paymentTerms: { type: "string", required: false, description: "Payment terms" },
    notes: { type: "string", required: false, description: "Supplier notes" },
    rating: { type: "number", required: false, description: "Supplier rating 1-5" },
    language: { type: "string", required: false, description: "Supplier communication language: en, zh, es, fr, ar, or hi" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const conn = getConnection();
    if (!conn) throw new Error("Not connected to SpacetimeDB");
    const supplierId = String(p.supplierId ?? "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = [...(conn.db as any).supplier.iter()].find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.id?.toString?.() === supplierId,
    );
    if (!existing) throw new Error("Supplier not found");

    const data: Record<string, unknown> = {
      name: p.name ? String(p.name) : String(existing.name ?? ""),
      contactName: p.contactName != null ? String(p.contactName) : existing.contactName ?? null,
      email: p.email != null ? String(p.email) : existing.email ?? null,
      phone: p.phone != null ? String(p.phone) : existing.phone ?? null,
      address: p.address != null ? String(p.address) : existing.address ?? null,
      paymentTerms: p.paymentTerms != null ? String(p.paymentTerms) : existing.paymentTerms ?? null,
      notes: p.notes != null ? String(p.notes) : existing.notes ?? null,
      rating: Number(p.rating ?? existing.rating ?? 5),
      language: p.language ? normalizeSupplierLanguage(p.language) : normalizeSupplierLanguage(existing.language),
    };
    await updateSupplier(String(p.supplierId), data);
  },
  toastMessage: (p) => `Supplier updated: ${p.name ?? p.supplierId}`,
});

register({
  name: "deleteSupplier",
  description: "Delete a supplier",
  category: "suppliers",
  parameters: {
    supplierId: { type: "string", required: true, description: "Supplier ID" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    await deleteSupplier(String(p.supplierId));
  },
  toastMessage: () => "Supplier deleted",
});

register({
  name: "createPurchaseOrder",
  description: "Create a purchase order for a supplier",
  category: "suppliers",
  parameters: {
    supplierId: { type: "string", required: true, description: "Supplier ID" },
    items: { type: "array", required: true, description: "[{name, quantity, unitCost}]" },
    subtotal: { type: "number", required: false, description: "Subtotal" },
    tax: { type: "number", required: false, description: "Tax amount" },
    total: { type: "number", required: false, description: "Total" },
    notes: { type: "string", required: false, description: "Notes" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await createPurchaseOrder({
      supplierId: String(p.supplierId ?? ""),
      items: JSON.stringify(p.items ?? []),
      subtotal: Number(p.subtotal ?? 0),
      tax: Number(p.tax ?? 0),
      total: Number(p.total ?? p.subtotal ?? 0),
      notes: p.notes ? String(p.notes) : null,
    });
  },
  toastMessage: () => "Purchase order created",
});

register({
  name: "orderFromSupplier",
  description:
    "Order inventory from a supplier: email them the purchase order AND record it. Use this (not createPurchaseOrder) when restocking. supplierId MUST match a supplier in LIVE STORE DATA; if the low-stock item's `supplier` name has no matching supplier record (no id), ask to add the supplier first via addSupplier. If the supplier has no email on file, the order is still saved as a draft and managers are notified. " +
    "WHEN A STOCK ITEM IS LOW, don't just say 'tell me if you want me to order' — EMIT this action so the manager gets an Approve/Reject card to confirm contacting the supplier. " +
    "INTENT = ORDER: requests like '联系供应商 X' / 'contact the supplier for X' / '给 X 下单' / '订货' / 'order more X' / 'restock X' / '补货' ALL mean PLACE AN ORDER. Resolve X (an inventory item) → find its `supplier` name → the matching supplier record's id, compute the restock quantity (see QUANTITIES), and EMIT this action. Do NOT just print the supplier's name / email / phone and tell the user to reach out themselves — emailing the PO is exactly what this action does. Showing contact info instead of emitting the action is wrong. The ONLY time you ask first is when you're missing a hard requirement: no matching supplier id (then offer addSupplier), or the item/quantity is genuinely ambiguous. " +
    "LANGUAGE + ITEM NAMES: use the supplier record's `language` field (default en) for supplier-facing notes/email content. Every item object MUST include the inventory item's actual name in `name` (also ok to duplicate as `itemName`); never use a dash/blank placeholder. " +
    "QUANTITIES: order enough to reach the item's max stock, but if the item has `unitsPerCase` set, round the quantity UP to a whole multiple of it (order full cases), and never order below `minOrderQty` when set. Include `unitsPerCase` and `caseCount` on the line item. In Chinese UI text, show case math as `9*箱 - 108个` for 9 cases of 12 units.",
  category: "suppliers",
  parameters: {
    supplierId: { type: "string", required: true, description: "Supplier ID from LIVE STORE DATA" },
    supplierLanguage: { type: "string", required: false, description: "Supplier language from LIVE STORE DATA suppliers[].language; defaults to en" },
    items: { type: "array", required: true, description: "[{name, itemName?, quantity, unit?, unitCost?, unitsPerCase?, caseCount?, caseUnit?, eachUnit?}]. name is required and must be the real item name." },
    subtotal: { type: "number", required: false, description: "Subtotal (defaults to sum of unitCost*quantity)" },
    tax: { type: "number", required: false, description: "Tax amount" },
    total: { type: "number", required: false, description: "Total (defaults to subtotal+tax)" },
    notes: { type: "string", required: false, description: "Notes to include in the email to the supplier" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    const conn = getConnection();
    if (!conn) throw new Error("Not connected to SpacetimeDB");
    const organizationId = getActiveOrgId();

    const supplierId = String(p.supplierId ?? "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supplier = [...(conn.db as any).supplier.iter()].find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.id?.toString?.() === supplierId,
    );
    if (!supplier) throw new Error("Supplier not found — add the supplier first.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const org = [...(conn.db as any).organization.iter()].find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (o: any) => o.id?.toString?.() === organizationId,
    );
    const meHex = conn.identity?.toHexString?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = [...(conn.db as any).user.iter()].find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (u: any) => u.identity?.toHexString?.() === meHex,
    );

    const items = Array.isArray(p.items)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.items as any[]).map((it) => {
          const name = String(it.name ?? it.itemName ?? it.productName ?? it.inventoryItemName ?? it.item ?? "").trim();
          const quantity = finiteNumber(it.quantity ?? it.qty, 0);
          const unitsPerCase = it.unitsPerCase != null ? finiteNumber(it.unitsPerCase) : undefined;
          const caseCount = it.caseCount != null
            ? finiteNumber(it.caseCount)
            : unitsPerCase && unitsPerCase > 0 && quantity > 0
              ? Math.ceil(quantity / unitsPerCase)
              : undefined;
          return {
            name,
            itemName: name,
            quantity,
            unit: it.unit ? String(it.unit) : undefined,
            unitCost:
              it.unitCost != null ? Number(it.unitCost) : it.cost != null ? Number(it.cost) : undefined,
            unitsPerCase,
            caseCount,
            caseUnit: it.caseUnit ? String(it.caseUnit) : caseCount ? "箱" : undefined,
            eachUnit: it.eachUnit ? String(it.eachUnit) : caseCount ? "个" : undefined,
          };
        })
      : [];
    if (items.length === 0) throw new Error("No items to order");
    const unnamed = items.find((it) => !it.name);
    if (unnamed) throw new Error("Every supplier order item must include the item name.");

    const subtotal = Number(
      p.subtotal ?? items.reduce((s, it) => s + (it.unitCost ?? 0) * it.quantity, 0),
    );
    const tax = Number(p.tax ?? 0);
    const total = Number(p.total ?? subtotal + tax);

    // 1) Server route sends the PO email (server-only Resend) and returns the
    //    canonical summary/totals + whether it actually emailed.
    const supplierName = String(supplier.name ?? "");
    const res = await fetch("/api/suppliers/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        supplierId,
        supplierName,
        supplierEmail: supplier.email ?? null,
        contactName: supplier.contactName ?? null,
        orgName: org?.name ?? null,
        items,
        supplierLanguage: normalizeSupplierLanguage(p.supplierLanguage ?? supplier.language),
        subtotal,
        tax,
        total,
        notes: p.notes ? String(p.notes) : null,
        replyTo: me?.email ?? null,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error ?? `Order failed (${res.status})`);
    }
    const data = (await res.json()) as {
      emailed?: boolean;
      summary?: string;
      subtotal?: number;
      tax?: number;
      total?: number;
    };
    const emailed = !!data.emailed;

    // 2) Record the PO over the LIVE connection (not the server route) so the
    //    write uses the active, authenticated session and can't fail with an
    //    expired token. Manager-only permission is still enforced server-side
    //    by the reducer. If the email failed, this saves a draft + escalates.
    await recordSupplierOrder({
      supplierId,
      supplierName,
      items: JSON.stringify(items),
      subtotal: data.subtotal ?? subtotal,
      tax: data.tax ?? tax,
      total: data.total ?? total,
      notes: p.notes ? String(p.notes) : null,
      summary: data.summary ?? "",
      emailed,
    });

    // Stash for toastMessage (executeAction passes the same object to both).
    (p as Record<string, unknown>).__emailed = emailed;
  },
  toastMessage: (p) =>
    (p as Record<string, unknown>).__emailed
      ? "Order emailed to supplier"
      : "Order saved as draft — manager notified",
});

// ─── Notifications ─────────────────────────────────────────────────────────────

register({
  name: "createNotification",
  description: "Send a notification to the team",
  category: "notifications",
  parameters: {
    title: { type: "string", required: true, description: "Notification title" },
    body: { type: "string", required: true, description: "Notification body" },
    type: { type: "string", required: false, description: "Type", enum: ["general", "inventory_low", "shift_trade", "urgent"] },
  },
  requiredPermission: undefined,
  riskLevel: "low",
  execute: async (p) => {
    await createNotification({
      type: String(p.type ?? "general"),
      title: String(p.title ?? ""),
      body: String(p.body ?? ""),
    });
  },
  toastMessage: () => "Notification sent",
});

// ─── Builder (website builder canvas) ──────────────────────────────────────────

function dispatchBuilderEvent(name: string, detail: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

register({
  name: "addBuilderElement",
  description: "Add one or more elements to the current builder page (text/image/layout/button)",
  category: "builder",
  parameters: {
    elements: {
      type: "array",
      required: true,
      description:
        'Array of { type: "text"|"image"|"layout"|"button", content?: string, props?: object, style?: object }',
    },
  },
  riskLevel: "low",
  execute: async (p) => {
    const elements = Array.isArray(p.elements) ? p.elements : [];
    dispatchBuilderEvent("flowfn:ai-generate", elements);
  },
  toastMessage: (p) => {
    const n = Array.isArray(p.elements) ? p.elements.length : 0;
    return n === 1 ? "Element added" : `${n} elements added`;
  },
});

register({
  name: "deleteBuilderElement",
  description: "Delete one or more elements from the current builder page by displayName/type substring",
  category: "builder",
  parameters: {
    targets: {
      type: "array",
      required: true,
      description: 'Array of element name substrings to match (case-insensitive), e.g. ["Hero", "Footer"]',
    },
  },
  riskLevel: "medium",
  execute: async (p) => {
    const targets = Array.isArray(p.targets) ? p.targets : [];
    dispatchBuilderEvent("flowfn:ai-delete", targets);
  },
  toastMessage: (p) => {
    const targets = Array.isArray(p.targets) ? p.targets : [];
    return `Deleted: ${targets.join(", ")}`;
  },
});

register({
  name: "addBuilderFunction",
  description: "Add or replace a FlowFn visual function on the current site",
  category: "builder",
  parameters: {
    name: { type: "string", required: true, description: "Function name (unique on site)" },
    nodes: { type: "array", required: false, description: "FlowFn nodes" },
    edges: { type: "array", required: false, description: "FlowFn edges" },
    tests: { type: "array", required: false, description: "Test cases" },
  },
  riskLevel: "low",
  execute: async (p) => {
    dispatchBuilderEvent("flowfn:ai-add-function", {
      name: String(p.name ?? ""),
      nodes: Array.isArray(p.nodes) ? p.nodes : [],
      edges: Array.isArray(p.edges) ? p.edges : [],
      tests: Array.isArray(p.tests) ? p.tests : [],
    });
  },
  toastMessage: (p) => `Function added: ${p.name}`,
});

// HTML-mode actions: edit the current page's HTML directly.

register({
  name: "editBuilderHtml",
  description:
    "Surgically replace an exact string in the current page HTML. Mirrors Claude Code's Edit tool: old_string must appear verbatim and (unless replace_all) must be unique — otherwise the edit fails with a clear error.",
  category: "builder",
  parameters: {
    old_string: {
      type: "string",
      required: true,
      description:
        "The exact substring to find in the current HTML. Include enough surrounding context to make it unique on the page.",
    },
    new_string: {
      type: "string",
      required: true,
      description:
        "The text that replaces old_string. Must differ from old_string.",
    },
    replace_all: {
      type: "boolean",
      required: false,
      description:
        "When true, replace every occurrence. When false (default) the edit fails if old_string is not unique.",
    },
  },
  riskLevel: "medium",
  execute: async (p) => {
    const { readBuilderHtml, writeBuilderHtml } = await import(
      "@/lib/builder/html-bridge"
    );
    const oldStr = String(p.old_string ?? "");
    const newStr = String(p.new_string ?? "");
    const replaceAll = Boolean(p.replace_all ?? false);

    if (oldStr === "") {
      throw new Error("old_string is required");
    }
    if (oldStr === newStr) {
      throw new Error("old_string and new_string must differ");
    }

    const current = readBuilderHtml();
    const idx = current.indexOf(oldStr);
    if (idx === -1) {
      throw new Error(
        "old_string not found in the current page HTML. Copy the literal text from the page exactly.",
      );
    }

    if (replaceAll) {
      writeBuilderHtml(current.split(oldStr).join(newStr));
      return;
    }

    const second = current.indexOf(oldStr, idx + oldStr.length);
    if (second !== -1) {
      let count = 1;
      let cursor = idx + oldStr.length;
      while (true) {
        const next = current.indexOf(oldStr, cursor);
        if (next === -1) break;
        count++;
        cursor = next + oldStr.length;
      }
      throw new Error(
        `old_string is not unique (${count} matches). Add more surrounding context or set replace_all=true.`,
      );
    }

    writeBuilderHtml(
      current.slice(0, idx) + newStr + current.slice(idx + oldStr.length),
    );
  },
  toastMessage: (p) =>
    p.replace_all ? "HTML edited (all matches)" : "HTML edited",
});

register({
  name: "setBuilderHtml",
  description: "Replace the entire HTML of the current builder page",
  category: "builder",
  parameters: {
    html: { type: "string", required: true, description: "Full HTML body content for the page" },
  },
  riskLevel: "medium",
  execute: async (p) => {
    dispatchBuilderEvent("builder:html-set", { html: String(p.html ?? "") });
  },
  toastMessage: () => "Page HTML replaced",
});

register({
  name: "appendBuilderHtml",
  description: "Append an HTML fragment to the end of the current builder page",
  category: "builder",
  parameters: {
    html: { type: "string", required: true, description: "HTML fragment to append" },
  },
  riskLevel: "low",
  execute: async (p) => {
    dispatchBuilderEvent("builder:html-append", { html: String(p.html ?? "") });
  },
  toastMessage: () => "HTML appended",
});

register({
  name: "replaceBuilderHtml",
  description: "Replace the first element matching a CSS selector with new HTML",
  category: "builder",
  parameters: {
    selector: { type: "string", required: true, description: 'CSS selector, e.g. "#hero" or "section.footer"' },
    html: { type: "string", required: true, description: "Replacement HTML" },
  },
  riskLevel: "medium",
  execute: async (p) => {
    dispatchBuilderEvent("builder:html-replace", {
      selector: String(p.selector ?? ""),
      html: String(p.html ?? ""),
    });
  },
  toastMessage: (p) => `Replaced: ${p.selector}`,
});

register({
  name: "deleteBuilderHtml",
  description: "Delete elements matching a CSS selector from the current builder page",
  category: "builder",
  parameters: {
    selector: { type: "string", required: true, description: "CSS selector to remove" },
  },
  riskLevel: "medium",
  execute: async (p) => {
    dispatchBuilderEvent("builder:html-delete", { selector: String(p.selector ?? "") });
  },
  toastMessage: (p) => `Deleted: ${p.selector}`,
});

// ─── Page management (HTML mode) ──────────────────────────────────────────────

register({
  name: "addBuilderPage",
  description: "Create a new page in the current site",
  category: "builder",
  parameters: {
    siteId: { type: "string", required: true, description: "Current site id (from builder context)" },
    name: { type: "string", required: true, description: "Page name (display label)" },
    slug: { type: "string", required: false, description: "URL slug (kebab-case). Auto-derived from name if omitted" },
    sortOrder: { type: "number", required: false, description: "Position in the page list. Defaults to end" },
    html: { type: "string", required: false, description: "Initial HTML for the page. If omitted, the user gets a placeholder" },
  },
  riskLevel: "medium",
  execute: async (p) => {
    const { createPage } = await import("@/lib/spacetimedb/actions");
    const name = String(p.name ?? "New page");
    const slug = String(p.slug ?? name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
    await createPage({
      siteId: String(p.siteId ?? ""),
      name,
      slug,
      sortOrder: typeof p.sortOrder === "number" ? p.sortOrder : 999,
      elements: "[]",
      html: typeof p.html === "string" ? p.html : undefined,
    });
  },
  toastMessage: (p) => `Page added: ${p.name}`,
});

register({
  name: "deleteBuilderPage",
  description: "Delete a page from the current site by id",
  category: "builder",
  parameters: {
    pageId: { type: "string", required: true, description: "Page id from builder context (NOT the slug or name)" },
  },
  riskLevel: "high",
  execute: async (p) => {
    const { deletePage } = await import("@/lib/spacetimedb/actions");
    await deletePage(String(p.pageId ?? ""));
  },
  toastMessage: () => "Page deleted",
});

register({
  name: "deleteBuilderFunction",
  description: "Delete a FlowFn function from the current site by name",
  category: "builder",
  parameters: {
    name: { type: "string", required: true, description: "Function name (lowerCamelCase)" },
  },
  riskLevel: "medium",
  execute: async (p) => {
    dispatchBuilderEvent("flowfn:ai-delete-function", { name: String(p.name ?? "") });
  },
  toastMessage: (p) => `Function deleted: ${p.name}`,
});

// ─── Site values (global vars referenced as {key} in HTML) ────────────────────

register({
  name: "setBuilderValue",
  description: "Create or update a custom site value. Reference it in HTML as {key}.",
  category: "builder",
  parameters: {
    key: { type: "string", required: true, description: "Key (alphanumeric + underscore, no spaces). Cannot collide with system keys (siteName/userName/etc.)" },
    value: { type: "string", required: true, description: "The value to store. Plain text. Use \\n for newlines if needed." },
  },
  riskLevel: "low",
  execute: async (p) => {
    dispatchBuilderEvent("builder:set-value", {
      key: String(p.key ?? "").trim(),
      value: String(p.value ?? ""),
    });
  },
  toastMessage: (p) => `Value set: {${p.key}}`,
});

register({
  name: "setSiteTokens",
  description:
    "Bulk-write design tokens (CSS custom properties) onto the current site. Use this when the user pastes a `:root { --x: y; … }` block or a tweakcn/shadcn theme — extract the variables and pass them as a JSON map. Keys can be plain (\"background\") or already prefixed (\"--background\"); the system will normalize them. Values are raw CSS (e.g. \"oklch(0.97 0 0)\", \"#1c1917\", \"16px\"). Set `replace: true` to wipe the site's existing tokens before applying (use when the user says \"set the theme to this\"); otherwise the call merges with existing tokens. To remove a token, pass an empty string for that key.",
  category: "builder",
  parameters: {
    tokens: { type: "object", required: true, description: "Map of CSS variable name → value. Keys may omit the leading \"--\"." },
    replace: { type: "boolean", required: false, description: "If true, clear existing site.tokens before applying. Default false (merge)." },
  },
  riskLevel: "medium",
  execute: async (p) => {
    const raw = p.tokens;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    dispatchBuilderEvent("builder:set-tokens", {
      tokens: raw as Record<string, string>,
      replace: Boolean(p.replace),
    });
  },
  toastMessage: (p) => {
    const count = p.tokens && typeof p.tokens === "object" ? Object.keys(p.tokens).length : 0;
    return p.replace ? `Theme replaced (${count} tokens)` : `${count} token${count === 1 ? "" : "s"} applied`;
  },
});

register({
  name: "deleteSiteTokens",
  description: "Remove one or more design tokens from the site by CSS variable name.",
  category: "builder",
  parameters: {
    keys: { type: "array", required: true, description: "CSS variable names to remove (with or without leading \"--\")." },
  },
  riskLevel: "low",
  execute: async (p) => {
    const keys = Array.isArray(p.keys) ? (p.keys as unknown[]).map(String) : [];
    if (keys.length === 0) return;
    dispatchBuilderEvent("builder:delete-tokens", { keys });
  },
  toastMessage: (p) => `${Array.isArray(p.keys) ? p.keys.length : 0} token(s) removed`,
});

register({
  name: "deleteBuilderValue",
  description: "Remove a custom site value by key. References to it in HTML will fall back to the literal {key} text.",
  category: "builder",
  parameters: {
    key: { type: "string", required: true, description: "Key to delete" },
  },
  riskLevel: "medium",
  execute: async (p) => {
    dispatchBuilderEvent("builder:delete-value", { key: String(p.key ?? "").trim() });
  },
  toastMessage: (p) => `Value removed: {${p.key}}`,
});

// ─── Page & site property edits ──────────────────────────────────────────────

register({
  name: "updateBuilderPage",
  description:
    "Update the current page's name, slug, or SEO metadata (title, description, keywords, OG image, canonical URL, robots). Only pass the fields you want to change — omitted fields keep their current values.",
  category: "builder",
  parameters: {
    pageId: { type: "string", required: true, description: "Page id from builder context (NOT the slug or name)" },
    name: { type: "string", required: false, description: "Page display name" },
    slug: { type: "string", required: false, description: "URL slug (kebab-case, no leading slash, auto-normalized)" },
    title: { type: "string", required: false, description: "<title> for the browser tab and SEO" },
    description: { type: "string", required: false, description: "Meta description for search and link previews" },
    keywords: { type: "string", required: false, description: "Comma-separated keywords" },
    ogImage: { type: "string", required: false, description: "Open Graph image URL for social previews" },
    ogTitle: { type: "string", required: false, description: "Open Graph title (falls back to title)" },
    ogDescription: { type: "string", required: false, description: "Open Graph description (falls back to description)" },
    canonicalUrl: { type: "string", required: false, description: "Canonical URL for SEO" },
    robots: { type: "string", required: false, description: "Robots directive, e.g. 'index,follow' or 'noindex'" },
  },
  riskLevel: "low",
  execute: async (p) => {
    dispatchBuilderEvent("builder:update-page", { ...p });
  },
  toastMessage: () => "Page settings updated",
});

register({
  name: "updateBuilderSite",
  description:
    "Update the current site's name, slug, custom domain, published status, or plugin toggles (auth, cart, checkout, products, subscriptions, rewards, booking, account). Only pass the fields you want to change.",
  category: "builder",
  parameters: {
    name: { type: "string", required: false, description: "Site display name" },
    slug: { type: "string", required: false, description: "Site URL slug (kebab-case)" },
    customDomain: { type: "string", required: false, description: "Custom domain like www.example.com. Pass an empty string to remove the current domain." },
    published: { type: "boolean", required: false, description: "True to publish, false to revert to draft" },
    plugins: {
      type: "object",
      required: false,
      description:
        "Plugin flags to toggle. Example: { \"cart\": true, \"booking\": false }. Allowed keys: auth, cart, checkout, products, subscriptions, rewards, booking, account.",
    },
  },
  riskLevel: "medium",
  execute: async (p) => {
    dispatchBuilderEvent("builder:update-site", { ...p });
  },
  toastMessage: () => "Site settings updated",
});

// ─── Training Curriculum ──────────────────────────────────────────────────────
//
// Mr. Merchiva can author and edit the daily training curriculum used by the
// Training page. The store reducers operate on `dayId` (UUID). For convenience
// — and because the model usually refers to days by their human number ("Day 3")
// — every update/delete action also accepts a `dayNumber` and resolves it to a
// `dayId` by inspecting the locally subscribed `trainingDay` rows. The lookup
// is scoped to the active org via the standard auth subscription filter.
//
// Content note: `description` is rich-text HTML produced by Quill. The model
// may emit raw HTML directly and it will render identically in the editor and
// the read views (shared `.merchiva-quill-prose` styling).

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CachedTrainingDay {
  id: string;
  organizationId: string;
  dayNumber: number;
  title: string;
  description: string | null;
  sortOrder: number;
}

interface CachedTrainingObjective {
  id: string;
  organizationId: string;
  dayId: string;
  text: string;
  sortOrder: number;
}

function readTrainingDays(): CachedTrainingDay[] {
  const c = getConnection();
  if (!c) return [];
  try {
    const iter = (c as any).db?.trainingDay?.iter?.();
    if (!iter) return [];
    return Array.from(iter as Iterable<any>).map((r) => ({
      id: r.id?.toString?.() ?? String(r.id),
      organizationId: r.organizationId,
      dayNumber: Number(r.dayNumber),
      title: String(r.title ?? ""),
      description: r.description ?? null,
      sortOrder: Number(r.sortOrder ?? 0),
    }));
  } catch {
    return [];
  }
}

function readTrainingObjectives(): CachedTrainingObjective[] {
  const c = getConnection();
  if (!c) return [];
  try {
    const iter = (c as any).db?.trainingObjective?.iter?.();
    if (!iter) return [];
    return Array.from(iter as Iterable<any>).map((r) => ({
      id: r.id?.toString?.() ?? String(r.id),
      organizationId: r.organizationId,
      dayId: r.dayId,
      text: String(r.text ?? ""),
      sortOrder: Number(r.sortOrder ?? 0),
    }));
  } catch {
    return [];
  }
}

function resolveDay(p: Record<string, unknown>): CachedTrainingDay {
  const id = p.dayId ? String(p.dayId) : null;
  const num = p.dayNumber != null ? Number(p.dayNumber) : null;
  const days = readTrainingDays();
  if (id) {
    const hit = days.find((d) => d.id === id);
    if (hit) return hit;
  }
  if (num != null && !Number.isNaN(num)) {
    const hit = days.find((d) => d.dayNumber === num);
    if (hit) return hit;
  }
  throw new Error("Day not found — provide a valid dayId or dayNumber");
}

function nextObjectiveSort(dayId: string): number {
  const list = readTrainingObjectives().filter((o) => o.dayId === dayId);
  return list.length === 0
    ? 0
    : Math.max(...list.map((o) => o.sortOrder)) + 1;
}

register({
  name: "addTrainingDay",
  description:
    "Add a new day to the training curriculum. Provide a title and optional rich-text HTML content (description). The new day goes to the end unless dayNumber/sortOrder are set.",
  category: "training",
  parameters: {
    title: { type: "string", required: true, description: "Day title, e.g. 'Espresso Pull'" },
    description: {
      type: "string",
      required: false,
      description:
        "Rich-text HTML content for the day (Quill output: <h1>, <h2>, <p>, <ul>, <ol>, <blockquote>, <strong>, <em>, <code>, <a>, <img>). Plain text is also accepted.",
    },
    dayNumber: { type: "number", required: false, description: "1-based day number; defaults to last + 1" },
    sortOrder: { type: "number", required: false, description: "Display order; defaults to last + 1" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const existing = readTrainingDays();
    const fallback = existing.length;
    await addTrainingDay({
      dayNumber:
        p.dayNumber != null ? Math.max(1, Number(p.dayNumber)) : fallback + 1,
      title: String(p.title ?? "Untitled day"),
      description: p.description ? String(p.description) : null,
      sortOrder:
        p.sortOrder != null ? Math.max(0, Number(p.sortOrder)) : fallback,
    });
  },
  toastMessage: (p) => `Training day added: ${p.title ?? "Untitled day"}`,
});

register({
  name: "updateTrainingDay",
  description:
    "Edit an existing curriculum day. Provide dayId OR dayNumber to identify the day, then any of title / description (HTML) / sortOrder / dayNumber.",
  category: "training",
  parameters: {
    dayId: { type: "string", required: false, description: "Day UUID (preferred)" },
    dayNumber: { type: "number", required: false, description: "Existing day number to identify the day, if dayId is not known" },
    title: { type: "string", required: false, description: "New title" },
    description: {
      type: "string",
      required: false,
      description:
        "New rich-text HTML content for the day. Pass an empty string to clear.",
    },
    newDayNumber: { type: "number", required: false, description: "Change which day-number this entry occupies" },
    sortOrder: { type: "number", required: false, description: "Display order" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const day = resolveDay(p);
    const nextTitle = p.title != null ? String(p.title) : day.title;
    const nextDescRaw =
      "description" in p ? (p.description == null ? null : String(p.description)) : day.description;
    const nextDesc = nextDescRaw && nextDescRaw.trim() ? nextDescRaw : null;
    const nextDayNumber =
      p.newDayNumber != null ? Math.max(1, Number(p.newDayNumber)) : day.dayNumber;
    const nextSort =
      p.sortOrder != null ? Math.max(0, Number(p.sortOrder)) : day.sortOrder;
    await updateTrainingDay(day.id, {
      dayNumber: nextDayNumber,
      title: nextTitle,
      description: nextDesc,
      sortOrder: nextSort,
    });
  },
  toastMessage: (p) => `Training day updated${p.dayId ?? p.dayNumber ? `: ${p.dayId ?? `Day ${p.dayNumber}`}` : ""}`,
});

register({
  name: "deleteTrainingDay",
  description:
    "Delete a curriculum day. Cascades to its objectives and any saved grades for that day.",
  category: "training",
  parameters: {
    dayId: { type: "string", required: false, description: "Day UUID (preferred)" },
    dayNumber: { type: "number", required: false, description: "Day number if dayId is unknown" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    const day = resolveDay(p);
    await deleteTrainingDay(day.id);
  },
  toastMessage: (p) => `Training day deleted${p.dayNumber ? ` (Day ${p.dayNumber})` : ""}`,
});

register({
  name: "addTrainingObjective",
  description:
    "Add an objective/attachment to a curriculum day. Identify the day via dayId or dayNumber. `text` is the objective description; `mediaUrl` + `mediaType` attach an image or video.",
  category: "training",
  parameters: {
    dayId: { type: "string", required: false, description: "Day UUID (preferred)" },
    dayNumber: { type: "number", required: false, description: "Day number, e.g. 3" },
    text: { type: "string", required: true, description: "Objective text (plain or HTML)" },
    mediaUrl: { type: "string", required: false, description: "Optional uploaded asset URL" },
    mediaType: {
      type: "string",
      required: false,
      description: "Media kind",
      enum: ["image", "video"],
    },
    sortOrder: { type: "number", required: false, description: "Display order; defaults to end of list" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const day = resolveDay(p);
    const mediaType =
      p.mediaType === "image" || p.mediaType === "video" ? (p.mediaType as "image" | "video") : null;
    await addTrainingObjective({
      dayId: day.id,
      text: String(p.text ?? ""),
      mediaUrl: p.mediaUrl ? String(p.mediaUrl) : null,
      mediaType,
      sortOrder: p.sortOrder != null ? Math.max(0, Number(p.sortOrder)) : nextObjectiveSort(day.id),
    });
  },
  toastMessage: (p) => `Objective added to ${p.dayId ?? `Day ${p.dayNumber ?? "?"}`}`,
});

register({
  name: "updateTrainingObjective",
  description:
    "Edit an objective. Provide objectiveId, then any of text / mediaUrl / mediaType / sortOrder.",
  category: "training",
  parameters: {
    objectiveId: { type: "string", required: true, description: "Objective UUID" },
    text: { type: "string", required: false, description: "New text (plain or HTML)" },
    mediaUrl: { type: "string", required: false, description: "New media URL, or empty string to clear" },
    mediaType: {
      type: "string",
      required: false,
      description: "Media kind (or empty string to clear)",
      enum: ["image", "video"],
    },
    sortOrder: { type: "number", required: false, description: "Display order" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const objId = String(p.objectiveId ?? "");
    if (!objId) throw new Error("objectiveId is required");
    const current = readTrainingObjectives().find((o) => o.id === objId);
    if (!current) throw new Error(`Objective not found: ${objId}`);
    const nextText = p.text != null ? String(p.text) : current.text;
    const nextMediaUrl =
      "mediaUrl" in p ? (p.mediaUrl ? String(p.mediaUrl) : null) : undefined;
    const nextMediaType =
      "mediaType" in p
        ? p.mediaType === "image" || p.mediaType === "video"
          ? (p.mediaType as "image" | "video")
          : null
        : undefined;
    await updateTrainingObjective(objId, {
      text: nextText,
      ...(nextMediaUrl !== undefined ? { mediaUrl: nextMediaUrl } : {}),
      ...(nextMediaType !== undefined ? { mediaType: nextMediaType } : {}),
      sortOrder:
        p.sortOrder != null ? Math.max(0, Number(p.sortOrder)) : current.sortOrder,
    });
  },
  toastMessage: () => "Objective updated",
});

register({
  name: "deleteTrainingObjective",
  description: "Delete a single objective from a curriculum day.",
  category: "training",
  parameters: {
    objectiveId: { type: "string", required: true, description: "Objective UUID" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "high",
  execute: async (p) => {
    await deleteTrainingObjective(String(p.objectiveId ?? ""));
  },
  toastMessage: () => "Objective deleted",
});

/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Registry API ──────────────────────────────────────────────────────────────

export function getAction(name: string): ActionDefinition | undefined {
  return registry.get(name) ?? registry.get(normalizeActionName(name));
}

export function getAllActions(): ActionDefinition[] {
  return Array.from(registry.values());
}

export function getActionsByCategory(category: ActionCategory): ActionDefinition[] {
  return getAllActions().filter((a) => a.category === category);
}

export function getActionNames(): string[] {
  return Array.from(registry.keys());
}

export function getActionCatalog(): ActionCatalogItem[] {
  return getAllActions().map((action) => ({
    name: action.name,
    description: action.description,
    category: action.category,
    riskLevel: action.riskLevel,
    requiredPermission: action.requiredPermission,
    parameters: Object.entries(action.parameters).map(([name, def]) => ({ name, ...def })),
  }));
}

function normalizeActionName(name: string): string {
  const aliases: Record<string, string> = {
    createProduct: "addProduct",
    createInventoryItem: "addInventoryItem",
    createSupplier: "addSupplier",
    sendNotification: "createNotification",
  };
  return aliases[name] ?? name;
}

export function generateActionsPrompt(): string {
  const grouped = new Map<ActionCategory, ActionDefinition[]>();
  for (const action of getAllActions()) {
    const list = grouped.get(action.category) ?? [];
    list.push(action);
    grouped.set(action.category, list);
  }

  const categoryLabels: Record<ActionCategory, string> = {
    scheduling: "Scheduling (Shifts)",
    roles: "Roles & Tasks",
    inventory: "Inventory",
    products: "Products",
    pricing: "Pricing & Coupons",
    suppliers: "Suppliers & Purchasing",
    staffing: "Staff Members",
    notifications: "Notifications",
    builder: "Website Builder",
    training: "Training Curriculum",
  };

  const sections: string[] = [];
  for (const [cat, actions] of grouped) {
    const lines = actions.map((a) => {
      const params = Object.entries(a.parameters)
        .map(([k, v]) => `${k}${v.required ? "" : "?"}: ${v.type}`)
        .join(", ");
      return `  - ${a.name}(${params}) — ${a.description}${a.riskLevel === "high" ? " [REQUIRES APPROVAL]" : ""}`;
    });
    sections.push(`### ${categoryLabels[cat] ?? cat}\n${lines.join("\n")}`);
  }

  return `ACTIONS:
When you want to perform an action, output a JSON block wrapped in \`\`\`action tags. The user will see an "Approve" button for medium/high risk actions.

Scheduling rules:
- Every shift you create needs at least one role in \`staffRoles\` — pick from the active \`roles\` in LIVE STORE DATA (use the exact name).
- Before scheduling shifts for any team member whose \`hasPunchInCode\` is false in LIVE STORE DATA, STOP and ASK the user what 4-digit punch-in code they want to set for that person. Don't invent one. Once the user tells you, call \`setPunchInCode\` first, then add the shifts.

Supplier ordering rules:
- When the user asks to contact a supplier, restock, reorder, order more, 补货, 订货, 下单, or 联系供应商 for an inventory item, output \`orderFromSupplier\`.
- \`orderFromSupplier\` emails the supplier through Resend after approval and records the purchase order. Do not just show supplier contact info when the user asked you to contact them.
- Resolve the inventory item by name, match its \`supplier\` name to an entry in LIVE STORE DATA \`suppliers[]\`, use that supplier's \`id\`, and order enough to reach max stock while respecting case size/minimum order.
- Every supplier has a \`language\` field (default \`en\`). Use it for supplier-facing notes and pass it as \`supplierLanguage\`.
- Every line item must include the real item name in \`name\`; never output a blank name or dash. When \`unitsPerCase\` is set, include \`unitsPerCase\` and \`caseCount\`; for Chinese quantity text use \`9*箱 - 108个\` style.

Available actions:
${sections.join("\n\n")}

List command:
- /actions list all — show a visual catalog of every available action, grouped by category.
Use this command when the user asks what actions are available, asks to list all actions, or asks for an action catalog.
This is a system display command, not an executable action, and it does not require user approval.

Format:
\`\`\`action
{"action": "actionName", "param1": "value1", "param2": "value2"}
\`\`\`

You can output multiple action blocks in one response. Each will be shown separately for approval.
High-risk actions (delete, bulk operations) always require user approval.`;
}

export function requiresApproval(actionName: string): boolean {
  const action = getAction(actionName);
  if (!action) return true;
  return action.riskLevel !== "low";
}
