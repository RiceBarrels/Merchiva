"use client";

import { useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { useNow, fmtDurationHM, shortName, useChannels, ChannelHeader, MessageList, TalkBar, PagesTrack, type OnShiftEntry } from "@/components/device";
import type { StoreMember } from "./use-org-members";
import { LogoutDrawer } from "./logout-drawer";
import { AppsPane } from "./apps-pane";

export interface LoggedInScreenProps {
  organizationId: string;
  operator: StoreMember;
  /** PIN the operator logged in with (null after a QR log-in) — punching from
   *  the log-out drawer needs it. Memory only, never persisted. */
  operatorPin: string | null;
  /** Operator's open shift (null when not punched in). */
  shift: OnShiftEntry | null;
  loginAt: number;
  members: StoreMember[];
  forMember: (memberId: string) => OnShiftEntry | null;
  onLogout: () => void;
  /** Recording in progress — parent pauses its idle timer. */
  onRecordingChange?: (recording: boolean) => void;
  /** Phone layout: swipeable Channel | Apps pages over a pinned talk bar.
   *  Tablet: 400px walkie-talkie column beside the apps grid. */
  phone: boolean;
  className?: string;
}

/** Logged-in store device: the operator's walkie-talkie + the apps home. */
export function LoggedInScreen({ organizationId, operator, operatorPin, shift, loginAt, members, forMember, onLogout, onRecordingChange, phone, className }: LoggedInScreenProps) {
  const t = useT();
  const { locale } = useI18n();
  const now = useNow(15_000);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(0);
  const channels = useChannels({ organizationId, meUserId: operator.userIdHex, locale });
  const elapsed = useMemo(() => fmtDurationHM(now.getTime() - loginAt), [now, loginAt]);

  const header = (
    <ChannelHeader
      channels={channels.channels}
      activeIndex={channels.activeIndex}
      onSelect={(i) => { channels.setActiveIndex(i); setPage(0); }}
      right={
        <span className="inline-flex items-center h-5 px-2 rounded bg-secondary text-xs font-medium whitespace-nowrap">
          {shortName(operator.displayName)} · <span className="font-mono tabular-nums ml-1">{elapsed}</span>
        </span>
      }
      className="shrink-0"
    />
  );

  const talkBar = (
    <TalkBar
      leftAction={{ icon: LogOut, label: t("storeDevice.logOut"), onClick: () => setDrawerOpen(true) }}
      channelLabel={t("storeDevice.channel")}
      onPrevChannel={() => { channels.prev(); setPage(0); }}
      onNextChannel={() => { channels.next(); setPage(0); }}
      onSend={async (r) => {
        const status = await channels.sendVoice(r);
        setPage(0);
        return status;
      }}
      onRecordingChange={onRecordingChange}
      disabled={!channels.activeChannel}
      className="shrink-0"
    />
  );

  const drawer = (
    <LogoutDrawer open={drawerOpen} onOpenChange={setDrawerOpen} operator={operator} operatorPin={operatorPin} shift={shift} onLogout={onLogout} />
  );

  if (phone) {
    return (
      <div className={cn("relative flex flex-col min-h-0 bg-background", className)}>
        {header}
        <PagesTrack
          page={page}
          onPageChange={(p) => { hapticLight(); setPage(p); }}
          className="min-h-0 flex-1"
          pages={[
            <MessageList key="messages" messages={channels.messages} className="h-full overflow-y-auto" />,
            <AppsPane key="apps" members={members} operator={operator} operatorPin={operatorPin} forMember={forMember} phone className="h-full" />,
          ]}
        />
        {talkBar}
        {drawer}
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-[400px_1fr] min-h-0", className)}>
      <div className="relative flex flex-col min-h-0 overflow-hidden bg-background border-r border-border">
        {header}
        <MessageList messages={channels.messages} className="min-h-0 flex-1 overflow-y-auto" />
        {talkBar}
      </div>
      <AppsPane members={members} operator={operator} operatorPin={operatorPin} forMember={forMember} className="min-h-0" />
      {drawer}
    </div>
  );
}
