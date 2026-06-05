"use client";

import { uuid, cn } from "@/lib/utils";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Plus, Users, ArrowLeft, Search, X, UserPlus, AlertTriangle, CheckCircle2, Paperclip, AtSign, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementHeader, DynamicUIElementTitle, DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { usePermissions } from "@/lib/context/permissions";
import { getCached, setCache } from "@/lib/cache";
import { sendMessage, addMembersToConversation, addReaction, removeReaction, deleteMessage, createConversation, setConversationMerchiva } from "@/lib/spacetimedb/actions";
import { getStoredToken } from "@/lib/spacetimedb/client";
import { useAuth } from "@/lib/auth/context";
import {
  getConversations, getMessages, getReactions, uploadChatFile,
  type ChatReaction,
} from "@/lib/db/chat";
import { getTeamForScheduling } from "@/lib/db/staffing";
import { getAvatarMap } from "@/lib/db/avatars";
import type { ChatConversation, ChatMessage, OrgMember } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { useT, useI18n } from "@/lib/i18n/context";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { MerchivaChat } from "@/components/merchiva-chat-dashboard";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import { useCurrentOperator } from "@/lib/store-device-lock";
import { Spinner } from "@/components/ui/loaders/geometric";

function MerchivaChatEmbed({ compact = false, header = true }: { compact?: boolean; header?: boolean } = {}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MerchivaChat compact={compact} header={header} />
    </div>
  );
}

// Single source of truth for Mr. Merchiva's avatar across the chat surface
// (sidebar, group messages, @mention picker, member pickers): the brand "M"
// mark on stone-900 — same as the pinned sidebar entry.
function MerchivaAvatar({ className = "h-9 w-9", svg = 18 }: { className?: string; svg?: number }) {
  return (
    <div className={cn("shrink-0 flex items-center justify-center rounded-[0.3rem] bg-stone-900 text-white", className)} title="Mr. Merchiva">
      <svg width={svg} height={svg} viewBox="0 0 100 100" aria-hidden>
        <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

function formatTimeSeparator(date: Date, t: (k: string) => string): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (sameDay) return `${t("chat.timeToday")} ${time}`;
  if (isYesterday) return `${t("chat.timeYesterday")} ${time}`;
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function shouldShowTimeSeparator(msgs: ChatMessage[], i: number): boolean {
  if (i === 0) return true;
  const prev = new Date(msgs[i - 1].createdAt).getTime();
  const curr = new Date(msgs[i].createdAt).getTime();
  return curr - prev > 3 * 60 * 1000; // 3 minutes
}

export default function ChatPage() {
  const t = useT();
  const { locale } = useI18n();
  const { getToken } = useAuth();
  const { organizationId, role, currentOrg, isOwner, shareGroupOrgIds } = usePermissions();
  const groupKey = shareGroupOrgIds.join("|");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [activeConv, setActiveConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Dialogs
  const [newDmDialog, setNewDmDialog] = useState(false);
  const [newGroupDialog, setNewGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  // Mr. Merchiva is invited like a teammate: picked in the New Group / Add
  // Members lists. For a new group we stage the choice here; for an existing
  // conversation we toggle merchivaEnabled directly.
  const [includeMerchiva, setIncludeMerchiva] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [addMemberDialog, setAddMemberDialog] = useState(false);

  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<Record<string, ChatReaction[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isManager = role === "owner" || role === "manager";
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const stdb = useSpacetimeDB();
  const [storeMachine] = useStoreMachineMode();
  const operator = useCurrentOperator();
  // In store-device mode, scope the chat to the punched-in operator so each
  // staff member sees their own conversations on the shared terminal. We
  // override the "me" userId by looking up the operator's orgMember row and
  // pulling its userId. orgMember.userId is a SpacetimeDB Identity — call
  // toHexString() explicitly so it matches every other identity comparison in
  // the chat layer (see lib/db/chat.ts).
  const [memberRowsForOp] = useTable(tables.orgMember);
  useEffect(() => {
    if (storeMachine && operator?.memberId) {
      const rows = memberRowsForOp as unknown as Array<{
        id: { toString(): string };
        userId: { toHexString?: () => string; toString(): string };
      }>;
      const row = rows.find((m) => m.id.toString() === operator.memberId);
      if (row) {
        const hex = typeof row.userId.toHexString === "function"
          ? row.userId.toHexString()
          : row.userId.toString();
        setUserId(hex);
        return;
      }
    }
    if (stdb?.identity) setUserId(stdb.identity.toHexString());
  }, [stdb?.identity, storeMachine, operator?.memberId, memberRowsForOp]);

  // When the operator changes on a shared store device, drop any open
  // conversation so the new operator doesn't accidentally land in someone
  // else's thread. The list reloads via the userId-keyed effect below.
  useEffect(() => {
    setActiveConv(null);
    setMessages([]);
    setReplyTo(null);
    setInput("");
  }, [userId]);

  useEffect(() => {
    if (!organizationId) return;
    // Chat conversations + teammates are shared across the share group, so
    // load both from every org in the parent/child tree.
    const ids = shareGroupOrgIds.length ? shareGroupOrgIds : [organizationId];
    // Cache is per-user — on store devices a different operator must NOT see
    // the previous operator's conversations from cache.
    const cacheKey = `conversations_${ids.join("|")}_${userId ?? "anon"}`;
    const cachedConvs = getCached<ChatConversation[]>(cacheKey);
    if (cachedConvs) setConversations(cachedConvs);
    else setConversations([]);
    setLoading(false);

    Promise.all([
      getConversations(ids, userId),
      Promise.all(ids.map((id) => getTeamForScheduling(id))).then((arrays) => {
        // De-dupe team members by userId so the same person on multiple orgs
        // appears once in the picker.
        const seen = new Set<string>();
        const merged: OrgMember[] = [];
        for (const arr of arrays) {
          for (const m of arr) {
            if (seen.has(m.userId)) continue;
            seen.add(m.userId);
            merged.push(m);
          }
        }
        return merged;
      }),
    ])
      .then(async ([convs, t]) => {
        setConversations(convs);
        setCache(cacheKey, convs);
        setTeam(t);
        const userIds = t.map((m) => m.userId);
        const avMap = await getAvatarMap(userIds);
        setAvatars(avMap);
      })
      .catch((err) => console.error("Chat load failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, groupKey, userId]);

  // Subscribe to the chat_message table. The hook fires a re-render whenever
  // a row is inserted/updated/deleted in the local cache — covers our own
  // sends (the reducer's row arrives via the same WebSocket) and incoming
  // messages from other members. The rows array itself isn't used directly:
  // getMessages reads the same cache and produces the joined ChatMessage shape.
  const [chatMessageRows] = useTable(tables.chatMessage);
  const messageRowsForConv = activeConv
    ? chatMessageRows.filter((r: { conversationId: string }) => r.conversationId === activeConv.id).length
    : 0;

  // Load messages when conversation changes OR when the message row count
  // for the active conversation changes (new message arrives).
  useEffect(() => {
    if (!activeConv) return;
    const cachedMsgs = getCached<ChatMessage[]>(`messages_${activeConv.id}`);
    if (cachedMsgs) setMessages(cachedMsgs);
    getMessages(activeConv.id).then(async (msgs) => {
      setMessages(msgs);
      setCache(`messages_${activeConv.id}`, msgs.slice(-30));
      const rxns = await getReactions(msgs.map((m) => m.id));
      setReactions(rxns);
    }).catch(console.error);
  }, [activeConv, messageRowsForConv]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (attachment?: { url: string; type: string; name: string } | null) => {
    if ((!input.trim() && !attachment) || !activeConv) return;
    const content = input.trim();
    const replyId = replyTo?.id ?? undefined;
    setInput("");
    setReplyTo(null);
    setSending(true);
    try {
      await sendMessage(activeConv.id, content || (attachment ? (attachment.type === "image" ? t("chat.sentPhoto") : attachment.type === "video" ? t("chat.sentVideo") : t("chat.sentFile")) : ""), replyId, attachment);
      // If Mr. Merchiva is in this conversation, let the server decide whether
      // to reply: always when @mentioned, otherwise after an OSS relevance
      // check. Fire-and-forget — the bot's reply arrives via the subscription.
      if (activeConv.merchivaEnabled && content) {
        void triggerMerchivaReply(activeConv, content);
      }
    } catch (err) {
      console.error("Send failed:", err);
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const MERCHIVA_MENTION_RE = /@\s*mr\.?\s*merchiva|@merchiva\b/i;

  // Kicks the group-chat Merchiva endpoint. Only the sender's client fires this,
  // so exactly one reply is generated per triggering message.
  const triggerMerchivaReply = async (conv: ChatConversation, content: string) => {
    try {
      const token = (await getToken().catch(() => null)) || getStoredToken();
      if (!token || !organizationId) return;
      const mentioned = MERCHIVA_MENTION_RE.test(content);
      const history = messages.slice(-10).map((m) => ({
        role: m.isMerchiva ? ("assistant" as const) : ("user" as const),
        name: m.isMerchiva ? "Mr. Merchiva" : getMemberName(m.senderId),
        content: m.content,
      }));
      await fetch("/api/chat/merchiva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          organizationId,
          conversationId: conv.id,
          message: content,
          senderName: userId ? getMemberName(userId) : undefined,
          mentioned,
          history,
          lang: locale,
          orgName: currentOrg?.name ?? undefined,
          permissions: { isOwner, role },
        }),
      });
    } catch (err) {
      console.error("Merchiva reply trigger failed:", err);
    }
  };

  const handleToggleMerchiva = async () => {
    if (!activeConv) return;
    const next = !activeConv.merchivaEnabled;
    // Optimistic — reflect immediately, then persist + refetch.
    setActiveConv({ ...activeConv, merchivaEnabled: next });
    try {
      await setConversationMerchiva(activeConv.id, next);
      if (organizationId) {
        const convs = await getConversations(organizationId, userId);
        setConversations(convs);
        const updated = convs.find((c) => c.id === activeConv.id);
        if (updated) setActiveConv(updated);
      }
    } catch (err) {
      console.error("Toggle Merchiva failed:", err);
      setActiveConv({ ...activeConv, merchivaEnabled: !next });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSending(true);
    try {
      const attachment = await uploadChatFile(file);
      await handleSend(attachment);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setSending(false);
      e.target.value = "";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const createConv = async (type: "direct" | "group", memberUserIds: string[], name?: string) => {
    const prevIds = new Set(conversations.map((c) => c.id));
    await createConversation(organizationId!, type, memberUserIds, name);
    // The reducer-inserted row arrives in the local SpacetimeDB cache over the
    // same socket; refetch (with a short retry) and pick the conversation that's
    // new to us so callers get the REAL id (needed to enable Mr. Merchiva on it).
    for (let i = 0; i < 6; i++) {
      const convs = await getConversations(organizationId!, userId);
      const fresh = convs.find((c) => !prevIds.has(c.id) && c.type === type);
      if (fresh) {
        setConversations(convs);
        return fresh;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    // Fallback: optimistic placeholder (the real row will arrive on next refresh).
    return {
      id: uuid(),
      organizationId: organizationId!,
      type,
      name: name ?? null,
      createdBy: null,
      createdAt: new Date().toISOString(),
    } as ChatConversation;
  };

  const handleCreateDm = async (targetUserId: string) => {
    if (!organizationId || !userId) return;
    try {
      const conv = await createConv("direct", [userId, targetUserId]);
      setConversations((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
      setActiveConv(conv);
      setNewDmDialog(false);
    } catch (err) {
      console.error("Create DM failed:", err);
    }
  };

  const handleCreateGroup = async () => {
    if (!organizationId || !userId || !groupName.trim()) return;
    try {
      const memberIds = [...new Set([userId, ...selectedMembers])];
      const conv = await createConv("group", memberIds, groupName.trim());
      // Mr. Merchiva was picked in the member list like a teammate — turn him on.
      if (includeMerchiva && conv.id) {
        try {
          await setConversationMerchiva(conv.id, true);
          conv.merchivaEnabled = true;
        } catch (e) {
          console.error("Enable Merchiva on new group failed:", e);
        }
      }
      setConversations((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
      setActiveConv(conv);
      setNewGroupDialog(false);
      setGroupName("");
      setSelectedMembers([]);
      setIncludeMerchiva(false);
    } catch (err) {
      console.error("Create group failed:", err);
    }
  };

  const handleAddMembers = async () => {
    if (!activeConv || selectedMembers.length === 0) return;
    await addMembersToConversation(activeConv.id, selectedMembers);
    setAddMemberDialog(false);
    setSelectedMembers([]);
    // Refresh conversations
    if (organizationId) {
      const convs = await getConversations(organizationId, userId);
      setConversations(convs);
      const updated = convs.find((c) => c.id === activeConv.id);
      if (updated) setActiveConv(updated);
    }
  };

  const getMemberName = useCallback(
    (uid: string) => team.find((m) => m.userId === uid)?.displayName ?? t("chat.unknown"),
    [team, t]
  );

  const getAvatar = useCallback(
    (uid: string) => avatars[uid] ?? null,
    [avatars]
  );

  const handleReact = async (messageId: string, emoji: string) => {
    const existing = reactions[messageId]?.find((r) => r.userId === userId && r.emoji === emoji);
    if (existing) {
      await removeReaction(messageId, emoji);
      setReactions((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id),
      }));
    } else {
      await addReaction(messageId, emoji);
      setReactions((prev) => ({
        ...prev,
        [messageId]: [...(prev[messageId] ?? []), { id: uuid(), messageId, userId: userId!, emoji }],
      }));
    }
  };

  const handleDeleteMsg = async (messageId: string) => {
    await deleteMessage(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const getConvDisplayName = (conv: ChatConversation) => {
    if (conv.id === "__merchiva__") return "Mr. Merchiva";
    if (conv.type === "group") return conv.name ?? t("chat.groupFallback");
    const other = conv.members?.find((m) => m.userId !== userId);
    return other ? getMemberName(other.userId) : t("chat.chatFallback");
  };

  const filteredTeam = team.filter(
    (m) => m.displayName.toLowerCase().includes(memberSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={32} className="text-muted-foreground" />
      </div>
    );
  }

  // Mobile: show either list or chat view
  const showChat = !!activeConv;

  return (
    <PermissionGuard section="staffing">
      <div className="flex h-full">
        {/* ─── Conversation List ─────────────────────── */}
        <div className="w-full sm:w-80 sm:border-r border-border flex flex-col shrink-0">
          <PageHeader
            title={t("chat.messages")}
            sticky={false}
            right={
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setNewDmDialog(true)} className="gap-1 h-8 text-xs">
                  <MessageSquare className="h-3.5 w-3.5" /> {t("chat.dm")}
                </Button>
                {isManager && (
                  <Button size="sm" onClick={() => { setIncludeMerchiva(false); setSelectedMembers([]); setNewGroupDialog(true); }} className="gap-1 h-8 text-xs">
                    <Plus className="h-3.5 w-3.5" /> {t("chat.group")}
                  </Button>
                )}
              </div>
            }
          />

          <div className="flex-1 overflow-y-auto">
            {/* Mr. Merchiva — AI assistant pinned at top */}
            <button
              onClick={() => setActiveConv({ id: "__merchiva__", organizationId: organizationId ?? "", type: "direct", name: "Mr. Merchiva", createdBy: null, createdAt: "", lastMessage: null, members: [] } as ChatConversation)}
              className={`w-full text-left px-3 py-3 border-b border-border transition-colors ${
                activeConv?.id === "__merchiva__" ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <MerchivaAvatar />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Mr. Merchiva</p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />online</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">Your AI ops agent</p>
                </div>
              </div>
            </button>

            {conversations.length === 0 && activeConv?.id !== "__merchiva__" ? (
              <div className="p-8 text-center space-y-2">
                <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">{t("chat.noConversations")}</p>
                <p className="text-xs text-muted-foreground">{t("chat.startDMPrompt")}</p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = activeConv?.id === conv.id;
                const displayName = getConvDisplayName(conv);
                const lastMsg = conv.lastMessage;
                const memberCount = conv.members?.length ?? 0;

                return (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConv(conv)}
                    className={`w-full text-left px-3 py-3 border-b border-border transition-colors ${
                      isActive ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.3rem] text-xs font-bold ${
                        conv.type === "group" ? "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700" : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
                      }`}>
                        {conv.type === "group" ? <Users className="h-4 w-4" /> : displayName[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          {lastMsg && (
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                              {new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {lastMsg
                            ? `${lastMsg.senderId === userId ? t("chat.you") : getMemberName(lastMsg.senderId)}: ${lastMsg.content}`
                            : conv.type === "group"
                            ? `${memberCount} ${t("chat.memberPlural").toLowerCase()}`
                            : t("chat.noMessagesShort")
                          }
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ─── Chat View (Desktop: inline, Mobile: dialog) ─── */}
        {/* Desktop */}
        <div className="hidden sm:flex flex-1 flex-col">
          {activeConv?.id === "__merchiva__" ? (
            <MerchivaChatEmbed />
          ) : activeConv ? (
            <ChatView
              conv={activeConv}
              messages={messages}
              input={input}
              setInput={setInput}
              sending={sending}
              userId={userId}
              isManager={isManager}
              getMemberName={getMemberName}
              getAvatar={getAvatar}
              team={team}
              getConvDisplayName={getConvDisplayName}
              reactions={reactions}
              onReact={handleReact}
              onDeleteMsg={handleDeleteMsg}
              replyTo={replyTo}
              onReply={setReplyTo}
              onSend={() => handleSend()}
              onFileUpload={handleFileUpload}
              onKeyDown={handleKeyDown}
              onBack={() => setActiveConv(null)}
              onAddMembers={() => { setSelectedMembers([]); setAddMemberDialog(true); }}
              messagesEndRef={messagesEndRef}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center space-y-2">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">{t("chat.selectConversation")}</p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile: DynamicUIElement */}
        <DynamicUIElement open={showChat && isMobile} onOpenChange={(open) => { if (!open) setActiveConv(null); }}>
          <DynamicUIElementContent showCloseButton={false} noPadding>
            <DynamicUIElementTitle mobileTitle={activeConv ? getConvDisplayName(activeConv) : t("chat.chatFallback")} className="hidden">
              {activeConv ? getConvDisplayName(activeConv) : t("chat.chatFallback")}
            </DynamicUIElementTitle>
            {activeConv?.id === "__merchiva__" ? (
              <div className="flex flex-col h-full">
                <MerchivaChatEmbed compact header={false} />
              </div>
            ) : activeConv ? (
              <div className="flex flex-col h-full">
                <ChatView
                  conv={activeConv}
                  messages={messages}
                  input={input}
                  setInput={setInput}
                  sending={sending}
                  userId={userId}
                  isManager={isManager}
                  getMemberName={getMemberName}
                  getAvatar={getAvatar}
                  team={team}
                  getConvDisplayName={getConvDisplayName}
                  reactions={reactions}
                  onReact={handleReact}
                  onDeleteMsg={handleDeleteMsg}
              replyTo={replyTo}
              onReply={setReplyTo}
                  onSend={() => handleSend()}
              onFileUpload={handleFileUpload}
                  onKeyDown={handleKeyDown}
                  onBack={() => setActiveConv(null)}
                  onAddMembers={() => { setSelectedMembers([]); setAddMemberDialog(true); }}
                  messagesEndRef={messagesEndRef}
                  hideHeader
                  isMobile
                />
              </div>
            ) : null}
          </DynamicUIElementContent>
        </DynamicUIElement>
      </div>

      {/* ─── New DM DynamicUIElement ─────────────────────────── */}
      <DynamicUIElement open={newDmDialog} onOpenChange={setNewDmDialog}>
        <DynamicUIElementContent>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("chat.newMessageShort")}>{t("chat.newDirectMessage")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("chat.chooseTeamMember")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-1">
            {team
              .filter((m) => m.userId !== userId)
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleCreateDm(m.userId)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-[0.3rem] hover:bg-muted transition-colors text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.3rem] bg-stone-100 dark:bg-stone-800 text-xs font-bold text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                    {m.displayName[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                  </div>
                </button>
              ))}
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── New Group DynamicUIElement ──────────────────────── */}
      <DynamicUIElement open={newGroupDialog} onOpenChange={setNewGroupDialog}>
        <DynamicUIElementContent>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("chat.newGroup")}>{t("chat.createGroupChat")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("chat.nameGroupAddMembers")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("chat.groupNameRequired")}</Label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t("chat.groupNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("chat.membersLabel")}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={t("chat.searchTeam")}
                  className="pl-8"
                />
              </div>
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {selectedMembers.map((uid) => (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 rounded-[0.3rem] px-2 py-0.5 text-xs font-mono"
                    >
                      {getMemberName(uid)}
                      <button onClick={() => setSelectedMembers((prev) => prev.filter((id) => id !== uid))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="max-h-40 overflow-y-auto space-y-0.5 pt-1">
                {/* Mr. Merchiva — invited like a teammate (pinned at the top). */}
                {(memberSearch === "" || "mr. merchiva".includes(memberSearch.toLowerCase())) && (
                  <button
                    onClick={() => setIncludeMerchiva((v) => !v)}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-[0.3rem] text-left transition-colors ${
                      includeMerchiva ? "bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700" : "hover:bg-muted"
                    }`}
                  >
                    <MerchivaAvatar className="h-7 w-7" svg={14} />
                    <span className="text-sm flex-1">Mr. Merchiva <span className="text-xs text-muted-foreground">· {t("chat.merchivaMentionHint")}</span></span>
                    {includeMerchiva && <span className="text-xs font-mono text-stone-600 dark:text-stone-300">{t("chat.added")}</span>}
                  </button>
                )}
                {filteredTeam
                  .filter((m) => m.userId !== userId)
                  .map((m) => {
                    const selected = selectedMembers.includes(m.userId);
                    return (
                      <button
                        key={m.id}
                        onClick={() =>
                          setSelectedMembers((prev) =>
                            selected ? prev.filter((id) => id !== m.userId) : [...prev, m.userId]
                          )
                        }
                        className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-[0.3rem] text-left transition-colors ${
                          selected ? "bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700" : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.3rem] bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[10px] font-bold text-stone-600 dark:text-stone-300">
                          {m.displayName[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm flex-1">{m.displayName}</span>
                        {selected && <span className="text-xs font-mono text-stone-600 dark:text-stone-300">{t("chat.added")}</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
            <Button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || (selectedMembers.length === 0 && !includeMerchiva)}
              className="w-full rounded-[0.3rem]"
            >
              {t("chat.createGroup")} ({selectedMembers.length} {t("chat.memberPlural").toLowerCase()})
            </Button>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Add Members DynamicUIElement ────────────────────── */}
      <DynamicUIElement open={addMemberDialog} onOpenChange={setAddMemberDialog}>
        <DynamicUIElementContent>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("chat.addMembersMobile")}>{t("chat.addMembersToGroup")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("chat.selectMembersDesc")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={t("chat.searchTeam")}
                className="pl-8"
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {/* Mr. Merchiva — added/removed like a teammate; toggles instantly. */}
              {(memberSearch === "" || "mr. merchiva".includes(memberSearch.toLowerCase())) && (
                <button
                  onClick={() => handleToggleMerchiva()}
                  className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-[0.3rem] text-left transition-colors ${
                    activeConv?.merchivaEnabled ? "bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700" : "hover:bg-muted"
                  }`}
                >
                  <MerchivaAvatar className="h-7 w-7" svg={14} />
                  <span className="text-sm flex-1">Mr. Merchiva <span className="text-xs text-muted-foreground">· {t("chat.merchivaMentionHint")}</span></span>
                  <span className="text-xs font-mono text-stone-600 dark:text-stone-300">
                    {activeConv?.merchivaEnabled ? t("chat.merchivaOn") : t("chat.add")}
                  </span>
                </button>
              )}
              {filteredTeam
                .filter((m) => {
                  const existingIds = activeConv?.members?.map((cm) => cm.userId) ?? [];
                  return !existingIds.includes(m.userId);
                })
                .map((m) => {
                  const selected = selectedMembers.includes(m.userId);
                  return (
                    <button
                      key={m.id}
                      onClick={() =>
                        setSelectedMembers((prev) =>
                          selected ? prev.filter((id) => id !== m.userId) : [...prev, m.userId]
                        )
                      }
                      className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-[0.3rem] text-left transition-colors ${
                        selected ? "bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.3rem] bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[10px] font-bold text-stone-600 dark:text-stone-300">
                        {m.displayName[0]?.toUpperCase()}
                      </div>
                      <span className="text-sm flex-1">{m.displayName}</span>
                      {selected && <span className="text-xs font-mono text-stone-600 dark:text-stone-300">{t("chat.added")}</span>}
                    </button>
                  );
                })}
            </div>
            <Button
              onClick={handleAddMembers}
              disabled={selectedMembers.length === 0}
              className="w-full rounded-[0.3rem]"
            >
              {t("chat.add")} {selectedMembers.length} {selectedMembers.length !== 1 ? t("chat.memberPlural") : t("chat.memberSingular")}
            </Button>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>
    </PermissionGuard>
  );
}

const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

function ChatView({
  conv, messages, input, setInput, sending, userId, isManager,
  getMemberName, getAvatar, team, getConvDisplayName,
  reactions, onReact, onDeleteMsg,
  replyTo, onReply,
  onSend, onFileUpload, onKeyDown, onBack, onAddMembers, messagesEndRef,
  hideHeader = false,
  isMobile = false,
}: {
  conv: ChatConversation;
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  userId: string | null;
  isManager: boolean;
  getMemberName: (uid: string) => string;
  getAvatar: (uid: string) => string | null;
  team: OrgMember[];
  getConvDisplayName: (conv: ChatConversation) => string;
  reactions: Record<string, ChatReaction[]>;
  onReact: (messageId: string, emoji: string) => void;
  onDeleteMsg: (messageId: string) => void;
  replyTo: ChatMessage | null;
  onReply: (msg: ChatMessage | null) => void;
  onSend: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBack: () => void;
  onAddMembers: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  hideHeader?: boolean;
  isMobile?: boolean;
}) {
  const t = useT();
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; isMe: boolean }>({ x: 0, y: 0, isMe: false });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchTarget = useRef<HTMLElement | null>(null);

  // ── @mention picker (shared by mobile drawer + desktop popover) ──────────────
  const closeMentionPicker = () => { setShowMentionPicker(false); setMentionSearch(""); };
  const selectMention = (insert: string) => {
    const lastAt = input.lastIndexOf("@");
    const before = lastAt >= 0 ? input.slice(0, lastAt) : input;
    setInput(`${before}@${insert} `);
    closeMentionPicker();
    inputRef.current?.focus();
  };
  const showEveryone = "everyone".includes(mentionSearch.toLowerCase());
  const filteredMentions = team.filter(
    (m) => m.userId !== userId && m.displayName.toLowerCase().includes(mentionSearch.toLowerCase()),
  );
  const showMerchiva = conv.merchivaEnabled === true &&
    ("merchiva".includes(mentionSearch.toLowerCase()) || "mr. merchiva".includes(mentionSearch.toLowerCase()));
  const mentionOptions = (
    <>
      {showMerchiva && (
        <button
          onClick={() => selectMention("Mr. Merchiva")}
          className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted transition-colors border-b border-border text-left"
        >
          <MerchivaAvatar />
          <div className="min-w-0">
            <p className="text-sm font-medium">Mr. Merchiva</p>
            <p className="text-xs text-muted-foreground truncate">{t("chat.merchivaMentionHint")}</p>
          </div>
        </button>
      )}
      {showEveryone && (
        <button
          onClick={() => selectMention("everyone")}
          className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted transition-colors border-b border-border text-left"
        >
          <div className="h-9 w-9 rounded-[0.3rem] bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-stone-600 dark:text-stone-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("chat.everyone")}</p>
            <p className="text-xs text-muted-foreground truncate">{t("chat.notifyAll")}</p>
          </div>
        </button>
      )}
      {filteredMentions.map((m) => {
        const av = getAvatar(m.userId);
        return (
          <button
            key={m.id}
            onClick={() => selectMention(m.displayName)}
            className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-b-0 text-left"
          >
            {av ? (
              <img src={av} alt={m.displayName} className="h-9 w-9 rounded-[0.3rem] object-cover shrink-0" />
            ) : (
              <div className="h-9 w-9 rounded-[0.3rem] bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-sm font-bold text-stone-600 dark:text-stone-300 shrink-0">
                {m.displayName[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{m.displayName}</p>
              <p className="text-xs text-muted-foreground capitalize truncate">{m.role}</p>
            </div>
          </button>
        );
      })}
      {!showEveryone && filteredMentions.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("chat.noMatches") ?? "—"}</p>
      )}
    </>
  );

  const handleTouchStart = useCallback((msg: ChatMessage, e: React.TouchEvent) => {
    touchTarget.current = e.currentTarget as HTMLElement;
    longPressTimer.current = setTimeout(() => {
      const rect = touchTarget.current?.getBoundingClientRect();
      if (rect) {
        setMenuPos({ x: rect.left, y: rect.top, isMe: msg.senderId === userId });
      }
      setMenuMsg(msg);
    }, 500);
  }, [userId]);

  const handleContextMenu = useCallback((msg: ChatMessage, e: React.MouseEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.top, isMe: msg.senderId === userId });
    setMenuMsg(msg);
  }, [userId]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  return (
    <>
      {!hideHeader && <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{getConvDisplayName(conv)}</p>
          <p className="text-[11px] text-muted-foreground">
            {conv.type === "group" ? `${conv.members?.length ?? 0} ${t("chat.memberPlural").toLowerCase()}` : t("chat.directMessage")}
          </p>
        </div>
        {conv.type === "group" && conv.merchivaEnabled && (
          <span className="inline-flex items-center gap-1.5 h-8 px-2 text-xs text-muted-foreground" title={t("chat.merchivaOn")}>
            <MerchivaAvatar className="h-5 w-5" svg={11} />
            {t("chat.merchivaOn")}
          </span>
        )}
        {conv.type === "group" && isManager && (
          <Button size="sm" variant="outline" onClick={onAddMembers} className="gap-1 h-8 text-xs">
            <UserPlus className="h-3.5 w-3.5" /> {t("chat.add")}
          </Button>
        )}
      </div>}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">{t("chat.noMessagesHello")}</p>
        )}
        {messages.map((msg, i) => {
          // Mr. Merchiva replies are inserted under the triggering user's
          // identity but flagged isMerchiva — so they must never render as
          // "me", and use the bot's name/avatar instead of the sender's.
          const isMerchiva = msg.isMerchiva === true;
          const senderKey = (m: ChatMessage) => (m.isMerchiva ? "__merchiva__" : m.senderId);
          const myKey = senderKey(msg);
          const isMe = !isMerchiva && msg.senderId === userId;
          const showTime = shouldShowTimeSeparator(messages, i);
          const nextSame = i < messages.length - 1 && senderKey(messages[i + 1]) === myKey && !shouldShowTimeSeparator(messages, i + 1);
          const prevSame = i > 0 && senderKey(messages[i - 1]) === myKey && !showTime;
          const isLast = !nextSame;
          const av = isMerchiva ? null : getAvatar(msg.senderId);
          const name = isMerchiva ? "Mr. Merchiva" : getMemberName(msg.senderId);
          const gap = prevSame ? "mt-0.5" : "mt-3";
          const msgReactions = reactions[msg.id] ?? [];
          // Group reactions by emoji
          const emojiCounts: Record<string, number> = {};
          for (const r of msgReactions) {
            emojiCounts[r.emoji] = (emojiCounts[r.emoji] ?? 0) + 1;
          }

          return (
            <div key={msg.id}>
              {showTime && (
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
                  <span className="font-mono uppercase text-stone-500 dark:text-stone-400 text-[10px] tracking-[0.6px]">
                    {formatTimeSeparator(new Date(msg.createdAt), t)}
                  </span>
                  <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
                </div>
              )}
              <div className={`flex items-end gap-2 ${gap} ${isMe ? "justify-end" : "justify-start"}`}>
                {!isMe ? (
                  isLast ? (
                    isMerchiva ? (
                      <MerchivaAvatar className="h-7 w-7" svg={14} />
                    ) : av ? (
                      <img src={av} alt={name} className="h-7 w-7 rounded-[0.3rem] object-cover shrink-0" />
                    ) : (
                      <div className="h-7 w-7 rounded-[0.3rem] bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-[10px] font-bold text-stone-600 dark:text-stone-300 shrink-0">
                        {name[0]?.toUpperCase()}
                      </div>
                    )
                  ) : (
                    <div className="w-7 shrink-0" />
                  )
                ) : null}
                <div className="relative">
                  {isMerchiva && !prevSame && (
                    <p className="text-[10px] font-semibold text-stone-700 dark:text-stone-300 mb-0.5 ml-0.5">Mr. Merchiva</p>
                  )}
                  <div
                    onTouchStart={(e) => handleTouchStart(msg, e)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    onContextMenu={(e) => handleContextMenu(msg, e)}
                    className={`max-w-[70vw] rounded-[0.3rem] px-3 py-2 text-sm select-none ${
                      msg.content?.startsWith("[task:done] ")
                        ? (isMe
                          ? "bg-green-800 text-white border border-green-700"
                          : "bg-green-50 text-foreground border border-green-200")
                        : (isMe ? "bg-foreground text-background" : "bg-background text-foreground border border-border")
                    }`}
                  >
                    {msg.replyToId && (() => {
                      const replied = messages.find((m) => m.id === msg.replyToId);
                      if (!replied) return null;
                      const repliedName = replied.senderId === userId ? t("chat.you") : getMemberName(replied.senderId);
                      return (
                        <div className={`mb-1.5 border-l-2 pl-2 pb-0.5 ${
                          isMe ? "border-primary-foreground/40" : "border-foreground/20"
                        }`}>
                          <p className={`text-[10px] font-medium ${isMe ? "text-primary-foreground/70" : "text-foreground/50"}`}>
                            {repliedName}
                          </p>
                          <p className={`text-xs truncate ${isMe ? "text-primary-foreground/60" : "text-foreground/40"}`}>
                            {replied.content}
                          </p>
                        </div>
                      );
                    })()}
                    {/* Attachment */}
                    {msg.attachmentUrl && msg.attachmentType === "image" && (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <img src={msg.attachmentUrl} alt={msg.attachmentName ?? ""} className="rounded-[0.3rem] max-w-full max-h-48 object-cover mt-1 cursor-pointer hover:opacity-90 transition-opacity" />
                      </a>
                    )}
                    {msg.attachmentUrl && msg.attachmentType === "video" && (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <video src={msg.attachmentUrl} className="rounded-[0.3rem] max-w-full max-h-48 mt-1 cursor-pointer" />
                      </a>
                    )}
                    {msg.attachmentUrl && msg.attachmentType === "file" && (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 mt-1 text-xs underline ${isMe ? "text-primary-foreground/80" : "text-foreground/60"}`}>
                        📎 {msg.attachmentName ?? t("chat.fileFallback")}
                      </a>
                    )}
                    {msg.content && (() => {
                      if (msg.content.startsWith("[task:done] ")) {
                        const lines = msg.content.split("\n");
                        const headerLine = lines[0].slice("[task:done] ".length);
                        const [title, rolePart] = headerLine.split(" | ");
                        // Parse embedded media: [image](url) or [video](url)
                        const media = lines.slice(1)
                          .map((l) => {
                            const m = l.match(/^\[(image|video)\]\((.+)\)$/);
                            return m ? { type: m[1] as "image" | "video", url: m[2] } : null;
                          })
                          .filter(Boolean) as { type: "image" | "video"; url: string }[];
                        return (
                          <div>
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${isMe ? "text-green-300" : "text-green-600"}`} />
                              <div className="min-w-0">
                                <p className="font-semibold text-sm leading-snug">{title}</p>
                                {rolePart && <p className={`text-xs mt-0.5 ${isMe ? "text-white/60" : "text-muted-foreground"}`}>{rolePart}</p>}
                              </div>
                            </div>
                            {media.length > 0 && (
                              <div className="flex gap-1.5 mt-2 flex-wrap">
                                {media.map((m, i) => (
                                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block">
                                    {m.type === "image" ? (
                                      <img src={m.url} alt="" className="rounded-[0.3rem] h-24 w-24 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                                    ) : (
                                      <video src={m.url} className="rounded-[0.3rem] h-24 w-24 object-cover cursor-pointer" />
                                    )}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return <span>{msg.content}</span>;
                    })()}
                  </div>
                  {/* Reaction badges */}
                  {Object.keys(emojiCounts).length > 0 && (
                    <div className={`flex gap-0.5 mt-0.5 ${isMe ? "justify-end" : ""}`}>
                      {Object.entries(emojiCounts).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          onClick={() => onReact(msg.id, emoji)}
                          className="flex items-center gap-0.5 rounded-[0.3rem] bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-700 px-1.5 py-0.5 text-xs hover:bg-stone-100 dark:bg-stone-800 transition-colors"
                        >
                          <span>{emoji}</span>
                          {count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Long-press context menu */}
      <AnimatePresence>
      {menuMsg && (() => {
        const isMe = menuMsg.senderId === userId;
        const viewH = typeof window !== "undefined" ? window.innerHeight : 800;
        const spaceBelow = viewH - menuPos.y;
        const showAbove = spaceBelow < 280;
        const top = showAbove ? Math.max(8, menuPos.y - 220) : menuPos.y;

        return (
          <motion.div
            key="menu-backdrop"
            className="fixed inset-0 z-[100]"
            onClick={() => setMenuMsg(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 bg-black/20" />
            <motion.div
              className="absolute w-[260px]"
              style={{
                top,
                ...(isMe ? { right: 16 } : { left: 16 }),
              }}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 6 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
            >
              {/* Emoji bar */}
              <motion.div
                className="flex gap-0.5 bg-background rounded-[0.3rem] p-1.5 border border-border mb-2"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, type: "spring", damping: 20, stiffness: 300 }}
              >
                {QUICK_EMOJIS.map((emoji, idx) => (
                  <motion.button
                    key={emoji}
                    onClick={() => { onReact(menuMsg.id, emoji); setMenuMsg(null); }}
                    className="text-xl p-1.5 rounded-[0.3rem] hover:bg-muted active:scale-125 transition-colors"
                    initial={{ opacity: 0, scale: 0.3 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.04 * idx, type: "spring", damping: 15, stiffness: 400 }}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </motion.div>
              {/* Actions card */}
              <motion.div
                className="bg-background rounded-[0.3rem] border border-border overflow-hidden"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, type: "spring", damping: 22, stiffness: 350 }}
              >
                <p className="px-3 pt-2 pb-1 font-mono uppercase text-stone-500 dark:text-stone-400 text-[9px] tracking-[0.6px]">
                  {formatTimeSeparator(new Date(menuMsg.createdAt), t)}
                </p>
                <button
                  onClick={() => { onReply(menuMsg); setMenuMsg(null); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" /> {t("chat.reply")}
                </button>
                {menuMsg.senderId !== userId && (
                  <button
                    onClick={() => {
                      const name = getMemberName(menuMsg.senderId);
                      setInput(`${input}@${name} `);
                      setMenuMsg(null);
                      inputRef.current?.focus();
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                  >
                    <span className="text-sm font-bold text-muted-foreground w-4 text-center">@</span> {t("chat.mention")}
                  </button>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(menuMsg.content); setMenuMsg(null); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> {t("chat.copy")}
                </button>
                {isMe && (
                  <button
                    onClick={() => { onDeleteMsg(menuMsg.id); setMenuMsg(null); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="h-4 w-4" /> {t("chat.delete")}
                  </button>
                )}
                {!isMe && (
                  <button
                    onClick={() => {
                      setMenuMsg(null);
                      if (confirm(`${t("chat.reportConfirmPrefix")} ${getMemberName(menuMsg.senderId)}${t("chat.reportConfirmSuffix")}`)) {
                        alert(t("chat.reportSubmitted"));
                      }
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <AlertTriangle className="h-4 w-4" /> {t("chat.reportAbuse")}
                  </button>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        );
      })()}
      </AnimatePresence>

      <div className="border-t border-border pb-[env(safe-area-inset-bottom,0px)]">
        {/* Reply preview bar */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2 px-3 pt-2 pb-1 bg-muted/50">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t("chat.replyingTo")} <span className="font-semibold text-foreground">{replyTo.senderId === userId ? t("chat.yourself") : getMemberName(replyTo.senderId)}</span>
                  </p>
                  <p className="text-sm truncate text-foreground/80">{replyTo.content}</p>
                </div>
                <button onClick={() => onReply(null)} className="p-1.5 rounded-[0.3rem] hover:bg-muted text-muted-foreground shrink-0 mt-0.5">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="p-3 pt-2">
          <div ref={inputWrapRef} className="rounded-[0.3rem] border border-border bg-background focus-within:border-stone-400 transition-colors">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                // Detect @ at end or after space
                const lastAt = val.lastIndexOf("@");
                if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === " ")) {
                  const query = val.slice(lastAt + 1);
                  if (!query.includes(" ")) {
                    setMentionSearch(query);
                    setShowMentionPicker(true);
                    // On mobile the picker is a bottom drawer; blur so the
                    // on-screen keyboard collapses. On desktop it's a popover
                    // anchored to the input — keep focus so typing keeps filtering.
                    if (isMobile) inputRef.current?.blur();
                    return;
                  }
                }
                setShowMentionPicker(false);
              }}
              onKeyDown={onKeyDown}
              placeholder={t("chat.typePlaceholder")}
              className="w-full resize-none bg-transparent border-0 outline-none px-3 pt-2.5 pb-1 text-sm leading-[1.5] placeholder:text-muted-foreground/60"
              autoComplete="off"
            />
            <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
              <label className="h-7 w-7 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center justify-center cursor-pointer transition-colors" title={t("chat.attach") ?? "Attach"}>
                <Paperclip className="h-[14px] w-[14px]" />
                <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" className="hidden" onChange={onFileUpload} />
              </label>
              <button
                className="h-7 px-2 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 transition-colors"
                title="Mention"
                onClick={() => {
                  const val = input + "@";
                  setInput(val);
                  setMentionSearch("");
                  setShowMentionPicker(true);
                }}
              >
                <AtSign className="h-[13px] w-[13px]" />
                <span className="text-[11px]">mention</span>
              </button>
              <div className="flex-1" />
              <kbd className="font-mono text-[10px] text-stone-400 dark:text-stone-500 border border-border rounded-[0.3rem] px-1.5 py-0.5">⏎ send</kbd>
              <button
                onClick={onSend}
                disabled={sending || !input.trim()}
                className="h-8 px-3 rounded-[0.3rem] bg-foreground text-background text-[12px] font-medium hover:bg-foreground/90 inline-flex items-center gap-1.5 disabled:opacity-30 transition-colors"
              >
                {sending ? <Spinner size={14} /> : "Send"}
                {!sending && <ArrowUp className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* @ Mention Picker — mobile: bottom drawer; desktop: popover on the input */}
      {isMobile ? (
        <Drawer open={showMentionPicker} onOpenChange={(o) => { if (!o) closeMentionPicker(); else setShowMentionPicker(true); }}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t("chat.selectMention")}</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={mentionSearch}
                  onChange={(e) => setMentionSearch(e.target.value)}
                  placeholder={t("chat.searchShort")}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[50vh] pb-4">
              {mentionOptions}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover open={showMentionPicker} onOpenChange={(o) => { if (!o) closeMentionPicker(); else setShowMentionPicker(true); }}>
          <PopoverContent
            anchor={inputWrapRef}
            side="top"
            align="start"
            sideOffset={8}
            className="w-[300px] p-0 overflow-hidden"
            initialFocus={false}
          >
            <div className="px-2.5 pt-2.5 pb-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={mentionSearch}
                  onChange={(e) => setMentionSearch(e.target.value)}
                  placeholder={t("chat.searchShort")}
                  className="pl-8 h-8 text-[13px]"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[260px] py-0.5">
              {mentionOptions}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
