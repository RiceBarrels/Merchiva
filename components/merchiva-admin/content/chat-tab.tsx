"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Mono, NoOrg, Pager, truncate, useAction, useOrgMembers, usePaged } from "./shared";

interface ConversationRow {
  id: string;
  organizationId: string;
  type: string;
  name: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  merchivaEnabled: boolean | null;
}

interface ChatMemberRow {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: number;
}

interface ChatMessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: number;
  replyToId: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  isMerchiva: boolean | null;
  voiceTranscript: string | null;
}

export function ChatTab({ orgId }: { orgId: string | null }) {
  const conversations = useAdminQuery<ConversationRow>(orgId ? `SELECT * FROM chat_conversation WHERE organization_id = ${sqlString(orgId)}` : null);
  const members = useOrgMembers(orgId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...conversations.rows]
      .filter((c) => !q || (c.name ?? "").toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [conversations.rows, search]);

  const selected = conversations.rows.find((c) => c.id === selectedId) ?? null;

  if (!orgId) return <NoOrg what="chat conversations" />;

  const columns: Column<ConversationRow>[] = [
    {
      key: "name",
      header: "Conversation",
      render: (c) => (
        <div>
          <div className="font-medium">{c.name || <span className="text-stone-400">(unnamed {c.type})</span>}</div>
          <Mono value={c.id} />
        </div>
      ),
    },
    { key: "type", header: "Type", render: (c) => <Badge>{c.type}</Badge> },
    { key: "merchiva", header: "Mr. Merchiva", render: (c) => (c.merchivaEnabled ? <Badge tone="ok">enabled</Badge> : <span className="text-stone-300">—</span>) },
    { key: "createdBy", header: "Created by", render: (c) => (c.createdBy ? members.label(c.createdBy) : <span className="text-stone-300">—</span>) },
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (c) => formatTs(c.createdAt) },
    { key: "updatedAt", header: "Last activity", className: "whitespace-nowrap text-stone-600", render: (c) => formatTs(c.updatedAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (c) => (
        <button type="button" className={btnGhostCls} onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}>
          {c.id === selectedId ? "Close" : "Open"}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title={`Conversations (${conversations.rows.length})`}
        actions={
          <>
            <input className={`${inputCls} w-56`} placeholder="Filter by name / type / id" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="button" className={btnGhostCls} onClick={() => conversations.reload()}>
              Refresh
            </button>
          </>
        }
      >
        <ErrorBanner message={conversations.error} />
        <DataTable columns={columns} rows={sorted} loading={conversations.loading} empty="No conversations in this org" rowKey={(c) => c.id} />
      </Panel>

      {selected && <ConversationThread key={selected.id} conversation={selected} memberLabel={members.label} />}
    </div>
  );
}

function ConversationThread({ conversation, memberLabel }: { conversation: ConversationRow; memberLabel: (id: string | null | undefined) => string }) {
  const chatMembers = useAdminQuery<ChatMemberRow>(`SELECT * FROM chat_member WHERE conversation_id = ${sqlString(conversation.id)}`);
  const messages = useAdminQuery<ChatMessageRow>(`SELECT * FROM chat_message WHERE conversation_id = ${sqlString(conversation.id)}`);
  const action = useAction();
  const [notice, setNotice] = useState<string | null>(null);

  const ordered = useMemo(() => [...messages.rows].sort((a, b) => a.createdAt - b.createdAt), [messages.rows]);
  // Oldest → newest, and the pager opens on the last (newest) page.
  const paged = usePaged(ordered, 50, true);
  const byId = useMemo(() => new Map(messages.rows.map((m) => [m.id, m])), [messages.rows]);

  const remove = async (m: ChatMessageRow) => {
    if (!window.confirm(`Delete this message?\n\n${truncate(m.content, 200)}`)) return;
    const ok = await action.run("deleteMessage", { conversationId: conversation.id, messageId: m.id });
    if (ok) {
      setNotice("Message deleted");
      messages.reload();
    }
  };

  const columns: Column<ChatMessageRow>[] = [
    { key: "createdAt", header: "Sent", className: "whitespace-nowrap text-stone-600", render: (m) => formatTs(m.createdAt) },
    {
      key: "sender",
      header: "Sender",
      className: "whitespace-nowrap",
      render: (m) => (
        <div>
          <div>{m.isMerchiva ? "Mr. Merchiva" : memberLabel(m.senderId)}</div>
          <Mono value={m.senderId} />
        </div>
      ),
    },
    {
      key: "content",
      header: "Message",
      render: (m) => (
        <div className="max-w-[640px]">
          {m.replyToId && (
            <div className="mb-0.5 border-l-2 border-stone-300 pl-2 text-[11px] text-stone-500">
              ↳ {byId.get(m.replyToId) ? truncate(byId.get(m.replyToId)!.content, 80) : `reply to ${m.replyToId.slice(0, 8)}…`}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">{m.content || <span className="text-stone-300">(empty)</span>}</div>
          {m.attachmentUrl && (
            <div className="mt-0.5 text-[11px] text-stone-500">
              <Badge>{m.attachmentType ?? "file"}</Badge>{" "}
              <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="underline">
                {m.attachmentName ?? m.attachmentUrl}
              </a>
            </div>
          )}
          {m.voiceTranscript && <div className="mt-0.5 text-[11px] italic text-stone-500">transcript: {m.voiceTranscript}</div>}
        </div>
      ),
    },
    { key: "id", header: "Id", render: (m) => <Mono value={m.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (m) => (
        <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => remove(m)}>
          Delete
        </button>
      ),
    },
  ];

  return (
    <Panel
      title={`${conversation.name || conversation.type} — ${messages.rows.length} messages, ${chatMembers.rows.length} members`}
      actions={
        <button
          type="button"
          className={btnGhostCls}
          onClick={() => {
            chatMembers.reload();
            messages.reload();
          }}
        >
          Refresh
        </button>
      }
    >
      <ErrorBanner message={chatMembers.error ?? messages.error ?? action.error} />
      <Notice message={notice} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 px-3 py-2 text-[12px]">
        <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-stone-500">Members</span>
        {chatMembers.loading && chatMembers.rows.length === 0 && <span className="text-stone-500">Loading…</span>}
        {chatMembers.rows.map((m) => (
          <span key={m.id} className="rounded-[0.15rem] border border-stone-300 px-1.5 py-0.5" title={`${m.userId} · joined ${formatTs(m.joinedAt)}`}>
            {memberLabel(m.userId)}
          </span>
        ))}
        {!chatMembers.loading && chatMembers.rows.length === 0 && <span className="text-stone-400">none</span>}
      </div>
      <Notice message="The module only lets a sender delete their own messages, so Delete works for Mr. Merchiva (platform identity) messages only. There is no reducer to delete a whole conversation." />
      <DataTable columns={columns} rows={paged.slice} loading={messages.loading} empty="No messages" rowKey={(m) => m.id} />
      <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} label="messages (oldest → newest)" />
    </Panel>
  );
}
