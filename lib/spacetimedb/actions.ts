/**
 * SpacetimeDB write actions — replaces lib/db/*.ts for all mutations.
 *
 * Reads are handled by SpacetimeDB subscription hooks (useInventory, useProducts, etc.)
 * or will be migrated to hooks in a follow-up. This file only covers writes.
 */

import { getConnection, getActiveOrgId } from "./client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function conn(): any {
  const c = getConnection();
  if (!c) throw new Error("Not connected to SpacetimeDB");
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
  return conn().reducers.addProduct({ organizationId: orgId(), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateProduct(productId: string, data: any): Promise<void> {
  return conn().reducers.updateProduct({ organizationId: orgId(), productId, ...data });
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

// ─── Staffing: Role Tasks (no reducer — stub) ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRoleTasks(_roleId: string): Promise<any[]> { return []; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addRoleTask(_data: any): Promise<void> { console.warn("[SpacetimeDB] addRoleTask not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateRoleTask(_id: string, _data: any): Promise<void> { console.warn("[SpacetimeDB] updateRoleTask not yet implemented"); }
export async function deleteRoleTask(_id: string): Promise<void> { console.warn("[SpacetimeDB] deleteRoleTask not yet implemented"); }

// ─── Shift Presets (no reducer — stub) ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getShiftPresets(_orgId?: string): Promise<any[]> { return []; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addShiftPreset(_orgId: string, _data: any): Promise<void> { console.warn("[SpacetimeDB] addShiftPreset not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateShiftPreset(_id: string, _data: any): Promise<void> { console.warn("[SpacetimeDB] updateShiftPreset not yet implemented"); }
export async function deleteShiftPreset(_id: string): Promise<void> { console.warn("[SpacetimeDB] deleteShiftPreset not yet implemented"); }

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
  console.warn("[SpacetimeDB] disconnectClover not yet implemented");
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

export async function deletePage(_id: string): Promise<void> {
  console.warn("[SpacetimeDB] deletePage not yet implemented");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveComponent(_data: any): Promise<void> {
  console.warn("[SpacetimeDB] saveComponent not yet implemented");
}

export async function deleteComponent(_id: string): Promise<void> {
  console.warn("[SpacetimeDB] deleteComponent not yet implemented");
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

export async function addMembersToConversation(_convId: string, _userIds: string[]): Promise<void> {
  console.warn("[SpacetimeDB] addMembersToConversation not yet implemented");
}

export async function addReaction(_messageId: string, _emoji: string): Promise<void> {
  console.warn("[SpacetimeDB] addReaction not yet implemented");
}

export async function removeReaction(_messageId: string, _emoji: string): Promise<void> {
  console.warn("[SpacetimeDB] removeReaction not yet implemented");
}

export async function deleteMessage(_messageId: string): Promise<void> {
  console.warn("[SpacetimeDB] deleteMessage not yet implemented");
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

// Membership stubs (no reducers yet)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateTier(_id: string, _data: any): Promise<void> { console.warn("[SpacetimeDB] updateTier not yet implemented"); }
export async function deleteTier(_id: string): Promise<void> { console.warn("[SpacetimeDB] deleteTier not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPerk(data: any): Promise<void> {
  return conn().reducers.addPerk({ organizationId: orgId(), ...data });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePerk(_id: string, _data: any): Promise<void> { console.warn("[SpacetimeDB] updatePerk not yet implemented"); }
export async function deletePerk(_id: string): Promise<void> { console.warn("[SpacetimeDB] deletePerk not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loginCustomer(_data: any): Promise<void> { console.warn("[SpacetimeDB] loginCustomer not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assignTier(_data: any): Promise<void> { console.warn("[SpacetimeDB] assignTier not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createOrder(_data: any): Promise<void> { console.warn("[SpacetimeDB] createOrder not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createBooking(_data: any): Promise<void> { console.warn("[SpacetimeDB] createBooking not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateOrderStatus(_id: string, _status: string): Promise<void> { console.warn("[SpacetimeDB] updateOrderStatus not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateBookingStatus(_id: string, _status: string): Promise<void> { console.warn("[SpacetimeDB] updateBookingStatus not yet implemented"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function redeemPoints(_data: any): Promise<void> { console.warn("[SpacetimeDB] redeemPoints not yet implemented"); }

// ─── Team / Org ───────────────────────────────────────────────────────────────

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cancelInvitation(_id: string): Promise<void> {
  console.warn("[SpacetimeDB] cancelInvitation not yet implemented");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateProfile(data: any): Promise<void> {
  return conn().reducers.updateProfile(data);
}

// ─── Todos (no reducer — stub) ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTodos(_userId?: string, _orgId?: string): Promise<any[]> { return []; }
export async function addTodo(_userId: string, _orgId: string, _title: string): Promise<void> { console.warn("[SpacetimeDB] addTodo not yet implemented"); }
export async function toggleTodo(_id: string, _completed: boolean): Promise<void> { console.warn("[SpacetimeDB] toggleTodo not yet implemented"); }
export async function deleteTodo(_id: string): Promise<void> { console.warn("[SpacetimeDB] deleteTodo not yet implemented"); }

// ─── Sales records ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addSalesRecord(data: any): Promise<void> {
  return conn().reducers.addSalesRecord({ organizationId: orgId(), ...data });
}
