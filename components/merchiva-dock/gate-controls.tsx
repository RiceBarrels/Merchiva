"use client";

// The autonomy gate's marks on a Mr. Merchiva card: the "No permission" /
// "Needs your OK" badge in its header and the Confirm / Cancel bar under a
// proposal. Shared by the action card and the role and task cards.

import { AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { STATUS_TONE_CLASSES } from "@/components/ui/status-badge";
import type { GateDecision } from "@/lib/merchiva/autonomy";

/** "No permission" for a denied item, "Needs your OK" for a proposed one; nothing for "auto". */
export function GateBadge({ decision, warn }: { decision: GateDecision; warn?: boolean }) {
  const t = useT();
  if (decision === "deny") {
    return (
      <span className="text-[10px] font-mono text-muted-foreground inline-flex items-center gap-1">
        <X className="h-3 w-3" /> {t("merchiva.ui.noPermission")}
      </span>
    );
  }
  if (decision === "propose") {
    return (
      <span className={cn("text-[10px] font-mono inline-flex items-center gap-1", warn ? "text-amber-600" : "text-muted-foreground")}>
        <AlertTriangle className="h-3 w-3" /> {t("merchiva.ui.needsApproval")}
      </span>
    );
  }
  return null;
}

/** Confirm / Cancel under a proposal. */
export function ApproveBar({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onApprove}
        className={cn(STATUS_TONE_CLASSES.success, "px-3 font-semibold hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900")}
      >
        <Check className="h-3 w-3" /> {t("merchiva.ui.confirmExecute")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onReject}
        className="px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3 w-3" /> {t("merchiva.ui.cancel")}
      </Button>
    </div>
  );
}
