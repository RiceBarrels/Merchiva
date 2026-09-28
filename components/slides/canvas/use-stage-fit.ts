"use client";

// Stage scale (slides.md §5.1): 1 stage CSS px = 1 pt, and the stage is shown at `scale` inside its viewport. "fit"
// follows the viewport through a ResizeObserver; fixed zooms ignore it. The observer is built in the viewport's own
// realm (or `win`): the presenter's speaker view lives in a popup window, whose elements a main-window
// ResizeObserver would not report on (§9).
//
// The viewport may mount after the first render (a skeleton first). With a ref, the hook looks for the element
// after every commit of the calling component and attaches once it is there; when the viewport can mount without
// that component re-rendering (inside Suspense, or a child's own state), pass the element itself (a callback ref
// into state) instead.
import { useEffect, useRef, useState, type RefObject } from "react";

import type { Pt } from "@/lib/slides/model/types";

export const STAGE_ZOOMS = [0.5, 0.75, 1, 1.5, 2] as const;
export type StageZoom = "fit" | (typeof STAGE_ZOOMS)[number];

/** Smallest scale ever returned, so a collapsed viewport never divides by zero. */
export const MIN_STAGE_SCALE = 0.02;

export interface StageFit {
  scale: number;
  /** Viewport content size in CSS px (0 × 0 until measured). */
  viewport: { w: number; h: number };
  /** False until the viewport has been measured once; a "fit" stage can stay hidden until then. */
  measured: boolean;
}

/** The largest scale at which a `slide` fits in `viewport` minus `padding` on every side. */
export function fitScale(viewport: { w: number; h: number }, slide: { w: Pt; h: Pt }, padding = 0): number {
  const w = viewport.w - padding * 2;
  const h = viewport.h - padding * 2;
  if (w <= 0 || h <= 0 || slide.w <= 0 || slide.h <= 0) return MIN_STAGE_SCALE;
  return Math.max(MIN_STAGE_SCALE, Math.min(w / slide.w, h / slide.h));
}

type RealmWindow = Window & { ResizeObserver?: typeof ResizeObserver };

/** The viewport: a ref to it, or the element itself (null until mounted). */
export type StageViewport = RefObject<HTMLElement | null> | HTMLElement | null;

function viewportElement(viewport: StageViewport): HTMLElement | null {
  return viewport !== null && "current" in viewport ? viewport.current : viewport;
}

/** Reports `el`'s content size to `apply` until the returned detach runs. */
function observeSize(el: HTMLElement, realm: RealmWindow, apply: (w: number, h: number) => void): () => void {
  const Observer = realm.ResizeObserver;
  if (!Observer) {
    // Very old engines: measure on the next frame and on window resizes.
    const measure = () => apply(el.clientWidth, el.clientHeight);
    const frame = realm.requestAnimationFrame(measure);
    realm.addEventListener("resize", measure);
    return () => {
      realm.cancelAnimationFrame(frame);
      realm.removeEventListener("resize", measure);
    };
  }
  // A new observer reports the current size once right after observe(), so no synchronous measurement is needed.
  const observer = new Observer((entries) => {
    const rect = entries[entries.length - 1]?.contentRect;
    if (rect) apply(rect.width, rect.height);
  });
  observer.observe(el);
  return () => observer.disconnect();
}

/**
 * Keeps one size observer on whichever element the viewport currently is: `sync` after every commit re-attaches
 * only when the element or its realm changed (exported for tests).
 */
export class ViewportWatcher {
  private attached: { el: HTMLElement; realm: RealmWindow; detach: () => void } | null = null;

  constructor(private readonly apply: (w: number, h: number) => void) {}

  sync(el: HTMLElement | null, win: Window | null): void {
    const realm = (win ?? el?.ownerDocument.defaultView ?? null) as RealmWindow | null;
    const current = this.attached;
    if (current && current.el === el && current.realm === realm) return;
    this.dispose();
    if (el && realm) this.attached = { el, realm, detach: observeSize(el, realm, this.apply) };
  }

  dispose(): void {
    this.attached?.detach();
    this.attached = null;
  }
}

export function useStageFit(
  viewportRef: StageViewport,
  slide: { w: Pt; h: Pt },
  opts: { zoom?: StageZoom; padding?: number; win?: Window | null } = {},
): StageFit {
  const { zoom = "fit", padding = 0, win = null } = opts;
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const watcher = useRef<ViewportWatcher | null>(null);

  // No dependency list on purpose: a ref's element can appear (or change) on any commit, and a ref object never
  // changes identity. sync() compares before it re-attaches, so a commit with the same element costs a compare.
  useEffect(() => {
    watcher.current ??= new ViewportWatcher((w, h) => setViewport((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h })));
    watcher.current.sync(viewportElement(viewportRef), win);
  });

  useEffect(
    () => () => {
      watcher.current?.dispose();
      watcher.current = null;
    },
    [],
  );

  const size = viewport ?? { w: 0, h: 0 };
  const scale = zoom === "fit" ? fitScale(size, slide, padding) : zoom;
  return { scale, viewport: size, measured: viewport !== null };
}
