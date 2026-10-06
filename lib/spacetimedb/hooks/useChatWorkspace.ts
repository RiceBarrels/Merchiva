"use client";

// Live rows for the channel workspace (/manager/channel), mapped into the pure
// model in lib/chat/model.ts. `meHex` is whose workspace this is: the
// signed-in identity, or the store tablet's PIN operator.

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { buildChatModel, type ChatModel, type Person } from "@/lib/chat/model";

/* eslint-disable @typescript-eslint/no-explicit-any -- SpacetimeDB row mappers */
function hex(v: any): string {
  if (!v) return "";
  return typeof v.toHexString === "function" ? v.toHexString() : String(v);
}

function ms(v: any): number {
  if (!v) return 0;
  if (typeof v.microsSinceUnixEpoch === "bigint") return Number(v.microsSinceUnixEpoch / 1000n);
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
}

function msOrNull(v: any): number | null {
  return v == null ? null : ms(v);
}

export interface ChatWorkspace {
  model: ChatModel;
  /** Active members of the organization, by identity hex. */
  people: Map<string, Person>;
  /** True once the core chat tables have their first rows from the server. */
  ready: boolean;
}

export function useChatWorkspace(organizationId: string | null, meHex: string | null): ChatWorkspace {
  const [convRows, convReady] = useTable(tables.chatConversation);
  const [memberRows, membersReady] = useTable(tables.chatMember);
  const [messageRows, messagesReady] = useTable(tables.chatMessage);
  const [reactionRows] = useTable(tables.chatReaction);
  const [extRows] = useTable(tables.chatMessageExt);
  const [infoRows] = useTable(tables.chatChannelInfo);
  const [stateRows] = useTable(tables.chatMemberState);
  const [orgMemberRows, orgReady] = useTable(tables.orgMember);
  const [userRows] = useTable(tables.user);

  const people = useMemo(() => {
    const avatarByHex = new Map<string, string>();
    for (const u of userRows as any[]) if (u.avatarUrl) avatarByHex.set(hex(u.identity), u.avatarUrl);
    const map = new Map<string, Person>();
    for (const m of orgMemberRows as any[]) {
      if (m.organizationId !== organizationId || m.status !== "active") continue;
      const h = hex(m.userId);
      map.set(h, { hex: h, name: String(m.displayName ?? ""), role: String(m.role ?? "staff"), avatarUrl: avatarByHex.get(h) ?? null });
    }
    return map;
  }, [orgMemberRows, userRows, organizationId]);

  const model = useMemo(() => buildChatModel({
    meHex: meHex ?? "",
    organizationId: organizationId ?? "",
    conversations: (convRows as any[]).map((c) => ({
      id: c.id.toString(),
      organizationId: c.organizationId,
      type: c.type === "direct" ? "direct" : "group",
      name: c.name ?? null,
      updatedAt: ms(c.updatedAt),
    })),
    members: (memberRows as any[]).map((m) => ({ conversationId: m.conversationId, userHex: hex(m.userId), joinedAt: ms(m.joinedAt) })),
    messages: (messageRows as any[]).map((r) => ({
      id: r.id.toString(),
      conversationId: r.conversationId,
      senderHex: hex(r.senderId),
      content: String(r.content ?? ""),
      createdAt: ms(r.createdAt),
      replyToId: r.replyToId ? r.replyToId.toString() : null,
      attachmentUrl: r.attachmentUrl ?? null,
      attachmentType: r.attachmentType ?? null,
      attachmentName: r.attachmentName ?? null,
      isMerchiva: r.isMerchiva === true,
    })),
    exts: (extRows as any[]).map((e) => ({
      messageId: e.messageId,
      threadParentId: e.threadParentId ?? "",
      editedAt: msOrNull(e.editedAt),
      pinnedBy: e.pinnedBy ?? "",
      pinnedAt: msOrNull(e.pinnedAt),
      deletedAt: msOrNull(e.deletedAt),
    })),
    reactions: (reactionRows as any[]).map((r) => ({ messageId: r.messageId, userHex: hex(r.userId), emoji: r.emoji, createdAt: ms(r.createdAt) })),
    topics: new Map((infoRows as any[]).map((i) => [i.conversationId as string, String(i.topic ?? "")])),
    // Self-scoped (RLS): only this connection's own rows arrive. On a store
    // machine that is the machine's account, so read / mute / star state is
    // shared by every operator — the reducers write it for ctx.sender too.
    states: (stateRows as any[])
      .map((s) => ({ conversationId: s.conversationId, lastReadAt: ms(s.lastReadAt), muted: !!s.muted, starred: !!s.starred })),
    people,
  }), [convRows, memberRows, messageRows, extRows, reactionRows, infoRows, stateRows, people, meHex, organizationId]);

  return { model, people, ready: convReady && membersReady && messagesReady && orgReady };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
