"use client";

// The Drive list: a table of Name (icon, name, badges) · Owner · date · Size · Location (flat
// results only) · star + menu, with a select-all checkbox and sortable headers. Phones get a
// compact row (name, date, menu). Every cell carries its own hidden copy of the name link,
// because WebKit doesn't treat `<tr>` as a containing block. Keyboard
// shortcuts live on this element only (onDriveResultsKeyDown).

import { useId, useMemo } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EntryContextMenu, EntryMenu } from "@/components/drive/list/entry-menu";
import { EntryIcon } from "@/components/drive/list/entry-icon";
import { entrySizeText } from "@/components/drive/model/entry-size";
import type { DriveTree } from "@/components/drive/model/entries";
import type { DriveEntry, DriveSection, DriveSort } from "@/components/drive/model/types";
import { formatDocDateTime, formatDocStamp } from "@/components/docs/home/format";
import { useI18n, useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import {
  EntryCheckbox,
  entryRootProps,
  entryTime,
  uploadingOf,
  useEntryItem,
  type EntryItem,
  type EntryItemProps,
  type EntryTimeKind,
  type EntryViewProps,
} from "./entry-card";
import { onDriveResultsKeyDown, useFinePointer } from "./use-selection";

const FRAME_CLASS = "-mx-4 overflow-hidden border-y border-border sm:mx-0 sm:rounded-lg sm:border";

/**
 * Where an entry lives, for the Location column of flat results: "My files › Receipts",
 * "Store › …", "{name}'s files › …"; an app's name for a file stored in another app.
 */
export function entryLocationLabel(entry: DriveEntry, tree: DriveTree, actorMemberId: string | null, t: (key: string) => string): string | null {
  if (entry.type === "virtual") return t(`drive.apps.sources.${entry.source}`);
  const location = entry.location;
  if (!location) return null;
  const root =
    location.space === "store"
      ? t("drive.nav.store")
      : location.ownerMemberId === actorMemberId
        ? t("drive.nav.my")
        : entry.ownerName === null
          ? t("drive.list.formerMember")
          : fmt(t("drive.nav.memberFiles"), { name: entry.ownerName });
  const path = tree.pathOf(entry).map((folder) => folder.name.trim() || t("drive.list.untitled.folder"));
  return [root, ...path].join(" › ");
}

function SortButton({ active, direction, onClick, children }: { active: boolean; direction: "asc" | "desc"; onClick?: () => void; children: React.ReactNode }) {
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold tracking-wide uppercase outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none",
        active && "text-foreground",
      )}
    >
      {children}
      {active && <Arrow aria-hidden className="h-3 w-3" />}
    </button>
  );
}

const TIME_COLUMN: Readonly<Record<EntryTimeKind, string>> = {
  modified: "drive.list.col.modified",
  created: "drive.list.col.created",
  trashed: "drive.list.col.trashed",
};

interface HeaderProps {
  section: DriveSection;
  sort: DriveSort;
  flat: boolean;
  onSort?(sort: DriveSort): void;
  /** Select-all state: every visible entry, some of them, or none. */
  checked?: "all" | "some" | "none";
  onToggleAll?(): void;
  checkable: boolean;
}

function EntryListHeader({ section, sort, flat, onSort, checked = "none", onToggleAll, checkable }: HeaderProps) {
  const t = useT();
  const timeKind: EntryTimeKind = section === "trash" ? "trashed" : sort === "created" ? "created" : "modified";
  // Trash always lists the most recently trashed first.
  const active = section === "trash" || (sort !== "name" && sort !== "size") ? "date" : sort;
  const sortBy = (next: DriveSort) => (section !== "trash" && onSort ? () => onSort(next) : undefined);
  const ariaSort = (column: typeof active) => (active === column ? (column === "name" ? "ascending" : "descending") : undefined);
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="w-0 ps-3 pe-0">
          {checkable && onToggleAll && <Checkbox checked={checked === "all"} aria-label={t("drive.list.selectAll")} onCheckedChange={onToggleAll} />}
        </TableHead>
        <TableHead className="text-start" aria-sort={ariaSort("name")}>
          <SortButton active={active === "name"} direction="asc" onClick={sortBy("name")}>
            {t("drive.list.col.name")}
          </SortButton>
        </TableHead>
        <TableHead className="hidden text-start md:table-cell">{t("drive.list.col.owner")}</TableHead>
        <TableHead className="text-start" aria-sort={ariaSort("date")}>
          <SortButton active={active === "date"} direction="desc" onClick={sortBy(sort === "created" ? "created" : "modified")}>
            {t(TIME_COLUMN[timeKind])}
          </SortButton>
        </TableHead>
        <TableHead className="hidden text-end md:table-cell" aria-sort={ariaSort("size")}>
          <SortButton active={active === "size"} direction="desc" onClick={sortBy("size")}>
            {t("drive.list.col.size")}
          </SortButton>
        </TableHead>
        {flat && <TableHead className="hidden text-start lg:table-cell">{t("drive.list.col.location")}</TableHead>}
        <TableHead className="w-0">
          <span className="sr-only">{t("drive.list.col.actions")}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

/** A hidden copy of the name link over one cell (see the file comment). */
function CellLink({ item, title }: { item: EntryItem; title?: string }) {
  if (item.href === null) return null;
  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-hidden
      tabIndex={-1}
      title={title}
      draggable={item.drag.draggable ? false : undefined}
      onClick={item.onLinkClick}
      className="absolute inset-0"
    />
  );
}

function EntryBadges({ entry, section }: { entry: DriveEntry; section: DriveSection }) {
  const t = useT();
  const uploading = uploadingOf(entry);
  return (
    <>
      {uploading !== null && (
        <StatusBadge tone="info" size="xs" className="shrink-0">
          {t("drive.list.uploading")}
        </StatusBadge>
      )}
      {entry.location?.space === "store" && section !== "store" && (
        <StatusBadge tone="neutral" size="xs" className="hidden shrink-0 sm:inline-flex">
          {t("drive.list.badgeStore")}
        </StatusBadge>
      )}
      {"hasGrants" in entry && entry.hasGrants && (
        <StatusBadge tone="neutral" size="xs" className="hidden shrink-0 sm:inline-flex">
          {t("drive.list.badgeShared")}
        </StatusBadge>
      )}
    </>
  );
}

function ownerLabel(entry: DriveEntry, t: (key: string) => string): string | null {
  if (entry.isMine) return t("drive.list.me");
  if (entry.ownerName !== null) return entry.ownerName;
  return entry.ownerMemberId ? t("drive.list.formerMember") : null;
}

interface RowProps extends EntryItemProps {
  entry: DriveEntry;
  flat: boolean;
  compact: boolean;
  locationOf?(entry: DriveEntry): string | null;
}

function EntryRow(props: RowProps) {
  const { entry, ctx, selection, orderedKeys, sort, section, now, flat, compact } = props;
  const { t, locale } = useI18n();
  const item = useEntryItem(props);
  const nameId = useId();
  const { time } = entryTime(entry, sort, section);
  const date = new Date(time);
  const owner = ownerLabel(entry, t);
  const size = uploadingOf(entry) === null ? entrySizeText(entry, locale) : null;
  const location = flat ? (props.locationOf?.(entry) ?? null) : null;
  const showCheck = item.checkable && (!compact || selection.mode);

  // Every cell is its own containing block (see CellLink); the row itself must not be.
  return (
    <EntryContextMenu
      entry={entry}
      ctx={ctx}
      move={item.move}
      onAction={item.onAction}
      bulk={item.bulk}
      disabled={item.busy}
      className="group has-[a:focus-visible]:bg-muted/60 data-dragging:opacity-50 data-over:bg-muted data-over:ring-2 data-over:ring-ring/60 data-over:ring-inset data-selected:bg-muted/60"
      render={(trigger) => <TableRow {...trigger} {...entryRootProps(entry, item)} />}
    >
      <TableCell className="w-0 py-1.5 ps-3 pe-0">
        {showCheck && <EntryCheckbox entry={entry} name={item.name} selection={selection} orderedKeys={orderedKeys} />}
      </TableCell>
      <TableCell className="relative w-full max-w-0 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <EntryIcon entry={entry} open={item.drop.isOver} />
          {item.href === null ? (
            <span id={nameId} dir="auto" className="min-w-0 truncate text-[13px] font-medium text-foreground">
              {item.name}
            </span>
          ) : (
            <Link
              id={nameId}
              href={item.href}
              prefetch={false}
              dir="auto"
              draggable={item.drag.draggable ? false : undefined}
              onClick={item.onLinkClick}
              className="min-w-0 truncate text-[13px] font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
            >
              {item.name}
            </Link>
          )}
          {!compact && <EntryBadges entry={entry} section={section} />}
          {entry.starred && compact && (
            <>
              <Star aria-hidden className="h-3 w-3 shrink-0 fill-current text-muted-foreground" />
              <span className="sr-only">{t("drive.nav.starred")}</span>
            </>
          )}
        </div>
      </TableCell>
      {!compact && (
        <TableCell className="relative hidden py-1.5 md:table-cell">
          <CellLink item={item} />
          {owner !== null ? (
            <span className="flex max-w-48 min-w-0 items-center gap-2">
              <Avatar size="xs" name={entry.ownerName ?? owner} />
              <span className="truncate text-[12.5px] text-foreground">{owner}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      <TableCell className="relative py-1.5 font-mono text-[12px] whitespace-nowrap text-muted-foreground tabular-nums">
        {/* The overlay sits on top of <time>, so it carries the full date tooltip. */}
        <CellLink item={item} title={formatDocDateTime(date, locale)} />
        <time dateTime={date.toISOString()} title={formatDocDateTime(date, locale)}>
          {formatDocStamp(date, locale, now)}
        </time>
      </TableCell>
      {!compact && (
        <TableCell className="relative hidden py-1.5 text-end font-mono text-[12px] whitespace-nowrap text-muted-foreground tabular-nums md:table-cell">
          <CellLink item={item} />
          {size ?? "—"}
        </TableCell>
      )}
      {!compact && flat && (
        <TableCell className="relative hidden max-w-56 py-1.5 lg:table-cell">
          <CellLink item={item} />
          <span dir="auto" className="block truncate text-[12.5px] text-muted-foreground" title={location ?? undefined}>
            {location ?? "—"}
          </span>
        </TableCell>
      )}
      <TableCell className="relative w-0 py-1 ps-0 pe-1.5">
        <CellLink item={item} />
        <div className="relative z-10 flex items-center justify-end gap-0.5">
          {!compact && entry.access.canStar && !ctx.offline && ctx.surface === "manager" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-pressed={entry.starred}
              aria-label={entry.starred ? t("drive.menu.unstar") : t("drive.menu.star")}
              aria-describedby={nameId}
              onClick={() => item.onAction(entry.starred ? "unstar" : "star")}
              className={cn("text-muted-foreground hover:text-foreground", entry.starred && "text-foreground")}
            >
              <Star aria-hidden className={cn("h-4 w-4", entry.starred && "fill-current")} />
            </Button>
          )}
          <EntryMenu entry={entry} ctx={ctx} move={item.move} onAction={item.onAction} describedBy={nameId} disabled={item.busy} />
        </div>
      </TableCell>
    </EntryContextMenu>
  );
}

export interface EntryListProps extends EntryViewProps {
  /** Sorted entries (sortDriveEntries). */
  entries: readonly DriveEntry[];
  /** Flat results (search, Recent, Starred, Shared, Trash): adds the Location column. */
  flat?: boolean;
  /** The Location text of an entry (entryLocationLabel). */
  locationOf?(entry: DriveEntry): string | null;
  /** Header clicks change the sort; absent = headers don't sort. */
  onSort?(sort: DriveSort): void;
  /** Phones: name, date and menu only, no header. */
  compact?: boolean;
  /** Id of the results region (the search field's aria-controls). */
  id?: string;
  className?: string;
}

export function EntryList({ entries, flat = false, locationOf, onSort, compact = false, id, className, ...view }: EntryListProps) {
  const fine = useFinePointer();
  const { selection } = view;
  const orderedKeys = useMemo(() => entries.map((entry) => entry.key), [entries]);
  const selectedEntries = useMemo(() => entries.filter((entry) => selection.keys.has(entry.key)), [entries, selection.keys]);
  const common: EntryItemProps = { ...view, orderedKeys, selectedEntries };
  const checked = selectedEntries.length === 0 ? "none" : selectedEntries.length === entries.length ? "all" : "some";

  return (
    <div
      id={id}
      className={cn(FRAME_CLASS, className)}
      onKeyDown={(event) =>
        onDriveResultsKeyDown(event, { entries, selection, ctx: view.ctx, onAction: view.onAction, onBulkAction: view.onBulkAction })
      }
    >
      <Table>
        {!compact && (
          <EntryListHeader
            section={view.section}
            sort={view.sort}
            flat={flat}
            onSort={onSort}
            checked={checked}
            checkable={fine || selection.mode}
            onToggleAll={() => (checked === "all" ? selection.clear() : selection.set(orderedKeys))}
          />
        )}
        <TableBody>
          {entries.map((entry) => (
            <EntryRow key={entry.key} {...common} entry={entry} flat={flat} compact={compact} locationOf={locationOf} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const SKELETON_WIDTHS = ["62%", "48%", "70%", "55%", "40%", "66%", "52%", "58%"];

/** Placeholder rows while the rows load; announced once as loading. */
export function EntryListSkeleton({ rows = 8, compact = false }: { rows?: number; compact?: boolean }) {
  const t = useT();
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t("drive.home.loading")}</span>
      <div aria-hidden className={FRAME_CLASS}>
        <Table>
          <TableBody>
            {Array.from({ length: rows }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell className="w-full max-w-0 py-2.5 ps-3">
                  <div className="flex items-center gap-2.5">
                    <SkeletonText width="1rem" className="shrink-0" />
                    <SkeletonText width={SKELETON_WIDTHS[index % SKELETON_WIDTHS.length]} />
                  </div>
                </TableCell>
                {!compact && (
                  <TableCell className="hidden py-2.5 md:table-cell">
                    <SkeletonText width="6rem" />
                  </TableCell>
                )}
                <TableCell className="py-2.5">
                  <SkeletonText width="4rem" />
                </TableCell>
                {!compact && (
                  <TableCell className="hidden py-2.5 md:table-cell">
                    <SkeletonText width="3rem" />
                  </TableCell>
                )}
                <TableCell className="w-0 py-2.5 pe-3">
                  <SkeletonText width="2rem" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
