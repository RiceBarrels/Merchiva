"use client";

import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { clearAppMode } from "@/lib/app-mode";
import { setCurrentOperator } from "@/lib/store-device-lock";
import { DeviceDrawer, PinPad } from "@/components/device";
import { attemptManagerPin } from "@/lib/spacetimedb/actions/pin";
import { pinNotice } from "@/lib/pin-attempt";
import { fmt } from "@/lib/i18n/fmt";

/**
 * Drops this device out of store mode: forgets the app mode + operator and
 * returns to the chooser. Callers must have verified a manager PIN first.
 */
export function leaveStoreMode() {
  clearAppMode();
  setCurrentOperator(null);
  window.location.href = "/choose?switch=1";
}

export interface ExitStoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cancelLabel?: string;
  onCancel?: () => void;
}

/** Manager-PIN gate in front of `leaveStoreMode()`. The PIN is checked by the
 *  `verifyManagerPinAttempt` reducer — the tablet cannot read anyone's code. */
export function ExitStoreDrawer({ open, onOpenChange, cancelLabel, onCancel }: ExitStoreDrawerProps) {
  const t = useT();

  const handlePin = async (pin: string) => {
    // Rate limited: a wrong PIN is counted, so the answer is a row, not a throw.
    const answer = await attemptManagerPin(pin);
    if (answer.outcome !== "ok") {
      hapticError();
      const notice = pinNotice(answer);
      if (notice) toast.error(fmt(t(notice.key), notice.vars));
      return false;
    }
    hapticSuccess();
    toast(t("storeDevice.leaveStoreMode"));
    onOpenChange(false);
    setTimeout(leaveStoreMode, 250);
    return true;
  };

  return (
    <DeviceDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={t("storeDevice.leaveStoreMode")}
      cancelLabel={cancelLabel ?? t("storeDevice.cancel")}
      onCancel={onCancel}
      maxWidth={400}
    >
      <p className="text-center text-[13px] text-muted-foreground mb-3 leading-relaxed">{t("storeDevice.leaveStoreModePinPrompt")}</p>
      <PinPad onComplete={handlePin} />
    </DeviceDrawer>
  );
}
