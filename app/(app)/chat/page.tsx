"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare, Plus, Send, Loader2, Users, ArrowLeft, Search, X, UserPlus, ChevronDown, AlertTriangle, CheckCircle2,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { usePermissions } from "@/lib/context/permissions";
import { getCached, setCache } from "@/lib/cache";
import { sendMessage, addMembersToConversation, addReaction, removeReaction, deleteMessage } from "@/lib/spacetimedb/actions";
import {
  getConversations, getMessages, getReactions, uploadChatFile,
  type ChatReaction,
} from "@/lib/db/chat";
import { getTeamForScheduling } from "@/lib/db/staffing";
import { getAvatarMap } from "@/lib/db/avatars";
import type { ChatConversation, ChatMessage, OrgMember } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";

function formatTimeSeparator(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (sameDay) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
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

  useEffect(() => {
    // SpacetimeDB: identity is stored in localStorage token
    const token = localStorage.getItem("stdb_token");
    if (token) setUserId(token.slice(0, 36)); // use token prefix as stable ID
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    // Show cached conversations immediately
    const cachedConvs = getCached<ChatConversation[]>(`conversations_${organizationId}`);
    if (cachedConvs) setConversations(cachedConvs);
    setLoading(false);

    Promise.all([
      getConversations(organizationId),
      getTeamForScheduling(organizationId),
    ])
      .then(async ([convs, t]) => {
        setConversations(convs);
        setCache(`conversations_${organizationId}`, convs);
        setTeam(t);
        const userIds = t.map((m) => m.userId);
        const avMap = await getAvatarMap(userIds);
        setAvatars(avMap);
      })
      .catch((err) => console.error("Chat load failed:", err));
  }, [organizationId]);

  // Load messages when conversation changes
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
  }, [activeConv]);

  // Realtime updates come via SpacetimeDB WebSocket subscription (no Supabase needed)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (attachment?: { url: string; type: string; name: string } | null) => {
    if ((!input.trim() && !attachment) || !activeConv) return;
    const content = input.trim();
    const replyId = replyTo?.id ?? null;
    setInput("");
    setReplyTo(null);
    setSending(true);
    try {
      await sendMessage(activeConv.id, content || (attachment ? `Sent ${attachment.type === "image" ? "a photo" : attachment.type === "video" ? "a video" : "a file"}` : ""), replyId, attachment);
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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, type, memberUserIds, name }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    const c = json.conversation;
    return {
      id: c.id,
      organizationId: c.organization_id,
      type: c.type,
      name: c.name,
      createdBy: c.created_by,
      createdAt: c.created_at,
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
      setConversations((prev) => [conv, ...prev]);
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
      const convs = await getConversations(organizationId);
      setConversations(convs);
      const updated = convs.find((c) => c.id === activeConv.id);
      if (updated) setActiveConv(updated);
    }
  };

  const getMemberName = useCallback(
    (uid: string) => team.find((m) => m.userId === uid)?.displayName ?? "Unknown",
    [team]
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
        [messageId]: [...(prev[messageId] ?? []), { id: crypto.randomUUID(), messageId, userId: userId!, emoji }],
      }));
    }
  };

  const handleDeleteMsg = async (messageId: string) => {
    await deleteMessage(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const getConvDisplayName = (conv: ChatConversation) => {
    if (conv.type === "group") return conv.name ?? "Group";
    const other = conv.members?.find((m) => m.userId !== userId);
    return other ? getMemberName(other.userId) : "Chat";
  };

  const filteredTeam = team.filter(
    (m) => m.displayName.toLowerCase().includes(memberSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold">Messages</h1>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setNewDmDialog(true)} className="gap-1 h-8 text-xs">
                  <MessageSquare className="h-3.5 w-3.5" /> DM
                </Button>
                {isManager && (
                  <Button size="sm" onClick={() => setNewGroupDialog(true)} className="gap-1 h-8 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Group
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
                <p className="text-xs text-muted-foreground">Start a DM or create a group</p>
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
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        conv.type === "group" ? "bg-primary/10 text-primary" : "bg-stone-100 text-stone-600"
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
                            ? `${lastMsg.senderId === userId ? "You" : getMemberName(lastMsg.senderId)}: ${lastMsg.content}`
                            : conv.type === "group"
                            ? `${memberCount} members`
                            : "No messages yet"
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
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center space-y-2">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">Select a conversation</p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile: Dialog */}
        <Dialog open={showChat && isMobile} onOpenChange={(open) => { if (!open) setActiveConv(null); }}>
          <DialogContent showCloseButton={false} noPadding>
            <DialogTitle mobileTitle={activeConv ? getConvDisplayName(activeConv) : "Chat"} className="hidden">
              {activeConv ? getConvDisplayName(activeConv) : "Chat"}
            </DialogTitle>
            {activeConv && (
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
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* ─── New DM Dialog ─────────────────────────── */}
      <Dialog open={newDmDialog} onOpenChange={setNewDmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle mobileTitle="New Message">New Direct Message</DialogTitle>
            <DialogDescription>Choose a team member to message</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {team
              .filter((m) => m.userId !== userId)
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleCreateDm(m.userId)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600">
                    {m.displayName[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                  </div>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── New Group Dialog ──────────────────────── */}
      <Dialog open={newGroupDialog} onOpenChange={setNewGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle mobileTitle="New Group">Create Group Chat</DialogTitle>
            <DialogDescription>Name the group and add members</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Group Name *</Label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Morning Shift, All Staff"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Members</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search team..."
                  className="pl-8"
                />
              </div>
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {selectedMembers.map((uid) => (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
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
                        className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-left transition-colors ${
                          selected ? "bg-primary/10" : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-600">
                          {m.displayName[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm flex-1">{m.displayName}</span>
                        {selected && <span className="text-xs text-primary font-medium">Added</span>}
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
              Create Group ({selectedMembers.length} members)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Add Members Dialog ────────────────────── */}
      <Dialog open={addMemberDialog} onOpenChange={setAddMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle mobileTitle="Add Members">Add Members to Group</DialogTitle>
            <DialogDescription>Select team members to add</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search team..."
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
                      className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-left transition-colors ${
                        selected ? "bg-primary/10" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-600">
                        {m.displayName[0]?.toUpperCase()}
                      </div>
                      <span className="text-sm flex-1">{m.displayName}</span>
                      {selected && <span className="text-xs text-primary font-medium">Added</span>}
                    </button>
                  );
                })}
            </div>
            <Button
              onClick={handleAddMembers}
              disabled={selectedMembers.length === 0}
              className="w-full"
            >
              Add {selectedMembers.length} Member{selectedMembers.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
}) {
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; isMe: boolean }>({ x: 0, y: 0, isMe: false });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchTarget = useRef<HTMLElement | null>(null);

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
            {conv.type === "group" ? `${conv.members?.length ?? 0} members` : "Direct message"}
          </p>
        </div>
        {conv.type === "group" && isManager && (
          <Button size="sm" variant="outline" onClick={onAddMembers} className="gap-1 h-8 text-xs">
            <UserPlus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hello!</p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.senderId === userId;
          const showTime = shouldShowTimeSeparator(messages, i);
          const nextSame = i < messages.length - 1 && messages[i + 1].senderId === msg.senderId && !shouldShowTimeSeparator(messages, i + 1);
          const prevSame = i > 0 && messages[i - 1].senderId === msg.senderId && !showTime;
          const isLast = !nextSame;
          const av = getAvatar(msg.senderId);
          const name = getMemberName(msg.senderId);
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
                <p className="text-center text-[10px] text-muted-foreground py-3">
                  {formatTimeSeparator(new Date(msg.createdAt))}
                </p>
              )}
              <div className={`flex items-end gap-2 ${gap} ${isMe ? "justify-end" : "justify-start"}`}>
                {!isMe ? (
                  isLast ? (
                    av ? (
                      <img src={av} alt={name} className="h-7 w-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-stone-200 flex items-center justify-center text-[10px] font-bold text-stone-500 shrink-0">
                        {name[0]?.toUpperCase()}
                      </div>
                    )
                  ) : (
                    <div className="w-7 shrink-0" />
                  )
                ) : null}
                <div className="relative">
                  <div
                    onTouchStart={(e) => handleTouchStart(msg, e)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    onContextMenu={(e) => handleContextMenu(msg, e)}
                    className={`max-w-[70vw] rounded-2xl px-3 py-2 text-sm select-none ${
                      msg.content?.startsWith("[task:done] ")
                        ? (isMe
                          ? "bg-green-800 text-white border border-green-700"
                          : "bg-green-50 text-foreground border border-green-200")
                        : (isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")
                    } ${isMe ? (isLast ? "rounded-br-sm" : "") : (isLast ? "rounded-bl-sm" : "")}`}
                  >
                    {msg.replyToId && (() => {
                      const replied = messages.find((m) => m.id === msg.replyToId);
                      if (!replied) return null;
                      const repliedName = replied.senderId === userId ? "You" : getMemberName(replied.senderId);
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
                        <img src={msg.attachmentUrl} alt={msg.attachmentName ?? "image"} className="rounded-lg max-w-full max-h-48 object-cover mt-1 cursor-pointer hover:opacity-90 transition-opacity" />
                      </a>
                    )}
                    {msg.attachmentUrl && msg.attachmentType === "video" && (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <video src={msg.attachmentUrl} className="rounded-lg max-w-full max-h-48 mt-1 cursor-pointer" />
                      </a>
                    )}
                    {msg.attachmentUrl && msg.attachmentType === "file" && (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 mt-1 text-xs underline ${isMe ? "text-primary-foreground/80" : "text-foreground/60"}`}>
                        📎 {msg.attachmentName ?? "File"}
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
                          className="flex items-center gap-0.5 rounded-full bg-muted border border-border px-1.5 py-0.5 text-xs hover:bg-stone-200 transition-colors"
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
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
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
                className="flex gap-0.5 bg-card/95 backdrop-blur-md rounded-full p-1.5 shadow-xl border border-border/50 mb-2"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, type: "spring", damping: 20, stiffness: 300 }}
              >
                {QUICK_EMOJIS.map((emoji, idx) => (
                  <motion.button
                    key={emoji}
                    onClick={() => { onReact(menuMsg.id, emoji); setMenuMsg(null); }}
                    className="text-xl p-1.5 rounded-full hover:bg-muted active:scale-125 transition-colors"
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
                className="bg-card/95 backdrop-blur-md rounded-xl shadow-xl border border-border/50 overflow-hidden"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, type: "spring", damping: 22, stiffness: 350 }}
              >
                <p className="px-3 pt-2 pb-1 text-[9px] text-muted-foreground uppercase tracking-wide">
                  {formatTimeSeparator(new Date(menuMsg.createdAt))}
                </p>
                <button
                  onClick={() => { onReply(menuMsg); setMenuMsg(null); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm hover:bg-muted/80 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" /> Reply
                </button>
                {menuMsg.senderId !== userId && (
                  <button
                    onClick={() => {
                      const name = getMemberName(menuMsg.senderId);
                      setInput(`${input}@${name} `);
                      setMenuMsg(null);
                      inputRef.current?.focus();
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm hover:bg-muted/80 transition-colors"
                  >
                    <span className="text-sm font-bold text-muted-foreground w-4 text-center">@</span> Mention
                  </button>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(menuMsg.content); setMenuMsg(null); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm hover:bg-muted/80 transition-colors"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> Copy
                </button>
                {isMe && (
                  <button
                    onClick={() => { onDeleteMsg(menuMsg.id); setMenuMsg(null); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="h-4 w-4" /> Delete
                  </button>
                )}
                {!isMe && (
                  <button
                    onClick={() => {
                      setMenuMsg(null);
                      if (confirm(`Report this message from ${getMemberName(menuMsg.senderId)}? Your manager will be notified.`)) {
                        alert("Report submitted. Your manager has been notified and will review this message.");
                      }
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <AlertTriangle className="h-4 w-4" /> Report Abuse
                  </button>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        );
      })()}
      </AnimatePresence>

      <div className="border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
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
                    Replying to <span className="font-semibold text-foreground">{replyTo.senderId === userId ? "yourself" : getMemberName(replyTo.senderId)}</span>
                  </p>
                  <p className="text-sm truncate text-foreground/80">{replyTo.content}</p>
                </div>
                <button onClick={() => onReply(null)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground shrink-0 mt-0.5">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2 p-3 pt-2">
          <label className="shrink-0 p-2 rounded-full hover:bg-muted text-muted-foreground cursor-pointer transition-colors">
            <Plus className="h-5 w-5" />
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" className="hidden" onChange={onFileUpload} />
          </label>
          <Input
            ref={inputRef}
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
                  inputRef.current?.blur();
                  return;
                }
              }
              setShowMentionPicker(false);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a message..."
            className="flex-1"
            autoComplete="off"
          />
          <Button onClick={onSend} disabled={sending || !input.trim()} size="sm" className="px-3">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* @ Mention Picker Drawer */}
      <Drawer open={showMentionPicker} onOpenChange={setShowMentionPicker}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Select @ mention</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={mentionSearch}
                onChange={(e) => setMentionSearch(e.target.value)}
                placeholder="Search..."
                className="pl-8 h-9"
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[50vh] pb-4">
            {/* @everyone option */}
            {"everyone".includes(mentionSearch.toLowerCase()) && (
              <button
                onClick={() => {
                  const lastAt = input.lastIndexOf("@");
                  const before = input.slice(0, lastAt);
                  setInput(`${before}@everyone `);
                  setShowMentionPicker(false);
                  setMentionSearch("");
                  inputRef.current?.focus();
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/50"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">everyone</p>
                  <p className="text-xs text-muted-foreground">Notify all members</p>
                </div>
              </button>
            )}
            {team
              .filter((m) => m.userId !== userId && m.displayName.toLowerCase().includes(mentionSearch.toLowerCase()))
              .map((m) => {
                const av = getAvatar(m.userId);
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      const lastAt = input.lastIndexOf("@");
                      const before = input.slice(0, lastAt);
                      setInput(`${before}@${m.displayName} `);
                      setShowMentionPicker(false);
                      setMentionSearch("");
                      inputRef.current?.focus();
                    }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/50"
                  >
                    {av ? (
                      <img src={av} alt={m.displayName} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-stone-200 flex items-center justify-center text-sm font-bold text-stone-500">
                        {m.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium">{m.displayName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                    </div>
                  </button>
                );
              })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
