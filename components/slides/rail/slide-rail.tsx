"use client";

// The slide rail of the desktop editor (slides.md §7.3): one thumbnail per slide, in a listbox with a single Tab
// stop. Click shows a slide, Shift+click picks a range, Mod+click adds or removes one; ↑/↓, Home and End move the
// current slide (Shift extends the pick); Enter goes to the stage. Slide commands that act on the picked slides
// while the rail has focus (Delete, Mod+D, Mod+A, Mod+C/X/V, Mod+↑/↓ to reorder) come from the editor's shortcut
// hook, which recognises the rail by SLIDES_RAIL_ATTR. Drag and drop reorders too (use-slide-reorder.ts).
//
// Each thumbnail shows its number, a skipped mark, and a dot for each collaborator on that slide. The rail's width
// is a per-viewer preference (160-280 px), changed by dragging or with the keyboard on its edge.
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { EyeOff, Plus } from "lucide-react";

import { ResizeHandle } from "@/components/slides/panels/resize-handle";
import { slideMove } from "@/components/slides/menubar/slide-order";
import { orderAfterMove } from "@/components/slides/rail/reorder-math";
import { SlideThumb } from "@/components/slides/rail/slide-thumb";
import { RAIL_SLIDE_ATTR, isRailCommandKey, useSlideFocus } from "@/components/slides/rail/use-slide-focus";
import { REORDER_ID_ATTR, useSlideReorder, type SlideReorderDrag } from "@/components/slides/rail/use-slide-reorder";
import { isSinglePick, pickSlides, steppedSlide, type RailPick, type RailPickMode } from "@/components/slides/rail/rail-selection";
import { useSlideViewLabels, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { SLIDES_RAIL_ATTR } from "@/components/slides/editor/use-slides-shortcuts";
import { Button } from "@/components/ui/button";
import { useIsMac } from "@/lib/docs/shortcut-label";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { RAIL_WIDTH_MAX, RAIL_WIDTH_MIN } from "@/lib/slides/editor/ui-state";
import type { SlidesPeersState } from "@/lib/slides/editor/peers";
import type { DeckState } from "@/lib/slides/model/deck-store";
import { cn } from "@/lib/utils";

/** Rail width not taken by the thumbnail: side padding, the number column, gaps, borders, a scrollbar. */
const RAIL_CHROME_PX = 52;

/** The thumbnail width in a rail `railWidth` px wide (the version preview's rail uses it too). */
export function railThumbWidth(railWidth: number): number {
  return Math.max(40, railWidth - RAIL_CHROME_PX);
}
/** At most this many collaborator dots per thumbnail. */
const MAX_DOTS = 3;
/** The mode a click or key picks with: Shift = range, Mod (⌘ on Apple keyboards, else Ctrl) = toggle. */
export function pickModeOf(event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }, isMac: boolean): RailPickMode {
  if (event.shiftKey) return "range";
  return (isMac ? event.metaKey : event.ctrlKey) ? "toggle" : "replace";
}

interface RailItemProps {
  deck: DeckState;
  slideId: string;
  n: number;
  current: boolean;
  picked: boolean;
  tabbable: boolean;
  thumbWidth: number;
  root: HTMLElement | null;
  peers: SlidesPeersState;
  drag: SlideReorderDrag | null;
  indicator: "before" | "after" | null;
  onClick(event: MouseEvent<HTMLDivElement>, id: string): void;
  onPointerDown(event: React.PointerEvent<HTMLDivElement>, id: string): void;
}

function RailItem({ deck, slideId, n, current, picked, tabbable, thumbWidth, root, peers, drag, indicator, onClick, onPointerDown }: RailItemProps) {
  const t = useT();
  const labels = useSlideViewLabels();
  const slide = deck.slides.get(slideId);
  if (!slide) return null;
  const onSlide = peers.bySlide.get(slideId) ?? [];
  const moving = drag !== null && drag.ids.includes(slideId);
  return (
    <div
      role="option"
      aria-selected={picked}
      tabIndex={tabbable ? 0 : -1}
      {...{ [RAIL_SLIDE_ATTR]: slideId, [REORDER_ID_ATTR]: slideId }}
      onClick={(event) => onClick(event, slideId)}
      onPointerDown={(event) => onPointerDown(event, slideId)}
      className="group relative flex cursor-default items-start gap-1.5 px-2 py-1 outline-none select-none [-webkit-touch-callout:none]"
    >
      {indicator === "before" && <span aria-hidden className="absolute inset-x-2 -top-px h-0.5 bg-foreground" />}
      <span aria-hidden className="w-5 shrink-0 pt-0.5 text-end font-mono text-[11px] tabular-nums text-muted-foreground">
        {n}
      </span>
      <div
        className={cn(
          "relative rounded-[2px] border transition-colors group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
          current ? "border-foreground ring-1 ring-foreground" : picked ? "border-foreground/50" : "border-border group-hover:border-foreground/30",
          moving && "opacity-40",
        )}
      >
        <SlideThumb deck={deck} slide={slide} width={thumbWidth} root={root} labels={labels} className={slide.hidden ? "opacity-50" : undefined} />
        {slide.hidden && (
          <span aria-hidden className="absolute end-1 top-1 rounded-[2px] border border-border bg-background/90 p-0.5 text-muted-foreground">
            <EyeOff className="h-3 w-3" />
          </span>
        )}
        {onSlide.length > 0 && (
          <span aria-hidden className="absolute bottom-1 end-1 flex gap-0.5">
            {onSlide.slice(0, MAX_DOTS).map((peer) => (
              <span key={peer.yClientId} title={peer.name} className="h-2 w-2 rounded-full border border-background" style={{ backgroundColor: peer.color }} />
            ))}
          </span>
        )}
      </div>
      <span className="sr-only">{fmt(t("slides.rail.slideN"), { n })}</span>
      {slide.hidden && <span className="sr-only">{t("slides.rail.hidden")}</span>}
      {onSlide.map((peer) => (
        <span key={peer.yClientId} className="sr-only">
          {fmt(t("slides.presence.onSlide"), { name: peer.name, n })}
        </span>
      ))}
      {indicator === "after" && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 bg-foreground" />}
    </div>
  );
}

export function SlideRail() {
  const t = useT();
  const isMac = useIsMac();
  const { deck, ui, dispatch, el, peers, canEditNow, refs } = useSlidesEditor();
  const writable = canEditNow && !deck.schemaTooNew && ui.previewVersionId === null;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const anchor = useRef<string | null>(null);

  const order = deck.slideIds;
  const current = ui.currentSlideId;
  const picked = ui.slideSelection;
  const holdFocus = useSlideFocus(scrollerRef, current, order);
  const width = liveWidth ?? ui.railWidth;
  const thumbWidth = railThumbWidth(width);

  const reorder = useSlideReorder({
    axis: "vertical",
    container: scrollerRef,
    order,
    picked,
    enabled: writable,
    onDragStart: (pressed) => {
      if (!picked.includes(pressed)) dispatch({ type: "selectSlide", slideId: pressed });
      anchor.current = pressed;
    },
    onDrop: (ids, before) => el.moveSlides(ids, before),
  });

  /** Picks `id` (in an event handler: reads the anchor ref). */
  const pick = (id: string, mode: RailPickMode) => {
    const next: RailPick = pickSlides({ order, picked, current, anchor: anchor.current }, id, mode);
    anchor.current = next.anchor;
    if (isSinglePick(next)) dispatch({ type: "selectSlide", slideId: next.current });
    else dispatch({ type: "selectSlides", slideIds: next.slideIds, current: next.current });
  };

  const onItemClick = (event: MouseEvent<HTMLDivElement>, id: string) => {
    if (reorder.takeClick()) return;
    pick(id, pickModeOf(event, isMac));
  };

  // Delete, Mod+D/X/V and Mod+↑/↓ are the shortcut hook's: seen here in the capture phase, before they run, to keep
  // focus on the current slide once its node has moved or gone, and to say where a moved slide went.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!writable || !isRailCommandKey(event, isMac)) return;
    holdFocus();
    if (event.shiftKey || !current || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    const step = slideMove(order, picked.length > 0 ? picked : [current], event.key === "ArrowUp" ? -1 : 1);
    // A scattered pick is gathered into one block, so the current slide can move more than one place.
    if (step) setAnnouncement(fmt(t("slides.rail.moved"), { n: orderAfterMove(order, step.ids, step.before).indexOf(current) + 1, total: order.length }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = isMac ? event.metaKey : event.ctrlKey;
    if (event.defaultPrevented || event.altKey || mod || !(event.target instanceof HTMLElement) || !event.target.hasAttribute(RAIL_SLIDE_ATTR)) return;
    let next: string | null = null;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") next = steppedSlide(order, current, event.key === "ArrowUp" ? -1 : 1);
    else if (event.key === "Home") next = order[0] ?? null;
    else if (event.key === "End") next = order[order.length - 1] ?? null;
    else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      refs.stageFocus.focus();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    holdFocus();
    pick(next, event.shiftKey ? "range" : "replace");
  };

  const setScrollerRefs = (node: HTMLDivElement | null) => {
    scrollerRef.current = node;
    setScroller(node);
  };

  const tabbable = current && deck.slides.has(current) ? current : (order[0] ?? null);
  const dropAt = reorder.drag?.index ?? null;

  return (
    <div className="relative flex shrink-0 flex-col border-e border-border bg-background" style={{ width }}>
      <div
        ref={setScrollerRefs}
        role="listbox"
        aria-label={t("slides.rail.label")}
        aria-multiselectable
        {...{ [SLIDES_RAIL_ATTR]: "" }}
        onKeyDownCapture={onKeyDownCapture}
        onKeyDown={onKeyDown}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain py-2", reorder.drag && "cursor-grabbing")}
      >
        {order.map((id, i) => (
          <RailItem
            key={id}
            deck={deck}
            slideId={id}
            n={i + 1}
            current={id === current}
            picked={picked.includes(id)}
            tabbable={id === tabbable}
            thumbWidth={thumbWidth}
            root={scroller}
            peers={peers}
            drag={reorder.drag}
            indicator={dropAt === i ? "before" : dropAt === order.length && i === order.length - 1 ? "after" : null}
            onClick={onItemClick}
            onPointerDown={reorder.onPointerDown}
          />
        ))}
      </div>
      {writable && (
        <div className="shrink-0 border-t border-border p-1.5">
          <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => el.addSlide()}>
            <Plus className="h-3.5 w-3.5" />
            {t("slides.rail.addSlide")}
          </Button>
        </div>
      )}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <ResizeHandle
        edge="end"
        value={width}
        min={RAIL_WIDTH_MIN}
        max={RAIL_WIDTH_MAX}
        label={t("slides.rail.label")}
        onPreview={setLiveWidth}
        onCommit={(value) => dispatch({ type: "setRailWidth", width: value })}
      />
    </div>
  );
}
