"use client";

import { ArrowLeft, Bell, BellOff, Hash, LogOut, MoreVertical, Pencil, Pin, Search, Star, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatChannel } from "@/lib/chat/model";
import { setChatMuted, setChatStarred } from "@/lib/spacetimedb/actions/chat";
import { useChannelWorkspace, type SidePanel } from "@/components/channel/context";

interface HeaderProps {
  channel: ChatChannel;
  panel: SidePanel | null;
  onBack?: () => void;
  onEditTopic: () => void;
  onAddPeople: () => void;
  /** Undefined where leaving would act for someone else (a store machine's PIN operator). */
  onLeave?: () => void;
}

export function ChannelHeader({ channel, panel, onBack, onEditTopic, onAddPeople, onLeave }: HeaderProps) {
  const t = useT();
  const { model, run, openPanel, canManage, nameOf, avatarOf, isMobile } = useChannelWorkspace();
  const pinCount = model.pinsOf(channel.id).length;
  const isGroup = channel.type === "group";
  const toggle = (kind: "members" | "pins") => openPanel(panel?.kind === kind ? null : { kind });

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-4">
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("chat.ws.close")} className="-ms-1">
          <ArrowLeft className="rtl:rotate-180" />
        </Button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isGroup
          ? <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
          : channel.peerHex && <Avatar name={nameOf(channel.peerHex)} src={avatarOf(channel.peerHex)} size="sm" shape="square" />}
        <h2 className="min-w-0 truncate text-[15px] font-bold text-foreground">{channel.name}</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void run(() => setChatStarred(channel.id, !channel.starred))}
          aria-pressed={channel.starred}
          aria-label={channel.starred ? t("chat.ws.unstar") : t("chat.ws.star")}
          title={channel.starred ? t("chat.ws.unstar") : t("chat.ws.star")}
          className="text-muted-foreground"
        >
          <Star className={cn(channel.starred && "fill-current text-foreground")} />
        </Button>
        {isGroup && !isMobile && (
          <button
            type="button"
            onClick={canManage ? onEditTopic : undefined}
            disabled={!canManage}
            className={cn(
              "ms-1 hidden min-w-0 truncate border-s border-border ps-3 text-start text-xs text-muted-foreground md:block",
              canManage && "hover:text-foreground",
            )}
            title={channel.topic || undefined}
          >
            {channel.topic || (canManage ? t("chat.ws.addTopic") : "")}
          </button>
        )}
      </div>

      {isGroup && (
        <button
          type="button"
          onClick={() => toggle("members")}
          aria-pressed={panel?.kind === "members"}
          className={cn("flex h-8 items-center gap-1.5 rounded-md border border-border px-1.5 text-xs hover:bg-muted", panel?.kind === "members" && "bg-muted")}
          title={t("chat.ws.members")}
        >
          <span className="flex -space-x-1.5">
            {channel.memberHexes.slice(0, 3).map((h) => <Avatar key={h} name={nameOf(h)} src={avatarOf(h)} size="xs" shape="square" />)}
          </span>
          <span className="font-mono tabular-nums text-muted-foreground">{channel.memberHexes.length}</span>
        </button>
      )}
      <Button
        variant={panel?.kind === "pins" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => toggle("pins")}
        aria-label={t("chat.ws.pinnedMessages")}
        title={t("chat.ws.pinnedMessages")}
        className="gap-1 px-2 text-muted-foreground"
      >
        <Pin />
        {pinCount > 0 && <span className="font-mono tabular-nums">{pinCount}</span>}
      </Button>
      <Button
        variant={panel?.kind === "search" ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => openPanel(panel?.kind === "search" ? null : { kind: "search", query: "", scope: "channel" })}
        aria-label={fmt(t("chat.ws.searchIn"), { name: channel.name })}
        title={fmt(t("chat.ws.searchIn"), { name: channel.name })}
        className="text-muted-foreground"
      >
        <Search />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("chat.ws.channelDetails")} title={t("chat.ws.channelDetails")} className="text-muted-foreground" />}>
          <MoreVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={() => void run(() => setChatMuted(channel.id, !channel.muted))}>
            {channel.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {channel.muted ? t("chat.ws.unmute") : t("chat.ws.mute")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void run(() => setChatStarred(channel.id, !channel.starred))}>
            <Star className="h-4 w-4" />
            {channel.starred ? t("chat.ws.unstar") : t("chat.ws.star")}
          </DropdownMenuItem>
          {isGroup && canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEditTopic}><Pencil className="h-4 w-4" />{t("chat.ws.editTopic")}</DropdownMenuItem>
              <DropdownMenuItem onClick={onAddPeople}><UserPlus className="h-4 w-4" />{t("chat.ws.addPeople")}</DropdownMenuItem>
            </>
          )}
          {isGroup && onLeave && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLeave} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />{t("chat.ws.leaveChannel")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
