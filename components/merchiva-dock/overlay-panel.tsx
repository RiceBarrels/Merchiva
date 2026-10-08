"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { animate, motion, useMotionValueEvent, useReducedMotion, useTransform } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenDynamicUIElementCount } from "@/components/ui/dialog-depth";
import { useShellBackHandler } from "@/lib/browser-shell";
import { swipeOverlayOpen } from "@/lib/browser-shell/mobile-app/overlay-open";
import {
  claimReached,
  hasHorizontalScroller,
  lockAxis,
  releaseVelocity,
  shouldCommit,
  swipeDirection,
  swipeStartAllowed,
  type SwipeSample,
} from "@/lib/gestures/page-swipe";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { ChatLoading, MerchivaMark, TabChats, shortcutHint, useCanUseMerchiva } from "./dock-panel";
import { merchivaPanelWidth, merchivaReveal, moveMerchivaReveal, useMerchivaRevealing } from "./dock-reveal";
import { closeMerchivaDock, useHasDockSlot, useMerchivaDockOpen } from "./dock-state";
import { closeSwipeReveal, overlayPresence, revealTranslate, towardEnd } from "./overlay-motion";

/** Sliding in or out: about 300ms with no bounce, carrying on at the finger's speed after a swipe. */
const SETTLE = { type: "spring", visualDuration: 0.3, bounce: 0 } as const;
/** Touch samples kept for the release velocity (page-swipe.ts reads the last 80ms of them). */
const MAX_SAMPLES = 12;

function settleReveal(target: 0 | 1, reducedMotion: boolean): void {
  if (reducedMotion) merchivaReveal.jump(target);
  else animate(merchivaReveal, target, SETTLE);
}

/**
 * The dock where no shell gives it a column (the phone layout, the legacy shell): the same chats
 * over the end side of the page — the whole width on a phone. merchivaReveal places it on every
 * path: on the phone a finger pulls it in (dock-reveal.ts) and swipes it back out, and it slides
 * itself in and out when the dock opens or closes any other way. No scrim and no click-away.
 *
 * Its chat mounts once the dock opens, never for a pull the finger lets go of, and then stays
 * mounted while the dock is closed — off-screen, invisible and inert — so a reply keeps streaming
 * in, as in the desktop panel.
 */
export function MerchivaOverlayPanel({ open }: { open: boolean }) {
  const revealing = useMerchivaRevealing();
  const reducedMotion = useReducedMotion() ?? false;
  const [offscreen, setOffscreen] = useState(() => merchivaReveal.get() <= 0);
  useMotionValueEvent(merchivaReveal, "change", (reveal) => setOffscreen(reveal <= 0));

  const [loaded, setLoaded] = useState(open);
  if (open && !loaded) setLoaded(true);

  // A dock restored open on page load is simply there; from then on it slides. While a finger
  // pulls it in, the finger places it.
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (revealing) return;
    const target = open ? 1 : 0;
    if (placed.current) settleReveal(target, reducedMotion);
    else merchivaReveal.jump(target);
    placed.current = true;
  }, [open, revealing, reducedMotion]);

  const presence = overlayPresence({ open, revealing, offscreen, loaded });
  if (!presence.mounted) return null;
  return <OverlayAside open={open} visible={presence.visible} interactive={presence.interactive} reducedMotion={reducedMotion} />;
}

function OverlayAside({
  open,
  visible,
  interactive,
  reducedMotion,
}: {
  open: boolean;
  visible: boolean;
  interactive: boolean;
  reducedMotion: boolean;
}) {
  const { t, dir } = useI18n();
  const rtl = dir === "rtl";
  const closeLabel = t("merchiva.dock.close");
  const x = useTransform(merchivaReveal, (reveal) => revealTranslate(reveal, rtl));
  const ref = useRef<HTMLElement>(null);
  useCloseSwipe(ref, open, rtl, reducedMotion);

  return (
    <motion.aside
      ref={ref}
      aria-label={t("merchiva.name")}
      aria-hidden={visible ? undefined : true}
      inert={!interactive}
      style={{ x }}
      className={cn(
        "fixed inset-y-0 end-0 z-40 flex w-full flex-col border-s border-border bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl sm:w-[400px] ltr:pr-[env(safe-area-inset-right)] rtl:pl-[env(safe-area-inset-left)]",
        !visible && "invisible",
      )}
    >
      <div className="flex min-h-[42px] shrink-0 items-center gap-2 px-3 py-2">
        <MerchivaMark />
        <span className="flex-1 truncate text-[13px] font-semibold tracking-tight">{t("merchiva.name")}</span>
        <Button variant="ghost" size="icon-xs" onClick={closeMerchivaDock} aria-label={closeLabel} title={shortcutHint(closeLabel)}>
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
      <TabChats open={open} idle={<ChatLoading />} />
    </motion.aside>
  );
}

interface CloseSwipe {
  readonly id: number;
  readonly target: Element;
  readonly startX: number;
  readonly startY: number;
  /** The axis locked toward the end edge: the swipe's moves are prevented from here on. */
  decided: boolean;
  /** Out far enough (SWIPE_CLAIM_PX) to move the panel and swallow the click that follows. */
  claimed: boolean;
  /** Finger x and reveal when the swipe was claimed. */
  originX: number;
  from: number;
  readonly samples: SwipeSample[];
  /** Removes the listeners on `target`. */
  readonly unwatch: () => void;
}

/**
 * Swiping the open overlay toward the inline end follows the finger and, on release, closes the
 * dock or springs back (lib/gestures/page-swipe.ts decides). It yields to the message list's
 * vertical scroll, to horizontally scrollable code and table blocks, and to the composer, and a
 * tap whose thumb rolls a few pixels still clicks. A swipe whose end never came settles at the
 * next touch, toward wherever the dock is by then: it may have closed another way mid-swipe.
 */
function useCloseSwipe(ref: RefObject<HTMLElement | null>, open: boolean, rtl: boolean, reducedMotion: boolean): void {
  const latest = useRef({ open, rtl, reducedMotion });
  useLayoutEffect(() => {
    latest.current = { open, rtl, reducedMotion };
  });

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let swipe: CloseSwipe | null = null;

    const touchOf = (event: TouchEvent, id: number): Touch | null =>
      Array.from(event.changedTouches).find((touch) => touch.identifier === id) ?? null;
    const springBack = () => settleReveal(latest.current.open ? 1 : 0, latest.current.reducedMotion);
    /** Lets go of the swipe in hand, if any, and returns it. */
    const clear = (): CloseSwipe | null => {
      const ended = swipe;
      swipe = null;
      ended?.unwatch();
      return ended;
    };
    const abandon = () => {
      if (clear()?.claimed) springBack();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!swipe) return;
      const touch = touchOf(event, swipe.id);
      if (!touch) return;
      // The dock closed another way mid-swipe (Android back, the shortcut): its own settle runs.
      if (!latest.current.open) {
        clear();
        return;
      }
      const { rtl: isRtl } = latest.current;
      const dx = touch.clientX - swipe.startX;
      if (!swipe.decided) {
        const axis = lockAxis(dx, touch.clientY - swipe.startY);
        if (axis === "pending") return;
        if (
          axis === "vertical" ||
          swipeDirection(dx, isRtl ? "rtl" : "ltr") !== "toEnd" ||
          !event.cancelable ||
          event.defaultPrevented ||
          hasHorizontalScroller(swipe.target, root) ||
          swipeOverlayOpen()
        ) {
          clear();
          return;
        }
        swipe.decided = true;
      }
      if (!swipe.claimed) {
        // Decided, not yet out far enough to be a swipe rather than a rolling tap: no scroll starts,
        // nothing moves, and the tap's click is left alone.
        event.preventDefault();
        if (!claimReached(dx)) return;
        // A message's long-press menu can open between the decision and here.
        if (swipeOverlayOpen()) {
          clear();
          return;
        }
        swipe.claimed = true;
        swipe.originX = touch.clientX;
        swipe.from = merchivaReveal.get();
        merchivaReveal.stop();
      }
      event.preventDefault();
      const width = root.offsetWidth || merchivaPanelWidth();
      moveMerchivaReveal(closeSwipeReveal(swipe.from, touch.clientX - swipe.originX, width, isRtl));
      swipe.samples.push({ t: event.timeStamp, x: touch.clientX });
      if (swipe.samples.length > MAX_SAMPLES) swipe.samples.shift();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!swipe || !touchOf(event, swipe.id)) return;
      const ended = clear();
      if (!ended?.claimed) return;
      // The finger can come up over a button, here or (once the panel goes inert) on the page
      // beneath: a swipe is not a tap, so no click follows it.
      if (event.cancelable) event.preventDefault();
      if (!latest.current.open) return;
      const velocity = towardEnd(releaseVelocity(ended.samples), latest.current.rtl);
      if (shouldCommit(1 - merchivaReveal.get(), velocity)) closeMerchivaDock();
      else springBack();
    };

    // Touch events keep going to a target React removed mid-swipe (the loading chat giving way to
    // the real one, a streaming reply settling), and from there they no longer bubble to the
    // panel: the target's own listeners take over then. While it is still in the panel, the
    // panel's listeners handle the touch, so each event runs once. They stay registered for the
    // panel's life: a touchmove listener added at touchstart can come too late for the browser to
    // let it cancel the moves.
    const watch = (target: Element): (() => void) => {
      const detached = (handle: (event: TouchEvent) => void) => (event: Event) => {
        if (!root.contains(target)) handle(event as TouchEvent);
      };
      const onMove = detached(onTouchMove);
      const onEnd = detached(onTouchEnd);
      const onCancel = detached(abandon);
      target.addEventListener("touchmove", onMove, { passive: false });
      target.addEventListener("touchend", onEnd, { passive: false });
      target.addEventListener("touchcancel", onCancel);
      return () => {
        target.removeEventListener("touchmove", onMove);
        target.removeEventListener("touchend", onEnd);
        target.removeEventListener("touchcancel", onCancel);
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      // A swipe still in hand here lost its end (or this is a second finger): settle it first.
      abandon();
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      if (!latest.current.open || !target || !swipeStartAllowed(target, root)) return;
      swipe = {
        id: touch.identifier,
        target,
        startX: touch.clientX,
        startY: touch.clientY,
        decided: false,
        claimed: false,
        originX: 0,
        from: 1,
        samples: [],
        unwatch: watch(target),
      };
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: false });
    root.addEventListener("touchcancel", abandon);
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", abandon);
      abandon();
    };
  }, [ref]);
}

/**
 * Android hardware back closes the overlay (lib/browser-shell/android-back.ts). Back handlers only
 * register inside BrowserShellProvider and MerchivaDock is mounted beside it, so the phone chrome
 * calls this. A DynamicUIElement page sits above the overlay (z 50 + N against z-40): while one is
 * open the press goes on down the chain to it.
 */
export function useMerchivaBackHandler(): void {
  const allowed = useCanUseMerchiva();
  const open = useMerchivaDockOpen();
  const slotted = useHasDockSlot();
  const dialogs = useOpenDynamicUIElementCount();
  useShellBackHandler(() => {
    if (dialogs > 0) return false;
    closeMerchivaDock();
    return true;
  }, allowed && open && !slotted);
}
