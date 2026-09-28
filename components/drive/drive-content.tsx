"use client";

// The results region of the Drive manager page (drive-ui §7.2, §7.8): what the current view shows,
// in the order of what can happen — Drive not available yet (Docs rows still list), offline (the
// last rows stay, nothing can change), the trash retention note, then "Stored in apps", the
// members overview, a loading skeleton, the view's empty state, or the entries as a grid or a list.

import { Lock } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import type { EntryViewProps } from "@/components/drive/list/entry-card";
import { EntryGrid, EntryGridSkeleton, type EntryGridGroup } from "@/components/drive/list/entry-grid";
import { EntryList, EntryListSkeleton } from "@/components/drive/list/entry-list";
import { MembersView, type MembersViewProps } from "@/components/drive/members/members-view";
import type { DriveEntry, DriveSort, DriveView, VirtualEntry, VirtualSourceId } from "@/components/drive/model/types";
import type { DriveEntryActions } from "@/components/drive/preview/open-entry";
import { AppsView } from "@/components/drive/virtual/apps-view";
import type { VirtualSourceSummary } from "@/components/drive/virtual/use-virtual-sources";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { DriveEmpty, type DriveEmptyProps } from "./drive-empty";

export interface DriveContentApps {
  source: VirtualSourceId | "";
  /** useVirtualSources(...).sources: the sources this person may see. */
  sources: readonly VirtualSourceSummary[];
  ready: boolean;
  onPick(pick: VirtualSourceId | VirtualEntry): void;
  onOpenOrigin(route: string): void;
  actions: DriveEntryActions | null;
}

export interface DriveContentProps {
  /** Drive's tables are not in the module yet: a notice above whatever Docs still lists. */
  notPublished: boolean;
  /** No SpacetimeDB connection: a notice above the last rows. */
  offline: boolean;
  /** The rows have not arrived yet. */
  loading: boolean;
  view: DriveView;
  /** Phone layout: compact list rows, no rubber band. */
  compact: boolean;
  /** Sorted entries of the view (sortDriveEntries). */
  entries: readonly DriveEntry[];
  /** Date groups of the grid (groupDriveEntries) or null. */
  groups: readonly EntryGridGroup[] | null;
  /** Flat results (search, Recent, Starred, Shared, Trash): the list adds a Location column. */
  flat: boolean;
  locationOf(entry: DriveEntry): string | null;
  onSort(sort: DriveSort): void;
  /** What every grid item and list row receives. */
  item: EntryViewProps;
  empty: Omit<DriveEmptyProps, "className">;
  /** Set on the "Stored in apps" view. */
  apps: DriveContentApps | null;
  /** Set on the members overview (Members' files without a member); `null` there = not allowed. */
  members: MembersViewProps | null;
  /** The "Members' files" section was asked for without the "everyone's files" power. */
  membersForbidden: boolean;
  /** Id of the results region (the search field's aria-controls). */
  resultsId: string;
  className?: string;
}

function Results(props: DriveContentProps) {
  const t = useT();
  const { loading, view, compact, entries, apps, members, item } = props;
  if (props.membersForbidden) return <EmptyState icon={Lock} title={t("drive.errors.forbidden")} />;
  if (apps) {
    const files = entries.filter((entry): entry is VirtualEntry => entry.type === "virtual");
    return (
      <AppsView
        source={apps.source}
        sources={apps.sources}
        entries={files}
        ready={apps.ready && !loading}
        view={view}
        onPick={apps.onPick}
        onOpenOrigin={apps.onOpenOrigin}
        actions={apps.actions}
      />
    );
  }
  if (members) return <MembersView {...members} loading={members.loading || loading} />;
  if (loading) return view === "grid" ? <EntryGridSkeleton /> : <EntryListSkeleton compact={compact} />;
  if (entries.length === 0) return <DriveEmpty {...props.empty} />;
  if (view === "grid") return <EntryGrid {...item} entries={entries} groups={props.groups} marquee={!compact} />;
  return <EntryList {...item} entries={entries} flat={props.flat} locationOf={props.locationOf} onSort={props.onSort} compact={compact} />;
}

export function DriveContent(props: DriveContentProps) {
  const t = useT();
  const { notPublished, offline, loading, item, resultsId, className } = props;
  return (
    <div className={cn("space-y-3", className)}>
      {notPublished && (
        <Callout tone="warning" title={t("drive.home.notPublishedTitle")}>
          {t("drive.home.notPublishedDescription")}
        </Callout>
      )}
      {offline && !loading && (
        <Callout tone="warning" title={t("drive.home.offlineTitle")}>
          {t("drive.home.offlineDescription")}
        </Callout>
      )}
      {item.section === "trash" && <Callout tone="neutral">{t("drive.home.trashNotice")}</Callout>}
      <div id={resultsId} aria-busy={loading || undefined}>
        <Results {...props} />
      </div>
    </div>
  );
}
