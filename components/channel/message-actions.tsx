"use client";

// What you can do to a message: the hover toolbar on desktop, the long-press
// sheet on the phone, and the emoji picker both of them open.

import { useState } from "react";
import { AtSign, Copy, MessageSquareText, MoreHorizontal, Pencil, Pin, PinOff, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useT } from "@/lib/i18n/context";
import type { ChatEntry } from "@/lib/chat/model";
import { setChatMessagePinned, toggleChatReaction } from "@/lib/spacetimedb/actions/chat";
import { useChannelWorkspace } from "@/components/channel/context";

export const QUICK_REACTIONS = ["👍", "✅", "👀", "🙏"];
const PICKER_EMOJIS = [
  "👍", "👎", "✅", "❌", "👀", "🙏", "👏", "🙌", "💪", "👌", "🤝", "🫡",
  "😀", "😂", "🥲", "😊", "😍", "🤔", "😮", "😢", "😡", "😴", "🤯", "🥳",
  "❤️", "🔥", "⭐", "🎉", "💯", "⚠️", "❗", "❓", "⏰", "📦", "🧾", "💰",
  "☕", "🍕", "🧹", "🛒", "🚚", "📌",
];

export function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {PICKER_EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-muted">
          {e}
        </button>
      ))}
    </div>
  );
}

/** Reaction picker behind a smiley button (the toolbar and the reaction bar both use it). */
export function ReactionPicker({ entry, trigger }: { entry: ChatEntry; trigger: React.ReactElement }) {
  const { run } = useChannelWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side="top" align="end" className="w-auto p-1.5">
        <EmojiGrid onPick={(emoji) => { setOpen(false); void run(() => toggleChatReaction(entry.conversationId, entry.id, emoji)); }} />
      </PopoverContent>
    </Popover>
  );
}

interface ActionHandlers {
  entry: ChatEntry;
  /** Undefined inside a thread: a reply has no thread of its own. */
  onThread?: () => void;
  onEdit: () => void;
}

function useMessageActions({ entry }: ActionHandlers) {
  const t = useT();
  const { run, mention, nameOf, confirmDelete } = useChannelWorkspace();
  return {
    react: (emoji: string) => void run(() => toggleChatReaction(entry.conversationId, entry.id, emoji)),
    togglePin: () => void run(() => setChatMessagePinned(entry.conversationId, entry.id, entry.pinnedAt == null)),
    copy: () => {
      navigator.clipboard.writeText(entry.content)
        .then(() => toast.success(t("chat.ws.copied")))
        .catch(() => toast.error(t("chat.ws.actionFailed")));
    },
    mention: () => mention(nameOf(entry.senderHex, entry.isMerchiva)),
    remove: () => confirmDelete(entry.conversationId, entry.id),
  };
}

/** Desktop: the toolbar that floats on the message's top edge while hovered. */
export function HoverToolbar(props: ActionHandlers) {
  const t = useT();
  const { entry, onThread, onEdit } = props;
  const a = useMessageActions(props);
  return (
    <div className="absolute -top-3.5 end-3 z-10 hidden items-center rounded-lg border border-border bg-background p-0.5 shadow-sm group-hover/msg:flex group-focus-within/msg:flex has-[[aria-expanded=true]]:flex">
      {QUICK_REACTIONS.map((emoji) => (
        <button key={emoji} type="button" onClick={() => a.react(emoji)} className="flex h-7 w-7 items-center justify-center rounded-md text-base hover:bg-muted" aria-label={`${t("chat.ws.addReaction")} ${emoji}`}>
          {emoji}
        </button>
      ))}
      <ReactionPicker entry={entry} trigger={
        <Button variant="ghost" size="icon-sm" aria-label={t("chat.ws.addReaction")} title={t("chat.ws.addReaction")}><SmilePlus /></Button>
      } />
      {onThread && (
        <Button variant="ghost" size="icon-sm" onClick={onThread} aria-label={t("chat.ws.replyInThread")} title={t("chat.ws.replyInThread")}>
          <MessageSquareText />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("chat.ws.more")} title={t("chat.ws.more")} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={a.togglePin}>
            {entry.pinnedAt != null ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {entry.pinnedAt != null ? t("chat.ws.unpin") : t("chat.ws.pin")}
          </DropdownMenuItem>
          {entry.content && <DropdownMenuItem onClick={a.copy}><Copy className="h-4 w-4" />{t("chat.ws.copyText")}</DropdownMenuItem>}
          {!entry.isMine && <DropdownMenuItem onClick={a.mention}><AtSign className="h-4 w-4" />{t("chat.mention")}</DropdownMenuItem>}
          {entry.isMine && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" />{t("chat.ws.editMessage")}</DropdownMenuItem>
              <DropdownMenuItem onClick={a.remove} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" />{t("chat.ws.deleteMessage")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Phone: the sheet a long press opens. */
export function ActionSheet(props: ActionHandlers & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const { entry, onThread, onEdit, open, onOpenChange } = props;
  const a = useMessageActions(props);
  const close = (fn: () => void) => () => { onOpenChange(false); fn(); };
  const row = "flex w-full items-center gap-3 px-4 py-3 text-start text-sm hover:bg-muted";
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="sr-only"><DrawerTitle>{t("chat.ws.more")}</DrawerTitle></DrawerHeader>
        <div className="flex justify-between px-4 pb-2 pt-1">
          {[...QUICK_REACTIONS, "❤️", "😂"].map((emoji) => (
            <button key={emoji} type="button" onClick={close(() => a.react(emoji))} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-xl">
              {emoji}
            </button>
          ))}
        </div>
        <div className="divide-y divide-border border-t border-border pb-[env(safe-area-inset-bottom,0px)]">
          {onThread && <button type="button" className={row} onClick={close(onThread)}><MessageSquareText className="h-4 w-4 text-muted-foreground" />{t("chat.ws.replyInThread")}</button>}
          <button type="button" className={row} onClick={close(a.togglePin)}>
            <Pin className="h-4 w-4 text-muted-foreground" />{entry.pinnedAt != null ? t("chat.ws.unpin") : t("chat.ws.pin")}
          </button>
          {entry.content && <button type="button" className={row} onClick={close(a.copy)}><Copy className="h-4 w-4 text-muted-foreground" />{t("chat.ws.copyText")}</button>}
          {!entry.isMine && <button type="button" className={row} onClick={close(a.mention)}><AtSign className="h-4 w-4 text-muted-foreground" />{t("chat.mention")}</button>}
          {entry.isMine && <button type="button" className={row} onClick={close(onEdit)}><Pencil className="h-4 w-4 text-muted-foreground" />{t("chat.ws.editMessage")}</button>}
          {entry.isMine && (
            <button type="button" className={`${row} text-destructive`} onClick={close(a.remove)}>
              <Trash2 className="h-4 w-4" />{t("chat.ws.deleteMessage")}
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
