// Channel write wrappers for the reducers in spacetimedb/src/chat/reducers.ts:
// reactions, threads, edits, pins, topics, read state, mute / star, leaving
// and removing members. Sending, creating, inviting and deleting stay in
// lib/spacetimedb/actions.ts (sendMessage, createConversation,
// addMembersToConversation, deleteMessage). ChatWrites bundles what a
// conversation view writes, for the account itself or, on a store tablet,
// for its PIN / QR operator.
//
// A sibling of lib/spacetimedb/actions.ts: import from "@/lib/spacetimedb/actions/chat".
// Failures reject with the module's message ("Not a conversation member", …).

import { getConnection } from "@/lib/spacetimedb/client";
import { deleteMessage, sendMessage } from "@/lib/spacetimedb/actions";
import { currentOperatorGrant } from "@/lib/spacetimedb/actions/pin";
import { storedId } from "@/lib/merchiva/action-ids";
import { getDictionary, lookup } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

function reducers() {
  const c = getConnection();
  if (!c) {
    const match = typeof document === "undefined" ? null : document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    const raw = match ? decodeURIComponent(match[1]) : null;
    throw new Error(lookup(getDictionary(isLocale(raw) ? raw : DEFAULT_LOCALE), "toast.notConnected"));
  }
  return c.reducers;
}

/** Ids reach the module as `r.id.toString()` comparisons: always the hyphenated form. */
const id = (v: string) => storedId(v);

export function toggleChatReaction(conversationId: string, messageId: string, emoji: string): Promise<void> {
  return reducers().toggleChatReaction({ conversationId: id(conversationId), messageId: id(messageId), emoji });
}

export function editChatMessage(conversationId: string, messageId: string, content: string): Promise<void> {
  return reducers().editChatMessage({ conversationId: id(conversationId), messageId: id(messageId), content });
}

export function sendThreadReply(
  conversationId: string,
  parentId: string,
  content: string,
  attachment?: { url: string; type: string; name: string } | null,
): Promise<void> {
  return reducers().sendThreadReply({
    conversationId: id(conversationId),
    parentId: id(parentId),
    content,
    attachmentUrl: attachment?.url ?? undefined,
    attachmentType: attachment?.type ?? undefined,
    attachmentName: attachment?.name ?? undefined,
  });
}

export function setChatMessagePinned(conversationId: string, messageId: string, pinned: boolean): Promise<void> {
  return reducers().setChatMessagePinned({ conversationId: id(conversationId), messageId: id(messageId), pinned });
}

export function setChannelTopic(conversationId: string, topic: string): Promise<void> {
  return reducers().setChannelTopic({ conversationId: id(conversationId), topic });
}

export function markChatRead(conversationId: string): Promise<void> {
  return reducers().markChatRead({ conversationId: id(conversationId) });
}

export function setChatMuted(conversationId: string, muted: boolean): Promise<void> {
  return reducers().setChatMuted({ conversationId: id(conversationId), muted });
}

export function setChatStarred(conversationId: string, starred: boolean): Promise<void> {
  return reducers().setChatStarred({ conversationId: id(conversationId), starred });
}

export function leaveConversation(conversationId: string): Promise<void> {
  return reducers().leaveConversation({ conversationId: id(conversationId) });
}

/** `userHex` is the member's identity hex. */
export function removeConversationMember(conversationId: string, userHex: string): Promise<void> {
  return reducers().removeConversationMember({ conversationId: id(conversationId), userId: userHex });
}

/* eslint-disable @typescript-eslint/no-explicit-any -- SpacetimeDB row reads */
function identityHex(v: any): string {
  return typeof v?.toHexString === "function" ? v.toHexString() : String(v ?? "");
}

/**
 * The direct message between `meHex` and `peerHex` in this org, read from the
 * live cache, or null. The reducer promise resolves after the cache has the
 * rows it inserted, so this finds a conversation created a moment ago too.
 */
export function findDirectConversation(organizationId: string, meHex: string, peerHex: string): string | null {
  const c = getConnection();
  if (!c) return null;
  const members = new Map<string, Set<string>>();
  for (const m of c.db.chatMember.iter() as Iterable<any>) {
    const set = members.get(m.conversationId) ?? new Set<string>();
    set.add(identityHex(m.userId));
    members.set(m.conversationId, set);
  }
  for (const conv of c.db.chatConversation.iter() as Iterable<any>) {
    if (conv.organizationId !== organizationId || conv.type !== "direct") continue;
    const set = members.get(conv.id.toString());
    if (set && set.size === 2 && set.has(meHex) && set.has(peerHex)) return conv.id.toString();
  }
  return null;
}

/** Opens the existing direct message with `peerHex`, or starts one. Resolves with its id. */
export async function openDirectConversation(organizationId: string, meHex: string, peerHex: string): Promise<string | null> {
  const existing = findDirectConversation(organizationId, meHex, peerHex);
  if (existing) return existing;
  await reducers().createConversation({ organizationId, type: "direct", name: undefined, memberUserIds: JSON.stringify([meHex, peerHex]) });
  return findDirectConversation(organizationId, meHex, peerHex);
}

function micros(v: any): bigint {
  return typeof v?.microsSinceUnixEpoch === "bigint" ? v.microsSinceUnixEpoch : 0n;
}

/**
 * Creates a group channel (owners and managers only). Resolves with the new
 * channel's id: the newest conversation this connection's own member row
 * created under that name, so a colleague's same-named channel created at the
 * same moment is never mistaken for it.
 */
export async function createChannel(organizationId: string, name: string, memberHexes: string[]): Promise<string | null> {
  const c = getConnection();
  const before = new Set<string>();
  if (c) for (const conv of c.db.chatConversation.iter() as Iterable<any>) before.add(conv.id.toString());
  await reducers().createConversation({ organizationId, type: "group", name, memberUserIds: JSON.stringify([...new Set(memberHexes)]) });
  const after = getConnection();
  if (!after?.identity) return null;
  const myHex = after.identity.toHexString();
  let myMemberId: string | null = null;
  for (const m of after.db.orgMember.iter() as Iterable<any>) {
    // The active row, as findActiveMember picks it: a re-invited member also has the old 'removed' one.
    if (m.organizationId === organizationId && m.status === "active" && identityHex(m.userId) === myHex) myMemberId = m.id.toString();
  }
  let best: { id: string; at: bigint } | null = null;
  for (const conv of after.db.chatConversation.iter() as Iterable<any>) {
    const convId = conv.id.toString();
    if (before.has(convId) || conv.organizationId !== organizationId || conv.type !== "group" || conv.name !== name) continue;
    if (myMemberId && conv.createdBy !== myMemberId) continue;
    const at = micros(conv.createdAt);
    if (!best || at > best.at) best = { id: convId, at };
  }
  return best?.id ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ChatAttachment = { url: string; type: string; name: string };

/**
 * What a conversation view writes. ACCOUNT_CHAT_WRITES writes as the signed-in account;
 * OPERATOR_CHAT_WRITES, on a store tablet, as the member its latest log-in resolved — the module
 * attributes those to that member and marks them as sent from the store.
 */
export interface ChatWrites {
  send(conversationId: string, content: string, attachment?: ChatAttachment | null, voiceTranscript?: string | null): Promise<void>;
  threadReply(conversationId: string, parentId: string, content: string, attachment?: ChatAttachment | null): Promise<void>;
  react(conversationId: string, messageId: string, emoji: string): Promise<void>;
  edit(conversationId: string, messageId: string, content: string): Promise<void>;
  remove(conversationId: string, messageId: string): Promise<void>;
  pin(conversationId: string, messageId: string, pinned: boolean): Promise<void>;
}

export const ACCOUNT_CHAT_WRITES: ChatWrites = {
  send: (conversationId, content, attachment, voiceTranscript) => sendMessage(conversationId, content, undefined, attachment, voiceTranscript),
  threadReply: sendThreadReply,
  react: toggleChatReaction,
  edit: editChatMessage,
  remove: deleteMessage,
  pin: setChatMessagePinned,
};

/** The store tablet's current operator grant; without one nobody is logged in to write for. */
function grantId(): string {
  const grant = currentOperatorGrant();
  if (!grant) throw new Error("NO_OPERATOR_SESSION");
  return grant;
}

export const OPERATOR_CHAT_WRITES: ChatWrites = {
  send: (conversationId, content, attachment, voiceTranscript) => reducers().sendOperatorMessage({
    grantId: grantId(),
    conversationId: id(conversationId),
    content,
    replyToId: undefined,
    attachmentUrl: attachment?.url ?? undefined,
    attachmentType: attachment?.type ?? undefined,
    attachmentName: attachment?.name ?? undefined,
    voiceTranscript: voiceTranscript ?? undefined,
  }),
  threadReply: (conversationId, parentId, content, attachment) => reducers().sendOperatorThreadReply({
    grantId: grantId(),
    conversationId: id(conversationId),
    parentId: id(parentId),
    content,
    attachmentUrl: attachment?.url ?? undefined,
    attachmentType: attachment?.type ?? undefined,
    attachmentName: attachment?.name ?? undefined,
  }),
  react: (conversationId, messageId, emoji) => reducers().toggleOperatorChatReaction({
    grantId: grantId(), conversationId: id(conversationId), messageId: id(messageId), emoji,
  }),
  edit: (conversationId, messageId, content) => reducers().editOperatorChatMessage({
    grantId: grantId(), conversationId: id(conversationId), messageId: id(messageId), content,
  }),
  remove: (conversationId, messageId) => reducers().deleteOperatorMessage({
    grantId: grantId(), conversationId: id(conversationId), messageId: id(messageId),
  }),
  pin: (conversationId, messageId, pinned) => reducers().setOperatorChatMessagePinned({
    grantId: grantId(), conversationId: id(conversationId), messageId: id(messageId), pinned,
  }),
};
