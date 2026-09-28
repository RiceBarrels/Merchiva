"use client";

// The phone's slide strip (slides.md §11): a horizontal row of thumbnails under the slide, or a vertical rail beside
// it in a wide device panel (a store tablet). Tap a thumbnail to show that slide. In edit mode a long press lifts a
// slide to drag it to a new place (use-strip-reorder.ts), or, released without moving, opens the slide's options;
// the + at the end adds a slide with the chosen layout.
//
// Thumbnails draw their slide only while they are near the visible part of the strip (a same-size frame
// otherwise), so a 500-slide deck stays light.
import { useEffect, useId, useState } from "react";
import { EyeOff, LayoutGrid, Plus } from "lucide-react";

import { MobileDrawer, SheetRow } from "@/components/docs/mobile/mobile-drawer";
import { SlideView, type SlideViewLabels } from "@/components/slides/canvas/slide-view";
import { useSlideViewLabels, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { THUMB_ID_ATTR, useStripReorder } from "@/components/slides/mobile/use-strip-reorder";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import type { DeckState } from "@/lib/slides/model/deck-store";
import { LAYOUTS, LAYOUT_LABEL_KEYS } from "@/lib/slides/themes/layouts";
import { cn } from "@/lib/utils";

/** Thumbnail width (CSS px) per orientation. */
const THUMB_W = { horizontal: 88, vertical: 112 } as const;

function useNearView(el: HTMLElement | null, root: HTMLElement | null): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setNear(true));
      return () => cancelAnimationFrame(id);
    }
    const observer = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { root, rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, root]);
  return near;
}

function Thumb({ deck, id, n, width, current, lifted, labels, root, onSelect }: {
  deck: DeckState;
  id: string;
  n: number;
  width: number;
  current: boolean;
  lifted: boolean;
  labels: SlideViewLabels;
  root: HTMLElement | null;
  onSelect(): void;
}) {
  const t = useT();
  const [el, setEl] = useState<HTMLButtonElement | null>(null);
  const near = useNearView(el, root);
  const slide = deck.slides.get(id);
  const { w, h } = deck.meta.size;
  const scale = width / w;
  if (!slide) return null;
  return (
    <button
      ref={setEl}
      type="button"
      aria-current={current ? "true" : undefined}
      aria-label={fmt(t("slides.rail.slideN"), { n }) + (slide.hidden ? ` (${t("slides.rail.hidden")})` : "")}
      {...{ [THUMB_ID_ATTR]: id }}
      onClick={onSelect}
      className={cn(
        "relative shrink-0 select-none rounded-[3px] border-2 bg-background outline-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50",
        current ? "border-foreground" : "border-transparent",
        lifted && "opacity-40",
      )}
      style={{ width: width + 4, height: h * scale + 4 }}
    >
      <span className={cn("block overflow-hidden border border-border", slide.hidden && "opacity-50")} style={{ width, height: h * scale }}>
        {near ? <SlideView deck={deck} slide={slide} scale={scale} mode="thumb" labels={labels} /> : null}
      </span>
      <span className="absolute bottom-0.5 start-0.5 rounded-[2px] bg-background/85 px-1 font-mono text-[10px] leading-4 tabular-nums text-muted-foreground">{n}</span>
      {slide.hidden ? <EyeOff aria-hidden className="absolute end-1 top-1 h-3 w-3 text-muted-foreground" /> : null}
    </button>
  );
}

function DropMarker({ vertical }: { vertical: boolean }) {
  return <span aria-hidden className={cn("shrink-0 bg-foreground", vertical ? "h-0.5 w-full" : "w-0.5 self-stretch")} />;
}

export function MobileThumbStrip({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const t = useT();
  const { deck, ui, dispatch, el, canEditNow } = useSlidesEditor();
  const labels = useSlideViewLabels(true);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const hintId = useId();
  const vertical = orientation === "vertical";
  const editMode = ui.mobileMode === "edit";
  const writable = canEditNow && !deck.schemaTooNew && ui.previewVersionId === null;
  const width = THUMB_W[orientation];

  const reorder = useStripReorder({
    strip,
    axis: vertical ? "y" : "x",
    enabled: editMode && writable,
    order: deck.slideIds,
    onMove: (id, before, position) => {
      el.moveSlides([id], before);
      setAnnouncement(fmt(t("slides.rail.moved"), { n: position, total: deck.slideIds.length }));
    },
    onHold: (id) => {
      dispatch({ type: "selectSlide", slideId: id });
      dispatch({ type: "openMobileSheet", sheet: "slide" });
    },
  });
  const drag = reorder.drag;

  // Keep the current slide's thumbnail in view (swipes on the slide, undo, a collaborator's delete).
  const currentId = ui.currentSlideId;
  useEffect(() => {
    if (!strip || !currentId) return;
    const thumb = strip.querySelector(`[${THUMB_ID_ATTR}="${currentId}"]`);
    thumb?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [strip, currentId]);

  const items: React.ReactNode[] = [];
  deck.slideIds.forEach((id, i) => {
    if (drag && drag.slot === i) items.push(<DropMarker key="drop" vertical={vertical} />);
    items.push(
      <Thumb
        key={id}
        deck={deck}
        id={id}
        n={i + 1}
        width={width}
        current={id === currentId}
        lifted={drag?.id === id}
        labels={labels}
        root={strip}
        onSelect={() => dispatch({ type: "selectSlide", slideId: id })}
      />,
    );
  });
  if (drag && drag.slot >= deck.slideIds.length) items.push(<DropMarker key="drop" vertical={vertical} />);

  return (
    <div className={cn("shrink-0 bg-muted/40", vertical ? "flex h-full w-[136px] flex-col border-e border-border" : "border-t border-border")}>
      <div
        ref={setStrip}
        role="group"
        aria-label={t("slides.rail.label")}
        aria-describedby={editMode && writable ? hintId : undefined}
        className={cn(
          "flex gap-2 p-2 no-scrollbar",
          vertical ? "min-h-0 flex-1 touch-pan-y flex-col items-center overflow-y-auto" : "touch-pan-x items-center overflow-x-auto",
        )}
        {...reorder.handlers}
      >
        {items}
        {editMode && writable ? (
          <button
            type="button"
            aria-label={t("slides.rail.addSlide")}
            onClick={() => setLayoutsOpen(true)}
            className="flex shrink-0 items-center justify-center rounded-[3px] border border-dashed border-border text-muted-foreground outline-none active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            style={{ width: vertical ? width + 4 : 44, height: (deck.meta.size.h * width) / deck.meta.size.w + 4 }}
          >
            <Plus className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <span id={hintId} className="sr-only">
        {t("slides.mobile.reorderHint")}
      </span>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <MobileDrawer open={layoutsOpen} onOpenChange={setLayoutsOpen} title={t("slides.slide.layout")}>
        {LAYOUTS.map((layout) => (
          <SheetRow
            key={layout}
            icon={LayoutGrid}
            label={t(LAYOUT_LABEL_KEYS[layout])}
            onSelect={() => {
              setLayoutsOpen(false);
              el.addSlide(layout);
            }}
          />
        ))}
      </MobileDrawer>
    </div>
  );
}
