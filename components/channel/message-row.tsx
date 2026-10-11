"use client";

import { useEffect, useRef, useState } from "react";
import { Pin, SmilePlus, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { fmt as fill } from "@/lib/i18n/fmt";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ChatEntry } from "@/lib/chat/model";
import { useChannelWorkspace } from "@/components/channel/context";
import { MessageBody } from "@/components/channel/message-body";
import { ActionSheet, HoverToolbar, ReactionPicker } from "@/components/channel/message-actions";

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const FULL: Intl.DateTimeFormatOptions = { dateStyle: "full", timeStyle: "short" };

/** Mr. Merchiva's old group-chat replies: the brand mark instead of a person. */
function MerchivaMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg bg-foreground text-background", className)}>
      <svg width="55%" height="55%" viewBox="0 0 100 100" aria-hidden>
        <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function SenderAvatar({ entry, size = "lg" }: { entry: Pick<ChatEntry, "senderHex" | "isMerchiva">; size?: "sm" | "md" | "lg" }) {
  const { nameOf, avatarOf } = useChannelWorkspace();
  if (entry.isMerchiva) return <MerchivaMark className={size === "lg" ? "h-9 w-9" : size === "md" ? "h-[30px] w-[30px]" : "h-6 w-6"} />;
  return <Avatar name={nameOf(entry.senderHex)} src={avatarOf(entry.senderHex)} size={size} shape="square" />;
}

function ReactionBar({ entry }: { entry: ChatEntry }) {
  const t = useT();
  const { run, writes, nameOf } = useChannelWorkspace();
  if (entry.reactions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {entry.reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => void run(() => writes.react(entry.conversationId, entry.id, r.emoji))}
          title={fill(t("chat.ws.reactedBy"), { names: r.userHexes.map((h) => nameOf(h)).join(", "), emoji: r.emoji })}
          aria-pressed={r.mine}
          className={cn(
            "flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors",
            r.mine ? "border-foreground/40 bg-foreground/10" : "border-border bg-background hover:bg-muted",
          )}
        >
          <span>{r.emoji}</span>
          <span className="font-mono tabular-nums text-muted-foreground">{r.count}</span>
        </button>
      ))}
      <ReactionPicker entry={entry} trigger={
        <button type="button" aria-label={t("chat.ws.addReaction")} className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted">
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      } />
    </div>
  );
}

function ThreadSummaryLink({ entry, onOpen }: { entry: ChatEntry; onOpen: () => void }) {
  const t = useT();
  const fmt = useDateFormat();
  const { nameOf, avatarOf } = useChannelWorkspace();
  if (!entry.thread) return null;
  const { count, lastReplyAt, participantHexes } = entry.thread;
  return (
    <button type="button" onClick={onOpen} className="group/thread mt-1 flex w-full max-w-md items-center gap-2 rounded-md border border-transparent px-1 py-1 text-start hover:border-border hover:bg-background">
      <span className="flex -space-x-1">
        {participantHexes.slice(0, 4).map((h) => <Avatar key={h} name={nameOf(h)} src={avatarOf(h)} size="xs" shape="square" />)}
      </span>
      <span className="text-xs font-semibold text-foreground underline-offset-2 group-hover/thread:underline">
        {count === 1 ? t("chat.ws.reply1") : fill(t("chat.ws.replies"), { count: String(count) })}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {fill(t("chat.ws.lastReply"), { time: fmt(lastReplyAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })}
      </span>
    </button>
  );
}

function InlineEditor({ entry, onDone }: { entry: ChatEntry; onDone: () => void }) {
  const t = useT();
  const { run, writes } = useChannelWorkspace();
  const [text, setText] = useState(entry.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const save = async () => {
    if (text.trim() === entry.content.trim()) return onDone();
    if (await run(() => writes.edit(entry.conversationId, entry.id, text))) onDone();
  };
  return (
    <div className="mt-0.5 rounded-lg border border-border bg-background focus-within:border-ring">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onDone(); }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); }
        }}
        rows={Math.min(8, Math.max(2, text.split("\n").length))}
        className="w-full resize-none bg-transparent px-3 pt-2 text-sm outline-none"
      />
      <div className="flex items-center justify-end gap-1.5 px-2 pb-2">
        <span className="me-auto text-[11px] text-muted-foreground">{t("chat.ws.editHint")}</span>
        <Button size="sm" variant="outline" onClick={onDone}>{t("chat.ws.cancel")}</Button>
        <Button size="sm" onClick={() => void save()} disabled={!text.trim() && !entry.attachment}>{t("chat.ws.save")}</Button>
      </div>
    </div>
  );
}

export interface MessageRowProps {
  entry: ChatEntry;
  /** A follow-up from the same sender: no avatar or name, time on hover. */
  compact: boolean;
  /** Inside the thread panel: no "reply in thread", no thread summary. */
  inThread?: boolean;
}

export function MessageRow({ entry, compact, inThread = false }: MessageRowProps) {
  const t = useT();
  const fmt = useDateFormat();
  const { nameOf, openPanel, isMobile, focusMessageId, people } = useChannelWorkspace();
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const focused = focusMessageId === entry.id;

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  const onThread = inThread || entry.deleted ? undefined : () => openPanel({ kind: "thread", parentId: entry.id });
  const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
  const role = people.get(entry.senderHex)?.role;

  return (
    <div
      ref={rowRef}
      data-message-id={entry.id}
      className={cn(
        "group/msg relative flex gap-2 px-4 transition-colors hover:bg-muted/50",
        compact ? "py-0.5" : "pt-2 pb-0.5",
        entry.mentionsMe && "border-s-2 border-foreground/50 bg-muted/60",
        entry.pinnedAt != null && !inThread && "bg-muted/40",
        focused && "bg-foreground/10",
      )}
      onTouchStart={isMobile && !entry.deleted ? () => { pressTimer.current = setTimeout(() => setSheetOpen(true), 450); } : undefined}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onContextMenu={isMobile && !entry.deleted ? (e) => { e.preventDefault(); setSheetOpen(true); } : undefined}
    >
      <div className="w-9 shrink-0">
        {compact ? (
          <span className="invisible block pt-1 text-end font-mono text-[10px] tabular-nums text-muted-foreground group-hover/msg:visible" title={fmt(entry.createdAt, FULL)}>
            {fmt(entry.createdAt, TIME)}
          </span>
        ) : (
          <SenderAvatar entry={entry} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {entry.pinnedAt != null && !inThread && !compact && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Pin className="h-3 w-3" />
            {fill(t("chat.ws.pinnedBy"), { name: nameOf(entry.pinnedBy) })}
          </p>
        )}
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{nameOf(entry.senderHex, entry.isMerchiva)}</span>
            {!entry.isMerchiva && role && role !== "staff" && (
              <span className="text-[10px] uppercase tracking-[0.6px] text-muted-foreground">{t(`personnel.team.role.${role}`)}</span>
            )}
            {entry.fromStore && (
              // Sent from the store's shared tablet (after a PIN / QR log-in), not the author's own device.
              <StatusBadge tone="neutral" size="xs" className="shrink-0 gap-1" title={t("chat.fromStoreHint")}>
                <Store className="h-3 w-3" />{t("chat.fromStore")}
              </StatusBadge>
            )}
            <time className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" title={fmt(entry.createdAt, FULL)}>
              {fmt(entry.createdAt, TIME)}
            </time>
          </div>
        )}
        {editing ? <InlineEditor entry={entry} onDone={() => setEditing(false)} /> : <MessageBody entry={entry} />}
        {!entry.deleted && <ReactionBar entry={entry} />}
        {!inThread && onThread && <ThreadSummaryLink entry={entry} onOpen={onThread} />}
        {!inThread && entry.deleted && entry.thread && (
          <ThreadSummaryLink entry={entry} onOpen={() => openPanel({ kind: "thread", parentId: entry.id })} />
        )}
      </div>
      {!isMobile && !editing && !entry.deleted && <HoverToolbar entry={entry} onThread={onThread} onEdit={() => setEditing(true)} />}
      {isMobile && (
        <ActionSheet entry={entry} onThread={onThread} onEdit={() => setEditing(true)} open={sheetOpen} onOpenChange={setSheetOpen} />
      )}
    </div>
  );
}
