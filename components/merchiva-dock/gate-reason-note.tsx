"use client";

import { useCurrency } from "@/lib/currency";
import { useT } from "@/lib/i18n/context";
import { gateReasonLabel, type GateReason } from "@/lib/merchiva/autonomy-reason";

/**
 * Why the autonomy gate held an action for approval, under its card, in the
 * viewer's language. `reason` is the English text stored on history saved
 * before `why` existed; it is shown only when there is no `why` to translate.
 */
export function GateReasonNote({ why, reason }: { why?: GateReason; reason?: string }) {
  const t = useT();
  const { format } = useCurrency();
  const text = (why && gateReasonLabel(why, t, format)) || reason;
  if (!text) return null;
  return <p className="text-[10.5px] text-muted-foreground mb-2">{text}</p>;
}
