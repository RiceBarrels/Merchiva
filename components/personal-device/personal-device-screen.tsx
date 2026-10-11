"use client";

import { useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { FileText } from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { useAuth } from "@/lib/auth/context";
import { useT } from "@/lib/i18n/context";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/loaders/geometric";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APP_CATALOG,
  ClockCard,
  DEFAULT_DEVICE_APPS,
  EmbeddedPage,
  IdleLock,
  MiniAppSurface,
  fmtDurationHMS,
  useCatalogApps,
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
import { DeviceHome, useDeviceAppsState } from "./device-home";
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

/**
 * /personal — the employee's own phone: a lock screen that asks to punch in, then the device home
 * (./device-home.tsx) for this phone's own identity. A store tablet after a PIN log-in shows the
 * same home for its operator (components/store-device/logged-in-screen.tsx).
 */
export function PersonalDeviceScreen() {
  const t = useT();
  const { user } = useAuth();
  const me = useMe();
  const now = useNow();
  const safeArea = getSafeAreaInsets();
  const phone = useIsMobile();

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

  const appsState = useDeviceAppsState();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [channelListOpen, setChannelListOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  // The phone always boots onto the lock screen; the first swipe-to-unlock is
  // what triggers the punch-in check below.
  const [locked, setLocked] = useState(true);
  // "Punch in now?" after every unlock while off shift (no snooze).
  const punchAsk = usePunchAsk({ ready: me.ready && !!me.myMember && shifts.ready, myCode: me.myCode, onShift: !!myShift });

  const lock = () => { setLeaveOpen(false); setChannelListOpen(false); appsState.close(); punchAsk.dismiss(); setLocked(true); };
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

  // This phone's own chat: the signed-in identity, never an operator's.
  const chatIdentity = useMemo(() => ({ hex: me.meUserId, accountHex: me.meUserId, operatorRole: null }), [me.meUserId]);

  // Home grid: the surface's built-in apps first, then every Merchiva
  // feature the member may open (permission-filtered by the catalog and
  // limited to the apps installed from /manager/apps).
  const builtIns = useDeviceBuiltins("personal");
  const catalogApps = useCatalogApps("personal");
  const apps: DeviceApp[] = useMemo(() => {
    const seen = new Set(builtIns.map((a) => a.id));
    return [...builtIns, ...catalogApps.filter((a) => !seen.has(a.id))];
  }, [builtIns, catalogApps]);
  const { openApp } = appsState;
  const openEntry = openApp ? apps.find((a) => a.id === openApp) ?? null : null;
  const appTitle = openApp ? (openEntry?.label ?? t(`personalDevice.apps.${openApp}`)) : "";

  if (!me.ready || !me.myMember) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  const channelShort = channelName.split("·")[0].trim();
  const shiftElapsed = myShift ? fmtDurationHMS(now.getTime() - myShift.since.getTime()) : "--:--:--";

  const renderApp = (id: DeviceApp["id"], route: string | null) => {
    // Built-in ids always win over a same-named catalog entry.
    const builtIn = DEFAULT_DEVICE_APPS.some((a) => a.id === id);
    const CatalogComponent = builtIn ? null : APP_CATALOG.find((a) => a.id === id)?.component ?? null;
    if (id === "punch-in") {
      return <PunchPanel organizationId={me.organizationId} myMemberId={me.myMemberId} myCode={me.myCode} shift={myShift} />;
    }
    if (id === "directory") return <DirectoryPanel members={me.orgMembers} onShift={shifts.entries} myMemberId={me.myMemberId} />;
    if (id === "settings") return <SettingsPanel name={me.myName} email={user?.email} orgName={me.orgName} />;
    if (CatalogComponent) {
      return (
        <EmbeddedPage
          appId={id}
          route={route}
          member={{ id: me.myMemberId ?? "", displayName: me.myName, role: me.role ?? "staff", userIdHex: me.meUserId, punchInCode: me.myCode }}
          onNavigate={appsState.navigate}
          className="h-full"
        />
      );
    }
    if (id === "requests") {
      return <EmptyState icon={FileText} title={t("personalDevice.comingSoonTitle")} description={t("personalDevice.comingSoonDesc")} className="h-full" />;
    }
    return null;
  };

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
              "relative flex min-h-0 flex-1 flex-col transition-[filter,opacity,transform] duration-700",
              dimming && "blur-[12px] opacity-60",
              locked && "scale-[.9] blur-[8px] opacity-60",
            )}
          >
            <DeviceHome
              organizationId={me.organizationId}
              chatIdentity={chatIdentity}
              apps={apps}
              appsState={appsState}
              appTitle={appTitle}
              renderApp={renderApp}
              leaveLabel={t("personalDevice.leaveBtn")}
              onLeave={() => setLeaveOpen(true)}
              locked={locked}
              idle={dimming}
              onRecordingChange={setRecording}
              onChannelName={setChannelName}
              listOpen={channelListOpen}
              onListOpenChange={setChannelListOpen}
            />
            {safeArea.bottom > 0 && <div style={{ height: safeArea.bottom }} className="shrink-0 bg-background" />}
          </div>

          <LeaveDrawer open={leaveOpen} onOpenChange={setLeaveOpen} onLock={lock} />

          <PersonalPunchPrompt
            open={punchAsk.ask && !locked}
            onYes={() => { punchAsk.resolve(); appsState.open("punch-in"); }}
            onSkip={punchAsk.resolve}
          />

          <IdleLock
            active={locked}
            onUnlock={unlock}
            channelName={channelName || undefined}
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
