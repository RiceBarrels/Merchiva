"use client";

// Desktop header of the Slides editor (slides.md §7.3): Drive tile · title, star, save status · menu bar |
// collaborators · Slideshow ▾ · Share. The title, star, status and avatars are the shared file-editor chrome
// (components/files/editor-chrome); navigation goes through the editor's actions (useDocsOpenUrl), so inside a device
// panel nothing leaves the panel. The star and Share are left out while acting for a PIN operator on /store: both
// would write for the tablet account (useSlidesFileCommands).
import type { Ref } from "react";
import { ChevronDown, Lock, Play, Presentation, Users } from "lucide-react";

import { DocMenu, DocMenuContent, DocMenuItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { FilePresenceAvatars } from "@/components/files/editor-chrome/file-presence-avatars";
import { FileSaveStatus } from "@/components/files/editor-chrome/file-save-status";
import { FileStarButton } from "@/components/files/editor-chrome/file-star-button";
import { FileTitleInput } from "@/components/files/editor-chrome/file-title-input";
import { useSlidesFinalFocus, useSlidesShortcutLabels } from "@/components/slides/chrome/chrome-hooks";
import { SlidesMenubar } from "@/components/slides/menubar/slides-menubar";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useSlidesFileCommands } from "@/components/slides/editor/use-slides-actions";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";

/** Slideshow from the current slide, with a menu for from-the-start and the presenter view. */
function SlideshowButton() {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const finalFocus = useSlidesFinalFocus();
  const { actions, deck } = useSlidesEditor();
  const empty = deck.slideIds.length === 0;
  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={<Button type="button" variant="outline" size="sm" className="rounded-e-none" disabled={empty} onClick={() => actions.present("current")} />}
        >
          <Play className="h-3.5 w-3.5" />
          {t("slides.header.slideshow")}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("slides.view.present")}
          <span dir="ltr" className="ms-1.5 opacity-70">
            {label("present")}
          </span>
        </TooltipContent>
      </Tooltip>
      <DocMenu>
        <DocMenuTrigger
          disabled={empty}
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("slides.header.slideshowOptions")}
              title={t("slides.header.slideshowOptions")}
              className="-ms-px rounded-s-none"
            />
          }
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </DocMenuTrigger>
        <DocMenuContent finalFocus={finalFocus} align="end" className="min-w-60">
          <DocMenuItem icon={Play} shortcut={label("present")} onClick={() => actions.present("current")}>
            {t("slides.view.present")}
          </DocMenuItem>
          <DocMenuItem inset shortcut={label("presentFromStart")} onClick={() => actions.present("start")}>
            {t("slides.view.presentFromStart")}
          </DocMenuItem>
          <DocMenuItem inset onClick={() => actions.present("current", "window")}>
            {t("slides.view.presenterView")}
          </DocMenuItem>
        </DocMenuContent>
      </DocMenu>
    </div>
  );
}

export interface SlidesHeaderProps {
  /** The title field (the session focuses it for `?new=1`). */
  titleInputRef?: Ref<HTMLInputElement>;
}

export function SlidesHeader({ titleInputRef }: SlidesHeaderProps) {
  const t = useT();
  const { doc, isStarred, canEditNow, saveState, collab, peers, actions, dispatch, refs } = useSlidesEditor();
  const commands = useSlidesFileCommands();
  const trashed = doc.trashedAt !== null;
  const home = t("slides.homeTooltip");

  const jumpTo = (memberId: string) => {
    const slideId = peers.list.find((peer) => peer.memberId === memberId && peer.slideId !== null)?.slideId;
    if (slideId) dispatch({ type: "selectSlide", slideId });
  };

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
          <IconTile icon={Presentation} size="md" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{home}</TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <div className="flex h-8 min-w-0 items-center gap-1">
          <FileTitleInput
            title={doc.title}
            placeholder={t("slides.untitled")}
            readOnly={!canEditNow || trashed}
            onCommit={actions.renameTo}
            onEnter={() => refs.stageFocus.focus()}
            inputRef={titleInputRef}
          />
          {commands.star && <FileStarButton starred={isStarred} disabled={trashed} onToggle={() => void actions.toggleStar()} />}
          <FileSaveStatus saveState={saveState} />
        </div>
        <SlidesMenubar />
      </div>

      <div className="flex shrink-0 items-center gap-2 self-center pb-1.5">
        <FilePresenceAvatars peers={collab.peers} max={4} onJump={jumpTo} />
        <SlideshowButton />
        {commands.share && (
          <Button type="button" size="sm" onClick={actions.openShare}>
            {doc.visibility === "private" ? <Lock className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {t("docs.share.title")}
          </Button>
        )}
      </div>
    </header>
  );
}
