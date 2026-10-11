"use client";

import * as React from "react";
import { displayedDialogPage } from "@/lib/browser-shell/shell-dom";
import { useDialogHost, type DialogHost } from "@/components/ui/dialog-host";

/*
 * The DynamicUIElement depth cue (components/ui/dynamic-ui-element.tsx): an open dialog pushes the layer
 * under it aside, and lets it slide back when it closes.
 *
 * Each layer has one owner, the newest dialog pushing it. A page reopened while the last one slides
 * out pushes the same layer: the old page's last frames, its release and the clean-up that release
 * schedules must not take the push back from it.
 */

export const DIALOG_BG_TRANSITION =
  "transform 500ms cubic-bezier(0.32, 0.72, 0, 1), border-radius 500ms cubic-bezier(0.32, 0.72, 0, 1)";

/** How long a released layer keeps its transition and clip while it slides back. */
const RELEASE_MS = 520;

/** A dialog pushing layers; a newer one outranks an older one on the same layer. */
export interface BgOwner {
  readonly seq: number;
}
let ownerSeq = 0;
export function createBgOwner(): BgOwner {
  return { seq: ++ownerSeq };
}

const owners = new WeakMap<HTMLElement, BgOwner>();
const pendingCleanups = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Resolve the DOM element that should be pushed left when a dialog opens.
 *
 * - depth 0 dialogs push the DialogHost they were opened in (a device app's
 *   window), else the app shell (id="mobile-content" / "desktop-content"; the
 *   two shells are mutually exclusive, so only one exists at a time).
 * - depth > 0 dialogs push the dialog right below them (id="mobile-dialog-N").
 *
 * Returns null until React has committed an id to look up, so the caller
 * skips work cleanly on the first render.
 */
function findBgTarget(depth: number, host: DialogHost | null): HTMLElement | null {
  if (depth < 0) return null;
  if (typeof document === "undefined") return null;
  if (depth > 0) return displayedDialogPage(depth - 1);
  return host?.pushTarget() ?? (
    document.getElementById("mobile-content") ??
    document.getElementById("desktop-content")
  );
}

/**
 * Takes a layer for `owner`, cancelling the clean-up of an earlier release still sliding back. False
 * when a newer dialog holds it: the caller leaves the layer alone.
 */
export function claimBgTarget(el: HTMLElement, owner: BgOwner): boolean {
  const holder = owners.get(el);
  if (holder && holder.seq > owner.seq) return false;
  const pending = pendingCleanups.get(el);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingCleanups.delete(el);
  }
  owners.set(el, owner);
  return true;
}

/** Animates a pushed layer back to identity, then clears the inline styles once it has slid back — unless another dialog took it since. */
export function releaseBgTarget(el: HTMLElement, owner: BgOwner) {
  if (owners.get(el) !== owner) return;
  owners.delete(el);
  el.style.transition = DIALOG_BG_TRANSITION;
  el.style.transform = "";
  el.style.borderRadius = "";
  pendingCleanups.set(el, setTimeout(() => {
    pendingCleanups.delete(el);
    if (owners.has(el)) return;
    el.style.overflow = "";
    el.style.transition = "";
  }, RELEASE_MS));
}

/** The layer a dialog at `depth` pushes, kept current as the stack re-ranks, and let go of on unmount. */
function useBgTarget(depth: number, owner: BgOwner, onTarget?: (el: HTMLElement) => void) {
  const targetRef = React.useRef<HTMLElement | null>(null);
  const host = useDialogHost();
  React.useLayoutEffect(() => {
    const target = findBgTarget(depth, host);
    // The depth changed (the stack re-ranks when another dialog opens): the old layer is let go.
    if (targetRef.current && targetRef.current !== target) releaseBgTarget(targetRef.current, owner);
    targetRef.current = target;
    if (target) onTarget?.(target);
  }, [depth, host, owner, onTarget]);

  React.useEffect(() => {
    return () => {
      if (targetRef.current) releaseBgTarget(targetRef.current, owner);
    };
  }, [owner]);
  return targetRef;
}

/**
 * Shared push-the-bg-left side effect, declarative: the desktop side panel and centered modal.
 *
 * 1. Style updates — useLayoutEffect that re-applies inline transform every
 *    time bg geometry changes. It does NOT clear the styles when the dep array
 *    changes (a cleanup on every re-render snapped the bg back to identity
 *    before re-applying, which the eye reads as "no animation").
 *
 * 2. Unmount — the layer animates back to identity, then its inline styles
 *    are cleared once the slide-back finishes (releaseBgTarget).
 */
export function useDialogBgPush({
  depth,
  shift,
  scale,
  radius,
}: {
  depth: number;
  shift: number;
  scale: number;
  radius: number;
}) {
  const [owner] = React.useState(createBgOwner);
  const targetRef = useBgTarget(depth, owner);
  React.useLayoutEffect(() => {
    const el = targetRef.current;
    if (!el || !claimBgTarget(el, owner)) return;
    el.style.transition = DIALOG_BG_TRANSITION;
    el.style.transform = `translateX(${shift}px) scale(${scale})`;
    el.style.borderRadius = `${radius}px`;
    el.style.overflow = "hidden";
  }, [shift, scale, radius, depth, owner, targetRef]);
}

/** The pushed layer at `progress` (0 = at rest, 1 = a phone page fully over it) on a screen `width` px wide. */
export function dialogBgFrame(progress: number, width: number): { shift: number; scale: number; radius: number } {
  const p = Math.min(1, Math.max(0, progress));
  return { shift: -width * 0.3 * p, scale: 1 - 0.06 * p, radius: 12 * p };
}

/**
 * The phone page's push, driven frame by frame: the page paints the layer from its own slide (open,
 * Back, and the finger on a swipe), so the two never drift apart. Returns the painter; the last
 * frame is repainted when the layer changes.
 */
export function useDialogBgLayer(depth: number): (progress: number) => void {
  const [owner] = React.useState(createBgOwner);
  const last = React.useRef<number | null>(null);
  const write = React.useCallback((el: HTMLElement) => {
    if (last.current === null || !claimBgTarget(el, owner)) return;
    // The layer's own width: the screen for a shell or a full-screen app, the apps side for a tablet's app.
    const { shift, scale, radius } = dialogBgFrame(last.current, el.clientWidth || window.innerWidth || 400);
    el.style.transition = "none";
    el.style.transform = `translateX(${shift}px) scale(${scale})`;
    el.style.borderRadius = `${radius}px`;
    el.style.overflow = "hidden";
  }, [owner]);
  const targetRef = useBgTarget(depth, owner, write);
  return React.useCallback((progress: number) => {
    last.current = progress;
    if (targetRef.current) write(targetRef.current);
  }, [targetRef, write]);
}
