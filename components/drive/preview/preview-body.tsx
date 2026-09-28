"use client";

// The preview of one file, an uploaded one or a link another app keeps (drive-ui §8.4), used by
// the manager's preview sheet and the lite app's preview screen. It picks the renderer from
// entryPreviewMode, resolves the URL (a signed `view` or `stream` URL for uploaded files, the
// stored link otherwise), gives a failed image or media element one more try with a fresh
// signed URL, and shows NoPreview with "Open" whenever nothing can be drawn here.
//
// Rights are the entry's: nothing is fetched for an entry the person can't open, and Download /
// "Open as …" appear only when the entry's actions list them.

import { useState, type ReactNode } from "react";
import { Sheet as SheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DriveUrlPurpose } from "@/lib/drive/api";
import { readPreviewEnv } from "@/lib/drive/file-kinds";
import { driveUrlPurposeFor } from "@/lib/drive/preview";
import { useDriveUrl } from "@/lib/drive/use-drive-url";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { ImagePreview } from "./image-preview";
import { MediaPreview } from "./media-preview";
import { NoPreview, PreviewCard } from "./no-preview";
import { OfficePreview } from "./office-preview";
import { usePreviewLoader, useOpenOutside, type PreviewEntryActions } from "./open-entry";
import { PdfPreview } from "./pdf-preview";
import { PreviewLoading } from "./preview-loading";
import { entryLabel, entryPreviewKind, entryPreviewMode, type PreviewableEntry } from "./preview-mode";
import { attemptAfterError, attemptFor, type PreviewAttempt } from "./preview-state";
import { CsvPreview, TextPreview } from "./text-preview";

export interface PreviewBodyProps {
  entry: PreviewableEntry;
  /** The entry's actions; without them the body offers only "Open". */
  actions?: PreviewEntryActions | null;
  /** false: PDFs always open outside (the lite apps). Default: inline where the device's browser can show them. */
  inlinePdf?: boolean;
  className?: string;
}

interface UrlGateProps {
  entry: PreviewableEntry;
  purpose: DriveUrlPurpose;
  /** No URL for this person (not visible, not ready) or the signing failed. */
  fallback: ReactNode;
  children(url: string): ReactNode;
}

/** The URL to draw from: signed for an uploaded file (loading until it arrives), the stored link otherwise. */
function UrlGate({ entry, purpose, fallback, children }: UrlGateProps) {
  const signed = useDriveUrl(entry.type === "file" ? entry.id : null, "original", purpose);
  if (entry.type === "virtual") return <>{children(entry.url)}</>;
  if (signed.loading) return <PreviewLoading className="h-full w-full" />;
  return <>{signed.url ? children(signed.url) : fallback}</>;
}

export function PreviewBody({ entry, actions = null, inlinePdf = true, className }: PreviewBodyProps) {
  const { t } = useI18n();
  const [env] = useState(readPreviewEnv);
  const loader = usePreviewLoader();
  const openOutside = useOpenOutside();
  const [attempt, setAttempt] = useState<PreviewAttempt>({ key: entry.key, retried: false, failed: false });
  const current = attemptFor(attempt, entry.key);

  const onOpen = entry.access.canOpen ? () => openOutside(entry) : undefined;
  const fallback = (message?: string) => <NoPreview entry={entry} message={message} onOpen={onOpen} actions={actions} />;
  const failed = fallback(t("drive.preview.failed"));

  /** An <img> / <video> / <audio> failed: once more with a newly signed URL (it may have expired), then give up. */
  const onMediaError = () => {
    const after = attemptAfterError(current, entry.type === "file");
    if (after.invalidate) loader.invalidate(entry.id);
    setAttempt(after.attempt);
  };

  let content: ReactNode;
  if (entry.type === "file" && entry.uploading !== null) {
    content = <PreviewCard entry={entry} message={t(entry.uploading === "local" ? "drive.list.uploading" : "drive.list.uploadingElsewhere")} />;
  } else if (!entry.access.canOpen) {
    content = fallback();
  } else if (current.failed) {
    content = failed;
  } else {
    const mode = entryPreviewMode(entry, env, { inlinePdf });
    const purpose = driveUrlPurposeFor(entryPreviewKind(entry));
    // Remounted for the retry, so the signed URL is asked for again after the loader forgot it.
    const gateKey = `${entry.key}:${current.retried ? 1 : 0}`;
    switch (mode) {
      case "image":
        content = (
          <UrlGate key={gateKey} entry={entry} purpose={purpose} fallback={failed}>
            {(url) => <ImagePreview url={url} name={entry.name} onError={onMediaError} />}
          </UrlGate>
        );
        break;
      case "video":
      case "audio":
        content = (
          <UrlGate key={gateKey} entry={entry} purpose={purpose} fallback={failed}>
            {(url) => <MediaPreview kind={mode} url={url} name={entry.name} onError={onMediaError} />}
          </UrlGate>
        );
        break;
      case "text":
        content = (
          <UrlGate key={gateKey} entry={entry} purpose={purpose} fallback={failed}>
            {(url) => <TextPreview url={url} fallback={failed} label={entryLabel(entry, t)} />}
          </UrlGate>
        );
        break;
      case "csv": {
        const openAsSheet = actions?.available.includes("openAsSheet") ? (
          <Button type="button" size="sm" variant="outline" disabled={!!actions.running} onClick={() => actions.onAction("openAsSheet")}>
            <SheetIcon aria-hidden />
            {actions.running === "openAsSheet" ? t("drive.preview.importing") : t("drive.menu.openAsSheet")}
          </Button>
        ) : null;
        content = (
          <UrlGate key={gateKey} entry={entry} purpose={purpose} fallback={failed}>
            {(url) => (
              <CsvPreview url={url} file={{ mimeType: entry.mimeType, name: entry.name }} fallback={failed} label={entryLabel(entry, t)} toolbar={openAsSheet} />
            )}
          </UrlGate>
        );
        break;
      }
      case "pdf":
        content = <PdfPreview key={entry.key} entry={entry} loader={loader} fallback={failed} />;
        break;
      case "pdfExternal":
        content = fallback(t("drive.preview.pdfExternal"));
        break;
      case "office":
        content = <OfficePreview entry={entry} actions={actions} />;
        break;
      case "none":
        content = fallback();
        break;
    }
  }

  return (
    <div className={cn("relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden", className)}>
      {content}
    </div>
  );
}
