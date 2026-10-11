// deliver() — the one way the module creates a notification — and the writes
// every notification reducer shares: the done rule, what reading a
// notification does to its delivery row (read ⇒ no email, no push), and the
// index of unread channel notifications markChatRead reads (chat_notice_unread).
//
// deliver() needs nothing injected, so any module file can call it: index.ts,
// ../chat/reducers.ts, ../forms/responses.ts, ../device/*.
// Runtime imports: only the pure ./logic and ../drive/logic.

import type { InferSchema, Range, ReducerCtx, SenderError as SenderErrorCtor, t as TypeBuilders } from 'spacetimedb/server';
import type { Identity as IdentityCtor, Uuid } from 'spacetimedb';
import type Schema from '../index';
import { DRIVE_SERVICE_SCOPE, type DriveDocRole } from '../drive/logic';
import {
  NOTIFY_BODY_LIMIT, NOTIFY_KEEP_MICROS, NOTIFY_TITLE_MAX, notifyClamp, notifyDoneKeepUntil, notifyFirstDueAt,
  notifyFollowId, notifyIdText, notifyIsLocalized, notifyIsSourceKind, notifyIsTemplate, notifyIsUrgent, notifyParamsJson,
  notifyPushEndpointOk, notifyQuotaAfter, notifySafeAppPath, type NotifyQuotaKind, type NotifySourceKind, type NotifyTemplate,
} from './logic';

export type NotifySchema = typeof Schema;
export type NotifyCtx = ReducerCtx<InferSchema<NotifySchema>>;
type NotifyDb = NotifyCtx['db'];
/** A SpacetimeDB identity as stored in identity columns (ctx.sender's type). */
export type NotifyIdentity = NotifyCtx['sender'];
export type NotificationRow = NonNullable<ReturnType<NotifyDb['notification']['id']['find']>>;
export type NotifyDeliveryRow = NonNullable<ReturnType<NotifyDb['notificationDelivery']['notificationId']['find']>>;
export type NotifyMemberRow = NonNullable<ReturnType<NotifyDb['orgMember']['id']['find']>>;

/** The document fields docRoleFor reads. */
export interface NotifyDocLike { id: string; organizationId: string; ownerMemberId: string; visibility: string }

/** What the reducer factory and the claim / finish need from index.ts. Injected, so notify/ never imports index.ts at runtime. */
export interface NotifyDeps {
  t: typeof TypeBuilders;
  SenderError: typeof SenderErrorCtor;
  Identity: typeof IdentityCtor;
  findById: <Row>(tbl: { id: { find(key: Uuid): Row | undefined } }, id: string) => Row | undefined;
  /** index.ts findActiveMember: the caller's active membership (the service identity's virtual owner included). */
  findActiveMember(ctx: NotifyCtx, organizationId: string): { id: { toString(): string }; role: string };
  isServiceCaller(ctx: NotifyCtx): boolean;
  docRoleFor(ctx: NotifyCtx, doc: NotifyDocLike, member: NotifyMemberRow): DriveDocRole;
  /** The SDK `Range` [from, toExclusive) for a btree scan over a u64 column. */
  u64Range(from: bigint, toExclusive: bigint): Range<bigint>;
}

/** What one notification is: the row as old clients read it, plus how it is delivered. */
export interface NotifyInput {
  organizationId: string;
  target: NotifyIdentity;
  /** The notification row's type, as today ('team', 'time_off', 'security', …). */
  type: string;
  /** English fallback copy, as today (clamped to 140 / 500 chars). */
  title: string;
  body: string;
  /** The in-app link as today ('' or undefined = none). Stored as given; the delivery row keeps only a safe app path. */
  link?: string;
  template: NotifyTemplate;
  /** Template params (plain strings); `store` is added. */
  params?: Readonly<Record<string, string>>;
  /** Whether this notification may be emailed (the recipient's preference is checked when it is sent). */
  email: boolean;
  sourceKind?: NotifySourceKind;
  sourceId?: string;
  contextId?: string;
  /** In-app only: the notification row and nothing else (no push, no email, no delivery row). */
  inAppOnly?: boolean;
}

/** A timestamp's microseconds (SDK 2.10 `Timestamp`, or the raw wire field). */
export function notifyMicros(ts: { microsSinceUnixEpoch?: bigint; __timestamp_micros_since_unix_epoch__?: bigint }): bigint {
  return ts.microsSinceUnixEpoch ?? ts.__timestamp_micros_since_unix_epoch__ ?? 0n;
}

/** The organization's name (`store` in every row's params), '' when unknown. */
export function notifyStoreName(ctx: NotifyCtx, organizationId: string): string {
  for (const org of ctx.db.organization.byOrgIdText.filter(organizationId)) return org.name;
  return '';
}

/**
 * Whether `target` has a push subscription the cron could use. Any organization's: a
 * subscription is the person's browser, saved under whichever store was open when they
 * allowed alerts, and a member's alerts from every store go to all of their browsers.
 */
function notifyHasPushTarget(ctx: NotifyCtx, target: NotifyIdentity): boolean {
  for (const sub of ctx.db.pushSubscription.byTargetId.filter(target)) {
    if (notifyPushEndpointOk(sub.endpoint)) return true;
  }
  return false;
}

/**
 * Creates one notification. TOTAL: never throws for its own reasons, so the
 * event that produced it never fails because of it. Always inserts the
 * `notification` row exactly as producers did before (type, English copy,
 * link) — old clients read it as they always have. Adds a notification_delivery
 * row when the notification may be emailed, when the target has a push
 * subscription in the organization, or when its template is localized, as
 * far as the queue quotas allow (NOTIFY_QUOTAS; never for the SOS or a PIN
 * security alert). Returns the notification id.
 */
export function deliver(ctx: NotifyCtx, input: NotifyInput): string {
  const title = notifyClamp(String(input.title ?? ''), NOTIFY_TITLE_MAX);
  const body = notifyClamp(String(input.body ?? ''), NOTIFY_BODY_LIMIT);
  const link = typeof input.link === 'string' ? input.link : '';
  const id = ctx.newUuidV4();
  ctx.db.notification.insert({
    id,
    organizationId: input.organizationId,
    targetId: input.target,
    type: input.type,
    title,
    body,
    link: link === '' ? undefined : link,
    read: false,
    createdAt: ctx.timestamp,
  });
  const notificationId = id.toString();
  notifyIndexUnread(ctx, notificationId, link, input.target);
  if (input.inAppOnly === true) return notificationId;
  try {
    notifyQueueDelivery(ctx, notificationId, input, title, body, link);
  } catch (err) {
    // The in-app row is in; a delivery row is never worth failing the event that produced it.
    console.error(`[notify] no delivery row for ${notificationId}: ${String(err)}`);
  }
  return notificationId;
}

/** One use of a queue quota (notification_quota): false, and nothing counted, once the window's uses are spent. */
function notifyTakeQuota(ctx: NotifyCtx, kind: NotifyQuotaKind, key: string, now: bigint): boolean {
  const table = ctx.db.notificationQuota;
  const id = `${kind}:${key}`;
  const stored = table.id.find(id);
  const next = notifyQuotaAfter(kind, stored, now);
  if (next == null) return false;
  if (stored != null) table.id.update({ id, ...next });
  else table.insert({ id, ...next });
  return true;
}

function notifyQueueDelivery(ctx: NotifyCtx, notificationId: string, input: NotifyInput, title: string, body: string, link: string): void {
  const template: NotifyTemplate = notifyIsTemplate(input.template) ? input.template : 'custom';
  let email = input.email === true;
  let push = notifyHasPushTarget(ctx, input.target);
  const localized = notifyIsLocalized(template);
  if (!email && !push && !localized) return;
  const now = notifyMicros(ctx.timestamp);
  const urgent = notifyIsUrgent(template, input.type, input.sourceKind ?? '');
  if (!urgent && !template.startsWith('security.')) {
    // One claim run serves every store: a store past its quota keeps this
    // notification in the app only, and a recipient past theirs is not owed
    // more pushes or emails.
    if (!notifyTakeQuota(ctx, 'org', input.organizationId, now)) return;
    const hex = input.target.toHexString();
    if (push) push = notifyTakeQuota(ctx, 'push', hex, now);
    if (email) email = notifyTakeQuota(ctx, 'email', hex, now);
    if (!email && !push && !localized) return;
  }
  ctx.db.notificationDelivery.insert({
    notificationId,
    organizationId: input.organizationId,
    targetId: input.target,
    scope: DRIVE_SERVICE_SCOPE,
    runId: '',
    claimed: '',
    // Owing nothing (a localized in-app row only) is the done state from the start.
    dueAtMicros: email || push ? notifyFirstDueAt(template, now, push) : now + NOTIFY_KEEP_MICROS,
    template,
    params: notifyParamsJson(input.params, notifyStoreName(ctx, input.organizationId)),
    sourceKind: notifyIsSourceKind(input.sourceKind) ? input.sourceKind : '',
    sourceId: notifyIdText(input.sourceId),
    contextId: notifyIdText(input.contextId),
    title,
    body,
    link: notifySafeAppPath(link) ?? '',
    email,
    push,
    pushTargets: '',
    subject: '',
    issuer: '',
    locale: '',
    attempts: 0,
    createdAt: ctx.timestamp,
  });
  if (urgent && (email || push)) ctx.db.notificationUrgent.insert({ notificationId, createdAt: ctx.timestamp });
}

/**
 * Writes a delivery row back. One that still owes a channel is updated as
 * given; one that owes nothing follows the done rule: deleted when its
 * template needs no localization (or its keep time is over), else kept,
 * released, until createdAt + 7 days.
 */
export function notifyPutDelivery(ctx: NotifyCtx, row: NotifyDeliveryRow, now: bigint): void {
  const table = ctx.db.notificationDelivery;
  if (row.email || row.push) {
    table.notificationId.update(row);
    return;
  }
  const keepUntil = notifyDoneKeepUntil(row.template, notifyMicros(row.createdAt), now);
  if (keepUntil === null) {
    table.notificationId.delete(row.notificationId);
    return;
  }
  table.notificationId.update({ ...row, runId: '', claimed: '', pushTargets: '', dueAtMicros: keepUntil });
}

/** A notification was read or dismissed: its delivery row goes (no email, no push after that), and it leaves the unread index. */
export function notifyDropDelivery(ctx: NotifyCtx, notificationId: string): void {
  if (ctx.db.notificationDelivery.notificationId.find(notificationId) != null) {
    ctx.db.notificationDelivery.notificationId.delete(notificationId);
  }
  if (ctx.db.chatNoticeUnread.notificationId.find(notificationId) != null) {
    ctx.db.chatNoticeUnread.notificationId.delete(notificationId);
  }
}

/** ctx.sender's own notification row with this id, or null. */
export function notifyOwnNotification(ctx: NotifyCtx, deps: Pick<NotifyDeps, 'findById'>, notificationId: string): NotificationRow | null {
  const row = deps.findById(ctx.db.notification, notificationId);
  return row != null && row.targetId.isEqual(ctx.sender) ? row : null;
}

/** Whether `follower` specially follows `author` in this organization (chat_follow). */
export function notifyFollows(ctx: NotifyCtx, organizationId: string, follower: NotifyIdentity, author: NotifyIdentity): boolean {
  return ctx.db.chatFollow.id.find(notifyFollowId(organizationId, follower.toHexString(), author.toHexString())) != null;
}

// ─── Unread channel notifications (chat_notice_unread) ───────────────────────

const NOTIFY_CHANNEL_LINK = '/manager/channel?c=';
const NOTIFY_BACKFILL_MARKER = 'backfill:';
const NOTIFY_CONVERSATION_ID_MAX = 128;

/** The conversation a notification links to (`/manager/channel?c=<id>`), else ''. */
function notifyLinkedConversation(link: string | undefined): string {
  if (typeof link !== 'string' || !link.startsWith(NOTIFY_CHANNEL_LINK)) return '';
  const conversationId = link.slice(NOTIFY_CHANNEL_LINK.length);
  return conversationId.length <= NOTIFY_CONVERSATION_ID_MAX ? conversationId : '';
}

function notifyReaderKey(conversationId: string, reader: NotifyIdentity): string {
  return `${conversationId}:${reader.toHexString()}`;
}

/** deliver(): a notification linking to a conversation joins its target's unread index. Never throws. */
function notifyIndexUnread(ctx: NotifyCtx, notificationId: string, link: string, target: NotifyIdentity): void {
  const conversationId = notifyLinkedConversation(link);
  if (!conversationId) return;
  try {
    ctx.db.chatNoticeUnread.insert({ notificationId, readerKey: notifyReaderKey(conversationId, target), createdAt: ctx.timestamp });
  } catch (err) {
    console.error(`[notify] ${notificationId} not in the unread index: ${String(err)}`);
  }
}

/**
 * Once per identity: its unread channel notifications from before the index
 * existed join it (one scan of its notifications, ever), so markChatRead never
 * has to scan them. A marker row records that it was done.
 */
function notifyBackfillUnread(ctx: NotifyCtx, reader: NotifyIdentity): void {
  const index = ctx.db.chatNoticeUnread;
  const marker = `${NOTIFY_BACKFILL_MARKER}${reader.toHexString()}`;
  if (index.notificationId.find(marker) != null) return;
  for (const n of ctx.db.notification.byTargetId.filter(reader)) {
    const conversationId = n.read ? '' : notifyLinkedConversation(n.link);
    const notificationId = n.id.toString();
    if (!conversationId || index.notificationId.find(notificationId) != null) continue;
    index.insert({ notificationId, readerKey: notifyReaderKey(conversationId, reader), createdAt: n.createdAt });
  }
  index.insert({ notificationId: marker, readerKey: marker, createdAt: ctx.timestamp });
}

/**
 * `reader`'s unread notifications of one conversation (link
 * `/manager/channel?c=<id>`: messages, mentions, follows, pins) become read,
 * and their delivery rows go. Visits the unread index only. markChatRead reads
 * ctx.sender's; leaving or being removed from a conversation reads the
 * member's, as nothing they can open would clear them afterwards.
 */
export function notifyReadConversation(
  ctx: NotifyCtx, deps: Pick<NotifyDeps, 'findById'>, conversationId: string, reader: NotifyIdentity = ctx.sender,
): void {
  notifyBackfillUnread(ctx, reader);
  for (const entry of [...ctx.db.chatNoticeUnread.byReaderKey.filter(notifyReaderKey(conversationId, reader))]) {
    const found = deps.findById(ctx.db.notification, entry.notificationId);
    const n = found != null && found.targetId.isEqual(reader) ? found : null;
    if (n != null && !n.read) ctx.db.notification.id.update({ ...n, read: true });
    if (n != null) notifyDropDelivery(ctx, entry.notificationId);
    else ctx.db.chatNoticeUnread.notificationId.delete(entry.notificationId);
  }
}
