// The pure decisions of a notifications cron run (handler.ts): how rows group
// into one email per recipient, what a Resend answer means for the rows, and
// how the outcomes are reported to serviceFinishNotificationDeliveries.

import { createHash } from "node:crypto";
import type { NotifyClaimedRow } from "./rows";
import type { NotifyEmailError } from "./types";

/** = the module's NOTIFY_LIST_MAX: entries per list in one finish call. */
export const NOTIFY_FINISH_LIST_MAX = 500;
const NOTIFY_EMERGENCY_TEMPLATE = "alert.emergency";

/** What one finish call reports, per notification id (resultJson of the finish reducer). */
export interface NotifyFinishLists {
  pushed?: string[];
  emailed?: string[];
  emailRetry?: string[];
  emailFailed?: string[];
  emailDropped?: string[];
  /** [notificationId, endpoint]: the push service said the subscription is gone. */
  expired?: Array<[string, string]>;
}

const ID_LISTS = ["pushed", "emailed", "emailRetry", "emailFailed", "emailDropped"] as const;

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The finish calls for one report, every list ≤ NOTIFY_FINISH_LIST_MAX. The
 * module handles `expired` before `pushed` within a call, and releases a row
 * once its channels are reported, so every `expired` entry goes out no later
 * than the call that reports the push: all but the last expired chunk first,
 * on their own. An empty report is no call.
 */
export function notifyFinishCalls(lists: NotifyFinishLists): NotifyFinishLists[] {
  const expired = chunksOf(lists.expired ?? [], NOTIFY_FINISH_LIST_MAX);
  const calls: NotifyFinishLists[] = expired.slice(0, -1).map((chunk) => ({ expired: chunk }));
  const rounds = Math.max(1, ...ID_LISTS.map((key) => Math.ceil((lists[key]?.length ?? 0) / NOTIFY_FINISH_LIST_MAX)));
  for (let i = 0; i < rounds; i++) {
    const call: NotifyFinishLists = {};
    if (i === 0 && expired.length > 0) call.expired = expired[expired.length - 1];
    for (const key of ID_LISTS) {
      const part = (lists[key] ?? []).slice(i * NOTIFY_FINISH_LIST_MAX, (i + 1) * NOTIFY_FINISH_LIST_MAX);
      if (part.length > 0) call[key] = part;
    }
    if (Object.keys(call).length > 0) calls.push(call);
  }
  return calls;
}

/** One recipient's email of the run: their rows with the pref the claim copied. */
export interface NotifyEmailGroup {
  subject: string;
  issuer: string;
  locale: string;
  rows: NotifyClaimedRow[];
}

/**
 * Email rows as one group per recipient (identity + WorkOS subject + issuer +
 * locale, which one claim copies alike onto a recipient's rows). Groups with an
 * emergency come first, then the longest-waiting, so a run that cannot send to
 * everyone serves the oldest next time too.
 */
export function notifyEmailGroups(rows: readonly NotifyClaimedRow[]): NotifyEmailGroup[] {
  const groups = new Map<string, NotifyEmailGroup>();
  for (const row of rows) {
    if (!row.email) continue;
    const key = [row.target, row.subject, row.issuer, row.locale].join("\u0000");
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { subject: row.subject, issuer: row.issuer, locale: row.locale, rows: [row] });
  }
  const urgent = (g: NotifyEmailGroup) => (g.rows.some((r) => r.template === NOTIFY_EMERGENCY_TEMPLATE) ? 0 : 1);
  const oldest = (g: NotifyEmailGroup) => Math.min(...g.rows.map((r) => r.createdAtMs));
  return [...groups.values()].sort((a, b) => urgent(a) - urgent(b) || oldest(a) - oldest(b));
}

/**
 * Resend's idempotency key for one email: the same rows give the same key, so
 * a run that crashed after sending cannot send the same digest twice (Resend
 * keeps keys for 24 hours).
 */
export function notifyIdempotencyKey(notificationIds: readonly string[]): string {
  const ids = [...new Set(notificationIds)].sort();
  return `notify/${createHash("sha256").update(ids.join("\n")).digest("hex")}`;
}

/**
 * What a Resend answer means for the email's rows:
 *   sent      — accepted (or already sent under this key: `invalid_idempotent_request`
 *               is the same rows' key with a re-rendered body);
 *   retry     — another run is sending these rows right now;
 *   retryStop — the provider cannot send now (no answer, 429 / quota, 5xx) or is
 *               misconfigured (401 / 403: key, sending domain): try again later and
 *               send no more email this run;
 *   dropped   — `validation_error` (the address or message is refused for good);
 *   failed    — anything else: counted as an attempt and backed off.
 */
export type NotifyEmailVerdict = "sent" | "retry" | "retryStop" | "dropped" | "failed";

const RETRY_STOP_NAMES = new Set([
  "rate_limit_exceeded", "daily_quota_exceeded", "monthly_quota_exceeded", "internal_server_error", "application_error",
  "missing_api_key", "invalid_api_key", "restricted_api_key", "invalid_from_address", "invalid_access", "security_error",
]);

export function notifyEmailVerdict(error: NotifyEmailError | null): NotifyEmailVerdict {
  if (!error) return "sent";
  const { name, statusCode } = error;
  if (name === "invalid_idempotent_request") return "sent";
  if (name === "concurrent_idempotent_requests") return "retry";
  if (statusCode === null || statusCode === 401 || statusCode === 403 || statusCode === 429 || statusCode >= 500) return "retryStop";
  if (RETRY_STOP_NAMES.has(name)) return "retryStop";
  if (name === "validation_error") return "dropped";
  return "failed";
}
