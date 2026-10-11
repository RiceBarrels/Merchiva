// The notifications cron's side of the delivery queue (app/api/cron/notifications):
//   claim  → which rows to push / email now, leased to one run (pushTargets filled)
//   finish → what happened to each, then release, reschedule or the done rule.
// Both are service-only reducers (./reducers.ts wires them). A claim re-checks
// every row against the database first (notifyRevalidate): an email goes out a
// minute or more after the event and cannot be recalled, so a deleted message,
// a revoked share or a departed member must not leak through it.
//
// Runtime imports: the pure ./logic and ../drive/logic, ./deliver, and the
// SDK-free helpers ensureDriveServiceReader (../drive/service) and
// isChatMember (../chat/reducers).

import { isChatMember } from '../chat/reducers';
import { DRIVE_DOC_ROLE_RANK, isOrgAdminRole } from '../drive/logic';
import { ensureDriveServiceReader } from '../drive/service';
import {
  NOTIFY_CLAIM_MAX, NOTIFY_CLAIM_PER_RECIPIENT, NOTIFY_CLAIM_SWEEP_MAX, NOTIFY_DEFER_MICROS, NOTIFY_EMAIL_MAX_AGE_MICROS,
  NOTIFY_EMAIL_MAX_ATTEMPTS, NOTIFY_EMERGENCY_TEMPLATE, NOTIFY_LEASE_MICROS, NOTIFY_PUSH_MAX_AGE_MICROS,
  NOTIFY_RETRY_MICROS, NOTIFY_UUID_RE, notifyClaimedWithout, notifyEmailAt, notifyEmailBackoffMicros,
  notifyEmailNeedsManager, notifyIsManagerTemplate, notifyNextDueAt, notifyPacingAfterEmail, notifyParseChannels,
  notifyParseFinish, notifyParseParams, notifyPreview, notifyPushAt, notifyPushTargetsJson, type NotifyPacing,
} from './logic';
import {
  notifyMicros, notifyPutDelivery, type NotifyCtx, type NotifyDeliveryRow, type NotifyDeps, type NotifyIdentity,
  type NotifyMemberRow,
} from './deliver';

/** The target's active membership in the organization, an owner / manager row first. */
function notifyActiveMemberOf(ctx: NotifyCtx, organizationId: string, target: NotifyIdentity): NotifyMemberRow | null {
  let found: NotifyMemberRow | null = null;
  for (const m of ctx.db.orgMember.byUserId.filter(target)) {
    if (m.organizationId !== organizationId || m.status !== 'active') continue;
    if (isOrgAdminRole(m.role)) return m;
    found ??= m;
  }
  return found;
}

function notifyCanViewDoc(ctx: NotifyCtx, deps: NotifyDeps, documentId: string, member: NotifyMemberRow): boolean {
  const doc = documentId ? ctx.db.document.id.find(documentId) : null;
  return doc != null && DRIVE_DOC_ROLE_RANK[deps.docRoleFor(ctx, doc, member)] >= DRIVE_DOC_ROLE_RANK.viewer;
}

/** Send-time check of one row: `keep` false → nothing may be sent; `email` false → no email; `params` re-read. */
export interface NotifyCheck { keep: boolean; email: boolean; params: string }

/**
 * Whether a row may still be sent, checked against the database now: the
 * target is still an active member (still an owner / manager for the manager
 * templates; low stock / waste email only those), still in the conversation
 * and the message still there (its preview re-read), the comment still there
 * and the document still visible to them (the comment's preview re-read too).
 * The notification row's own existence and read state are checked by the claim.
 */
export function notifyRevalidate(ctx: NotifyCtx, deps: NotifyDeps, row: NotifyDeliveryRow): NotifyCheck {
  const fail: NotifyCheck = { keep: false, email: false, params: row.params };
  const member = notifyActiveMemberOf(ctx, row.organizationId, row.targetId);
  if (!member) return fail;
  const manager = isOrgAdminRole(member.role);
  if (notifyIsManagerTemplate(row.template) && !manager) return fail;
  const email = row.email && (manager || !notifyEmailNeedsManager(row.template, row.sourceKind));
  let params = row.params;
  switch (row.sourceKind) {
    case 'chat_message':
    case 'chat_pin': {
      if (!isChatMember(ctx, row.contextId, row.targetId)) return fail;
      const message = deps.findById(ctx.db.chatMessage, row.sourceId);
      if (message == null || message.conversationId !== row.contextId) return fail;
      if (ctx.db.chatMessageExt.messageId.find(row.sourceId)?.deletedAt != null) return fail;
      params = JSON.stringify({ ...notifyParseParams(row.params), preview: notifyPreview(message.content, !!message.attachmentUrl) });
      break;
    }
    case 'doc_comment': {
      const comment = deps.findById(ctx.db.documentComment, row.sourceId);
      if (comment == null || comment.documentId !== row.contextId) return fail;
      if (!notifyCanViewDoc(ctx, deps, row.contextId, member)) return fail;
      // An edit before the email went out replaces the preview.
      params = JSON.stringify({ ...notifyParseParams(row.params), preview: notifyPreview(comment.body, false) });
      break;
    }
    case 'doc':
      if (!notifyCanViewDoc(ctx, deps, row.contextId || row.sourceId, member)) return fail;
      break;
    default:
      break;
  }
  return { keep: true, email, params };
}

function notifyPacingOf(ctx: NotifyCtx, target: NotifyIdentity): NotifyPacing | null {
  const state = ctx.db.notificationEmailState.targetId.find(target);
  return state == null ? null : { lastEmailAtMicros: state.lastEmailAtMicros, dayKey: state.dayKey, dayCount: state.dayCount };
}

function notifyRequireService(ctx: NotifyCtx, deps: NotifyDeps, runId: string): void {
  if (!deps.isServiceCaller(ctx)) throw new deps.SenderError('Service identity required');
  // The cron puts the run id into SQL.
  if (typeof runId !== 'string' || !NOTIFY_UUID_RE.test(runId)) throw new deps.SenderError('Invalid run id');
}

interface NotifyClaimRun {
  now: bigint;
  runId: string;
  served: { push: boolean; email: boolean };
  perTarget: Map<string, number>;
  pacing: Map<string, NotifyPacing | null>;
}

/**
 * One due row: release an expired lease, re-check, then claim it, reschedule
 * it or apply the done rule. True when claimed. An `urgent` row (the SOS lane)
 * neither waits for nor uses up the recipient's NOTIFY_CLAIM_PER_RECIPIENT.
 */
function notifyClaimRow(ctx: NotifyCtx, deps: NotifyDeps, stored: NotifyDeliveryRow, run: NotifyClaimRun, urgent = false): boolean {
  const table = ctx.db.notificationDelivery;
  const { now } = run;
  let row: NotifyDeliveryRow = stored;
  if (row.runId !== '') {
    // An expired lease: the run is gone. Its email attempt stays counted; a
    // push it held may have gone out, and push is one-shot.
    row = { ...row, push: row.claimed.includes('p') ? false : row.push, runId: '', claimed: '', pushTargets: '' };
  }
  const notification = deps.findById(ctx.db.notification, row.notificationId);
  // Gone, or read before it was sent: nothing is sent, and nothing is left to localize.
  if (notification == null || notification.read) {
    table.notificationId.delete(row.notificationId);
    return false;
  }
  // Owes nothing: a done row whose keep time is over (deleted), or one that
  // only now owes nothing, its lease expired (the done rule: a localized row
  // is kept until createdAt + 7 days).
  if (!row.email && !row.push) {
    notifyPutDelivery(ctx, row, now);
    return false;
  }

  const check = notifyRevalidate(ctx, deps, row);
  const pref = ctx.db.notificationPref.userId.find(row.targetId);
  const subject = pref?.subject ?? '';
  const emergency = row.template === NOTIFY_EMERGENCY_TEMPLATE;
  const created = notifyMicros(row.createdAt);
  const email = check.keep && check.email && subject !== '' && (emergency || pref?.emailEnabled !== false)
    && row.attempts < NOTIFY_EMAIL_MAX_ATTEMPTS && now - created <= NOTIFY_EMAIL_MAX_AGE_MICROS;
  const push = check.keep && row.push && now - created <= NOTIFY_PUSH_MAX_AGE_MICROS;
  row = {
    ...row, params: check.params, email, push, subject, issuer: pref?.issuer ?? '', locale: pref?.locale ?? '',
  };
  if (!row.email && !row.push) {
    notifyPutDelivery(ctx, row, now);
    return false;
  }

  const hex = row.targetId.toHexString();
  const taken = run.perTarget.get(hex) ?? 0;
  if (!urgent && taken >= NOTIFY_CLAIM_PER_RECIPIENT) {
    notifyPutDelivery(ctx, { ...row, dueAtMicros: now + NOTIFY_DEFER_MICROS }, now);
    return false;
  }
  if (!run.pacing.has(hex)) run.pacing.set(hex, notifyPacingOf(ctx, row.targetId));
  const pacing = run.pacing.get(hex) ?? null;

  let pushDue = row.push && run.served.push && now >= notifyPushAt(row.template, created);
  const emailDue = row.email && run.served.email && now >= notifyEmailAt(row.template, created, pacing, now);
  let pushTargets = '';
  if (pushDue) {
    // Every browser of the person, whichever store it subscribed under (notifyHasPushTarget);
    // newest first, so a pile of stale endpoints never crowds a live one out of the cap.
    const subs = [...ctx.db.pushSubscription.byTargetId.filter(row.targetId)]
      .sort((a, b) => {
        const am = notifyMicros(a.createdAt);
        const bm = notifyMicros(b.createdAt);
        return am === bm ? 0 : am < bm ? 1 : -1;
      });
    pushTargets = notifyPushTargetsJson(subs);
    if (pushTargets === '') {
      // Unsubscribed since: nothing to push to.
      row = { ...row, push: false };
      pushDue = false;
    }
  }
  if (pushDue || emailDue) {
    table.notificationId.update({
      ...row,
      runId: run.runId,
      claimed: (pushDue ? 'p' : '') + (emailDue ? 'e' : ''),
      pushTargets,
      attempts: row.attempts + (emailDue ? 1 : 0),
      dueAtMicros: now + NOTIFY_LEASE_MICROS,
    });
    if (!urgent) run.perTarget.set(hex, taken + 1);
    return true;
  }
  const next = notifyNextDueAt(
    { template: row.template, createdAtMicros: created, push: row.push, email: row.email }, pacing, now, run.served,
  );
  notifyPutDelivery(ctx, { ...row, dueAtMicros: next }, now);
  return false;
}

/**
 * The SOS lane first (notification_urgent): every due SOS row is claimed
 * before the time-ordered queue, so no backlog there, of any store, delays it.
 * An entry whose row is gone or owes nothing leaves the lane.
 */
function notifyClaimUrgent(ctx: NotifyCtx, deps: NotifyDeps, run: NotifyClaimRun, limit: number): number {
  const table = ctx.db.notificationDelivery;
  let claimed = 0;
  for (const entry of [...ctx.db.notificationUrgent.iter()]) {
    const row = table.notificationId.find(entry.notificationId);
    if (row != null && row.dueAtMicros <= run.now && claimed < limit && notifyClaimRow(ctx, deps, row, run, true)) claimed++;
    const after = table.notificationId.find(entry.notificationId);
    if (after == null || (!after.email && !after.push && after.runId === '')) {
      ctx.db.notificationUrgent.notificationId.delete(entry.notificationId);
    }
  }
  return claimed;
}

/**
 * serviceClaimNotificationDeliveries: leases up to `limit` due rows to run
 * `runId` for the channels the cron can serve (`channels` ⊆ 'pe'), at most
 * NOTIFY_CLAIM_PER_RECIPIENT per recipient. The SOS lane goes first; then
 * byDueAt in time order, looking at no more than 2 × limit rows that owe
 * something. Done rows past their keep time met on the way are deleted
 * without taking a slot (up to NOTIFY_CLAIM_SWEEP_MAX). Returns how many were claimed.
 */
export function notifyClaim(ctx: NotifyCtx, deps: NotifyDeps, args: { runId: string; channels: string; limit: number }): number {
  notifyRequireService(ctx, deps, args.runId);
  const served = notifyParseChannels(args.channels);
  if (!served) throw new deps.SenderError('Invalid channels');
  ensureDriveServiceReader(ctx);
  const limit = Math.min(Math.max(0, Math.floor(Number(args.limit) || 0)), NOTIFY_CLAIM_MAX);
  if (limit === 0) return 0;
  const now = notifyMicros(ctx.timestamp);
  const run: NotifyClaimRun = { now, runId: args.runId, served, perTarget: new Map(), pacing: new Map() };
  let claimed = notifyClaimUrgent(ctx, deps, run, limit);
  const due: NotifyDeliveryRow[] = [];
  const done: NotifyDeliveryRow[] = [];
  for (const row of ctx.db.notificationDelivery.byDueAt.filter(deps.u64Range(0n, now + 1n))) {
    if (row.runId === '' && !row.email && !row.push) {
      done.push(row);
      if (done.length >= NOTIFY_CLAIM_SWEEP_MAX) break;
      continue;
    }
    due.push(row);
    if (due.length >= limit * 2) break;
  }
  for (const seen of done) {
    const row = ctx.db.notificationDelivery.notificationId.find(seen.notificationId);
    if (row != null) notifyPutDelivery(ctx, row, now);
  }
  for (const seen of due) {
    if (claimed >= limit) break;
    const row = ctx.db.notificationDelivery.notificationId.find(seen.notificationId);
    if (row == null) continue;
    if (notifyClaimRow(ctx, deps, row, run)) claimed++;
  }
  return claimed;
}

/**
 * serviceFinishNotificationDeliveries: applies one report of run `runId`.
 * Rows that are gone or held by another run are skipped, never an error.
 * pushed → push is done (one-shot). emailed → email done, the recipient's
 * pacing moves (not for the SOS, which ignores pacing). emailRetry → not counted, back in 2 minutes. emailFailed →
 * back after 2 / 10 / 30 minutes, dropped at the third attempt. emailDropped →
 * email done. expired → the target's subscriptions on that endpoint go.
 * A channel is released when reported, so a run may finish push and email in
 * separate calls; a row with no claimed channel left is released, then
 * rescheduled or done.
 */
export function notifyFinish(ctx: NotifyCtx, deps: NotifyDeps, args: { runId: string; resultJson: string }): void {
  notifyRequireService(ctx, deps, args.runId);
  const result = notifyParseFinish(args.resultJson);
  if (!result) throw new deps.SenderError('Invalid result');
  const now = notifyMicros(ctx.timestamp);
  const table = ctx.db.notificationDelivery;

  const touched = new Map<string, NotifyDeliveryRow>();
  const dueAfter = new Map<string, bigint>();
  const emailedTargets = new Map<string, NotifyIdentity>();
  const held = (id: string): NotifyDeliveryRow | null => {
    const row = touched.get(id) ?? table.notificationId.find(id);
    return row != null && row.runId === args.runId ? row : null;
  };
  /** The row if it holds `channel` in this run; the outcome then releases that channel. */
  const settle = (id: string, channel: 'p' | 'e', patch: (row: NotifyDeliveryRow) => Partial<NotifyDeliveryRow>): NotifyDeliveryRow | null => {
    const row = held(id);
    if (!row || !row.claimed.includes(channel)) return null;
    const next = { ...row, ...patch(row), claimed: notifyClaimedWithout(row.claimed, channel) };
    if (channel === 'p') next.pushTargets = '';
    touched.set(id, next);
    return next;
  };

  for (const [id, endpoint] of result.expired) {
    const row = held(id);
    if (!row) continue;
    for (const sub of [...ctx.db.pushSubscription.byTargetId.filter(row.targetId)]) {
      if (sub.endpoint === endpoint) ctx.db.pushSubscription.delete(sub);
    }
  }
  for (const id of result.pushed) settle(id, 'p', () => ({ push: false }));
  for (const id of result.emailed) {
    const row = settle(id, 'e', () => ({ email: false }));
    // An SOS email passes the gap and the daily cap, so it does not use them up either.
    if (row && row.template !== NOTIFY_EMERGENCY_TEMPLATE) emailedTargets.set(row.targetId.toHexString(), row.targetId);
  }
  for (const id of result.emailRetry) {
    if (settle(id, 'e', (row) => ({ attempts: Math.max(0, row.attempts - 1) }))) dueAfter.set(id, now + NOTIFY_RETRY_MICROS);
  }
  for (const id of result.emailFailed) {
    const row = settle(id, 'e', (r) => (r.attempts >= NOTIFY_EMAIL_MAX_ATTEMPTS ? { email: false } : {}));
    if (row?.email) dueAfter.set(id, now + notifyEmailBackoffMicros(row.attempts));
  }
  for (const id of result.emailDropped) settle(id, 'e', () => ({ email: false }));

  // One digest per recipient per report: the pacing counts emails, not rows.
  const pacing = new Map<string, NotifyPacing | null>();
  for (const [hex, target] of emailedTargets) {
    const next = notifyPacingAfterEmail(notifyPacingOf(ctx, target), now);
    const stateRow = { targetId: target, ...next };
    if (ctx.db.notificationEmailState.targetId.find(target) != null) ctx.db.notificationEmailState.targetId.update(stateRow);
    else ctx.db.notificationEmailState.insert(stateRow);
    pacing.set(hex, next);
  }

  for (const [id, row] of touched) {
    if (row.claimed !== '') {
      // Still leased for the other channel.
      table.notificationId.update(row);
      continue;
    }
    const released: NotifyDeliveryRow = { ...row, runId: '', claimed: '', pushTargets: '' };
    if (!released.email && !released.push) {
      notifyPutDelivery(ctx, released, now);
      continue;
    }
    const hex = row.targetId.toHexString();
    if (!pacing.has(hex)) pacing.set(hex, notifyPacingOf(ctx, row.targetId));
    const due = dueAfter.get(id) ?? notifyNextDueAt(
      { template: released.template, createdAtMicros: notifyMicros(released.createdAt), push: released.push, email: released.email },
      pacing.get(hex) ?? null, now, { push: true, email: true },
    );
    notifyPutDelivery(ctx, { ...released, dueAtMicros: due }, now);
  }
}
