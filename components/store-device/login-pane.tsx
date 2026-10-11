"use client";

import { useCallback, useState } from "react";
import { RefreshCw, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { sendStoreSos } from "@/lib/spacetimedb/actions/notifications";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { hapticError, hapticLight, hapticSuccess } from "@/lib/haptics";
import { QrCodeView, PinPad, fmtMMSS } from "@/components/device";
import type { StoreMember } from "./use-org-members";
import { usePinOperator } from "./use-pin-operator";
import { useQrLogin } from "./use-qr-login";
import { pinNotice } from "@/lib/pin-attempt";
import { fmt } from "@/lib/i18n/fmt";
import { ExitStoreDrawer } from "./exit-store-drawer";
import { sosErrorKey } from "./sos";

export interface LoginPaneProps {
  organizationId: string;
  /** This tablet's store_device id: QR log-ins and the SOS name it. */
  deviceId: string;
  members: StoreMember[];
  /** Pause QR issuing while the pane is hidden (idle lock). */
  active: boolean;
  /** `pin` is the code they typed, or null after a QR log-in — the device keeps
   *  it in memory so the operator can punch, and never persists it. A QR log-in
   *  off shift opens the Punch in app: the phone scanned from its Punch in. */
  onLogin: (member: StoreMember, pin: string | null) => void;
  /** Phone: smaller QR, tighter padding, medium PIN keys. */
  compact?: boolean;
  className?: string;
}

export function LoginPane({ organizationId, deviceId, members, active, onLogin, compact = false, className }: LoginPaneProps) {
  const t = useT();
  const [pinMode, setPinMode] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [sosSending, setSosSending] = useState(false);
  const resolveOperator = usePinOperator(organizationId);
  const { value, secondsLeft, refreshing, refresh, scanOk } = useQrLogin({
    organizationId, deviceId, members, shown: active, issuing: active && !pinMode, onLogin,
  });

  // The tablet cannot match a PIN itself — `member_punch_code` is RLS'd to the
  // signed-in account — so the database answers who it belongs to.
  const handlePin = useCallback(
    async (pin: string) => {
      const { answer, operator } = await resolveOperator(pin);
      const member = operator ? members.find((m) => m.id === operator.memberId) ?? null : null;
      if (!member) {
        hapticError();
        // Wrong PINs are rate limited: say when entry is paused, or that no answer came.
        const notice = pinNotice(answer);
        setPinMessage(notice ? fmt(t(notice.key), notice.vars) : null);
        return false;
      }
      hapticSuccess();
      setPinMessage(null);
      setPinMode(false);
      onLogin(member, pin);
      return true;
    },
    [members, onLogin, resolveOperator, t],
  );

  // The module alerts every owner and manager (in-app, push and email), names this
  // device from its registration and allows one SOS per store every 2 minutes.
  const handleSos = useCallback(() => {
    if (sosSending) return;
    hapticLight();
    setSosSending(true);
    // sendStoreSos throws (not rejects) while disconnected.
    Promise.resolve()
      .then(() => sendStoreSos(deviceId, organizationId))
      .then(() => {
        toast.error(t("storeDevice.sosToast"));
      })
      .catch((err: unknown) => {
        console.warn("[store-device] SOS failed:", err);
        hapticError();
        toast.error(t(sosErrorKey(err)));
      })
      .finally(() => setSosSending(false));
  }, [deviceId, organizationId, sosSending, t]);

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
          {pinMessage && <p role="alert" className="mt-3 text-center text-[13px] text-destructive">{pinMessage}</p>}
          <button
            type="button"
            onClick={() => { hapticLight(); setPinMode(false); setPinMessage(null); }}
            className={cn("h-11 w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors", compact ? "mt-4" : "mt-auto")}
          >
            {t("storeDevice.back")}
          </button>
        </div>
      )}

      {!pinMode && (
        <div className={cn("flex items-center justify-between text-[13px] font-medium", compact ? "pt-4" : "mt-auto pt-6")}>
          <button type="button" onClick={handleSos} disabled={sosSending} className="inline-flex items-center gap-2.5 text-destructive disabled:opacity-60">
            <i className="not-italic h-10 w-10 rounded-full bg-destructive/10 grid place-items-center text-[10px] font-bold tracking-wider">SOS</i>
            {t("storeDevice.emergency")}
          </button>
          {/* Always offered: whether the PIN belongs to a manager is decided by
              the `verifyManagerPinAttempt` reducer, not by anything this device can read. */}
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
