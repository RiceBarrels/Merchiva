"use client";

import { useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { FileText, LogOut, MessageSquare } from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { useAuth } from "@/lib/auth/context";
import { useI18n, useT } from "@/lib/i18n/context";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/loaders/geometric";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APP_CATALOG,
  ChannelHeader,
  ClockCard,
  DEFAULT_DEVICE_APPS,
  EmbeddedPage,
  IdleLock,
  MessageList,
  TalkBar,
  fmtDurationHMS,
  fmtStatusClock,
  shortName,
  useCatalogApps,
  useChannels,
  useIdleTimer,
  useNow,
  useOnShift,
  type DeviceApp,
} from "@/components/device";
import { useMe } from "./use-me";
import { PagesTrack } from "./pages-track";
import { AppPanel } from "./app-panel";
import { AppsHome } from "./apps-home";
import { LeaveDrawer } from "./leave-drawer";
import { PunchPanel } from "./punch-panel";
import { DirectoryPanel } from "./directory-panel";
import { SettingsPanel } from "./settings-panel";

interface ShiftRow {
  organizationId: string;
  memberId?: string;
  date: string;
  startTime: string;
  endTime: string;
}

const IDLE_MS = 30_000;
const DIM_MS = 22_000;

function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PersonalDeviceScreen() {
  const t = useT();
  const { locale } = useI18n();
  const { user } = useAuth();
  const me = useMe();
  const now = useNow();
  const safeArea = getSafeAreaInsets();

  const chat = useChannels({ organizationId: me.organizationId, meUserId: me.meUserId, locale });
  const shifts = useOnShift(me.organizationId);
  const myShift = me.myMemberId ? shifts.forMember(me.myMemberId) : null;

  const [shiftRows] = useTable(tables.shift);
  const todayShift = useMemo(() => {
    if (!me.myMemberId) return null;
    const today = localDateKey(new Date());
    return (
      (shiftRows as unknown as ShiftRow[]).find(
        (s) => s.organizationId === me.organizationId && s.memberId === me.myMemberId && s.date === today,
      ) ?? null
    );
  }, [shiftRows, me.myMemberId, me.organizationId]);

  const [page, setPage] = useState(0);
  const [openApp, setOpenApp] = useState<DeviceApp["id"] | null>(null);
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  // Lazy initialiser is safe: the manager layout only renders this screen
  // client-side once auth has loaded, so there is no SSR pass to mismatch.
  const [managerMode] = useState(() => {
    try { return sessionStorage.getItem("merchiva_manager_override") === "1"; } catch { return false; }
  });

  const lock = () => { setLeaveOpen(false); setOpenApp(null); setLocked(true); };
  const { dimming, reset: resetIdle } = useIdleTimer({
    idleMs: IDLE_MS,
    dimMs: DIM_MS,
    enabled: !locked,
    // Only a live recording freezes the countdown; open drawers / app
    // panels keep counting so the phone still locks when put down.
    paused: recording,
    onIdle: lock,
  });
  const unlock = () => { setLocked(false); resetIdle(); };

  // Switching channel returns to the messages page, like the prototype.
  const selectChannel = (i: number) => { chat.setActiveIndex(i); setPage(0); };
  const nextChannel = () => { chat.next(); setPage(0); };
  const prevChannel = () => { chat.prev(); setPage(0); };

  // Home grid: the surface's built-in apps first, then every Merchiva
  // feature the member may open (permission-filtered by the catalog).
  const catalogApps = useCatalogApps("personal");
  const apps: DeviceApp[] = useMemo(() => {
    const builtIns = DEFAULT_DEVICE_APPS.map((a) => ({ ...a, label: t(`personalDevice.apps.${a.id}`) }));
    const seen = new Set(builtIns.map((a) => a.id));
    return [...builtIns, ...catalogApps.filter((a) => !seen.has(a.id))];
  }, [t, catalogApps]);
  // Built-in ids always win over a same-named catalog entry.
  const isBuiltIn = !!openApp && DEFAULT_DEVICE_APPS.some((a) => a.id === openApp);
  const openCatalogEntry = openApp && !isBuiltIn ? APP_CATALOG.find((a) => a.id === openApp) ?? null : null;
  const CatalogComponent = openCatalogEntry?.component ?? null;
  const appTitle = openApp
    ? (apps.find((a) => a.id === openApp)?.label ?? t(`personalDevice.apps.${openApp}`))
    : "";

  if (!me.ready || !me.myMember) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  const channelShort = chat.activeChannel?.name.split("·")[0].trim() ?? "";
  const shiftElapsed = myShift ? fmtDurationHMS(now.getTime() - myShift.since.getTime()) : "--:--:--";

  return (
    <div className="h-[100dvh] w-full bg-muted/40 text-foreground">
      <div
        className="relative mx-auto flex h-full w-full max-w-[480px] select-none flex-col overflow-hidden bg-background sm:border-x sm:border-border"
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
          {/* status strip */}
          <div className="flex h-7 shrink-0 items-center justify-between px-4 text-[13px] font-semibold">
            <span>{fmtStatusClock(now)}</span>
            <span className="truncate text-[11px] font-medium text-muted-foreground">{me.orgName}</span>
          </div>

          <ChannelHeader
            channels={chat.channels}
            activeIndex={chat.activeIndex}
            onSelect={selectChannel}
            right={
              managerMode && me.isManager ? (
                <span className="inline-flex h-5 items-center whitespace-nowrap rounded bg-primary px-2 text-[12px] font-medium text-primary-foreground">
                  {t("personalDevice.managerBadge")} · {shortName(me.myName)}
                </span>
              ) : (
                <span className="inline-flex h-5 items-center whitespace-nowrap rounded bg-secondary px-2 text-[12px] font-medium">
                  {shortName(me.myName)}
                </span>
              )
            }
            className="shrink-0"
          />

          {/* pages */}
          <div className="relative min-h-0 flex-1">
            <PagesTrack
              page={page}
              onPageChange={(p) => { hapticLight(); setPage(p); }}
              className="h-full"
              pages={[
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
                ),
                <AppsHome
                  key="apps"
                  apps={apps}
                  onOpen={(id) => setOpenApp(id)}
                  className="h-full"
                />,
              ]}
            />

            <AppPanel open={openApp !== null} title={appTitle} onClose={() => setOpenApp(null)}>
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
                  onNavigate={(next, route) => { setOpenApp(next); setOpenRoute(route); }}
                  className="h-full"
                />
              )}
              {(openApp === "requests" || openApp === "docs") && !CatalogComponent && (
                <EmptyState
                  icon={FileText}
                  title={t("personalDevice.comingSoonTitle")}
                  description={t("personalDevice.comingSoonDesc")}
                  className="h-full"
                />
              )}
            </AppPanel>
          </div>

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
          {safeArea.bottom > 0 && <div style={{ height: safeArea.bottom }} className="shrink-0 bg-background" />}
        </div>

        <LeaveDrawer
          open={leaveOpen}
          onOpenChange={setLeaveOpen}
          organizationId={me.organizationId}
          myCode={me.myCode}
          onShift={!!myShift}
          onBreak={!!myShift?.onBreak}
          isManager={me.isManager}
          onLock={lock}
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
  );
}
