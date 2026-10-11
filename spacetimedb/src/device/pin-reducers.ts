// Punch-PIN reducers that answer through pin_attempt_result instead of a throw,
// so a wrong PIN can be counted (./pin-guard.ts). index.ts wires them:
// `export const { … } = definePinReducers(spacetimedb, pinDeps)`, and its older
// PIN reducers (resolveDeviceOperator, recordPunch, setPunchInCode) share the
// helpers below.
//
//   resolveDeviceOperatorAttempt  PIN → device_operator_session, outcome row
//   verifyManagerPinAttempt       is this an owner's / manager's PIN? outcome row
//   recordOperatorPunch           punch for the operator one log-in on this tablet granted (no PIN re-sent)
//   recordSelfPunch               punch for the caller's own membership
//   setOwnPunchInCode             set your own PIN; a code in use counts as a guess
//   setMemberPunchInCode          the same for any member (yourself, or with team.edit anyone)
//   clearPinLockouts              owner / manager: forget the store's misses and locks
//
// Runtime imports: pure ./pin-limit, ./pin-guard and ../drive/logic, so Bun
// tests load this file directly; the SDK values arrive through PinDeps.

import type { DriveCtx, DriveSchema, MemberLike, MemberRow, TypeBuilders, SenderErrorCtor } from '../drive/types';
import { DRIVE_OPERATOR_SESSION_TTL_MICROS } from '../drive/logic';
import { PIN_PATTERN } from './pin-limit';
import { requireStoreDevice } from './store-access';
import {
  PIN_ALERT_LINK, clearPinBuckets, pinLockedUntilFor, recordPinMiss, writePinAttemptResult, type PinCaller, type PinNotify,
} from './pin-guard';

/** What the factory needs from index.ts. Injected, so this file never imports index.ts at runtime. */
export interface PinDeps {
  t: typeof TypeBuilders;
  SenderError: typeof SenderErrorCtor;
  findActiveMember(ctx: DriveCtx, organizationId: string): MemberLike;
  isServiceCaller(ctx: DriveCtx): boolean;
  writeDeviceOperatorSession(ctx: DriveCtx, organizationId: string, member: MemberRow): void;
  /** The shared punch state machine; throws on an action the member's state does not allow. */
  applyPunch(ctx: DriveCtx, organizationId: string, member: { id: { toString(): string } }, action: string): void;
  notifyManagers: PinNotify;
}

/** The limiter's view of a caller: its membership (the bucket key) and the name managers see (the tablet's account on a store tablet). */
export function pinCallerOf(member: MemberLike): PinCaller {
  return { memberId: member.id.toString(), name: String((member as { displayName?: unknown }).displayName ?? '') };
}

/** The active member of this org whose punch code is `code`, or null. Call only after the lock check. */
export function activeMemberByPunchCode(ctx: DriveCtx, organizationId: string, code: string): MemberRow | null {
  const entry = [...ctx.db.memberPunchCode.byOrganizationId.filter(organizationId)].find(c => c.code === code);
  if (!entry) return null;
  const member = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
    .find(m => m.id.toString() === entry.memberId);
  return member && member.status === 'active' ? member : null;
}

/** Whether `code` is some other member's punch code in this org (setPunchInCode's uniqueness rule). */
export function punchCodeTaken(ctx: DriveCtx, organizationId: string, memberId: string, code: string): boolean {
  return [...ctx.db.memberPunchCode.byOrganizationId.filter(organizationId)]
    .some(c => c.memberId !== memberId && c.code === code);
}

/** Owners, team editors and the service identity may set anyone's code (setPunchInCode's rule). */
export function canSetAnyPunchCode(deps: Pick<PinDeps, 'isServiceCaller'>, ctx: DriveCtx, caller: MemberLike): boolean {
  if (pinLimitExempt(deps, ctx, caller)) return true;
  try {
    return JSON.parse(caller.permissions)?.team?.edit === true;
  } catch {
    return false;
  }
}

/**
 * Only an owner and the service identity learn "this code is in use" uncounted.
 * A team editor does not: setting a code tells them whether it is a colleague's
 * PIN without changing anything, and a known PIN logs anyone in at the tablet.
 */
export function pinLimitExempt(deps: Pick<PinDeps, 'isServiceCaller'>, ctx: DriveCtx, caller: MemberLike): boolean {
  return deps.isServiceCaller(ctx) || caller.role === 'owner';
}

/**
 * Store or clear `target`'s code in member_punch_code (RLS'd to its owner) and
 * keep org_member.hasPunchCode in step. The legacy punchInCode column is cleared
 * on every write so the digits can never become org-readable again.
 */
export function storePunchCode(ctx: DriveCtx, organizationId: string, target: MemberRow, code: string | undefined): void {
  const memberId = target.id.toString();
  const existing = ctx.db.memberPunchCode.memberId.find(memberId);
  if (code === undefined) {
    if (existing) ctx.db.memberPunchCode.delete(existing);
  } else if (existing) {
    ctx.db.memberPunchCode.memberId.update({
      ...existing, organizationId, userId: target.userId, code, updatedAt: ctx.timestamp,
    });
  } else {
    ctx.db.memberPunchCode.insert({ memberId, organizationId, userId: target.userId, code, updatedAt: ctx.timestamp });
  }
  const hasPunchCode = code !== undefined;
  if (target.punchInCode !== undefined || target.hasPunchCode !== hasPunchCode) {
    ctx.db.orgMember.id.update({ ...target, punchInCode: undefined, hasPunchCode });
  }
}

function dropOperatorSession(ctx: DriveCtx): void {
  const existing = ctx.db.deviceOperatorSession.identity.find(ctx.sender);
  if (existing) ctx.db.deviceOperatorSession.delete(existing);
}

/** The client's request id, bounded: it only has to match the row this call writes. */
const requestIdOf = (raw: unknown): string => String(raw ?? '').slice(0, 64);

/** device_operator_grant key: the grant is the caller's own, so a grant id from another identity matches nothing. */
export function operatorGrantKey(ctx: DriveCtx, grantId: string): string {
  return `${ctx.sender.toHexString()}:${requestIdOf(grantId)}`;
}

const grantFresh = (ctx: DriveCtx, resolvedAtMicros: bigint): boolean =>
  ctx.timestamp.microsSinceUnixEpoch - resolvedAtMicros <= DRIVE_OPERATOR_SESSION_TTL_MICROS;

/**
 * One log-in on one tablet made `memberId` its operator (./pin-tables.ts):
 * recordOperatorPunch with this grant id punches that member. Expired grants
 * of the org are pruned here, so the table stays one row per recent log-in.
 */
export function writeOperatorGrant(ctx: DriveCtx, organizationId: string, grantId: string, memberId: string): void {
  for (const row of [...ctx.db.deviceOperatorGrant.byOrganizationId.filter(organizationId)]) {
    if (!grantFresh(ctx, row.resolvedAt.microsSinceUnixEpoch)) ctx.db.deviceOperatorGrant.delete(row);
  }
  const key = operatorGrantKey(ctx, grantId);
  const row = { key, organizationId, memberId, resolvedAt: ctx.timestamp };
  if (ctx.db.deviceOperatorGrant.key.find(key) != null) ctx.db.deviceOperatorGrant.key.update(row);
  else ctx.db.deviceOperatorGrant.insert(row);
}

/**
 * The member one log-in on ctx.sender's tablet made its operator, named by that log-in's grant id:
 * the grant must be the caller's, in `organizationId`, at most DRIVE_OPERATOR_SESSION_TTL_MICROS
 * old, and its member still active. Throws NO_OPERATOR_SESSION otherwise. recordOperatorPunch and
 * the chat reducers that speak for the operator (../chat/reducers.ts, sendOperatorMessage) use it.
 */
export function operatorOfGrant(
  ctx: DriveCtx, SenderError: typeof SenderErrorCtor, organizationId: string, grantId: string,
): MemberRow {
  const grant = ctx.db.deviceOperatorGrant.key.find(operatorGrantKey(ctx, grantId));
  if (grant == null || grant.organizationId !== organizationId || !grantFresh(ctx, grant.resolvedAt.microsSinceUnixEpoch)) {
    throw new SenderError('NO_OPERATOR_SESSION');
  }
  const member = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
    .find(m => m.id.toString() === grant.memberId && m.status === 'active');
  if (!member) throw new SenderError('NO_OPERATOR_SESSION');
  return member;
}

type SetCodeOutcome = 'ok' | 'in_use' | 'locked';

/**
 * Set `target`'s code to `code` (4 digits, checked by the caller) for `caller`.
 * Codes are unique per store, so "in use" names a colleague's PIN: unless the
 * caller is exempt (pinLimitExempt), it is refused while locked and counted as
 * a miss, and the code is left unchanged. Setting a free code is not counted —
 * it tells nobody which codes are taken, and onboarding a whole store must not
 * trip the store-wide pause. Never throws after counting.
 */
export function setPunchCodeCounted(
  deps: PinDeps, ctx: DriveCtx, organizationId: string, caller: MemberLike, target: MemberRow, code: string,
): { outcome: SetCodeOutcome; lockedUntil: bigint } {
  const exempt = pinLimitExempt(deps, ctx, caller);
  if (!exempt) {
    const locked = pinLockedUntilFor(ctx, organizationId, pinCallerOf(caller));
    if (locked > 0n) return { outcome: 'locked', lockedUntil: locked };
  }
  if (punchCodeTaken(ctx, organizationId, target.id.toString(), code)) {
    const until = exempt ? 0n : recordPinMiss(ctx, organizationId, pinCallerOf(caller), deps.notifyManagers);
    return { outcome: 'in_use', lockedUntil: until };
  }
  storePunchCode(ctx, organizationId, target, code);
  return { outcome: 'ok', lockedUntil: 0n };
}

export function definePinReducers(spacetimedb: DriveSchema, deps: PinDeps) {
  const { t, SenderError } = deps;

  /**
   * PIN → the member standing at the store tablet. On a match writes
   * device_operator_session and a device_operator_grant under `requestId` (the
   * tablet then punches with that id), and the outcome to pin_attempt_result for
   * `requestId`, always without throwing: a wrong PIN is counted and also ends
   * any earlier session.
   */
  const resolveDeviceOperatorAttempt = spacetimedb.reducer(
    { organizationId: t.string(), code: t.string(), requestId: t.string() },
    (ctx, { organizationId, code, requestId }) => {
      const account = deps.findActiveMember(ctx, organizationId);
      // Only a store tablet logs people in by PIN (./store-access.ts).
      requireStoreDevice(account, SenderError);
      const caller = pinCallerOf(account);
      const id = requestIdOf(requestId);
      const locked = pinLockedUntilFor(ctx, organizationId, caller);
      if (locked > 0n) return writePinAttemptResult(ctx, organizationId, id, 'operator', 'locked', locked);
      const member = PIN_PATTERN.test(code) ? activeMemberByPunchCode(ctx, organizationId, code) : null;
      if (!member) {
        dropOperatorSession(ctx);
        // A malformed PIN tests no code, so it is not counted.
        const until = PIN_PATTERN.test(code) ? recordPinMiss(ctx, organizationId, caller, deps.notifyManagers) : 0n;
        return writePinAttemptResult(ctx, organizationId, id, 'operator', 'wrong', until);
      }
      deps.writeDeviceOperatorSession(ctx, organizationId, member);
      if (id) writeOperatorGrant(ctx, organizationId, id, member.id.toString());
      writePinAttemptResult(ctx, organizationId, id, 'operator', 'ok');
    }
  );

  /** Is `code` the PIN of an active owner or manager of this org? Answered in pin_attempt_result. */
  const verifyManagerPinAttempt = spacetimedb.reducer(
    { organizationId: t.string(), code: t.string(), requestId: t.string() },
    (ctx, { organizationId, code, requestId }) => {
      const caller = pinCallerOf(deps.findActiveMember(ctx, organizationId));
      const id = requestIdOf(requestId);
      const locked = pinLockedUntilFor(ctx, organizationId, caller);
      if (locked > 0n) return writePinAttemptResult(ctx, organizationId, id, 'manager_pin', 'locked', locked);
      if (!PIN_PATTERN.test(code)) return writePinAttemptResult(ctx, organizationId, id, 'manager_pin', 'wrong');
      const member = activeMemberByPunchCode(ctx, organizationId, code);
      if (member && (member.role === 'owner' || member.role === 'manager')) {
        return writePinAttemptResult(ctx, organizationId, id, 'manager_pin', 'ok');
      }
      const until = recordPinMiss(ctx, organizationId, caller, deps.notifyManagers);
      writePinAttemptResult(ctx, organizationId, id, 'manager_pin', 'wrong', until);
    }
  );

  /**
   * Punch for the member one log-in on this tablet made its operator, named by
   * that log-in's grant id (./pin-tables.ts), so a tablet never re-sends a PIN
   * and never punches for another tablet's operator. The grant must be the
   * caller's, in this org, at most DRIVE_OPERATOR_SESSION_TTL_MICROS old, and
   * its member still active.
   */
  const recordOperatorPunch = spacetimedb.reducer(
    { organizationId: t.string(), action: t.string(), grantId: t.string() },
    (ctx, { organizationId, action, grantId }) => {
      requireStoreDevice(deps.findActiveMember(ctx, organizationId), SenderError);
      deps.applyPunch(ctx, organizationId, operatorOfGrant(ctx, SenderError, organizationId, grantId), action);
    }
  );

  /** Punch for the caller's own membership (the personal phone, which reads its own code anyway). */
  const recordSelfPunch = spacetimedb.reducer(
    { organizationId: t.string(), action: t.string() },
    (ctx, { organizationId, action }) => {
      if (deps.isServiceCaller(ctx)) throw new SenderError('Not a member of this organization');
      const member = deps.findActiveMember(ctx, organizationId);
      deps.applyPunch(ctx, organizationId, member, action);
    }
  );

  /** Look up `memberId` in this org, refusing anyone but the caller unless they may set any member's code. */
  function punchCodeTarget(ctx: DriveCtx, organizationId: string, caller: MemberLike, memberId: string): MemberRow {
    const target = [...ctx.db.orgMember.byOrganizationId.filter(organizationId)]
      .find(m => m.id.toString() === memberId);
    if (!target) throw new SenderError('Member not found');
    if (target.id.toString() !== caller.id.toString() && !canSetAnyPunchCode(deps, ctx, caller)) {
      throw new SenderError('Cannot change another member\'s punch-in code');
    }
    return target;
  }

  /** Shared body of setOwnPunchInCode / setMemberPunchInCode: the outcome goes to pin_attempt_result. */
  function setCodeAttempt(ctx: DriveCtx, organizationId: string, caller: MemberLike, memberId: string, code: string, requestId: string): void {
    const id = requestIdOf(requestId);
    if (!PIN_PATTERN.test(code)) throw new SenderError('Code must be 4 digits');
    const target = punchCodeTarget(ctx, organizationId, caller, memberId);
    const { outcome, lockedUntil } = setPunchCodeCounted(deps, ctx, organizationId, caller, target, code);
    writePinAttemptResult(ctx, organizationId, id, 'set_code', outcome, lockedUntil);
  }

  /**
   * Set the caller's own punch code. Codes are unique per store, so "already in
   * use" names a colleague's PIN: an in-use code is counted as a guess and left
   * unchanged (setPunchCodeCounted), and the outcome ('ok' | 'in_use' | 'locked')
   * is the result row. Clearing your own code goes through setPunchInCode (it tests nothing).
   */
  const setOwnPunchInCode = spacetimedb.reducer(
    { organizationId: t.string(), code: t.string(), requestId: t.string() },
    (ctx, { organizationId, code, requestId }) => {
      if (deps.isServiceCaller(ctx)) throw new SenderError('Not a member of this organization');
      const caller = deps.findActiveMember(ctx, organizationId);
      setCodeAttempt(ctx, organizationId, caller, caller.id.toString(), code, requestId);
    }
  );

  /**
   * Set any member's punch code: your own always, anyone's with owner or
   * team.edit (setPunchInCode's rule). Answered like setOwnPunchInCode, so a
   * team editor's in-use code is counted too; only owners and the service
   * identity are exempt.
   */
  const setMemberPunchInCode = spacetimedb.reducer(
    { organizationId: t.string(), memberId: t.string(), code: t.string(), requestId: t.string() },
    (ctx, { organizationId, memberId, code, requestId }) => {
      const caller = deps.findActiveMember(ctx, organizationId);
      setCodeAttempt(ctx, organizationId, caller, memberId, code, requestId);
    }
  );

  /**
   * Owner / manager: forget the store's misses and locks, so PIN entry works
   * again at once. A manager's own bucket is kept — they may unlock the store,
   * never their own guessing — and every clear is announced to the owners and
   * managers, naming who did it.
   */
  const clearPinLockouts = spacetimedb.reducer(
    { organizationId: t.string() },
    (ctx, { organizationId }) => {
      const caller = deps.findActiveMember(ctx, organizationId);
      const service = deps.isServiceCaller(ctx);
      if (!service && caller.role !== 'owner' && caller.role !== 'manager') {
        throw new SenderError('Only an owner or manager can unlock PIN entry');
      }
      const keep = service || caller.role === 'owner' ? undefined : caller.id.toString();
      const cleared = clearPinBuckets(ctx, organizationId, keep);
      if (cleared === 0) return;
      const name = pinCallerOf(caller).name;
      deps.notifyManagers(ctx, organizationId, {
        type: 'security', title: 'PIN entry unlocked', body: `${name || 'A manager'} cleared the store's wrong-PIN counts and locks.`,
        link: PIN_ALERT_LINK, template: 'security.pinUnlocked', params: { actor: name }, email: true, sourceKind: 'device',
      });
    }
  );

  return {
    resolveDeviceOperatorAttempt, verifyManagerPinAttempt, recordOperatorPunch, recordSelfPunch,
    setOwnPunchInCode, setMemberPunchInCode, clearPinLockouts,
  };
}
