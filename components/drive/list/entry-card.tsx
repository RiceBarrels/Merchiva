"use client";

// One Drive entry on the manager grid: a FolderTile (a compact row of folder, name and menu)
// or an EntryCard (thumbnail, name, meta line). Shared with the list rows (entry-list.tsx):
// the view props every item receives, the selection checkbox and useEntryItem, which bundles
// what an item needs — its name, selection, drag source, drop target (folders), link click
// and its menus.
//
// The name is a real link stretched over the card: a folder opens in place, a
// file previews, a document opens its editor, and Mod/middle-click reach the browser shell as
// link clicks. A plain click the page handles in place (openInPlace) skips the link. In touch
// selection mode a tap toggles instead; Shift+click extends the selection. The card's picture
// is thumb/entry-thumb.tsx.

import { useId, useRef } from "react";
import Link from "next/link";
import { Loader2, Lock, Star, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { EntryContextMenu, EntryMenu, type EntryMenuBulk } from "@/components/drive/list/entry-menu";
import { EntryIcon } from "@/components/drive/list/entry-icon";
import { EntryThumb } from "@/components/drive/list/thumb/entry-thumb";
import { entrySizeText } from "@/components/drive/model/entry-size";
import type { ActionContext, DriveAction, DriveBulkAction } from "@/components/drive/model/actions";
import { folderContainer } from "@/components/drive/model/entries";
import { entryRecentTime } from "@/components/drive/model/listing";
import type { DocEntry, DriveEntry, DriveSection, DriveSort, FileEntry, FolderEntry, VirtualEntry } from "@/components/drive/model/types";
import { formatDocDateTime, formatDocStamp } from "@/components/docs/home/format";
import { useI18n, useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { useDriveDropTarget, useEntryDrag, type DriveDropHandlers, type EntryDrag, type EntryDropTarget } from "./use-entry-dnd";
import { useFinePointer, type DriveSelection } from "./use-selection";

/** What the grid and the list hand every item. */
export interface EntryViewProps {
  section: DriveSection;
  sort: DriveSort;
  /** useMinuteClock(): date stamps roll over without a reload. */
  now: number;
  ctx: ActionContext;
  selection: DriveSelection;
  /** Where an entry's name links: a folder opens in place, a file previews, a document opens its editor. */
  hrefFor(entry: DriveEntry): string;
  /**
   * Handles a plain click on an entry's link instead of navigating (true), e.g. a file preview opened
   * through useDriveUrlState().go, so closing it can step Back. Absent or false: the link navigates.
   */
  openInPlace?(entry: DriveEntry): boolean;
  /** moveRoots for one entry; asked only for movable entries at a root (where the shortcuts show). */
  movesFor?(entry: DriveEntry): { toStore: boolean; toMy: boolean };
  onAction(entry: DriveEntry, action: DriveAction): void;
  onBulkAction(entries: readonly DriveEntry[], action: DriveBulkAction): void;
  /** Moves by drag and drop; null / absent = off (read-only views). */
  drop?: DriveDropHandlers | null;
  /** Entries with an action running: their menus are disabled. */
  busyKeys?: ReadonlySet<string>;
}

export interface EntryItemProps extends EntryViewProps {
  /** Every visible key in display order (Shift+click ranges). */
  orderedKeys: readonly string[];
  /** The selected entries, resolved (the context menu of a selected entry acts on all of them). */
  selectedEntries: readonly DriveEntry[];
}

const NO_MOVES = { toStore: false, toMy: false };

/** The name to show: the entry's own, else the untitled label of its kind. */
export function entryDisplayName(entry: DriveEntry, t: (key: string) => string): string {
  const name = entry.name.trim();
  if (name) return entry.name;
  return t(`drive.list.untitled.${entry.type === "virtual" ? "file" : entry.type}`);
}

export type EntryTimeKind = "modified" | "created" | "trashed";

/** The date an item shows for the sort and section: trashed in Trash, created for that sort, else modified. */
export function entryTime(entry: DriveEntry, sort: DriveSort, section: DriveSection): { time: number; kind: EntryTimeKind } {
  if (section === "trash") return { time: entry.trashedAt ?? entry.updatedAt, kind: "trashed" };
  if (sort === "created") return { time: entry.createdAt, kind: "created" };
  return { time: section === "recent" ? entryRecentTime(entry) : entry.updatedAt, kind: "modified" };
}

/** An uploaded file that is still on its way (this tab or another device). */
export function uploadingOf(entry: DriveEntry): "local" | "elsewhere" | null {
  return entry.type === "file" ? entry.uploading : null;
}

export interface EntryItem {
  name: string;
  selected: boolean;
  busy: boolean;
  /** Show the selection checkbox at all (a fine pointer, or touch selection mode). */
  checkable: boolean;
  drag: EntryDrag;
  drop: EntryDropTarget;
  move: { toStore: boolean; toMy: boolean };
  bulk: EntryMenuBulk | null;
  /** The name links nowhere while the file is still uploading. */
  href: string | null;
  onLinkClick(event: React.MouseEvent<HTMLAnchorElement>): void;
  onAction(action: DriveAction): void;
}

/** Everything one grid item or list row needs. */
export function useEntryItem(props: EntryItemProps & { entry: DriveEntry }): EntryItem {
  const t = useT();
  const fine = useFinePointer();
  const { entry, selection, orderedKeys, selectedEntries } = props;
  const selected = selection.isSelected(entry.key);
  const drag = useEntryDrag(entry, selection);
  const folderTarget = entry.type === "folder" && entry.trashedAt === null ? folderContainer(entry) : null;
  const drop = useDriveDropTarget(folderTarget, props.drop);
  const atRoot = entry.location !== null && entry.location.parentId === "" && entry.trashedAt === null;
  const move = atRoot && entry.access.canMove && props.movesFor ? props.movesFor(entry) : NO_MOVES;
  const bulk: EntryMenuBulk | null =
    selected && selectedEntries.length > 1
      ? { entries: selectedEntries, section: props.section, onAction: (action) => props.onBulkAction(selectedEntries, action) }
      : null;

  const onLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (selection.mode) {
      event.preventDefault();
      selection.toggle(entry.key);
      return;
    }
    if (event.shiftKey && selection.keys.size > 0) {
      event.preventDefault();
      selection.extendTo(entry.key, orderedKeys);
      return;
    }
    // Modified and middle clicks stay link clicks (the browser shell opens them in a tab).
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (plain && !event.defaultPrevented && props.openInPlace?.(entry)) event.preventDefault();
  };

  return {
    name: entryDisplayName(entry, t),
    selected,
    busy: props.busyKeys?.has(entry.key) ?? false,
    checkable: fine || selection.mode,
    drag,
    drop,
    move,
    bulk,
    href: uploadingOf(entry) === null ? props.hrefFor(entry) : null,
    onLinkClick,
    onAction: (action) => props.onAction(entry, action),
  };
}

/** Root props of an item: a drag source (and, for folders, a drop target) the marquee and the keyboard can find. */
export type EntryRootProps = Pick<
  React.HTMLAttributes<HTMLElement>,
  "draggable" | "onDragStart" | "onDragEnd" | "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop" | "aria-busy"
> & {
  "data-drive-entry": string;
  "data-selected"?: true;
  "data-over"?: true;
  "data-dragging"?: true;
};

export function entryRootProps(entry: DriveEntry, item: EntryItem): EntryRootProps {
  return {
    "data-drive-entry": entry.key,
    "data-selected": item.selected || undefined,
    "data-over": item.drop.isOver || undefined,
    "data-dragging": item.drag.dragging || undefined,
    "aria-busy": item.busy || undefined,
    draggable: item.drag.draggable || undefined,
    onDragStart: item.drag.draggable ? item.drag.onDragStart : undefined,
    onDragEnd: item.drag.draggable ? item.drag.onDragEnd : undefined,
    ...item.drop.handlers,
  };
}

export interface EntryCheckboxProps {
  entry: DriveEntry;
  name: string;
  selection: DriveSelection;
  orderedKeys: readonly string[];
  className?: string;
}

/** Selects one entry; Shift+click extends from the last one ticked. */
export function EntryCheckbox({ entry, name, selection, orderedKeys, className }: EntryCheckboxProps) {
  const t = useT();
  // Base UI reports the change from its hidden input, without the pointer's modifier keys.
  const shiftRef = useRef(false);
  return (
    <Checkbox
      checked={selection.isSelected(entry.key)}
      aria-label={fmt(t("drive.list.select"), { name })}
      onPointerDown={(event) => {
        shiftRef.current = event.shiftKey;
      }}
      onCheckedChange={() => {
        const extend = shiftRef.current;
        shiftRef.current = false;
        if (extend) selection.extendTo(entry.key, orderedKeys);
        else selection.toggle(entry.key);
      }}
      className={cn("relative z-10 bg-background", className)}
    />
  );
}

/** What the space icon says to a screen reader: Store, the viewer's own files, or whose files these are. */
export function spaceHintText(entry: DriveEntry, t: (key: string) => string): string | null {
  const space = entry.location?.space;
  if (!space) return null;
  if (space === "store") return t("drive.list.storeHint");
  if (entry.isMine) return t("drive.list.privateHint");
  return entry.ownerName ? fmt(t("drive.list.memberHint"), { name: entry.ownerName }) : t("drive.list.formerMemberHint");
}

/** Lock (My files) or people (Store), with the hint for screen readers. */
export function SpaceHint({ entry, className }: { entry: DriveEntry; className?: string }) {
  const t = useT();
  const text = spaceHintText(entry, t);
  if (text === null) return null;
  const Icon = entry.location?.space === "store" ? Users : Lock;
  return (
    <>
      <Icon aria-hidden className={cn("h-3 w-3 shrink-0", className)} />
      <span className="sr-only">{text}</span>
    </>
  );
}

/** "Uploading" / "Uploading on another device" with a spinner. */
export function UploadingNote({ where }: { where: "local" | "elsewhere" }) {
  const t = useT();
  return (
    <>
      <Loader2 aria-hidden className="h-3 w-3 shrink-0 animate-spin" />
      <span className="truncate">{t(where === "local" ? "drive.list.uploading" : "drive.list.uploadingElsewhere")}</span>
    </>
  );
}

const ITEM_FRAME =
  "group relative min-w-0 rounded-lg border border-border bg-card transition-colors hover:border-foreground/40 " +
  "has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 " +
  "data-selected:border-foreground data-selected:bg-muted/40 data-over:ring-2 data-over:ring-ring/60 data-dragging:opacity-50";

/** A checkbox that shows on hover or focus; pinned (always shown) when selected or in selection mode. */
function checkReveal(pinned: boolean): string | undefined {
  return pinned ? undefined : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
}

/** Stretched name link (or plain text while uploading). */
function EntryName({ item, id, className }: { item: EntryItem; id: string; className?: string }) {
  const classes = cn("block truncate text-[13px] leading-5 font-medium text-foreground outline-none", className);
  if (item.href === null) {
    return (
      <span id={id} dir="auto" className={classes}>
        {item.name}
      </span>
    );
  }
  return (
    <Link
      id={id}
      href={item.href}
      prefetch={false}
      dir="auto"
      draggable={item.drag.draggable ? false : undefined}
      onClick={item.onLinkClick}
      className={cn(classes, "after:absolute after:inset-0 after:content-['']")}
    >
      {item.name}
    </Link>
  );
}

/** A folder on the grid: icon (or the checkbox), name, menu. A drop target for moves. */
export function FolderTile(props: EntryItemProps & { entry: FolderEntry }) {
  const { entry, ctx, selection, orderedKeys } = props;
  const item = useEntryItem(props);
  const nameId = useId();
  const pinned = selection.mode || item.selected;
  return (
    <EntryContextMenu
      entry={entry}
      ctx={ctx}
      move={item.move}
      onAction={item.onAction}
      bulk={item.bulk}
      disabled={item.busy}
      render={(trigger) => <div {...trigger} {...entryRootProps(entry, item)} />}
      className={cn(ITEM_FRAME, "flex h-11 items-center gap-2 ps-2.5 pe-1")}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <EntryIcon
          entry={entry}
          open={item.drop.isOver}
          className={cn(item.checkable && (pinned ? "opacity-0" : "group-hover:opacity-0 group-focus-within:opacity-0"))}
        />
        {item.checkable && (
          <EntryCheckbox
            entry={entry}
            name={item.name}
            selection={selection}
            orderedKeys={orderedKeys}
            className={cn("absolute inset-0", checkReveal(pinned))}
          />
        )}
      </span>
      <EntryName item={item} id={nameId} className="min-w-0 flex-1" />
      <EntryMenu
        entry={entry}
        ctx={ctx}
        move={item.move}
        onAction={item.onAction}
        describedBy={nameId}
        disabled={item.busy}
        className="relative z-10 shrink-0"
      />
    </EntryContextMenu>
  );
}

/** A file or document on the grid: thumbnail, name and a meta line (space, star, date, size). */
export function EntryCard(props: EntryItemProps & { entry: FileEntry | DocEntry | VirtualEntry }) {
  const { entry, ctx, selection, orderedKeys, sort, section, now } = props;
  const { t, locale } = useI18n();
  const item = useEntryItem(props);
  const nameId = useId();
  const uploading = uploadingOf(entry);
  const { time, kind } = entryTime(entry, sort, section);
  const date = new Date(time);
  const size = uploading === null ? entrySizeText(entry, locale) : null;
  const pinned = selection.mode || item.selected;

  return (
    <EntryContextMenu
      entry={entry}
      ctx={ctx}
      move={item.move}
      onAction={item.onAction}
      bulk={item.bulk}
      disabled={item.busy}
      render={(trigger) => <div {...trigger} {...entryRootProps(entry, item)} />}
      className={cn(ITEM_FRAME, "flex h-full flex-col overflow-hidden")}
    >
      <div aria-hidden className="aspect-[4/3] w-full overflow-hidden border-b border-border bg-muted/50">
        <EntryThumb entry={entry} name={item.name} />
      </div>
      <div className="flex items-start gap-2 p-2.5">
        <EntryIcon entry={entry} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <EntryName item={item} id={nameId} />
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
            {uploading !== null ? (
              <UploadingNote where={uploading} />
            ) : (
              <>
                <SpaceHint entry={entry} />
                {entry.starred && (
                  <>
                    <Star aria-hidden className="h-3 w-3 shrink-0 fill-current" />
                    <span className="sr-only">{t("drive.nav.starred")}</span>
                  </>
                )}
                <time dateTime={date.toISOString()} title={formatDocDateTime(date, locale)} className="truncate">
                  {fmt(t(`drive.list.meta.${kind}`), { time: formatDocStamp(date, locale, now) })}
                </time>
                {size !== null && (
                  <span className="shrink-0 font-mono tabular-nums">
                    <span aria-hidden>· </span>
                    {size}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <EntryMenu
          entry={entry}
          ctx={ctx}
          move={item.move}
          onAction={item.onAction}
          describedBy={nameId}
          disabled={item.busy}
          className="relative z-10 -me-1.5 -mt-0.5 shrink-0"
        />
      </div>
      {item.checkable && (
        <EntryCheckbox
          entry={entry}
          name={item.name}
          selection={selection}
          orderedKeys={orderedKeys}
          className={cn("absolute start-2 top-2", checkReveal(pinned))}
        />
      )}
    </EntryContextMenu>
  );
}
