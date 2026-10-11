"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Hash, Pencil, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { fmt as fill } from "@/lib/i18n/fmt";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { useNow } from "@/lib/use-now";
import { dateKey } from "@/lib/date-key";
import type { ChatChannel, ChatEntry } from "@/lib/chat/model";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useChannelWorkspace } from "@/components/channel/context";
import { MessageRow } from "@/components/channel/message-row";

/** Follow-ups from one sender within this window collapse under one header. */
const COMPACT_WINDOW_MS = 5 * 60 * 1000;

export function isCompactFollowUp(prev: ChatEntry | undefined, cur: ChatEntry): boolean {
  if (!prev || prev.deleted || cur.deleted) return false;
  if (prev.senderHex !== cur.senderHex || prev.isMerchiva !== cur.isMerchiva) return false;
  // What someone sent from the store's shared tablet stands apart from their own device's messages.
  if (prev.fromStore !== cur.fromStore) return false;
  if (prev.thread || cur.pinnedAt != null) return false;
  if (dateKey(new Date(prev.createdAt)) !== dateKey(new Date(cur.createdAt))) return false;
  return cur.createdAt - prev.createdAt < COMPACT_WINDOW_MS;
}

function DayDivider({ at }: { at: number }) {
  const t = useT();
  const fmt = useDateFormat();
  const now = useNow(60_000);
  const key = dateKey(new Date(at));
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const label = key === dateKey(now)
    ? t("chat.timeToday")
    : key === dateKey(yesterday)
      ? t("chat.timeYesterday")
      : fmt(at, { weekday: "long", month: "long", day: "numeric", ...(new Date(at).getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  return (
    <div className="relative my-2 flex items-center px-4" role="separator">
      <div className="h-px flex-1 bg-border" />
      <span className="mx-2 rounded-md border border-border bg-background px-2.5 py-0.5 text-[11px] font-semibold text-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function NewDivider() {
  const t = useT();
  return (
    <div className="my-1 flex items-center px-4" role="separator">
      <div className="h-px flex-1 bg-destructive/60" />
      <span className="ms-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-destructive">{t("chat.ws.newMessages")}</span>
    </div>
  );
}

interface IntroActions {
  /** Owners and managers: invite people into a group channel. */
  onAddPeople?: () => void;
  /** Owners and managers: set the group channel's topic. */
  onEditTopic?: () => void;
}

function ChannelIntro({ channel, onAddPeople, onEditTopic }: { channel: ChatChannel } & IntroActions) {
  const t = useT();
  const { nameOf, avatarOf } = useChannelWorkspace();
  const isGroup = channel.type === "group";
  // A channel can start with only its creator in it; say so, and offer the next step.
  const alone = isGroup && channel.memberHexes.length <= 1;
  return (
    <div className="px-4 pb-4 pt-8">
      {isGroup ? (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted"><Hash className="h-6 w-6 text-muted-foreground" /></span>
      ) : channel.peerHex && (
        <Avatar className="mb-3" name={nameOf(channel.peerHex)} src={avatarOf(channel.peerHex)} size="xl" shape="square" />
      )}
      <h2 className="text-xl font-bold text-foreground">{isGroup ? `# ${channel.name}` : channel.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {isGroup
          ? fill(t("chat.ws.beginningChannel"), { name: channel.name })
          : fill(t("chat.ws.beginningDm"), { name: channel.name })}
      </p>
      {channel.topic && <p className="mt-1 text-sm text-foreground">{channel.topic}</p>}
      {alone && <p className="mt-1 text-sm text-muted-foreground">{onAddPeople ? t("chat.ws.soloNote") : t("chat.ws.soloNoteStaff")}</p>}
      {isGroup && (onAddPeople || (onEditTopic && !channel.topic)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onAddPeople && (
            <Button size="sm" variant={alone ? "default" : "outline"} onClick={onAddPeople}><UserPlus />{t("chat.ws.addPeople")}</Button>
          )}
          {onEditTopic && !channel.topic && (
            <Button size="sm" variant="outline" onClick={onEditTopic}><Pencil />{t("chat.ws.addTopic")}</Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The channel's main list: day dividers, compact follow-ups, a "New" line
 * above the first message that arrived after `readUpTo`. Opens scrolled to
 * the bottom and stays pinned there while new messages come in, unless the
 * reader has scrolled up.
 */
export function MessageList({ channel, entries, newSince, onAddPeople, onEditTopic }: {
  channel: ChatChannel;
  entries: ChatEntry[];
  newSince: number | null;
} & IntroActions) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const lastCount = useRef(0);

  const firstNewId = useMemo(() => {
    if (newSince == null) return null;
    return entries.find((e) => !e.isMine && e.createdAt > newSince)?.id ?? null;
  }, [entries, newSince]);

  useLayoutEffect(() => {
    stuck.current = true;
    lastCount.current = 0;
  }, [channel.id]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stuck.current || entries.length < lastCount.current) el.scrollTop = el.scrollHeight;
    lastCount.current = entries.length;
  }, [entries, channel.id]);

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3"
      onScroll={(e) => {
        const el = e.currentTarget;
        stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <ChannelIntro channel={channel} onAddPeople={onAddPeople} onEditTopic={onEditTopic} />
      {entries.map((entry, i) => {
        const prev = entries[i - 1];
        const newDay = !prev || dateKey(new Date(prev.createdAt)) !== dateKey(new Date(entry.createdAt));
        const isNew = entry.id === firstNewId;
        return (
          <div key={entry.id}>
            {newDay && <DayDivider at={entry.createdAt} />}
            {isNew && <NewDivider />}
            <MessageRow entry={entry} compact={!newDay && !isNew && isCompactFollowUp(prev, entry)} />
          </div>
        );
      })}
    </div>
  );
}
