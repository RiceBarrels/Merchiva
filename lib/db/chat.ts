// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { ChatConversation, ChatMessage, ChatMember } from "@/lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function conn(): any {
  const c = getConnection();
  if (!c) return null;
  return c;
}

function orgId(): string {
  return getActiveOrgId();
}

// Convert SpacetimeDB Timestamp (or string / Date / null) to an ISO string.
function toIsoString(v: any): string {
  if (!v) return new Date(0).toISOString();
  try {
    if (typeof v === "string") return new Date(v).toISOString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (typeof v.microsSinceUnixEpoch === "bigint") {
      return new Date(Number(v.microsSinceUnixEpoch / 1000n)).toISOString();
    }
    return new Date(v).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function toDateMs(v: any): number {
  try {
    if (!v) return 0;
    if (typeof v === "string") return new Date(v).getTime();
    if (v instanceof Date) return v.getTime();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    if (typeof v.microsSinceUnixEpoch === "bigint") return Number(v.microsSinceUnixEpoch / 1000n);
    return new Date(v).getTime();
  } catch {
    return 0;
  }
}

// ─── Conversations ──────────────────────────────────────────────────────────

export async function getConversations(
  organizationId: string
): Promise<ChatConversation[]> {
  const c = conn();
  if (!c) return [];

  const currentIdentity = c.identity;
  if (!currentIdentity) return [];

  // Get all members to find conversations the current user belongs to
  const allMembers = Array.from(c.db.chatMember.iter());
  const myConvIds = new Set(
    allMembers
      .filter((m: any) => m.userId.toHexString() === currentIdentity.toHexString())
      .map((m: any) => m.conversationId)
  );

  // Get conversations for this org that the user is a member of
  const allConversations = Array.from(c.db.chatConversation.iter());
  const filtered = allConversations.filter(
    (r: any) => r.organizationId === organizationId && myConvIds.has(r.id.toString())
  );

  // Sort by updatedAt descending
  filtered.sort((a: any, b: any) => {
    const ta = new Date(a.updatedAt).getTime();
    const tb = new Date(b.updatedAt).getTime();
    return tb - ta;
  });

  // Get all messages for last-message lookup
  const allMessages = Array.from(c.db.chatMessage.iter());

  const conversations: ChatConversation[] = filtered.map((r: any) => {
    const convIdStr = r.id.toString();

    // Attach members
    const members: ChatMember[] = allMembers
      .filter((m: any) => m.conversationId === convIdStr)
      .map((m: any) => ({
        id: m.id.toString(),
        conversationId: m.conversationId,
        userId: m.userId.toHexString(),
        joinedAt: toIsoString(m.joinedAt),
      }));

    // Find last message
    const convMessages = allMessages
      .filter((msg: any) => msg.conversationId === convIdStr)
      .sort((a: any, b: any) => toDateMs(b.createdAt) - toDateMs(a.createdAt));

    const lastMsg = convMessages[0] ?? null;

    return {
      id: convIdStr,
      organizationId: r.organizationId,
      type: r.type as "direct" | "group",
      name: r.name ?? null,
      createdBy: r.createdBy ?? null,
      createdAt: toIsoString(r.createdAt),
      merchivaEnabled: r.merchivaEnabled === true,
      members,
      lastMessage: lastMsg
        ? {
            id: lastMsg.id.toString(),
            conversationId: lastMsg.conversationId,
            senderId: lastMsg.senderId.toHexString(),
            content: lastMsg.content,
            createdAt: toIsoString(lastMsg.createdAt),
            replyToId: null,
            attachmentUrl: null,
            attachmentType: null,
            attachmentName: null,
            isMerchiva: lastMsg.isMerchiva === true,
          }
        : null,
    };
  });

  return conversations;
}

export async function createConversation(
  organizationId: string,
  type: "direct" | "group",
  memberUserIds: string[],
  name?: string
): Promise<ChatConversation> {
  // For direct chats, check if one already exists between these two users
  if (type === "direct" && memberUserIds.length === 2) {
    const existing = await findDirectConversation(
      organizationId,
      memberUserIds[0],
      memberUserIds[1]
    );
    if (existing) return existing;
  }

  // Writes go through SpacetimeDB reducers via actions.ts
  console.warn("[chat] createConversation: use SpacetimeDB reducer / /api/chat route instead");
  throw new Error("Use /api/chat API route or SpacetimeDB reducer instead");
}

async function findDirectConversation(
  organizationId: string,
  userA: string,
  userB: string
): Promise<ChatConversation | null> {
  const c = conn();
  if (!c) return null;

  const allConversations = Array.from(c.db.chatConversation.iter());
  const directConvs = allConversations.filter(
    (r: any) => r.organizationId === organizationId && r.type === "direct"
  );

  const allMembers = Array.from(c.db.chatMember.iter());

  for (const conv of directConvs) {
    const convIdStr = conv.id.toString();
    const members = allMembers.filter((m: any) => m.conversationId === convIdStr);
    const uids = members.map((m: any) => m.userId.toHexString());
    if (uids.includes(userA) && uids.includes(userB) && uids.length === 2) {
      return {
        id: convIdStr,
        organizationId: conv.organizationId,
        type: conv.type as "direct" | "group",
        name: conv.name ?? null,
        createdBy: conv.createdBy ?? null,
        createdAt: toIsoString(conv.createdAt),
        merchivaEnabled: conv.merchivaEnabled === true,
      };
    }
  }

  return null;
}

export async function addMembersToConversation(
  conversationId: string,
  userIds: string[]
): Promise<void> {
  console.warn("[chat] addMembersToConversation: use SpacetimeDB reducer instead");
}

// ─── Messages ───────────────────────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  limit = 50
): Promise<ChatMessage[]> {
  const c = conn();
  if (!c) return [];

  const allMessages = Array.from(c.db.chatMessage.iter());
  const filtered = allMessages
    .filter((r: any) => r.conversationId === conversationId)
    .sort((a: any, b: any) => toDateMs(a.createdAt) - toDateMs(b.createdAt))
    .slice(-limit);

  return filtered.map((r: any) => ({
    id: r.id.toString(),
    conversationId: r.conversationId,
    senderId: r.senderId.toHexString(),
    content: r.content,
    createdAt: toIsoString(r.createdAt),
    replyToId: null,
    attachmentUrl: null,
    attachmentType: null,
    attachmentName: null,
    isMerchiva: r.isMerchiva === true,
  }));
}

export async function sendMessage(
  conversationId: string,
  content: string,
  replyToId?: string | null,
  attachment?: { url: string; type: string; name: string } | null
): Promise<ChatMessage> {
  console.warn("[chat] sendMessage: use SpacetimeDB reducer instead");
  // Return a placeholder — callers should migrate to SpacetimeDB reducers
  return {
    id: "",
    conversationId,
    senderId: "",
    content,
    createdAt: new Date().toISOString(),
    replyToId: replyToId ?? null,
    attachmentUrl: attachment?.url ?? null,
    attachmentType: attachment?.type ?? null,
    attachmentName: attachment?.name ?? null,
  };
}

export async function uploadChatFile(
  file: File
): Promise<{ url: string; type: string; name: string }> {
  // UploadThing does not depend on Supabase — keep as-is
  const { uploadFiles } = await import("@/lib/uploadthing");
  const [res] = await uploadFiles("generalFile", { files: [file] });

  let type = "file";
  if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";

  return { url: res.ufsUrl, type, name: file.name };
}

// ─── Reactions ──────────────────────────────────────────────────────────────

export interface ChatReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
}

export async function getReactions(
  messageIds: string[]
): Promise<Record<string, ChatReaction[]>> {
  // No chat_reactions table in SpacetimeDB yet — return empty
  if (messageIds.length === 0) return {};
  return {};
}

export async function addReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  console.warn("[chat] addReaction: no SpacetimeDB table for reactions yet");
}

export async function removeReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  console.warn("[chat] removeReaction: no SpacetimeDB table for reactions yet");
}

export async function deleteMessage(messageId: string): Promise<void> {
  console.warn("[chat] deleteMessage: use SpacetimeDB reducer instead");
}
