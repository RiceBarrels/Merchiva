"use client";

// The phone's reading view (slides.md §11): the current slide fitted to the width, a horizontal swipe for the next
// or previous slide (every slide, skipped ones included: this is the deck, not the show), and a double tap to start
// editing when the viewer may edit. Links are inert here; they open while presenting.
import { useRef, useState, type PointerEvent } from "react";
import { Presentation } from "lucide-react";

import { SlideView } from "@/components/slides/canvas/slide-view";
import { useStageFit } from "@/components/slides/canvas/use-stage-fit";
import { currentSlideOf, useSlideViewLabels, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { swipeAction, TAP_SLOP_PX } from "@/lib/slides/present/input";

/** Space around the slide (CSS px). */
const PADDING = 12;
/** Two taps closer than this are a double tap (ms, CSS px). */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 24;

export function MobileViewStage() {
  const t = useT();
  const { deck, ui, dispatch, el, canEditNow } = useSlidesEditor();
  const labels = useSlideViewLabels(true);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const fit = useStageFit(box, deck.meta.size, { padding: PADDING });
  const press = useRef<{ x: number; y: number; type: string } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const editable = canEditNow && !deck.schemaTooNew && ui.previewVersionId === null && deck.slideIds.length > 0;

  const slide = currentSlideOf(deck, ui);
  const index = slide ? deck.slideIds.indexOf(slide.id) : -1;
  const go = (delta: 1 | -1) => {
    const id = deck.slideIds[index + delta];
    if (id) dispatch({ type: "selectSlide", slideId: id });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    press.current = { x: event.clientX, y: event.clientY, type: event.pointerType };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    const swipe = swipeAction({ pointerType: p.type, dx, dy });
    if (swipe) {
      lastTap.current = null;
      go(swipe === "next" ? 1 : -1);
      return;
    }
    if (Math.hypot(dx, dy) > TAP_SLOP_PX) return;
    const prev = lastTap.current;
    const again = prev !== null && event.timeStamp - prev.at < DOUBLE_TAP_MS && Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < DOUBLE_TAP_PX;
    lastTap.current = again ? null : { at: event.timeStamp, x: event.clientX, y: event.clientY };
    if (again && editable) dispatch({ type: "setMobileMode", mode: "edit" });
  };

  if (!slide) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <EmptyState
          icon={Presentation}
          title={t("slides.editor.emptyDeckTitle")}
          action={
            canEditNow && !deck.schemaTooNew ? (
              <Button variant="outline" size="sm" onClick={() => el.addSlide()}>
                {t("slides.editor.emptyDeckAction")}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div
      ref={setBox}
      className="relative flex h-full w-full touch-pan-y items-center justify-center overflow-hidden bg-muted select-none"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        press.current = null;
      }}
    >
      {fit.measured ? (
        <div className="shrink-0 border border-border bg-background">
          <SlideView deck={deck} slide={slide} scale={fit.scale} mode="present" labels={labels} />
        </div>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {fmt(t("slides.present.slideOf"), { n: index + 1, total: deck.slideIds.length })}
      </span>
    </div>
  );
}
