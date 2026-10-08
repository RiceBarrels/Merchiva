"use client";

// The Drive grid: folders first as compact tiles, then files and documents as cards (the
// Docs grid template), each under an eyebrow when both are present; Recent with the modified
// sort shows date groups instead. On a desktop pointer the empty space between cards takes a
// rubber band (marquee.tsx, loaded on demand). Keyboard shortcuts live on this element only
// (onDriveResultsKeyDown).

import { useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import type { DriveGroupId } from "@/components/drive/model/listing";
import type { DocEntry, DriveEntry, FileEntry, FolderEntry, VirtualEntry } from "@/components/drive/model/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { EntryCard, FolderTile, type EntryItemProps, type EntryViewProps } from "./entry-card";
import { onDriveResultsKeyDown, useFinePointer } from "./use-selection";

const DriveMarquee = dynamic(() => import("./marquee").then((m) => m.DriveMarquee), { ssr: false });

const GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]";

export interface EntryGridGroup {
  id: DriveGroupId;
  entries: readonly DriveEntry[];
}

export interface EntryGridProps extends EntryViewProps {
  /** Sorted entries (sortDriveEntries). */
  entries: readonly DriveEntry[];
  /** Date groups (groupDriveEntries) or null. */
  groups?: readonly EntryGridGroup[] | null;
  /** Rubber-band selection; only ever on with a fine pointer. */
  marquee?: boolean;
  /** Id of the results region (the search field's aria-controls). */
  id?: string;
  className?: string;
}

interface GridBlock {
  key: string;
  /** i18n key of the eyebrow, or null for none. */
  labelKey: string | null;
  folders: readonly FolderEntry[];
  items: readonly (FileEntry | DocEntry | VirtualEntry)[];
}

function splitEntries(entries: readonly DriveEntry[]): { folders: FolderEntry[]; items: (FileEntry | DocEntry | VirtualEntry)[] } {
  const folders: FolderEntry[] = [];
  const items: (FileEntry | DocEntry | VirtualEntry)[] = [];
  for (const entry of entries) {
    if (entry.type === "folder") folders.push(entry);
    else items.push(entry);
  }
  return { folders, items };
}

/** What the grid shows, in display order. */
function gridBlocks(entries: readonly DriveEntry[], groups: readonly EntryGridGroup[] | null | undefined): GridBlock[] {
  if (groups) {
    return groups.map((group) => ({ key: group.id, labelKey: `drive.list.group.${group.id}`, ...splitEntries(group.entries) }));
  }
  const { folders, items } = splitEntries(entries);
  const both = folders.length > 0 && items.length > 0;
  const blocks: GridBlock[] = [];
  if (folders.length > 0) blocks.push({ key: "folders", labelKey: both ? "drive.list.folders" : null, folders, items: [] });
  if (items.length > 0) blocks.push({ key: "files", labelKey: both ? "drive.list.files" : null, folders: [], items });
  return blocks;
}

function GridBlockView({ block, common }: { block: GridBlock; common: EntryItemProps }) {
  const t = useT();
  const headingId = useId();
  return (
    <section aria-labelledby={block.labelKey ? headingId : undefined} className="space-y-2">
      {block.labelKey && (
        <Eyebrow as="h3" id={headingId}>
          {t(block.labelKey)}
        </Eyebrow>
      )}
      {block.folders.length > 0 && (
        <ul className={GRID_CLASS}>
          {block.folders.map((entry) => (
            <li key={entry.key} className="min-w-0">
              <FolderTile {...common} entry={entry} />
            </li>
          ))}
        </ul>
      )}
      {block.items.length > 0 && (
        <ul className={GRID_CLASS}>
          {block.items.map((entry) => (
            <li key={entry.key} className="min-w-0">
              <EntryCard {...common} entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EntryGrid({ entries, groups = null, marquee = false, id, className, ...view }: EntryGridProps) {
  // A callback ref held in state: the marquee binds once the element exists, and no ref is read during render.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const fine = useFinePointer();
  const withMarquee = marquee && fine;
  const blocks = useMemo(() => gridBlocks(entries, groups), [entries, groups]);
  const ordered = useMemo(() => blocks.flatMap((block) => [...block.folders, ...block.items]), [blocks]);
  const orderedKeys = useMemo(() => ordered.map((entry) => entry.key), [ordered]);
  const { selection } = view;
  const selectedEntries = useMemo(() => ordered.filter((entry) => selection.keys.has(entry.key)), [ordered, selection.keys]);
  const common: EntryItemProps = { ...view, orderedKeys, selectedEntries };

  return (
    <div
      ref={setContainer}
      id={id}
      className={cn("relative space-y-5", withMarquee && "select-none", className)}
      onKeyDown={(event) =>
        onDriveResultsKeyDown(event, { entries: ordered, selection, ctx: view.ctx, onAction: view.onAction, onBulkAction: view.onBulkAction })
      }
    >
      {blocks.map((block) => (
        <GridBlockView key={block.key} block={block} common={common} />
      ))}
      {withMarquee && container && <DriveMarquee container={container} selection={selection} />}
    </div>
  );
}

/** Placeholder tiles and cards while the rows load; announced once as loading. */
export function EntryGridSkeleton({ folders = 4, cards = 8 }: { folders?: number; cards?: number }) {
  const t = useT();
  return (
    <div role="status" aria-busy="true" className="space-y-5">
      <span className="sr-only">{t("drive.home.loading")}</span>
      <div aria-hidden className="space-y-3">
        {folders > 0 && (
          <div className={GRID_CLASS}>
            {Array.from({ length: folders }, (_, index) => (
              <div key={index} className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-2.5">
                <SkeletonText width="1rem" className="shrink-0" />
                <SkeletonText width="60%" className="h-3.5" />
              </div>
            ))}
          </div>
        )}
        <div className={GRID_CLASS}>
          {Array.from({ length: cards }, (_, index) => (
            <div key={index} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="aspect-[4/3] w-full border-b border-border bg-muted/50" />
              <div className="flex items-center gap-2 p-2.5">
                <SkeletonText width="1rem" className="shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <SkeletonText width="75%" className="h-3.5" />
                  <SkeletonText width="45%" className="h-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
