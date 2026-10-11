"use client";

import { useState } from "react";
import { BellOff, ChevronDown, Hash, Info, Plus, Search, SquarePen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { useAnyDot, useConversationDot } from "@/lib/notifications/dots-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationDot } from "@/components/ui/notification-dot";
import { badgeCount, sidebarSections, type ChatChannel } from "@/lib/chat/model";
import { useChannelWorkspace } from "@/components/channel/context";

interface SidebarProps {
  activeId: string | null;
  onNewChannel: () => void;
  /** Undefined where a direct message cannot be started (a store machine's PIN operator). */
  onNewDm?: () => void;
  onSearchAll: () => void;
}

/**
 * One conversation. Its notification dot (a pin, a thread reply, a mention — rows
 * that may not raise `unread`) sits on the leading glyph, so the Channel nav row's
 * dot can be traced to the conversation behind it.
 */
function ChannelLink({ channel, active }: { channel: ChatChannel; active: boolean }) {
  const t = useT();
  const { openChannel, nameOf, avatarOf } = useChannelWorkspace();
  const dot = useConversationDot(channel.id);
  const bold = (channel.unread > 0 && !channel.muted) || dot;
  return (
    <button
      type="button"
      onClick={() => openChannel(channel.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/link flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-sm transition-colors",
        active ? "bg-foreground text-background" : "text-foreground/80 hover:bg-muted",
        channel.muted && !active && "text-muted-foreground",
      )}
    >
      <span className="relative inline-flex shrink-0">
        {channel.type === "group" ? (
          <Hash className={cn("h-4 w-4 shrink-0", active ? "text-background/80" : "text-muted-foreground")} />
        ) : channel.peerHex ? (
          <Avatar name={nameOf(channel.peerHex)} src={avatarOf(channel.peerHex)} size="xs" shape="square" />
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <NotificationDot show={dot} label={t("notify.dot.label")} className={active ? "ring-foreground" : undefined} />
      </span>
      <span className={cn("min-w-0 flex-1 truncate", bold && "font-semibold text-foreground", bold && active && "text-background")}>
        {channel.name}
      </span>
      {channel.muted && <BellOff className={cn("h-3.5 w-3.5 shrink-0", active ? "text-background/70" : "text-muted-foreground")} />}
      {channel.mentions > 0 && (
        <span className={cn(
          "min-w-5 rounded-md px-1.5 text-center font-mono text-[11px] font-semibold tabular-nums leading-5",
          active ? "bg-background text-foreground" : "bg-destructive text-white",
        )}>
          {badgeCount(channel.mentions)}
        </span>
      )}
    </button>
  );
}

function Section({ label, channels, activeId, onAdd, addLabel }: {
  label: string;
  channels: ChatChannel[];
  activeId: string | null;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  // A collapsed section hides its rows' dots: the header carries them.
  const ids = new Set(channels.map((c) => c.id));
  const anyDot = useAnyDot((e) => e.feature.kind === "chat" && !!e.feature.conversationId && ids.has(e.feature.conversationId));
  return (
    <section className="mt-3">
      <div className="group/sec flex items-center gap-1 px-1">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-start text-xs font-semibold text-muted-foreground hover:bg-muted">
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90 rtl:rotate-90")} />
          <span className="truncate">{label}</span>
          <NotificationDot show={!open && anyDot} inline label={t("notify.dot.label")} />
        </button>
        {onAdd && (
          <Button variant="ghost" size="icon-xs" onClick={onAdd} aria-label={addLabel} title={addLabel} className="text-muted-foreground">
            <Plus />
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-0.5 space-y-px px-1">
          {channels.map((c) => <ChannelLink key={c.id} channel={c} active={c.id === activeId} />)}
        </div>
      )}
    </section>
  );
}

export function ChannelSidebar({ activeId, onNewChannel, onNewDm, onSearchAll }: SidebarProps) {
  const t = useT();
  const { model, canManage } = useChannelWorkspace();
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const visible = q ? model.channels.filter((c) => c.name.toLowerCase().includes(q)) : model.channels;
  const { starred, groups, direct } = sidebarSections(visible);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">{t("chat.messages")}</h1>
        <Button variant="ghost" size="icon-sm" onClick={onSearchAll} aria-label={t("chat.ws.search")} title={t("chat.ws.search")}>
          <Search />
        </Button>
        {onNewDm && (
          <Button variant="outline" size="icon-sm" onClick={onNewDm} aria-label={t("chat.ws.newDm")} title={t("chat.ws.newDm")}>
            <SquarePen />
          </Button>
        )}
      </div>
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("chat.ws.jumpTo")} className="h-8 ps-8 pe-7 text-sm" />
          {filter && (
            <button type="button" onClick={() => setFilter("")} aria-label={t("chat.ws.close")} className="absolute end-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {starred.length > 0 && <Section label={t("chat.ws.starred")} channels={starred} activeId={activeId} />}
        <Section
          label={t("chat.ws.channels")}
          channels={groups}
          activeId={activeId}
          onAdd={canManage ? onNewChannel : undefined}
          addLabel={t("chat.ws.newChannel")}
        />
        <Section label={t("chat.ws.directMessages")} channels={direct} activeId={activeId} onAdd={onNewDm} addLabel={t("chat.ws.newDm")} />
        {q && visible.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">{t("chat.noMatches")}</p>}
        {!q && model.channels.length === 0 && (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t("chat.noConversations")}</p>
            <p className="mt-1">
              {!canManage ? t("chat.ws.inviteOnlyNote") : onNewDm ? t("chat.startDMPrompt") : t("chat.ws.createChannelPrompt")}
            </p>
          </div>
        )}
        {!canManage && model.channels.length > 0 && !q && (
          <p className="mt-4 flex items-start gap-1.5 px-3 text-[11px] leading-snug text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {t("chat.ws.inviteOnlyNote")}
          </p>
        )}
      </nav>
    </div>
  );
}
