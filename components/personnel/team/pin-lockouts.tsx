"use client";

// "Unlock PIN entry" on an owner's or manager's own card in the org inspector.
//
// Wrong punch PINs are rate limited per device and per store
// (spacetimedb/src/device/pin-guard.ts): a store tablet where people keep
// mistyping pauses PIN entry, and managers get a notification. This clears
// every count and pause of the store at once (`clearPinLockouts`, owner /
// manager only). QR log-in keeps working while PIN entry is paused.

import { useState } from "react";
import { toast } from "sonner";
import { LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/geometric";
import { usePermissions } from "@/lib/context/permissions";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { clearPinLockouts } from "@/lib/spacetimedb/actions/pin";

export function PinLockoutsButton() {
  const t = useT();
  const { role } = usePermissions();
  const [busy, setBusy] = useState(false);
  if (role !== "owner" && role !== "manager") return null;

  const unlock = async () => {
    setBusy(true);
    try {
      await clearPinLockouts();
      hapticSuccess();
      toast.success(t("pinLimit.cleared"));
    } catch (err) {
      hapticWarning();
      toast.error(err instanceof Error ? err.message : t("pinLimit.clearFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <span className="text-[10.5px] leading-snug text-muted-foreground">{t("pinLimit.clearHint")}</span>
      <Button variant="outline" size="sm" className="h-7 shrink-0 text-[12px]" onClick={unlock} disabled={busy}>
        {busy ? <Spinner size={14} /> : <LockOpen className="h-3.5 w-3.5" strokeWidth={1.75} />}
        {t("pinLimit.clear")}
      </Button>
    </div>
  );
}
