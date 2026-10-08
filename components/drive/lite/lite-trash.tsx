"use client";

// Trash in the Drive lite app (drive-ui §14.4): what the person deleted, newest first — only what they may put
// back (trash roots they manage, never another member's or the tablet account's), each opening its actions
// ("Put back", "Delete forever", a look at a file). The retention note says what goes away on its own.

import { useMemo } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { LiteEmpty, LiteLoading, LiteRow, LiteScreen } from "@/components/device/apps/lite";
import { useMinuteClock } from "@/components/docs/home/format";
import { listDriveEntries, sortDriveEntries } from "@/components/drive/model/listing";
import { entryLabel } from "@/components/drive/preview/preview-mode";
import { useI18n } from "@/lib/i18n/context";
import { useLiteDriveContext } from "./lite-context";
import { LiteEntryRow } from "./lite-entry-row";
import { liteEntrySub, untitledLabels } from "./lite-labels";

export function LiteTrash() {
  const { t, locale } = useI18n();
  const { drive, nav, panels } = useLiteDriveContext();
  const now = useMinuteClock();
  const { tree, listingActor } = drive.data;

  const entries = useMemo(() => {
    const listing = listDriveEntries(
      tree,
      { section: "trash", folderId: "", memberId: "", source: "", type: "all", q: "", locale, untitled: untitledLabels(t) },
      listingActor,
    );
    return sortDriveEntries(listing.entries, "modified", "trash", locale);
  }, [tree, listingActor, locale, t]);

  return (
    <LiteScreen>
      <LiteRow icon={ChevronLeft} title={t("device.lite.drive.trash")} onClick={nav.pop} />
      <p className="text-[13px] leading-snug text-muted-foreground">{t("drive.home.trashNotice")}</p>
      {drive.loading ? (
        <LiteLoading />
      ) : entries.length === 0 ? (
        <LiteEmpty icon={Trash2} title={t("drive.list.empty.trashTitle")} description={t("drive.list.empty.trashDescription")} />
      ) : (
        <div data-lite-list="trash" className="flex flex-col gap-2">
          {entries.map((entry) => (
            <LiteEntryRow
              key={entry.key}
              entry={entry}
              title={entryLabel(entry, t)}
              sub={liteEntrySub(entry, { t, locale, now, trash: true })}
              onOpen={() => panels.openActions(entry)}
              onMore={() => panels.openActions(entry)}
              moreLabel={t("device.lite.drive.actions")}
            />
          ))}
        </div>
      )}
    </LiteScreen>
  );
}
