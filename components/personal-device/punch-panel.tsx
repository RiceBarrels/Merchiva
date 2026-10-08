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
import { recordSelfPunch, setOwnPunchCode } from "@/lib/spacetimedb/actions/pin";
import { ownCodeNotice } from "@/lib/pin-attempt";
import { fmt } from "@/lib/i18n/fmt";
import { useT } from "@/lib/i18n/context";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { ScanPane } from "./scan-pane";

export function PunchPanel({
  organizationId,
  myMemberId,
  myCode,
  shift,
}: {
  organizationId: string;
  myMemberId: string | null;
  myCode: string | null;
  shift: OnShiftEntry | null;
}) {
  const t = useT();
  const now = useNow();
  const [busy, setBusy] = useState<PunchAction | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  // Punching in / out on the phone always goes through the store QR: the
  // scanner approves the store's nonce with a punch intent and the server
  // records the punch. Only breaks are recorded directly.
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
    if (!myCode || busy) return;
    hapticLight();
    setBusy(action);
    try {
      await recordSelfPunch(action);
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

  if (!myCode) {
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

      {scanIntent ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">
              {scanIntent === "login" ? t("personalDevice.scan.titleLogin")
                : scanIntent === "punch-in" ? t("personalDevice.scan.titleIn")
                : t("personalDevice.scan.titleOut")}
            </span>
            <button type="button" className="text-[12px] text-muted-foreground" onClick={() => setScanIntent(null)}>
              {t("common.cancel")}
            </button>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{t("personalDevice.scan.holdUp")}</p>
          <ScanPane
            active
            organizationId={organizationId}
            intent={scanIntent}
            onDone={() => {
              const intent = scanIntent;
              setScanIntent(null);
              toast.success(
                intent === "login" ? t("personalDevice.scan.loggedIn")
                : intent === "punch-in" ? t("personalDevice.scan.punchedIn")
                : t("personalDevice.scan.punchedOut"),
              );
            }}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {!onShift && (
              <Button className="col-span-2 h-12 gap-2" onClick={() => openScan("punch-in")} disabled={busy !== null}>
                <LogIn className="h-4 w-4" />{t("personalDevice.punch.punchIn")}
              </Button>
            )}
            {onShift && !onBreak && (
              <>
                <Button variant="outline" className="h-12 gap-2" onClick={() => punch("break-start")} disabled={busy !== null}>
                  <Coffee className="h-4 w-4" />{t("personalDevice.punch.startBreak")}
                </Button>
                <Button variant="destructive" className="h-12 gap-2" onClick={() => openScan("punch-out")} disabled={busy !== null}>
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

          <div className="border-t border-border pt-4">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("personalDevice.punch.scanSection")}
            </div>
            <Button variant="outline" className="h-11 w-full gap-2" onClick={() => openScan("login")}>
              <ScanLine className="h-4 w-4" />{t("personalDevice.punch.scanStoreQr")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
