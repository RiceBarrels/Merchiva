"use client";

// Drive home (`/manager/drive`, drive-ui §7): My files, Store, Shared with me, Recent, Starred,
// Trash, "Stored in apps" and, for people with the "everyone's files" power, Members' files, in a
// grid or a list, with search, type filter, sort, selection, drag and drop, previews, uploads and
// New ▸ Folder / Doc / Sheet / Slides. The view lives in the URL (use-drive-url-state.ts), so
// reloads, Back and browser-shell tabs restore it.
//
// Everything is the signed-in member's (useDriveData); the module decides every write. Until the
// management notice is acknowledged (ManagementNoticeGate), and while offline or loading, nothing
// can be uploaded or created. On phones the section picker and the search take the nav column's
// place, the list is compact, and the selection bar floats with the upload tray at the bottom of
// the page's own scroller (never `fixed`: in the mobile browser shell that would paint under the
// bottom chrome).

import { useCallback, useId, useMemo } from "react";
import dynamic from "next/dynamic";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { useMinuteClock } from "@/components/docs/home/format";
import { entryLocationLabel } from "@/components/drive/list/entry-list";
import { useDriveSelection, useFinePointer } from "@/components/drive/list/use-selection";
import type { ActionContext } from "@/components/drive/model/actions";
import { buildDriveTree } from "@/components/drive/model/entries";
import { driveEmptyKind, groupDriveEntries, listDriveEntries, sortDriveEntries, summarizeMembers, type ListingQuery } from "@/components/drive/model/listing";
import type { DriveEntry, DriveSort, VirtualEntry, VirtualSourceId } from "@/components/drive/model/types";
import { DriveNav } from "@/components/drive/nav/drive-nav";
import { StorageMeter, displayUsage } from "@/components/drive/nav/storage-meter";
import { DriveSectionSelect } from "@/components/drive/nav/section-select";
import { ManagementNoticeBanner, ManagementNoticeGate } from "@/components/drive/notice/management-notice";
import { useManagementNoticeAck } from "@/components/drive/notice/use-notice-ack";
import { usePreviewLoader } from "@/components/drive/preview/open-entry";
import { DrivePreviewSheet } from "@/components/drive/preview/preview-sheet";
import { DriveToolbar } from "@/components/drive/toolbar/drive-toolbar";
import { NewMenu } from "@/components/drive/toolbar/new-menu";
import { SelectionBar } from "@/components/drive/toolbar/selection-bar";
import { DriveDropZone } from "@/components/drive/upload/drop-zone";
import { DriveFileInputs, useDriveFilePickers } from "@/components/drive/upload/file-inputs";
import { UploadTray } from "@/components/drive/upload/upload-tray";
import { useDriveData } from "@/components/drive/use-drive-data";
import { useDriveUrlState } from "@/components/drive/use-drive-url-state";
import { useVirtualSources } from "@/components/drive/virtual/use-virtual-sources";
import { useSetTabTitle } from "@/lib/browser-shell";
import { usePermissions } from "@/lib/context/permissions";
import { isManagerRouteEnabled } from "@/lib/device-apps";
import { driveHref } from "@/lib/drive/hrefs";
import { useDriveTokenBridge } from "@/lib/drive/use-drive-token";
import { useDriveUploads } from "@/lib/drive/use-drive-uploads";
import { useI18n } from "@/lib/i18n/context";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { useLiveSpacetimeConnection } from "@/lib/spacetimedb/hooks/useDocs";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useDriveActions } from "./actions/use-drive-actions";
import { useDriveCreate } from "./actions/use-drive-create";
import { DriveDeleteForeverDialog } from "./dialogs/delete-forever-dialog";
import { MoveDialog } from "./dialogs/move-dialog";
import { DriveNameDialog } from "./dialogs/name-dialog";
import { SpaceChangeDialog } from "./dialogs/space-change-dialog";
import { DriveContent } from "./drive-content";

const ShareDialog = dynamic(() => import("@/components/docs/dialogs/share-dialog").then((mod) => mod.ShareDialog), { ssr: false });

/** Phones: below Tailwind's `sm`, where the upload tray spans the width (upload-tray.tsx). */
const PHONE_MAX_WIDTH = 640;
const NO_ENTRIES: readonly never[] = [];

export function DriveHome() {
  const { t, locale } = useI18n();
  useDriveTokenBridge();
  const url = useDriveUrlState();
  const { queue } = useDriveUploads();
  const data = useDriveData({ localUploadIds: queue.localItemIds() });
  const { actor, drive, tree, members, memberNames, listingActor } = data;
  const usage = displayUsage(drive);
  const notice = useManagementNoticeAck();
  const offline = useLiveSpacetimeConnection() === null;
  const now = useMinuteClock();
  const phone = useIsMobile(PHONE_MAX_WIDTH);
  const fine = useFinePointer();
  const openUrl = useDocsOpenUrl();
  const loader = usePreviewLoader();
  const organizationId = usePermissions().organizationId ?? "";
  const docsInstalled = isManagerRouteEnabled("/manager/docs", useDeviceApps().installed);
  const resultsId = useId();

  const section = url.space;
  const notPublished = drive.status === "not_published";
  const loading = !notPublished && (!data.isReady || drive.status === "checking");

  // "Stored in apps": the viewed source's files (its entries join the tree, so ?preview= finds them), else the counts.
  const virtual = useVirtualSources({ enabledSource: section === "apps" ? url.source : "summary" });
  const listTree = useMemo(
    () => (section === "apps" && virtual.entries.length > 0 ? buildDriveTree([...tree.entries, ...virtual.entries]) : tree),
    [section, virtual.entries, tree],
  );

  const untitled = useMemo(
    () => ({
      folder: t("drive.list.untitled.folder"),
      doc: t("drive.list.untitled.doc"),
      sheet: t("drive.list.untitled.sheet"),
      slides: t("drive.list.untitled.slides"),
      file: t("drive.list.untitled.file"),
    }),
    [t],
  );
  const query = useMemo(
    (): ListingQuery => ({
      section, folderId: url.folder, memberId: url.member, source: url.source, type: url.type, q: url.query, locale, untitled,
      memberName: url.member ? memberNames.get(url.member) : undefined,
    }),
    [section, url.folder, url.member, url.source, url.type, url.query, locale, untitled, memberNames],
  );
  const listing = useMemo(() => listDriveEntries(listTree, query, listingActor), [listTree, query, listingActor]);
  const sorted = useMemo(() => sortDriveEntries(listing.entries, url.sort, section, locale), [listing.entries, url.sort, section, locale]);
  const groups = useMemo(() => (url.view === "grid" ? groupDriveEntries(sorted, section, url.sort, now) : null), [url.view, sorted, section, url.sort, now]);
  const counts = useMemo(() => {
    const base: Omit<ListingQuery, "section"> = { folderId: "", memberId: "", source: "", type: "all", q: "", locale, untitled };
    return {
      shared: listDriveEntries(tree, { ...base, section: "shared" }, listingActor).entries.length,
      trash: listDriveEntries(tree, { ...base, section: "trash" }, listingActor).entries.length,
    };
  }, [tree, listingActor, locale, untitled]);
  const membersOverview = section === "members" && !url.member && actor.canViewAll;
  const memberSummaries = useMemo(() => (membersOverview ? summarizeMembers(tree, members) : []), [membersOverview, tree, members]);

  const visibleKeys = useMemo(() => sorted.map((entry) => entry.key), [sorted]);
  const selection = useDriveSelection(visibleKeys, `${section}:${url.folder}:${url.member}:${url.source}`);
  const selected = useMemo(() => sorted.filter((entry) => selection.keys.has(entry.key)), [sorted, selection.keys]);
  useSetTabTitle(listing.folder ? listing.folder.name.trim() || untitled.folder : null);

  const ctx = useMemo((): ActionContext => ({ surface: "manager", docsInstalled, section, offline, touch: !fine }), [docsInstalled, section, offline, fine]);
  const actions = useDriveActions({
    tree: listTree, actor, ctx, url, openUrl, loader, organizationId, members, onSelect: selection.enterMode, t, locale,
  });
  const showMyFiles = useCallback(() => url.go({ space: "my" }), [url]);
  const create = useDriveCreate({
    tree, organizationId, actingMemberId: actor.actingMemberId, actorMemberId: actor.memberId, section, usage: drive.usage,
    docsInstalled, queue, openUrl, showMyFiles, t, locale,
  });

  // Why nothing can be added here right now; null = uploads and New work, into listing.createTarget.
  const blockedReason = notPublished
    ? t("drive.home.notPublishedTitle")
    : loading || !notice.ready
      ? t("drive.home.loading")
      : offline
        ? t("drive.home.offlineTitle")
        : notice.needsAck
          ? t("drive.home.noticeRequired")
          : null;
  const createTarget = blockedReason === null ? listing.createTarget : null;
  const disabledReason = blockedReason ?? (createTarget === null ? t("drive.home.cannotCreateHere") : null);
  const pickers = useDriveFilePickers((files) => {
    if (createTarget) create.uploadFiles(files, createTarget);
  });

  const onNewFolder = () => {
    if (createTarget) actions.createFolder(createTarget);
  };
  const headerActions = (
    <>
      <Button type="button" variant="outline" size="sm" disabled={createTarget === null} title={disabledReason ?? undefined} onClick={pickers.pickFiles} className="gap-1.5">
        <Upload aria-hidden className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">{t("drive.home.upload")}</span>
      </Button>
      <NewMenu
        disabledReason={disabledReason}
        docsInstalled={docsInstalled}
        supportsFolder={pickers.supportsFolder}
        onNewFolder={onNewFolder}
        onUploadFiles={pickers.pickFiles}
        onUploadFolder={pickers.pickFolder}
        onNewDocument={(kind) => {
          if (createTarget) create.createDocument(kind, createTarget);
        }}
        busy={create.creating}
      />
    </>
  );

  const selectionBar =
    selected.length > 0 ? (
      <SelectionBar
        entries={selected}
        section={section}
        onAction={(action) => actions.runBulk(selected, action)}
        onClear={selection.clear}
        onSelectAll={selected.length < sorted.length ? () => selection.set(visibleKeys) : null}
        offline={offline}
        floating={phone}
        className={phone ? "static shadow-md" : undefined}
      />
    ) : null;

  const overview = (section === "members" && !url.member) || (section === "apps" && !url.source);
  const previewEntry = url.preview ? (listTree.byKey.get(url.preview) ?? null) : null;
  const shareEntry = actions.share.value;
  const locationOf = (entry: DriveEntry) => entryLocationLabel(entry, listTree, actor.memberId, t);
  const pickApp = (pick: VirtualSourceId | VirtualEntry) =>
    typeof pick === "string" ? url.go({ space: "apps", source: pick }) : url.go({ preview: pick.key });

  return (
    <div className="flex min-h-full flex-col">
      {/* The whole page takes dropped files; the dialogs stay outside it (React events bubble through portals). */}
      <DriveDropZone
        target={listing.createTarget}
        targetLabel={listing.folder ? listing.folder.name.trim() || untitled.folder : undefined}
        disabled={blockedReason !== null}
        onFiles={create.uploadFiles}
        className="flex flex-1 flex-col"
      >
        <PageHeader title={t("drive.home.title")} right={headerActions} />
        <div className="flex flex-1">
          <DriveNav
            section={section}
            source={url.source}
            memberId={actor.memberId}
            canViewAll={actor.canViewAll}
            counts={counts}
            sources={virtual.sources.map((s) => ({ id: s.meta.id, count: s.count }))}
            usage={usage}
            drop={actions.drop}
            className="sticky top-0 hidden max-h-dvh w-56 shrink-0 self-start overflow-y-auto border-e border-border px-2 py-4 lg:flex"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-3 lg:px-6">
            {section !== "apps" && <ManagementNoticeBanner compact={phone} />}
            {/* The nav column (and its meter) is hidden below lg: show the storage line here instead. */}
            <StorageMeter usage={usage} compact className="lg:hidden" />
            <DriveToolbar
              crumbs={listing.crumbs}
              section={section}
              query={url.query}
              onQuery={url.setQuery}
              type={url.type}
              onType={(type) => url.go({ type })}
              sort={url.sort}
              onSort={(sort: DriveSort) => url.go({ sort })}
              view={url.view}
              onView={url.setView}
              filters={!overview}
              resultsId={resultsId}
              selection={phone ? null : selectionBar}
              mobileLeading={
                <DriveSectionSelect
                  section={section}
                  canViewAll={actor.canViewAll}
                  sharedCount={counts.shared}
                  onSection={(space) => url.go({ space })}
                  className="max-w-[45%] shrink-0"
                />
              }
              drop={actions.drop}
            />
            <DriveContent
              notPublished={notPublished}
              offline={offline}
              loading={loading}
              view={url.view}
              compact={phone}
              entries={sorted}
              groups={groups}
              flat={listing.flat}
              locationOf={locationOf}
              onSort={(sort) => url.go({ sort })}
              item={{
                section, sort: url.sort, now, ctx, selection, hrefFor: actions.hrefFor, openInPlace: actions.openInPlace,
                movesFor: actions.moveFor, onAction: actions.onAction, onBulkAction: actions.runBulk, drop: actions.drop,
                busyKeys: actions.busyKeys,
              }}
              empty={{
                kind: driveEmptyKind(query, listing),
                canCreate: createTarget !== null,
                onUpload: pickers.pickFiles,
                onNewFolder,
                onClearFilters: url.clearFilters,
                onGoToMy: showMyFiles,
              }}
              apps={
                section === "apps"
                  ? { source: url.source, sources: virtual.sources, ready: virtual.ready, onPick: pickApp, onOpenOrigin: (route) => openUrl(route, "current"), actions }
                  : null
              }
              members={
                membersOverview
                  ? {
                      summaries: memberSummaries,
                      canEditAll: actor.canEditAll,
                      hrefFor: (member) => driveHref({ space: "members", member }),
                      onPick: (member) => url.go({ space: "members", member }),
                    }
                  : null
              }
              membersForbidden={section === "members" && !actor.canViewAll && !loading}
              resultsId={resultsId}
            />
            {/* One bottom stack, so the tray and the phone selection bar never overlap. */}
            <div className="pointer-events-none sticky bottom-[calc(var(--shell-scroll-pad,0px)+0.5rem)] z-30 mt-auto flex flex-col gap-2 empty:hidden">
              <UploadTray className="pointer-events-auto sm:self-end" />
              {phone && selectionBar && <div className="pointer-events-auto">{selectionBar}</div>}
            </div>
          </div>
        </div>
      </DriveDropZone>

      <DrivePreviewSheet
        entry={previewEntry}
        siblings={sorted}
        onClose={() => url.go({ preview: "" })}
        onNavigate={(entry) => url.go({ preview: entry.key })}
        actions={actions}
        tree={listTree}
      />
      <DriveNameDialog
        open={actions.name.open}
        onOpenChange={actions.setNameOpen}
        mode={actions.name.value?.mode ?? "newFolder"}
        initialName={actions.name.value?.initialName ?? ""}
        kind={actions.name.value?.kind ?? "folder"}
        onSubmit={actions.submitName}
      />
      <MoveDialog
        open={actions.move.open}
        onOpenChange={actions.setMoveOpen}
        entries={actions.move.value ?? NO_ENTRIES}
        tree={listTree}
        actor={actions.moveActor}
        memberNames={memberNames}
        onMove={actions.submitMove}
        onCreateFolder={actions.createFolderIn}
      />
      <SpaceChangeDialog open={actions.spaceChange.open} onOpenChange={actions.setSpaceChangeOpen} plan={actions.spaceChange.value} onConfirm={actions.confirmSpaceChange} />
      <DriveDeleteForeverDialog open={actions.remove.open} onOpenChange={actions.setRemoveOpen} entries={actions.remove.value ?? NO_ENTRIES} onConfirm={actions.confirmRemove} />
      {shareEntry && <ShareDialog open={actions.share.open} onOpenChange={actions.setShareOpen} doc={shareEntry.doc} access={shareEntry.docAccess} />}
      <DriveFileInputs {...pickers.inputs} />
      <ManagementNoticeGate />
    </div>
  );
}
