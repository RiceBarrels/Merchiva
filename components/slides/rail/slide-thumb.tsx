"use client";

// A slide thumbnail (slides.md §5.2): SlideView in "thumb" mode, mounted only while it is within 200 px of its
// scroller's visible area, and otherwise a same-size placeholder, so a 500-slide rail renders a handful of slides.
// SlideView is memoised on the slide object, which the deck store replaces only when that slide changed. The
// thumbnail never takes pointer events: the rail item around it handles clicks and drags.
import { useEffect, useRef, useState } from "react";

import { SlideView, type SlideViewLabels } from "@/components/slides/canvas/slide-view";
import type { DeckState } from "@/lib/slides/model/deck-store";
import type { SlideSnapshot } from "@/lib/slides/model/types";
import { cn } from "@/lib/utils";

/** How far outside the visible area a thumbnail is already drawn (CSS px). */
const IN_VIEW_MARGIN = "200px";

type Watch = (visible: boolean) => void;

/** One IntersectionObserver per scroller, shared by all its thumbnails. */
const watchers = new WeakMap<Element, { io: IntersectionObserver; handlers: Map<Element, Watch> }>();

function watchInView(root: Element, el: Element, onChange: Watch): () => void {
  let entry = watchers.get(root);
  if (!entry) {
    const handlers = new Map<Element, Watch>();
    const io = new IntersectionObserver(
      (records) => {
        for (const record of records) handlers.get(record.target)?.(record.isIntersecting);
      },
      { root, rootMargin: IN_VIEW_MARGIN },
    );
    entry = { io, handlers };
    watchers.set(root, entry);
  }
  const { io, handlers } = entry;
  handlers.set(el, onChange);
  io.observe(el);
  return () => {
    io.unobserve(el);
    handlers.delete(el);
  };
}

/** Whether `ref`'s element is near the visible part of `root` (always true where IntersectionObserver is missing). */
function useNearView(ref: React.RefObject<HTMLElement | null>, root: HTMLElement | null): boolean {
  const supported = typeof IntersectionObserver !== "undefined";
  const [visible, setVisible] = useState(!supported);
  useEffect(() => {
    const el = ref.current;
    if (!supported || !el || !root) return;
    return watchInView(root, el, setVisible);
  }, [ref, root, supported]);
  return visible;
}

export interface SlideThumbProps {
  deck: Pick<DeckState, "meta" | "masters">;
  slide: SlideSnapshot;
  /** Thumbnail width in CSS px (the height follows the deck's aspect ratio). */
  width: number;
  /**
   * The scroller the thumbnail sits in. Null (the scroller is not mounted or measured yet) shows the placeholder:
   * drawing every slide for the one render before the scroller is known would create every picture in the deck.
   */
  root: HTMLElement | null;
  labels: SlideViewLabels;
  className?: string;
}

export function SlideThumb({ deck, slide, width, root, labels, className }: SlideThumbProps) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearView(ref, root);
  const { w, h } = deck.meta.size;
  const scale = w > 0 ? width / w : 0;
  const height = Math.round(h * scale);
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none relative shrink-0 overflow-hidden bg-muted", className)}
      style={{ width, height }}
    >
      {near && scale > 0 ? <SlideView deck={deck} slide={slide} scale={scale} mode="thumb" labels={labels} /> : null}
    </div>
  );
}
