"use client";

// The preview sheet of the Drive manager page (?preview=<key>): a panel on the right on desktop,
// a page of its own on phones. Files and app-stored links show their preview (PreviewBody) with
// the details folded away below; folders and documents never preview, so for them the sheet is
// their details with an "Open" button. Previous / next (and the arrow keys) step through the
// files of the listing the entry was opened from.
//
// Every action comes from the caller's runner (the same one the list uses), filtered by the
// entry's access through driveActionGroups, so the sheet never offers what the module would
// refuse. Downloads start inside the click (downloadEntries needs the user activation).

import { useEffectEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, FilePlusCorner, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EntryIcon } from "@/components/drive/list/entry-icon";
import { EntryMenu } from "@/components/drive/list/entry-menu";
import { driveActionGroups, type DriveAction } from "@/components/drive/model/actions";
import { folderContainer, type DriveTree } from "@/components/drive/model/entries";
import type { DriveEntry } from "@/components/drive/model/types";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { EntryDetails } from "./details-list";
import { openAsActionOf, type DriveEntryActions, type PreviewEntryActions } from "./open-entry";
import { PreviewBody } from "./preview-body";
import { entryLabel, isPreviewable } from "./preview-mode";
import { arrowStep, previewNeighbours } from "./preview-state";

export interface DrivePreviewSheetProps {
  /** The entry named by ?preview=; null closes the sheet. */
  entry: DriveEntry | null;
  /** The listing it was opened from, in display order: previous / next step through its files. */
  siblings: readonly DriveEntry[];
  onClose(): void;
  /** Show another entry (the caller writes ?preview=). */
  onNavigate(entry: DriveEntry): void;
  /** The manager's action runner; null shows the sheet read-only. */
  actions?: DriveEntryActions | null;
  /** For the location path and a folder's item count. */
  tree?: Pick<DriveTree, "pathOf" | "childrenOf"> | null;
}

export function DrivePreviewSheet({ entry, siblings, onClose, onNavigate, actions = null, tree = null }: DrivePreviewSheetProps) {
  // The last entry stays on screen while the sheet slides away.
  const [last, setLast] = useState<DriveEntry | null>(entry);
  if (entry !== null && entry !== last) setLast(entry);
  const shown = entry ?? last;
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {shown && (
        <SheetContent side="right" showCloseButton={false} className="flex flex-col p-0 sm:max-w-[min(960px,92vw)]">
          <PreviewPanel entry={shown} siblings={siblings} onClose={onClose} onNavigate={onNavigate} actions={actions} tree={tree} />
        </SheetContent>
      )}
    </Sheet>
  );
}

/** Focus in any of these keeps its own use of the arrow keys. */
const OWN_ARROWS =
  'input, textarea, select, video, audio, iframe, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="menuitem"], [role="listbox"], [role="slider"], [role="grid"]';

/** A scroll area marked data-own-arrows (text, CSV) keeps them too, while it has anything to scroll sideways. */
function scrollsSideways(target: Element | null): boolean {
  const scroller = target?.closest("[data-own-arrows]");
  return scroller instanceof HTMLElement && scroller.scrollWidth > scroller.clientWidth;
}

/** The space badge: where the entry lives, or which app keeps it. */
function badgeText(entry: DriveEntry, t: (key: string) => string): string | null {
  if (entry.type === "virtual") return t(`drive.apps.sources.${entry.source}`);
  if ((entry.type === "doc" || entry.type === "sheet" || entry.type === "slides") && entry.sharedWithMe) return t("drive.list.badgeShared");
  if (entry.location?.space === "store") return t("drive.list.badgeStore");
  if (entry.location?.space !== "my") return null;
  return entry.isMine ? t("drive.nav.my") : fmt(t("drive.nav.memberFiles"), { name: entry.ownerName ?? t("drive.list.formerMember") });
}

const OPEN_AS_LABEL = { doc: "drive.menu.openAsDoc", sheet: "drive.menu.openAsSheet", slides: "drive.menu.openAsSlides" } as const;

interface PreviewPanelProps extends Omit<DrivePreviewSheetProps, "entry" | "actions" | "tree"> {
  entry: DriveEntry;
  actions: DriveEntryActions | null;
  tree: Pick<DriveTree, "pathOf" | "childrenOf"> | null;
}

function PreviewPanel({ entry, siblings, onClose, onNavigate, actions, tree }: PreviewPanelProps) {
  const { t, dir } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const previewable = isPreviewable(entry);
  const label = entryLabel(entry, t);

  const [details, setDetails] = useState({ key: entry.key, open: !previewable });
  const detailsOpen = details.key === entry.key ? details.open : !previewable;
  const setDetailsOpen = (open: boolean) => setDetails({ key: entry.key, open });

  const { files, prev, next } = previewNeighbours(entry, siblings);

  const step = useEffectEvent((delta: -1 | 1) => {
    const target = delta < 0 ? prev : next;
    if (target) onNavigate(target);
  });
  const rtl = dir === "rtl";
  // The dialog leaves focus where it was (the card that opened it); take it, so the arrow keys come here and not to
  // the list behind the sheet.
  useEffect(() => {
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const delta = arrowStep(event, rtl);
      if (delta === null) return;
      const target = event.target instanceof Element ? event.target : null;
      // Only while the sheet is the top layer: focus in it, or nowhere in particular (not in a dialog above it).
      const inPanel = target !== null && rootRef.current?.contains(target) === true;
      if (!inPanel && target !== null && target !== document.body && target !== document.documentElement) return;
      if (target?.closest(OWN_ARROWS) || scrollsSideways(target)) return;
      event.preventDefault();
      step(delta);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rtl]);

  const available: readonly DriveAction[] = actions ? driveActionGroups(entry, actions.ctx, actions.moveFor(entry)).flat() : [];
  const running = actions?.runningFor?.(entry) ?? null;
  const run = (action: DriveAction) => actions?.onAction(entry, action);
  const bodyActions: PreviewEntryActions | null = actions ? { available, onAction: run, running } : null;
  const openAs = openAsActionOf(available);
  const canOpen = !previewable && available.includes("open");
  const badge = badgeText(entry, t);

  const onMenuAction = (action: DriveAction) => {
    if (action === "preview") return;
    if (action === "details") setDetailsOpen(true);
    else run(action);
  };

  const path = tree && entry.type !== "virtual" ? tree.pathOf(entry) : [];
  const childCount = tree && entry.type === "folder" ? tree.childrenOf(folderContainer(entry)).length : null;
  const detailsList = <EntryDetails entry={entry} path={path} childCount={childCount} />;

  return (
    <div ref={rootRef} tabIndex={-1} className="flex h-full min-h-0 flex-col outline-none">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <EntryIcon entry={entry} className="max-sm:hidden" />
        <SheetTitle mobileTitle={label} dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium max-[639px]:sr-only">
          {label}
        </SheetTitle>
        {badge && (
          <StatusBadge className="min-w-0 max-w-40 max-sm:hidden">
            <span dir="auto" className="truncate">{badge}</span>
          </StatusBadge>
        )}
        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          {files.length > 1 && (
            <>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("drive.preview.previous")} disabled={!prev} onClick={() => prev && onNavigate(prev)}>
                <ChevronLeft aria-hidden className="rtl:rotate-180" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("drive.preview.next")} disabled={!next} onClick={() => next && onNavigate(next)}>
                <ChevronRight aria-hidden className="rtl:rotate-180" />
              </Button>
            </>
          )}
          {available.includes("download") && (
            <Button type="button" variant="ghost" size="sm" disabled={running !== null} onClick={() => run("download")}>
              <Download aria-hidden />
              <span className="max-sm:sr-only">{t("drive.preview.download")}</span>
            </Button>
          )}
          {openAs && (
            <Button type="button" variant="ghost" size="sm" disabled={running !== null} onClick={() => run(openAs.action)}>
              <FilePlusCorner aria-hidden />
              <span className="max-sm:sr-only">{running === openAs.action ? t("drive.preview.importing") : t(OPEN_AS_LABEL[openAs.kind])}</span>
            </Button>
          )}
          {canOpen && (
            <Button type="button" size="sm" disabled={running !== null} onClick={() => run("open")}>
              <FolderOpen aria-hidden />
              {t("drive.preview.open")}
            </Button>
          )}
          {actions && (
            <EntryMenu entry={entry} ctx={actions.ctx} move={actions.moveFor(entry)} onAction={onMenuAction} disabled={running !== null} />
          )}
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("drive.preview.close")} onClick={onClose}>
            <X aria-hidden />
          </Button>
        </div>
      </div>

      {previewable ? (
        <>
          <div className="flex h-[60vh] min-h-0 flex-col bg-muted/30 sm:h-auto sm:flex-1">
            <PreviewBody key={entry.key} entry={entry} actions={bodyActions} />
          </div>
          <div className="border-t border-border">
            <button
              type="button"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("drive.preview.details")}
              <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform duration-200", detailsOpen && "rotate-180")} />
            </button>
            {detailsOpen && <div className="max-h-[40vh] overflow-y-auto px-4 pb-4">{detailsList}</div>}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex items-center gap-3">
            <EntryIcon entry={entry} className="h-8 w-8" />
            <p dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium">{label}</p>
          </div>
          {detailsList}
        </div>
      )}
    </div>
  );
}
