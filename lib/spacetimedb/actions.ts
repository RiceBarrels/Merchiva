/**
 * SpacetimeDB write actions — replaces lib/db/*.ts for all mutations.
 *
 * Reads are handled by SpacetimeDB subscription hooks (useInventory, useProducts, etc.)
 * or will be migrated to hooks in a follow-up. This file only covers writes.
 */

import { getConnection, getActiveOrgId } from "./client";
import { getDictionary, lookup } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { isOnline, mutationQueue } from "@/lib/offline";
import { parseDeviceApps } from "@/lib/device-apps";
import type { RoleTask, ShiftPreset } from "@/lib/types";
import { Timestamp } from "spacetimedb";

function currentLocale() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const raw = match ? decodeURIComponent(match[1]) : null;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function conn(): any {
  const c = getConnection();
  if (!c) throw new Error(lookup(getDictionary(currentLocale()), "toast.notConnected"));
  return c;
}

function orgId(): string {
  return getActiveOrgId();
}

function rowIdString(id: unknown): string {
  const value = id as { toHexString?: () => string; toString?: () => string } | null | undefined;
  if (typeof value?.toHexString === "function") return value.toHexString();
  return String(value ?? "");
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function finiteInventoryNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid inventory ${field}: ${String(value)}`);
  }
  return n;
}

function requiredInventoryText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Inventory ${field} cannot be blank`);
  return text;
}

function finiteNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${field}: ${String(value)}`);
  }
  return n;
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} cannot be blank`);
  return text;
}

function jsonArrayString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  return "[]";
}

function jsonArrayOrUndefined(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : undefined;
  }
  if (Array.isArray(value)) return value.length > 0 ? JSON.stringify(value) : undefined;
  return undefined;
}

type ExpirationBatchPayload = {
  expiresOn?: string | null;
  quantity: number;
};

function normalizeBatchDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function sortExpirationBatches(batches: ExpirationBatchPayload[]): ExpirationBatchPayload[] {
  return [...batches].sort((a, b) => {
    const ad = normalizeBatchDate(a.expiresOn);
    const bd = normalizeBatchDate(b.expiresOn);
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return ad.localeCompare(bd);
  });
}

function normalizeExpirationBatches(value: unknown): ExpirationBatchPayload[] {
  const parsed = typeof value === "string"
    ? (() => {
        try { return JSON.parse(value); } catch { return []; }
      })()
    : value;
  if (!Array.isArray(parsed)) return [];

  const totals = new Map<string, number>();
  for (const entry of parsed) {
    const item = entry as { expiresOn?: unknown; quantity?: unknown };
    const key = normalizeBatchDate(item.expiresOn) ?? "";
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    totals.set(key, (totals.get(key) ?? 0) + quantity);
  }

  return sortExpirationBatches([...totals.entries()].map(([key, quantity]) => ({
    expiresOn: key || null,
    quantity,
  })));
}

function expirationBatchTotal(batches: ExpirationBatchPayload[]): number {
  return batches.reduce((sum, batch) => sum + batch.quantity, 0);
}

function stringifyExpirationBatches(value: unknown): string | null {
  const batches = normalizeExpirationBatches(value);
  return batches.length > 0 ? JSON.stringify(batches) : null;
}

function addToExpirationBatches(
  value: unknown,
  batchDate: unknown,
  quantity: number,
): ExpirationBatchPayload[] {
  const batches = normalizeExpirationBatches(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return batches;
  const key = normalizeBatchDate(batchDate) ?? "";
  const existing = batches.find((batch) => (normalizeBatchDate(batch.expiresOn) ?? "") === key);
  if (existing) existing.quantity += quantity;
  else batches.push({ expiresOn: key || null, quantity });
  return sortExpirationBatches(batches);
}

function subtractFromExpirationBatches(
  value: unknown,
  batchDate: unknown,
  quantity: number,
): ExpirationBatchPayload[] {
  const batches = normalizeExpirationBatches(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return batches;

  const key = normalizeBatchDate(batchDate) ?? "";
  let remaining = quantity;
  const candidates = key
    ? batches.filter((batch) => (normalizeBatchDate(batch.expiresOn) ?? "") === key)
    : [
        ...batches.filter((batch) => !normalizeBatchDate(batch.expiresOn)),
        ...batches.filter((batch) => normalizeBatchDate(batch.expiresOn)),
      ];

  for (const batch of candidates) {
    if (remaining <= 0) break;
    const consumed = Math.min(batch.quantity, remaining);
    batch.quantity -= consumed;
    remaining -= consumed;
  }

  return sortExpirationBatches(batches.filter((batch) => batch.quantity > 0));
}

function reconcileExpirationBatchesToStock(value: unknown, currentStock: number): ExpirationBatchPayload[] {
  if (!Number.isFinite(currentStock) || currentStock <= 0) return [];
  let batches = normalizeExpirationBatches(value);
  const diff = currentStock - expirationBatchTotal(batches);
  if (diff > 0) {
    batches = addToExpirationBatches(batches, null, diff);
  } else if (diff < 0) {
    batches = subtractFromExpirationBatches(batches, null, Math.abs(diff));
  }
  return batches;
}

function initialExpirationBatches(value: unknown, batchDate: unknown, currentStock: number): string | null {
  const explicit = normalizeExpirationBatches(value);
  if (explicit.length > 0) return stringifyExpirationBatches(reconcileExpirationBatchesToStock(explicit, currentStock));
  if (!Number.isFinite(currentStock) || currentStock <= 0) return null;
  return stringifyExpirationBatches([{ expiresOn: normalizeBatchDate(batchDate), quantity: currentStock }]);
}

function optionBool(value: unknown): boolean | null {
  if (value == null) return null;
  return Boolean(value);
}

function optionNumber(value: unknown, field: string): number | null {
  if (value == null || value === "") return null;
  return finiteNumber(value, field);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstInventoryUsageLine(value: unknown): Record<string, any> | null {
  const parsed = typeof value === "string"
    ? (() => {
        try { return JSON.parse(value); } catch { return null; }
      })()
    : value;
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const line = parsed[0];
  return line && typeof line === "object" ? line as Record<string, unknown> : null;
}

// updateInventoryItem is a full-row reducer. AI actions and undo operations often
// send partial patches, so merge them with the subscribed cache before calling it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildInventoryUpdatePayload(itemId: string, data: Record<string, any>) {
  const organizationId = orgId();
  const c = getConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (c as any)?.db?.inventoryItem?.iter ? [...(c as any).db.inventoryItem.iter()] : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = rows.find((r: any) => r.organizationId === organizationId && rowIdString(r.id) === itemId);

  const value = (key: string) => (hasOwn(data, key) ? data[key] : current?.[key]);
  const required = [
    "name",
    "category",
    "currentStock",
    "minStock",
    "maxStock",
    "unit",
    "costPerUnit",
    "supplier",
    "lastRestocked",
    "lossRate",
  ];
  const missing = required.filter((key) => value(key) === undefined || value(key) === null);
  if (missing.length > 0) {
    throw new Error(`Cannot update inventory item without current ${missing.join(", ")} values`);
  }

  const minOrderQty = hasOwn(data, "minOrderQty") ? data.minOrderQty : current?.minOrderQty;
  const unitsPerCase = hasOwn(data, "unitsPerCase") ? data.unitsPerCase : current?.unitsPerCase;
  const description = hasOwn(data, "description") ? data.description : current?.description;
  const unitContentAmount = hasOwn(data, "unitContentAmount") ? data.unitContentAmount : current?.unitContentAmount;
  const unitContentUnit = hasOwn(data, "unitContentUnit") ? data.unitContentUnit : current?.unitContentUnit;
  const retailEnabled = hasOwn(data, "retailEnabled") ? data.retailEnabled : current?.retailEnabled;
  const retailPrice = hasOwn(data, "retailPrice") ? data.retailPrice : current?.retailPrice;
  const retailDescription = hasOwn(data, "retailDescription") ? data.retailDescription : current?.retailDescription;
  const retailImageUrl = hasOwn(data, "retailImageUrl") ? data.retailImageUrl : current?.retailImageUrl;
  const retailUsageQty = hasOwn(data, "retailUsageQty") ? data.retailUsageQty : current?.retailUsageQty;
  const currentStock = finiteInventoryNumber(value("currentStock"), "currentStock");
  const previousStock = current ? finiteInventoryNumber(current.currentStock, "currentStock") : currentStock;
  const stockDelta = currentStock - previousStock;
  const batchExpirationDate = normalizeBatchDate(data.batchExpirationDate);
  const expirationBatches = hasOwn(data, "expirationBatches")
    ? reconcileExpirationBatchesToStock(data.expirationBatches, currentStock)
    : reconcileExpirationBatchesToStock(
        stockDelta > 0
          ? addToExpirationBatches(current?.expirationBatches, batchExpirationDate, stockDelta)
          : stockDelta < 0
            ? subtractFromExpirationBatches(current?.expirationBatches, batchExpirationDate, Math.abs(stockDelta))
            : current?.expirationBatches,
        currentStock,
      );

  return {
    organizationId,
    itemId,
    name: requiredInventoryText(value("name"), "name"),
    category: String(value("category") ?? "General").trim() || "General",
    currentStock,
    minStock: finiteInventoryNumber(value("minStock"), "minStock"),
    maxStock: finiteInventoryNumber(value("maxStock"), "maxStock"),
    unit: requiredInventoryText(value("unit"), "unit"),
    costPerUnit: finiteInventoryNumber(value("costPerUnit"), "costPerUnit"),
    supplier: String(value("supplier") ?? ""),
    lastRestocked: String(value("lastRestocked") ?? new Date().toISOString().slice(0, 10)),
    lossRate: finiteInventoryNumber(value("lossRate"), "lossRate"),
    minOrderQty: minOrderQty == null ? null : finiteInventoryNumber(minOrderQty, "minOrderQty"),
    unitsPerCase: unitsPerCase == null ? null : finiteInventoryNumber(unitsPerCase, "unitsPerCase"),
    description: description == null ? null : String(description),
    unitContentAmount: unitContentAmount == null || unitContentAmount === "" ? null : finiteInventoryNumber(unitContentAmount, "unitContentAmount"),
    unitContentUnit: unitContentUnit == null ? null : String(unitContentUnit).trim() || null,
    retailEnabled: optionBool(retailEnabled),
    retailPrice: optionNumber(retailPrice, "retail price"),
    retailDescription: retailDescription == null ? null : String(retailDescription),
    retailImageUrl: retailImageUrl == null ? null : String(retailImageUrl),
    retailUsageQty: optionNumber(retailUsageQty, "retail usage quantity"),
    expirationBatches: stringifyExpirationBatches(expirationBatches),
    batchExpirationDate,
    stockNote: hasOwn(data, "stockNote") ? String(data.stockNote ?? "") : undefined,
    evidenceUrls: hasOwn(data, "evidenceUrls") ? jsonArrayOrUndefined(data.evidenceUrls) : undefined,
  };
}

async function offlineAware(
  reducerName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
): Promise<void> {
  if (isOnline()) {
    const c = getConnection();
    if (c) {
      return c.reducers[reducerName](args);
    }
  }
  await mutationQueue.enqueue(reducerName, args);
}

// ─── Inventory ────────────────────────────────────────────────────────────────

// Read the current store-device operator (if any) directly from localStorage so
// we don't have to thread the operator through every mutation call site. Server
// reducers store these on the inventory_transaction row for activity tracking.
function operatorArgs(): { operatorMemberId?: string; operatorName?: string } {
  if (typeof window === "undefined") return {};
  try {
    const id = localStorage.getItem("store_device_operator_member_id");
    if (!id) return {};
    const name = localStorage.getItem("store_device_operator_name") ?? "";
    return { operatorMemberId: id, operatorName: name };
  } catch {
    return {};
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addInventoryItem(data: any, _userId?: string): Promise<void> {
  const currentStock = finiteInventoryNumber(data.currentStock ?? 0, "currentStock");
  return offlineAware("addInventoryItem", {
    organizationId: orgId(),
    ...data,
    currentStock,
    expirationBatches: initialExpirationBatches(data.expirationBatches, data.batchExpirationDate, currentStock),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateInventoryItem(itemId: string, data: any): Promise<void> {
  return offlineAware("updateInventoryItem", { ...buildInventoryUpdatePayload(itemId, data), ...operatorArgs() });
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  return offlineAware("deleteInventoryItem", { organizationId: orgId(), itemId });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addInventoryTransaction(data: any): Promise<void> {
  return offlineAware("addInventoryTransaction", {
    organizationId: orgId(),
    ...data,
    evidenceUrls: jsonArrayOrUndefined(data.evidenceUrls),
    batchExpirationDate: normalizeBatchDate(data.batchExpirationDate),
    ...operatorArgs(),
  });
}

// ─── Products ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addProduct(data: any, _userId?: string): Promise<void> {
  const usage = firstInventoryUsageLine(data.inventoryUsage);
  const inventoryItemId = String(data.inventoryItemId ?? usage?.inventoryItemId ?? "");
  const retailPatch = {
    retailEnabled: true,
    retailPrice: finiteNumber(data.price ?? 0, "retail price"),
    retailDescription: data.description == null ? null : String(data.description),
    retailImageUrl: data.imageUrl == null ? null : String(data.imageUrl),
    retailUsageQty: optionNumber(data.retailUsageQty ?? usage?.quantity ?? 1, "retail usage quantity"),
  };

  if (inventoryItemId) {
    return updateInventoryItem(inventoryItemId, retailPatch);
  }

  return offlineAware("addInventoryItem", {
    organizationId: orgId(),
    name: requiredText(data.name, "Product name"),
    category: String(data.category ?? "Retail").trim() || "Retail",
    currentStock: finiteInventoryNumber(data.currentStock ?? 0, "currentStock"),
    minStock: finiteInventoryNumber(data.minStock ?? 0, "minStock"),
    maxStock: finiteInventoryNumber(data.maxStock ?? 100, "maxStock"),
    unit: String(data.unit ?? usage?.unit ?? "units").trim() || "units",
    costPerUnit: finiteInventoryNumber(data.cost ?? data.costPerUnit ?? 0, "costPerUnit"),
    supplier: String(data.supplier ?? ""),
    lastRestocked: String(data.lastRestocked ?? new Date().toISOString().slice(0, 10)),
    minOrderQty: null,
    unitsPerCase: null,
    description: data.description == null ? null : String(data.description),
    unitContentAmount: null,
    unitContentUnit: null,
    expirationBatches: initialExpirationBatches(
      data.expirationBatches,
      data.batchExpirationDate,
      finiteInventoryNumber(data.currentStock ?? 0, "currentStock"),
    ),
    ...retailPatch,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateProduct(productId: string, data: any): Promise<void> {
  const usage = firstInventoryUsageLine(data.inventoryUsage);
  const inventoryItemId = String(data.inventoryItemId ?? usage?.inventoryItemId ?? productId);
  return updateInventoryItem(inventoryItemId, {
    ...(hasOwn(data, "name") ? { name: data.name } : {}),
    ...(hasOwn(data, "category") ? { category: data.category } : {}),
    retailEnabled: hasOwn(data, "retailEnabled") ? data.retailEnabled : true,
    ...(hasOwn(data, "price") ? { retailPrice: data.price } : {}),
    ...(hasOwn(data, "description") ? { retailDescription: data.description } : {}),
    ...(hasOwn(data, "imageUrl") ? { retailImageUrl: data.imageUrl } : {}),
    ...(hasOwn(data, "retailUsageQty") || usage?.quantity != null
      ? { retailUsageQty: data.retailUsageQty ?? usage?.quantity }
      : {}),
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  return updateInventoryItem(productId, { retailEnabled: false });
}

// ─── Staffing: Shifts ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildShiftPayload(data: Record<string, any>): Record<string, any> {
  const roleNames = Array.isArray(data.staffRoles)
    ? data.staffRoles.filter((role) => typeof role === "string")
    : [];
  return {
    ...data,
    staffRole: data.staffRole ?? roleNames[0] ?? null,
    staffRoles: jsonArrayString(data.staffRoles),
    predictedDemand: data.predictedDemand ?? "medium",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addShift(data: any, _userId?: string, _orgIdParam?: string): Promise<void> {
  return offlineAware("addShift", { organizationId: orgId(), ...buildShiftPayload(data) });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateShift(shiftId: string, data: any): Promise<void> {
  return offlineAware("updateShift", { organizationId: orgId(), shiftId, ...buildShiftPayload(data) });
}

export async function deleteShift(shiftId: string): Promise<void> {
  return offlineAware("deleteShift", { organizationId: orgId(), shiftId });
}

// ─── Staffing: Staff Roles ────────────────────────────────────────────────────

/** staff_role.permissions is a JSON string column. The staffing Roles dialog
 *  passes a StaffRolePermissions object, the team page a pre-serialised string —
 *  serialise here so objects are never sent as "[object Object]". */
function serializeRolePermissions(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? {});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addStaffRole(data: any, _userId?: string, _orgIdParam?: string): Promise<void> {
  return offlineAware("addStaffRole", {
    organizationId: orgId(),
    ...data,
    permissions: serializeRolePermissions(data?.permissions),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateStaffRole(roleId: string, data: any): Promise<void> {
  return offlineAware("updateStaffRole", {
    organizationId: orgId(),
    roleId,
    ...data,
    permissions: serializeRolePermissions(data?.permissions),
  });
}

export async function deleteStaffRole(roleId: string): Promise<void> {
  return offlineAware("deleteStaffRole", { organizationId: orgId(), roleId });
}

// ─── Staffing: Staff Members ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addStaffMember(data: any): Promise<void> {
  return offlineAware("addStaffMember", { organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateStaffMember(staffMemberId: string, data: any): Promise<void> {
  return offlineAware("updateStaffMember", { organizationId: orgId(), staffMemberId, ...data });
}

export async function deleteStaffMember(staffMemberId: string): Promise<void> {
  return offlineAware("deleteStaffMember", { organizationId: orgId(), staffMemberId });
}

// ─── Staffing: Role Tasks (read from SpacetimeDB table, no write reducers yet)

export async function getRoleTasks(roleId: string): Promise<RoleTask[]> {
  const c = getConnection();
  if (!c) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (c as any).db.roleTask.iter().filter((r: any) => r.roleId === roleId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Array.from(rows).map((r: any) => {
    let notifyChats: string[] = [];
    if (Array.isArray(r.notifyChats)) {
      notifyChats = r.notifyChats;
    } else if (typeof r.notifyChats === "string" && r.notifyChats.length > 0) {
      try {
        const parsed = JSON.parse(r.notifyChats);
        if (Array.isArray(parsed)) notifyChats = parsed.filter((x) => typeof x === "string");
      } catch {
        notifyChats = [];
      }
    }
    return {
      id: r.id.toString(),
      roleId: r.roleId,
      organizationId: r.organizationId ?? null,
      title: r.title,
      description: r.description,
      startTime: r.startTime ?? null,
      endTime: r.endTime ?? null,
      sortOrder: r.sortOrder,
      requiresEvidence: r.requiresEvidence,
      notifyChats,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addRoleTask(data: any): Promise<void> {
  return conn().reducers.addRoleTask({
    organizationId: orgId(),
    roleId: data.roleId,
    title: data.title,
    description: data.description ?? "",
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
    sortOrder: data.sortOrder ?? 0,
    requiresEvidence: data.requiresEvidence ?? false,
    notifyChats: JSON.stringify(data.notifyChats ?? []),
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateRoleTask(id: string, data: any): Promise<void> {
  return conn().reducers.updateRoleTask({
    organizationId: orgId(),
    roleTaskId: id,
    title: data.title,
    description: data.description,
    startTime: data.startTime ?? undefined,
    endTime: data.endTime ?? undefined,
    sortOrder: data.sortOrder ?? 0,
    requiresEvidence: data.requiresEvidence ?? false,
    notifyChats: typeof data.notifyChats === 'string' ? data.notifyChats : JSON.stringify(data.notifyChats ?? []),
  });
}
export async function deleteRoleTask(id: string): Promise<void> {
  return conn().reducers.deleteRoleTask({ organizationId: orgId(), roleTaskId: id });
}

// ─── Role Task Assignments (todos) ────────────────────────────────────────────

export async function assignRoleTask(data: {
  taskId: string;
  memberId: string;
  dueAt: Date;
  organizationId?: string;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).assignRoleTask({
    organizationId: data.organizationId ?? orgId(),
    taskId: data.taskId,
    memberId: data.memberId,
    dueAt: data.dueAt,
  });
}

export async function completeRoleTask(data: {
  assignmentId: string;
  evidenceUrl?: string | null;
  evidenceUrls?: { url: string; type: string }[] | null;
  note?: string | null;
  organizationId?: string;
}): Promise<void> {
  const list = data.evidenceUrls ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).completeRoleTask({
    organizationId: data.organizationId ?? orgId(),
    assignmentId: data.assignmentId,
    // Keep legacy single-URL field populated with the first item.
    evidenceUrl: data.evidenceUrl ?? list?.[0]?.url ?? undefined,
    note: data.note ?? undefined,
    evidenceUrls: list && list.length > 0 ? JSON.stringify(list) : undefined,
  });
}

export async function skipRoleTask(data: {
  assignmentId: string;
  reason?: string;
  organizationId?: string;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).skipRoleTask({
    organizationId: data.organizationId ?? orgId(),
    assignmentId: data.assignmentId,
    reason: data.reason ?? undefined,
  });
}

export async function deleteRoleTaskAssignment(id: string, organizationId?: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).deleteRoleTaskAssignment({
    organizationId: organizationId ?? orgId(),
    assignmentId: id,
  });
}

// One-shot completion: the staff member is looking at the role task and
// "completes" it directly with evidence — no pre-assigned row required.
export async function recordTaskCompletion(data: {
  taskId: string;
  memberId?: string;
  evidenceUrl?: string | null;
  evidenceUrls?: { url: string; type: string }[] | null;
  note?: string | null;
  organizationId?: string;
}): Promise<void> {
  const list = data.evidenceUrls ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).recordTaskCompletion({
    organizationId: data.organizationId ?? orgId(),
    taskId: data.taskId,
    memberId: data.memberId ?? undefined,
    // Keep legacy single-URL field populated with the first item.
    evidenceUrl: data.evidenceUrl ?? list?.[0]?.url ?? undefined,
    note: data.note ?? undefined,
    evidenceUrls: list && list.length > 0 ? JSON.stringify(list) : undefined,
  });
}

// ─── Shift Presets (read from SpacetimeDB table, no write reducers yet)

export async function getShiftPresets(_orgId?: string): Promise<ShiftPreset[]> {
  const c = getConnection();
  if (!c) return [];
  const oid = _orgId ?? orgId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (c as any).db.shiftPreset.iter().filter((r: any) => r.organizationId === oid);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Array.from(rows).map((r: any) => ({
    id: r.id.toString(),
    organizationId: r.organizationId,
    name: r.name,
    startTime: r.startTime,
    endTime: r.endTime,
    color: r.color,
    sortOrder: r.sortOrder,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addShiftPreset(orgIdParam: string, data: any): Promise<void> {
  return conn().reducers.addShiftPreset({
    organizationId: orgIdParam || orgId(),
    name: data.name,
    startTime: data.startTime,
    endTime: data.endTime,
    color: data.color,
    sortOrder: data.sortOrder ?? 0,
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateShiftPreset(id: string, data: any): Promise<void> {
  return conn().reducers.updateShiftPreset({
    organizationId: orgId(),
    presetId: id,
    name: data.name,
    startTime: data.startTime,
    endTime: data.endTime,
    color: data.color,
    sortOrder: data.sortOrder ?? 0,
  });
}
export async function deleteShiftPreset(id: string): Promise<void> {
  return conn().reducers.deleteShiftPreset({ organizationId: orgId(), presetId: id });
}

// ─── Availability & Time-off ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertAvailability(data: any): Promise<void> {
  return conn().reducers.upsertAvailability({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createTimeOffRequest(data: any): Promise<void> {
  return conn().reducers.createTimeOffRequest({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateTimeOffStatus(requestId: string, status: string, _orgIdParam?: string): Promise<void> {
  return conn().reducers.updateTimeOffStatus({ organizationId: orgId(), requestId, status });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createShiftTrade(data: any): Promise<void> {
  return conn().reducers.createShiftTrade({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateTradeStatus(tradeId: string, status: string, _orgIdParam?: string): Promise<void> {
  return conn().reducers.updateShiftTradeStatus({ organizationId: orgId(), tradeId, status });
}

export async function acceptShiftTrade(tradeId: string, acceptorId: string, acceptorShiftId?: string | null): Promise<void> {
  return conn().reducers.acceptShiftTrade({ organizationId: orgId(), tradeId, acceptorId, acceptorShiftId: acceptorShiftId ?? null });
}

export async function managerApproveShiftTrade(tradeId: string, managerId: string, approved: boolean): Promise<void> {
  return conn().reducers.managerApproveShiftTrade({ organizationId: orgId(), tradeId, managerId, approved });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertSettings(_userId: string, data: any): Promise<void> {
  return conn().reducers.updateSettings({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateSettings(data: any): Promise<void> {
  return conn().reducers.updateSettings({ organizationId: orgId(), ...data });
}

export async function setSupplierInboundPrefix(prefix: string): Promise<void> {
  return (conn().reducers as Record<string, (args: unknown) => void>).setSupplierInboundPrefix({
    organizationId: orgId(),
    prefix,
  });
}

// Disconnect integrations — update settings with null tokens
export async function disconnectSquare(_userId: string): Promise<void> {
  return conn().reducers.updateSettings({
    organizationId: orgId(),
    squareConnected: false,
    squareAccessToken: null,
    squareRefreshToken: null,
  });
}

export async function disconnectClover(_userId: string): Promise<void> {
  return conn().reducers.disconnectClover({ organizationId: orgId() });
}

export async function setScheduleIntegration(data: {
  provider: string;
  companyGuid?: string | null;
  companyId?: string | null;
  locationId?: string | null;
}): Promise<void> {
  return (conn().reducers as Record<string, (args: unknown) => void>).setScheduleIntegration({
    organizationId: orgId(),
    provider: data.provider,
    companyGuid: data.companyGuid ?? undefined,
    companyId: data.companyId ?? undefined,
    locationId: data.locationId ?? undefined,
  });
}

export async function disconnectScheduleIntegration(): Promise<void> {
  return (conn().reducers as Record<string, (args: unknown) => void>).disconnectScheduleIntegration({
    organizationId: orgId(),
  });
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export async function createSite(organizationId: string, name: string, slug: string): Promise<void> {
  return conn().reducers.createSite({ organizationId, name, slug });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateSite(siteId: string, data: any): Promise<void> {
  return conn().reducers.updateSite({ organizationId: orgId(), siteId, ...data });
}

export async function deleteSite(siteId: string): Promise<void> {
  return conn().reducers.deleteSite({ organizationId: orgId(), siteId });
}

// ─── Designs ──────────────────────────────────────────────────────────────────

export async function createDesign(data: {
  name: string;
  width: number;
  height: number;
  html: string;
  preset?: string | null;
}): Promise<void> {
  return conn().reducers.createDesign({
    organizationId: orgId(),
    name: data.name,
    width: data.width,
    height: data.height,
    html: data.html,
    preset: data.preset ?? undefined,
  });
}

export async function updateDesign(designId: string, data: {
  name: string;
  width: number;
  height: number;
  html: string;
  preset?: string | null;
}): Promise<void> {
  return conn().reducers.updateDesign({
    organizationId: orgId(),
    designId,
    name: data.name,
    width: data.width,
    height: data.height,
    html: data.html,
    preset: data.preset ?? undefined,
  });
}

export async function deleteDesign(designId: string): Promise<void> {
  return conn().reducers.deleteDesign({ organizationId: orgId(), designId });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPage(siteIdOrData: string | any, name?: string, slug?: string, sortOrder?: number): Promise<void> {
  const payload = typeof siteIdOrData === "string"
    ? { organizationId: orgId(), siteId: siteIdOrData, name, slug, sortOrder, elements: "[]" }
    : { organizationId: orgId(), ...siteIdOrData };
  return conn().reducers.addPage(payload);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePage(pageId: string, data: any): Promise<void> {
  return conn().reducers.updatePage({ organizationId: orgId(), pageId, ...data });
}

export async function deletePage(id: string): Promise<void> {
  return conn().reducers.deletePage({ organizationId: orgId(), pageId: id });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveComponent(data: any): Promise<void> {
  return conn().reducers.saveComponent({
    organizationId: orgId(),
    siteId: data.siteId ?? undefined,
    name: data.name,
    description: data.description ?? undefined,
    elementData: typeof data.elementData === 'string' ? data.elementData : JSON.stringify(data.elementData),
    category: data.category ?? undefined,
  });
}

export async function deleteComponent(id: string): Promise<void> {
  return conn().reducers.deleteComponent({ organizationId: orgId(), componentId: id });
}

// ─── Site Functions (FlowFn) ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveFunction(_data: any): Promise<void> {
  console.warn("saveFunction: siteFunction table removed from server");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateFunction(_functionId: string, _data: any): Promise<void> {
  console.warn("updateFunction: siteFunction table removed from server");
}

export async function deleteFunction(_functionId: string): Promise<void> {
  console.warn("deleteFunction: siteFunction table removed from server");
}

// ─── Payments ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPayment(data: any): Promise<void> {
  return conn().reducers.createPayment({ organizationId: orgId(), ...data });
}

export async function refundPayment(paymentId: string, amount?: number, reason?: string): Promise<void> {
  return conn().reducers.refundPayment({
    organizationId: orgId(),
    paymentId,
    refundAmount: amount ?? 0,
    refundReason: reason ?? "",
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createConversation(organizationId: string, type: string, memberUserIds: string[], name?: string): Promise<void> {
  return conn().reducers.createConversation({ organizationId, type, name: name ?? "", memberUserIds: JSON.stringify(memberUserIds) });
}

export async function sendMessage(
  conversationId: string,
  content: string,
  replyToId?: string,
  attachment?: { url: string; type: string; name: string } | null,
  // Raw speech-to-text transcript when `content` is an AI summary of a voice
  // message (walkie-talkie surfaces). Stored on chat_message.voiceTranscript.
  voiceTranscript?: string | null,
): Promise<void> {
  await offlineAware("sendMessage", {
    conversationId,
    content,
    replyToId: replyToId ?? undefined,
    attachmentUrl: attachment?.url ?? undefined,
    attachmentType: attachment?.type ?? undefined,
    attachmentName: attachment?.name ?? undefined,
    voiceTranscript: voiceTranscript ?? undefined,
  });
  // Best-effort: also fan out web push to recipients' other devices. The
  // sendMessage reducer already inserted notification rows server-side which
  // the Tauri bridge picks up — this branch covers browsers that need the
  // service-worker delivery to wake the page.
  if (isOnline()) {
    void fanOutChatPush(conversationId, content, attachment ? attachment.url : null);
  }
}

// Looks up other chat members for the given conversation, their push
// subscriptions in the local SpacetimeDB cache, and posts a single fan-out to
// /api/push/send. Read-only against the SpacetimeDB client cache, so it relies
// on the standard subscriptions already established by the provider.
async function fanOutChatPush(
  conversationId: string,
  content: string,
  attachmentUrl: string | null,
): Promise<void> {
  try {
    const c = getConnection();
    if (!c || !c.identity) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (c as any).db;
    const me = c.identity.toString();

    const conv = Array.from(db.chatConversation.iter()).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) => row.id.toString() === conversationId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any | undefined;
    if (!conv) return;

    const members = Array.from(db.chatMember.byConversationId.filter(conversationId)) as Array<{
      userId: { toString(): string };
    }>;
    const recipientIds = new Set(
      members
        .map((m) => m.userId.toString())
        .filter((id) => id !== me),
    );
    if (recipientIds.size === 0) return;

    const subs = Array.from(db.pushSubscription.iter()) as Array<{
      organizationId: string;
      targetId: { toString(): string };
      endpoint: string;
      p256Dh: string;
      auth: string;
    }>;
    const subscriptions = subs
      .filter((s) => s.organizationId === conv.organizationId && recipientIds.has(s.targetId.toString()))
      .map((s) => ({ endpoint: s.endpoint, p256dh: s.p256Dh, auth: s.auth }));
    if (subscriptions.length === 0) return;

    const senderName = (Array.from(db.orgMember.byUserId.filter(c.identity)) as Array<{
      organizationId: string;
      displayName: string;
    }>).find((m) => m.organizationId === conv.organizationId)?.displayName ?? "New message";
    const preview = content.length > 140 ? content.slice(0, 137) + "..." : content;
    const body = attachmentUrl && !content ? "[attachment]" : preview;

    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptions,
        title: senderName,
        body,
        link: "/manager/channel",
        type: "team",
      }),
    });
  } catch {
    // best-effort
  }
}

export async function addMembersToConversation(convId: string, userIds: string[]): Promise<void> {
  return conn().reducers.addMembersToConversation({ conversationId: convId, userIds: JSON.stringify(userIds) });
}

// Invite / remove Mr. Merchiva from a conversation. The actual bot replies are
// posted server-side (see /api/chat/merchiva via sendMerchivaMessage); this
// only flips the conversation flag.
export async function setConversationMerchiva(conversationId: string, enabled: boolean): Promise<void> {
  return conn().reducers.setConversationMerchiva({ conversationId, enabled });
}

export async function addReaction(_messageId: string, _emoji: string): Promise<void> {
  console.warn("[SpacetimeDB] addReaction not yet implemented");
}

export async function removeReaction(_messageId: string, _emoji: string): Promise<void> {
  console.warn("[SpacetimeDB] removeReaction not yet implemented");
}

export async function deleteMessage(messageId: string): Promise<void> {
  return conn().reducers.deleteMessage({ conversationId: "", messageId });
}

// ─── Membership ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createTier(siteIdOrData: string | any, data?: any): Promise<void> {
  const payload = typeof siteIdOrData === "string"
    ? { organizationId: orgId(), siteId: siteIdOrData, ...data }
    : { organizationId: orgId(), ...siteIdOrData };
  return conn().reducers.createMembershipTier(payload);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createMembershipTier(data: any): Promise<void> {
  return conn().reducers.createMembershipTier({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addPerk(data: any): Promise<void> {
  return conn().reducers.addPerk({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function claimPerk(data: any): Promise<void> {
  return conn().reducers.claimPerk(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addPoints(data: any): Promise<void> {
  return conn().reducers.addPoints(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registerCustomer(data: any): Promise<void> {
  return conn().reducers.registerCustomer(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateTier(id: string, data: any): Promise<void> {
  return conn().reducers.updateTier({
    organizationId: orgId(),
    tierId: id,
    name: data.name,
    description: data.description ?? undefined,
    price: data.price,
    pricePeriod: data.pricePeriod,
    color: data.color,
    icon: data.icon,
    sortOrder: data.sortOrder ?? 0,
    isDefault: data.isDefault ?? false,
  });
}
export async function deleteTier(id: string): Promise<void> {
  return conn().reducers.deleteTier({ organizationId: orgId(), tierId: id });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPerk(data: any): Promise<void> {
  return conn().reducers.addPerk({ organizationId: orgId(), ...data });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePerk(id: string, data: any): Promise<void> {
  return conn().reducers.updatePerk({
    organizationId: orgId(),
    perkId: id,
    type: data.type,
    name: data.name,
    description: data.description ?? undefined,
    couponCode: data.couponCode ?? undefined,
    discountValue: data.discountValue ?? undefined,
    discountType: data.discountType ?? undefined,
    cooldownHours: data.cooldownHours ?? undefined,
    frequency: data.frequency ?? undefined,
    minPurchase: data.minPurchase ?? undefined,
    active: data.active ?? true,
    sortOrder: data.sortOrder ?? 0,
  });
}
export async function deletePerk(id: string): Promise<void> {
  return conn().reducers.deletePerk({ organizationId: orgId(), perkId: id });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loginCustomer(_data: any): Promise<void> { console.warn("[SpacetimeDB] loginCustomer not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assignTier(data: any): Promise<void> {
  return conn().reducers.assignTier({ siteId: data.siteId, customerId: data.customerId, plan: data.plan });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createOrder(data: any): Promise<void> {
  return conn().reducers.createSiteOrder({
    siteId: data.siteId,
    customerId: data.customerId ?? undefined,
    items: typeof data.items === 'string' ? data.items : JSON.stringify(data.items),
    total: data.total,
    customerName: data.customerName ?? undefined,
    customerEmail: data.customerEmail ?? undefined,
    notes: data.notes ?? undefined,
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createBooking(data: any): Promise<void> {
  return conn().reducers.createSiteBooking({
    siteId: data.siteId,
    customerId: data.customerId ?? undefined,
    date: data.date,
    time: data.time,
    partySize: data.partySize,
    name: data.name,
    phone: data.phone ?? undefined,
    email: data.email ?? undefined,
    notes: data.notes ?? undefined,
  });
}
export async function updateOrderStatus(id: string, status: string): Promise<void> {
  return conn().reducers.updateOrderStatus({ organizationId: orgId(), orderId: id, status });
}
export async function updateBookingStatus(id: string, status: string): Promise<void> {
  return conn().reducers.updateBookingStatus({ organizationId: orgId(), bookingId: id, status });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function redeemPoints(data: any): Promise<void> {
  return conn().reducers.redeemPoints({ siteId: data.siteId, customerId: data.customerId, points: data.points });
}

// ─── Team / Org ───────────────────────────────────────────────────────────────

export async function createOrg(name: string, parentOrgId?: string | null): Promise<void> {
  return conn().reducers.createOrg({
    name,
    parentOrgId: parentOrgId && parentOrgId.length > 0 ? parentOrgId : undefined,
  });
}

/**
 * Set the store image URL shown wherever the user picks a store. Pass null /
 * "" to clear it. Owner-only on the server side.
 */
export async function updateOrgLogo(
  organizationId: string,
  logoUrl: string | null,
): Promise<void> {
  return conn().reducers.updateOrgLogo({
    organizationId,
    logoUrl: logoUrl && logoUrl.length > 0 ? logoUrl : undefined,
  });
}

/**
 * Attach this org as a sub-store of `parentOrgId`, or detach it (pass null /
 * undefined / "") to make it a root org again. Owner-only on the server side.
 */
export async function updateOrgParent(
  organizationId: string,
  parentOrgId: string | null,
): Promise<void> {
  return conn().reducers.updateOrgParent({
    organizationId,
    parentOrgId: parentOrgId && parentOrgId.length > 0 ? parentOrgId : undefined,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function inviteToOrg(data: any): Promise<void> {
  return conn().reducers.inviteToOrg({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateMember(
  memberId: string,
  data: { role: string; permissions: string },
): Promise<void> {
  // The reducer takes BOTH fields and overwrites both — a missing role would be
  // stored as "" and silently strip the member's role.
  if (!data.role?.trim()) throw new Error("Member role is required");
  return conn().reducers.updateMemberPermissions({
    organizationId: orgId(),
    memberId,
    role: data.role,
    permissions: data.permissions,
  });
}

export async function removeMember(memberId: string): Promise<void> {
  return conn().reducers.setMemberStatus({ organizationId: orgId(), memberId, status: "removed" });
}

export async function cancelInvitation(id: string): Promise<void> {
  return conn().reducers.cancelInvitation({ organizationId: orgId(), invitationId: id });
}

export async function setPunchInCode(memberId: string, code: string | null): Promise<void> {
  return conn().reducers.setPunchInCode({
    organizationId: orgId(),
    memberId,
    code: code ?? undefined,
  });
}

export async function setMemberHourlyRate(memberId: string, rate: number | null): Promise<void> {
  return conn().reducers.setMemberHourlyRate({
    organizationId: orgId(),
    memberId,
    rate: rate ?? undefined,
  });
}

export async function acceptInvitation(token: string): Promise<void> {
  return conn().reducers.acceptInvitation({ token });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateProfile(data: any): Promise<void> {
  return conn().reducers.updateProfile(data);
}

export async function updateDisplayName(displayName: string): Promise<void> {
  return conn().reducers.updateDisplayName({ displayName });
}

// ─── Todos (no reducer — stub) ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTodos(_userId?: string, _orgId?: string): Promise<any[]> { return []; }
export async function addTodo(_userId: string, orgIdParam: string, title: string): Promise<void> {
  return conn().reducers.addTodo({ organizationId: orgIdParam || orgId(), title });
}
export async function toggleTodo(id: string, completed: boolean): Promise<void> {
  return conn().reducers.toggleTodo({ todoId: id, completed });
}
export async function deleteTodo(id: string): Promise<void> {
  return conn().reducers.deleteTodo({ todoId: id });
}

// ─── Punch Clock ─────────────────────────────────────────────────────────────

export async function recordPunch(code: string, action: string): Promise<void> {
  return conn().reducers.recordPunch({
    organizationId: orgId(),
    code,
    action,
  });
}

export async function managerRecordPunch(memberId: string, action: "in" | "out"): Promise<void> {
  return conn().reducers.managerRecordPunch({
    organizationId: orgId(),
    memberId,
    action,
  });
}

export async function managerSetPunchWindow(
  memberId: string,
  dayStartAt: Date,
  dayEndAt: Date,
  startAt: Date,
  endAt?: Date | null,
): Promise<void> {
  const reducer = conn().reducers.managerSetPunchWindow;
  if (typeof reducer !== "function") {
    throw new Error('Reducer "managerSetPunchWindow" is not available. Run `spacetime publish` + `spacetime generate`.');
  }
  return reducer({
    organizationId: orgId(),
    memberId,
    dayStartAt: Timestamp.fromDate(dayStartAt),
    dayEndAt: Timestamp.fromDate(dayEndAt),
    startAt: Timestamp.fromDate(startAt),
    endAt: endAt ? Timestamp.fromDate(endAt) : undefined,
  });
}

// ─── Store Devices ───────────────────────────────────────────────────────────

export async function registerStoreDevice(deviceId: string, name: string): Promise<void> {
  const c = conn();
  if (!c.reducers.registerDevice) return;
  return c.reducers.registerDevice({ organizationId: orgId(), deviceId, name });
}

export async function updateStoreDevice(deviceId: string, data: { name?: string; enabled?: boolean }): Promise<void> {
  const c = conn();
  if (!c.reducers.updateStoreDevice) return;
  return c.reducers.updateStoreDevice({
    organizationId: orgId(),
    deviceId,
    name: data.name ?? undefined,
    enabled: data.enabled ?? undefined,
  });
}

export async function removeStoreDevice(deviceId: string): Promise<void> {
  const c = conn();
  if (!c.reducers.removeStoreDevice) return;
  return c.reducers.removeStoreDevice({ organizationId: orgId(), deviceId });
}

// ─── Notifications ──────────────────────────────────────────────────────────

export async function markNotificationRead(notificationId: string): Promise<void> {
  return conn().reducers.markNotificationRead({ notificationId });
}

export async function markAllNotificationsRead(): Promise<void> {
  return conn().reducers.markAllNotificationsRead({ organizationId: orgId() });
}

export async function dismissNotification(notificationId: string): Promise<void> {
  return conn().reducers.dismissNotification({ notificationId });
}

export async function createNotification(data: {
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  const c = conn();
  await c.reducers.createNotification({
    organizationId: orgId(),
    targetIdentity: c.identity,
    type: data.type,
    title: data.title,
    body: data.body,
    link: data.link ?? null,
  });
  // Fire-and-forget push fan-out to the target's other devices.
  // Reads subscriptions from the local SpacetimeDB cache for the current user.
  // Failures shouldn't surface — the in-app notification was already persisted.
  void fanOutPush(data);
}

// Reads push_subscription rows for the current identity in the active org and
// posts them to the /api/push/send route. Best-effort.
async function fanOutPush(data: {
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  try {
    const c = conn();
    const oid = orgId();
    const me = c.identity.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = Array.from((c as any).db.pushSubscription.iter());
    const subscriptions = rows
      .filter((r) => r.organizationId === oid && r.targetId.toString() === me)
      .map((r) => ({
        endpoint: r.endpoint as string,
        p256dh: r.p256Dh as string,
        auth: r.auth as string,
      }));
    if (subscriptions.length === 0) return;

    const res = await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptions,
        type: data.type,
        title: data.title,
        body: data.body,
        link: data.link ?? null,
      }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { expired?: string[] };
    // Clean up any endpoints the push service reported as gone.
    if (Array.isArray(json.expired)) {
      await Promise.all(
        json.expired.map((endpoint) =>
          deletePushSubscription(endpoint).catch(() => {})
        )
      );
    }
  } catch {
    // best-effort
  }
}

// ─── Push Subscriptions ─────────────────────────────────────────────────────

export async function savePushSubscription(args: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<void> {
  return conn().reducers.savePushSubscription({
    organizationId: orgId(),
    endpoint: args.endpoint,
    p256Dh: args.p256dh,
    auth: args.auth,
    userAgent: args.userAgent ?? null,
  });
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  return conn().reducers.deletePushSubscription({
    organizationId: orgId(),
    endpoint,
  });
}

// ─── Waste Log ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addWasteLog(data: any): Promise<void> {
  return offlineAware("addWasteLog", { organizationId: orgId(), ...data, ...operatorArgs() });
}

export async function deleteWasteLog(wasteLogId: string): Promise<void> {
  return offlineAware("deleteWasteLog", { organizationId: orgId(), wasteLogId });
}

// ─── Locations ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addLocation(data: any): Promise<void> {
  return conn().reducers.addLocation({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateLocation(locationId: string, data: any): Promise<void> {
  return conn().reducers.updateLocation({ organizationId: orgId(), locationId, ...data });
}

export async function deleteLocation(locationId: string): Promise<void> {
  return conn().reducers.deleteLocation({ organizationId: orgId(), locationId });
}

// ─── Sales records ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addSalesRecord(data: any): Promise<void> {
  return offlineAware("addSalesRecord", { organizationId: orgId(), ...data });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addSupplier(data: any): Promise<void> {
  return offlineAware("addSupplier", { organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateSupplier(supplierId: string, data: any): Promise<void> {
  return offlineAware("updateSupplier", { organizationId: orgId(), supplierId, ...data });
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  return offlineAware("deleteSupplier", { organizationId: orgId(), supplierId });
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPurchaseOrder(data: any): Promise<void> {
  return offlineAware("createPurchaseOrder", { organizationId: orgId(), ...data });
}

export async function updatePurchaseOrderStatus(orderId: string, status: string): Promise<void> {
  return offlineAware("updatePurchaseOrderStatus", { organizationId: orgId(), orderId, status });
}

// Record a supplier purchase order placed by Mr. Merchiva. Written over the
// live WebSocket connection (NOT the server route) so it always uses the
// active, authenticated session. The server-side HTTP RPC path was failing
// with "Invalid token: ExpiredSignature" on long sessions because it reused a
// stale localStorage token; the order route now only sends the email.
export async function recordSupplierOrder(data: {
  supplierId: string;
  supplierName: string;
  items: string; // JSON-encoded line items, matching what was emailed
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  summary: string;
  emailed: boolean;
}): Promise<void> {
  return offlineAware("recordSupplierOrder", {
    organizationId: orgId(),
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    items: data.items,
    subtotal: data.subtotal,
    tax: data.tax,
    total: data.total,
    notes: data.notes ?? null,
    summary: data.summary,
    emailed: data.emailed,
  });
}

// ─── Expenses ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addExpense(data: any): Promise<void> {
  return offlineAware("addExpense", { organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateExpense(expenseId: string, data: any): Promise<void> {
  return offlineAware("updateExpense", { organizationId: orgId(), expenseId, ...data });
}

export async function deleteExpense(expenseId: string): Promise<void> {
  return offlineAware("deleteExpense", { organizationId: orgId(), expenseId });
}

// ─── Coupons ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addCoupon(data: any): Promise<void> {
  return conn().reducers.addCoupon({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateCoupon(couponId: string, data: any): Promise<void> {
  return conn().reducers.updateCoupon({ organizationId: orgId(), couponId, ...data });
}

export async function deleteCoupon(couponId: string): Promise<void> {
  return conn().reducers.deleteCoupon({ organizationId: orgId(), couponId });
}

export async function redeemCoupon(couponId: string): Promise<void> {
  return conn().reducers.redeemCoupon({ organizationId: orgId(), couponId });
}

// ─── Queue ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addQueueEntry(data: any): Promise<void> {
  return conn().reducers.addQueueEntry({ organizationId: orgId(), ...data });
}

export async function updateQueueStatus(entryId: string, status: string): Promise<void> {
  return conn().reducers.updateQueueStatus({ organizationId: orgId(), entryId, status });
}

export async function deleteQueueEntry(entryId: string): Promise<void> {
  return conn().reducers.deleteQueueEntry({ organizationId: orgId(), entryId });
}

// ─── AI Chat Sessions ───────────────────────────────────────────────────────

export async function createAiChatSession(title: string): Promise<void> {
  return conn().reducers.createAiChatSession({ organizationId: orgId(), title });
}

export async function saveAiChatSession(
  sessionId: string,
  messages: string,
  title?: string,
  summary?: string,
  archived?: boolean,
): Promise<void> {
  return conn().reducers.saveAiChatSession({
    organizationId: orgId(),
    sessionId,
    messages,
    title: title ?? undefined,
    summary: summary ?? undefined,
    archived: archived ?? undefined,
  });
}

export async function archiveAiChatSession(sessionId: string): Promise<void> {
  return conn().reducers.archiveAiChatSession({ organizationId: orgId(), sessionId });
}

// ─── AI background jobs (server-side generation) ───────────────────────────

export async function consumeAiJob(jobId: string): Promise<void> {
  return conn().reducers.consumeAiJob({ organizationId: orgId(), jobId });
}

export async function deleteAiJob(jobId: string): Promise<void> {
  return conn().reducers.deleteAiJob({ organizationId: orgId(), jobId });
}

// ─── Training: Curriculum Days ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trainingReducer(name: string): ((args: Record<string, any>) => Promise<void>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reducer = (conn().reducers as any)[name];
  if (typeof reducer !== "function") {
    throw new Error(
      `Reducer "${name}" is not available. Run \`spacetime publish\` + \`spacetime generate\` to enable training features.`,
    );
  }
  return reducer;
}

export async function addTrainingDay(data: {
  dayNumber: number;
  title: string;
  description?: string | null;
  sortOrder?: number;
}): Promise<void> {
  return trainingReducer("addTrainingDay")({
    organizationId: orgId(),
    dayNumber: data.dayNumber,
    title: data.title,
    description: data.description ?? undefined,
    sortOrder: data.sortOrder ?? 0,
  });
}

export async function updateTrainingDay(
  dayId: string,
  data: { dayNumber: number; title: string; description?: string | null; sortOrder?: number },
): Promise<void> {
  return trainingReducer("updateTrainingDay")({
    organizationId: orgId(),
    dayId,
    dayNumber: data.dayNumber,
    title: data.title,
    description: data.description ?? undefined,
    sortOrder: data.sortOrder ?? 0,
  });
}

export async function deleteTrainingDay(dayId: string): Promise<void> {
  return trainingReducer("deleteTrainingDay")({ organizationId: orgId(), dayId });
}

// ─── Training: Curriculum Objectives ───────────────────────────────────────

export async function addTrainingObjective(data: {
  dayId: string;
  text: string;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | null;
  sortOrder?: number;
}): Promise<void> {
  return trainingReducer("addTrainingObjective")({
    organizationId: orgId(),
    dayId: data.dayId,
    text: data.text,
    mediaUrl: data.mediaUrl ?? undefined,
    mediaType: data.mediaType ?? undefined,
    sortOrder: data.sortOrder ?? 0,
  });
}

export async function updateTrainingObjective(
  objectiveId: string,
  data: {
    text: string;
    mediaUrl?: string | null;
    mediaType?: "image" | "video" | null;
    sortOrder?: number;
  },
): Promise<void> {
  return trainingReducer("updateTrainingObjective")({
    organizationId: orgId(),
    objectiveId,
    text: data.text,
    mediaUrl: data.mediaUrl ?? undefined,
    mediaType: data.mediaType ?? undefined,
    sortOrder: data.sortOrder ?? 0,
  });
}

export async function deleteTrainingObjective(objectiveId: string): Promise<void> {
  return trainingReducer("deleteTrainingObjective")({ organizationId: orgId(), objectiveId });
}

// ─── Training: Grading ──────────────────────────────────────────────────────

export async function gradeTrainingObjective(data: {
  traineeId: string;
  objectiveId: string;
  status: "pass" | "fail";
  comment?: string | null;
}): Promise<void> {
  return trainingReducer("gradeTrainingObjective")({
    organizationId: orgId(),
    traineeId: data.traineeId,
    objectiveId: data.objectiveId,
    status: data.status,
    comment: data.comment ?? undefined,
  });
}

export async function clearTrainingObjectiveGrade(data: {
  traineeId: string;
  objectiveId: string;
}): Promise<void> {
  return trainingReducer("clearTrainingObjectiveGrade")({
    organizationId: orgId(),
    traineeId: data.traineeId,
    objectiveId: data.objectiveId,
  });
}

export async function gradeTrainingDay(data: {
  traineeId: string;
  dayId: string;
  rating: number;
  comment?: string | null;
}): Promise<void> {
  return trainingReducer("gradeTrainingDay")({
    organizationId: orgId(),
    traineeId: data.traineeId,
    dayId: data.dayId,
    rating: Math.max(1, Math.min(5, Math.round(data.rating))),
    comment: data.comment ?? undefined,
  });
}

// ─── Training: Review Requests ─────────────────────────────────────────────

export async function requestTrainingReview(dayId: string): Promise<void> {
  return trainingReducer("requestTrainingReview")({ organizationId: orgId(), dayId });
}

export async function resolveTrainingReview(requestId: string): Promise<void> {
  return trainingReducer("resolveTrainingReview")({ organizationId: orgId(), requestId });
}

// ─── Billing ────────────────────────────────────────────────────────────────

export async function updateOrgSubscription(data: {
  organizationId?: string;
  stripeCustomerId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPriceId?: string | null;
  subscriptionInterval?: "month" | "year" | null;
  currentPeriodEndUnix?: number | null;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reducer = (conn().reducers as any).updateOrgSubscription;
  if (typeof reducer !== "function") {
    throw new Error(
      'Reducer "updateOrgSubscription" is not available. Run `spacetime publish` + `spacetime generate` to enable billing.',
    );
  }
  // SpacetimeDB Timestamp is microsecond-precise. The generated client expects
  // the SDK Timestamp shape, not a native Date.
  const periodEnd =
    data.currentPeriodEndUnix != null && Number.isFinite(data.currentPeriodEndUnix)
      ? new Timestamp(BigInt(Math.trunc(data.currentPeriodEndUnix)) * 1_000_000n)
      : undefined;

  return reducer({
    organizationId: data.organizationId ?? orgId(),
    stripeCustomerId: data.stripeCustomerId ?? undefined,
    subscriptionStatus: data.subscriptionStatus ?? undefined,
    subscriptionPriceId: data.subscriptionPriceId ?? undefined,
    subscriptionInterval: data.subscriptionInterval ?? undefined,
    currentPeriodEnd: periodEnd,
  });
}

// ─── Daily Briefing + Schedule Proposal ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insightsReducer(name: string): ((args: Record<string, any>) => Promise<void>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reducer = (conn().reducers as any)[name];
  if (typeof reducer !== "function") {
    throw new Error(
      `Reducer "${name}" is not available. Run \`spacetime publish\` + \`spacetime generate\` to enable.`,
    );
  }
  return reducer;
}

export async function saveDailyBriefing(data: {
  date: string;
  content: string;
  summary?: string | null;
  generatedBy: string;
  actions?: string | null;
}): Promise<void> {
  return insightsReducer("saveDailyBriefing")({
    organizationId: orgId(),
    date: data.date,
    content: data.content,
    summary: data.summary ?? undefined,
    generatedBy: data.generatedBy,
    actions: data.actions ?? undefined,
  });
}

// ─── Mr. Merchiva autonomy config ───────────────────────────────────────────
//
// Stores a JSON-encoded AutonomyConfig (lib/merchiva/autonomy.ts) on the org's
// settings row. Owner-only, enforced by the reducer. `config` may be an
// AutonomyConfig object or an already-stringified blob.
export async function setAssistantConfig(
  config: unknown,
  organizationId?: string,
): Promise<void> {
  const json = typeof config === "string" ? config : JSON.stringify(config);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).setAssistantConfig({
    organizationId: organizationId ?? orgId(),
    config: json,
  });
}

/** Org-wide list of optional device apps installed from the device App Store. */
export async function setDeviceApps(ids: unknown, organizationId?: string): Promise<void> {
  const targetOrgId = organizationId ?? orgId();
  const json = JSON.stringify(parseDeviceApps(ids));
  const reducers = conn().reducers as Record<string, ((args: unknown) => Promise<void>) | undefined>;
  if (!reducers.setDeviceApps) throw new Error("setDeviceApps reducer is not available yet");
  return reducers.setDeviceApps({ organizationId: targetOrgId, config: json });
}

// ─── Blog Posts ─────────────────────────────────────────────────────────────

export async function createBlogPost(data: {
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImage?: string | null;
  status: "draft" | "published";
  authorName?: string | null;
}): Promise<void> {
  return conn().reducers.createBlogPost({
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    contentMd: data.contentMd,
    coverImage: data.coverImage ?? undefined,
    status: data.status,
    authorName: data.authorName ?? undefined,
  });
}

export async function updateBlogPost(
  postId: string,
  data: {
    slug: string;
    title: string;
    excerpt: string;
    contentMd: string;
    coverImage?: string | null;
    status: "draft" | "published";
  },
): Promise<void> {
  return conn().reducers.updateBlogPost({
    postId,
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    contentMd: data.contentMd,
    coverImage: data.coverImage ?? undefined,
    status: data.status,
  });
}

export async function deleteBlogPost(postId: string): Promise<void> {
  return conn().reducers.deleteBlogPost({ postId });
}

// ─── Admin role management ─────────────────────────────────────────────────

export async function claimFirstAdmin(email: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).claimFirstAdmin({ email });
}

export async function setUserAdmin(targetEmail: string, isAdmin: boolean): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).setUserAdmin({ targetEmail, isAdmin });
}

// Weekly opening hours JSON. Shape (per day, mon..sun):
//   { open: "HH:MM", close: "HH:MM", closed: boolean }
// Null clears the value; otherwise the JSON string is stored verbatim.
export async function updateOpeningHours(data: {
  openingHours?: string | null;
  countryCode?: string | null;
  organizationId?: string;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn().reducers as any).updateOpeningHours({
    organizationId: data.organizationId ?? orgId(),
    openingHours: data.openingHours ?? undefined,
    countryCode: data.countryCode ?? undefined,
  });
}

/**
 * Admin-only: set an org's monthly AI usage quota. Pass null for a limit to
 * leave it unlimited. Calls the setAiUsageQuota reducer (which enforces
 * requireAdmin server-side) over the live connection — admins set this from
 * the /admins area where a SpacetimeDB connection is present.
 */
export async function setAiUsageQuota(
  organizationId: string,
  monthlyTokenLimit: number | null,
  monthlyCostLimit: number | null,
): Promise<void> {
  return conn().reducers.setAiUsageQuota({
    organizationId,
    monthlyTokenLimit: monthlyTokenLimit ?? undefined,
    monthlyCostLimit: monthlyCostLimit ?? undefined,
  });
}

// ─── Device log-in (store device ⇄ personal phone QR handshake) ──────────────
// Backed by the `device_login_request` table. The store device publishes a
// pending nonce (encoded in its QR as
// `merchiva://device-login?org=<orgId>&nonce=<nonce>`), the phone approves it
// as the scanning member (optionally recording a punch), the store device
// consumes the approval after logging the operator in.

export type DeviceLoginIntent = "login" | "punch-in" | "punch-out";

/** Store device: publish a fresh pending request for `nonce` (invalidates the
 *  device's previous pending ones). Expires server-side after 2 minutes. */
export async function createDeviceLoginRequest(deviceId: string, nonce: string): Promise<void> {
  return conn().reducers.createDeviceLoginRequest({ organizationId: orgId(), deviceId, nonce });
}

/** Personal phone: approve the scanned nonce as the calling member. With a
 *  punch intent the server also records that punch for the caller. Throws
 *  when the nonce is unknown, already used or expired. */
export async function approveDeviceLogin(nonce: string, intent: DeviceLoginIntent): Promise<void> {
  return conn().reducers.approveDeviceLogin({ nonce, intent });
}

/** Store device: mark an approved request as consumed after logging the
 *  operator in so it can't be replayed. */
export async function consumeDeviceLogin(requestId: string): Promise<void> {
  return conn().reducers.consumeDeviceLogin({ id: requestId });
}

// ─── Docs ────────────────────────────────────────────────────────────────────
// Collaborative documents (`document*` tables). Calls go straight to the
// reducers and never through `mutationQueue`: that queue replays FIFO and drops
// calls after N attempts, which is wrong for CRDT pushes — SpacetimeYjsProvider
// retries on its own. Reducers fail with `[doc.<code>] …` (lib/docs/errors.ts).
// The imports live with this section so it stays one additive block; module
// imports are hoisted, so their position has no runtime effect.
import { newDocumentId } from "@/lib/docs/ids";
import type { DocGrantRole, DocPageSetup, DocVersionKind, DocVisibility } from "@/lib/docs/types";

function docsReducer(name: string): (args: Record<string, unknown>) => Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reducers = conn().reducers as any;
  const reducer = reducers[name];
  if (typeof reducer !== "function") {
    throw new Error(
      `[doc.not_published] Reducer "${name}" is not available. Run \`spacetime publish\` + \`spacetime generate\` to enable Docs.`,
    );
  }
  return (args) => reducer.call(reducers, args);
}

/** Document / thread ids are lowercase UUIDs on the server. */
function docKey(id: string): string {
  return String(id).trim().toLowerCase();
}

/** u32 reducer args: finite, non-negative integers. */
function docU32(value: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 0xffffffff) : 0;
}

function docMentions(mentions: readonly string[] | undefined): string | undefined {
  if (!mentions || mentions.length === 0) return undefined;
  const ids = [...new Set(mentions.filter((id) => typeof id === "string" && id.length > 0))];
  return ids.length > 0 ? JSON.stringify(ids) : undefined;
}

/** Creates a document and returns its id. New documents default to `org_edit` (plan D40). */
export async function createDocument(input: {
  organizationId?: string;
  documentId?: string;
  title?: string;
  visibility?: DocVisibility;
  templateId?: string | null;
  initialState?: Uint8Array | null;
  html?: string | null;
  plainText?: string | null;
  wordCount?: number;
} = {}): Promise<string> {
  const documentId = docKey(input.documentId ?? newDocumentId());
  await docsReducer("createDocument")({
    organizationId: input.organizationId ?? orgId(),
    documentId,
    title: input.title ?? "",
    visibility: input.visibility ?? "org_edit",
    templateId: input.templateId ?? undefined,
    initialState: input.initialState && input.initialState.byteLength > 0 ? input.initialState : undefined,
    html: input.html ?? undefined,
    plainText: input.plainText ?? undefined,
    wordCount: input.wordCount === undefined || input.wordCount === null ? undefined : docU32(input.wordCount),
  });
  return documentId;
}

/** "Make a copy": the server copies snapshot + update rows; returns the new id. */
export async function duplicateDocument(input: { sourceDocumentId: string; title: string; documentId?: string }): Promise<string> {
  const documentId = docKey(input.documentId ?? newDocumentId());
  await docsReducer("duplicateDocument")({
    sourceDocumentId: docKey(input.sourceDocumentId),
    documentId,
    title: input.title,
  });
  return documentId;
}

export async function renameDocument(documentId: string, title: string): Promise<void> {
  return docsReducer("renameDocument")({ documentId: docKey(documentId), title });
}

/** Omitted fields stay unchanged; `null` clears the icon / page setup. */
export async function updateDocumentMeta(
  documentId: string,
  patch: { excerpt?: string; icon?: string | null; pageSetup?: DocPageSetup | null },
): Promise<void> {
  return docsReducer("updateDocumentMeta")({
    documentId: docKey(documentId),
    excerpt: patch.excerpt,
    icon: patch.icon === undefined ? undefined : (patch.icon ?? ""),
    pageSetup: patch.pageSetup === undefined ? undefined : patch.pageSetup === null ? "" : JSON.stringify(patch.pageSetup),
  });
}

export async function setDocumentVisibility(documentId: string, visibility: DocVisibility): Promise<void> {
  return docsReducer("setDocumentVisibility")({ documentId: docKey(documentId), visibility });
}

export async function grantDocumentAccess(documentId: string, memberId: string, role: DocGrantRole): Promise<void> {
  return docsReducer("grantDocumentAccess")({ documentId: docKey(documentId), memberId, role });
}

export async function revokeDocumentAccess(documentId: string, memberId: string): Promise<void> {
  return docsReducer("revokeDocumentAccess")({ documentId: docKey(documentId), memberId });
}

export async function trashDocument(documentId: string): Promise<void> {
  return docsReducer("trashDocument")({ documentId: docKey(documentId) });
}

export async function restoreDocument(documentId: string): Promise<void> {
  return docsReducer("restoreDocument")({ documentId: docKey(documentId) });
}

/** Only works on a trashed document. */
export async function deleteDocumentForever(documentId: string): Promise<void> {
  return docsReducer("deleteDocumentForever")({ documentId: docKey(documentId) });
}

export async function toggleDocumentStar(documentId: string): Promise<void> {
  return docsReducer("toggleDocumentStar")({ documentId: docKey(documentId) });
}

export async function pushDocumentUpdate(documentId: string, sessionId: string, payload: Uint8Array): Promise<void> {
  return docsReducer("pushDocumentUpdate")({ documentId: docKey(documentId), sessionId, payload });
}

export async function compactDocument(input: {
  documentId: string;
  throughUpdateId: bigint;
  state: Uint8Array;
  html: string;
  plainText: string;
  wordCount: number;
}): Promise<void> {
  return docsReducer("compactDocument")({
    documentId: docKey(input.documentId),
    throughUpdateId: BigInt(input.throughUpdateId),
    state: input.state,
    html: input.html,
    plainText: input.plainText,
    wordCount: docU32(input.wordCount),
  });
}

export async function saveDocumentVersion(input: {
  documentId: string;
  kind: DocVersionKind;
  name?: string;
  state: Uint8Array;
  throughUpdateId: bigint;
  wordCount: number;
}): Promise<void> {
  return docsReducer("saveDocumentVersion")({
    documentId: docKey(input.documentId),
    kind: input.kind,
    name: input.name ?? undefined,
    state: input.state,
    throughUpdateId: BigInt(input.throughUpdateId),
    wordCount: docU32(input.wordCount),
  });
}

/**
 * Naming a version promotes it to `named`; an empty name reverts it (a `restore`
 * version keeps its kind). Clearing the name of a `named` version needs its
 * creator or a document manager, like deleting it, because it re-enters
 * autosave pruning.
 */
export async function renameDocumentVersion(documentId: string, versionId: string, name: string): Promise<void> {
  return docsReducer("renameDocumentVersion")({ documentId: docKey(documentId), versionId, name });
}

export async function deleteDocumentVersion(documentId: string, versionId: string): Promise<void> {
  return docsReducer("deleteDocumentVersion")({ documentId: docKey(documentId), versionId });
}

export async function upsertDocumentPresence(input: {
  documentId: string;
  yClientId: number;
  name: string;
  color: string;
  awareness: Uint8Array;
}): Promise<void> {
  return docsReducer("upsertDocumentPresence")({
    documentId: docKey(input.documentId),
    yClientId: docU32(input.yClientId),
    name: input.name,
    color: input.color,
    awareness: input.awareness,
  });
}

export async function removeDocumentPresence(documentId: string, yClientId: number): Promise<void> {
  return docsReducer("removeDocumentPresence")({ documentId: docKey(documentId), yClientId: docU32(yClientId) });
}

/**
 * Starts a thread; `threadId` is the client UUID also stored on the comment mark. `anchor` is the selection as encoded
 * Yjs relative positions (`encodeCommentAnchor` in lib/docs/comment-anchors.ts, at most 1024 bytes), the only anchor a
 * commenter can write.
 */
export async function addDocumentComment(input: {
  documentId: string;
  threadId: string;
  body: string;
  quotedText?: string;
  mentions?: string[];
  anchor?: Uint8Array;
}): Promise<void> {
  return docsReducer("addDocumentComment")({
    documentId: docKey(input.documentId),
    threadId: docKey(input.threadId),
    body: input.body,
    quotedText: input.quotedText || undefined,
    mentions: docMentions(input.mentions),
    anchor: input.anchor && input.anchor.byteLength > 0 ? input.anchor : undefined,
  });
}

/** Replying to a resolved thread reopens it. */
export async function replyDocumentComment(input: {
  documentId: string;
  threadId: string;
  body: string;
  mentions?: string[];
}): Promise<void> {
  return docsReducer("replyDocumentComment")({
    documentId: docKey(input.documentId),
    threadId: docKey(input.threadId),
    body: input.body,
    mentions: docMentions(input.mentions),
  });
}

export async function editDocumentComment(documentId: string, commentId: string, body: string): Promise<void> {
  return docsReducer("editDocumentComment")({ documentId: docKey(documentId), commentId, body });
}

/** Thread roots only. */
export async function resolveDocumentComment(documentId: string, commentId: string, resolved: boolean): Promise<void> {
  return docsReducer("resolveDocumentComment")({ documentId: docKey(documentId), commentId, resolved });
}

/** Deleting a thread root deletes the whole thread. */
export async function deleteDocumentComment(documentId: string, commentId: string): Promise<void> {
  return docsReducer("deleteDocumentComment")({ documentId: docKey(documentId), commentId });
}

// ─── Punch-in codes (server-side verification) ───────────────────────────────
//
// Punch-in PINs moved out of `org_member` into `member_punch_code`, whose RLS
// rule is `userId = :sender` — a client can read its own code and nobody
// else's. The three flows that used to compare PINs in the browser (device
// unlock, manager exit-kiosk, "do I have a PIN set") now go through the module.

/**
 * Resolve a PIN to the member standing at the shared store tablet. On success
 * the module writes the answer to `device_operator_session` for this identity;
 * read it with `useDeviceOperatorSession()`. Rejects on an unknown PIN.
 */
export async function resolveDeviceOperator(code: string): Promise<void> {
  return conn().reducers.resolveDeviceOperator({ organizationId: orgId(), code });
}

/** Forget the resolved operator (device re-lock / sign-out). */
export async function clearDeviceOperator(): Promise<void> {
  return conn().reducers.clearDeviceOperator({});
}

/**
 * Check that a PIN belongs to an active owner/manager of this org — used by the
 * "leave kiosk mode" gate. Resolves on success, rejects on a bad PIN; the PIN
 * itself never reaches the browser.
 */
export async function verifyManagerPin(code: string): Promise<void> {
  return conn().reducers.verifyManagerPin({ organizationId: orgId(), code });
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

/**
 * One-shot backfill for the row-level-security rollout: mirrors the org uuid
 * into `orgIdText`/`rootOrgId`, stamps `site_booking.organizationId`, and moves
 * password hashes, POS tokens and punch PINs into tables clients cannot read.
 * Idempotent. Owner/service only.
 */
export async function migrateSecurityV1(): Promise<void> {
  return conn().reducers.migrateSecurityV1({});
}

/**
 * Delete append-only history older than `keepDays` for the active org.
 * `dryRun` counts without deleting. Owner/service only; refuses < 30 days.
 */
export async function pruneOrgHistory(keepDays: number, dryRun = true): Promise<void> {
  return conn().reducers.pruneOrgHistory({ organizationId: orgId(), keepDays, dryRun });
}
