"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { OPERATOR_CHAT_WRITES } from "@/lib/spacetimedb/actions/chat";
import { EmptyState } from "@/components/ui/empty-state";
import {
  APP_CATALOG, DEFAULT_DEVICE_APPS, EmbeddedPage, useCatalogApps, useDeviceBuiltins, type DeviceApp, type OnShiftEntry,
} from "@/components/device";
import { DeviceHome, useDeviceAppsState } from "@/components/personal-device/device-home";
import { DirectoryPanel } from "@/components/personal-device/directory-panel";
import { PunchPanel } from "@/components/personal-device/punch-panel";
import { PersonalPunchPrompt } from "@/components/personal-device/punch-prompt";
import { identityHex, type MemberRow } from "@/components/personal-device/use-me";
import type { StoreMember } from "./use-org-members";
import { LogoutDrawer } from "./logout-drawer";
import { DeviceSettingsPanel } from "./device-settings-panel";

export interface LoggedInScreenProps {
  organizationId: string;
  operator: StoreMember;
  /** PIN the operator logged in with (null after a QR log-in) — memory only, never persisted. */
  operatorPin: string | null;
  /** Operator's open shift (null when not punched in). */
  shift: OnShiftEntry | null;
  /** Everyone on shift now (the directory's status). */
  onShiftEntries: OnShiftEntry[];
  /** Ask "Punch in now?" (right after a log-in, off shift): "Yes" opens the Punch in app, as on their phone. */
  punchAsk: boolean;
  onPunchAskDone: () => void;
  onLogout: () => void;
  /** Recording in progress — parent pauses its idle timer. */
  onRecordingChange?: (recording: boolean) => void;
  /** The idle dimmer is running down to the auto log-out. */
  idle?: boolean;
  className?: string;
}

/**
 * The store tablet once someone logged in by PIN or QR: the same home as their own phone
 * (components/personal-device/device-home.tsx), for them. Their chat is theirs — sent for them
 * (OPERATOR_CHAT_WRITES) and marked as from the store — and the Punch in app punches with a tap,
 * no QR. What stays the tablet's: its settings (the device's, not the account's), and Log out in
 * place of Leave.
 */
export function LoggedInScreen({
  organizationId, operator, operatorPin, shift, onShiftEntries, punchAsk, onPunchAskDone, onLogout, onRecordingChange, idle = false, className,
}: LoggedInScreenProps) {
  const t = useT();
  const stdb = useSpacetimeDB();
  const appsState = useDeviceAppsState();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [channelListOpen, setChannelListOpen] = useState(false);

  // The operator's chat: their conversations, on the tablet account's connection. When the operator
  // is the account itself (its owner logged in here) nothing is narrowed.
  const accountHex = stdb?.identity ? identityHex(stdb.identity) : null;
  const chatIdentity = useMemo(() => ({
    hex: operator.userIdHex,
    accountHex,
    operatorRole: operator.userIdHex === accountHex ? null : operator.role,
  }), [operator.userIdHex, operator.role, accountHex]);

  const [memberRows] = useTable(tables.orgMember);
  const members = useMemo(
    () => (memberRows as unknown as MemberRow[]).filter((m) => m.organizationId === organizationId && m.status === "active"),
    [memberRows, organizationId],
  );

  // Built-in apps, then every Merchiva feature the OPERATOR may open (gated by their permissions).
  const builtIns = useDeviceBuiltins("store");
  const catalogApps = useCatalogApps("store", operator);
  const apps: DeviceApp[] = useMemo(() => {
    const seen = new Set(builtIns.map((a) => a.id));
    return [...builtIns, ...catalogApps.filter((a) => !seen.has(a.id))];
  }, [builtIns, catalogApps]);
  const { openApp } = appsState;
  const appTitle = openApp ? (apps.find((a) => a.id === openApp)?.label ?? t(`storeDevice.apps.${openApp}`)) : "";

  const renderApp = (id: DeviceApp["id"], route: string | null) => {
    const builtIn = DEFAULT_DEVICE_APPS.some((a) => a.id === id);
    const catalog = builtIn ? null : APP_CATALOG.find((a) => a.id === id) ?? null;
    if (id === "punch-in") return <PunchPanel store organizationId={organizationId} myMemberId={operator.id} myCode={null} shift={shift} />;
    // Follows would be the tablet account's: none here.
    if (id === "directory") return <DirectoryPanel members={members} onShift={onShiftEntries} myMemberId={operator.id} follows={false} />;
    if (id === "settings") return <DeviceSettingsPanel className="h-full" />;
    if (catalog) {
      return (
        <EmbeddedPage
          appId={catalog.id}
          route={route}
          actor={operator}
          member={{ id: operator.id, displayName: operator.displayName, role: operator.role, userIdHex: operator.userIdHex, punchInCode: operatorPin }}
          onNavigate={appsState.navigate}
        />
      );
    }
    if (id === "requests") return <EmptyState icon={Inbox} title={t("storeDevice.apps.requests")} description={t("storeDevice.comingSoon")} className="h-full" />;
    return null;
  };

  return (
    <div className={cn("relative flex min-h-0 flex-col bg-background", className)}>
      <DeviceHome
        organizationId={organizationId}
        chatIdentity={chatIdentity}
        chatWrites={OPERATOR_CHAT_WRITES}
        apps={apps}
        appsState={appsState}
        appTitle={appTitle}
        renderApp={renderApp}
        leaveLabel={t("storeDevice.logOut")}
        onLeave={() => setLogoutOpen(true)}
        idle={idle}
        onRecordingChange={onRecordingChange}
        listOpen={channelListOpen}
        onListOpenChange={setChannelListOpen}
      />
      <LogoutDrawer open={logoutOpen} onOpenChange={setLogoutOpen} operator={operator} operatorPin={operatorPin} shift={shift} onLogout={onLogout} />
      <PersonalPunchPrompt
        open={punchAsk}
        onYes={() => { onPunchAskDone(); appsState.open("punch-in"); }}
        onSkip={onPunchAskDone}
      />
    </div>
  );
}
