"use client";

// Phone and device-panel header of the spreadsheet editor (sheets.md §10.5).
//   reading: Back · title (and, under it, who is editing) · collaborators · Edit / Ask to edit · More
//   editing: Done · Undo · Redo · save status · More
// Back goes to Drive through the surface's opener (a device panel swaps its screen instead of navigating). The lease
// sentence is visible text, never only a tooltip: touch screens cannot show a `title`.

import { ChevronLeft, MoreVertical, Redo2, Undo2 } from "lucide-react";

import { FilePresenceAvatars } from "@/components/files/editor-chrome/file-presence-avatars";
import { FileSaveStatus } from "@/components/files/editor-chrome/file-save-status";
import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import { LeaseControl, leasePresentation } from "@/components/sheets/chrome/lease-control";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

export function MobileSheetHeader() {
  const t = useT();
  const { doc, facade, editing, host, saveState, actions, dispatch } = useSheetEditor();
  const { note } = leasePresentation(facade.lease, t, actions, true);
  const more = (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("sheets.menu.more")} onClick={() => dispatch({ type: "setMobileActions", open: true })}>
      <MoreVertical className="h-4 w-4" />
    </Button>
  );

  if (editing) {
    return (
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-2">
        <Button type="button" size="sm" onClick={() => void actions.stopEditing()}>
          {t("sheets.lease.done")}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("docs.edit.undo")} disabled={!host} onClick={() => host?.undo()}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("docs.edit.redo")} disabled={!host} onClick={() => host?.redo()}>
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <FileSaveStatus saveState={saveState} compact />
        </div>
        {more}
      </header>
    );
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-1.5">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("sheets.homeTooltip")} onClick={actions.goHome}>
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-medium leading-5 text-foreground">{doc.title || t("sheets.untitled")}</h1>
        {note && (
          <p className="truncate text-xs leading-4 text-muted-foreground" data-sheet-lease-note="">
            {note}
          </p>
        )}
      </div>
      <FilePresenceAvatars peers={facade.peers} max={2} />
      <LeaseControl compact />
      {more}
    </header>
  );
}
