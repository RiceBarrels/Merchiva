// SpacetimeDB React hooks — generated bindings for all 33 public tables.
// Use these in any client component inside <SpacetimeProvider>.

import { useState } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "./generated";
import type { ChatFollow, NotificationDelivery, NotificationPref, PagePresence } from "./generated/types";

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
// Product rows are now retail-enabled inventory items.
export function useProducts() { return useTable(tables.inventoryItem); }

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
// roleTaskAssignment is a NEW table — until the SpacetimeDB module is
// republished and `spacetime generate` regenerates the bindings, `tables`
// won't have it. We always call the same number of hooks (rules-of-hooks),
// but pass a `null`-tolerant table reference so useTable just returns [].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __maybeRoleTaskAssignmentTable: any =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tables as any).roleTaskAssignment ?? { __missing: true, schema: { name: "role_task_assignment" } };
export function useRoleTaskAssignments() {
  const result = useTable(__maybeRoleTaskAssignmentTable);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((__maybeRoleTaskAssignmentTable as any).__missing) {
    return [[] as unknown[], false] as ReturnType<typeof useTable>;
  }
  return result;
}

// ── Payments ─────────────────────────────────────────────────────────────────
export function usePayments() { return useTable(tables.payment); }

// ── Chat ─────────────────────────────────────────────────────────────────────
export function useChatConversations() { return useTable(tables.chatConversation); }
export function useChatMembers()       { return useTable(tables.chatMember); }
export function useChatMessages()      { return useTable(tables.chatMessage); }

// ── Sites ────────────────────────────────────────────────────────────────────
// Bookings is the only surviving site_* surface. The website-builder and
// loyalty tables are `public: false` now (they hold customer PII and had no
// RLS rule), so they are not in the client bindings at all, and the hooks that
// wrapped them had no callers left.
export function useSites()           { return useTable(tables.site); }
export function useSiteComponents()  { return useTable(tables.siteComponent); }
export function useSiteBookings()    { return useTable(tables.siteBooking); }

// ── Todos ────────────────────────────────────────────────────────────────────
export function useTodos() { return useTable(tables.todo); }

// ── Notifications ───────────────────────────────────────────────────────────
// Entry points never read these: they ask lib/notifications/dots-context.tsx.
export function useNotifications() { return useTable(tables.notification); }

// ── Waste Log ───────────────────────────────────────────────────────────────
export function useWasteLogs() { return useTable(tables.wasteLog); }

// ── Locations ───────────────────────────────────────────────────────────────
export function useLocations() { return useTable(tables.location); }

// ── Suppliers ───────────────────────────────────────────────────────────────
export function useSuppliers() { return useTable(tables.supplier); }
export function useSupplierMessages() { return useTable(tables.supplierMessage); }

// ── Purchase Orders ─────────────────────────────────────────────────────────
export function usePurchaseOrders() { return useTable(tables.purchaseOrder); }

// ── Expenses ────────────────────────────────────────────────────────────────
export function useExpenses() { return useTable(tables.expense); }

// ── Coupons ─────────────────────────────────────────────────────────────────
export function useCoupons() { return useTable(tables.coupon); }

// ── Queue ───────────────────────────────────────────────────────────────────
export function useQueueEntries() { return useTable(tables.queueEntry); }

// ── AI Chat Sessions ────────────────────────────────────────────────────────
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
export function useTrainingReviewRequests() {
  const tbl = (tables as any).trainingReviewRequest;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}

// ── Blog Posts ─────────────────────────────────────────────────────────────
export function useBlogPosts() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (tables as any).blogPost;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}

// ── Daily Briefing ───────────────────────────────────────────────────────────
export function useDailyBriefings() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (tables as any).dailyBriefing;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}

// ── Punch / Attendance ───────────────────────────────────────────────────────
// Clock in/out/break events (one row per punch). Used by the punch-in terminal
// and the morning briefing's "today's attendance" view.
export function usePunchEvents() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (tables as any).punchEvent;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
/* eslint-enable */

// ── Built-in notifications (spacetimedb/src/notify/tables.ts) ───────────────
// Delivery state, the email switch + email locale, and person follows (特别关注).
// All three are RLS self-scoped. Guarded like the training tables: bindings
// without them return EMPTY_TABLE_RESULT; against a module that predates them the
// subscription is rejected and `ready` stays false, which is how callers tell the
// module has not been published yet (lib/spacetimedb/provider.tsx notifySubscriptions).
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/rules-of-hooks */
export function useNotificationDeliveries(): [readonly NotificationDelivery[], boolean] {
  const tbl = (tables as any).notificationDelivery;
  return (tbl ? useTable(tbl) : EMPTY_TABLE_RESULT) as unknown as [readonly NotificationDelivery[], boolean];
}
export function useNotificationPrefs(): [readonly NotificationPref[], boolean] {
  const tbl = (tables as any).notificationPref;
  return (tbl ? useTable(tbl) : EMPTY_TABLE_RESULT) as unknown as [readonly NotificationPref[], boolean];
}
export function useChatFollows(): [readonly ChatFollow[], boolean] {
  const tbl = (tables as any).chatFollow;
  return (tbl ? useTable(tbl) : EMPTY_TABLE_RESULT) as unknown as [readonly ChatFollow[], boolean];
}
/* eslint-enable */

// ── Bug reports ─────────────────────────────────────────────────────────────
// Reports about Merchiva itself, filed from any of the three surfaces. Guarded
// like the training tables above: a browser holding an older bundle, or a
// deployment behind the current module, gets EMPTY_TABLE_RESULT rather than a
// crash on an undefined table.
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/rules-of-hooks */
export function useBugReports() {
  const tbl = (tables as any).bugReport;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
/* eslint-enable */

// ── Docs ────────────────────────────────────────────────────────────────────
// New document* tables. Until `spacetime generate` runs `tables.document` is
// undefined → EMPTY_TABLE_RESULT (same pattern as training above). Always scoped
// with a WHERE so the client never downloads other orgs' docs. The heavy per-doc
// tables (update/snapshot/presence) are subscribed by SpacetimeYjsProvider, not here.
// Domain hooks with mapping + access rules: lib/spacetimedb/hooks/useDocs.ts.
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/rules-of-hooks */
const __docTables = tables as any;
/** Nothing to subscribe (no scope, or disabled): no rows and nothing to wait for, like a disabled useTable. */
const SCOPED_DISABLED = Object.freeze([Object.freeze([]), true]) as unknown as [unknown[], boolean];
interface ScopedPhase {
  /** The scope the last render subscribed to (null: none). */
  scope: string | null;
  /** useTable is passed one disabled render before the new query, which resets its `applied` flag. */
  resetting: boolean;
  /** What useTable returned when this phase began: the previous query's snapshot, which never counts. */
  stale: unknown;
}
/**
 * spacetimedb/react useTable keeps its snapshot in a ref that only an effect clears, so on the render where the
 * query or `enabled` changes it still returns the previous snapshot (`[[], true]` after a disabled one, the old
 * scope's rows otherwise), and a query change while enabled never resets its `applied` flag
 * (node_modules/spacetimedb/dist/react/index.mjs). So the tuple returned when a phase begins never counts, and a
 * re-scope while subscribed goes through one disabled render first: ready means this scope's subscription applied.
 */
function useScopedDocTable(accessor: string, column: string, value: string | null, enabled = true) {
  const tbl = __docTables[accessor];
  if (!tbl) return EMPTY_TABLE_RESULT as unknown as [unknown[], boolean];
  const scope = enabled && value ? value : null;
  const [phase, setPhase] = useState<ScopedPhase>(() => ({ scope, resetting: false, stale: null }));
  const moved = phase.scope !== scope;
  const resetting = moved ? scope !== null && phase.scope !== null && !phase.resetting : phase.resetting;
  const result = useTable(tbl.where((r: any) => r[column].eq(value ?? "")), { enabled: scope !== null && !resetting });
  if (moved) setPhase({ scope, resetting, stale: result });
  // A new snapshot while resetting: the disabled render committed and its effect reset `applied`. Subscribe now.
  else if (resetting && result !== phase.stale) setPhase({ scope, resetting: false, stale: result });
  if (scope === null) return SCOPED_DISABLED;
  return moved || resetting || result === phase.stale ? (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]) : result;
}
export function useDocumentRows(organizationId: string | null) { return useScopedDocTable("document", "organizationId", organizationId); }
// Each document's type and folder (`document_file`); useDocs.ts pairs them with the document rows.
export function useDocumentFileRows(organizationId: string | null) { return useScopedDocTable("documentFile", "organizationId", organizationId); }
export function useDocumentStarRows(organizationId: string | null) { return useScopedDocTable("documentStar", "organizationId", organizationId); }
export function useDocumentAccessRows(organizationId: string | null) { return useScopedDocTable("documentAccess", "organizationId", organizationId); }
export function useDocumentCommentRows(documentId: string | null) { return useScopedDocTable("documentComment", "documentId", documentId); }
export function useDocumentVersionRows(documentId: string | null, enabled: boolean) { return useScopedDocTable("documentVersion", "documentId", documentId, enabled); }
// Drive tables, same guard and org scope. Kept out of the provider.tsx batches: a
// module without them would fail every org query there. Mapping + access rules:
// lib/spacetimedb/hooks/useDrive.ts.
export function useDriveItemRows(organizationId: string | null, enabled = true) { return useScopedDocTable("driveItem", "organizationId", organizationId, enabled); }
export function useDriveUsageRows(organizationId: string | null, enabled = true) { return useScopedDocTable("driveUsage", "organizationId", organizationId, enabled); }
export function useDriveStarRows(organizationId: string | null, enabled = true) { return useScopedDocTable("driveStar", "organizationId", organizationId, enabled); }
export function useDriveNoticeAckRows(organizationId: string | null, enabled = true) { return useScopedDocTable("driveNoticeAck", "organizationId", organizationId, enabled); }
// Storage accounting (app_file, org_storage_usage, document_size): same guard and org scope, probed apart from
// Drive (lib/drive/queries.ts storageProbeQueries). Mapping: lib/spacetimedb/hooks/useDriveStorage.ts.
export function useAppFileRows(organizationId: string | null, enabled = true) { return useScopedDocTable("appFile", "organizationId", organizationId, enabled); }
export function useOrgStorageUsageRows(organizationId: string | null, enabled = true) { return useScopedDocTable("orgStorageUsage", "organizationId", organizationId, enabled); }
export function useDocumentSizeRows(organizationId: string | null, enabled = true) { return useScopedDocTable("documentSize", "organizationId", organizationId, enabled); }
/* eslint-enable */

// ── Punch-in codes / device operator ─────────────────────────────────────────
// `member_punch_code` and `device_operator_session` are RLS-scoped to the
// calling identity, so these return only the current user's own rows no matter
// how many colleagues exist. There is deliberately no hook that lists an org's
// codes — that is exactly what used to leak every manager's unlock PIN to every
// staff phone. Verification lives in the `verifyManagerPin` /
// `resolveDeviceOperator` reducers.
/* eslint-disable react-hooks/rules-of-hooks */
export function useMyPunchCode() {
  const tbl = tables.memberPunchCode;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
export function useDeviceOperatorSession() {
  const tbl = tables.deviceOperatorSession;
  return tbl ? useTable(tbl) : (EMPTY_TABLE_RESULT as unknown as [unknown[], boolean]);
}
/* eslint-enable */

// ── Page presence ───────────────────────────────────────────────────────────
// Live cursors on /manager pages — people and Mr. Merchiva (`page_presence`).
// Rows change on every cursor move, so pass the active org id: the subscription
// is then scoped to that org (null subscribes to nothing). With no argument it
// is RLS-scoped only, i.e. every org the caller belongs to. `updatedAt` cannot
// be filtered in SQL — callers drop rows older than the 90 s TTL themselves.
// Guarded like the tables above: bindings without the table return an empty,
// never-ready tuple.
const EMPTY_PRESENCE_RESULT = EMPTY_TABLE_RESULT as unknown as [readonly PagePresence[], boolean];
/* eslint-disable react-hooks/rules-of-hooks */
export function usePagePresenceRows(organizationId?: string | null): [readonly PagePresence[], boolean] {
  const tbl = tables.pagePresence as typeof tables.pagePresence | undefined;
  if (!tbl) return EMPTY_PRESENCE_RESULT;
  if (organizationId === undefined) return useTable(tbl);
  return useTable(tbl.where((r) => r.organizationId.eq(organizationId ?? "")), { enabled: !!organizationId });
}
/* eslint-enable */

/** This tab's connection id (hex) once connected, else null. Same identity + another id = my other tab. */
export function useMyConnectionId(): string | null {
  const { isActive, connectionId } = useSpacetimeDB();
  return isActive && connectionId ? connectionId.toHexString() : null;
}
