"use client";

import { useState } from "react";
import { Coffee, LogOut, MoonStar, ScanLine, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { DeviceDrawer, type DeviceDrawerOption, fmtHM } from "@/components/device";
import { recordPunch, type DeviceLoginIntent } from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { ScanPane } from "./scan-pane";

type Pane = "options" | "scan";

export function LeaveDrawer({
  open,
  onOpenChange,
  organizationId,
  myCode,
  onShift,
  onBreak,
  isManager,
  onLock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  myCode: string | null;
  onShift: boolean;
  onBreak: boolean;
  isManager: boolean;
  /** Lock the phone (idle screen). */
  onLock: () => void;
}) {
  const t = useT();
  const [pane, setPane] = useState<Pane>("options");
  const [intent, setIntent] = useState<DeviceLoginIntent>("punch-out");

  const close = () => { onOpenChange(false); setTimeout(() => setPane("options"), 250); };

  const punch = async (action: "break-start" | "break-end") => {
    if (!myCode) { toast.error(t("personalDevice.punch.needCode")); return; }
    try {
      await recordPunch(myCode, action);
      hapticSuccess();
      toast.success(action === "break-start" ? t("personalDevice.leave.onBreakToast") : t("personalDevice.leave.breakEndedToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personalDevice.punch.failed"));
    }
  };

  const startScan = (i: DeviceLoginIntent) => { hapticLight(); setIntent(i); setPane("scan"); };

  const options: DeviceDrawerOption[] = [
    {
      id: "screen",
      icon: MoonStar,
      label: t("personalDevice.leave.screenOff"),
      sub: t("personalDevice.leave.screenOffSub"),
      onSelect: () => { close(); setTimeout(onLock, 250); },
    },
    {
      id: "break",
      icon: onBreak ? Undo2 : Coffee,
      label: onBreak ? t("personalDevice.leave.endBreak") : t("personalDevice.leave.takeBreak"),
      sub: onBreak ? t("personalDevice.leave.endBreakSub") : t("personalDevice.leave.takeBreakSub"),
      hidden: !onShift,
      onSelect: () => { close(); void punch(onBreak ? "break-end" : "break-start"); },
    },
    {
      id: "store-login",
      icon: ScanLine,
      label: t("personalDevice.leave.storeLogin"),
      sub: t("personalDevice.leave.storeLoginSub"),
      onSelect: () => startScan("login"),
    },
    {
      id: "manager",
      icon: ShieldCheck,
      label: t("personalDevice.leave.managerMode"),
      sub: t("personalDevice.leave.managerModeSub"),
      tone: "primary",
      hidden: !isManager,
      onSelect: () => {
        hapticLight();
        try { sessionStorage.setItem("merchiva_manager_override", "1"); } catch {}
        window.location.href = "/manager/dashboard";
      },
    },
    {
      id: "leave",
      icon: LogOut,
      label: onShift ? t("personalDevice.leave.leaveWork") : t("personalDevice.leave.startWork"),
      sub: onShift ? t("personalDevice.leave.leaveWorkSub") : t("personalDevice.leave.startWorkSub"),
      tone: "warn",
      onSelect: () => startScan(onShift ? "punch-out" : "punch-in"),
    },
  ];

  const scanTitle =
    intent === "punch-out" ? t("personalDevice.scan.titleOut")
    : intent === "punch-in" ? t("personalDevice.scan.titleIn")
    : t("personalDevice.scan.titleLogin");

  return (
    <DeviceDrawer
      open={open}
      onOpenChange={(o) => { if (!o) close(); else onOpenChange(o); }}
      title={pane === "options" ? t("personalDevice.leave.title") : scanTitle}
      options={pane === "options" ? options : undefined}
      cancelLabel={pane === "options" ? t("common.cancel") : t("common.back")}
      onCancel={pane === "options" ? close : () => setPane("options")}
    >
      {pane === "scan" && (
        <div className="pb-2">
          <ScanPane
            active={open && pane === "scan"}
            organizationId={organizationId}
            intent={intent}
            onDone={() => {
              const now = fmtHM(new Date());
              close();
              if (intent === "punch-out") { toast.success(`${t("personalDevice.scan.punchedOut")} · ${now}`); setTimeout(onLock, 900); }
              else if (intent === "punch-in") toast.success(`${t("personalDevice.scan.punchedIn")} · ${now}`);
              else toast.success(t("personalDevice.scan.loggedIn"));
            }}
          />
          <p className="mx-auto mt-3 max-w-[300px] text-center text-[13px] leading-relaxed text-muted-foreground">
            {t("personalDevice.scan.holdUp")}
          </p>
        </div>
      )}
    </DeviceDrawer>
  );
}
