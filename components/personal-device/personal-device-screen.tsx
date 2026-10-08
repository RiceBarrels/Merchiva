"use client";

import { useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { FileText, LogOut, MessageSquare } from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { useAuth } from "@/lib/auth/context";
import { useI18n, useT } from "@/lib/i18n/context";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/loaders/geometric";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APP_CATALOG,
  AppsGrid,
  ChannelHeader,
  ClockCard,
  DEFAULT_DEVICE_APPS,
  EmbeddedPage,
  IdleLock,
  MessageList,
  MiniAppShell,
  MiniAppSurface,
  PagesTrack,
  TalkBar,
  fmtDurationHMS,
  shortName,
  useCatalogApps,
  useChannels,
  useDeviceBuiltins,
  useIdleTimer,
  useNow,
  useOnShift,
  type DeviceApp,
} from "@/components/device";
import { useMe } from "./use-me";
import { LeaveDrawer } from "./leave-drawer";
import { PunchPanel } from "./punch-panel";
import { DirectoryPanel } from "./directory-panel";
import { SettingsPanel } from "./settings-panel";
import { PersonalPunchPrompt } from "./punch-prompt";
import { usePunchAsk } from "./use-punch-ask";
import { dateKey } from "@/lib/date-key";

interface ShiftRow {
  organizationId: string;
  memberId?: string;
  date: string;
  startTime: string;
  endTime: string;
}

const IDLE_MS = 30_000;
const DIM_MS = 22_000;

export function PersonalDeviceScreen() {
  const t = useT();
  const { locale } = useI18n();
  const { user } = useAuth();
  const me = useMe();
  const now = useNow();
  const safeArea = getSafeAreaInsets();
  // Phone: swipeable Channel | Apps pages. Tablet (≥768px): 400px channel
  // column beside a 6-column apps grid — the same shape as /store.
  const phone = useIsMobile();

  const chat = useChannels({ organizationId: me.organizationId, meUserId: me.meUserId, locale });
  const shifts = useOnShift(me.organizationId);
  const myShift = me.myMemberId ? shifts.forMember(me.myMemberId) : null;

  const [shiftRows] = useTable(tables.shift);
  const todayShift = useMemo(() => {
    if (!me.myMemberId) return null;
    const today = dateKey(new Date());
    return (
      (shiftRows as unknown as ShiftRow[]).find(
        (s) => s.organizationId === me.organizationId && s.memberId === me.myMemberId && s.date === today,
      ) ?? null
    );
  }, [shiftRows, me.myMemberId, me.organizationId]);

  const [page, setPage] = useState(0);
  const [openApp, setOpenApp] = useState<DeviceApp["id"] | null>(null);
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  // The tapped tile's icon: the app grows out of it (MiniAppShell).
  const [openOrigin, setOpenOrigin] = useState<HTMLElement | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  // The phone always boots onto the lock screen; the first swipe-to-unlock is
  // what triggers the punch-in check below.
  const [locked, setLocked] = useState(true);
  // "Punch in now?" after every unlock while off shift (no snooze).
  const punchAsk = usePunchAsk({ ready: me.ready && !!me.myMember && shifts.ready, myCode: me.myCode, onShift: !!myShift });

  const lock = () => { setLeaveOpen(false); setOpenApp(null); punchAsk.dismiss(); setLocked(true); };
  const { dimming, reset: resetIdle } = useIdleTimer({
    idleMs: IDLE_MS,
    dimMs: DIM_MS,
    enabled: !locked,
    // Only a live recording freezes the countdown; open drawers / app
    // panels keep counting so the phone still locks when put down.
    paused: recording,
    onIdle: lock,
  });
  const unlock = () => { setLocked(false); resetIdle(); punchAsk.request(); };

  // Switching channel returns to the messages page, like the prototype.
  const selectChannel = (i: number) => { chat.setActiveIndex(i); setPage(0); };
  const nextChannel = () => { chat.next(); setPage(0); };
  const prevChannel = () => { chat.prev(); setPage(0); };

  // Home grid: the surface's built-in apps first, then every Merchiva
  // feature the member may open (permission-filtered by the catalog and
  // limited to the apps installed from /manager/apps).
  const builtIns = useDeviceBuiltins("personal");
  const catalogApps = useCatalogApps("personal");
  const apps: DeviceApp[] = useMemo(() => {
    const seen = new Set(builtIns.map((a) => a.id));
    return [...builtIns, ...catalogApps.filter((a) => !seen.has(a.id))];
  }, [builtIns, catalogApps]);
  // Built-in ids always win over a same-named catalog entry.
  const isBuiltIn = !!openApp && DEFAULT_DEVICE_APPS.some((a) => a.id === openApp);
  const openCatalogEntry = openApp && !isBuiltIn ? APP_CATALOG.find((a) => a.id === openApp) ?? null : null;
  const CatalogComponent = openCatalogEntry?.component ?? null;
  const openEntry = openApp ? apps.find((a) => a.id === openApp) ?? null : null;
  const appTitle = openApp ? (openEntry?.label ?? t(`personalDevice.apps.${openApp}`)) : "";
  const openFromGrid = (id: DeviceApp["id"], origin?: HTMLElement) => { setOpenApp(id); setOpenOrigin(origin ?? null); };

  if (!me.ready || !me.myMember) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  const channelShort = chat.activeChannel?.name.split("·")[0].trim() ?? "";
  const shiftElapsed = myShift ? fmtDurationHMS(now.getTime() - myShift.since.getTime()) : "--:--:--";

  const channelHeader = (
    <ChannelHeader
      channels={chat.channels}
      activeIndex={chat.activeIndex}
      onSelect={selectChannel}
      right={
        <span className="inline-flex h-5 items-center whitespace-nowrap rounded bg-secondary px-2 text-[12px] font-medium">
          {shortName(me.myName)}
        </span>
      }
      className="shrink-0"
    />
  );

  const messagesPage =
    chat.ready && chat.channels.length === 0 ? (
      <EmptyState
        key="empty"
        icon={MessageSquare}
        title={t("personalDevice.noChannelsTitle")}
        description={t("personalDevice.noChannelsDesc")}
        className="h-full"
      />
    ) : !chat.ready ? (
      <div key="loading" className="flex h-full items-center justify-center">
        <Spinner size={20} className="text-muted-foreground" />
      </div>
    ) : (
      <MessageList key="messages" messages={chat.messages} className="h-full" />
    );

  const appPanel = (
    <MiniAppShell
      open={openApp !== null}
      title={appTitle}
      app={openEntry}
      origin={openOrigin}
      // lock() closes the app under the lock screen: no close animation.
      instantClose={locked}
      onClose={() => setOpenApp(null)}
    >
      {openApp === "punch-in" && (
        <PunchPanel
          organizationId={me.organizationId}
          myMemberId={me.myMemberId}
          myCode={me.myCode}
          shift={myShift}
        />
      )}
      {openApp === "directory" && (
        <DirectoryPanel members={me.orgMembers} onShift={shifts.entries} myMemberId={me.myMemberId} />
      )}
      {openApp === "settings" && (
        <SettingsPanel name={me.myName} email={user?.email} orgName={me.orgName} />
      )}
      {openApp && CatalogComponent && (
        <EmbeddedPage
          appId={openApp}
          route={openRoute}
          member={{ id: me.myMemberId ?? "", displayName: me.myName, role: me.role ?? "staff", userIdHex: me.meUserId, punchInCode: me.myCode }}
          onNavigate={(next, route) => { setOpenApp(next); setOpenRoute(route); }}
          className="h-full"
        />
      )}
      {openApp === "requests" && !CatalogComponent && (
        <EmptyState
          icon={FileText}
          title={t("personalDevice.comingSoonTitle")}
          description={t("personalDevice.comingSoonDesc")}
          className="h-full"
        />
      )}
    </MiniAppShell>
  );

  const talkBar = (
    <TalkBar
      leftAction={{ icon: LogOut, label: t("personalDevice.leaveBtn"), onClick: () => { hapticLight(); setLeaveOpen(true); } }}
      channelLabel={t("personalDevice.channelBtn")}
      onPrevChannel={prevChannel}
      onNextChannel={nextChannel}
      onSend={async (r) => {
        const status = await chat.sendVoice(r);
        setPage(0);
        return status;
      }}
      onRecordingChange={setRecording}
      disabled={!chat.activeChannel}
      className="shrink-0"
    />
  );

  return (
    <MiniAppSurface>
      <div className="h-full w-full bg-muted/40 text-foreground">
        <div
          className={cn(
            "relative mx-auto flex h-full w-full select-none flex-col overflow-hidden bg-background",
            phone && "max-w-[480px] sm:border-x sm:border-border",
          )}
          style={{ paddingTop: safeArea.top }}
        >
          {/* ── Main (blurs while dimming / locked) ─────────────────────── */}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col transition-[filter,opacity,transform] duration-700",
              dimming && "blur-[12px] opacity-60",
              locked && "scale-[.9] blur-[8px] opacity-60",
            )}
          >
            {phone ? (
              <>
                {channelHeader}
                <div className="relative min-h-0 flex-1">
                  <PagesTrack
                    page={page}
                    onPageChange={(p) => { hapticLight(); setPage(p); }}
                    className="h-full"
                    pages={[
                      messagesPage,
                      <AppsGrid key="apps" apps={apps} onOpen={openFromGrid} columns={4} size="md" className="h-full" />,
                    ]}
                  />
                  {appPanel}
                </div>
                {talkBar}
              </>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-[400px_1fr]">
                <div className="relative flex min-h-0 flex-col overflow-hidden border-r border-border">
                  {channelHeader}
                  <div className="relative min-h-0 flex-1">{messagesPage}</div>
                  {talkBar}
                </div>
                <div className="relative min-h-0 overflow-hidden">
                  <AppsGrid apps={apps} onOpen={openFromGrid} columns={6} size="lg" className="absolute inset-0" />
                  {appPanel}
                </div>
              </div>
            )}
            {safeArea.bottom > 0 && <div style={{ height: safeArea.bottom }} className="shrink-0 bg-background" />}
          </div>

          <LeaveDrawer open={leaveOpen} onOpenChange={setLeaveOpen} onLock={lock} />

          <PersonalPunchPrompt
            open={punchAsk.ask && !locked}
            organizationId={me.organizationId}
            myCode={me.myCode}
            onDone={punchAsk.resolve}
            onSkip={punchAsk.resolve}
          />

          <IdleLock
            active={locked}
            onUnlock={unlock}
            channelName={chat.activeChannel?.name}
            showStatusStrip
            card={
              <ClockCard
                title={myShift ? `${t("personalDevice.idle.onShift")} · ${channelShort}` : t("personalDevice.idle.offShift")}
                badge={
                  myShift ? (
                    <StatusBadge tone={myShift.onBreak ? "warning" : "success"}>
                      {myShift.onBreak ? t("personalDevice.idle.onBreak") : t("personalDevice.idle.active")}
                    </StatusBadge>
                  ) : undefined
                }
                value={<span className="font-mono tabular-nums">{shiftElapsed}</span>}
                footLeft={me.myName}
                footRight={
                  todayShift ? (
                    <span className="font-mono tabular-nums">{todayShift.startTime} – {todayShift.endTime}</span>
                  ) : undefined
                }
              />
            }
          />
        </div>
      </div>
    </MiniAppSurface>
  );
}
