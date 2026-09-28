"use client";

/**
 * Header save indicator for the Sheets and Slides editors (slides spec §7.3); props-based twin of the Docs
 * `SaveStatus`. Feed it `useDocSaveState(...)`. The "All changes saved" label fades after 3 s; the icon stays.
 */
import { AlertTriangle, CloudCheck, CloudOff, Loader2 } from "lucide-react";

import type { DocSaveState } from "@/components/docs/editor/use-save-state";
import { StatusBadge, STATUS_TONE_TEXT } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface FileSaveStatusProps {
  saveState: { state: DocSaveState; showLabel: boolean };
  /** Icon only (phone headers); the label stays available to screen readers and in the tooltip. */
  compact?: boolean;
}

export function FileSaveStatus({ saveState: { state, showLabel }, compact = false }: FileSaveStatusProps) {
  const t = useT();

  if (state === "readOnly") {
    return (
      <StatusBadge tone="neutral" size="xs" className="ms-1 shrink-0">
        {t("docs.editor.viewOnly")}
      </StatusBadge>
    );
  }

  const label = t(`docs.status.${state}`);
  const icon =
    state === "saved" ? (
      <CloudCheck className="h-3.5 w-3.5 shrink-0" />
    ) : state === "offline" ? (
      <CloudOff className={cn("h-3.5 w-3.5 shrink-0", STATUS_TONE_TEXT.warning)} />
    ) : state === "error" ? (
      <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", STATUS_TONE_TEXT.danger)} />
    ) : (
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
    );
  const labelVisible = !compact && showLabel;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="status"
            aria-live="polite"
            tabIndex={0}
            className="ms-1 inline-flex min-w-0 shrink items-center gap-1 rounded text-[11.5px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        {icon}
        <span
          aria-hidden={!labelVisible}
          className={cn(
            "truncate transition-[max-width,opacity] duration-500",
            labelVisible ? "max-w-[28ch] opacity-100" : "max-w-0 opacity-0",
          )}
        >
          {label}
        </span>
        {!labelVisible && <span className="sr-only">{label}</span>}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
