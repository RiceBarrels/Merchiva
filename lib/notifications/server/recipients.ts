// Where a notification email goes: the verified address WorkOS holds for the
// recipient's user id (the `subject` the module captured from their access
// token). The database stores no trustworthy address: org_member.email and
// user.email are empty for owners and unverified for invitees. Pure apart from
// the injected lookup.
//
// Answers are cached per process for 10 minutes (a warm function serves many
// runs); a failure that may pass is never cached.

import type { NotifyRecipient, NotifyWorkosUser } from "./types";

export const NOTIFY_RECIPIENT_TTL_MS = 10 * 60_000;
export const NOTIFY_RECIPIENT_TIMEOUT_MS = 5_000;
const NOTIFY_RECIPIENT_CACHE_MAX = 2_000;

/** One plain address, nothing a mail header could be split on. */
const ADDRESS_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export function notifyAddressOk(address: string): boolean {
  return address.length <= 254 && ADDRESS_RE.test(address);
}

/** A WorkOS SDK error's HTTP status (every RequestException carries `status`), or null (network, timeout, bug). */
function statusOf(err: unknown): number | null {
  const status = err !== null && typeof err === "object" ? (err as { status?: unknown }).status : undefined;
  return typeof status === "number" ? status : null;
}

/**
 * A failed getUser as a recipient answer: unknown user (404) or a malformed id
 * (400 / 422) → drop; anything else (5xx, 429, 401 / 403 = a bad API key, a
 * timeout, the network) → retry.
 */
export function notifyRecipientFailure(err: unknown): NotifyRecipient {
  const status = statusOf(err);
  if (status === 404) return { kind: "drop", reason: "not_found" };
  if (status === 400 || status === 422) return { kind: "drop", reason: "invalid" };
  return { kind: "retry", reason: status === null ? "network" : `status_${status}` };
}

/** A WorkOS user as a recipient answer: a verified, well-formed address, or a drop. */
export function notifyRecipientOf(user: NotifyWorkosUser): NotifyRecipient {
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (!email) return { kind: "drop", reason: "no_email" };
  if (user.emailVerified === false) return { kind: "drop", reason: "unverified" };
  if (!notifyAddressOk(email)) return { kind: "drop", reason: "invalid" };
  return { kind: "ok", email };
}

export interface NotifyRecipientLookupOptions {
  /** workos.userManagement.getUser. */
  getUser(subject: string): Promise<NotifyWorkosUser>;
  /** ms since the epoch. */
  now(): number;
  ttlMs?: number;
  timeoutMs?: number;
}

/** A cached, time-limited lookup: `resolveRecipient` of NotifyCronDeps. Never throws. */
export function createNotifyRecipientLookup(opts: NotifyRecipientLookupOptions): (subject: string) => Promise<NotifyRecipient> {
  const ttlMs = opts.ttlMs ?? NOTIFY_RECIPIENT_TTL_MS;
  const timeoutMs = opts.timeoutMs ?? NOTIFY_RECIPIENT_TIMEOUT_MS;
  const cache = new Map<string, { value: NotifyRecipient; expiresAt: number }>();

  async function fetchUser(subject: string): Promise<NotifyRecipient> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("WorkOS lookup timed out")), timeoutMs);
    });
    try {
      return notifyRecipientOf(await Promise.race([opts.getUser(subject), late]));
    } catch (err) {
      return notifyRecipientFailure(err);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return async (subject) => {
    const now = opts.now();
    const hit = cache.get(subject);
    if (hit && hit.expiresAt > now) return hit.value;
    if (hit) cache.delete(subject);
    const value = await fetchUser(subject);
    if (value.kind !== "retry") {
      if (cache.size >= NOTIFY_RECIPIENT_CACHE_MAX) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(subject, { value, expiresAt: now + ttlMs });
    }
    return value;
  };
}
