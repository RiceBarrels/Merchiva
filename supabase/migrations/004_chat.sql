-- ─── Chat Conversations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type              text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  name              text,          -- NULL for direct, name for groups
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their conversations"
  ON chat_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can create conversations"
  ON chat_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.organization_id = chat_conversations.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- ─── Chat Members (who is in which conversation) ────────────────────────────
CREATE TABLE IF NOT EXISTS chat_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view conversation members"
  ON chat_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.conversation_id = chat_members.conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert into conversations they belong to"
  ON chat_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
        AND om.organization_id = (
          SELECT organization_id FROM chat_conversations WHERE id = chat_members.conversation_id
        )
    )
  );

-- ─── Chat Messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content           text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view messages in their conversations"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.conversation_id = chat_messages.conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can send messages to their conversations"
  ON chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.conversation_id = chat_messages.conversation_id AND cm.user_id = auth.uid()
    )
  );

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- Trigger for updated_at on conversations
CREATE TRIGGER trg_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
