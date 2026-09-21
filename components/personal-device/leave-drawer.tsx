"use client";

import { DoorOpen, MoonStar } from "lucide-react";
import { DeviceDrawer, type DeviceDrawerOption } from "@/components/device";
import { useT } from "@/lib/i18n/context";
import { hapticLight } from "@/lib/haptics";
import { clearAppMode } from "@/lib/app-mode";

/**
 * Bottom-left "Leave" sheet. Punching (in / out / breaks) and the store-device
 * QR log-in are deliberately not here — they live in the Punch in app. Neither
 * is a shortcut into the manager UI: leaving personal mode is the way there.
 */
export function LeaveDrawer({
  open,
  onOpenChange,
  onLock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
