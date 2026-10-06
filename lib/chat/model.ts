// The channel workspace model: plain rows in, sidebar channels and message
// views out. No React and no SDK, so scripts/tests/chat/model.test.ts runs it
// directly; lib/spacetimedb/hooks/useChatWorkspace.ts maps live rows into it.
//
// Thread replies are chat_message rows with a chat_message_ext.threadParentId:
// they stay out of the channel's main list and its unread count, and show up
// under their parent's "N replies" instead.

import { chatMentions } from "@/spacetimedb/src/chat/logic";

export interface ConversationIn {
  id: string;
  organizationId: string;
  type: "direct" | "group";
  name: string | null;
  updatedAt: number;
}
export interface MemberIn { conversationId: string; userHex: string; joinedAt: number }
export interface MessageIn {
  id: string;
  conversationId: string;
  senderHex: string;
  content: string;
  createdAt: number;
  replyToId: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  isMerchiva: boolean;
}
export interface ExtIn {
  messageId: string;
  threadParentId: string;
  editedAt: number | null;
  pinnedBy: string;
  pinnedAt: number | null;
  deletedAt: number | null;
}
export interface ReactionIn { messageId: string; userHex: string; emoji: string; createdAt: number }
export interface StateIn { conversationId: string; lastReadAt: number; muted: boolean; starred: boolean }
export interface Person { hex: string; name: string; role: string; avatarUrl: string | null }

export interface ChatRowsIn {
  meHex: string;
  organizationId: string;
  conversations: ConversationIn[];
  members: MemberIn[];
  messages: MessageIn[];
  exts: ExtIn[];
  reactions: ReactionIn[];
  topics: Map<string, string>;
  states: StateIn[];
  people: Map<string, Person>;
}

export interface ReactionGroup { emoji: string; count: number; mine: boolean; userHexes: string[] }
export interface ThreadSummary { count: number; lastReplyAt: number; participantHexes: string[] }

export interface ChatEntry {
  id: string;
  conversationId: string;
  senderHex: string;
  isMerchiva: boolean;
  isMine: boolean;
  content: string;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
  pinnedAt: number | null;
  pinnedBy: string;
  replyToId: string | null;
  threadParentId: string;
  attachment: { url: string; type: string; name: string } | null;
  reactions: ReactionGroup[];
  thread: ThreadSummary | null;
  mentionsMe: boolean;
}

export interface ChatChannel {
  id: string;
  type: "direct" | "group";
  /** Group name, or the other person's name in a direct message. */
  name: string;
  /** Direct messages: the other person. */
  peerHex: string | null;
  topic: string;
  memberHexes: string[];
  muted: boolean;
  starred: boolean;
  /** Everything at or before this time counts as read. */
  readUpTo: number;
  unread: number;
  mentions: number;
  lastActivity: number;
  lastMessage: ChatEntry | null;
}

export interface ChatModel {
  channels: ChatChannel[];
  channelById: Map<string, ChatChannel>;
  /** Main list (no thread replies), oldest first. */
  messagesOf: (conversationId: string) => ChatEntry[];
  /** A thread's replies, oldest first. */
  repliesOf: (parentId: string) => ChatEntry[];
  /** Pinned messages, most recently pinned first. */
  pinsOf: (conversationId: string) => ChatEntry[];
  entryById: Map<string, ChatEntry>;
}

function groupReactions(rows: ReactionIn[], meHex: string): ReactionGroup[] {
  const byEmoji = new Map<string, { first: number; users: string[] }>();
  for (const r of rows) {
    const g = byEmoji.get(r.emoji) ?? { first: r.createdAt, users: [] };
    g.first = Math.min(g.first, r.createdAt);
    if (!g.users.includes(r.userHex)) g.users.push(r.userHex);
    byEmoji.set(r.emoji, g);
  }
  return [...byEmoji.entries()]
    .sort((a, b) => a[1].first - b[1].first)
    .map(([emoji, g]) => ({ emoji, count: g.users.length, mine: g.users.includes(meHex), userHexes: g.users }));
}

const byCreated = (a: ChatEntry, b: ChatEntry) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

export function buildChatModel(input: ChatRowsIn): ChatModel {
  const { meHex, people } = input;
  const extById = new Map(input.exts.map((e) => [e.messageId, e]));
  const reactionsByMsg = new Map<string, ReactionIn[]>();
  for (const r of input.reactions) {
    const list = reactionsByMsg.get(r.messageId) ?? [];
    list.push(r);
    reactionsByMsg.set(r.messageId, list);
  }
  const membersByConv = new Map<string, MemberIn[]>();
  for (const m of input.members) {
    const list = membersByConv.get(m.conversationId) ?? [];
    if (!list.some((x) => x.userHex === m.userHex)) list.push(m);
    membersByConv.set(m.conversationId, list);
  }
  const me = people.get(meHex);
  const myCandidate = me ? [{ hex: meHex, name: me.name }] : [];

  const entryById = new Map<string, ChatEntry>();
  const mainByConv = new Map<string, ChatEntry[]>();
  const repliesByParent = new Map<string, ChatEntry[]>();
  for (const m of input.messages) {
    const ext = extById.get(m.id);
    const deleted = ext?.deletedAt != null;
    const mentions = m.senderHex === meHex || m.isMerchiva ? null : chatMentions(m.content, myCandidate);
    const entry: ChatEntry = {
      id: m.id,
      conversationId: m.conversationId,
      senderHex: m.senderHex,
      isMerchiva: m.isMerchiva,
      // Mr. Merchiva's old replies were inserted under the triggering user's identity.
      isMine: !m.isMerchiva && m.senderHex === meHex,
      content: deleted ? "" : m.content,
      createdAt: m.createdAt,
      editedAt: ext?.editedAt ?? null,
      deleted,
      pinnedAt: ext?.pinnedBy ? ext.pinnedAt ?? m.createdAt : null,
      pinnedBy: ext?.pinnedBy ?? "",
      replyToId: m.replyToId,
      threadParentId: ext?.threadParentId ?? "",
      attachment: !deleted && m.attachmentUrl
        ? { url: m.attachmentUrl, type: m.attachmentType ?? "file", name: m.attachmentName ?? "" }
        : null,
      reactions: deleted ? [] : groupReactions(reactionsByMsg.get(m.id) ?? [], meHex),
      thread: null,
      mentionsMe: !!mentions && (mentions.everyone || mentions.users.has(meHex)),
    };
    entryById.set(m.id, entry);
    const bucket = entry.threadParentId ? repliesByParent : mainByConv;
    const key = entry.threadParentId || m.conversationId;
    const list = bucket.get(key) ?? [];
    list.push(entry);
    bucket.set(key, list);
  }
  for (const list of mainByConv.values()) list.sort(byCreated);
  for (const [parentId, list] of repliesByParent) {
    list.sort(byCreated);
    const parent = entryById.get(parentId);
    if (!parent) continue;
    const participants: string[] = [];
    for (const r of list) if (!participants.includes(r.senderHex)) participants.push(r.senderHex);
    parent.thread = { count: list.length, lastReplyAt: list[list.length - 1].createdAt, participantHexes: participants };
  }

  const stateByConv = new Map(input.states.map((s) => [s.conversationId, s]));
  const channels: ChatChannel[] = [];
  for (const c of input.conversations) {
    if (c.organizationId !== input.organizationId) continue;
    const members = membersByConv.get(c.id) ?? [];
    const mine = members.find((m) => m.userHex === meHex);
    if (!mine) continue;
    const peerHex = c.type === "direct" ? members.find((m) => m.userHex !== meHex)?.userHex ?? null : null;
    const state = stateByConv.get(c.id);
    // Never opened here: everything since joining counts as unread.
    const readUpTo = state?.lastReadAt ?? mine.joinedAt;
    const main = mainByConv.get(c.id) ?? [];
    let unread = 0;
    let mentions = 0;
    const countIfNew = (e: ChatEntry, intoUnread: boolean) => {
      if (e.isMine || e.deleted || e.createdAt <= readUpTo) return;
      if (intoUnread) unread++;
      if (e.mentionsMe || c.type === "direct") mentions++;
    };
    for (const e of main) countIfNew(e, true);
    for (const e of main) for (const r of repliesByParent.get(e.id) ?? []) if (r.mentionsMe) countIfNew(r, false);
    const visible = main.filter((e) => !e.deleted);
    const last = visible[visible.length - 1] ?? null;
    channels.push({
      id: c.id,
      type: c.type,
      name: c.type === "group" ? c.name ?? "" : (peerHex && people.get(peerHex)?.name) || c.name || "",
      peerHex,
      topic: input.topics.get(c.id) ?? "",
      memberHexes: members.map((m) => m.userHex),
      muted: state?.muted ?? false,
      starred: state?.starred ?? false,
      readUpTo,
      unread,
      mentions,
      lastActivity: Math.max(c.updatedAt, last?.createdAt ?? 0),
      lastMessage: last,
    });
  }
  channels.sort((a, b) => b.lastActivity - a.lastActivity);

  return {
    channels,
    channelById: new Map(channels.map((c) => [c.id, c])),
    messagesOf: (id) => mainByConv.get(id) ?? [],
    repliesOf: (id) => repliesByParent.get(id) ?? [],
    pinsOf: (id) => [...entryById.values()]
      .filter((e) => e.conversationId === id && e.pinnedAt != null && !e.deleted)
      .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
    entryById,
  };
}

/** Sidebar sections, in Slack's order. Starred channels leave their own section. */
export function sidebarSections(channels: ChatChannel[]): { starred: ChatChannel[]; groups: ChatChannel[]; direct: ChatChannel[] } {
  const starred = channels.filter((c) => c.starred);
  const rest = channels.filter((c) => !c.starred);
  const byName = (a: ChatChannel, b: ChatChannel) => a.name.localeCompare(b.name);
  return {
    starred: [...starred].sort(byName),
    groups: rest.filter((c) => c.type === "group").sort(byName),
    direct: rest.filter((c) => c.type === "direct"),
  };
}

export interface SearchHit { entry: ChatEntry; channel: ChatChannel }

/**
 * Case-insensitive substring search over message text and attachment names,
 * newest first. `conversationId` limits it to one channel. Deleted messages
 * never match. Searches what is in the live cache, which is every message of
 * every conversation the member is in.
 */
export function searchChat(model: ChatModel, query: string, conversationId?: string, limit = 100): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const entry of model.entryById.values()) {
    if (entry.deleted) continue;
    if (conversationId && entry.conversationId !== conversationId) continue;
    const channel = model.channelById.get(entry.conversationId);
    if (!channel) continue;
    const text = `${entry.content}\n${entry.attachment?.name ?? ""}`.toLowerCase();
    if (text.includes(q)) hits.push({ entry, channel });
  }
  hits.sort((a, b) => b.entry.createdAt - a.entry.createdAt);
  return hits.slice(0, limit);
}

/** "99+" past 99, as every chat app shows it. */
export function badgeCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}
