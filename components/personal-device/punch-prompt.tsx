"use client";

import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { PunchInPrompt } from "@/components/device/punch-in-prompt";
import { ScanPane } from "./scan-pane";

export interface PersonalPunchPromptProps {
  open: boolean;
  organizationId: string;
  myCode: string | null;
  onDone: () => void;
  onSkip: () => void;
}

/**
 * Asked when the phone is unlocked while the member is off shift. "Yes" opens
 * the camera: the punch is only recorded once the store device's QR is
 * scanned (approveDeviceLogin with the punch-in intent).
 */
export function PersonalPunchPrompt({ open, organizationId, myCode, onDone, onSkip }: PersonalPunchPromptProps) {
  const t = useT();
  return (
    <PunchInPrompt
      open={open}
      code={myCode}
      onDone={onDone}
      onSkip={onSkip}
      maxWidth={480}
      scan={{
        title: t("personalDevice.scan.titleIn"),
        render: (done) => (
          <div className="space-y-3 pb-1">
            <p className="text-[13px] text-muted-foreground leading-relaxed">{t("personalDevice.scan.holdUp")}</p>
            <ScanPane
              active
              organizationId={organizationId}
              intent="punch-in"
              onDone={() => { toast.success(t("personalDevice.scan.punchedIn")); done(); }}
            />
          </div>
        ),
      }}
      labels={{
        title: t("personalDevice.punchPrompt.title"),
        body: t("personalDevice.punchPrompt.body"),
        yes: t("personalDevice.punchPrompt.yes"),
        no: t("personalDevice.punchPrompt.no"),
        punchedIn: t("personalDevice.punch.punchedIn"),
        failed: t("personalDevice.punch.failed"),
      }}
    />
  );
}
