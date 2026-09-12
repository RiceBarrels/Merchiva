"use client";

import { useState } from "react";
import { LogOut, ShieldCheck, Coffee, Play, ClockAlert } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { recordPunch } from "@/lib/spacetimedb/actions";
import { DeviceDrawer, PinPad, type DeviceDrawerOption, type OnShiftEntry } from "@/components/device";
import { findManagerByPin, isManagerRole, type StoreMember } from "./use-org-members";

export interface LogoutDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: StoreMember[];
  /** The logged-in operator. */
  operator: StoreMember;
  /** Operator's open shift, or null when not punched in. */
  shift: OnShiftEntry | null;
  onLogout: () => void;
}

/** Switches the device to the back-office UI after a manager PIN. */
export function enterManagerMode() {
  try { sessionStorage.setItem("merchiva_manager_override", "1"); } catch {}
  window.location.href = "/manager/dashboard";
}

export function LogoutDrawer({ open, onOpenChange, members, operator, shift, onLogout }: LogoutDrawerProps) {
  const t = useT();
  const [pane, setPane] = useState<"options" | "managerPin">("options");
  const managerEligible = members.some((m) => isManagerRole(m.role) && !!m.punchInCode);
  const [busy, setBusy] = useState(false);
  // Punches go through the same PIN-based reducer as the terminal; a member
  // who logged in by phone QR without a PIN can't punch from here.
  const canPunch = !!operator.punchInCode && !!shift;

  const punch = async (action: "break-start" | "break-end" | "out") => {
    if (!operator.punchInCode || busy) return false;
    setBusy(true);
    try {
      if (action === "out" && shift?.onBreak) await recordPunch(operator.punchInCode, "break-end");
      await recordPunch(operator.punchInCode, action);
      hapticSuccess();
      return true;
    } catch (err) {
      hapticError();
      toast.error(err instanceof Error ? err.message : t("storeDevice.punchFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) setPane("options");
  };

  const options: DeviceDrawerOption[] = [
    {
      id: "break",
      icon: shift?.onBreak ? Play : Coffee,
      label: shift?.onBreak ? t("storeDevice.endBreak") : t("storeDevice.takeBreak"),
      sub: shift?.onBreak ? t("storeDevice.endBreakSub") : t("storeDevice.takeBreakSub"),
      hidden: !canPunch,
      onSelect: async () => {
        const ok = await punch(shift?.onBreak ? "break-end" : "break-start");
        if (!ok) return;
        toast(shift?.onBreak ? t("storeDevice.breakEnded") : t("storeDevice.onBreakToast"));
        handleOpenChange(false);
      },
    },
    {
      id: "punch-out",
      icon: ClockAlert,
      label: t("storeDevice.punchOutLogOut"),
      sub: t("storeDevice.punchOutLogOutSub"),
      tone: "warn",
      hidden: !canPunch,
      onSelect: async () => {
        const ok = await punch("out");
        if (!ok) return;
        toast.success(`${t("storeDevice.punchedOut")} · ${operator.displayName}`);
        handleOpenChange(false);
        setTimeout(onLogout, 250);
      },
    },
    {
      id: "manager",
      icon: ShieldCheck,
      label: t("storeDevice.switchToManager"),
      sub: t("storeDevice.requiresManagerPin"),
      tone: "primary",
      hidden: !managerEligible,
      onSelect: () => setPane("managerPin"),
    },
    {
      id: "logout",
      icon: LogOut,
      label: t("storeDevice.logOut"),
      sub: shift ? t("storeDevice.logOutKeepSub") : t("storeDevice.logOutSub"),
      tone: shift ? "default" : "warn",
      onSelect: () => {
        handleOpenChange(false);
        setTimeout(onLogout, 250);
      },
    },
  ];

  const handleManagerPin = async (pin: string) => {
    const manager = findManagerByPin(members, pin);
    if (!manager) {
      hapticError();
      return false;
    }
    hapticSuccess();
    toast.success(t("storeDevice.managerModeOn"));
    handleOpenChange(false);
    setTimeout(enterManagerMode, 300);
    return true;
  };

  if (pane === "managerPin") {
    return (
      <DeviceDrawer
        open={open}
        onOpenChange={handleOpenChange}
        title={t("storeDevice.managerMode")}
        cancelLabel={t("storeDevice.back")}
        onCancel={() => setPane("options")}
        maxWidth={400}
      >
        <p className="text-center text-[13px] text-muted-foreground mb-3 leading-relaxed">{t("storeDevice.managerPinPrompt")}</p>
        <PinPad onComplete={handleManagerPin} />
      </DeviceDrawer>
    );
  }

  return (
    <DeviceDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title={t("storeDevice.logOut")}
      options={options}
      cancelLabel={t("storeDevice.cancel")}
      maxWidth={400}
    />
  );
}
