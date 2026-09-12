"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { QrScanner } from "@/components/device";
import { approveDeviceLogin, type DeviceLoginIntent } from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** Parses `merchiva://device-login?org=<orgId>&nonce=<nonce>`. */
export function parseDeviceLoginQr(text: string): { org: string; nonce: string } | null {
  const m = text.trim().match(/^merchiva:\/\/device-login\?(.*)$/i);
  if (!m) return null;
  const params = new URLSearchParams(m[1]);
  const org = params.get("org");
  const nonce = params.get("nonce");
  if (!org || !nonce) return null;
  return { org, nonce };
}

/**
 * Camera pane that scans a store-device QR and approves it with the given
 * intent (log in on that device, or punch in / out as the caller).
 */
export function ScanPane({
  active,
  organizationId,
  intent,
  hint,
  onDone,
  className,
}: {
  active: boolean;
  organizationId: string;
  intent: DeviceLoginIntent;
  hint?: string;
  /** Called ~0.9 s after a successful approval. */
  onDone: () => void;
  className?: string;
}) {
  const t = useT();
  const [success, setSuccess] = useState(false);
  const busyRef = useRef(false);
  const lastRejected = useRef<string | null>(null);

  const handleResult = useCallback(
    async (text: string) => {
      if (busyRef.current || success) return;
      const parsed = parseDeviceLoginQr(text);
      if (!parsed) {
        if (lastRejected.current !== text) { lastRejected.current = text; toast.error(t("personalDevice.scan.notMerchiva")); }
        return;
      }
      if (parsed.org !== organizationId) {
        if (lastRejected.current !== text) { lastRejected.current = text; hapticError(); toast.error(t("personalDevice.scan.wrongStore")); }
        return;
      }
      busyRef.current = true;
      try {
        await approveDeviceLogin(parsed.nonce, intent);
        hapticSuccess();
        setSuccess(true);
        setTimeout(() => { setSuccess(false); busyRef.current = false; onDone(); }, 900);
      } catch (err) {
        hapticError();
        toast.error(err instanceof Error ? err.message : t("personalDevice.scan.failed"));
        busyRef.current = false;
      }
    },
    [organizationId, intent, onDone, success, t],
  );

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <QrScanner
        active={active}
        onResult={handleResult}
        onError={(m) => toast.error(m)}
        success={success}
        successText={t("personalDevice.scan.verified")}
        hint={hint ?? t("personalDevice.scan.pointAt")}
        size={200}
      />
    </div>
  );
}
