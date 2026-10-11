"use client";

import { useState } from "react";
import { Coffee, LogIn, LogOut, ScanLine, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { ClockCard, fmtDurationHMS, fmtHM, useNow, type OnShiftEntry, type PunchAction } from "@/components/device";
import type { DeviceLoginIntent } from "@/lib/spacetimedb/actions";
import { recordOperatorPunch, recordSelfPunch, setOwnPunchCode } from "@/lib/spacetimedb/actions/pin";
import { ownCodeNotice } from "@/lib/pin-attempt";
import { fmt } from "@/lib/i18n/fmt";
import { useT } from "@/lib/i18n/context";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { LitePage } from "@/components/device/apps/lite-page";
import { ScanPane } from "./scan-pane";

/**
 * The Punch in app. On the phone, off shift it holds one button, Punch in: it scans the store
 * device's QR, which logs the member in there and opens the device's Punch in app, where the punch
 * itself is tapped (nothing is recorded by the scan). Punching out still goes through the store's
 * QR. On a store tablet (`store`) the operator its PIN / QR log-in resolved taps in, break and out
 * directly (recordOperatorPunch), with no code to set and nothing to scan.
 */
export function PunchPanel({
  organizationId,
  myMemberId,
  myCode,
  shift,
  store = false,
}: {
  organizationId: string;
  myMemberId: string | null;
  myCode: string | null;
  shift: OnShiftEntry | null;
  /** A store tablet punching for its logged-in operator. */
  store?: boolean;
}) {
  const t = useT();
  const now = useNow();
  const [busy, setBusy] = useState<PunchAction | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  // Punching in / out on the phone always goes through the store QR. Punch in
  // approves the store's nonce as a log-in (the punch is tapped on the device);
  // punch out approves it with the punch-out intent and the server records it.
  // Only breaks are recorded directly.
  const [scanIntent, setScanIntent] = useState<DeviceLoginIntent | null>(null);

  const onShift = !!shift;
  const onBreak = !!shift?.onBreak;

  const saveCode = async () => {
    if (!myMemberId) return;
    if (!/^\d{4}$/.test(codeInput)) { toast.error(t("personalDevice.punch.codeFormat")); return; }
    setSavingCode(true);
    try {
      // Rate limited (a taken code names a colleague's PIN): the answer is a row.
      const notice = ownCodeNotice(await setOwnPunchCode(codeInput));
      if (notice) throw new Error(fmt(t(notice.key), notice.vars));
      hapticSuccess();
      toast.success(t("personalDevice.punch.codeSaved"));
      setCodeInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personalDevice.punch.failed"));
    } finally {
      setSavingCode(false);
    }
  };

  const openScan = (intent: DeviceLoginIntent) => { hapticLight(); setScanIntent(intent); };

  const punch = async (action: PunchAction) => {
    if ((!store && !myCode) || busy) return;
    hapticLight();
    setBusy(action);
    try {
      // A tablet punches its operator (no QR); the phone punches its own member.
      if (store) await recordOperatorPunch(action);
      else await recordSelfPunch(action);
      hapticSuccess();
      const label = {
        in: t("personalDevice.punch.punchedIn"),
        out: t("personalDevice.punch.punchedOut"),
        "break-start": t("personalDevice.punch.breakStarted"),
        "break-end": t("personalDevice.punch.breakEnded"),
      }[action];
      toast.success(`${label} · ${fmtHM(new Date())}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personalDevice.punch.failed"));
    } finally {
      setBusy(null);
    }
  };

  if (!myCode && !store) {
    return (
      <div className="space-y-4 p-4">
        <div>
          <p className="text-[15px] font-semibold">{t("personalDevice.punch.setCodeTitle")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("personalDevice.punch.setCodeDesc")}</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("personalDevice.punch.codeLabel")}
          </Label>
          <Input
            value={codeInput}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            className="h-11 font-mono tracking-[0.4em]"
            autoFocus
          />
        </div>
        <Button className="h-11 w-full" onClick={saveCode} disabled={savingCode || codeInput.length !== 4}>
          {t("personalDevice.punch.saveCode")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <ClockCard
        title={onShift ? t("personalDevice.punch.onShift") : t("personalDevice.punch.offShift")}
        badge={
          onShift ? (
            <StatusBadge tone={onBreak ? "warning" : "success"} dot>
              {onBreak ? t("personalDevice.punch.onBreak") : t("personalDevice.punch.active")}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral">{t("personalDevice.punch.off")}</StatusBadge>
          )
        }
        value={<span className="font-mono tabular-nums">{shift ? fmtDurationHMS(now.getTime() - shift.since.getTime()) : "--:--:--"}</span>}
        footLeft={shift ? `${t("personalDevice.punch.since")} ${fmtHM(shift.since)}` : t("personalDevice.punch.notPunchedIn")}
        footRight={<span className="font-mono tabular-nums">{fmtHM(now)}</span>}
      />

      <div className="grid grid-cols-2 gap-2">
        {!onShift && (
          <Button className="col-span-2 h-12 gap-2" onClick={() => (store ? punch("in") : openScan("punch-in"))} disabled={busy !== null}>
            <LogIn className="h-4 w-4" />{t("personalDevice.punch.punchIn")}
          </Button>
        )}
        {onShift && !onBreak && (
          <>
            <Button variant="outline" className="h-12 gap-2" onClick={() => punch("break-start")} disabled={busy !== null}>
              <Coffee className="h-4 w-4" />{t("personalDevice.punch.startBreak")}
            </Button>
            <Button variant="destructive" className="h-12 gap-2" onClick={() => (store ? punch("out") : openScan("punch-out"))} disabled={busy !== null}>
              <LogOut className="h-4 w-4" />{t("personalDevice.punch.punchOut")}
            </Button>
          </>
        )}
        {onShift && onBreak && (
          <Button className="col-span-2 h-12 gap-2" onClick={() => punch("break-end")} disabled={busy !== null}>
            <Undo2 className="h-4 w-4" />{t("personalDevice.punch.endBreak")}
          </Button>
        )}
      </div>

      {/* Logging in on a store device by its QR is the phone's job. Off shift Punch in is the only button. */}
      {!store && onShift && (
        <div className="border-t border-border pt-4">
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("personalDevice.punch.scanSection")}
          </div>
          <Button variant="outline" className="h-11 w-full gap-2" onClick={() => openScan("login")}>
            <ScanLine className="h-4 w-4" />{t("personalDevice.punch.scanStoreQr")}
          </Button>
        </div>
      )}

      {/* Scanning is its own page over the app: Back (or a swipe) returns to the buttons. */}
      <LitePage
        open={scanIntent !== null}
        onClose={() => setScanIntent(null)}
        title={
          scanIntent === "login" ? t("personalDevice.scan.titleLogin")
          : scanIntent === "punch-out" ? t("personalDevice.scan.titleOut")
          : t("personalDevice.scan.titleIn")
        }
      >
        <p className="text-[13px] text-muted-foreground leading-relaxed">{t("personalDevice.scan.holdUp")}</p>
        {scanIntent && (
          <ScanPane
            active
            organizationId={organizationId}
            intent={scanIntent === "punch-in" ? "login" : scanIntent}
            onDone={() => {
              const intent = scanIntent;
              setScanIntent(null);
              toast.success(
                intent === "login" ? t("personalDevice.scan.loggedIn")
                : intent === "punch-in" ? t("personalDevice.scan.punchOnDevice")
                : t("personalDevice.scan.punchedOut"),
              );
            }}
          />
        )}
      </LitePage>
    </div>
  );
}
