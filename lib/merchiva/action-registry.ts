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
} from "@/lib/spacetimedb/actions";

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
  | "builder";

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

// ─── Scheduling ────────────────────────────────────────────────────────────────

register({
  name: "addShift",
  description: "Add a shift for a staff member",
  category: "scheduling",
  parameters: {
    staffName: { type: "string", required: true, description: "Exact name from team roster" },
    date: { type: "string", required: true, description: "YYYY-MM-DD" },
    startTime: { type: "string", required: true, description: "HH:MM" },
    endTime: { type: "string", required: true, description: "HH:MM" },
    shiftType: { type: "string", required: false, description: "Shift type", enum: ["morning", "afternoon", "evening", "closing"] },
    staffRoles: { type: "array", required: false, description: "Roles for this shift" },
  },
  requiredPermission: { section: "staffing", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    await addShift({
      memberId: p.memberId ? String(p.memberId) : null,
      staffName: String(p.staffName ?? ""),
      staffRole: p.staffRole ? String(p.staffRole) : null,
      staffRoles: JSON.stringify(p.staffRoles ?? []),
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
  description: "Add a new team member",
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
    minStock: { type: "number", required: false, description: "New min stock" },
    maxStock: { type: "number", required: false, description: "New max stock" },
    unit: { type: "string", required: false, description: "New unit" },
    costPerUnit: { type: "number", required: false, description: "New cost per unit" },
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.name) data.name = String(p.name);
    if (p.minStock !== undefined) data.minStock = Number(p.minStock);
    if (p.maxStock !== undefined) data.maxStock = Number(p.maxStock);
    if (p.unit) data.unit = String(p.unit);
    if (p.costPerUnit !== undefined) data.costPerUnit = Number(p.costPerUnit);
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
  },
  requiredPermission: { section: "inventory", action: "edit" },
  riskLevel: "medium",
  execute: async (p) => {
    const data: Record<string, unknown> = {};
    if (p.name) data.name = String(p.name);
    if (p.contactName) data.contactName = String(p.contactName);
    if (p.email) data.email = String(p.email);
    if (p.phone) data.phone = String(p.phone);
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
