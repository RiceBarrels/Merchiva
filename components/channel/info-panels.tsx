"use client";

import { useMemo } from "react";
import { Hash, Pencil, Pin, PinOff, Search, UserMinus, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { searchChat, type ChatChannel, type ChatEntry } from "@/lib/chat/model";
import { removeConversationMember } from "@/lib/spacetimedb/actions/chat";
import { useChannelWorkspace } from "@/components/channel/context";
import { PanelShell } from "@/components/channel/thread-panel";
import { SenderAvatar } from "@/components/channel/message-row";
import { FollowButton } from "@/components/channel/follow";

const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

export function MembersPanel({ channel, onAddPeople, onEditTopic }: { channel: ChatChannel; onAddPeople: () => void; onEditTopic: () => void }) {
  const t = useT();
  const { people, meHex, accountHex, canManage, isMobile, run, nameOf, avatarOf, openPanel } = useChannelWorkspace();
  const members = useMemo(
    () => [...channel.memberHexes].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [channel.memberHexes, nameOf],
  );
  return (
    <PanelShell title={t("chat.ws.members")} subtitle={`# ${channel.name}`} onClose={() => openPanel(null)}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">{t("chat.ws.topic")}</p>
            {canManage && (
              <Button variant="ghost" size="xs" onClick={onEditTopic}><Pencil />{t("chat.ws.editTopic")}</Button>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground">{channel.topic || <span className="text-muted-foreground">{t("chat.ws.noTopic")}</span>}</p>
        </div>
        <div className="px-2 py-2">
          {canManage && (
            <button type="button" onClick={onAddPeople} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start text-sm hover:bg-muted">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border"><UserPlus className="h-4 w-4 text-muted-foreground" /></span>
              <span className="font-medium">{t("chat.ws.addPeople")}</span>
            </button>
          )}
          {members.map((hex) => {
            const person = people.get(hex);
            return (
              <div key={hex} className="group/m flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                <Avatar name={nameOf(hex)} src={avatarOf(hex)} size="lg" shape="square" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {nameOf(hex)}{hex === meHex && <span className="ms-1 text-muted-foreground">{t("chat.ws.you")}</span>}
                  </p>
                  {person && <p className="truncate text-xs text-muted-foreground">{t(`personnel.team.role.${person.role}`)}</p>}
                </div>
                {/* Always shown while followed; otherwise on hover, like the remove button (always on a phone). */}
                <FollowButton
                  hex={hex}
                  name={nameOf(hex)}
                  idleClassName={isMobile ? undefined : "opacity-0 group-hover/m:opacity-100 focus-visible:opacity-100"}
                />
                {/* Not yourself, and not the account every write runs as (a store machine's): the module refuses both. */}
                {canManage && hex !== meHex && hex !== accountHex && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground opacity-0 group-hover/m:opacity-100 focus-visible:opacity-100"
                    onClick={() => void run(() => removeConversationMember(channel.id, hex))}
                    aria-label={t("chat.ws.removeFromChannel")}
                    title={t("chat.ws.removeFromChannel")}
                  >
                    <UserMinus />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {!canManage && <p className="px-4 pb-4 text-[11px] text-muted-foreground">{t("chat.ws.inviteOnlyNote")}</p>}
      </div>
    </PanelShell>
  );
}

function EntryCard({ entry, channel, children, onOpen }: { entry: ChatEntry; channel?: ChatChannel; children?: React.ReactNode; onOpen: () => void }) {
  const fmt = useDateFormat();
  const { nameOf } = useChannelWorkspace();
  return (
    <div className="group/card relative rounded-lg border border-border bg-background hover:bg-muted/40">
      <button type="button" onClick={onOpen} className="flex w-full gap-2.5 p-3 text-start">
        <SenderAvatar entry={entry} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{nameOf(entry.senderHex, entry.isMerchiva)}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{fmt(entry.createdAt, WHEN)}</span>
          </div>
          {channel && (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {channel.type === "group" && <Hash className="h-3 w-3" />}{channel.name}
            </p>
          )}
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground">
            {entry.content || entry.attachment?.name}
          </p>
        </div>
      </button>
      {children}
    </div>
  );
}

export function PinsPanel({ channel }: { channel: ChatChannel }) {
  const t = useT();
  const { model, run, writes, openPanel, openChannel } = useChannelWorkspace();
  const pins = model.pinsOf(channel.id);
  const open = (e: ChatEntry) => (e.threadParentId
    ? openPanel({ kind: "thread", parentId: e.threadParentId })
    : openChannel(channel.id, e.id));
  return (
    <PanelShell title={t("chat.ws.pinnedMessages")} subtitle={channel.type === "group" ? `# ${channel.name}` : channel.name} onClose={() => openPanel(null)}>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {pins.length === 0 ? (
          <EmptyState icon={Pin} title={t("chat.ws.noPins")} description={t("chat.ws.noPinsHint")} />
        ) : pins.map((e) => (
          <EntryCard key={e.id} entry={e} onOpen={() => open(e)}>
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute end-2 top-2 text-muted-foreground opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100"
              onClick={() => void run(() => writes.pin(channel.id, e.id, false))}
              aria-label={t("chat.ws.unpin")}
              title={t("chat.ws.unpin")}
            >
              <PinOff />
            </Button>
          </EntryCard>
        ))}
      </div>
    </PanelShell>
  );
}

export function SearchPanel({ channel, query, scope, onChange }: {
  channel: ChatChannel | null;
  query: string;
  scope: "channel" | "all";
  onChange: (query: string, scope: "channel" | "all") => void;
}) {
  const t = useT();
  const { model, openPanel, openChannel } = useChannelWorkspace();
  const effectiveScope = channel ? scope : "all";
  const hits = useMemo(
    () => searchChat(model, query, effectiveScope === "channel" && channel ? channel.id : undefined),
    [model, query, effectiveScope, channel],
  );
  const open = (e: ChatEntry) => {
    if (e.threadParentId) {
      openChannel(e.conversationId);
      openPanel({ kind: "thread", parentId: e.threadParentId });
    } else {
      openChannel(e.conversationId, e.id);
    }
  };
  return (
    <PanelShell title={t("chat.ws.search")} onClose={() => openPanel(null)}>
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(e) => onChange(e.target.value, scope)} placeholder={t("chat.ws.searchPlaceholder")} className="h-8 ps-8 text-sm" />
        </div>
        {channel && (
          <SegmentedControl
            size="sm"
            fullWidth
            value={effectiveScope}
            onChange={(v) => onChange(query, v)}
            options={[
              { value: "channel", label: channel.type === "group" ? `# ${channel.name}` : channel.name },
              { value: "all", label: t("chat.ws.searchAll") },
            ]}
          />
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {!query.trim() ? (
          <p className="px-1 text-sm text-muted-foreground">{t("chat.ws.searchHint")}</p>
        ) : hits.length === 0 ? (
          <EmptyState compact icon={Search} description={t("chat.ws.noResults")} />
        ) : hits.map((h) => (
          <EntryCard key={h.entry.id} entry={h.entry} channel={effectiveScope === "all" ? h.channel : undefined} onOpen={() => open(h.entry)} />
        ))}
      </div>
    </PanelShell>
  );
}
