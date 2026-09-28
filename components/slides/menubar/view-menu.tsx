"use client";

// View menu (slides.md §7.2, §9): slideshow, grid view, speaker notes, zoom and snapping. The view settings are
// per-viewer preferences, so a viewer who cannot edit has them too.
import { MonitorPlay, Play, ZoomIn } from "lucide-react";

import { MENUBAR_TRIGGER_CLASS } from "@/components/docs/menubar/doc-menubar";
import {
  DocMenu, DocMenuCheckboxItem, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuSub, DocMenuSubContent, DocMenuSubTrigger,
  DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus, useSlidesShortcutLabels } from "@/components/slides/chrome/chrome-hooks";
import { ZoomMenuItems } from "@/components/slides/chrome/zoom-control";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";

export function ViewMenu() {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const finalFocus = useSlidesFinalFocus();
  const { ui, dispatch, actions, deck } = useSlidesEditor();
  const empty = deck.slideIds.length === 0;

  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>
        {t("slides.menubar.view")}
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-64">
        <DocMenuItem icon={Play} shortcut={label("present")} disabled={empty} onClick={() => actions.present("current")}>
          {t("slides.view.present")}
        </DocMenuItem>
        <DocMenuItem inset shortcut={label("presentFromStart")} disabled={empty} onClick={() => actions.present("start")}>
          {t("slides.view.presentFromStart")}
        </DocMenuItem>
        <DocMenuItem icon={MonitorPlay} disabled={empty} onClick={() => actions.present("current", "window")}>
          {t("slides.view.presenterView")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuCheckboxItem closeOnClick checked={ui.view === "grid"} onCheckedChange={(checked) => dispatch({ type: "setView", view: checked ? "grid" : "edit" })}>
          {t("slides.view.grid")}
        </DocMenuCheckboxItem>
        <DocMenuCheckboxItem closeOnClick checked={ui.notesOpen} onCheckedChange={(checked) => dispatch({ type: "toggleNotes", open: checked })}>
          {t("slides.view.speakerNotes")}
        </DocMenuCheckboxItem>
        <DocMenuCheckboxItem closeOnClick checked={ui.snap} onCheckedChange={(checked) => dispatch({ type: "setSnap", snap: checked })}>
          {t("slides.view.snap")}
        </DocMenuCheckboxItem>
        <DocMenuSeparator />
        <DocMenuSub>
          <DocMenuSubTrigger icon={ZoomIn}>{t("slides.view.zoom")}</DocMenuSubTrigger>
          <DocMenuSubContent className="min-w-40">
            <ZoomMenuItems zoom={ui.zoom} onChange={(zoom) => dispatch({ type: "setZoom", zoom })} />
          </DocMenuSubContent>
        </DocMenuSub>
      </DocMenuContent>
    </DocMenu>
  );
}
