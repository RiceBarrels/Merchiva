"use client";

import { useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useNow, fmtDurationHM, shortName, useChannels, ChannelHeader, MessageList, TalkBar, type OnShiftEntry } from "@/components/device";
import type { StoreMember } from "./use-org-members";
import { LogoutDrawer } from "./logout-drawer";

export interface WorkPaneProps {
  organizationId: string;
  operator: StoreMember;
  /** Operator's open shift (null when not punched in). */
  shift: OnShiftEntry | null;
  loginAt: number;
  members: StoreMember[];
  onLogout: () => void;
  onDrawerOpenChange?: (open: boolean) => void;
  /** Recording in progress — parent pauses its idle timer. */
  onRecordingChange?: (recording: boolean) => void;
  className?: string;
}

/** Logged-in left pane: the walkie-talkie channel for the current operator. */
export function WorkPane({ organizationId, operator, shift, loginAt, members, onLogout, onDrawerOpenChange, onRecordingChange, className }: WorkPaneProps) {
  const t = useT();
  const { locale } = useI18n();
  const now = useNow(15_000);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const channels = useChannels({ organizationId, meUserId: operator.userIdHex, locale });
  const elapsed = useMemo(() => fmtDurationHM(now.getTime() - loginAt), [now, loginAt]);

  const setDrawer = (open: boolean) => {
    setDrawerOpen(open);
    onDrawerOpenChange?.(open);
  };

  return (
    <div className={cn("relative grid grid-rows-[54px_1fr_120px] min-h-0 bg-background border-border md:border-r", className)}>
      <ChannelHeader
        channels={channels.channels}
        activeIndex={channels.activeIndex}
        onSelect={channels.setActiveIndex}
        right={
          <span className="inline-flex items-center h-5 px-2 rounded bg-secondary text-xs font-medium whitespace-nowrap">
            {shortName(operator.displayName)} · <span className="font-mono tabular-nums ml-1">{elapsed}</span>
          </span>
        }
      />
      <MessageList messages={channels.messages} className="min-h-0 overflow-y-auto" />
      <TalkBar
        leftAction={{ icon: LogOut, label: t("storeDevice.logOut"), onClick: () => setDrawer(true) }}
        channelLabel={t("storeDevice.channel")}
        onPrevChannel={channels.prev}
        onNextChannel={channels.next}
        onSend={channels.sendVoice}
        onRecordingChange={onRecordingChange}
        disabled={!channels.activeChannel}
      />
      <LogoutDrawer open={drawerOpen} onOpenChange={setDrawer} members={members} operator={operator} shift={shift} onLogout={onLogout} />
    </div>
  );
}
