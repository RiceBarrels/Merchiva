/**
 * SpacetimeDB write actions — replaces lib/db/*.ts for all mutations.
 *
 * Reads are handled by SpacetimeDB subscription hooks (useInventory, useProducts, etc.)
 * or will be migrated to hooks in a follow-up. This file only covers writes.
 */

import { getConnection, getActiveOrgId } from "./client";
import { getDictionary, lookup } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import type { RoleTask, ShiftPreset } from "@/lib/types";

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

// ─── Inventory ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addInventoryItem(data: any, _userId?: string): Promise<void> {
  return conn().reducers.addInventoryItem({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateInventoryItem(itemId: string, data: any): Promise<void> {
  return conn().reducers.updateInventoryItem({ organizationId: orgId(), itemId, ...data });
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  return conn().reducers.deleteInventoryItem({ organizationId: orgId(), itemId });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addInventoryTransaction(data: any): Promise<void> {
  return conn().reducers.addInventoryTransaction({ organizationId: orgId(), ...data });
}

// ─── Products ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addProduct(data: any, _userId?: string): Promise<void> {
  return conn().reducers.addProduct({
    organizationId: orgId(),
    name: data.name,
    category: data.category,
    price: data.price ?? 0,
    cost: data.cost ?? 0,
    imageUrl: data.imageUrl ?? null,
    description: data.description ?? null,
    nameI18n: data.nameI18n ? JSON.stringify(data.nameI18n) : null,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateProduct(productId: string, data: any): Promise<void> {
  const payload = { ...data };
  if (payload.nameI18n && typeof payload.nameI18n !== "string") {
    payload.nameI18n = JSON.stringify(payload.nameI18n);
  }
  return conn().reducers.updateProduct({ organizationId: orgId(), productId, ...payload });
}

export async function deleteProduct(productId: string): Promise<void> {
  return conn().reducers.deleteProduct({ organizationId: orgId(), productId });
}

// ─── Staffing: Shifts ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addShift(data: any, _userId?: string, _orgIdParam?: string): Promise<void> {
  return conn().reducers.addShift({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateShift(shiftId: string, data: any): Promise<void> {
  return conn().reducers.updateShift({ organizationId: orgId(), shiftId, ...data });
}

export async function deleteShift(shiftId: string): Promise<void> {
  return conn().reducers.deleteShift({ organizationId: orgId(), shiftId });
}

// ─── Staffing: Staff Roles ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addStaffRole(data: any, _userId?: string, _orgIdParam?: string): Promise<void> {
  return conn().reducers.addStaffRole({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateStaffRole(roleId: string, data: any): Promise<void> {
  return conn().reducers.updateStaffRole({ organizationId: orgId(), roleId, ...data });
}

export async function deleteStaffRole(roleId: string): Promise<void> {
  return conn().reducers.deleteStaffRole({ organizationId: orgId(), roleId });
}

// ─── Staffing: Staff Members ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addStaffMember(data: any): Promise<void> {
  return conn().reducers.addStaffMember({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateStaffMember(staffMemberId: string, data: any): Promise<void> {
  return conn().reducers.updateStaffMember({ organizationId: orgId(), staffMemberId, ...data });
}

export async function deleteStaffMember(staffMemberId: string): Promise<void> {
  return conn().reducers.deleteStaffMember({ organizationId: orgId(), staffMemberId });
}

// ─── Staffing: Role Tasks (read from SpacetimeDB table, no write reducers yet)

export async function getRoleTasks(roleId: string): Promise<RoleTask[]> {
  const c = getConnection();
  if (!c) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (c as any).db.roleTask.iter().filter((r: any) => r.roleId === roleId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Array.from(rows).map((r: any) => ({
    id: r.id.toString(),
    roleId: r.roleId,
    organizationId: r.organizationId ?? null,
    title: r.title,
    description: r.description,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    sortOrder: r.sortOrder,
    requiresEvidence: r.requiresEvidence,
    notifyChats: r.notifyChats,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addRoleTask(data: any): Promise<void> {
  return conn().reducers.addRoleTask({
    organizationId: orgId(),
    roleId: data.roleId,
    title: data.title,
    description: data.description,
    startTime: data.startTime ?? undefined,
    endTime: data.endTime ?? undefined,
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
  return conn().reducers.createConversation({ organizationId, type, name: name ?? "", memberUserIds });
}

export async function sendMessage(conversationId: string, content: string, _replyToId?: string, _attachment?: unknown): Promise<void> {
  return conn().reducers.sendMessage({ conversationId, content });
}

export async function addMembersToConversation(convId: string, userIds: string[]): Promise<void> {
  return conn().reducers.addMembersToConversation({ conversationId: convId, userIds: JSON.stringify(userIds) });
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

export async function createOrg(name: string): Promise<void> {
  return conn().reducers.createOrg({ name });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function inviteToOrg(data: any): Promise<void> {
  return conn().reducers.inviteToOrg({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateMember(memberId: string, data: any): Promise<void> {
  return conn().reducers.updateMemberPermissions({ organizationId: orgId(), memberId, ...data });
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

export async function acceptInvitation(token: string): Promise<void> {
  return conn().reducers.acceptInvitation({ token });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateProfile(data: any): Promise<void> {
  return conn().reducers.updateProfile(data);
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

// ─── Waste Log ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addWasteLog(data: any): Promise<void> {
  return conn().reducers.addWasteLog({ organizationId: orgId(), ...data });
}

export async function deleteWasteLog(wasteLogId: string): Promise<void> {
  return conn().reducers.deleteWasteLog({ organizationId: orgId(), wasteLogId });
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
  return conn().reducers.addSalesRecord({ organizationId: orgId(), ...data });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addSupplier(data: any): Promise<void> {
  return conn().reducers.addSupplier({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateSupplier(supplierId: string, data: any): Promise<void> {
  return conn().reducers.updateSupplier({ organizationId: orgId(), supplierId, ...data });
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  return conn().reducers.deleteSupplier({ organizationId: orgId(), supplierId });
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPurchaseOrder(data: any): Promise<void> {
  return conn().reducers.createPurchaseOrder({ organizationId: orgId(), ...data });
}

export async function updatePurchaseOrderStatus(orderId: string, status: string): Promise<void> {
  return conn().reducers.updatePurchaseOrderStatus({ organizationId: orgId(), orderId, status });
}

// ─── Expenses ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addExpense(data: any): Promise<void> {
  return conn().reducers.addExpense({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateExpense(expenseId: string, data: any): Promise<void> {
  return conn().reducers.updateExpense({ organizationId: orgId(), expenseId, ...data });
}

export async function deleteExpense(expenseId: string): Promise<void> {
  return conn().reducers.deleteExpense({ organizationId: orgId(), expenseId });
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
