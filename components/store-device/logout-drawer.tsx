"use client";

import { useState } from "react";
import { LogOut, Coffee, Play, ClockAlert, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { recordPunch } from "@/lib/spacetimedb/actions";
import { DeviceDrawer, type DeviceDrawerOption, type OnShiftEntry } from "@/components/device";
import type { StoreMember } from "./use-org-members";
import { ExitStoreDrawer } from "./exit-store-drawer";

export interface LogoutDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The logged-in operator. */
  operator: StoreMember;
  /** PIN the operator logged in with, held in memory for this session only —
   *  `recordPunch` validates it server-side. Null after a QR log-in, which is
   *  why punching is hidden then. */
  operatorPin: string | null;
  /** Operator's open shift, or null when not punched in. */
  shift: OnShiftEntry | null;
  onLogout: () => void;
}

export function LogoutDrawer({ open, onOpenChange, operator, operatorPin, shift, onLogout }: LogoutDrawerProps) {
  const t = useT();
  const [pane, setPane] = useState<"options" | "exitPin">("options");
  const [busy, setBusy] = useState(false);
  // Punches go through the same PIN-based reducer as the terminal; a member
  // who logged in by phone QR without a PIN can't punch from here.
  const canPunch = !!operatorPin && !!shift;

  const punch = async (action: "break-start" | "break-end" | "out") => {
    if (!operatorPin || busy) return false;
    setBusy(true);
    try {
      if (action === "out" && shift?.onBreak) await recordPunch(operatorPin, "break-end");
      await recordPunch(operatorPin, action);
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
      id: "exit-store",
      icon: DoorOpen,
      label: t("storeDevice.leaveStoreMode"),
      sub: t("storeDevice.requiresManagerPin"),
      tone: "warn",
      onSelect: () => setPane("exitPin"),
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

  if (pane === "exitPin") {
    return (
      <ExitStoreDrawer
        open={open}
        onOpenChange={handleOpenChange}
        cancelLabel={t("storeDevice.back")}
        onCancel={() => setPane("options")}
      />
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
