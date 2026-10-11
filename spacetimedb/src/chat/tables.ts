// Channel side tables: reactions, threads / edits / pins / tombstones, channel
// topics, each member's read / mute / star state, and which messages a store
// tablet sent for its operator.
//
// Side tables rather than new chat_message / chat_conversation columns: the
// SDK decodes rows positionally, so a trailing column on a table older clients
// already subscribe to breaks every one of them (RangeError on decode). A
// client that predates these tables simply never sees them — thread replies
// show up in its main list as ordinary messages, which is the safe failure.
//
// Definition only: registered in schema({...}) and given RLS rules in
// ../index.ts (chat-membership scoped, or RLS_SELF_SCOPED for
// chat_member_state); written by ./reducers.ts.
//
// Every filtered or joined column is a plain, non-option type (see "DIALECT
// LIMITS" in ../index.ts). Published: new columns go at the END.

import { t, table } from 'spacetimedb/server';

/** One row per (message, member, emoji). */
export const chatReactionTable = table(
  {
    name: 'chat_reaction',
    public: true,
    indexes: [
      // RLS join column (chat_membership_index.conversationId).
      { accessor: 'byConversationId', algorithm: 'btree', columns: ['conversationId'] },
      { accessor: 'byMessageId', algorithm: 'btree', columns: ['messageId'] },
    ],
  },
  {
    id: t.uuid().primaryKey(),
    conversationId: t.string(),
    messageId: t.string(),
    userId: t.identity(),
    emoji: t.string(),
    createdAt: t.timestamp(),
  }
);

/**
 * What chat_message cannot carry: the thread a reply belongs to, the last edit,
 * the pin, and the tombstone of a deleted thread parent. One row per message
 * that has any of these; a message without a row is a plain channel message.
 */
export const chatMessageExtTable = table(
  {
    name: 'chat_message_ext',
    public: true,
    indexes: [
      // RLS join column.
      { accessor: 'byConversationId', algorithm: 'btree', columns: ['conversationId'] },
      // A thread's replies.
      { accessor: 'byThreadParentId', algorithm: 'btree', columns: ['threadParentId'] },
    ],
  },
  {
    messageId: t.string().primaryKey(),
    conversationId: t.string(),
    threadParentId: t.string().default(''),  // '' = not a thread reply
    editedAt: t.option(t.timestamp()),
    pinnedBy: t.string().default(''),        // identity hex; '' = not pinned
    pinnedAt: t.option(t.timestamp()),
    deletedAt: t.option(t.timestamp()),      // a deleted parent kept for its thread
  }
);

/** A channel's topic. Group channels only; set by an owner or manager. */
export const chatChannelInfoTable = table(
  {
    name: 'chat_channel_info',
    public: true,
  },
  {
    conversationId: t.string().primaryKey(),
    organizationId: t.string(),
    topic: t.string(),
    updatedBy: t.string(),                   // org_member id
    updatedAt: t.timestamp(),
  }
);

/** One member's state in one conversation. Self-scoped: nobody else reads it. */
export const chatMemberStateTable = table(
  {
    name: 'chat_member_state',
    public: true,
    indexes: [
      { accessor: 'byConversationId', algorithm: 'btree', columns: ['conversationId'] },
      // RLS column (RLS_SELF_SCOPED).
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
    ],
  },
  {
    id: t.string().primaryKey(),             // `${conversationId}:${identity hex}`
    conversationId: t.string(),
    userId: t.identity(),
    lastReadAt: t.timestamp(),
    muted: t.bool(),
    starred: t.bool(),
  }
);

/**
 * Where a message was written, when that was not the author's own device: 'store' for one a
 * shared store tablet sent for its PIN / QR operator (sendOperatorMessage, sendOperatorThreadReply).
 * The client badges it and never runs it together with the author's own messages. A message
 * without a row came from its author's own device.
 */
export const chatMessageOriginTable = table(
  {
    name: 'chat_message_origin',
    public: true,
    indexes: [
      // RLS join column.
      { accessor: 'byConversationId', algorithm: 'btree', columns: ['conversationId'] },
    ],
  },
  {
    messageId: t.string().primaryKey(),
    conversationId: t.string(),
    origin: t.string(),                      // 'store'
    createdAt: t.timestamp(),
  }
);
