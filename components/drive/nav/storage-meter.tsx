"use client";

// How much of the store's Drive storage is used: "{used} of {total} used" and a bar, amber
// from 90% and red once full. Used counts the pending uploads too (their bytes are reserved
// against the quota). The total is the org's effective quota (support override, else the
// default; lib/drive/rules.ts effectiveQuotaBytes, applied by toDriveUsageView), which is
// never 0 — the "no quota" line is only a guard. Used is everything the store keeps — uploads,
// Docs, Slides and Forms, Sheets and files in other apps (StorageBreakdown.total) — which the
// popover says and breaks down. A popover, not a tooltip: it opens on hover, but also on a tap
// (touch screens) and on Enter / Space (a role=button trigger, a labelled dialog that screen
// readers reach). Parts the module does not measure read "—", and then the popover does not
// claim to cover everything. Nothing renders until the usage row has loaded.

import { storageBreakdownComplete, storageBreakdownRows } from "@/components/drive/model/storage-breakdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
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
  const rows = storageBreakdownRows(usage);

  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        openOnHover
        render={
          <div
            className={cn(
              "block cursor-default rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              compact ? "space-y-1" : "space-y-1.5",
              className,
            )}
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
      </PopoverTrigger>
      <PopoverContent side="top" aria-label={t("drive.storage.breakdown.title")} className="max-w-72 p-2.5 text-[12px]">
        <div data-drive-storage-breakdown className="space-y-1.5">
          {storageBreakdownComplete(rows) && <p className="text-muted-foreground">{t("drive.storage.includesEverything")}</p>}
          <p className="font-medium">{t("drive.storage.breakdown.title")}</p>
          <dl className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-0.5">
            {rows.map((row) => (
              <div key={row.part} className="contents">
                <dt className="truncate">{t(row.labelKey)}</dt>
                <dd className="text-end font-mono tabular-nums">{row.bytes === null ? "—" : formatDriveBytes(row.bytes, locale)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </PopoverContent>
    </Popover>
  );
}
