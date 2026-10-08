"use client";

// One file in the Drive lite app (drive-ui §14.4): a back row with its name, the preview the manager's sheet
// draws (images, video, audio, text and CSV; PDFs always open outside the app on the devices), then big buttons:
// "Save to phone", "Open as Doc / Sheet / Slides" for office files, and the rest of its actions. A link another
// app keeps is found through that app's source; a file that is gone says so.

import { ChevronLeft, Download, EllipsisVertical, FileX, FilePlusCorner } from "lucide-react";
import { LiteButton, LiteEmpty, LiteLoading, LiteRow, LiteScreen } from "@/components/device/apps/lite";
import { entrySizeText } from "@/components/drive/model/entry-size";
import { driveActionGroups } from "@/components/drive/model/actions";
import type { DriveEntry } from "@/components/drive/model/types";
import { openAsActionOf } from "@/components/drive/preview/open-entry";
import { PreviewBody } from "@/components/drive/preview/preview-body";
import { entryKindKey, entryLabel, isPreviewable } from "@/components/drive/preview/preview-mode";
import { useVirtualSources } from "@/components/drive/virtual/use-virtual-sources";
import { useI18n } from "@/lib/i18n/context";
import { useLiteDriveContext } from "./lite-context";
import { virtualSourceOfKey } from "./lite-state";

const OPEN_AS_LABEL = {
  doc: "device.lite.drive.openAsDoc",
  sheet: "device.lite.drive.openAsSheet",
  slides: "device.lite.drive.openAsSlides",
} as const;

export function LitePreview({ previewKey }: { previewKey: string }) {
  const { t, locale } = useI18n();
  const { drive, nav, panels, act } = useLiteDriveContext();
  const source = virtualSourceOfKey(previewKey);
  const virtual = useVirtualSources({ enabledSource: source, appFileSizes: drive.data.drive.appFileSizes });
  const entry: DriveEntry | null = source
    ? (virtual.entries.find((e) => e.key === previewKey) ?? null)
    : (drive.data.tree.byKey.get(previewKey) ?? null);
  const waiting = source ? !virtual.ready : drive.loading;

  if (!entry || !isPreviewable(entry)) {
    return (
      <LiteScreen>
        <LiteRow icon={ChevronLeft} title={t("common.back")} onClick={nav.pop} />
        {waiting ? <LiteLoading /> : <LiteEmpty icon={FileX} title={t("device.lite.drive.noPreview")} />}
      </LiteScreen>
    );
  }

  const available = driveActionGroups(entry, drive.ctx, drive.movesFor(entry)).flat();
  const openAs = openAsActionOf(available);
  const size = entrySizeText(entry, locale);
  const sub = size === null ? t(entryKindKey(entry)) : `${t(entryKindKey(entry))} · ${size}`;

  return (
    <LiteScreen>
      <LiteRow icon={ChevronLeft} title={<span dir="auto">{entryLabel(entry, t)}</span>} sub={sub} onClick={nav.pop} />
      <div className="flex h-[50vh] min-h-64 flex-col overflow-hidden rounded-lg border border-border bg-muted/30">
        <PreviewBody key={entry.key} entry={entry} inlinePdf={false} />
      </div>
      <div className="flex flex-col gap-2">
        {available.includes("download") && (
          <LiteButton icon={Download} label={t("device.lite.drive.download")} disabled={drive.busy} onClick={() => act(entry, "download")} />
        )}
        {openAs && (
          <LiteButton
            icon={FilePlusCorner}
            tone="outline"
            label={t(OPEN_AS_LABEL[openAs.kind])}
            busy={drive.busy}
            onClick={() => act(entry, openAs.action)}
          />
        )}
        <LiteButton icon={EllipsisVertical} tone="outline" label={t("device.lite.drive.actions")} onClick={() => panels.openActions(entry)} />
      </div>
    </LiteScreen>
  );
}
