"use client";

// Desktop header of the spreadsheet editor (sheets.md §10.3):
//   [Sheet tile → Drive] [title] [star] [save status] ··· [lease control] [collaborators] [Share]
//                        [File ▾]   (Univer's ribbon below carries edit / format / insert / data)
// The save status shows only while this session edits; otherwise the lease control says who does. No star while
// acting for a PIN operator on /store: a document star is written for the signed-in (tablet) account.

import { Lock, Sheet, Users } from "lucide-react";

import { FilePresenceAvatars } from "@/components/files/editor-chrome/file-presence-avatars";
import { FileSaveStatus } from "@/components/files/editor-chrome/file-save-status";
import { FileStarButton } from "@/components/files/editor-chrome/file-star-button";
import { FileTitleInput } from "@/components/files/editor-chrome/file-title-input";
import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";
import { LeaseControl } from "./lease-control";
import { SheetFileMenu } from "./sheet-file-menu";

export function SheetHeader() {
  const t = useT();
  const { doc, access, isStarred, facade, actor, editing, saveState, actions, titleInputRef } = useSheetEditor();
  const trashed = doc.trashedAt !== null;
  const home = t("sheets.homeTooltip");

  return (
    <header className="flex shrink-0 items-start gap-2 border-b border-border bg-background px-3 pt-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={home}
              onClick={actions.goHome}
              className="mt-1 shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          <IconTile icon={Sheet} size="md" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{home}</TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <div className="flex h-8 min-w-0 items-center gap-1">
          <FileTitleInput
            title={doc.title}
            placeholder={t("sheets.untitled")}
            readOnly={!access.canEdit || trashed}
            onCommit={actions.renameTo}
            inputRef={titleInputRef}
          />
          {!actor.acting && <FileStarButton starred={isStarred} disabled={trashed} onToggle={() => void actions.toggleStar()} />}
          {editing && <FileSaveStatus saveState={saveState} />}
        </div>
        <SheetFileMenu />
      </div>

      <div className="flex shrink-0 items-center gap-2 self-center pb-1.5">
        <LeaseControl />
        <FilePresenceAvatars peers={facade.peers} max={4} />
        <Button type="button" size="sm" onClick={actions.openShare}>
          {doc.visibility === "private" ? <Lock className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          {t("sheets.menu.share")}
        </Button>
      </div>
    </header>
  );
}
