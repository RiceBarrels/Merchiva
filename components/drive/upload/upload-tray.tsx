"use client";

// The upload tray on the Drive manager page: every file in the tab's upload queue
// (lib/drive/upload-queue.ts) with its progress, and cancel / retry. It spans the width on phones
// and is w-80 from sm up, and shows only while the queue holds something. Closing it clears the
// finished entries (a failed upload's reserved row is released), so it cannot close while
// anything still runs; the queue itself asks before the page is left then.
//
// The tray is not `fixed`: inside the mobile browser shell the page sits in #mobile-content, a
// stacking context under the fixed bottom chrome, so a fixed tray would paint beneath it. The
// host renders it in the page's sticky bottom stack (with the phone selection bar), which sticks
// to the bottom of the page's own scroller, above the chrome and its safe area; from sm up the
// host aligns it to the end.

import { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DRIVE_ERROR_I18N_KEYS } from "@/lib/drive/errors";
import { fileKindOf } from "@/lib/drive/file-kinds";
import type { DriveUploadEntry, DriveUploadState } from "@/lib/drive/upload-queue";
import { useDriveUploads } from "@/lib/drive/use-drive-uploads";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { EntryIcon } from "@/components/drive/list/entry-icon";

const ACTIVE: ReadonlySet<DriveUploadState> = new Set<DriveUploadState>(["queued", "preparing", "uploading", "finalizing"]);

/** Percent of the original sent; finishing counts as complete. */
function percentOf(entry: DriveUploadEntry): number {
  if (entry.state === "done" || entry.state === "finalizing") return 100;
  if (entry.state !== "uploading" || entry.sizeBytes <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((entry.loaded / entry.sizeBytes) * 100)));
}

function statusText(entry: DriveUploadEntry, t: (key: string) => string): string {
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
      return t("drive.upload.done");
    case "cancelled":
      return t("drive.upload.canceled");
    case "failed":
      return entry.errorCode && entry.errorCode !== "generic" ? t(DRIVE_ERROR_I18N_KEYS[entry.errorCode]) : t("drive.upload.failed");
  }
}

function UploadRow({ entry, onCancel, onRetry }: { entry: DriveUploadEntry; onCancel(): void; onRetry(): void }) {
  const t = useT();
  const active = ACTIVE.has(entry.state);
  const failed = entry.state === "failed";
  const status = statusText(entry, t);
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <EntryIcon entry={{ type: "file", fileKind: fileKindOf("", entry.name) }} />
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-[13px] font-medium text-foreground" title={entry.name}>
          {entry.name}
        </p>
        {active ? (
          <Progress value={percentOf(entry)} aria-label={entry.name} getAriaValueText={() => status} className="mt-1 gap-1" />
        ) : null}
        <p className={cn("mt-0.5 truncate text-[11.5px] tabular-nums", failed ? "text-destructive" : "text-muted-foreground")}>
          {status}
        </p>
      </div>
      {active ? (
        <Button type="button" variant="ghost" size="icon-xs" aria-label={t("drive.upload.cancel")} title={t("drive.upload.cancel")} onClick={onCancel}>
          <X aria-hidden />
        </Button>
      ) : failed || entry.state === "cancelled" ? (
        <Button type="button" variant="ghost" size="icon-xs" aria-label={t("drive.upload.retry")} title={t("drive.upload.retry")} onClick={onRetry}>
          <RotateCcw aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}

export interface UploadTrayProps {
  /** Placement inside the host's bottom stack (e.g. `sm:self-end`). */
  className?: string;
}

export function UploadTray({ className }: UploadTrayProps) {
  const t = useT();
  const { entries, queue } = useDriveUploads();
  const [collapsed, setCollapsed] = useState(false);
  if (entries.length === 0) return null;

  const counted = entries.filter((entry) => entry.state !== "cancelled");
  const done = counted.filter((entry) => entry.state === "done").length;
  const running = entries.some((entry) => ACTIVE.has(entry.state));
  const finished = entries.some((entry) => !ACTIVE.has(entry.state));
  const title = fmt(t("drive.upload.trayTitle"), { done, total: counted.length });

  return (
    <section
      aria-label={title}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border bg-background shadow-md",
        "sm:w-80",
        className,
      )}
    >
      <header className="flex h-10 items-center gap-1 border-b border-border ps-3 pe-1.5">
        <h2 aria-live="polite" className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground tabular-nums">
          {title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("drive.upload.expand") : t("drive.upload.collapse")}
          title={collapsed ? t("drive.upload.expand") : t("drive.upload.collapse")}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("drive.upload.close")}
          title={running ? t("drive.upload.leaveWarning") : t("drive.upload.close")}
          disabled={running}
          onClick={() => queue.clearFinished()}
        >
          <X aria-hidden />
        </Button>
      </header>
      {!collapsed && (
        <>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto overscroll-contain">
            {entries.map((entry) => (
              <UploadRow key={entry.key} entry={entry} onCancel={() => queue.cancel(entry.key)} onRetry={() => queue.retry(entry.key)} />
            ))}
          </ul>
          <footer className="flex items-center gap-2 border-t border-border px-3 py-2">
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">{t("drive.disclosure.uploadNote")}</p>
            {running && finished ? (
              <Button type="button" variant="ghost" size="xs" onClick={() => queue.clearFinished()}>
                {t("drive.upload.clearFinished")}
              </Button>
            ) : null}
          </footer>
        </>
      )}
    </section>
  );
}
