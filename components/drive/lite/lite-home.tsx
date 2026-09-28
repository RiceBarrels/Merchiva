"use client";

// The Drive lite home (drive-ui §14.3): one place at a time — Mine, Store, Shared, or (with the "everyone's
// files" power) Team — as big rows, with the notice row on top, a search box, "Take photo" / "Upload file" /
// "New" where the person may add things, their uploads, and at the root "From other apps", "Trash" and the
// storage line. A folder opens as a screen of its own with a way back.
//
// Everything listed is the person's: the PIN operator on /store, never the tablet account (useDriveData). On a
// tablet signed in with a staff account only Store works there, which a note says. Nothing can be added while
// offline, before the rows arrive, or where the person may not add (the listing's createTarget). While the file
// store is unavailable (useDriveStorageStatus) "Take photo", "Upload file" and "Choose photos" are off and a note
// says why; folders and documents still work.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Camera, ChevronLeft, CloudOff, FolderOpen, FolderX, HardDrive, LayoutGrid, Plus, SearchX, Store, Trash2, Upload, type LucideIcon } from "lucide-react";
import { LiteButton, LiteChoice, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSearch } from "@/components/device/apps/lite";
import { useMinuteClock } from "@/components/docs/home/format";
import { listDriveEntries, sortDriveEntries, type ListingQuery } from "@/components/drive/model/listing";
import type { DriveMoveTarget } from "@/components/drive/model/types";
import { displayUsage, storageFigures } from "@/components/drive/nav/storage-meter";
import { SECTION_ICONS } from "@/components/drive/nav/section-meta";
import { entryLabel } from "@/components/drive/preview/preview-mode";
import { DriveFileInputs, useDriveFilePickers } from "@/components/drive/upload/file-inputs";
import { STATUS_TONE_CLASSES } from "@/components/ui/status-badge";
import { formatDriveBytes } from "@/lib/drive/format";
import { useDriveStorageStatus } from "@/lib/drive/use-drive-storage-status";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { useLiteDriveContext } from "./lite-context";
import { LiteEntryRow } from "./lite-entry-row";
import { liteEntrySub, untitledLabels } from "./lite-labels";
import { LiteMembers } from "./lite-members";
import { LiteNewDrawer } from "./lite-new-drawer";
import { LiteNoticeRow, LiteSharedDeviceNote } from "./lite-notice";
import { effectiveTab, LITE_TAB_LABEL, LITE_TAB_SECTION, liteTabs, type LiteDriveScreen, type LiteHomeScreen, type LiteTab } from "./lite-state";
import { LiteUploads } from "./lite-uploads";

const TAB_ICONS: Readonly<Record<LiteTab, LucideIcon>> = {
  mine: SECTION_ICONS.my,
  store: SECTION_ICONS.store,
  shared: SECTION_ICONS.shared,
  team: SECTION_ICONS.members,
};

/** A line that wraps (LiteRow cuts its title to one line). */
function LiteNote({ icon: Icon, text, tone = "muted", data }: { icon: LucideIcon; text: string; tone?: "muted" | "warning"; data?: string }) {
  return (
    <div
      data-lite-note={data}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-[14px] leading-snug",
        tone === "warning" ? STATUS_TONE_CLASSES.warning : "border-border bg-card",
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 flex-none", tone !== "warning" && "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
    </div>
  );
}

export function LiteDriveHome({ screen }: { screen: LiteHomeScreen }) {
  const { t, locale } = useI18n();
  const { drive, nav, panels, openEntry } = useLiteDriveContext();
  const uploadsOff = useDriveStorageStatus().status === "unavailable";
  const now = useMinuteClock();
  const { tree, actor, listingActor, memberNames } = drive.data;
  const [newOpen, setNewOpen] = useState(false);
  const untitled = useMemo(() => untitledLabels(t), [t]);

  const sharedCount = useMemo(() => {
    const query: ListingQuery = { section: "shared", folderId: "", memberId: "", source: "", type: "all", q: "", locale, untitled };
    return listDriveEntries(tree, query, listingActor).entries.length;
  }, [tree, listingActor, locale, untitled]);
  const tabs = liteTabs({ staffTablet: drive.staffTablet, sharedCount, canViewAll: actor.canViewAll });
  const tab = effectiveTab(screen.tab, tabs);
  const section = LITE_TAB_SECTION[tab];
  const memberId = tab === "team" ? screen.memberId : "";
  const membersOverview = tab === "team" && memberId === "";
  const atRoot = screen.folderId === "" && memberId === "";

  const listing = useMemo(() => {
    const query: ListingQuery = {
      section, folderId: screen.folderId, memberId, source: "", type: "all", q: screen.q, locale, untitled,
      memberName: memberId ? memberNames.get(memberId) : undefined,
    };
    return listDriveEntries(tree, query, listingActor);
  }, [tree, section, screen.folderId, memberId, screen.q, locale, untitled, memberNames, listingActor]);
  const entries = useMemo(() => sortDriveEntries(listing.entries, "modified", section, locale), [listing.entries, section, locale]);

  // A staff-account tablet can't write anyone's My files (the module refuses with device_scope).
  const writable = !drive.notPublished && !drive.loading && !drive.offline && !membersOverview;
  const createTarget: DriveMoveTarget | null =
    writable && listing.createTarget && !(drive.staffTablet && listing.createTarget.space === "my") ? listing.createTarget : null;
  // The place a picker was opened for. The camera or the file chooser can keep the screen long enough for the
  // connection to drop (or be re-checked) and createTarget to go null; the files still go where the person was, and
  // a failed upload waits in their uploads with "Try again".
  const pickedFor = useRef<DriveMoveTarget | null>(null);
  const pickers = useDriveFilePickers((files) => {
    const target = pickedFor.current ?? createTarget;
    pickedFor.current = null;
    if (target) drive.uploadFiles(files, target);
    else toast.error(t("device.lite.drive.offline"));
  });
  const pickFor = (open: () => void) => () => {
    pickedFor.current = createTarget;
    open();
  };

  const below = nav.below;
  const backLabel = below?.kind === "home" ? homeLabel(below) : t("common.back");
  function homeLabel(home: LiteHomeScreen): string {
    if (home.folderId) return tree.folders.get(home.folderId)?.name.trim() || t("drive.list.untitled.folder");
    if (home.tab === "team" && home.memberId) return fmt(t("device.lite.drive.memberFiles"), { name: memberNames.get(home.memberId) ?? t("drive.list.formerMember") });
    return t(LITE_TAB_LABEL[home.tab]);
  }
  const heading = atRoot ? null : homeLabel({ ...screen, tab, memberId });

  const usage = displayUsage(drive.data.drive);
  const storage = usage ? storageFigures(usage) : null;
  const storageText = storage
    ? storage.total > 0
      ? fmt(t("device.lite.drive.storage"), { used: formatDriveBytes(storage.used, locale), total: formatDriveBytes(storage.total, locale) })
      : fmt(t("device.lite.drive.storageNoQuota"), { used: formatDriveBytes(storage.used, locale) })
    : null;

  let content: ReactNode;
  if (drive.loading) content = <LiteLoading />;
  else if (membersOverview) content = <LiteMembers />;
  else if (listing.missingFolder) {
    content = <LiteEmpty icon={FolderX} title={t("drive.list.empty.missingFolderTitle")} description={t("drive.list.empty.missingFolderDescription")} />;
  } else if (entries.length === 0) {
    content = screen.q.trim() !== ""
      ? <LiteEmpty icon={SearchX} title={t("drive.list.empty.searchTitle")} />
      : tab === "shared"
        ? <LiteEmpty icon={SECTION_ICONS.shared} title={t("drive.list.empty.sharedTitle")} description={t("drive.list.empty.sharedDescription")} />
        : <LiteEmpty icon={FolderOpen} title={t("device.lite.drive.empty")} description={createTarget && !uploadsOff ? t("device.lite.drive.emptyHint") : undefined} />;
  } else {
    content = (
      <div data-lite-list="entries" className="flex flex-col gap-2">
        {entries.map((entry) => (
          <LiteEntryRow
            key={entry.key}
            entry={entry}
            title={entryLabel(entry, t)}
            sub={liteEntrySub(entry, { t, locale, now })}
            onOpen={() => openEntry(entry)}
            onMore={() => panels.openActions(entry)}
            moreLabel={t("device.lite.drive.actions")}
          />
        ))}
      </div>
    );
  }

  const showTabs = atRoot && tabs.length > 1;
  const setQuery = (q: string) => nav.replaceTop({ ...screen, q } satisfies LiteDriveScreen);

  return (
    <LiteScreen>
      <LiteNoticeRow />
      {drive.offline && <LiteNote icon={CloudOff} tone="warning" text={t("device.lite.drive.offline")} data="offline" />}
      {drive.notPublished ? (
        <LiteEmpty icon={CloudOff} title={t("device.lite.drive.notReady")} />
      ) : (
        <>
          {below && <LiteRow icon={ChevronLeft} title={fmt(t("device.lite.drive.backTo"), { name: backLabel })} onClick={nav.pop} />}
          {heading && <h2 dir="auto" className="truncate text-[20px] font-semibold leading-tight">{heading}</h2>}
          {!membersOverview && <LiteSearch value={screen.q} onChange={setQuery} placeholder={t("device.lite.drive.search")} />}
          {drive.staffTablet && atRoot && <LiteNote icon={Store} text={t("device.lite.drive.staffTablet")} data="staff-tablet" />}
          {showTabs && (
            <LiteChoice<LiteTab>
              value={tab}
              onChange={nav.setTab}
              options={tabs.map((value) => ({ value, label: t(LITE_TAB_LABEL[value]), icon: TAB_ICONS[value] }))}
            />
          )}
          {tab === "team" && memberId !== "" && !actor.canEditAll && <LiteNote icon={SECTION_ICONS.members} text={t("device.lite.drive.readOnly")} />}
          {createTarget && (
            <div data-lite-create="" className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <LiteButton icon={Camera} label={t("device.lite.drive.takePhoto")} disabled={uploadsOff} onClick={pickFor(pickers.takePhoto)} />
                <LiteButton icon={Upload} tone="outline" label={t("device.lite.drive.uploadFile")} disabled={uploadsOff} onClick={pickFor(pickers.pickFiles)} />
              </div>
              {uploadsOff && <LiteNote icon={CloudOff} tone="warning" text={t("drive.errors.storageUnavailable")} data="storage" />}
              <LiteButton icon={Plus} tone="outline" label={t("device.lite.drive.new")} busy={drive.busy} onClick={() => setNewOpen(true)} />
              {drive.surface === "store" && <LiteSharedDeviceNote />}
            </div>
          )}
          <LiteUploads />
          {content}
          {atRoot && (
            <div className="mt-2 flex flex-col gap-2">
              <LiteRow icon={LayoutGrid} title={t("device.lite.drive.fromApps")} chevron onClick={() => nav.push({ kind: "apps", source: "" })} />
              <LiteRow icon={Trash2} title={t("device.lite.drive.trash")} chevron onClick={() => nav.push({ kind: "trash" })} />
              {storageText && (
                <p className="flex items-center gap-2 px-1 text-[13px] tabular-nums text-muted-foreground">
                  <HardDrive className="h-4 w-4 flex-none" aria-hidden />
                  {storageText}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {createTarget && (
        <LiteNewDrawer
          open={newOpen}
          onOpenChange={setNewOpen}
          target={createTarget}
          onPickPhotos={uploadsOff ? null : pickFor(pickers.pickPhotos)}
        />
      )}
      <DriveFileInputs {...pickers.inputs} />
    </LiteScreen>
  );
}
