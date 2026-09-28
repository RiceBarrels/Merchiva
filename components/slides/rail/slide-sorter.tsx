"use client";

// Grid view (slides.md §7.3): every slide as a thumbnail in a wrapping grid, to see and reorder a long deck. It
// picks like the rail (click, Shift, Mod) and reorders by drag (use-slide-reorder.ts in grid mode) or from the
// keyboard: the arrow keys move the current slide through the grid, Mod+← / Mod+→ move the picked slides one place
// (Mod+↑ / Mod+↓ too, through the editor's shortcut hook, which treats this grid as the rail), and Enter or a
// double-click opens the slide in the editor.
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { EyeOff, Presentation } from "lucide-react";

import { slideMove, type SlideMove } from "@/components/slides/menubar/slide-order";
import { pickModeOf } from "@/components/slides/rail/slide-rail";
import { orderAfterMove } from "@/components/slides/rail/reorder-math";
import { RAIL_SLIDE_ATTR, isRailCommandKey, useSlideFocus } from "@/components/slides/rail/use-slide-focus";
import { SlideThumb } from "@/components/slides/rail/slide-thumb";
import { REORDER_ID_ATTR, useSlideReorder } from "@/components/slides/rail/use-slide-reorder";
import { isSinglePick, pickSlides, steppedSlide, type RailPickMode } from "@/components/slides/rail/rail-selection";
import { useSlideViewLabels, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { SLIDES_RAIL_ATTR } from "@/components/slides/editor/use-slides-shortcuts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useIsMac } from "@/lib/docs/shortcut-label";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

const THUMB_WIDTH = 200;

/** How many items the first row of the grid holds (the column count). */
function columnsOf(container: HTMLElement | null): number {
  const items = container ? Array.from(container.querySelectorAll<HTMLElement>(`[${REORDER_ID_ATTR}]`)) : [];
  if (items.length === 0) return 1;
  const top = items[0].offsetTop;
  const n = items.findIndex((item) => item.offsetTop !== top);
  return n < 0 ? items.length : Math.max(1, n);
}

export function SlideSorter() {
  const t = useT();
  const isMac = useIsMac();
  const labels = useSlideViewLabels();
  const { deck, ui, dispatch, el, peers, canEditNow } = useSlidesEditor();
  const writable = canEditNow && !deck.schemaTooNew && ui.previewVersionId === null;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const anchor = useRef<string | null>(null);
  const order = deck.slideIds;
  const current = ui.currentSlideId;
  const picked = ui.slideSelection;
  const holdFocus = useSlideFocus(gridRef, current, order, true);

  const reorder = useSlideReorder({
    axis: "grid",
    container: gridRef,
    order,
    picked,
    enabled: writable,
    onDragStart: (pressed) => {
      if (!picked.includes(pressed)) dispatch({ type: "selectSlide", slideId: pressed });
      anchor.current = pressed;
    },
    onDrop: (ids, before) => el.moveSlides(ids, before),
  });

  const pick = (id: string, mode: RailPickMode) => {
    const next = pickSlides({ order, picked, current, anchor: anchor.current }, id, mode);
    anchor.current = next.anchor;
    if (isSinglePick(next)) dispatch({ type: "selectSlide", slideId: next.current });
    else dispatch({ type: "selectSlides", slideIds: next.slideIds, current: next.current });
  };

  const open = (id: string) => {
    dispatch({ type: "selectSlide", slideId: id });
    dispatch({ type: "setView", view: "edit" });
  };

  /** Says where the current slide goes (a scattered pick is gathered into one block, so it can move several places). */
  const announceMove = (step: SlideMove) => {
    if (current) setAnnouncement(fmt(t("slides.rail.moved"), { n: orderAfterMove(order, step.ids, step.before).indexOf(current) + 1, total: order.length }));
  };

  /** Moves the picked slides one place (a Mod+arrow), announcing where the current one went. */
  const move = (dir: 1 | -1) => {
    if (!current || !writable) return;
    const step = slideMove(order, picked.length > 0 ? picked : [current], dir);
    if (!step) return;
    holdFocus();
    el.moveSlides(step.ids, step.before);
    announceMove(step);
  };

  // Delete, Mod+D/X/V and Mod+↑/↓ are the shortcut hook's (this grid counts as the rail): seen here before they run,
  // to keep focus on the current slide once its node has moved or gone, and to say where a moved slide went.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!writable || !isRailCommandKey(event, isMac)) return;
    holdFocus();
    if (event.shiftKey || !current || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    const step = slideMove(order, picked.length > 0 ? picked : [current], event.key === "ArrowUp" ? -1 : 1);
    if (step) announceMove(step);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = isMac ? event.metaKey : event.ctrlKey;
    const rtl = grid !== null && getComputedStyle(grid).direction === "rtl";
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const forward = event.key === (rtl ? "ArrowLeft" : "ArrowRight");
    if (event.defaultPrevented) return;
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute(REORDER_ID_ATTR) || event.altKey) return;
    if (mod && horizontal && !event.shiftKey) {
      event.preventDefault();
      move(forward ? 1 : -1);
      return;
    }
    if (mod) return;
    let next: string | null = null;
    if (horizontal) next = steppedSlide(order, current, forward ? 1 : -1);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") next = steppedSlide(order, current, (event.key === "ArrowUp" ? -1 : 1) * columnsOf(grid));
    else if (event.key === "Home") next = order[0] ?? null;
    else if (event.key === "End") next = order[order.length - 1] ?? null;
    else if (event.key === "Enter" && current) {
      event.preventDefault();
      open(current);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    holdFocus();
    pick(next, event.shiftKey ? "range" : "replace");
  };

  const setGridRefs = (node: HTMLDivElement | null) => {
    gridRef.current = node;
    setGrid(node);
  };

  if (order.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-muted">
        <EmptyState
          icon={Presentation}
          title={t("slides.editor.emptyDeckTitle")}
          action={writable ? <Button variant="outline" size="sm" onClick={() => el.addSlide()}>{t("slides.editor.emptyDeckAction")}</Button> : undefined}
        />
      </div>
    );
  }

  const tabbable = current && deck.slides.has(current) ? current : order[0];
  const dropAt = reorder.drag?.index ?? null;
  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-muted" ref={setGridRefs}>
      <div
        role="listbox"
        aria-label={t("slides.view.grid")}
        aria-multiselectable
        aria-orientation="horizontal"
        {...{ [SLIDES_RAIL_ATTR]: "" }}
        onKeyDownCapture={onKeyDownCapture}
        onKeyDown={onKeyDown}
        className={cn("flex flex-wrap content-start gap-x-4 gap-y-5 p-6", reorder.drag && "cursor-grabbing")}
      >
        {order.map((id, i) => {
          const slide = deck.slides.get(id);
          if (!slide) return null;
          const isCurrent = id === current;
          const isPicked = picked.includes(id);
          const moving = reorder.drag?.ids.includes(id) ?? false;
          const onSlide = peers.bySlide.get(id) ?? [];
          return (
            <div
              key={id}
              role="option"
              aria-selected={isPicked}
              tabIndex={id === tabbable ? 0 : -1}
              {...{ [RAIL_SLIDE_ATTR]: id, [REORDER_ID_ATTR]: id }}
              onClick={(event: MouseEvent<HTMLDivElement>) => {
                if (!reorder.takeClick()) pick(id, pickModeOf(event, isMac));
              }}
              onDoubleClick={() => open(id)}
              onPointerDown={(event) => reorder.onPointerDown(event, id)}
              className="group relative flex cursor-default flex-col items-center gap-1.5 outline-none select-none [-webkit-touch-callout:none]"
            >
              {dropAt === i && <span aria-hidden className="absolute -start-2.5 inset-y-0 w-0.5 bg-foreground" />}
              <div
                className={cn(
                  "relative rounded-[2px] border bg-background transition-colors group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                  isCurrent ? "border-foreground ring-1 ring-foreground" : isPicked ? "border-foreground/50" : "border-border group-hover:border-foreground/30",
                  moving && "opacity-40",
                )}
              >
                <SlideThumb deck={deck} slide={slide} width={THUMB_WIDTH} root={grid} labels={labels} className={slide.hidden ? "opacity-50" : undefined} />
                {slide.hidden && (
                  <span aria-hidden className="absolute end-1 top-1 rounded-[2px] border border-border bg-background/90 p-0.5 text-muted-foreground">
                    <EyeOff className="h-3 w-3" />
                  </span>
                )}
                {onSlide.length > 0 && (
                  <span aria-hidden className="absolute bottom-1 end-1 flex gap-0.5">
                    {onSlide.slice(0, 3).map((peer) => (
                      <span key={peer.yClientId} title={peer.name} className="h-2 w-2 rounded-full border border-background" style={{ backgroundColor: peer.color }} />
                    ))}
                  </span>
                )}
              </div>
              <span aria-hidden className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="sr-only">{fmt(t("slides.rail.slideN"), { n: i + 1 })}</span>
              {slide.hidden && <span className="sr-only">{t("slides.rail.hidden")}</span>}
              {onSlide.map((peer) => (
                <span key={peer.yClientId} className="sr-only">
                  {fmt(t("slides.presence.onSlide"), { name: peer.name, n: i + 1 })}
                </span>
              ))}
              {dropAt === order.length && i === order.length - 1 && <span aria-hidden className="absolute -end-2.5 inset-y-0 w-0.5 bg-foreground" />}
            </div>
          );
        })}
      </div>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
