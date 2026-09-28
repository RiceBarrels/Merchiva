"use client";

// "New" on the Drive page: New folder · Upload files · Upload folder (browsers that can pick a
// folder) · Doc (when the Docs app is installed) · Sheet · Slides. The pickers open straight
// from the item's click, so the browser still sees the user's gesture. When nothing can be
// created (no create target here, offline, the notice not acknowledged) the button is disabled
// and a tooltip says why.

import { FilePlus2, FolderPlus, FolderUp, Loader2, Plus, Presentation, Sheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import type { DriveDocKind } from "@/components/drive/model/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export type NewMenuBusy = "folder" | DriveDocKind | null;

export interface NewMenuProps {
  /** Why nothing can be created here (already translated); null = enabled. */
  disabledReason: string | null;
  /** The Docs app is installed: offer a Doc. */
  docsInstalled: boolean;
  /** This device can pick a whole folder (useDriveFilePickers().supportsFolder). */
  supportsFolder: boolean;
  onNewFolder(): void;
  onUploadFiles(): void;
  onUploadFolder(): void;
  onNewDocument(kind: DriveDocKind): void;
  /** Something is being created: the button spins and the menu stays shut. */
  busy?: NewMenuBusy;
  className?: string;
}

export function NewMenu({
  disabledReason,
  docsInstalled,
  supportsFolder,
  onNewFolder,
  onUploadFiles,
  onUploadFolder,
  onNewDocument,
  busy = null,
  className,
}: NewMenuProps) {
  const t = useT();
  const disabled = disabledReason !== null || busy !== null;
  const button = (
    <Button type="button" size="sm" disabled={disabled} aria-busy={busy !== null || undefined} className={cn("gap-1.5", className)}>
      {busy !== null ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Plus aria-hidden className="h-3.5 w-3.5" />}
      <span className="sr-only sm:not-sr-only">{t("drive.menu.new")}</span>
    </Button>
  );

  if (disabledReason !== null) {
    return (
      <Tooltip>
        {/* A disabled button gets no pointer events; the wrapper carries the tooltip and stays focusable. */}
        <TooltipTrigger render={<span tabIndex={0} className="inline-flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}>
          {button}
          <span className="sr-only">{disabledReason}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }
  if (busy !== null) return button;

  return (
    <DocMenu>
      <DocMenuTrigger render={button} />
      <DocMenuContent align="end">
        <DocMenuItem icon={FolderPlus} onClick={onNewFolder}>
          {t("drive.menu.newFolder")}
        </DocMenuItem>
        <DocMenuItem icon={Upload} onClick={onUploadFiles}>
          {t("drive.menu.uploadFiles")}
        </DocMenuItem>
        {supportsFolder && (
          <DocMenuItem icon={FolderUp} onClick={onUploadFolder}>
            {t("drive.menu.uploadFolder")}
          </DocMenuItem>
        )}
        <DocMenuSeparator />
        {docsInstalled && (
          <DocMenuItem icon={FilePlus2} onClick={() => onNewDocument("doc")}>
            {t("drive.menu.newDoc")}
          </DocMenuItem>
        )}
        <DocMenuItem icon={Sheet} onClick={() => onNewDocument("sheet")}>
          {t("drive.menu.newSheet")}
        </DocMenuItem>
        <DocMenuItem icon={Presentation} onClick={() => onNewDocument("slides")}>
          {t("drive.menu.newSlides")}
        </DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}
