"use client";

import { useT } from "@/lib/i18n/context";
import { PunchInPrompt } from "@/components/device/punch-in-prompt";
import type { StoreMember } from "./use-org-members";

export interface PunchPromptProps {
  /** Member who just logged in and is not punched in; null hides the prompt. */
  member: StoreMember | null;
  /** PIN they logged in with; null after a QR log-in. The punch goes through
   *  `recordOperatorPunch` (the tablet's resolved operator), never this PIN. */
  code: string | null;
  onDone: () => void;
}

/** Asked right after a store-device log-in when the operator isn't punched in. */
export function PunchPrompt({ member, code, onDone }: PunchPromptProps) {
  const t = useT();
  return (
    <PunchInPrompt
      open={!!member}
      code={code}
      name={member?.displayName}
      onDone={onDone}
      labels={{
        title: t("storeDevice.punchPromptTitle"),
        body: t("storeDevice.punchPromptBody"),
        yes: t("storeDevice.punchYes"),
        no: t("storeDevice.punchNo"),
        punchedIn: t("storeDevice.punchedIn"),
        failed: t("storeDevice.punchFailed"),
      }}
    />
  );
}
