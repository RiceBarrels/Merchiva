"use client";

// Slide menu (slides.md §7.2, §8): new, duplicate, delete, skip, reorder, background, transition and theme. The
// commands act on the slides picked in the rail (else the current slide); background and theme open the theme panel.
import { ArrowDown, ArrowUp, CopyPlus, EyeOff, Eye, ImageOff, Palette, Paintbrush, Plus, Sparkles, Trash2 } from "lucide-react";

import { MENUBAR_TRIGGER_CLASS } from "@/components/docs/menubar/doc-menubar";
import {
  DocMenu, DocMenuContent, DocMenuItem, DocMenuRadioGroup, DocMenuRadioItem, DocMenuSeparator, DocMenuSub, DocMenuSubContent,
  DocMenuSubTrigger, DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus, useSlidesSelection, useSlidesShortcutLabels } from "@/components/slides/chrome/chrome-hooks";
import { pickedSlides, slideMove } from "@/components/slides/menubar/slide-order";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";
import { DEFAULT_TRANSITION_MS } from "@/lib/slides/model/defaults";
import type { SlideTransition } from "@/lib/slides/model/types";

export function SlideMenu() {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const finalFocus = useSlidesFinalFocus();
  const { el, ui, dispatch, deck } = useSlidesEditor();
  const sel = useSlidesSelection();
  const readOnly = !sel.writable;
  const picked = pickedSlides(ui.slideSelection, sel.slide?.id ?? null).filter((id) => deck.slides.has(id));
  const none = readOnly || picked.length === 0;
  const allSkipped = picked.length > 0 && picked.every((id) => deck.slides.get(id)?.hidden === true);
  const up = slideMove(deck.slideIds, picked, -1);
  const down = slideMove(deck.slideIds, picked, 1);
  const transition = sel.slide?.transition?.type ?? "none";
  const openThemePanel = () => {
    if (ui.rightPanel !== "theme") dispatch({ type: "openPanel", panel: "theme" });
  };
  const fade: SlideTransition = { type: "fade", durationMs: DEFAULT_TRANSITION_MS };

  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("slides.menubar.slide")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-60">
        <DocMenuItem icon={Plus} shortcut={label("newSlide")} disabled={readOnly} onClick={() => el.addSlide()}>
          {t("slides.slide.new")}
        </DocMenuItem>
        <DocMenuItem icon={CopyPlus} disabled={none} onClick={el.duplicateSlides}>
          {t("slides.slide.duplicate")}
        </DocMenuItem>
        <DocMenuItem icon={Trash2} disabled={none || picked.length >= deck.slideIds.length} onClick={el.deleteSlides}>
          {t("slides.slide.delete")}
        </DocMenuItem>
        <DocMenuItem icon={allSkipped ? Eye : EyeOff} disabled={none} onClick={el.toggleSkip}>
          {t(allSkipped ? "slides.slide.unskip" : "slides.slide.skip")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuItem icon={ArrowUp} disabled={readOnly || up === null} onClick={() => up && el.moveSlides(up.ids, up.before)}>
          {t("slides.slide.moveUp")}
        </DocMenuItem>
        <DocMenuItem icon={ArrowDown} disabled={readOnly || down === null} onClick={() => down && el.moveSlides(down.ids, down.before)}>
          {t("slides.slide.moveDown")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuItem icon={Paintbrush} disabled={none} onClick={openThemePanel}>
          {t("slides.slide.background")}
        </DocMenuItem>
        <DocMenuItem icon={ImageOff} disabled={none || picked.every((id) => deck.slides.get(id)?.background === null)} onClick={() => el.setBackground(null)}>
          {t("slides.slide.resetBackground")}
        </DocMenuItem>
        <DocMenuSub>
          <DocMenuSubTrigger icon={Sparkles} disabled={none}>
            {t("slides.slide.transition")}
          </DocMenuSubTrigger>
          <DocMenuSubContent className="min-w-52">
            <DocMenuRadioGroup value={transition === "none" ? "none" : "fade"} onValueChange={(value: string) => el.setTransition(value === "fade" ? fade : null)}>
              <DocMenuRadioItem closeOnClick value="none">{t("slides.slide.transitionNone")}</DocMenuRadioItem>
              <DocMenuRadioItem closeOnClick value="fade">{t("slides.slide.transitionFade")}</DocMenuRadioItem>
            </DocMenuRadioGroup>
            <DocMenuSeparator />
            <DocMenuItem onClick={() => el.setTransition(sel.slide?.transition ?? null, true)}>{t("slides.slide.applyToAll")}</DocMenuItem>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={Palette} disabled={readOnly} onClick={openThemePanel}>
          {t("slides.slide.theme")}
        </DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}
