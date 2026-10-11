// Write wrappers for the built-in notification reducers (spacetimedb/src/notify/reducers.ts)
// plus the two frozen ones the dots fall back to while the module predates them.
// A sibling of lib/spacetimedb/actions.ts: import from "@/lib/spacetimedb/actions/notifications".
//
// Background writes (read, delivered, identity, locale) are fire-and-forget: they
// return nothing and log a failure, because nothing on screen waits for them and a
// module that predates them rejects every call. The writes a person makes (the
// email switch, a follow, the store SOS) return the reducer's promise, which rejects
// with the module's message ("You cannot follow yourself", the SOS cooldown, …).

import { getActiveOrgId, getConnection } from "@/lib/spacetimedb/client";

/** The module's cap on one id list (markNotificationsRead / markNotificationsDelivered). */
export const NOTIFY_IDS_PER_CALL = 500;

function reducers() {
  const c = getConnection();
  if (!c) throw new Error("Not connected");
  return c.reducers;
}

function activeOrgOrEmpty(): string {
  try {
    return getActiveOrgId();
  } catch {
    return "";
  }
}

function chunks(ids: readonly string[]): string[][] {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += NOTIFY_IDS_PER_CALL) out.push(unique.slice(i, i + NOTIFY_IDS_PER_CALL));
  return out;
}

function background(label: string, run: () => Promise<unknown>): Promise<boolean> {
  try {
    return run().then(
      () => true,
      (err: unknown) => {
        console.warn(`[notify] ${label} failed:`, err);
        return false;
      },
    );
  } catch (err) {
    console.warn(`[notify] ${label} failed:`, err);
    return Promise.resolve(false);
  }
}

/**
 * Marks the caller's rows read in one call per 500 ids (the module also drops their
 * delivery rows: read means no email and no push). Resolves false when any call failed,
 * e.g. on a module that predates the reducer; never rejects.
 */
export function markNotificationsRead(ids: readonly string[]): Promise<boolean> {
  const calls = chunks(ids).map((part) =>
    background("markNotificationsRead", () => reducers().markNotificationsRead({ idsJson: JSON.stringify(part) })),
  );
  return Promise.all(calls).then((results) => results.every(Boolean));
}

/** The frozen one-row reducer, which every module version has. Never rejects. */
export function markNotificationReadOne(id: string): Promise<boolean> {
  return background("markNotificationRead", () => reducers().markNotificationRead({ notificationId: id }));
}

/**
 * Tells the module these rows were shown here (a toast in a visible, focused document or
 * an OS notification), so the cron does not push them again. Only for rows whose delivery
 * row still owes a push; the module never clears it for alert.emergency. Fire-and-forget.
 */
export function markNotificationsDelivered(ids: readonly string[]): void {
  for (const part of chunks(ids)) {
    void background("markNotificationsDelivered", () => reducers().markNotificationsDelivered({ idsJson: JSON.stringify(part) }));
  }
}

/** Records the WorkOS user id + issuer of this connection's token, for email. Fire-and-forget. */
export function syncNotificationIdentity(): void {
  void background("syncNotificationIdentity", () => reducers().syncNotificationIdentity({}));
}

/** The language notification emails are written in ('' = English). Fire-and-forget. */
export function setNotificationLocale(locale: string): void {
  void background("setNotificationLocale", () => reducers().setNotificationLocale({ locale }));
}

/** The "Email me" switch. Rejects with the module's message. */
export function setNotificationEmail(enabled: boolean): Promise<void> {
  return reducers().setNotificationEmail({ enabled });
}

/** Follow (特别关注) or unfollow a member of the active store by identity hex. Rejects with the module's message. */
export function setChatFollow(targetHex: string, followed: boolean, organizationId: string = activeOrgOrEmpty()): Promise<void> {
  return reducers().setChatFollow({ organizationId, targetHex, followed });
}

/** The store tablet's SOS button: alerts every owner and manager. Rejects with the module's message (cooldown, device). */
export function sendStoreSos(deviceId: string, organizationId: string = activeOrgOrEmpty()): Promise<void> {
  return reducers().sendStoreSos({ organizationId, deviceId });
}

/**
 * Drops this identity's push subscription row for `endpoint` (the frozen reducer; the
 * module ignores `organizationId` now, older modules scope to it). Never rejects.
 */
export function deletePushEndpoint(endpoint: string): Promise<boolean> {
  return background("deletePushSubscription", () =>
    reducers().deletePushSubscription({ organizationId: activeOrgOrEmpty(), endpoint }),
  );
}
