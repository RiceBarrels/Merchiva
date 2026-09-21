"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTable } from "spacetimedb/react";
import { RefreshCw, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { tables } from "@/lib/spacetimedb/generated";
import { getConnection } from "@/lib/spacetimedb/client";
import { createDeviceLoginRequest, consumeDeviceLogin } from "@/lib/spacetimedb/actions";
import { uuid, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { hapticError, hapticLight, hapticSuccess } from "@/lib/haptics";
import { QrCodeView, PinPad, fmtMMSS, useNow } from "@/components/device";
import { isManagerRole, type StoreMember } from "./use-org-members";
import { usePinOperator } from "./use-pin-operator";
import { ExitStoreDrawer } from "./exit-store-drawer";

const QR_TTL_SECONDS = 60;

interface DeviceLoginRow {
  id: { toString(): string };
  organizationId: string;
  deviceId: string;
  nonce: string;
  status: string;
  memberId?: string | null;
}

/**
 * Issues a fresh device-login nonce every QR_TTL_SECONDS and watches the
 * device_login_request table for its approval. The QR payload is
 * `merchiva://device-login?org=<orgId>&nonce=<nonce>`.
 */
function useDeviceLoginQr(organizationId: string, deviceId: string, enabled: boolean) {
  const [nonce, setNonce] = useState<string>(() => uuid());
  const [issuedAt, setIssuedAt] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow(1000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loginTable = (tables as any).deviceLoginRequest;
  const [rows] = useTable(loginTable ?? tables.orgMember);
  const hasTable = !!loginTable;

  const secondsLeft = Math.max(0, QR_TTL_SECONDS - Math.floor((now.getTime() - issuedAt) / 1000));

  const issue = useCallback(() => {
    setNonce(uuid());
    setIssuedAt(Date.now());
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  // Publish every nonce to the server so a phone can approve it. The reducer
  // may not be published yet — PIN log-in keeps working regardless.
  useEffect(() => {
    if (!enabled || !deviceId) return;
    createDeviceLoginRequest(deviceId, nonce).catch((err) => {
      console.warn("[store-device] createDeviceLoginRequest failed:", err);
    });
  }, [enabled, deviceId, nonce]);

  // Re-issue once the TTL elapses.
  const issuedAtRef = useRef(issuedAt);
  useEffect(() => { issuedAtRef.current = issuedAt; }, [issuedAt]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (Date.now() - issuedAtRef.current >= QR_TTL_SECONDS * 1000) issue();
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, issue]);

  const approved = useMemo(() => {
    if (!hasTable || !enabled) return null;
    const row = (rows as unknown as DeviceLoginRow[]).find(
      (r) => r.nonce === nonce && r.organizationId === organizationId && r.status === "approved" && !!r.memberId,
    );
    return row ? { requestId: row.id.toString(), memberId: row.memberId as string } : null;
  }, [rows, hasTable, enabled, nonce, organizationId]);

  const value = `merchiva://device-login?org=${encodeURIComponent(organizationId)}&nonce=${encodeURIComponent(nonce)}`;
  return { value, secondsLeft, refreshing, refresh: issue, approved };
}

export interface LoginPaneProps {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  members: StoreMember[];
  /** Pause QR issuing while the pane is hidden (idle lock). */
  active: boolean;
  /** `pin` is the code they typed, or null after a QR log-in — the device keeps
   *  it in memory so the operator can punch, and never persists it. */
  onLogin: (member: StoreMember, pin: string | null) => void;
  /** Phone: smaller QR, tighter padding, medium PIN keys. */
  compact?: boolean;
  className?: string;
}

export function LoginPane({ organizationId, deviceId, deviceName, members, active, onLogin, compact = false, className }: LoginPaneProps) {
  const t = useT();
  const [pinMode, setPinMode] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const resolveOperator = usePinOperator(organizationId);
  const { value, secondsLeft, refreshing, refresh, approved } = useDeviceLoginQr(organizationId, deviceId, active && !pinMode);

  // QR approved from a phone → show the check, consume the request, log in.
  const approvedMember = useMemo(
    () => (approved ? members.find((m) => m.id === approved.memberId) ?? null : null),
    [approved, members],
  );
  const scanOk = approvedMember?.displayName ?? null;
  const handledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!approved || !approvedMember || handledRef.current === approved.requestId) return;
    handledRef.current = approved.requestId;
    consumeDeviceLogin(approved.requestId).catch(console.error);
    hapticSuccess();
    const id = setTimeout(() => onLogin(approvedMember, null), 900);
    return () => clearTimeout(id);
  }, [approved, approvedMember, onLogin]);

  // The tablet cannot match a PIN itself — `member_punch_code` is RLS'd to the
  // signed-in account — so the database answers who it belongs to.
  const handlePin = useCallback(
    async (pin: string) => {
      const resolved = await resolveOperator(pin);
      const member = resolved ? members.find((m) => m.id === resolved.memberId) ?? null : null;
      if (!member) {
        hapticError();
        return false;
      }
      hapticSuccess();
      setPinMode(false);
      onLogin(member, pin);
      return true;
    },
    [members, onLogin, resolveOperator],
  );

  const handleSos = useCallback(() => {
    hapticLight();
    const title = `${t("storeDevice.sosTitle")} ${deviceName || t("storeDevice.thisDevice")}`;
    const body = t("storeDevice.sosBody");
    const conn = getConnection();
    const managers = members.filter((m) => isManagerRole(m.role));
    if (conn && managers.length > 0) {
      for (const m of managers) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (conn as any).reducers
          .createNotification({
            organizationId,
            targetIdentity: m.userIdentity,
            type: "emergency",
            title,
            body,
            link: "/store",
          })
          .catch?.((err: unknown) => console.warn("[store-device] SOS notify failed:", err));
      }
    }
    toast.error(t("storeDevice.sosToast"));
  }, [deviceName, members, organizationId, t]);

  return (
    <div className={cn("relative flex flex-col bg-background border-border min-h-0", compact ? "px-5 pt-5 pb-5" : "border-r px-8 pt-8 pb-6", className)}>
      {!pinMode ? (
        <>
          <QrCodeView
            value={value}
            size={compact ? 200 : 240}
            status={scanOk ? "ok" : refreshing ? "refreshing" : "idle"}
            caption={scanOk ? `✓ ${t("storeDevice.phoneVerified")} · ${scanOk}` : undefined}
            className={compact ? "mx-auto" : "mx-auto mt-4"}
          />
          <p className="text-center text-[13px] text-muted-foreground mt-3.5 mb-6">{t("storeDevice.scanToLogin")}</p>
          <button
            type="button"
            onClick={() => { hapticLight(); setPinMode(true); }}
            className="h-12 w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/80 active:translate-y-px"
          >
            {t("storeDevice.loginWithPin")}
          </button>
          <button
            type="button"
            onClick={() => { hapticLight(); refresh(); }}
            className="mt-2 h-12 w-full inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("storeDevice.refreshQr")} · <span className="font-mono tabular-nums">{fmtMMSS(secondsLeft).replace(/^0/, "")}</span>
          </button>
        </>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div>
            <b className="block text-[20px] font-semibold tracking-tight">{t("storeDevice.enterPin")}</b>
            <span className="block text-[13px] text-muted-foreground mt-1">{t("storeDevice.enterPinSub")}</span>
          </div>
          <PinPad size={compact ? "md" : "lg"} onComplete={handlePin} className={compact ? "mt-5" : "mt-8"} />
          <button
            type="button"
            onClick={() => { hapticLight(); setPinMode(false); }}
            className={cn("h-11 w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors", compact ? "mt-4" : "mt-auto")}
          >
            {t("storeDevice.back")}
          </button>
        </div>
      )}

      {!pinMode && (
        <div className={cn("flex items-center justify-between text-[13px] font-medium", compact ? "pt-4" : "mt-auto pt-6")}>
          <button type="button" onClick={handleSos} className="inline-flex items-center gap-2.5 text-destructive">
            <i className="not-italic h-10 w-10 rounded-full bg-destructive/10 grid place-items-center text-[10px] font-bold tracking-wider">SOS</i>
            {t("storeDevice.emergency")}
          </button>
          {/* Always offered: whether the PIN belongs to a manager is decided by
              the `verifyManagerPin` reducer, not by anything this device can read. */}
          <button
            type="button"
            onClick={() => { hapticLight(); setExitOpen(true); }}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title={t("storeDevice.leaveStoreModeHint")}
          >
            <DoorOpen className="h-4 w-4" />
            {t("storeDevice.leaveStoreMode")}
          </button>
        </div>
      )}

      <ExitStoreDrawer open={exitOpen} onOpenChange={setExitOpen} />
    </div>
  );
}
