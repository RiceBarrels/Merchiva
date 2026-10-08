"use client";

// "Stored in apps" on the Drive manager page (drive-ui §9). Without a source it lists the app
// sources the person may see, with how many files each holds and when the newest was added, and
// says what is deliberately not included. With a source it lists that source's files, read-only
// here: they are changed or removed in the app that keeps them ("Open in {app}"). A source the
// person may not see (no permission, its app not installed, chat on the shared tablet) says it
// is not available here, and never offers its app.
//
// Presentational: the page calls useVirtualSources once (it also needs the entries to resolve
// ?preview=) and passes the result, with the source's entries as its listing filtered them.

import {
  Bug,
  ChevronRight,
  CircleUser,
  ClipboardList,
  EyeOff,
  GraduationCap,
  ListChecks,
  MessageSquare,
  Package,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { appBytesRowLabel, appStorageSummary, type AppStorageSummary } from "@/components/drive/model/app-storage";
import { countKey } from "@/components/drive/model/plural";
import type { DriveView, VirtualEntry, VirtualSourceId } from "@/components/drive/model/types";
import type { VirtualSourceMeta } from "@/components/drive/model/virtual-sources";
import { appBytesRowIcon } from "@/components/drive/nav/section-meta";
import type { DriveEntryActions } from "@/components/drive/preview/open-entry";
import { formatDriveBytes } from "@/lib/drive/format";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import type { AppFileSource } from "@/lib/storage/sources";
import { cn } from "@/lib/utils";
import { VirtualEntries } from "./apps-entries";
import type { VirtualSourceSummary } from "./use-virtual-sources";

const SOURCE_ICONS: Readonly<Record<VirtualSourceMeta["icon"], LucideIcon>> = {
  MessageSquare,
  ListChecks,
  Package,
  GraduationCap,
  Tag,
  Bug,
  UserCircle: CircleUser,
  ClipboardList,
};

/** The icon of an app source (also for the lite app's source rows). */
export function virtualSourceIcon(meta: Pick<VirtualSourceMeta, "icon">): LucideIcon {
  return SOURCE_ICONS[meta.icon];
}

export interface AppsViewProps {
  /** "" lists the sources; a source lists its files. */
  source: VirtualSourceId | "";
  /** useVirtualSources(...).sources: the sources this person may see. */
  sources: readonly VirtualSourceSummary[];
  /** useDrive().appBytesBySource: bytes per app over every app file of the store (totals only). */
  appBytes?: ReadonlyMap<AppFileSource, number>;
  /** The source's files as the listing shows them (search and type filter applied), newest first. */
  entries: readonly VirtualEntry[];
  /** useVirtualSources(...).ready. */
  ready: boolean;
  view?: DriveView;
  /** A source tile (its id) or a file (its entry) was picked: open the source, or preview the file. */
  onPick(pick: VirtualSourceId | VirtualEntry): void;
  /** "Open in {app}": go to the app that keeps the files (its originRoute). Manager only; omit elsewhere. */
  onOpenOrigin?(route: string): void;
  /** The manager's action runner, for each file's "⋮" menu. */
  actions?: DriveEntryActions | null;
  className?: string;
}

function SourcesSkeleton() {
  return (
    <ul aria-hidden className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-24 animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded-sm bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EntriesSkeleton({ view }: { view: DriveView }) {
  if (view === "list") {
    return (
      <ul aria-hidden className="divide-y divide-border rounded-lg border border-border">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="h-4 w-4 animate-pulse rounded-sm bg-muted" />
            <div className="h-3.5 flex-1 animate-pulse rounded-sm bg-muted" />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul aria-hidden className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="overflow-hidden rounded-lg border border-border">
          <div className="aspect-[4/3] animate-pulse bg-muted" />
          <div className="px-2.5 py-2">
            <div className="h-3.5 w-3/4 animate-pulse rounded-sm bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface SourceTilesProps {
  sources: readonly VirtualSourceSummary[];
  summary: AppStorageSummary;
  onPick(source: VirtualSourceId): void;
}

function SourceTiles({ sources, summary, onPick }: SourceTilesProps) {
  const { t, locale } = useI18n();
  const formatDate = useDateFormat();
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {sources.map(({ meta, count, latest }) => {
        const Icon = SOURCE_ICONS[meta.icon];
        const parts = [fmt(t(countKey(meta.countKey ?? "drive.apps.count", count)), { count })];
        const bytes = summary.bySource.get(meta.id);
        if (bytes) parts.push(formatDriveBytes(bytes, locale));
        if (latest !== null) parts.push(fmt(t("drive.apps.latest"), { date: formatDate(latest, { dateStyle: "medium" }) }));
        return (
          <li key={meta.id}>
            <button
              type="button"
              onClick={() => onPick(meta.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-start transition-colors hover:bg-muted/50"
            >
              <IconTile icon={Icon} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t(meta.labelKey)}</span>
                <span className="block truncate text-xs text-muted-foreground">{parts.join(" · ")}</span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          </li>
        );
      })}
      {summary.rows.map((row) => (
        <li key={row.id} data-drive-app-bytes={row.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <IconTile icon={appBytesRowIcon(row)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{appBytesRowLabel(row, t)}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground tabular-nums">{formatDriveBytes(row.bytes, locale)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const NO_APP_BYTES: ReadonlyMap<AppFileSource, number> = new Map();

export function AppsView({
  source, sources, appBytes = NO_APP_BYTES, entries, ready, view = "grid", onPick, onOpenOrigin, actions = null, className,
}: AppsViewProps) {
  const { t, locale } = useI18n();

  if (source === "") {
    const summary = appStorageSummary(appBytes, sources.map((s) => ({ id: s.meta.id, listedBytes: s.listedBytes })));
    return (
      <div className={cn("space-y-4", className)}>
        <p className="text-sm text-muted-foreground">{t("drive.apps.description")}</p>
        {ready && summary.total > 0 && (
          <div data-drive-apps-total className="space-y-0.5">
            <p className="text-sm font-medium">{fmt(t("drive.apps.storageTotal"), { size: formatDriveBytes(summary.total, locale) })}</p>
            <p className="text-xs text-muted-foreground">{t("drive.apps.notStoredHere")}</p>
          </div>
        )}
        {ready ? <SourceTiles sources={sources} summary={summary} onPick={onPick} /> : <SourcesSkeleton />}
        <p className="text-xs leading-relaxed text-muted-foreground">{t("drive.apps.notIncluded")}</p>
      </div>
    );
  }

  // Only a source this person may see: until the gate has settled (`ready`) the app is not offered.
  const meta = sources.find((s) => s.meta.id === source)?.meta ?? null;
  if (ready && meta === null) {
    return (
      <div className={className}>
        <EmptyState icon={EyeOff} title={t("drive.apps.unavailable")} />
      </div>
    );
  }
  const app = meta ? t(meta.labelKey) : "";
  return (
    <div className={cn("space-y-3", className)}>
      <Callout
        action={
          meta && onOpenOrigin ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenOrigin(meta.originRoute)}>
              {fmt(t("drive.apps.openIn"), { app })}
            </Button>
          ) : undefined
        }
      >
        {t("drive.apps.readOnly")}
      </Callout>
      {meta?.id === "inventory" && <p className="text-xs text-muted-foreground">{t("drive.apps.windowNote")}</p>}
      {!ready ? (
        <EntriesSkeleton view={view} />
      ) : entries.length === 0 ? (
        <EmptyState icon={meta ? SOURCE_ICONS[meta.icon] : undefined} title={t("drive.apps.empty")} />
      ) : (
        <VirtualEntries entries={entries} view={view} onPick={onPick} actions={actions} />
      )}
    </div>
  );
}
