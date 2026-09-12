"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hapticError, hapticLight, hapticSuccess } from "@/lib/haptics";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useDeviceName } from "@/lib/store-machine-mode";
import { AUTOLOCK_OPTIONS, useAutolockSeconds, setCurrentOperator, type AutolockSeconds } from "@/lib/store-device-lock";
import { clearAppMode } from "@/lib/app-mode";
import { DeviceDrawer, PinPad } from "@/components/device";
import { findManagerByPin, type StoreMember } from "./use-org-members";

export interface DeviceSettingsPanelProps {
  members: StoreMember[];
  className?: string;
}

export function DeviceSettingsPanel({ members, className }: DeviceSettingsPanelProps) {
  const t = useT();
  const [deviceName, setDeviceName] = useDeviceName();
  const [draftName, setDraftName] = useState(deviceName);
  const [autolock, setAutolock] = useAutolockSeconds();
  const [leaveOpen, setLeaveOpen] = useState(false);

  const autolockLabel = (s: AutolockSeconds) =>
    s === 0 ? t("storeDevice.never") : s < 60 ? `${s}s` : `${s / 60}m`;

  const commitName = () => {
    const next = draftName.trim().slice(0, 40);
    if (!next || next === deviceName) return;
    setDeviceName(next);
    toast.success(t("storeDevice.deviceNameSaved"));
  };

  const handleLeavePin = async (pin: string) => {
    if (!findManagerByPin(members, pin)) {
      hapticError();
      return false;
    }
    hapticSuccess();
    clearAppMode();
    setCurrentOperator(null);
    window.location.href = "/choose?switch=1";
    return true;
  };

  return (
    <div className={cn("overflow-y-auto px-6 py-5 space-y-6 max-w-[480px]", className)}>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("storeDevice.deviceName")}</Label>
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value.slice(0, 40))}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && commitName()}
          className="h-10"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("storeDevice.autoLock")}</Label>
        <SegmentedControl
          size="lg"
          fullWidth
          options={AUTOLOCK_OPTIONS.map((s) => ({ value: String(s), label: autolockLabel(s) }))}
          value={String(autolock)}
          onChange={(v) => { hapticLight(); setAutolock(Number(v) as AutolockSeconds); }}
          aria-label={t("storeDevice.autoLock")}
        />
        <p className="text-[11px] text-muted-foreground">{t("storeDevice.autoLockHint")}</p>
      </div>
      <div className="pt-2 border-t border-border">
        <Button variant="destructive" className="h-10 w-full mt-4" onClick={() => { hapticLight(); setLeaveOpen(true); }}>
          {t("storeDevice.leaveStoreMode")}
        </Button>
        <p className="text-[11px] text-muted-foreground mt-2">{t("storeDevice.leaveStoreModeHint")}</p>
      </div>
      <DeviceDrawer
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t("storeDevice.leaveStoreMode")}
        cancelLabel={t("storeDevice.cancel")}
        maxWidth={400}
      >
        <p className="text-center text-[13px] text-muted-foreground mb-3 leading-relaxed">{t("storeDevice.managerPinPrompt")}</p>
        <PinPad onComplete={handleLeavePin} />
      </DeviceDrawer>
    </div>
  );
}
