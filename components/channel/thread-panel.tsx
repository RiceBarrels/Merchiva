"use client";

import { forwardRef } from "react";
import { MessageSquareText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { ChatChannel } from "@/lib/chat/model";
import { useChannelWorkspace } from "@/components/channel/context";
import { MessageRow } from "@/components/channel/message-row";
import { isCompactFollowUp } from "@/components/channel/message-list";
import { Composer, type ComposerHandle } from "@/components/channel/composer";

/** The right-hand column on desktop, a full-height layer over the chat on the phone. */
export function PanelShell({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const { isMobile } = useChannelWorkspace();
  return (
    <aside className={cn(
      "flex min-h-0 flex-col bg-background",
      isMobile ? "absolute inset-0 z-20" : "w-[min(400px,40%)] shrink-0 border-s border-border",
    )}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-foreground">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("chat.ws.close")} title={t("chat.ws.close")}>
          <X />
        </Button>
      </div>
      {children}
    </aside>
  );
}

export const ThreadPanel = forwardRef<ComposerHandle, {
  channel: ChatChannel;
  parentId: string;
  onComposerFocus: () => void;
}>(function ThreadPanel({ channel, parentId, onComposerFocus }, ref) {
  const t = useT();
  const { model, openPanel, run, writes } = useChannelWorkspace();
  const parent = model.entryById.get(parentId);
  const replies = model.repliesOf(parentId);
  const close = () => openPanel(null);
  const subtitle = channel.type === "group" ? `# ${channel.name}` : channel.name;

  if (!parent) {
    return (
      <PanelShell title={t("chat.ws.thread")} subtitle={subtitle} onClose={close}>
        <EmptyState className="flex-1" icon={MessageSquareText} description={t("chat.ws.threadGone")} />
      </PanelShell>
    );
  }

  return (
    <PanelShell title={t("chat.ws.thread")} subtitle={subtitle} onClose={close}>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <MessageRow entry={parent} compact={false} inThread />
        <div className="my-2 flex items-center gap-2 px-4">
          <span className="text-xs text-muted-foreground">
            {replies.length === 1 ? t("chat.ws.reply1") : fmt(t("chat.ws.replies"), { count: String(replies.length) })}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {replies.map((r, i) => <MessageRow key={r.id} entry={r} compact={isCompactFollowUp(replies[i - 1], r)} inThread />)}
      </div>
      <Composer
        ref={ref}
        key={parentId}
        autoFocus
        placeholder={t("chat.ws.replyPlaceholder")}
        memberHexes={channel.memberHexes}
        everyone={false}
        onFocus={onComposerFocus}
        onSubmit={(text, attachment) => run(() => writes.threadReply(channel.id, parentId, text, attachment))}
      />
    </PanelShell>
  );
});
