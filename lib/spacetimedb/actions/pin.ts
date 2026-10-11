// Punch-PIN writes under the attempt limiter (spacetimedb/src/device/pin-reducers.ts).
//
// Each PIN check is a reducer that never throws on a wrong PIN (that would roll
// back the miss it counts); it answers in `pin_attempt_result` under the request
// id sent here, and these wrappers wait for that row (lib/pin-attempt.ts). The
// table is subscribed on its own in lib/spacetimedb/provider.tsx.
//
// Punching never re-sends a PIN: a store tablet punches for the operator its own
// latest log-in resolved (recordOperatorPunch, by that log-in's grant id), a
// phone for its own member (recordSelfPunch).

import { getActiveOrgId, getConnection } from "@/lib/spacetimedb/client";
import { uuid } from "@/lib/utils";
import { runPinAttempt, type PinAnswer, type PinAttemptRowLike } from "@/lib/pin-attempt";
import { getDictionary, lookup } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

/* eslint-disable @typescript-eslint/no-explicit-any -- SpacetimeDB connection + row reads */
function conn(): any {
  const c = getConnection();
  if (!c) {
    const match = typeof document === "undefined" ? null : document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    const raw = match ? decodeURIComponent(match[1]) : null;
    throw new Error(lookup(getDictionary(isLocale(raw) ? raw : DEFAULT_LOCALE), "toast.notConnected"));
  }
  return c;
}

function readResult(requestId: string): () => PinAttemptRowLike | null {
  return () => {
    const table = getConnection()?.db as any;
    const rows = table?.pinAttemptResult?.iter?.();
    if (!rows) return null;
    for (const row of rows as Iterable<any>) {
      if (row.requestId === requestId) return row as PinAttemptRowLike;
    }
    return null;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function attempt(reducer: string, args: Record<string, unknown>, requestId: string = uuid()): Promise<PinAnswer> {
  return runPinAttempt(
    () => conn().reducers[reducer]({ organizationId: getActiveOrgId(), ...args, requestId }),
    readResult(requestId),
    requestId,
  );
}

/**
 * The grant id of this tablet's current operator (device_operator_grant): the
 * request id of the PIN attempt or QR log-in that resolved them. Per tablet —
 * every tablet of a store shares one identity, so the identity-wide session row
 * cannot say whom THIS tablet punches or chats for. Kept on this device beside
 * the operator itself (lib/store-device-lock.ts), so a reload goes on punching
 * and chatting for them, and dropped with them on log-out. It names nothing for
 * any other identity (the server keys it by the tablet's).
 */
const GRANT_KEY = "merchiva_operator_grant";
let operatorGrant: string | null = null;
let grantLoaded = false;

/** The grant id of this tablet's current operator, or null with nobody logged in (the store chat sends with it). */
export function currentOperatorGrant(): string | null {
  if (!grantLoaded) {
    grantLoaded = true;
    try {
      operatorGrant = typeof window === "undefined" ? null : window.localStorage.getItem(GRANT_KEY);
    } catch {
      operatorGrant = null;
    }
  }
  return operatorGrant;
}

/** This tablet's operator is now whoever log-in `grantId` resolved (null: nobody). */
export function rememberOperatorGrant(grantId: string | null): void {
  operatorGrant = grantId ? grantId.toLowerCase() : null;
  grantLoaded = true;
  try {
    if (operatorGrant) window.localStorage.setItem(GRANT_KEY, operatorGrant);
    else window.localStorage.removeItem(GRANT_KEY);
  } catch {
    // Kept in memory for this session only.
  }
}

/** PIN → the operator of this store tablet. On "ok" the module has written `device_operator_session` and a grant. */
export async function attemptOperatorPin(code: string): Promise<PinAnswer> {
  const requestId = uuid();
  const answer = await attempt("resolveDeviceOperatorAttempt", { code }, requestId);
  // A wrong PIN ends the earlier operator's session on the server; so does it here.
  rememberOperatorGrant(answer.outcome === "ok" ? requestId : null);
  return answer;
}

/** Is this the PIN of an active owner or manager of the store? ("ok" = yes) */
export function attemptManagerPin(code: string): Promise<PinAnswer> {
  return attempt("verifyManagerPinAttempt", { code });
}

/** Set your own punch code. "in_use" leaves it unchanged and counts toward the limit. */
export function setOwnPunchCode(code: string): Promise<PinAnswer> {
  return attempt("setOwnPunchInCode", { code });
}

/** Set a member's punch code (yourself, or anyone with team.edit). Answered like setOwnPunchCode. */
export function setMemberPunchCode(memberId: string, code: string): Promise<PinAnswer> {
  return attempt("setMemberPunchInCode", { memberId, code });
}

/** Punch for this tablet's operator (its latest PIN or QR log-in); `action` may be "auto". */
export async function recordOperatorPunch(action: string): Promise<void> {
  const grantId = currentOperatorGrant();
  if (!grantId) throw new Error("NO_OPERATOR_SESSION");
  return conn().reducers.recordOperatorPunch({ organizationId: getActiveOrgId(), action, grantId });
}

/** Punch for your own membership (the personal phone). */
export async function recordSelfPunch(action: string): Promise<void> {
  return conn().reducers.recordSelfPunch({ organizationId: getActiveOrgId(), action });
}

/** Owner / manager: forget the store's wrong-PIN counts and locks. */
export async function clearPinLockouts(): Promise<void> {
  return conn().reducers.clearPinLockouts({ organizationId: getActiveOrgId() });
}
