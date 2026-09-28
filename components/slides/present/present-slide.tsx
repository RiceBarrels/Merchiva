"use client";

// One slide fitted into its box for the slideshow (slides.md §9): the audience view, the speaker view's current and
// next slide. The box is measured in the realm it lives in (the speaker popup has its own ResizeObserver), and the
// slide is centred at the largest scale that fits.
//
// With `animate`, entering a slide plays its transition: `fade` cross-fades the new slide in over the old one for
// the transition's duration (Web Animations, run in the node's own realm); `none` swaps at once. The viewer's
// reduced-motion setting turns every transition into a swap.
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { SlideView, type SlideViewLabels } from "@/components/slides/canvas/slide-view";
import { useStageFit } from "@/components/slides/canvas/use-stage-fit";
import { usePresenterWindow } from "@/components/slides/present/presenter-window-context";
import type { DeckState } from "@/lib/slides/model/deck-store";
import { cn } from "@/lib/utils";

export interface PresentSlideProps {
  deck: Pick<DeckState, "meta" | "masters" | "slides">;
  /** null draws nothing (an empty show, the end screen). */
  slideId: string | null;
  labels: SlideViewLabels;
  /** Links open through this (present mode only); absent = links are plain text. */
  onLinkClick?: (href: string) => void;
  /** Play the incoming slide's transition. */
  animate?: boolean;
  /** "thumb" for small previews (the speaker view's next slide). */
  mode?: "present" | "thumb";
  /** Space kept free around the slide (CSS px). */
  padding?: number;
  className?: string;
}

interface Layer {
  key: number;
  slideId: string;
  /** Fade-in duration (ms); 0 = shown at once. */
  fade: number;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function useReducedMotion(win: Window): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = win.matchMedia?.(REDUCED_MOTION);
      if (!query) return () => {};
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => win.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false,
  );
}

function FadeLayer({ layer, onShown, children }: { layer: Layer; onShown(key: number): void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { key, fade } = layer;
  useLayoutEffect(() => {
    const el = ref.current;
    if (fade <= 0) return;
    if (!el || typeof el.animate !== "function") {
      onShown(key);
      return;
    }
    const animation = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: "ease-in-out", fill: "both" });
    animation.onfinish = () => onShown(key);
    return () => animation.cancel();
  }, [key, fade, onShown]);
  return (
    <div ref={ref} className="absolute inset-0 flex items-center justify-center">
      {children}
    </div>
  );
}

export function PresentSlide({ deck, slideId, labels, onLinkClick, animate = false, mode = "present", padding = 0, className }: PresentSlideProps) {
  const win = usePresenterWindow();
  const reduced = useReducedMotion(win);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const fit = useStageFit(box, deck.meta.size, { padding, win });

  const [layers, setLayers] = useState<readonly Layer[]>(() => (slideId ? [{ key: 0, slideId, fade: 0 }] : []));
  const [shownId, setShownId] = useState(slideId);
  const [nextKey, setNextKey] = useState(1);
  if (shownId !== slideId) {
    // A new slide: keep the one on screen under it while it fades in (derived from props during render).
    setShownId(slideId);
    setNextKey(nextKey + 1);
    const transition = slideId ? deck.slides.get(slideId)?.transition : null;
    const fade = animate && !reduced && transition?.type === "fade" ? transition.durationMs : 0;
    if (slideId === null) setLayers([]);
    else if (fade > 0) setLayers((prev) => [...prev.slice(-1), { key: nextKey, slideId, fade }]);
    else setLayers([{ key: nextKey, slideId, fade: 0 }]);
  }

  // Once a fade finished, the layers under it are hidden: drop them.
  const onShown = useCallback((key: number) => setLayers((prev) => (prev.some((l) => l.key < key) ? prev.filter((l) => l.key >= key) : prev)), []);

  return (
    <div ref={setBox} className={cn("relative h-full w-full overflow-hidden", className)}>
      {fit.measured
        ? layers.map((layer) => {
            const slide = deck.slides.get(layer.slideId);
            if (!slide) return null;
            return (
              <FadeLayer key={layer.key} layer={layer} onShown={onShown}>
                <SlideView deck={deck} slide={slide} scale={fit.scale} mode={mode} labels={labels} onLinkClick={mode === "present" ? onLinkClick : undefined} />
              </FadeLayer>
            );
          })
        : null}
    </div>
  );
}
