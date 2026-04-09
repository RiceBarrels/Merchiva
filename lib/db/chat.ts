// @ts-nocheck
import { createClient } from "@/lib/supabase/client";
import type { ChatConversation, ChatMessage, ChatMember } from "@/lib/types";

// ─── Conversations ──────────────────────────────────────────────────────────

export async function getConversations(
  organizationId: string
): Promise<ChatConversation[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get conversations the user is a member of
  const { data: memberRows } = await supabase
    .from("chat_members")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (!memberRows || memberRows.length === 0) return [];

  const convIds = memberRows.map((r) => r.conversation_id);

  const { data, error } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", convIds)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const conversations: ChatConversation[] = (data ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    type: r.type,
    name: r.name,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));

  // Fetch members and last message for each conversation
  for (const conv of conversations) {
    const { data: members } = await supabase
      .from("chat_members")
      .select("id, conversation_id, user_id, joined_at")
      .eq("conversation_id", conv.id);

    conv.members = (members ?? []).map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      userId: m.user_id,
      joinedAt: m.joined_at,
    }));

    const { data: lastMsg } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    conv.lastMessage = lastMsg
      ? {
          id: lastMsg.id,
          conversationId: lastMsg.conversation_id,
          senderId: lastMsg.sender_id,
          content: lastMsg.content,
          createdAt: lastMsg.created_at,
          replyToId: lastMsg.reply_to_id ?? null,
          attachmentUrl: lastMsg.attachment_url ?? null,
          attachmentType: lastMsg.attachment_type ?? null,
          attachmentName: lastMsg.attachment_name ?? null,
        }
      : null;
  }

  return conversations;
}

export async function createConversation(
  organizationId: string,
  type: "direct" | "group",
  memberUserIds: string[],
  name?: string
): Promise<ChatConversation> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // For direct chats, check if one already exists between these two users
  if (type === "direct" && memberUserIds.length === 2) {
    const existing = await findDirectConversation(
      organizationId,
      memberUserIds[0],
      memberUserIds[1]
    );
    if (existing) return existing;
  }

  // Conversation creation is handled by /api/chat (service role) to avoid RLS issues
  throw new Error("Use /api/chat API route instead");
}

async function findDirectConversation(
  organizationId: string,
  userA: string,
  userB: string
): Promise<ChatConversation | null> {
  const supabase = createClient();

  // Find conversations where both users are members and type is direct
  const { data } = await supabase
    .from("chat_conversations")
    .select("id, organization_id, type, name, created_by, created_at")
    .eq("organization_id", organizationId)
    .eq("type", "direct");

  if (!data) return null;

  for (const conv of data) {
    const { data: members } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("conversation_id", conv.id);

    const uids = (members ?? []).map((m) => m.user_id);
    if (uids.includes(userA) && uids.includes(userB) && uids.length === 2) {
      return {
        id: conv.id,
        organizationId: conv.organization_id,
        type: conv.type,
        name: conv.name,
        createdBy: conv.created_by,
        createdAt: conv.created_at,
      };
    }
  }

  return null;
}

export async function addMembersToConversation(
  conversationId: string,
  userIds: string[]
): Promise<void> {
  const supabase = createClient();
  const inserts = userIds.map((uid) => ({
    conversation_id: conversationId,
    user_id: uid,
  }));
  const { error } = await supabase.from("chat_members").insert(inserts);
  if (error) throw new Error(error.message);
}

// ─── Messages ───────────────────────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  limit = 50
): Promise<ChatMessage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    content: r.content,
    createdAt: r.created_at,
    replyToId: r.reply_to_id ?? null,
    attachmentUrl: r.attachment_url ?? null,
    attachmentType: r.attachment_type ?? null,
    attachmentName: r.attachment_name ?? null,
  }));
}

export async function sendMessage(
  conversationId: string,
  content: string,
  replyToId?: string | null,
  attachment?: { url: string; type: string; name: string } | null
): Promise<ChatMessage> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      reply_to_id: replyToId || null,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_name: attachment?.name ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return {
    id: data.id,
    conversationId: data.conversation_id,
    senderId: data.sender_id,
    content: data.content,
    createdAt: data.created_at,
    replyToId: data.reply_to_id ?? null,
    attachmentUrl: data.attachment_url ?? null,
    attachmentType: data.attachment_type ?? null,
    attachmentName: data.attachment_name ?? null,
  };
}

export async function uploadChatFile(
  file: File
): Promise<{ url: string; type: string; name: string }> {
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
  if (messageIds.length === 0) return {};
  const supabase = createClient();
  const { data } = await supabase
    .from("chat_reactions")
    .select("*")
    .in("message_id", messageIds);

  const map: Record<string, ChatReaction[]> = {};
  for (const r of data ?? []) {
    const key = r.message_id;
    if (!map[key]) map[key] = [];
    map[key].push({ id: r.id, messageId: r.message_id, userId: r.user_id, emoji: r.emoji });
  }
  return map;
}

export async function addReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("chat_reactions").upsert(
    { message_id: messageId, user_id: user.id, emoji },
    { onConflict: "message_id,user_id,emoji" }
  );
}

export async function removeReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("chat_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji);
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("chat_messages").delete().eq("id", messageId);
  if (error) throw new Error(error.message);
}
