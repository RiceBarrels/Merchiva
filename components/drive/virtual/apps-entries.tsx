"use client";

// The files of one "Stored in apps" source, as a grid (image thumbnails) or a compact list,
// under sub-headings for the conversation, task or item they belong to. Picking one opens its
// preview; the "⋮" menu is the manager's (preview, download, open in the app it came from).

import { useState } from "react";
import { EntryIcon } from "@/components/drive/list/entry-icon";
import { EntryMenu } from "@/components/drive/list/entry-menu";
import type { DriveAction } from "@/components/drive/model/actions";
import type { DriveView, VirtualEntry } from "@/components/drive/model/types";
import type { DriveEntryActions } from "@/components/drive/preview/open-entry";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Num } from "@/components/ui/num";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { cn } from "@/lib/utils";

export interface VirtualEntryGroup {
  /** '' for files that belong to nothing in particular (no sub-heading). */
  label: string;
  entries: VirtualEntry[];
}

/** Entries by `group`, groups in the order their first entry appears (the newest group first). */
export function groupVirtualEntries(entries: readonly VirtualEntry[]): VirtualEntryGroup[] {
  const groups = new Map<string, VirtualEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.group);
    if (list) list.push(entry);
    else groups.set(entry.group, [entry]);
  }
  return [...groups].map(([label, list]) => ({ label, entries: list }));
}

const DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

interface ItemProps {
  entry: VirtualEntry;
  onPick(entry: VirtualEntry): void;
  actions: DriveEntryActions | null;
}

/** The entry's "⋮" menu, when the caller runs actions. */
function ItemMenu({ entry, actions, className }: { entry: VirtualEntry; actions: DriveEntryActions | null; className?: string }) {
  if (!actions) return null;
  const onAction = (action: DriveAction) => actions.onAction(entry, action);
  return (
    <EntryMenu
      entry={entry}
      ctx={actions.ctx}
      move={actions.moveFor(entry)}
      onAction={onAction}
      disabled={(actions.runningFor?.(entry) ?? null) !== null}
      className={className}
    />
  );
}

/** An image link drawn small; the kind icon when it isn't an image or doesn't load. */
function Thumb({ entry }: { entry: VirtualEntry }) {
  const [failed, setFailed] = useState(false);
  if (entry.fileKind !== "image" || failed) return <EntryIcon entry={entry} className="h-8 w-8" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a link another app keeps, not a build asset
    <img
      src={entry.url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function metaText(entry: VirtualEntry, date: string): string {
  return [entry.ownerName, date].filter((part) => !!part).join(" · ");
}

function GridItem({ entry, onPick, actions }: ItemProps) {
  const formatDate = useDateFormat();
  const date = entry.updatedAt > 0 ? formatDate(entry.updatedAt, DATE) : "";
  return (
    <li className="relative overflow-hidden rounded-lg border border-border bg-card">
      <button type="button" onClick={() => onPick(entry)} className="flex w-full flex-col text-start transition-colors hover:bg-muted/50">
        <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted">
          <Thumb entry={entry} />
        </span>
        <span className="block min-w-0 px-2.5 py-2">
          <span dir="auto" className="block truncate text-[13px] font-medium">{entry.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{metaText(entry, date)}</span>
        </span>
      </button>
      <ItemMenu entry={entry} actions={actions} className="absolute end-1 top-1 bg-background/80" />
    </li>
  );
}

function ListItem({ entry, onPick, actions }: ItemProps) {
  const formatDate = useDateFormat();
  const date = entry.updatedAt > 0 ? formatDate(entry.updatedAt, DATE) : "";
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted/50">
      <button type="button" onClick={() => onPick(entry)} className="flex min-w-0 flex-1 items-center gap-3 py-0.5 text-start">
        <EntryIcon entry={entry} />
        <span dir="auto" className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
        {entry.ownerName && <span dir="auto" className="hidden w-40 truncate text-xs text-muted-foreground sm:block">{entry.ownerName}</span>}
        {date && <Num size="xs" muted value={date} className="shrink-0" />}
      </button>
      <ItemMenu entry={entry} actions={actions} />
    </li>
  );
}

export interface VirtualEntriesProps {
  entries: readonly VirtualEntry[];
  view: DriveView;
  onPick(entry: VirtualEntry): void;
  actions: DriveEntryActions | null;
}

export function VirtualEntries({ entries, view, onPick, actions }: VirtualEntriesProps) {
  const groups = groupVirtualEntries(entries);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.label} className="space-y-2">
          {group.label && (
            <Eyebrow as="h3" dir="auto" className="truncate normal-case tracking-normal">
              {group.label}
            </Eyebrow>
          )}
          <ul
            className={cn(
              view === "grid"
                ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                : "divide-y divide-border rounded-lg border border-border",
            )}
          >
            {group.entries.map((entry) =>
              view === "grid"
                ? <GridItem key={entry.key} entry={entry} onPick={onPick} actions={actions} />
                : <ListItem key={entry.key} entry={entry} onPick={onPick} actions={actions} />,
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
