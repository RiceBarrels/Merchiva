// Which feature a notification row belongs to: the entry point whose top
// inline-end corner carries its dot. There is no feature column on
// `notification` (its columns are frozen for old clients), so it is derived
// from the row's `type` and `link`, both chosen by the producer
// (spacetimedb/src/notify/producers.ts, TEMPLATES.md in the notify scratch).
//
// Order: a few types are decided before the link is read (security rows say
// /manager/personnel on older rows; SOS, console and self rows are alerts
// only); then the link, when it names one of the feature pages notifications
// point at; then the type. A row nothing matches is alert-only: it is shown
// as an alert and marked read, and never lights a dot.
//
// Only the feature pages below are recognised. A link to any other page
// (createNotification takes any link) does not move a dot there.

import { resolveLegacyRedirect } from "@/lib/browser-shell/routes";
import type { NavSection } from "@/lib/browser-shell/types";
import { placeUrl, type NavPlacement } from "@/lib/presence/rows";
import { safeAppPath } from "./safe-link";

export type NotificationFeatureKind =
  | "chat"
  | "merchiva"
  | "drive"
  | "forms"
  | "schedule"
  | "team"
  | "security"
  | "inventory"
  | "supplier";

export interface NotificationFeature {
  readonly kind: NotificationFeatureKind;
  /** The manager page that is the feature's entry (what its nav row opens). */
  readonly href: string;
  /** Catalog app id of the feature on /manager (`merchiva` = Mr. Merchiva's dock). */
  readonly appId: string;
  /** The row's link after safeAppPath, for exact-link clearing; null when unsafe or absent. */
  readonly link: string | null;
  /** Chat rows whose link names a conversation (`?c=`). */
  readonly conversationId?: string;
  /** The nav rows that show the dot on /manager; null when no visible row owns the feature. */
  readonly placement: NavPlacement | null;
}

export interface NotificationFeatureAccess {
  /**
   * May open the team page: owner / manager, or permissions.team.view. Without it a
   * "new team member" row is alert-only (its page is closed to them).
   */
  readonly canViewTeam: boolean;
  /** The nav this person sees on /manager (useNavSections). Without it every placement is null. */
  readonly sections?: readonly NavSection[];
}

/** The fields of a `notification` row this reads. */
export interface NotificationFeatureRow {
  readonly type: string;
  readonly link?: string | null;
}

const ENTRY: Readonly<Record<NotificationFeatureKind, { href: string; appId: string }>> = {
  chat: { href: "/manager/channel", appId: "channel" },
  merchiva: { href: "/manager/dashboard", appId: "merchiva" },
  drive: { href: "/manager/drive", appId: "drive" },
  forms: { href: "/manager/forms", appId: "forms" },
  schedule: { href: "/manager/personnel/schedule", appId: "schedule" },
  team: { href: "/manager/personnel/team", appId: "personnel" },
  security: { href: "/manager/personnel/team", appId: "personnel" },
  inventory: { href: "/manager/inventory", appId: "inventory" },
  supplier: { href: "/manager/suppliers", appId: "inventory" },
};

/**
 * Types that never light a dot by themselves: the store SOS (`emergency`), the
 * /merchivaAdmin console (`admin`) and the alerts people send themselves through
 * Mr. Merchiva (`general`, `urgent`). Only a Mr. Merchiva reply link moves one.
 */
const ALERT_ONLY_TYPES: ReadonlySet<string> = new Set(["emergency", "admin", "general", "urgent"]);

/** Type → feature when the link names none of the feature pages. */
const BY_TYPE: Readonly<Record<string, NotificationFeatureKind>> = {
  time_off: "schedule",
  shift_trade: "schedule",
  team: "team",
  inventory_low: "inventory",
  order: "supplier",
  doc_share: "drive",
  doc_comment: "drive",
  form_response: "forms",
};

function pathOf(url: string): string {
  return (url.split(/[?#]/, 1)[0] ?? "").replace(/\/+$/, "") || "/";
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** The feature a safe link names, or null when it points elsewhere. */
function kindOfLink(link: string): NotificationFeatureKind | null {
  const resolved = resolveLegacyRedirect(link);
  const path = pathOf(resolved);
  const query = new URLSearchParams(resolved.includes("?") ? resolved.slice(resolved.indexOf("?") + 1) : "");
  if (under(path, "/manager/channel")) return "chat";
  if (query.has("mvsession")) return "merchiva";
  if (under(path, "/manager/drive") || under(path, "/manager/docs")) return "drive";
  if (under(path, "/manager/forms")) return "forms";
  if (under(path, "/manager/personnel/team")) return "team";
  if (under(path, "/manager/personnel/schedule")) return "schedule";
  if (under(path, "/manager/suppliers")) return "supplier";
  if (under(path, "/manager/inventory")) return "inventory";
  return null;
}

function conversationOf(link: string): string | undefined {
  const q = link.indexOf("?");
  if (q < 0) return undefined;
  const c = new URLSearchParams(link.slice(q + 1)).get("c");
  return c ? c : undefined;
}

function featureOf(kind: NotificationFeatureKind, link: string | null, access: NotificationFeatureAccess): NotificationFeature | null {
  if (kind === "team" && !access.canViewTeam) return null;
  const entry = ENTRY[kind];
  const conversationId = kind === "chat" && link ? conversationOf(link) : undefined;
  // Mr. Merchiva lives in the dock, never on a nav row.
  const placement = kind === "merchiva" ? null : placeUrl(entry.href, access.sections ?? []);
  return {
    kind,
    href: entry.href,
    appId: entry.appId,
    link,
    ...(conversationId ? { conversationId } : {}),
    placement,
  };
}

/**
 * The feature a notification row belongs to, or null when it is alert-only (SOS,
 * console and self alerts, a team join the person cannot open, anything unrecognised).
 */
export function notificationFeature(row: NotificationFeatureRow, access: NotificationFeatureAccess): NotificationFeature | null {
  const link = safeAppPath(row.link ?? null);
  if (row.type === "security") return featureOf("security", link, access);
  const byLink = link ? kindOfLink(link) : null;
  if (ALERT_ONLY_TYPES.has(row.type)) return byLink === "merchiva" ? featureOf("merchiva", link, access) : null;
  if (byLink) return featureOf(byLink, link, access);
  const byType = BY_TYPE[row.type];
  return byType ? featureOf(byType, link, access) : null;
}
