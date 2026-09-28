"use client";

// Word-processor, spreadsheet and presentation files: Drive does not draw them, but opens a copy
// in its own editor ("Open as Doc / Sheet / Slides", which creates a new document and leaves the
// original here). The offer comes from the entry's actions only, so it is absent where the
// module would refuse it, offline, or for a Doc while the Docs app is not installed.

import { FilePlusCorner } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { PreviewCard, PreviewDownloadButton } from "./no-preview";
import { openAsActionOf, type PreviewEntryActions } from "./open-entry";
import type { PreviewableEntry } from "./preview-mode";

export interface OfficePreviewProps {
  entry: PreviewableEntry;
  actions?: PreviewEntryActions | null;
  className?: string;
}

const OPEN_AS_LABEL = { doc: "drive.menu.openAsDoc", sheet: "drive.menu.openAsSheet", slides: "drive.menu.openAsSlides" } as const;

export function OfficePreview({ entry, actions, className }: OfficePreviewProps) {
  const { t } = useI18n();
  const openAs = actions ? openAsActionOf(actions.available) : null;
  if (!actions || !openAs) {
    return (
      <PreviewCard entry={entry} message={t("drive.preview.noPreview")} className={className}>
        <PreviewDownloadButton actions={actions} variant="default" />
      </PreviewCard>
    );
  }
  return (
    <PreviewCard entry={entry} message={fmt(t("drive.preview.officeHint"), { kind: t(`drive.kind.${openAs.kind}`) })} className={className}>
      <Button type="button" disabled={!!actions.running} onClick={() => actions.onAction(openAs.action)}>
        <FilePlusCorner aria-hidden />
        {actions.running === openAs.action ? t("drive.preview.importing") : t(OPEN_AS_LABEL[openAs.kind])}
      </Button>
      <PreviewDownloadButton actions={actions} />
    </PreviewCard>
  );
}
