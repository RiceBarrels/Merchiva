// Channel notifications, each one through ../notify/deliver.ts:
//   notifyChatMessage      a new message or thread reply (sendMessage, sendThreadReply)
//   notifyMerchivaMessage  a Mr. Merchiva reply (sendMerchivaMessage): in the app, never emailed
//   notifyChatPin          the first pin of a message (setChatMessagePinned): emailed
// Who hears about a message, and who by email, is chatDelivery (./logic.ts).
// Every row links `/manager/channel?c=<id>`, which markChatRead reads back
// (notifyReadConversation).
//
// Runtime imports: the pure ./logic, ../notify/logic and ../drive/logic, and ../notify/deliver.

import type { ChatCtx } from './reducers';
import { chatDelivery, chatMemberStateId, chatMentions, isChannelManagerRole } from './logic';
import { DRIVE_OPERATOR_SESSION_TTL_MICROS } from '../drive/logic';
import { deliver, notifyFollows, notifyMicros, notifyStoreName } from '../notify/deliver';
import { notifyPreview } from '../notify/logic';

type ChatConversationRow = NonNullable<ReturnType<ChatCtx['db']['chatConversation']['id']['find']>>;
type ChatMessageRow = NonNullable<ReturnType<ChatCtx['db']['chatMessage']['id']['find']>>;
type ChatIdentity = ChatMessageRow['senderId'];

/** `{conversation}` of a channel row: the channel's name, '' for a direct message. */
function chatConversationLabel(conv: ChatConversationRow): string {
  return conv.type === 'group' ? conv.name ?? '' : '';
}

function chatChannelLink(conversationId: string): string {
  return `/manager/channel?c=${conversationId}`;
}

type ChatActiveMember = { name: string; role: string; memberId: string };

/** The organization's active members by identity hex: display name, role and member id. */
function chatActiveMembers(ctx: ChatCtx, organizationId: string): Map<string, ChatActiveMember> {
  const out = new Map<string, ChatActiveMember>();
  for (const m of ctx.db.orgMember.byOrganizationId.filter(organizationId)) {
    if (m.status === 'active') out.set(m.userId.toHexString(), { name: m.displayName, role: m.role, memberId: m.id.toString() });
  }
  return out;
}

/**
 * Whether ctx.sender's device (a store tablet) has a PIN / QR session, as
 * fresh as Drive and Forms require, for someone other than the account who is
 * not an owner or manager: they are the one typing, so the account's role must
 * not speak for them. The identity is the account's on every device, so while
 * that session is open the account's @everyone from another device stays in
 * the app too. It only ever takes an email away.
 */
function chatStaffOperator(ctx: ChatCtx, organizationId: string, sender: ChatActiveMember, active: Map<string, ChatActiveMember>): boolean {
  const op = ctx.db.deviceOperatorSession.identity.find(ctx.sender);
  if (op == null || op.organizationId !== organizationId || op.memberId === sender.memberId) return false;
  if (notifyMicros(ctx.timestamp) - notifyMicros(op.resolvedAt) > DRIVE_OPERATOR_SESSION_TTL_MICROS) return false;
  const operator = [...active.values()].find((m) => m.memberId === op.memberId);
  return operator === undefined || !isChannelManagerRole(operator.role);
}

/**
 * Notifications of `message`, just sent by its sender in `conv` (ctx.sender, or the operator a
 * store tablet sent it for). `recipients`
 * defaults to every member of the conversation; a thread reply passes its
 * participants, joined by anyone named with `@Name` and anyone following the
 * sender (still only members of the conversation). Only active members of the
 * organization are told, never the sender. chatDelivery decides, per member,
 * whether a mute holds the alert back and whether it is emailed.
 */
export function notifyChatMessage(ctx: ChatCtx, conv: ChatConversationRow, message: ChatMessageRow, recipients?: ChatIdentity[]): void {
  const conversationId = message.conversationId;
  const senderHex = message.senderId.toHexString();
  const members = [...ctx.db.chatMember.byConversationId.filter(conversationId)];
  const active = chatActiveMembers(ctx, conv.organizationId);
  const sender = active.get(senderHex);
  const mentions = chatMentions(message.content, members.map((m) => {
    const hex = m.userId.toHexString();
    return { hex, name: active.get(hex)?.name ?? '' };
  }));
  // @everyone emails only when an owner or manager says it, not a staff PIN operator on their tablet.
  const everyone = mentions.everyone && sender !== undefined && isChannelManagerRole(sender.role)
    && !chatStaffOperator(ctx, conv.organizationId, sender, active);
  const wanted = recipients ? new Set(recipients.map((r) => r.toHexString())) : null;
  const preview = notifyPreview(message.content, !!message.attachmentUrl);
  const params = {
    actor: sender?.name || notifyStoreName(ctx, conv.organizationId), preview, conversation: chatConversationLabel(conv),
  };
  const done = new Set<string>();
  for (const m of members) {
    const hex = m.userId.toHexString();
    if (hex === senderHex || done.has(hex) || !active.has(hex)) continue;
    const named = mentions.users.has(hex);
    const follows = notifyFollows(ctx, conv.organizationId, m.userId, message.senderId);
    if (wanted && !wanted.has(hex) && !named && !follows) continue;
    const state = ctx.db.chatMemberState.id.find(chatMemberStateId(conversationId, hex));
    const how = chatDelivery({ muted: state?.muted === true, named, everyone, follows });
    if (!how.notify) continue;
    done.add(hex);
    deliver(ctx, {
      organizationId: conv.organizationId, target: m.userId, type: 'team', title: sender?.name ?? 'New message',
      body: preview, link: chatChannelLink(conversationId), template: how.template, params, email: how.email,
      sourceKind: 'chat_message', sourceId: message.id.toString(), contextId: conversationId,
    });
  }
}

/** A Mr. Merchiva reply: every other member of the conversation, muted or not, in the app (and by push), never by email. */
export function notifyMerchivaMessage(ctx: ChatCtx, conv: ChatConversationRow, message: ChatMessageRow): void {
  const senderHex = ctx.sender.toHexString();
  const preview = notifyPreview(message.content, false);
  const params = { preview, conversation: chatConversationLabel(conv) };
  for (const m of [...ctx.db.chatMember.byConversationId.filter(message.conversationId)]) {
    if (m.userId.toHexString() === senderHex) continue;
    deliver(ctx, {
      organizationId: conv.organizationId, target: m.userId, type: 'team', title: 'Mr. Merchiva', body: preview,
      link: chatChannelLink(message.conversationId), template: 'chat.merchiva', params, email: false,
      sourceKind: 'chat_message', sourceId: message.id.toString(), contextId: message.conversationId,
    });
  }
}

/**
 * The first pin of `message` by `by` (ctx.sender, or a store tablet's operator; chat_pin_notice
 * remembers it, so unpinning and pinning again tells nobody twice): every active member of
 * the conversation but the pinner and those who muted it, by email too.
 */
export function notifyChatPin(ctx: ChatCtx, conv: ChatConversationRow, message: ChatMessageRow, by: ChatIdentity = ctx.sender): void {
  const messageId = message.id.toString();
  if (ctx.db.chatPinNotice.messageId.find(messageId) != null) return;
  ctx.db.chatPinNotice.insert({ messageId, createdAt: ctx.timestamp });
  const conversationId = message.conversationId;
  const active = chatActiveMembers(ctx, conv.organizationId);
  const actor = active.get(by.toHexString())?.name || notifyStoreName(ctx, conv.organizationId);
  const preview = notifyPreview(message.content, !!message.attachmentUrl);
  const params = { actor, preview, conversation: chatConversationLabel(conv) };
  const done = new Set<string>([by.toHexString()]);
  for (const m of [...ctx.db.chatMember.byConversationId.filter(conversationId)]) {
    const hex = m.userId.toHexString();
    if (done.has(hex) || !active.has(hex)) continue;
    done.add(hex);
    if (ctx.db.chatMemberState.id.find(chatMemberStateId(conversationId, hex))?.muted === true) continue;
    deliver(ctx, {
      organizationId: conv.organizationId, target: m.userId, type: 'team', title: `${actor} pinned a message`,
      body: preview, link: chatChannelLink(conversationId), template: 'chat.pin', params, email: true,
      sourceKind: 'chat_pin', sourceId: messageId, contextId: conversationId,
    });
  }
}
