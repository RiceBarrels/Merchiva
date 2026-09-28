"use client";

// The Slides editor on a phone and inside the device panels of /store and /personal (slides.md §11). It reads the
// editor context like the desktop layout and opens in reading mode: the slide fitted to the width, swipe between
// slides, the strip of thumbnails below. Edit (or a double tap) makes the shell immersive and turns the slide into
// the touch stage: tap to select, double-tap a text box to type (the keyboard opens inside that tap, F35), the text
// bar above the keyboard, and the Add / Item / Slide / Notes sheets. In a panel at least 700 px wide (a store
// tablet) the strip becomes a rail on the left.
//
// Nothing here navigates on its own: Back and every document command go through the editor's actions and the
// panel's opener (useDocsOpenUrl), so a device never leaves its panel. The slideshow overlay is mounted by the
// session (SlidesPresenterHost), for both layouts.
import { useEffect, useState, type ComponentType } from "react";
import { Layers, NotebookText, SquareDashedMousePointer } from "lucide-react";

import { SlidesStage } from "@/components/slides/canvas/stage";
import { useStageFit } from "@/components/slides/canvas/use-stage-fit";
import { SlidesDialogs } from "@/components/slides/editor/slides-dialogs";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { MOBILE_SLIDE_FORMAT_BAR_HEIGHT, MobileSlideFormatBar } from "@/components/slides/mobile/mobile-format-bar";
import { MobileSheets } from "@/components/slides/mobile/mobile-sheets";
import { MobileSlidesHeader } from "@/components/slides/mobile/mobile-slides-header";
import { MobileThumbStrip } from "@/components/slides/mobile/mobile-thumb-strip";
import { MobileVersionsPage } from "@/components/slides/mobile/mobile-versions-page";
import { MobileViewStage } from "@/components/slides/mobile/mobile-view-stage";
import { SlidesBanners } from "@/components/slides/panels/banners";
import { Button } from "@/components/ui/button";
import { useShellBackHandler, useShellChrome, useVirtualKeyboard } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import type { SlidesMobileSheet } from "@/lib/slides/editor/ui-state";
import { cn } from "@/lib/utils";

/** A panel at least this wide (CSS px) gets the rail layout. */
const WIDE_PANEL_PX = 700;
/** useStageFit measures any box; a unit "slide" makes it report the plain size. */
const UNIT = { w: 1, h: 1 };

function ActionButton({ icon: Icon, label, disabled, onPress }: { icon: ComponentType<{ className?: string }>; label: string; disabled?: boolean; onPress(): void }) {
  return (
    <Button type="button" variant="ghost" size="sm" disabled={disabled} className="h-9 gap-1.5 px-3 text-muted-foreground" onClick={onPress}>
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

export function MobileSlidesEditor(): React.JSX.Element {
  const t = useT();
  const { ui, dispatch, deck, canEditNow } = useSlidesEditor();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const { viewport } = useStageFit(root, UNIT);
  const keyboard = useVirtualKeyboard();
  const wide = viewport.w >= WIDE_PANEL_PX;
  const editMode = ui.mobileMode === "edit";
  const writable = canEditNow && !deck.schemaTooNew && ui.previewVersionId === null;
  const typing = editMode && ui.editing !== null;
  const open = (sheet: SlidesMobileSheet) => dispatch({ type: "openMobileSheet", sheet });

  useShellChrome(editMode ? { immersive: true } : null);
  // Back closes a sheet first, then leaves editing (newest handler first).
  useShellBackHandler(() => {
    dispatch({ type: "setMobileMode", mode: "view" });
    return true;
  }, editMode);
  useShellBackHandler(() => {
    dispatch({ type: "closeMobileSheet" });
    return true;
  }, ui.mobileSheet !== null);

  // Editing needs edit rights on a deck this version can write: leave it when either goes (access change, restore).
  useEffect(() => {
    if (editMode && !writable) dispatch({ type: "setMobileMode", mode: "view" });
  }, [editMode, writable, dispatch]);

  const strip = deck.slideIds.length > 0 && !(typing && keyboard.open);
  return (
    <div ref={setRoot} data-slides-mobile="" className="flex h-full min-h-0 w-full flex-col bg-background">
      <MobileSlidesHeader />
      <SlidesBanners />
      <div
        className={cn("flex min-h-0 flex-1", wide ? "flex-row" : "flex-col")}
        style={typing ? { paddingBottom: MOBILE_SLIDE_FORMAT_BAR_HEIGHT + keyboard.inset } : undefined}
      >
        {wide && strip ? <MobileThumbStrip orientation="vertical" /> : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">{editMode ? <SlidesStage touch /> : <MobileViewStage />}</div>
          {typing && keyboard.open ? null : (
            <div className="flex h-11 shrink-0 items-center justify-center gap-1 border-t border-border bg-background px-2">
              <ActionButton icon={NotebookText} label={t("slides.mobile.notes")} disabled={deck.slideIds.length === 0} onPress={() => open("notes")} />
              {editMode ? (
                <>
                  <ActionButton icon={Layers} label={t("slides.mobile.slide")} disabled={!writable || deck.slideIds.length === 0} onPress={() => open("slide")} />
                  <ActionButton icon={SquareDashedMousePointer} label={t("slides.mobile.element")} disabled={!writable || ui.selection.length === 0} onPress={() => open("element")} />
                </>
              ) : null}
            </div>
          )}
        </div>
        {!wide && strip ? <MobileThumbStrip orientation="horizontal" /> : null}
      </div>
      {typing && writable ? <MobileSlideFormatBar /> : null}
      <MobileSheets />
      <MobileVersionsPage />
      <SlidesDialogs />
    </div>
  );
}
