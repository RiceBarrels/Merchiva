"use client";

// The /personal channel: the channel workspace (components/channel — every conversation, threads,
// reactions, edits, pins, attachments, @mentions, search, new channels and DMs) laid out for one
// person's phone around the walkie. The conversation list is a drawer from the inline start
// (./channel-drawer.tsx); the bottom bar swipes between the push-to-talk bar and the channel's
// composer (./chat-composer.tsx).

import { useState, type ReactNode } from "react";
import { Menu, MessageSquare } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { DOT_FILTERS } from "@/lib/notifications/dots";
import { useAnyDot } from "@/lib/notifications/dots-context";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/loaders/geometric";
import { NotificationDot } from "@/components/ui/notification-dot";
import { ChannelWorkspaceProvider } from "@/components/channel/context";
import { ChannelSidebar } from "@/components/channel/sidebar";
import { ChannelConversation, ChannelOverlays, type ChannelController } from "@/components/channel/workspace";
import { hapticLight } from "@/lib/haptics";
import { ChannelDrawer } from "./channel-drawer";
import { ChatComposer, type ComposerMode } from "./chat-composer";

/** The header's list button: its dot says another conversation has something new. */
function ListButton({ activeId, onOpen }: { activeId: string | null; onOpen: () => void }) {
  const { t } = useI18n();
  const dot = useAnyDot((e) => DOT_FILTERS.chat(e) && e.feature.conversationId !== activeId);
  return (
    <button
      type="button"
      onClick={() => { hapticLight(); onOpen(); }}
      aria-label={t("personalDevice.chat.openList")}
      className="relative -ms-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-foreground active:bg-muted"
    >
      <Menu className="h-5 w-5" />
      <NotificationDot show={dot} label={t("notify.dot.label")} className="top-1 end-1" />
    </button>
  );
}

export function PersonalChannel({ ctl, listOpen, onListOpenChange, wrapList, talkBar, recording, onComposerFocus, className }: {
  ctl: ChannelController;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  /** Places the message list (the phone pages it beside the apps grid). */
  wrapList: (list: ReactNode) => ReactNode;
  /** The push-to-talk bar (a TalkBar). */
  talkBar: ReactNode;
  recording: boolean;
  /** The text box took focus (the phone pages back to the messages, where the reply lands). */
  onComposerFocus?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ComposerMode>("voice");
  const { active, value, canStartDm, openDialog, setPanel } = ctl;
  const listButton = <ListButton activeId={active?.id ?? null} onOpen={() => onListOpenChange(true)} />;

  return (
    <ChannelWorkspaceProvider value={value}>
      <div className={className ?? "relative flex min-h-0 flex-1 flex-col"}>
        {active ? (
          <ChannelConversation
            ctl={ctl}
            headerLeading={listButton}
            emojiPicker
            composerClassName="px-3 pb-2 pt-1"
            renderList={(messages) => wrapList(<div className="flex h-full min-h-0 flex-col">{messages}</div>)}
            renderComposer={(composer) => (
              <ChatComposer mode={mode} onModeChange={setMode} talkBar={talkBar} text={composer} recording={recording} onTextFocus={onComposerFocus} />
            )}
          />
        ) : (
          // No conversation yet (or still loading): the list button for the drawer — where a DM can
          // be started — and the walkie bar, whose Leave stays reachable.
          <>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
              {listButton}
              <h2 className="min-w-0 truncate text-[15px] font-bold text-foreground">{t("device.noChannel")}</h2>
            </header>
            {wrapList(
              !ctl.ready ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner size={20} className="text-muted-foreground" />
                </div>
              ) : (
                <EmptyState icon={MessageSquare} title={t("personalDevice.noChannelsTitle")} description={t("personalDevice.noChannelsDesc")} className="h-full" />
              ),
            )}
            <ChatComposer mode="voice" onModeChange={setMode} talkBar={talkBar} text={null} recording={recording} />
          </>
        )}
        <ChannelDrawer open={listOpen} onClose={() => onListOpenChange(false)}>
          <ChannelSidebar
            activeId={active?.id ?? null}
            onNewChannel={() => { onListOpenChange(false); openDialog("channel"); }}
            onNewDm={canStartDm ? () => { onListOpenChange(false); openDialog("dm"); } : undefined}
            onSearchAll={() => { onListOpenChange(false); setPanel({ kind: "search", query: "", scope: "all" }); }}
          />
        </ChannelDrawer>
      </div>
      <ChannelOverlays ctl={ctl} />
    </ChannelWorkspaceProvider>
  );
}
