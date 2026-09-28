"use client";

// The person's uploads on the Drive lite home (drive-ui §14.3): one row per file with how far it got, "Stop"
// while it runs and "Try again" when it failed. A failure because the tablet's PIN session is gone offers
// "Log in again" instead. Once nothing runs, "Done" clears the list. Only this person's uploads show (the queue
// is the tab's, and the store tablet is shared).

import { Check, LogIn, RotateCcw, X, type LucideIcon } from "lucide-react";
import { LiteSection, LiteRow } from "@/components/device/apps/lite";
import { fileKindIcon } from "@/components/drive/list/entry-icon";
import { DRIVE_ERROR_I18N_KEYS } from "@/lib/drive/errors";
import { fileKindOf } from "@/lib/drive/file-kinds";
import type { DriveUploadEntry, DriveUploadState } from "@/lib/drive/upload-queue";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useLiteDriveContext } from "./lite-context";

const ACTIVE: ReadonlySet<DriveUploadState> = new Set<DriveUploadState>(["queued", "preparing", "uploading", "finalizing"]);

function percentOf(entry: DriveUploadEntry): number {
  if (entry.state === "done" || entry.state === "finalizing") return 100;
  if (entry.state !== "uploading" || entry.sizeBytes <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((entry.loaded / entry.sizeBytes) * 100)));
}

/** What a row says under the file's name. */
export function liteUploadStatus(entry: DriveUploadEntry, t: (key: string) => string): string {
  switch (entry.state) {
    case "queued":
      return t("drive.upload.queued");
    case "preparing":
      return t("drive.upload.preparing");
    case "uploading":
      return fmt(t("drive.upload.progress"), { percent: percentOf(entry) });
    case "finalizing":
      return t("drive.upload.finishing");
    case "done":
      return t("device.lite.drive.saved");
    case "cancelled":
      return t("drive.upload.canceled");
    case "failed":
      return entry.errorCode && entry.errorCode !== "generic" ? t(DRIVE_ERROR_I18N_KEYS[entry.errorCode]) : t("device.lite.drive.failed");
  }
}

function RowButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticLight();
        onClick();
      }}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 font-sans text-[14px] font-medium active:bg-muted"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

export function LiteUploads() {
  const t = useT();
  const { drive } = useLiteDriveContext();
  const { uploads, queue, relogin } = drive;
  if (uploads.length === 0) return null;

  const counted = uploads.filter((entry) => entry.state !== "cancelled");
  const active = uploads.filter((entry) => ACTIVE.has(entry.state)).length;
  const done = counted.filter((entry) => entry.state === "done").length;
  const title = active > 0 ? fmt(t("device.lite.drive.uploading"), { count: active }) : fmt(t("drive.upload.trayTitle"), { done, total: counted.length });

  return (
    <LiteSection
      title={title}
      right={active === 0 ? <RowButton icon={Check} label={t("common.done")} onClick={() => queue.clearFinished()} /> : undefined}
    >
      <div aria-live="polite" className="flex flex-col gap-2">
        {uploads.map((entry) => {
          const running = ACTIVE.has(entry.state);
          const operator = entry.state === "failed" && entry.errorCode === "operator" && relogin !== null;
          const action = running ? (
            <RowButton icon={X} label={t("device.lite.drive.cancel")} onClick={() => queue.cancel(entry.key)} />
          ) : operator && relogin ? (
            <RowButton icon={LogIn} label={t("device.lite.drive.relogin")} onClick={relogin} />
          ) : entry.state === "failed" || entry.state === "cancelled" ? (
            <RowButton icon={RotateCcw} label={t("device.lite.drive.retry")} onClick={() => queue.retry(entry.key)} />
          ) : undefined;
          return (
            <LiteRow
              key={entry.key}
              icon={fileKindIcon(fileKindOf("", entry.name))}
              iconTone={entry.state === "done" ? "success" : entry.state === "failed" ? "destructive" : "muted"}
              title={<span dir="auto">{entry.name}</span>}
              sub={<span className="tabular-nums">{liteUploadStatus(entry, t)}</span>}
              right={action}
            />
          );
        })}
      </div>
    </LiteSection>
  );
}
