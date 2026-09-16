"use client";

import { DoorOpen, MoonStar } from "lucide-react";
import { AdminModeIcon } from "@/components/device/app-icons";
import { DeviceDrawer, type DeviceDrawerOption } from "@/components/device";
import { useT } from "@/lib/i18n/context";
import { hapticLight } from "@/lib/haptics";
import { APP_MODE_HOME, clearAppMode, setManagerOverride } from "@/lib/app-mode";

/**
 * Bottom-left "Leave" sheet. Punching (in / out / breaks) and the store-device
 * QR log-in are deliberately not here — they live in the Punch in app.
 */
export function LeaveDrawer({
  open,
  onOpenChange,
  isManager,
  onLock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isManager: boolean;
  /** Lock the phone (idle screen). */
  onLock: () => void;
}) {
  const t = useT();
  const close = () => onOpenChange(false);

  const options: DeviceDrawerOption[] = [
    {
      id: "screen",
      icon: MoonStar,
      label: t("personalDevice.leave.screenOff"),
      sub: t("personalDevice.leave.screenOffSub"),
      onSelect: () => { close(); setTimeout(onLock, 250); },
    },
    {
      id: "manager",
      icon: AdminModeIcon,
      label: t("personalDevice.leave.managerMode"),
      sub: t("personalDevice.leave.managerModeSub"),
      tone: "primary",
      hidden: !isManager,
      onSelect: () => {
        hapticLight();
        setManagerOverride(true);
        window.location.href = APP_MODE_HOME.admin;
      },
    },
    {
      id: "exit-mode",
      icon: DoorOpen,
      label: t("personalDevice.leave.exitMode"),
      sub: t("personalDevice.leave.exitModeSub"),
      tone: "warn",
      onSelect: () => {
        hapticLight();
        clearAppMode();
        window.location.href = "/choose?switch=1";
      },
    },
  ];

  return (
    <DeviceDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={t("personalDevice.leave.title")}
      options={options}
      cancelLabel={t("common.cancel")}
      onCancel={close}
    />
  );
}
