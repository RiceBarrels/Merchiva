"use client";

// The lite app's storage block at the bottom of Drive home: how much of the store's storage is used (everything
// the store keeps, against its quota; amber from 90%, red once full) and what it is made of, one row per part.
// Lite primitives only. Renders nothing until the usage has loaded (displayUsage).

import { File, FileText, HardDrive, LayoutGrid, Sheet, type LucideIcon } from "lucide-react";
import { LiteRow, LiteSection, LiteStat } from "@/components/device/apps/lite";
import { storageBreakdownRows, type StorageBreakdownPart } from "@/components/drive/model/storage-breakdown";
import { storageFigures } from "@/components/drive/nav/storage-meter";
import { formatDriveBytes } from "@/lib/drive/format";
import type { DriveUsageView } from "@/lib/drive/types";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

const PART_ICONS: Readonly<Record<StorageBreakdownPart, LucideIcon>> = {
  files: File,
  documents: FileText,
  sheets: Sheet,
  apps: LayoutGrid,
};

export function LiteStorage({ usage }: { usage: DriveUsageView | null }) {
  const { t, locale } = useI18n();
  if (!usage) return null;
  const { used, total, level } = storageFigures(usage);
  const usedText = formatDriveBytes(used, locale);
  const line = total > 0
    ? fmt(t("device.lite.drive.storage"), { used: usedText, total: formatDriveBytes(total, locale) })
    : fmt(t("device.lite.drive.storageNoQuota"), { used: usedText });
  const label = level === "full" ? t("drive.storage.full") : level === "warning" ? t("drive.storage.almostFull") : t("drive.storage.label");
  return (
    <div data-lite-storage={level} className="flex flex-col gap-2">
      <LiteStat
        icon={HardDrive}
        label={label}
        value={<span className="font-mono tabular-nums">{usedText}</span>}
        sub={line}
        tone={level === "full" ? "destructive" : level === "warning" ? "warning" : "default"}
      />
      <LiteSection title={t("drive.storage.breakdown.title")}>
        <div data-lite-list="storage" className="flex flex-col gap-2">
          {storageBreakdownRows(usage).map((row) => (
            <LiteRow key={row.part} icon={PART_ICONS[row.part]} title={t(row.labelKey)} right={row.bytes === null ? "—" : formatDriveBytes(row.bytes, locale)} />
          ))}
        </div>
      </LiteSection>
    </div>
  );
}
