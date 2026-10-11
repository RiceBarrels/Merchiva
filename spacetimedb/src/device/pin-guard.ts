// The writes of the punch-PIN attempt limiter (arithmetic: ./pin-limit.ts).
//
// Order inside every limited reducer: lockedUntil → shape check → compare →
// on a miss recordPinMiss + a result row, and RETURN (a throw would roll the
// miss back). While locked nothing is compared, a correct PIN included.
// A success never resets the count: an attacker could reset it with their own PIN.
//
// Runtime imports: ./pin-limit only, so Bun tests and the server-source harness load it.

import type { DriveCtx } from '../drive/types';
import type { NotifyNotice } from '../notify/producers';
import {
  EMPTY_PIN_BUCKET, PIN_ORG_NOTIFY_FAILURES, afterOrgPinFailure, afterPinFailure, pinBucketKey, pinBucketStale,
  pinLockedUntil, pinNotifyDue, pinOrgBucketKey, type PinBucket,
} from './pin-limit';

export type PinAttemptKind = 'operator' | 'manager_pin' | 'set_code';
export type PinAttemptOutcome = 'ok' | 'wrong' | 'locked' | 'in_use';

/** notifyManagersOf of ../notify/producers.ts: one notification per active owner / manager. */
export type PinNotify = (ctx: DriveCtx, organizationId: string, notice: NotifyNotice) => void;

/** Where a PIN alert opens: the team page, where a manager resets PINs and unlocks PIN entry. */
export const PIN_ALERT_LINK = '/manager/personnel/team';

/** Who is guessing: the caller's org_member id (the bucket key) and the name managers see. */
export interface PinCaller {
  memberId: string;
  name: string;
}

const nowOf = (ctx: DriveCtx): bigint => ctx.timestamp.microsSinceUnixEpoch;

function readPinBucket(ctx: DriveCtx, key: string): PinBucket {
  const row = ctx.db.pinAttemptCounter.key.find(key);
  if (row == null) return EMPTY_PIN_BUCKET;
  return {
    failures: row.failures, windowStartMicros: row.windowStartMicros,
    lockedUntilMicros: row.lockedUntilMicros, notifiedAt: row.notifiedAt,
  };
}

function writePinBucket(ctx: DriveCtx, key: string, organizationId: string, bucket: PinBucket): void {
  const row = { key, organizationId, ...bucket, updatedAt: ctx.timestamp };
  if (ctx.db.pinAttemptCounter.key.find(key) != null) ctx.db.pinAttemptCounter.key.update(row);
  else ctx.db.pinAttemptCounter.insert(row);
}

/** Drop this org's rows that no longer count (window over, no lock), the ones about to be written excepted. */
function prunePinBuckets(ctx: DriveCtx, organizationId: string, keep: readonly string[]): void {
  const now = nowOf(ctx);
  for (const row of [...ctx.db.pinAttemptCounter.byOrganizationId.filter(organizationId)]) {
    if (!keep.includes(row.key) && pinBucketStale(row, now)) ctx.db.pinAttemptCounter.delete(row);
  }
}

/** Until when `caller` may not try a PIN in this org (its own lock or the store's), or 0n when it may. */
export function pinLockedUntilFor(ctx: DriveCtx, organizationId: string, caller: PinCaller): bigint {
  const own = readPinBucket(ctx, pinBucketKey(organizationId, caller.memberId));
  const org = readPinBucket(ctx, pinOrgBucketKey(organizationId));
  return pinLockedUntil(own, org, nowOf(ctx));
}

/**
 * Count one miss by `caller` (its name is what managers see) and return the
 * lock it now holds (0n when none). Managers hear about the first lock of a
 * caller's window, and once a window when the whole store reaches the alert level.
 */
export function recordPinMiss(ctx: DriveCtx, organizationId: string, who: PinCaller, notify: PinNotify): bigint {
  const now = nowOf(ctx);
  const callerName = who.name;
  const callerKey = pinBucketKey(organizationId, who.memberId);
  const orgKey = pinOrgBucketKey(organizationId);
  prunePinBuckets(ctx, organizationId, [callerKey, orgKey]);

  let caller = afterPinFailure(readPinBucket(ctx, callerKey), now);
  if (caller.lockedUntilMicros > now && caller.notifiedAt !== caller.windowStartMicros) {
    caller = { ...caller, notifiedAt: caller.windowStartMicros };
    notify(ctx, organizationId, {
      type: 'security', title: 'PIN entry locked on a device',
      body: `${callerName || 'A device'} entered ${caller.failures} wrong PINs today, so PIN entry there is paused. ` +
        'If nobody at the store was mistyping, someone may be guessing colleagues’ PINs.',
      link: PIN_ALERT_LINK, template: 'security.pinLocked', params: { actor: callerName, count: String(caller.failures) },
      email: true, sourceKind: 'device',
    });
  }
  writePinBucket(ctx, callerKey, organizationId, caller);

  let org = afterOrgPinFailure(readPinBucket(ctx, orgKey), now);
  if (pinNotifyDue(org, PIN_ORG_NOTIFY_FAILURES)) {
    org = { ...org, notifiedAt: org.windowStartMicros };
    notify(ctx, organizationId, {
      type: 'security', title: 'Many wrong PINs at your store',
      body: `${org.failures} wrong PINs were entered at your store today. ` +
        'If this keeps up, PIN entry pauses for everyone for an hour; QR log-in keeps working.',
      link: PIN_ALERT_LINK, template: 'security.manyWrongPins', params: { count: String(org.failures) },
      email: true, sourceKind: 'device',
    });
  }
  writePinBucket(ctx, orgKey, organizationId, org);
  return pinLockedUntil(caller, org, now);
}

/** Tell ctx.sender how its attempt `requestId` went (pin_attempt_result, RLS'd to itself). */
export function writePinAttemptResult(
  ctx: DriveCtx, organizationId: string, requestId: string, kind: PinAttemptKind, outcome: PinAttemptOutcome,
  lockedUntilMicros: bigint = 0n,
): void {
  const row = { identity: ctx.sender, organizationId, requestId, kind, outcome, lockedUntilMicros, at: ctx.timestamp };
  if (ctx.db.pinAttemptResult.identity.find(ctx.sender) != null) ctx.db.pinAttemptResult.identity.update(row);
  else ctx.db.pinAttemptResult.insert(row);
}

/**
 * Forget every miss and lock in this org (a manager's "unlock PIN entry"),
 * except the bucket of `keepMemberId` when given: a manager may unlock the
 * store, never their own guessing.
 */
export function clearPinBuckets(ctx: DriveCtx, organizationId: string, keepMemberId?: string): number {
  const keep = keepMemberId === undefined ? null : pinBucketKey(organizationId, keepMemberId);
  const rows = [...ctx.db.pinAttemptCounter.byOrganizationId.filter(organizationId)].filter(r => r.key !== keep);
  for (const row of rows) ctx.db.pinAttemptCounter.delete(row);
  return rows.length;
}
