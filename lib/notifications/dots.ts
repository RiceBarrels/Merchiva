// The dot state, pure: which unread notification rows light which entry points
// on this surface, and which rows a visible page clears. The React side is
// lib/notifications/dots-context.tsx; the rules are unit-tested
// (scripts/tests/notify/client-dots.test.ts).
//
// A row counts toward a dot only when it is unread, at most NOTIFY_DOT_WINDOW_MS
// old (so the backlog from before dots existed never lights up, and a row
// nothing can clear ages out), belongs to the active store and to this
// identity, and its feature resolves to an entry this surface renders for this
// person. A row with no feature is alert-only.

import { navKeyOf } from "@/components/browser-shell/desktop/sidebar/sidebar-nav";
import type { NavSection } from "@/lib/browser-shell/types";
import { resolveLegacyRedirect } from "@/lib/browser-shell/routes";
import type { NavPlacement } from "@/lib/presence/rows";
import { deviceDotApp, deviceDotTarget, type DeviceDotTarget, type DeviceSurface } from "./device-tiles";
import { notificationFeature, type NotificationFeature, type NotificationFeatureAccess } from "./features";

/** Rows older than this never count toward a dot. */
export const NOTIFY_DOT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type DotSurface = "manager" | DeviceSurface;

/** A `notification` row as the dots read it: plain strings and numbers. */
export interface DotRow {
  readonly id: string;
  readonly organizationId: string;
  readonly targetHex: string;
  readonly type: string;
  readonly link: string | null;
  readonly read: boolean;
  readonly createdAtMs: number;
}

/** An unread row with a feature. */
export interface DotEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly type: string;
  readonly createdAtMs: number;
  readonly feature: NotificationFeature;
  /** Nav rows on /manager (feature.placement). */
  readonly placement: NavPlacement | null;
  /** Device entry on /store and /personal. */
  readonly device: DeviceDotTarget | null;
  /** What `useDot({ app })` matches on this surface: the feature's app on /manager, the device target's on a device. */
  readonly app: string | null;
  /** Lights a dot on this surface (its entry is rendered for this person). */
  readonly counted: boolean;
}

export interface DotStateInput {
  readonly rows: readonly DotRow[];
  readonly nowMs: number;
  /** The active store; rows of other stores only feed `otherOrgIds`. */
  readonly organizationId: string | null;
  /** The connection identity (hex). Rows for anyone else never count. */
  readonly selfHex: string | null;
  readonly surface: DotSurface;
  readonly canViewTeam: boolean;
  /** The nav this person sees on /manager (useNavSections). */
  readonly sections: readonly NavSection[];
  /** Whether a device tile is on this person's grid (permission); the channel header always is. */
  readonly deviceTileVisible: (target: DeviceDotTarget) => boolean;
  /** Mr. Merchiva's rail is on screen (desktop /manager): his rows count there. */
  readonly merchivaRail: boolean;
  /**
   * This person's access in another of their stores (role, permissions, that store's nav), or
   * null when unknown. A row of another store marks it only when it would light a nav row there.
   */
  readonly otherOrgAccess?: (organizationId: string) => NotificationFeatureAccess | null;
}

export interface DotState {
  /** Unread rows of the active store that have a feature, counted or not, newest first. */
  readonly entries: readonly DotEntry[];
  /** Unread rows of the active store with no feature (alert-only), newest first. */
  readonly alertOnlyIds: readonly string[];
  /** Other stores of this identity with an unread row that lights a nav row there. */
  readonly otherOrgIds: ReadonlySet<string>;
}

export const EMPTY_DOT_STATE: DotState = Object.freeze({
  entries: Object.freeze([]) as readonly DotEntry[],
  alertOnlyIds: Object.freeze([]) as readonly string[],
  otherOrgIds: new Set<string>() as ReadonlySet<string>,
});

/** Builds the dot state for one surface. Pure. */
export function buildDotState(input: DotStateInput): DotState {
  const { rows, nowMs, organizationId, selfHex, surface } = input;
  if (!selfHex) return EMPTY_DOT_STATE;
  const access = { canViewTeam: input.canViewTeam, sections: input.sections };
  const entries: DotEntry[] = [];
  const alertOnly: { id: string; at: number }[] = [];
  const otherOrgIds = new Set<string>();
  for (const row of rows) {
    if (row.read || row.targetHex !== selfHex) continue;
    if (nowMs - row.createdAtMs > NOTIFY_DOT_WINDOW_MS) continue;
    if (row.organizationId !== organizationId) {
      // Counted there by that store's own nav, so switching to it always finds the dot. Mr.
      // Merchiva's rows never mark another store: they have no nav row, and clear when his dock
      // opens there.
      const there = input.otherOrgAccess?.(row.organizationId) ?? null;
      if (there && notificationFeature(row, there)?.placement) otherOrgIds.add(row.organizationId);
      continue;
    }
    const feature = notificationFeature(row, access);
    if (!feature) {
      alertOnly.push({ id: row.id, at: row.createdAtMs });
      continue;
    }
    const device = surface === "manager" ? null : deviceDotTarget(feature, surface);
    const app = surface === "manager" ? feature.appId : device ? deviceDotApp(device) : null;
    const counted =
      surface === "manager"
        ? feature.placement !== null || (feature.kind === "merchiva" && input.merchivaRail)
        : device !== null && input.deviceTileVisible(device);
    entries.push({
      id: row.id,
      organizationId: row.organizationId,
      type: row.type,
      createdAtMs: row.createdAtMs,
      feature,
      placement: feature.placement,
      device,
      app,
      counted,
    });
  }
  entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
  alertOnly.sort((a, b) => b.at - a.at);
  return { entries, alertOnlyIds: alertOnly.map((a) => a.id), otherOrgIds };
}

function sameEntry(a: DotEntry, b: DotEntry): boolean {
  return (
    a.id === b.id &&
    a.counted === b.counted &&
    a.app === b.app &&
    a.device?.kind === b.device?.kind &&
    a.placement?.sectionHref === b.placement?.sectionHref &&
    a.placement?.childHref === b.placement?.childHref
  );
}

/** Whether two states light and clear the same things (so the older object can be kept). */
export function sameDotState(a: DotState, b: DotState): boolean {
  if (a === b) return true;
  if (a.entries.length !== b.entries.length || a.alertOnlyIds.length !== b.alertOnlyIds.length) return false;
  if (a.otherOrgIds.size !== b.otherOrgIds.size) return false;
  for (const id of a.otherOrgIds) if (!b.otherOrgIds.has(id)) return false;
  for (let i = 0; i < a.alertOnlyIds.length; i++) if (a.alertOnlyIds[i] !== b.alertOnlyIds[i]) return false;
  return a.entries.every((entry, i) => sameEntry(entry, b.entries[i]));
}

/**
 * What an entry point asks for:
 * - `{ href }`: a nav row (sidebar, drawer, New Tab launcher). `level` "section" (default)
 *   takes the section's own rows plus its sub-pages' unless `childrenVisible` (then the
 *   sub-page rows show those); "child" takes one sub-page row.
 * - `{ url }`: a page, e.g. a browser tab: the rows visiting it would clear (see rowsClearedByPage).
 * - `{ app }`: an app — a device tile id, "channel" (device channel header), or on
 *   /manager a feature's catalog app id ("merchiva" = the dock rail).
 * - `{ conversationId }`: one chat conversation.
 */
export type DotQuery =
  | { readonly href: string; readonly level?: "section" | "child"; readonly childrenVisible?: boolean }
  | { readonly url: string }
  | { readonly app: string }
  | { readonly conversationId: string };

/** A predicate over counted entries, for aggregate dots (useAnyDot). */
export type DotFilter = (entry: DotEntry) => boolean;

/** Ready-made aggregate filters. */
export const DOT_FILTERS = {
  /** Rows on a nav row: the phone menu button and the hidden sidebar's toggle. */
  navRows: ((entry) => entry.placement !== null) as DotFilter,
  /** Chat rows: the device channel chip and the Channel page of the device pager. */
  chat: ((entry) => entry.feature.kind === "chat") as DotFilter,
  /** Rows on a device tile: the Apps page of the device pager. */
  deviceTiles: ((entry) => entry.device?.kind === "tile") as DotFilter,
} as const;

/** A page as the clearing rule reads it: its URL and its nav key, worked out once. */
interface PageRef {
  readonly url: string;
  readonly key: string;
}

function pageRef(url: string): PageRef {
  return { url, key: navKeyOf(resolveLegacyRedirect(url)) };
}

/**
 * Whether the page shows the entry's row: the row's own link (same id), or the feature's
 * landing page (Drive, the Forms list, Inventory, Suppliers, Team, Schedule), which lists its
 * events. Another page of the same section — the editor of a different document or form —
 * does not, though it sits on the same nav row.
 */
function pageShows(entry: DotEntry, page: PageRef): boolean {
  return linkMatchesPage(entry.feature.link, page.url) || page.key === navKeyOf(entry.feature.href);
}

/** A `{ url }` query resolved once, instead of once per entry. */
type ResolvedQuery = Exclude<DotQuery, { readonly url: string }> | { readonly page: PageRef };

function resolveQuery(query: DotQuery): ResolvedQuery {
  return "url" in query ? { page: pageRef(query.url) } : query;
}

function matchesResolved(entry: DotEntry, query: ResolvedQuery): boolean {
  if ("conversationId" in query) return entry.feature.kind === "chat" && entry.feature.conversationId === query.conversationId;
  if ("app" in query) return entry.app === query.app;
  const placement = entry.placement;
  if (!placement) return false;
  if ("page" in query) return pageShows(entry, query.page);
  if (query.level === "child") return placement.childHref === query.href;
  return placement.sectionHref === query.href && !(query.childrenVisible && placement.childHref !== null);
}

/** Whether `entry` answers `query` (whether it is counted is the caller's business). */
export function dotMatches(entry: DotEntry, query: DotQuery): boolean {
  return matchesResolved(entry, resolveQuery(query));
}

/** Whether any counted entry answers `query`. */
export function hasDot(state: DotState, query: DotQuery): boolean {
  const resolved = resolveQuery(query);
  return state.entries.some((entry) => entry.counted && matchesResolved(entry, resolved));
}

function pathAndQuery(url: string): { path: string; query: URLSearchParams } {
  const resolved = resolveLegacyRedirect(url);
  const q = resolved.indexOf("?");
  const path = ((q < 0 ? resolved : resolved.slice(0, q)).split("#", 1)[0] ?? "").replace(/\/+$/, "") || "/";
  return { path, query: new URLSearchParams(q < 0 ? "" : resolved.slice(q + 1).split("#", 1)[0]) };
}

/** Same page as the link: same path, and the same `id` / `c` whenever the link names one. */
export function linkMatchesPage(link: string | null, pageUrl: string): boolean {
  if (!link) return false;
  const a = pathAndQuery(link);
  const b = pathAndQuery(pageUrl);
  if (a.path !== b.path) return false;
  for (const key of ["id", "c"]) {
    const want = a.query.get(key);
    if (want !== null && b.query.get(key) !== want) return false;
  }
  return true;
}

/**
 * Rows the visible page at `pageUrl` clears on /manager: rows whose link is this page, and
 * every row of the feature whose landing page this is (pageShows) — not the rows of other
 * documents or forms while one editor is open. Chat rows with a conversation never clear
 * here — the open conversation's markChatRead does it in the module (the URL's `?c=` can
 * be stale) — and Mr. Merchiva's clear when his dock opens.
 */
export function rowsClearedByPage(state: DotState, pageUrl: string): string[] {
  const page = pageRef(pageUrl);
  const out: string[] = [];
  for (const entry of state.entries) {
    const { kind, link, conversationId } = entry.feature;
    if (kind === "merchiva") continue;
    if (kind === "chat") {
      if (conversationId === undefined && linkMatchesPage(link, pageUrl)) out.push(entry.id);
      continue;
    }
    if (pageShows(entry, page)) out.push(entry.id);
  }
  return out;
}

/** Ids of every unread entry answering `query`, counted or not (what opening that entry point clears). */
export function idsForQuery(state: DotState, query: DotQuery): string[] {
  const resolved = resolveQuery(query);
  return state.entries.filter((entry) => matchesResolved(entry, resolved)).map((entry) => entry.id);
}
