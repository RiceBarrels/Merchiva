"use client";

// How much of the store's Drive storage is used: "{used} of {total} used" and a bar, amber
// from 90% and red once full. Used counts the pending uploads too (their bytes are reserved
// against the quota). The total is the org's effective quota (support override, else the
// default; lib/drive/rules.ts effectiveQuotaBytes, applied by toDriveUsageView), which is
// never 0 — the "no quota" line is only a guard. Docs, Sheets and Slides don't count, which
// the tooltip says. Nothing renders until the usage row has loaded.

import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { STATUS_TONE_TEXT } from "@/components/ui/status-badge";
import { formatDriveBytes } from "@/lib/drive/format";
import type { DriveUsageView } from "@/lib/drive/types";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

export { STORAGE_WARN_RATIO, displayUsage, storageFigures, type StorageFigures, type StorageLevel } from "@/lib/drive/storage-figures";
import { storageFigures, type StorageLevel } from "@/lib/drive/storage-figures";

const INDICATOR_TONE: Readonly<Record<StorageLevel, string | undefined>> = {
  ok: undefined,
  warning: "[&_[data-slot=progress-indicator]]:bg-amber-500",
  full: "[&_[data-slot=progress-indicator]]:bg-destructive",
};

export interface StorageMeterProps {
  /** useDrive().usage; null while it loads (the meter renders nothing). */
  usage: DriveUsageView | null;
  /** One line (phones, device panels): no eyebrow. */
  compact?: boolean;
  className?: string;
}

export function StorageMeter({ usage, compact = false, className }: StorageMeterProps) {
  const { t, locale } = useI18n();
  if (!usage) return null;
  const { used, total, percent, level } = storageFigures(usage);
  const usedText = formatDriveBytes(used, locale);
  const label =
    percent === null
      ? fmt(t("drive.storage.usedNoQuota"), { used: usedText })
      : fmt(t("drive.storage.used"), { used: usedText, total: formatDriveBytes(total, locale) });
  const status = level === "full" ? t("drive.storage.full") : level === "warning" ? t("drive.storage.almostFull") : null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            tabIndex={0}
            className={cn("block rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50", compact ? "space-y-1" : "space-y-1.5", className)}
          />
        }
      >
        {!compact && <Eyebrow as="h3">{t("drive.storage.label")}</Eyebrow>}
        {percent !== null && (
          <Progress value={percent} aria-label={t("drive.storage.label")} getAriaValueText={() => label} className={cn("gap-0", INDICATOR_TONE[level])} />
        )}
        <p className="font-mono text-[11.5px] text-muted-foreground tabular-nums">{label}</p>
        {status && (
          <p role="status" className={cn("text-[11.5px] font-medium", STATUS_TONE_TEXT[level === "full" ? "danger" : "warning"])}>
            {status}
          </p>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{t("drive.storage.excludesDocs")}</TooltipContent>
    </Tooltip>
  );
}
