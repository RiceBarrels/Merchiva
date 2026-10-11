// The delivery rows a notifications cron run holds, read back over `/sql`
// (`notification_delivery`, spacetimedb/src/notify/tables.ts) and decoded into
// plain values. Pure.
//
// The service identity reads the table through rls_notification_delivery_service
// (the drive_service_reader join, approved exception U14); the claim reducer
// registers it as a reader first. A row comes back once per matching rule, so
// rows are de-duplicated by notification id.

import { dedupeRowsBy, sqlNumber, sqlString, type SqlRow } from "@/lib/drive/server/sql-rows";
import { parseAlertParams } from "@/lib/notifications/alert-text";
import type { PushSubscriptionInput } from "@/lib/push/send";

/** The claim reducer's own run id check (NOTIFY_UUID_RE in spacetimedb/src/notify/logic.ts): the id goes into SQL. */
export const NOTIFY_RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The rows leased to run `runId`. Throws on anything but a lowercase UUID. */
export function notifyClaimedQuery(runId: string): string {
  if (!NOTIFY_RUN_ID_RE.test(runId)) throw new Error("Invalid notification run id");
  return `SELECT * FROM notification_delivery WHERE run_id = '${runId}'`;
}

export interface NotifyClaimedRow {
  notificationId: string;
  organizationId: string;
  /** The recipient's identity: lowercase hex when readable, else its JSON (a stable key either way). */
  target: string;
  /** The run holds the row's push ('p' in `claimed`). */
  push: boolean;
  /** The run holds the row's email ('e' in `claimed`). */
  email: boolean;
  template: string;
  /** The params column (a JSON object of plain strings), and the same parsed; `store` is the organization's name. */
  paramsJson: string;
  params: Record<string, string>;
  /** English fallback copy, and the in-app link (already a safe /manager path, or ''). */
  title: string;
  body: string;
  link: string;
  /** The https subscriptions leased with the push (at most 10). */
  pushTargets: PushSubscriptionInput[];
  /** WorkOS user id, token issuer and UI locale, copied from notification_pref at claim time. */
  subject: string;
  issuer: string;
  locale: string;
  /** Email attempts, this run's included. */
  attempts: number;
  createdAtMs: number;
}

const HEX_RE = /^(?:0x)?([0-9a-fA-F]{64})$/;

/** An identity column: `["0x…"]`, `"0x…"` or `{ __identity__: "0x…" }` as lowercase hex, else its JSON. */
export function notifyIdentityKey(value: unknown): string {
  let inner = Array.isArray(value) ? value[0] : value;
  if (inner !== null && typeof inner === "object" && "__identity__" in inner) {
    inner = (inner as Record<string, unknown>).__identity__;
  }
  const match = typeof inner === "string" ? HEX_RE.exec(inner) : null;
  return match ? match[1].toLowerCase() : JSON.stringify(value ?? null);
}

/** A `timestamp` column in ms: `[micros]`, `{ __timestamp_micros_since_unix_epoch__ }` or a number. 0 when unreadable. */
export function notifyTimestampMs(value: unknown): number {
  const micros = Array.isArray(value) ? value[0]
    : value !== null && typeof value === "object" ? (value as Record<string, unknown>).__timestamp_micros_since_unix_epoch__
    : value;
  return sqlNumber({ micros }, "micros") / 1000;
}

const PUSH_HOSTS = new Set(["fcm.googleapis.com", "web.push.apple.com"]);
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com"];

/**
 * A Web Push endpoint the cron will call: https on the default port, no
 * credentials, ≤ 1000 chars, and a browser push service's host (Chrome / Edge /
 * Android, Safari, Firefox, Windows). Anything else is never fetched.
 */
export function notifyPushEndpointAllowed(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** The push_targets column: well-formed subscriptions on allowed endpoints, each endpoint once. */
export function notifyPushTargets(json: string): PushSubscriptionInput[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: PushSubscriptionInput[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const { endpoint, p256dh, auth } = entry as Record<string, unknown>;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") continue;
    if (!p256dh || !auth || seen.has(endpoint) || !notifyPushEndpointAllowed(endpoint)) continue;
    seen.add(endpoint);
    out.push({ endpoint, p256dh, auth });
  }
  return out;
}

/** The run's rows, once each; a row that holds no channel is skipped. */
export function notifyClaimedRows(rows: readonly SqlRow[]): NotifyClaimedRow[] {
  const out: NotifyClaimedRow[] = [];
  for (const row of dedupeRowsBy(rows, "notification_id")) {
    const notificationId = sqlString(row, "notification_id");
    const claimed = sqlString(row, "claimed");
    const push = claimed.includes("p");
    const email = claimed.includes("e");
    if (!notificationId || (!push && !email)) continue;
    const paramsJson = sqlString(row, "params");
    out.push({
      notificationId,
      organizationId: sqlString(row, "organization_id"),
      target: notifyIdentityKey(row.target_id),
      push,
      email,
      template: sqlString(row, "template"),
      paramsJson,
      params: parseAlertParams(paramsJson),
      title: sqlString(row, "title"),
      body: sqlString(row, "body"),
      link: sqlString(row, "link"),
      pushTargets: push ? notifyPushTargets(sqlString(row, "push_targets")) : [],
      subject: email ? sqlString(row, "subject") : "",
      issuer: email ? sqlString(row, "issuer") : "",
      locale: sqlString(row, "locale"),
      attempts: sqlNumber(row, "attempts"),
      createdAtMs: notifyTimestampMs(row.created_at),
    });
  }
  return out;
}
