// SpacetimeDB React hooks — generated bindings for all 33 public tables.
// Use these in any client component inside <SpacetimeProvider>.

import { useTable } from "spacetimedb/react";
import { tables } from "./generated";

export { useSpacetimeDB } from "spacetimedb/react";
export { useTable } from "spacetimedb/react";
export { useReducer as useStdbReducer } from "spacetimedb/react";
export { reducers } from "./generated";

// ── Auth / Org ───────────────────────────────────────────────────────────────
export function useUsers()            { return useTable(tables.user); }
export function useOrganizations()    { return useTable(tables.organization); }
export function useOrgMembers()       { return useTable(tables.orgMember); }
export function useOrgInvitations()   { return useTable(tables.orgInvitation); }

// ── Inventory ────────────────────────────────────────────────────────────────
export function useInventoryItems()        { return useTable(tables.inventoryItem); }
export function useInventoryTransactions() { return useTable(tables.inventoryTransaction); }

// ── Sales ────────────────────────────────────────────────────────────────────
export function useSalesRecords() { return useTable(tables.salesRecord); }

// ── Products ─────────────────────────────────────────────────────────────────
export function useProducts() { return useTable(tables.product); }

// ── Settings ─────────────────────────────────────────────────────────────────
export function useSettingsRows() { return useTable(tables.settings); }

// ── Staffing ─────────────────────────────────────────────────────────────────
export function useStaffMembers()      { return useTable(tables.staffMember); }
export function useStaffRoles()        { return useTable(tables.staffRole); }
export function useShifts()            { return useTable(tables.shift); }
export function useShiftPresets()      { return useTable(tables.shiftPreset); }
export function useShiftTrades()       { return useTable(tables.shiftTrade); }
export function useStaffAvailability() { return useTable(tables.staffAvailability); }
export function useTimeOffRequests()   { return useTable(tables.timeOffRequest); }
export function useRoleTasks()         { return useTable(tables.roleTask); }

// ── Payments ─────────────────────────────────────────────────────────────────
export function usePayments() { return useTable(tables.payment); }

// ── Chat ─────────────────────────────────────────────────────────────────────
export function useChatConversations() { return useTable(tables.chatConversation); }
export function useChatMembers()       { return useTable(tables.chatMember); }
export function useChatMessages()      { return useTable(tables.chatMessage); }

// ── Sites / Builder ──────────────────────────────────────────────────────────
export function useSites()           { return useTable(tables.site); }
export function useSitePages()       { return useTable(tables.sitePage); }
export function useSiteComponents()  { return useTable(tables.siteComponent); }
export function useSiteCustomers()   { return useTable(tables.siteCustomer); }
export function useSiteOrders()      { return useTable(tables.siteOrder); }
export function useSiteBookings()    { return useTable(tables.siteBooking); }
export function useSiteMemberships() { return useTable(tables.siteMembership); }

// ── Membership / Loyalty ─────────────────────────────────────────────────────
export function useMembershipTiers()  { return useTable(tables.membershipTier); }
export function useMembershipPerks()  { return useTable(tables.membershipPerk); }
export function usePerkClaims()       { return useTable(tables.perkClaim); }
export function useCustomerPoints()   { return useTable(tables.customerPoints); }

// ── Todos ────────────────────────────────────────────────────────────────────
export function useTodos() { return useTable(tables.todo); }

// ── Notifications ───────────────────────────────────────────────────────────
export function useNotifications() { return useTable(tables.notification); }

// ── Waste Log ───────────────────────────────────────────────────────────────
export function useWasteLogs() { return useTable(tables.wasteLog); }

// ── Locations ───────────────────────────────────────────────────────────────
export function useLocations() { return useTable(tables.location); }

// ── Suppliers ───────────────────────────────────────────────────────────────
export function useSuppliers() { return useTable(tables.supplier); }

// ── Purchase Orders ─────────────────────────────────────────────────────────
export function usePurchaseOrders() { return useTable(tables.purchaseOrder); }

// ── Expenses ────────────────────────────────────────────────────────────────
export function useExpenses() { return useTable(tables.expense); }

// ── Coupons ─────────────────────────────────────────────────────────────────
export function useCoupons() { return useTable(tables.coupon); }

// ── Queue ───────────────────────────────────────────────────────────────────
export function useQueueEntries() { return useTable(tables.queueEntry); }

// ── AI Chat History ─────────────────────────────────────────────────────────
export function useAiChatHistory() { return useTable(tables.aiChatHistory); }
export function useAiChatSessions() { return useTable(tables.aiChatSession); }

// Background AI jobs (server-side generation via /api/store-ai/enqueue).
// Subscription is org-wide; consumers filter by sessionId locally.
export function useAiJobs() { return useTable(tables.aiJob); }

// ── Training ────────────────────────────────────────────────────────────────
// Returns the same [rows, ready] tuple shape as the other hooks. Until the
// SpacetimeDB bindings are regenerated (`spacetime generate`) the underlying
// tables will be undefined on the `tables` object — in that case we return
// a stable empty tuple so the UI renders gracefully instead of crashing.
const EMPTY_TABLE_RESULT: readonly [unknown[], boolean] = Object.freeze([
  Object.freeze([]) as unknown as unknown[],
  false,
]);

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/rules-of-hooks */
export function useTrainingDays() {
  const tbl = (tables as any).trainingDay;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
export function useTrainingObjectives() {
  const tbl = (tables as any).trainingObjective;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
export function useTrainingObjectiveGrades() {
  const tbl = (tables as any).trainingObjectiveGrade;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
export function useTrainingDayGrades() {
  const tbl = (tables as any).trainingDayGrade;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
export function useTrainingFinalGrades() {
  const tbl = (tables as any).trainingFinalGrade;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}

// ── Daily Briefing + Schedule Proposal ──────────────────────────────────────
export function useDailyBriefings() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (tables as any).dailyBriefing;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
export function useScheduleProposals() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (tables as any).scheduleProposal;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
/* eslint-enable */
