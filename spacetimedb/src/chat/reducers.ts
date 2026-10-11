// Channel reducers beyond send / create: reactions, threads, edits, pins,
// topics, read state, mute / star, leaving and removing members — plus the
// helpers sendMessage and deleteMessage in ../index.ts share with them.
// index.ts wires them: `export const { … } = defineChatReducers(spacetimedb, deps)`.
//
// Every reducer proves ctx.sender is in the conversation first: chat RLS is
// membership-scoped, and these rows are only as private as that check.
// Group membership is managed by owners and managers only (they create,
// invite and remove); anyone may leave a group on their own.
//
// Runtime imports: the pure ./logic and ../notify/logic, ./notify (channel
// notifications) and ../notify/deliver; the SDK values arrive through ChatDeps.

import type { InferSchema, ReducerCtx, SenderError as SenderErrorCtor, t as TypeBuilders } from 'spacetimedb/server';
import type { Identity as IdentityCtor, Uuid } from 'spacetimedb';
import type Schema from '../index';
import {
  CHAT_EDIT_MAX_LENGTH, CHAT_REACTIONS_PER_MESSAGE, CHAT_TOPIC_MAX_LENGTH, chatMemberStateId,
  isChannelManagerRole, isValidReactionEmoji,
} from './logic';
import { notifyChatMessage, notifyChatPin } from './notify';
import { notifyReadConversation } from '../notify/deliver';
import { notifyFollowId } from '../notify/logic';

export type ChatSchema = typeof Schema;
export type ChatCtx = ReducerCtx<InferSchema<ChatSchema>>;
type ConversationRow = NonNullable<ReturnType<ChatCtx['db']['chatConversation']['id']['find']>>;
type MessageRow = NonNullable<ReturnType<ChatCtx['db']['chatMessage']['id']['find']>>;
type MessageExtRow = NonNullable<ReturnType<ChatCtx['db']['chatMessageExt']['messageId']['find']>>;
type IdentityValue = MessageRow['senderId'];

/** What the factory needs from index.ts. Injected, so this file never imports index.ts at runtime. */
export interface ChatDeps {
  t: typeof TypeBuilders;
  SenderError: typeof SenderErrorCtor;
  Identity: typeof IdentityCtor;
  findById: <Row>(tbl: { id: { find(key: Uuid): Row | undefined } }, id: string) => Row | undefined;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

export function isChatMember(ctx: ChatCtx, conversationId: string, who: IdentityValue): boolean {
  for (const m of ctx.db.chatMember.byUserId.filter(who)) {
    if (m.conversationId === conversationId) return true;
  }
  return false;
}

/** ctx.sender's active org_member row in the conversation's org, if any. */
function callerOrgMember(ctx: ChatCtx, organizationId: string) {
  for (const m of ctx.db.orgMember.byUserId.filter(ctx.sender)) {
    if (m.organizationId === organizationId && m.status === 'active') return m;
  }
  return undefined;
}

function messageInConversation(ctx: ChatCtx, conversationId: string, messageId: string): MessageRow | undefined {
  for (const m of ctx.db.chatMessage.byConversationId.filter(conversationId)) {
    if (m.id.toString() === messageId) return m;
  }
  return undefined;
}

function extOf(ctx: ChatCtx, messageId: string): MessageExtRow | undefined {
  return ctx.db.chatMessageExt.messageId.find(messageId) ?? undefined;
}

/** Writes the ext row, and drops it once it says nothing a plain message would not. */
function putExt(ctx: ChatCtx, row: MessageExtRow): void {
  const empty = row.threadParentId === '' && row.editedAt == null && row.pinnedBy === '' && row.deletedAt == null;
  const existing = extOf(ctx, row.messageId);
  if (empty) {
    if (existing) ctx.db.chatMessageExt.delete(existing);
  } else if (existing) {
    ctx.db.chatMessageExt.messageId.update(row);
  } else {
    ctx.db.chatMessageExt.insert(row);
  }
}

function blankExt(messageId: string, conversationId: string): MessageExtRow {
  return {
    messageId, conversationId, threadParentId: '',
    editedAt: undefined, pinnedBy: '', pinnedAt: undefined, deletedAt: undefined,
  };
}

function threadReplies(ctx: ChatCtx, parentId: string): MessageExtRow[] {
  return [...ctx.db.chatMessageExt.byThreadParentId.filter(parentId)];
}

function dropReactions(ctx: ChatCtx, messageId: string): void {
  for (const r of [...ctx.db.chatReaction.byMessageId.filter(messageId)]) ctx.db.chatReaction.delete(r);
}

/**
 * `who` leaves the conversation, with their read state. Their unread
 * notifications of it are read and owe nothing more: markChatRead takes a
 * member, so nothing they can open would clear those dots afterwards.
 */
function dropMembership(ctx: ChatCtx, deps: ChatDeps, conversationId: string, who: IdentityValue): void {
  for (const m of [...ctx.db.chatMember.byUserId.filter(who)]) {
    if (m.conversationId !== conversationId) continue;
    const idx = ctx.db.chatMembershipIndex.chatMemberId.find(m.id.toString());
    if (idx) ctx.db.chatMembershipIndex.delete(idx);
    ctx.db.chatMember.delete(m);
  }
  const state = ctx.db.chatMemberState.id.find(chatMemberStateId(conversationId, who.toHexString()));
  if (state) ctx.db.chatMemberState.delete(state);
  notifyReadConversation(ctx, deps, conversationId, who);
}

/**
 * Deletes a message with its reactions and side row. A thread parent that
 * still has replies is kept as a tombstone instead, so the thread survives;
 * deleting the last reply of a tombstoned parent removes the parent too.
 */
export function deleteChatMessageCascade(ctx: ChatCtx, message: MessageRow): void {
  const id = message.id.toString();
  const ext = extOf(ctx, id);
  dropReactions(ctx, id);
  if (threadReplies(ctx, id).length > 0) {
    ctx.db.chatMessage.id.update({
      ...message, content: '', attachmentUrl: undefined, attachmentType: undefined, attachmentName: undefined,
      voiceTranscript: undefined,
    });
    putExt(ctx, { ...(ext ?? blankExt(id, message.conversationId)), pinnedBy: '', pinnedAt: undefined, deletedAt: ctx.timestamp });
    return;
  }
  if (ext) ctx.db.chatMessageExt.delete(ext);
  ctx.db.chatMessage.delete(message);
  const parentId = ext?.threadParentId ?? '';
  if (!parentId) return;
  const parentExt = extOf(ctx, parentId);
  if (parentExt?.deletedAt != null && threadReplies(ctx, parentId).length === 0) {
    const parent = messageInConversation(ctx, message.conversationId, parentId);
    ctx.db.chatMessageExt.delete(parentExt);
    if (parent) ctx.db.chatMessage.delete(parent);
  }
}

/**
 * Moves the identity-keyed chat rows from `from` to `to` (a
 * re-login under a new identity). Run BEFORE the chat_member rows move: the
 * conversations are found through the old identity's memberships.
 */
export function rekeyChatIdentity(ctx: ChatCtx, from: IdentityValue, to: IdentityValue): void {
  const fromHex = from.toHexString();
  const toHex = to.toHexString();
  const conversations = new Set([...ctx.db.chatMember.byUserId.filter(from)].map((m) => m.conversationId));
  for (const conversationId of conversations) {
    const state = ctx.db.chatMemberState.id.find(chatMemberStateId(conversationId, fromHex));
    if (state) {
      ctx.db.chatMemberState.delete(state);
      const id = chatMemberStateId(conversationId, toHex);
      if (!ctx.db.chatMemberState.id.find(id)) ctx.db.chatMemberState.insert({ ...state, id, userId: to });
    }
    for (const r of [...ctx.db.chatReaction.byConversationId.filter(conversationId)]) {
      if (r.userId.isEqual(from)) ctx.db.chatReaction.id.update({ ...r, userId: to });
    }
    for (const e of [...ctx.db.chatMessageExt.byConversationId.filter(conversationId)]) {
      if (e.pinnedBy === fromHex) ctx.db.chatMessageExt.messageId.update({ ...e, pinnedBy: toHex });
    }
  }
  // Follows, both ways (chat_follow ids carry both identities). A follow of oneself is dropped.
  for (const f of [...ctx.db.chatFollow.byUserId.filter(from)]) {
    ctx.db.chatFollow.id.delete(f.id);
    const id = notifyFollowId(f.organizationId, toHex, f.targetHex);
    if (f.targetHex !== toHex && ctx.db.chatFollow.id.find(id) == null) ctx.db.chatFollow.insert({ ...f, id, userId: to });
  }
  for (const f of [...ctx.db.chatFollow.byTargetHex.filter(fromHex)]) {
    ctx.db.chatFollow.id.delete(f.id);
    const id = notifyFollowId(f.organizationId, f.userId.toHexString(), toHex);
    if (!f.userId.isEqual(to) && ctx.db.chatFollow.id.find(id) == null) ctx.db.chatFollow.insert({ ...f, id, targetHex: toHex });
  }
}

// ─── Reducers ────────────────────────────────────────────────────────────────

export function defineChatReducers(spacetimedb: ChatSchema, deps: ChatDeps) {
  const { t, SenderError, Identity, findById } = deps;

  const requireMember = (ctx: ChatCtx, conversationId: string): ConversationRow => {
    if (!isChatMember(ctx, conversationId, ctx.sender)) throw new SenderError('Not a conversation member');
    const conv = findById(ctx.db.chatConversation, conversationId);
    if (!conv) throw new SenderError('Conversation not found');
    return conv;
  };

  const requireChannelManager = (ctx: ChatCtx, conv: ConversationRow): void => {
    const me = callerOrgMember(ctx, conv.organizationId);
    if (!me || !isChannelManagerRole(me.role)) throw new SenderError('Only an owner or manager can do this');
  };

  const requireMessage = (ctx: ChatCtx, conversationId: string, messageId: string): MessageRow => {
    const msg = messageInConversation(ctx, conversationId, messageId);
    if (!msg) throw new SenderError('Message not found');
    return msg;
  };

  /** Adds ctx.sender's reaction, or removes it when it is already there. */
  const toggleChatReaction = spacetimedb.reducer(
    { conversationId: t.string(), messageId: t.string(), emoji: t.string() },
    (ctx, { conversationId, messageId, emoji }) => {
      requireMember(ctx, conversationId);
      if (!isValidReactionEmoji(emoji)) throw new SenderError('Invalid reaction');
      const msg = requireMessage(ctx, conversationId, messageId);
      if (extOf(ctx, messageId)?.deletedAt != null) throw new SenderError('Message was deleted');
      const id = msg.id.toString();
      const rows = [...ctx.db.chatReaction.byMessageId.filter(id)];
      const mine = rows.find((r) => r.emoji === emoji && r.userId.isEqual(ctx.sender));
      if (mine) {
        ctx.db.chatReaction.delete(mine);
        return;
      }
      const kinds = new Set(rows.map((r) => r.emoji));
      if (!kinds.has(emoji) && kinds.size >= CHAT_REACTIONS_PER_MESSAGE) throw new SenderError('Too many reactions');
      ctx.db.chatReaction.insert({
        id: ctx.newUuidV4(), conversationId, messageId: id, userId: ctx.sender, emoji, createdAt: ctx.timestamp,
      });
    }
  );

  /** Replaces the text of one of ctx.sender's own messages. */
  const editChatMessage = spacetimedb.reducer(
    { conversationId: t.string(), messageId: t.string(), content: t.string() },
    (ctx, { conversationId, messageId, content }) => {
      requireMember(ctx, conversationId);
      const msg = requireMessage(ctx, conversationId, messageId);
      if (!msg.senderId.isEqual(ctx.sender) || msg.isMerchiva === true) {
        throw new SenderError('Can only edit your own messages');
      }
      const ext = extOf(ctx, messageId);
      if (ext?.deletedAt != null) throw new SenderError('Message was deleted');
      const text = content.trim();
      if (!text && !msg.attachmentUrl) throw new SenderError('Message is empty');
      if (text.length > CHAT_EDIT_MAX_LENGTH) throw new SenderError('Message is too long');
      if (text === msg.content) return;
      ctx.db.chatMessage.id.update({ ...msg, content: text });
      putExt(ctx, { ...(ext ?? blankExt(messageId, conversationId)), editedAt: ctx.timestamp });
    }
  );

  /**
   * Replies in a message's thread. Threads are one level deep: replying to a
   * reply lands in the same thread. Notifies the thread's participants (the
   * parent's author and everyone who replied), anyone named with `@Name` and
   * anyone following the sender.
   */
  const sendThreadReply = spacetimedb.reducer(
    {
      conversationId: t.string(),
      parentId: t.string(),
      content: t.string(),
      attachmentUrl: t.option(t.string()),
      attachmentType: t.option(t.string()),
      attachmentName: t.option(t.string()),
    },
    (ctx, { conversationId, parentId, content, attachmentUrl, attachmentType, attachmentName }) => {
      const conv = requireMember(ctx, conversationId);
      if (!content.trim() && !attachmentUrl) throw new SenderError('Message is empty');
      let root = requireMessage(ctx, conversationId, parentId);
      const rootParent = extOf(ctx, root.id.toString())?.threadParentId ?? '';
      if (rootParent) root = requireMessage(ctx, conversationId, rootParent);
      const rootId = root.id.toString();

      const message = ctx.db.chatMessage.insert({
        id: ctx.newUuidV4(), conversationId, senderId: ctx.sender, content, createdAt: ctx.timestamp,
        replyToId: undefined, attachmentUrl, attachmentType, attachmentName,
        isMerchiva: undefined, voiceTranscript: undefined,
      });
      putExt(ctx, { ...blankExt(message.id.toString(), conversationId), threadParentId: rootId });

      const participants: IdentityValue[] = [root.senderId];
      for (const reply of threadReplies(ctx, rootId)) {
        const m = messageInConversation(ctx, conversationId, reply.messageId);
        if (m) participants.push(m.senderId);
      }
      notifyChatMessage(ctx, conv, message, participants);
    }
  );

  /**
   * Pins or unpins a message. Any member may, as in most team chats. The
   * first pin of a message tells the conversation (notifyChatPin), once ever.
   */
  const setChatMessagePinned = spacetimedb.reducer(
    { conversationId: t.string(), messageId: t.string(), pinned: t.bool() },
    (ctx, { conversationId, messageId, pinned }) => {
      const conv = requireMember(ctx, conversationId);
      const msg = requireMessage(ctx, conversationId, messageId);
      const ext = extOf(ctx, messageId) ?? blankExt(messageId, conversationId);
      if (ext.deletedAt != null) throw new SenderError('Message was deleted');
      putExt(ctx, pinned
        ? { ...ext, pinnedBy: ctx.sender.toHexString(), pinnedAt: ctx.timestamp }
        : { ...ext, pinnedBy: '', pinnedAt: undefined });
      if (pinned && ext.pinnedBy === '') notifyChatPin(ctx, conv, msg);
    }
  );

  /** Sets a group channel's topic ('' clears it). Owners and managers only. */
  const setChannelTopic = spacetimedb.reducer(
    { conversationId: t.string(), topic: t.string() },
    (ctx, { conversationId, topic }) => {
      const conv = requireMember(ctx, conversationId);
      if (conv.type !== 'group') throw new SenderError('Only channels have a topic');
      requireChannelManager(ctx, conv);
      const text = topic.trim();
      if (text.length > CHAT_TOPIC_MAX_LENGTH) throw new SenderError('Topic is too long');
      const me = callerOrgMember(ctx, conv.organizationId);
      const row = {
        conversationId, organizationId: conv.organizationId, topic: text,
        updatedBy: me ? me.id.toString() : '', updatedAt: ctx.timestamp,
      };
      const existing = ctx.db.chatChannelInfo.conversationId.find(conversationId);
      if (existing) ctx.db.chatChannelInfo.conversationId.update(row);
      else ctx.db.chatChannelInfo.insert(row);
    }
  );

  const putState = (
    ctx: ChatCtx,
    conversationId: string,
    patch: { lastReadAt?: ChatCtx['timestamp']; muted?: boolean; starred?: boolean },
  ): void => {
    const id = chatMemberStateId(conversationId, ctx.sender.toHexString());
    const existing = ctx.db.chatMemberState.id.find(id);
    const row = {
      id, conversationId, userId: ctx.sender,
      lastReadAt: patch.lastReadAt ?? existing?.lastReadAt ?? ctx.timestamp,
      muted: patch.muted ?? existing?.muted ?? false,
      starred: patch.starred ?? existing?.starred ?? false,
    };
    if (existing) ctx.db.chatMemberState.id.update(row);
    else ctx.db.chatMemberState.insert(row);
  };

  /**
   * Marks everything in the conversation up to now as read by ctx.sender,
   * its notifications included (their delivery rows go: no email, no push).
   */
  const markChatRead = spacetimedb.reducer(
    { conversationId: t.string() },
    (ctx, { conversationId }) => {
      requireMember(ctx, conversationId);
      putState(ctx, conversationId, { lastReadAt: ctx.timestamp });
      notifyReadConversation(ctx, deps, conversationId);
    }
  );

  const setChatMuted = spacetimedb.reducer(
    { conversationId: t.string(), muted: t.bool() },
    (ctx, { conversationId, muted }) => {
      requireMember(ctx, conversationId);
      putState(ctx, conversationId, { muted });
    }
  );

  const setChatStarred = spacetimedb.reducer(
    { conversationId: t.string(), starred: t.bool() },
    (ctx, { conversationId, starred }) => {
      requireMember(ctx, conversationId);
      putState(ctx, conversationId, { starred });
    }
  );

  /** ctx.sender leaves a group channel. Rejoining takes an owner's or manager's invitation. */
  const leaveConversation = spacetimedb.reducer(
    { conversationId: t.string() },
    (ctx, { conversationId }) => {
      const conv = requireMember(ctx, conversationId);
      if (conv.type !== 'group') throw new SenderError('You cannot leave a direct message');
      dropMembership(ctx, deps, conversationId, ctx.sender);
    }
  );

  /** An owner or manager removes someone else from a group channel. */
  const removeConversationMember = spacetimedb.reducer(
    { conversationId: t.string(), userId: t.string() },
    (ctx, { conversationId, userId }) => {
      const conv = requireMember(ctx, conversationId);
      if (conv.type !== 'group') throw new SenderError('Only channels have members to remove');
      requireChannelManager(ctx, conv);
      const target = new Identity(userId);
      if (target.isEqual(ctx.sender)) throw new SenderError('Leave the channel instead');
      if (!isChatMember(ctx, conversationId, target)) throw new SenderError('Not a member of this channel');
      dropMembership(ctx, deps, conversationId, target);
    }
  );

  return {
    toggleChatReaction, editChatMessage, sendThreadReply, setChatMessagePinned, setChannelTopic,
    markChatRead, setChatMuted, setChatStarred, leaveConversation, removeConversationMember,
  };
}
