"use client";

import { useSyncExternalStore } from "react";
import { motionValue } from "motion/react";
import { setMerchivaDockOpen } from "./dock-state";

/*
 * The phone's interactive reveal of the Mr. Merchiva overlay. On the /manager mobile layout a
 * swipe toward the inline start (right-to-left in LTR) pulls him in from the end edge:
 *
 *   beginMerchivaReveal()       the finger has claimed the swipe — the overlay mounts at the edge
 *   moveMerchivaReveal(p)       follows the finger, p = share of the panel width pulled in (0–1)
 *   endMerchivaReveal(commit)   released — commit opens the dock (dock-state, no focus move, so
 *                               the phone keyboard stays down); otherwise the panel slides away
 *
 * `merchivaReveal` is the overlay's position on every path (0 = off-screen at the end edge, 1 =
 * fully in); the overlay animates it itself when the dock opens or closes any other way.
 */

/** 0 = the overlay is off-screen at the end edge, 1 = fully in. */
export const merchivaReveal = motionValue(0);

const listeners = new Set<() => void>();
let revealing = false;

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The overlay's width on this viewport, in px: full width on phones, 400px from 640px up. */
export function merchivaPanelWidth(): number {
  if (typeof window === "undefined") return 400;
  return window.innerWidth >= 640 ? 400 : window.innerWidth;
}

export function beginMerchivaReveal(): void {
  merchivaReveal.stop();
  if (revealing) return;
  revealing = true;
  emit();
}

export function moveMerchivaReveal(progress: number): void {
  merchivaReveal.set(Math.min(1, Math.max(0, progress)));
}

export function endMerchivaReveal(commit: boolean): void {
  if (!revealing) return;
  revealing = false;
  if (commit) setMerchivaDockOpen(true);
  emit();
}

/** True while a finger is pulling the overlay in. Server snapshot: false. */
export function useMerchivaRevealing(): boolean {
  return useSyncExternalStore(subscribe, () => revealing, () => false);
}
