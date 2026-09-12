"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { hapticLight, hapticSuccess, hapticWarning } from "@/lib/haptics";
import { recordPunch } from "@/lib/spacetimedb/actions";
import { Button } from "@/components/ui/button";
import { DeviceDrawer } from "@/components/device";
import type { StoreMember } from "./use-org-members";

export interface PunchPromptProps {
  /** Member who just logged in and is not punched in; null hides the prompt. */
  member: StoreMember | null;
  onDone: () => void;
}

/**
 * Asked right after a store-device log-in when the operator isn't punched
 * in: "Punch in now?" with Yes highlighted. "No" shows a second warning
 * before letting them continue without a punch.
 */
export function PunchPrompt({ member, onDone }: PunchPromptProps) {
  const t = useT();
  const [pane, setPane] = useState<"ask" | "warn">("ask");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) setPane("ask");
  }, [member]);

  const punchIn = async () => {
    if (!member?.punchInCode || busy) return;
    setBusy(true);
    try {
      await recordPunch(member.punchInCode, "in");
      hapticSuccess();
      toast.success(`${t("storeDevice.punchedIn")} · ${member.displayName}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("storeDevice.punchFailed"));
    } finally {
      setBusy(false);
    }
  };

  const decline = () => {
    hapticWarning();
    setPane("warn");
  };

  const skip = () => {
    hapticLight();
    onDone();
  };

  if (pane === "warn") {
    return (
      <DeviceDrawer
        open={!!member}
        onOpenChange={(o) => { if (!o) skip(); }}
        title={t("storeDevice.punchWarnTitle")}
        cancelLabel={t("storeDevice.punchWarnContinue")}
        onCancel={skip}
        maxWidth={400}
      >
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 mb-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{t("storeDevice.punchWarnBody")}</p>
        </div>
        <Button type="button" onClick={punchIn} disabled={busy} className="h-11 w-full text-[14px] gap-2">
          <Clock className="h-4 w-4" />
          {t("storeDevice.punchYes")}
        </Button>
      </DeviceDrawer>
    );
  }

  return (
    <DeviceDrawer
      open={!!member}
      onOpenChange={(o) => { if (!o) decline(); }}
      title={t("storeDevice.punchPromptTitle")}
      cancelLabel={t("storeDevice.punchNo")}
      onCancel={decline}
      maxWidth={400}
    >
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">{t("storeDevice.punchPromptBody")}</p>
      <Button type="button" autoFocus onClick={punchIn} disabled={busy} className="h-11 w-full text-[14px] gap-2">
        <Clock className="h-4 w-4" />
        {t("storeDevice.punchYes")}
      </Button>
    </DeviceDrawer>
  );
}
