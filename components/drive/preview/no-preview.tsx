"use client";

// The card a preview shows when the file isn't drawn here: its icon, name and size, a line
// saying why, and what can be done instead ("Open" outside the app, Download). OfficePreview
// uses the same card.

import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntryIcon } from "@/components/drive/list/entry-icon";
import { formatDriveBytes } from "@/lib/drive/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { PreviewEntryActions } from "./open-entry";
import type { PreviewableEntry } from "./preview-mode";

export interface PreviewCardProps {
  entry: PreviewableEntry;
  message: string;
  className?: string;
  /** The buttons. */
  children?: React.ReactNode;
}

export function PreviewCard({ entry, message, className, children }: PreviewCardProps) {
  const { locale } = useI18n();
  return (
    <div className={cn("flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center", className)}>
      <EntryIcon entry={entry} className="h-10 w-10" />
      <div className="min-w-0 max-w-full space-y-1">
        <p dir="auto" className="truncate text-sm font-medium text-foreground">{entry.name}</p>
        {entry.type === "file" && (
          <p className="font-mono text-xs tabular-nums text-muted-foreground">{formatDriveBytes(entry.sizeBytes, locale)}</p>
        )}
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {children && <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

/** Download, when the entry's actions offer it. */
export function PreviewDownloadButton({ actions, variant = "outline" }: { actions?: PreviewEntryActions | null; variant?: "outline" | "default" }) {
  const { t } = useI18n();
  if (!actions?.available.includes("download")) return null;
  return (
    <Button type="button" variant={variant} disabled={!!actions.running} onClick={() => actions.onAction("download")}>
      <Download aria-hidden />
      {t("drive.preview.download")}
    </Button>
  );
}

export interface NoPreviewProps {
  entry: PreviewableEntry;
  /** Why nothing shows; default drive.preview.noPreview. */
  message?: string;
  /** "Open": the file outside the app, started from the click. Omitted when it can't be opened. */
  onOpen?: () => void;
  actions?: PreviewEntryActions | null;
  className?: string;
}

export function NoPreview({ entry, message, onOpen, actions, className }: NoPreviewProps) {
  const { t } = useI18n();
  return (
    <PreviewCard entry={entry} message={message ?? t("drive.preview.noPreview")} className={className}>
      {onOpen && (
        <Button type="button" variant="outline" onClick={onOpen}>
          <ExternalLink aria-hidden />
          {t("drive.preview.open")}
        </Button>
      )}
      <PreviewDownloadButton actions={actions} variant={onOpen ? "outline" : "default"} />
    </PreviewCard>
  );
}
