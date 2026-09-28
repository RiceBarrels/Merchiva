"use client";

import { uuid, cn } from "@/lib/utils";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Plus, Users, ArrowLeft, Search, X, UserPlus, AlertTriangle, CheckCircle2, Paperclip, AtSign, ArrowUp, MoreHorizontal, QrCode, BellOff, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementHeader, DynamicUIElementTitle, DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { toast } from "sonner";
import { usePermissions } from "@/lib/context/permissions";
import { getCached, setCache } from "@/lib/cache";
import { sendMessage, addMembersToConversation, addReaction, removeReaction, deleteMessage, createConversation } from "@/lib/spacetimedb/actions";
import {
  getConversations, getMessages, getReactions, uploadChatFile,
  type ChatReaction,
} from "@/lib/db/chat";
import { getTeamForScheduling } from "@/lib/db/staffing";
import { getAvatarMap } from "@/lib/db/avatars";
import type { ChatConversation, ChatMessage, OrgMember } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { useT } from "@/lib/i18n/context";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import { useCurrentOperator } from "@/lib/store-device-lock";
import { Spinner } from "@/components/ui/loaders/geometric";

// Mr. Merchiva's avatar on the replies he posted when he could still be added to
// a group chat: the brand "M" mark on the foreground token. He lives in the ⌘⇧M
// dock now (components/merchiva-dock), not in Channel.
function MerchivaAvatar({ className = "h-9 w-9", svg = 18 }: { className?: string; svg?: number }) {
  const t = useT();
  return (
    <div className={cn("shrink-0 flex items-center justify-center rounded-lg bg-foreground text-background", className)} title={t("chat.mrMerchiva")}>
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
  const { organizationId, role } = usePermissions();
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
    const ids = [organizationId];
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
  }, [organizationId, userId]);

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
    } catch (err) {
      console.error("Send failed:", err);
      setInput(content);
    } finally {
      setSending(false);
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
    // new to us so callers get the REAL id.
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
      setConversations((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
      setActiveConv(conv);
      setNewGroupDialog(false);
      setGroupName("");
      setSelectedMembers([]);
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
    try {
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
    } catch {
      // There is no reactions table in the module yet. Say so, rather than
      // applying an optimistic update the next reload silently discards.
      toast.error(t("chat.reactionsUnsupported"));
    }
  };

  const handleDeleteMsg = async (messageId: string) => {
    if (!activeConv) return;
    await deleteMessage(activeConv.id, messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const getConvDisplayName = (conv: ChatConversation) => {
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
                  <Button size="sm" onClick={() => { setSelectedMembers([]); setNewGroupDialog(true); }} className="gap-1 h-8 text-xs">
                    <Plus className="h-3.5 w-3.5" /> {t("chat.group")}
                  </Button>
                )}
              </div>
            }
          />

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <EmptyState icon={MessageSquare} title={t("chat.noConversations")} description={t("chat.startDMPrompt")} />
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
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xs font-bold text-muted-foreground">
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
          {activeConv ? (
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
            <EmptyState className="flex-1" icon={MessageSquare} description={t("chat.selectConversation")} />
          )}
        </div>

        {/* Mobile: DynamicUIElement */}
        <DynamicUIElement open={showChat && isMobile} onOpenChange={(open) => { if (!open) setActiveConv(null); }}>
          <DynamicUIElementContent showCloseButton={false} noPadding>
            <DynamicUIElementTitle mobileTitle={activeConv ? getConvDisplayName(activeConv) : t("chat.chatFallback")} className="hidden">
              {activeConv ? getConvDisplayName(activeConv) : t("chat.chatFallback")}
            </DynamicUIElementTitle>
            {activeConv ? (
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
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xs font-bold text-muted-foreground">
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
                    <StatusBadge key={uid} tone="neutral" className="gap-1 font-mono">
                      {getMemberName(uid)}
                      <button type="button" onClick={() => setSelectedMembers((prev) => prev.filter((id) => id !== uid))}>
                        <X className="h-3 w-3" />
                      </button>
                    </StatusBadge>
                  ))}
                </div>
              )}
              <div className="max-h-40 overflow-y-auto space-y-0.5 pt-1">
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
                        className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors ${
                          selected ? "bg-muted border border-border" : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[10px] font-bold text-muted-foreground">
                          {m.displayName[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm flex-1">{m.displayName}</span>
                        {selected && <span className="text-xs font-mono text-muted-foreground">{t("chat.added")}</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
            <Button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedMembers.length === 0}
              className="w-full"
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
                      className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors ${
                        selected ? "bg-muted border border-border" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[10px] font-bold text-muted-foreground">
                        {m.displayName[0]?.toUpperCase()}
                      </div>
                      <span className="text-sm flex-1">{m.displayName}</span>
                      {selected && <span className="text-xs font-mono text-muted-foreground">{t("chat.added")}</span>}
                    </button>
                  );
                })}
            </div>
            <Button
              onClick={handleAddMembers}
              disabled={selectedMembers.length === 0}
              className="w-full"
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
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
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
  const mentionOptions = (
    <>
      {showEveryone && (
        <button
          onClick={() => selectMention("everyone")}
          className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted transition-colors border-b border-border text-left"
        >
          <div className="h-9 w-9 rounded-lg border border-border bg-muted flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-muted-foreground" />
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
              <img src={av} alt={m.displayName} className="h-9 w-9 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="h-9 w-9 rounded-lg border border-border bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
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

  const memberNames = conv.members?.map((m) => getMemberName(m.userId)).filter(Boolean) ?? [];
  const mobileGroupInfoButton = typeof document !== "undefined" && hideHeader && isMobile && conv.type === "group"
    ? createPortal(
        <button
          type="button"
          onClick={() => setGroupInfoOpen(true)}
          className="fixed right-4 h-12 w-12 rounded-full border border-border bg-primary text-primary-foreground inline-flex items-center justify-center active:scale-95 transition-transform"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + var(--merchiva-app-promo-height, 0px) + 16px)",
            zIndex: 201,
          }}
          aria-label={t("chat.groupInfo")}
          title={t("chat.groupInfo")}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>,
        document.body,
      )
    : null;

  return (
    <>
      {mobileGroupInfoButton}
      <div className={cn("flex items-center gap-3 border-b border-border shrink-0", hideHeader ? "hidden" : "px-4 py-3")}>
        {hideHeader && (
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-sm font-semibold truncate">{getConvDisplayName(conv)}</p>
          <p className="text-[11px] text-muted-foreground">
            {conv.type === "group" ? `${conv.members?.length ?? 0} ${t("chat.memberPlural").toLowerCase()}` : t("chat.directMessage")}
          </p>
        </div>
        {conv.type === "group" && isManager && !hideHeader && (
          <Button size="sm" variant="outline" onClick={onAddMembers} className="gap-1 h-8 text-xs">
            <UserPlus className="h-3.5 w-3.5" /> {t("chat.add")}
          </Button>
        )}
        {conv.type === "group" ? (
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setGroupInfoOpen(true)} aria-label={t("chat.groupInfo")}>
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        ) : hideHeader ? <span className="h-9 w-9 shrink-0" /> : null}
      </div>

      <Drawer open={groupInfoOpen} onOpenChange={setGroupInfoOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader>
            <DrawerTitle>{t("chat.groupInfo")}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <div className="grid grid-cols-5 gap-4 py-3 sm:grid-cols-6">
              {conv.members?.slice(0, 12).map((m) => {
                const name = getMemberName(m.userId);
                const av = getAvatar(m.userId);
                return (
                  <div key={m.userId} className="min-w-0 text-center">
                    {av ? (
                      <img src={av} alt={name} className="mx-auto h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground">
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                    <p className="mt-1 truncate text-xs text-muted-foreground">{name}</p>
                  </div>
                );
              })}
              {isManager && (
                <Button type="button" variant="ghost" onClick={onAddMembers} className="h-12 w-12 border border-dashed border-border text-muted-foreground [&_svg:not([class*='size-'])]:size-5">
                  <UserPlus className="h-5 w-5" />
                </Button>
              )}
            </div>
            <div className="mt-4 divide-y divide-border border-y border-border">
              <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-0 py-4 text-left hover:bg-transparent">
                <span className="text-sm font-medium">{t("chat.groupName")}</span>
                <span className="max-w-[60%] truncate text-sm font-normal text-muted-foreground">{getConvDisplayName(conv)}</span>
              </Button>
              <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-0 py-4 text-left hover:bg-transparent [&_svg:not([class*='size-'])]:size-5">
                <span className="text-sm font-medium">{t("chat.groupQr")}</span>
                <QrCode className="h-5 w-5 text-muted-foreground" />
              </Button>
              <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-0 py-4 text-left hover:bg-transparent [&_svg:not([class*='size-'])]:size-5">
                <span className="text-sm font-medium">{t("chat.searchMessages")}</span>
                <Search className="h-5 w-5 text-muted-foreground" />
              </Button>
              <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-0 py-4 text-left hover:bg-transparent [&_svg:not([class*='size-'])]:size-5">
                <span className="text-sm font-medium">{t("chat.muteMessages")}</span>
                <BellOff className="h-5 w-5 text-muted-foreground" />
              </Button>
              <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-0 py-4 text-left hover:bg-transparent [&_svg:not([class*='size-'])]:size-5">
                <span className="text-sm font-medium">{t("chat.pinChat")}</span>
                <Pin className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>
            {memberNames.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">{memberNames.join(", ")}</p>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      <div className={cn("flex-1 overflow-y-auto flex flex-col", isMobile ? "px-3 py-2" : "p-4")}>
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">{t("chat.noMessagesHello")}</p>
        )}
        {messages.map((msg, i) => {
          // Mr. Merchiva's old group-chat replies were inserted under the
          // triggering user's identity but flagged isMerchiva — so they must
          // never render as "me", and use the bot's name/avatar instead.
          const isMerchiva = msg.isMerchiva === true;
          const senderKey = (m: ChatMessage) => (m.isMerchiva ? "__merchiva__" : m.senderId);
          const myKey = senderKey(msg);
          const isMe = !isMerchiva && msg.senderId === userId;
          const showTime = shouldShowTimeSeparator(messages, i);
          const nextSame = i < messages.length - 1 && senderKey(messages[i + 1]) === myKey && !shouldShowTimeSeparator(messages, i + 1);
          const prevSame = i > 0 && senderKey(messages[i - 1]) === myKey && !showTime;
          const isLast = !nextSame;
          const av = isMerchiva ? null : getAvatar(msg.senderId);
          const name = isMerchiva ? t("chat.mrMerchiva") : getMemberName(msg.senderId);
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
                  <div className="flex-1 h-px bg-border" />
                  <span className="font-mono uppercase tabular-nums text-muted-foreground text-[10px] tracking-[0.6px]">
                    {formatTimeSeparator(new Date(msg.createdAt), t)}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <div className={`flex items-end gap-2 ${gap} ${isMe ? "justify-end" : "justify-start"}`}>
                {!isMe ? (
                  isLast ? (
                    isMerchiva ? (
                      <MerchivaAvatar className="h-7 w-7" svg={14} />
                    ) : av ? (
                      <img src={av} alt={name} className="h-7 w-7 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="h-7 w-7 rounded-lg border border-border bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                        {name[0]?.toUpperCase()}
                      </div>
                    )
                  ) : (
                    <div className="w-7 shrink-0" />
                  )
                ) : null}
                <div className="relative">
                  {isMerchiva && !prevSame && (
                    <p className="text-[10px] font-semibold text-foreground mb-0.5 ml-0.5">{t("chat.mrMerchiva")}</p>
                  )}
                  <div
                    onTouchStart={(e) => handleTouchStart(msg, e)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    onContextMenu={(e) => handleContextMenu(msg, e)}
                    className={`max-w-[min(78vw,34rem)] rounded-lg px-3 py-2 text-sm select-none ${
                      msg.content?.startsWith("[task:done] ")
                        ? (isMe
                          ? "bg-emerald-800 text-white border border-emerald-700"
                          : "bg-emerald-50 text-foreground border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900")
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
                        <img src={msg.attachmentUrl} alt={msg.attachmentName ?? ""} className="rounded-lg max-w-full max-h-48 object-cover mt-1 cursor-pointer hover:opacity-90 transition-opacity" />
                      </a>
                    )}
                    {msg.attachmentUrl && msg.attachmentType === "video" && (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <video src={msg.attachmentUrl} className="rounded-lg max-w-full max-h-48 mt-1 cursor-pointer" />
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
                              <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${isMe ? "text-emerald-300" : "text-emerald-600 dark:text-emerald-400"}`} />
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
                                      <img src={m.url} alt="" className="rounded-lg h-24 w-24 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                                    ) : (
                                      <video src={m.url} className="rounded-lg h-24 w-24 object-cover cursor-pointer" />
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
                          className="flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-xs hover:bg-muted transition-colors"
                        >
                          <span>{emoji}</span>
                          {count > 1 && <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{count}</span>}
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
                className="flex gap-0.5 bg-background rounded-lg p-1.5 border border-border mb-2"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, type: "spring", damping: 20, stiffness: 300 }}
              >
                {QUICK_EMOJIS.map((emoji, idx) => (
                  <motion.button
                    key={emoji}
                    onClick={() => { onReact(menuMsg.id, emoji); setMenuMsg(null); }}
                    className="text-xl p-1.5 rounded hover:bg-muted active:scale-125 transition-colors"
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
                className="bg-background rounded-lg border border-border overflow-hidden"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, type: "spring", damping: 22, stiffness: 350 }}
              >
                <p className="px-3 pt-2 pb-1 font-mono uppercase tabular-nums text-muted-foreground text-[9px] tracking-[0.6px]">
                  {formatTimeSeparator(new Date(menuMsg.createdAt), t)}
                </p>
                <Button
                  onClick={() => { onReply(menuMsg); setMenuMsg(null); }}
                  variant="ghost" className="h-auto w-full justify-start gap-2.5 rounded-none px-3 py-2.5 text-sm font-normal"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" /> {t("chat.reply")}
                </Button>
                {menuMsg.senderId !== userId && (
                  <Button
                    onClick={() => {
                      const name = getMemberName(menuMsg.senderId);
                      setInput(`${input}@${name} `);
                      setMenuMsg(null);
                      inputRef.current?.focus();
                    }}
                    variant="ghost" className="h-auto w-full justify-start gap-2.5 rounded-none px-3 py-2.5 text-sm font-normal"
                  >
                    <span className="text-sm font-bold text-muted-foreground w-4 text-center">@</span> {t("chat.mention")}
                  </Button>
                )}
                <Button
                  onClick={() => { navigator.clipboard.writeText(menuMsg.content); setMenuMsg(null); }}
                  variant="ghost" className="h-auto w-full justify-start gap-2.5 rounded-none px-3 py-2.5 text-sm font-normal"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> {t("chat.copy")}
                </Button>
                {isMe && (
                  <Button
                    onClick={() => { onDeleteMsg(menuMsg.id); setMenuMsg(null); }}
                    variant="ghost" className="h-auto w-full justify-start gap-2.5 rounded-none px-3 py-2.5 text-sm font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" /> {t("chat.delete")}
                  </Button>
                )}
                {!isMe && (
                  <Button
                    onClick={() => {
                      setMenuMsg(null);
                      if (confirm(`${t("chat.reportConfirmPrefix")} ${getMemberName(menuMsg.senderId)}${t("chat.reportConfirmSuffix")}`)) {
                        alert(t("chat.reportSubmitted"));
                      }
                    }}
                    variant="ghost" className="h-auto w-full justify-start gap-2.5 rounded-none px-3 py-2.5 text-sm font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <AlertTriangle className="h-4 w-4" /> {t("chat.reportAbuse")}
                  </Button>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        );
      })()}
      </AnimatePresence>

      <div className="border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)]">
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
                <Button variant="ghost" size="icon-sm" onClick={() => onReply(null)} className="shrink-0 mt-0.5 text-muted-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="p-3 pt-2">
          <div ref={inputWrapRef} className="rounded-lg border border-border bg-background focus-within:border-ring transition-colors">
            <textarea
              ref={inputRef}
              rows={isMobile ? 1 : 2}
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
              className={cn("w-full resize-none bg-transparent border-0 outline-none px-3 text-sm leading-[1.5] placeholder:text-muted-foreground/60", isMobile ? "pt-2 pb-0 min-h-9" : "pt-2.5 pb-1")}
              autoComplete="off"
            />
            <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
              <label className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted inline-flex items-center justify-center cursor-pointer transition-colors" title={t("chat.attach")}>
                <Paperclip className="h-[14px] w-[14px]" />
                <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" className="hidden" onChange={onFileUpload} />
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="px-2 text-muted-foreground"
                title={t("chat.mention")}
                onClick={() => {
                  const val = input + "@";
                  setInput(val);
                  setMentionSearch("");
                  setShowMentionPicker(true);
                }}
              >
                <AtSign className="h-[13px] w-[13px]" />
                <span className="text-[11px]">{t("chat.mentionLower")}</span>
              </Button>
              <div className="flex-1" />
              {!isMobile && <kbd className="font-mono text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">⏎ {t("chat.sendKbd")}</kbd>}
              <Button
                onClick={onSend}
                disabled={sending || !input.trim()}
                className="px-3 text-[12px] disabled:opacity-30"
              >
                {sending ? <Spinner size={14} /> : t("chat.send")}
                {!sending && <ArrowUp className="h-3.5 w-3.5" />}
              </Button>
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
