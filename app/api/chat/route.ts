import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const admin = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

/**
 * POST /api/chat — Create a conversation + add members atomically
 * Body: { organizationId, type, memberUserIds, name? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { organizationId, type, memberUserIds, name } = await request.json() as {
    organizationId: string;
    type: "direct" | "group";
    memberUserIds: string[];
    name?: string;
  };

  if (!organizationId || !type || !memberUserIds?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = admin();

  // For direct chats, check if one already exists
  if (type === "direct" && memberUserIds.length === 2) {
    const { data: existing } = await db
      .from("chat_conversations")
      .select("id, organization_id, type, name, created_by, created_at")
      .eq("organization_id", organizationId)
      .eq("type", "direct");

    if (existing) {
      for (const conv of existing) {
        const { data: members } = await db
          .from("chat_members")
          .select("user_id")
          .eq("conversation_id", conv.id);
        const uids = (members ?? []).map((m) => m.user_id);
        if (uids.length === 2 && memberUserIds.every((id) => uids.includes(id))) {
          return NextResponse.json({ conversation: conv });
        }
      }
    }
  }

  // Create conversation
  const { data: conv, error: convErr } = await db
    .from("chat_conversations")
    .insert({
      organization_id: organizationId,
      type,
      name: name || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: convErr?.message ?? "Failed to create conversation" }, { status: 500 });
  }

  // Add members
  const memberInserts = memberUserIds.map((uid) => ({
    conversation_id: conv.id,
    user_id: uid,
  }));

  const { error: memErr } = await db.from("chat_members").insert(memberInserts);
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  return NextResponse.json({ conversation: conv });
}
