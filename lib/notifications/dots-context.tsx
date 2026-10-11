"use client";

// Notification dots: one provider reads the caller's notification rows once and
// every entry point asks it a cheap question (useDot, useConversationDot,
// useAnyDot, useOtherOrgDot). Entry points never read a table themselves. The
// rules are pure and tested in ./dots.ts.
//
// Mounted once by NotificationRuntime (./runtime.tsx) in app/manager/layout.tsx,
// inside PermissionsProvider, around both the manager shell and the bare
// /choose, /store and /personal screens.
//
// Clearing:
//   - /manager: the page on screen clears the rows it shows (ManagerDotClearing
//     below, only while someone is at the document: ./attention.ts).
//   - Chat: the module's markChatRead clears a conversation's rows; the manager
//     channel page and the device walkie call it through useMarkConversationRead
//     while the conversation is on screen.
//   - Devices: opening a tile clears that tile's rows (useMarkDotRead()({ app })).
//   - Mr. Merchiva: opening his dock clears his rows (useMarkDotRead()({ app: "merchiva" })).
//
// Works from `notification` alone: before the module's notification tables are
// published, reads still come from `notification`, marking read falls back to
// the frozen one-row reducer, and a conversation's rows are read by id with it
// (that module's markChatRead does not touch them).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSpacetimeDB } from "spacetimedb/react";
import { canAccess, memberAccess } from "@/lib/auth/verify-member";
import { listNavSections, useAccessContext, useNavSections } from "@/lib/browser-shell/access";
import { useActiveTab, useTabsSnapshot } from "@/lib/browser-shell/hooks";
import { useMountedBrowserShell } from "@/lib/browser-shell/shell-dom";
import { currentEntry, type NavSection } from "@/lib/browser-shell/types";
import { usePermissions } from "@/lib/context/permissions";
import { isOrgAdminRole } from "@/lib/drive/access";
import { markChatRead } from "@/lib/spacetimedb/actions/chat";
import { markNotificationReadOne, markNotificationsRead } from "@/lib/spacetimedb/actions/notifications";
import { useNotificationDeliveries, useNotifications, useOrgMembers } from "@/lib/spacetimedb/hooks";
import type { Notification as NotificationRow, NotificationDelivery } from "@/lib/spacetimedb/generated/types";
import { useNow } from "@/lib/use-now";
import { useDocumentAttended } from "./attention";
import { DEVICE_DOT_TILE_PERMISSION, type DeviceDotTarget } from "./device-tiles";
import {
  EMPTY_DOT_STATE,
  buildDotState,
  hasDot,
  idsForQuery,
  rowsClearedByPage,
  sameDotState,
  type DotFilter,
  type DotQuery,
  type DotRow,
  type DotState,
} from "./dots";
import type { NotificationFeatureAccess } from "./features";
import { useNotificationViewer, type NotificationViewer } from "./viewer";

export { useDocumentAttended } from "./attention";

/** A row being marked read is not asked for again for this long (then a failed call retries). */
const MARK_RETRY_MS = 15_000;

export interface NotificationDotsValue {
  readonly state: DotState;
  readonly sections: readonly NavSection[];
  readonly viewer: NotificationViewer;
  /** Marks rows read (batched; falls back to the one-row reducer on a module that predates the batch). */
  readonly markRead: (ids: readonly string[]) => void;
}

/** Raw rows for the alert and sync hooks (./alerts.ts, ./sync.ts). Not for entry points. */
export interface NotificationFeed {
  /** This identity's rows in the active store, by id. */
  readonly rows: ReadonlyMap<string, NotificationRow>;
  readonly rowsReady: boolean;
  /** Delivery rows by notification id (empty before the module is published). */
  readonly deliveries: ReadonlyMap<string, NotificationDelivery>;
  /** The module answers for the notification tables (its batch reducers exist). */
  readonly notifyReady: boolean;
  /** Changes on every new connection. */
  readonly connectionKey: string | null;
  /** The page on screen in the manager shell, else the router's path. */
  readonly pageUrl: string | null;
}

const NOOP = () => {};

const DotsContext = createContext<NotificationDotsValue>({
  state: EMPTY_DOT_STATE,
  sections: [],
  viewer: { surface: "other", shared: false, dotsVisible: false, alerts: false, personalDevice: false, accountHex: null },
  markRead: NOOP,
});

const FeedContext = createContext<NotificationFeed>({
  rows: new Map(),
  rowsReady: false,
  deliveries: new Map(),
  notifyReady: false,
  connectionKey: null,
  pageUrl: null,
});

/** SpacetimeDB Timestamp → epoch ms. */
export function timestampMs(ts: { readonly microsSinceUnixEpoch: bigint } | null | undefined): number {
  return ts ? Number(ts.microsSinceUnixEpoch / BigInt(1000)) : 0;
}

function toDotRow(row: NotificationRow): DotRow {
  return {
    id: row.id.toString(),
    organizationId: row.organizationId,
    targetHex: row.targetId.toHexString(),
    type: row.type,
    link: row.link ?? null,
    read: row.read,
    createdAtMs: timestampMs(row.createdAt),
  };
}

/**
 * The URL on screen: the manager shell's active tab (null while a gate covers it), else
 * the router's path (the legacy shell and the bare screens, where only placement matters).
 */
function usePageUrl(): string | null {
  const tab = useActiveTab();
  const snapshot = useTabsSnapshot();
  const pathname = usePathname();
  if (tab) return snapshot.gate?.tabId === tab.id ? null : currentEntry(tab).url;
  return pathname || null;
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** Whether this document is on screen (not a background browser tab or a hidden app). */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
}

/**
 * /manager: rows the page on screen shows are read — only while someone is at it, so a
 * window left open (or visible behind another app) never reads a row and cancels its email.
 */
function ManagerDotClearing({ pageUrl }: { pageUrl: string | null }) {
  const { state, viewer, markRead } = useContext(DotsContext);
  const attended = useDocumentAttended();
  const active = viewer.surface === "manager" && viewer.dotsVisible;
  useEffect(() => {
    if (!active || !attended || !pageUrl) return;
    const ids = rowsClearedByPage(state, pageUrl);
    if (ids.length > 0) markRead(ids);
  }, [active, attended, pageUrl, state, markRead]);
  return null;
}

const NO_APPS: ReadonlySet<string> = new Set();

/**
 * This identity's access in each of its other stores, from its own org_member rows (the
 * bootstrap subscription holds them all), built as the layout builds the active store's. Their
 * settings are not subscribed, so only the always-installed apps count there: a row for an
 * optional app may go unmarked, but no store is marked with a dot it cannot show.
 */
function useOtherOrgAccess(accountHex: string | null, organizationId: string | null): ReadonlyMap<string, NotificationFeatureAccess> {
  const [members] = useOrgMembers();
  const ctx = useAccessContext();
  return useMemo(() => {
    const out = new Map<string, NotificationFeatureAccess>();
    if (!accountHex) return out;
    for (const m of members) {
      const orgId = m.organizationId.toString();
      if (orgId === organizationId || m.status !== "active" || m.userId.toHexString() !== accountHex) continue;
      const access = memberAccess(m.role, m.permissions);
      const sections = listNavSections({
        ...ctx,
        isOwner: access.isOwner,
        can: (section) => canAccess(access, section),
        installedApps: NO_APPS,
        appsReady: true,
      });
      out.set(orgId, { canViewTeam: isOrgAdminRole(m.role) || canAccess(access, "team"), sections });
    }
    return out;
  }, [members, ctx, accountHex, organizationId]);
}

/** Keeps the previous state object while nothing a dot shows changed (the minute tick, a navigation). */
function useStableDotState(next: DotState): DotState {
  const [held, setHeld] = useState(next);
  const same = sameDotState(held, next);
  if (!same) setHeld(next);
  return same ? held : next;
}

export function NotificationDotsProvider({ children }: { children: ReactNode }) {
  const stdb = useSpacetimeDB();
  const viewer = useNotificationViewer();
  const { organizationId, role, can } = usePermissions();
  const sections = useNavSections();
  const shell = useMountedBrowserShell();
  const now = useNow(60_000).getTime();
  const pageUrl = usePageUrl();
  const [notifications, rowsReady] = useNotifications();
  const [deliveryRows, deliveriesReady] = useNotificationDeliveries();

  const accountHex = viewer.accountHex;
  const connectionKey = stdb?.connectionId ? stdb.connectionId.toHexString() : null;
  const canViewTeam = isOrgAdminRole(role) || can("team", "view");
  const canDashboard = can("dashboard", "view");
  const canInventory = can("inventory", "view");
  const otherOrgAccess = useOtherOrgAccess(accountHex, organizationId ?? null);

  const built = useMemo<DotState>(() => {
    if (!viewer.dotsVisible) return EMPTY_DOT_STATE;
    // /choose and the setup wizard read like /manager (their store lists use otherOrgIds).
    const surface = viewer.surface === "store" || viewer.surface === "personal" ? viewer.surface : "manager";
    const deviceTileVisible = (target: DeviceDotTarget) => {
      if (target.kind === "channel") return true;
      const needs = DEVICE_DOT_TILE_PERMISSION[target.app];
      return needs === null || (needs === "dashboard" ? canDashboard : canInventory);
    };
    return buildDotState({
      rows: notifications.map(toDotRow),
      nowMs: now,
      organizationId: organizationId ?? null,
      selfHex: accountHex,
      surface,
      canViewTeam,
      sections,
      deviceTileVisible,
      merchivaRail: shell === "desktop",
      otherOrgAccess: (orgId) => otherOrgAccess.get(orgId) ?? null,
    });
  }, [viewer, accountHex, notifications, now, organizationId, canViewTeam, sections, canDashboard, canInventory, shell, otherOrgAccess]);
  const state = useStableDotState(built);

  const notifyReadyRef = useRef(deliveriesReady);
  useEffect(() => {
    notifyReadyRef.current = deliveriesReady;
  }, [deliveriesReady]);
  const pendingRef = useRef(new Map<string, number>());
  const markRead = useCallback((ids: readonly string[]) => {
    const at = Date.now();
    const pending = pendingRef.current;
    const fresh = ids.filter((id) => at - (pending.get(id) ?? 0) > MARK_RETRY_MS);
    if (fresh.length === 0) return;
    for (const id of fresh) pending.set(id, at);
    const one = () => fresh.forEach((id) => void markNotificationReadOne(id));
    if (!notifyReadyRef.current) {
      one();
      return;
    }
    void markNotificationsRead(fresh).then((ok) => {
      if (!ok) one();
    });
  }, []);

  const value = useMemo<NotificationDotsValue>(
    () => ({ state, sections, viewer, markRead: viewer.dotsVisible ? markRead : NOOP }),
    [state, sections, viewer, markRead],
  );

  const feed = useMemo<NotificationFeed>(() => {
    const rows = new Map<string, NotificationRow>();
    if (accountHex && organizationId) {
      for (const row of notifications) {
        if (row.organizationId === organizationId && row.targetId.toHexString() === accountHex) rows.set(row.id.toString(), row);
      }
    }
    const deliveries = new Map<string, NotificationDelivery>();
    for (const d of deliveryRows) deliveries.set(d.notificationId, d);
    return {
      rows,
      rowsReady,
      deliveries,
      notifyReady: deliveriesReady,
      connectionKey,
      pageUrl,
    };
  }, [accountHex, organizationId, notifications, rowsReady, deliveryRows, deliveriesReady, connectionKey, pageUrl]);

  return (
    <DotsContext.Provider value={value}>
      <FeedContext.Provider value={feed}>
        <ManagerDotClearing pageUrl={pageUrl} />
        {children}
      </FeedContext.Provider>
    </DotsContext.Provider>
  );
}

/** Whether the entry point that answers `query` shows a dot. See DotQuery. */
export function useDot(query: DotQuery): boolean {
  const { state } = useContext(DotsContext);
  return hasDot(state, query);
}

/** Whether a chat conversation has an unread notification (device channel rows, the manager channel page). */
export function useConversationDot(conversationId: string | null | undefined): boolean {
  const { state } = useContext(DotsContext);
  if (!conversationId) return false;
  return state.entries.some((e) => e.counted && e.feature.kind === "chat" && e.feature.conversationId === conversationId);
}

/** Whether any counted row (or any passing `filter`, see DOT_FILTERS) lights a dot on this screen. */
export function useAnyDot(filter?: DotFilter): boolean {
  const { state } = useContext(DotsContext);
  return state.entries.some((e) => e.counted && (!filter || filter(e)));
}

/** Whether another store of this person has something unread (workspace switcher / store list rows). */
export function useOtherOrgDot(organizationId: string | null | undefined): boolean {
  const { state } = useContext(DotsContext);
  return !!organizationId && state.otherOrgIds.has(organizationId);
}

/**
 * Marks read every unread row an entry point stands for, counted or not: a device tile
 * when its mini app opens (`{ app: "drive" }`), Mr. Merchiva's dock when it opens
 * (`{ app: "merchiva" }`). A no-op where dots are hidden (a shared store tablet).
 */
export function useMarkDotRead(): (query: DotQuery) => void {
  const { state, markRead } = useContext(DotsContext);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  return useCallback(
    (query: DotQuery) => {
      const ids = idsForQuery(latest.current, query);
      if (ids.length > 0) markRead(ids);
    },
    [markRead],
  );
}

/**
 * Reads a conversation the person has on screen: the module's markChatRead, which also reads
 * its notification rows once the notification tables are published. On a module that predates
 * them those rows are read here by id (a no-op where dots are hidden). Callers decide when —
 * the manager channel page and the device walkie, while the conversation is on screen.
 */
export function useMarkConversationRead(): (conversationId: string) => void {
  const { state, markRead } = useContext(DotsContext);
  const { notifyReady } = useContext(FeedContext);
  const latest = useRef({ state, notifyReady });
  useEffect(() => {
    latest.current = { state, notifyReady };
  }, [state, notifyReady]);
  return useCallback(
    (conversationId: string) => {
      // markChatRead throws (not rejects) while disconnected.
      Promise.resolve()
        .then(() => markChatRead(conversationId))
        .catch((err: unknown) => console.warn("[notify] markChatRead failed:", err));
      if (!latest.current.notifyReady) {
        const ids = idsForQuery(latest.current.state, { conversationId });
        if (ids.length > 0) markRead(ids);
      }
    },
    [markRead],
  );
}

/** The whole dot context (state, sections, viewer, markRead), for code that needs more than a yes/no. */
export function useNotificationDots(): NotificationDotsValue {
  return useContext(DotsContext);
}

/** Internal: raw rows for ./alerts.ts and ./sync.ts. */
export function useNotificationFeed(): NotificationFeed {
  return useContext(FeedContext);
}
