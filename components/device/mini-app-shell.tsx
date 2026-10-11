"use client";

// The device surfaces open a catalog app the way a phone opens one: the app's
// window grows out of the tapped icon to cover the whole screen while the
// home screen recedes behind it, and closing shrinks it back into the app's
// icon. There is no title bar — the only chrome is a floating close button in
// the top-left corner.
//
// Two pieces, because the two live on opposite ends of the tree:
//   • MiniAppSurface wraps a device screen's outermost element. It owns the
//     home screen's recede and hosts the slot the app is portalled into, so
//     the app escapes the surface's own transform, overflow and (on /personal)
//     its 480px phone frame.
//   • MiniAppShell is rendered wherever the open state lives (AppsPane on
//     /store, the screen itself on /personal) and portals into that slot.
//
// The portal is what makes the cover work: a transformed ancestor becomes the
// containing block for `position: fixed`, so a fixed overlay rendered inside
// the receding screen would recede with it. For the same reason an open app's
// window carries no transform, filter or clip once it has arrived: editors and
// drawers inside it position fixed layers against the viewport.
//
// One progress value (0 = home screen, 1 = app open) drives the window and
// the home screen together, so a close during the launch reverses from where
// it is. The frames are computed in ./mini-app-launch.
//
// With `swipeToClose` (/personal) a drag down or toward the inline end picks
// the window up under the finger; its rules and frames are ./app-swipe-close.
// A second value, `held`, carries that drag: 1 under the finger, easing to 0
// as the window springs back or flies into its icon alongside the progress.

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { getSafeAreaInsets, getScreenCornerRadius } from "@/lib/safe-area";
import { hapticLight } from "@/lib/haptics";
import { createClickSuppressor } from "@/lib/browser-shell/mobile/use-pill-swipe";
import { SWIPE_CLAIM_PX, releaseVelocity, type SwipeSample } from "@/lib/gestures/page-swipe";
import { cn } from "@/lib/utils";
import { DialogHostContext, type DialogHost } from "@/components/ui/dialog-host";
import { TileGlyph, tileGradient } from "./apps-grid";
import {
  appKeepsDrag,
  closeDistance,
  closeOnRelease,
  closePull,
  closeSwipeFor,
  closeSwipeStartAllowed,
  dragFrame,
  homeProgressAt,
  type CloseSwipe,
} from "./app-swipe-close";
import {
  CLOSE_SPRING,
  HOME_DIM,
  HOME_RADIUS_PX,
  OPEN_SPRING,
  REDUCED_FADE,
  SPLASH_GLYPH_PX,
  clamp01,
  fadeFrame,
  homeScaleAt,
  iconAtRest,
  launchFrame,
  needsNewPath,
  transformCss,
  type LaunchGeometry,
  type LaunchTarget,
} from "./mini-app-launch";
import type { DeviceApp } from "./types";

interface MiniAppSurfaceValue {
  /** Where an open app renders — null until the surface has mounted. */
  slot: HTMLElement | null;
  /** The surface's own box, which launch geometry is measured against. */
  root: HTMLElement | null;
  /** 0 = home screen, 1 = an app covers it. The shell animates it and the
   *  home screen follows frame by frame. */
  progress: MotionValue<number>;
  /** 0–1: how far a close swipe has pulled the open app away. The home
   *  screen comes forward with it. */
  pull: MotionValue<number>;
  /** The home screen's scale as drawn right now. An interrupted animation
   *  jumps `progress` ahead of the last frame, so an icon measured then has
   *  to be unscaled by this, not by the progress. */
  homeScale: MotionValue<number>;
  /** True from the moment an app opens until it is back in its icon, so the
   *  screen stays receded behind the app on the way out too. */
  setShrunk: (shrunk: boolean) => void;
  /** The surface is part of the screen (the tablet's apps side), below the status bar. */
  pane: boolean;
}

const MiniAppSurfaceContext = createContext<MiniAppSurfaceValue | null>(null);

/** Wraps a device screen so an app can cover it. Use on the outermost element. */
export function MiniAppSurface({ children, overlay, pane = false, className }: {
  children: ReactNode;
  /** Device chrome that must stay visible above an open app — the store's
   *  about-to-log-out dimmer. Positioned against the surface; give it a
   *  z-index above the app's z-50. */
  overlay?: ReactNode;
  /** Covers part of the screen, not all of it (the /personal tablet's apps side, beside the
   *  channel): an app's window leaves out the status bar, which is above the surface, and a page
   *  opened in the app slides in over this surface only (dialog-host.ts `pageRoot`). */
  pane?: boolean;
  className?: string;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [shrunk, setShrunk] = useState(false);
  const progress = useMotionValue(0);
  const pull = useMotionValue(0);
  const reducedMotion = useReducedMotion() ?? false;
  const home = useTransform([progress, pull], ([p, d]: number[]) => homeProgressAt(p, d));
  // At progress 0 these are identity values, which motion writes as
  // `transform: none`: the screen is never left transformed at rest.
  const scale = useTransform(home, (p) => (reducedMotion ? 1 : homeScaleAt(p)));
  const borderRadius = useTransform(home, (p) => (reducedMotion ? 0 : clamp01(p) * HOME_RADIUS_PX));
  const dim = useTransform(home, (p) => clamp01(p) * HOME_DIM);
  const dimVisibility = useTransform(progress, (p) => (p > 0 ? "visible" : "hidden"));

  return (
    <MiniAppSurfaceContext.Provider value={{ slot, root, progress, pull, homeScale: scale, setShrunk, pane }}>
      <div ref={setRoot} className={cn("relative h-[100dvh] w-full overflow-hidden bg-black", className)}>
        <motion.div className={cn("h-full w-full", shrunk && "overflow-hidden")} style={{ scale, borderRadius }}>
          {children}
        </motion.div>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: dim, visibility: dimVisibility }}
        />
        <div ref={setSlot} />
        {overlay}
      </div>
    </MiniAppSurfaceContext.Provider>
  );
}

export interface MiniAppShellProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the app — there is no visible title bar to carry it. */
  title?: string;
  /** Overrides the close button's label (defaults to common.close). */
  closeLabel?: string;
  /** The app on screen: its tint and glyph make the launch splash, and its
   *  icon is where the window closes back into. Follow in-app navigation
   *  (EmbeddedPage onNavigate) so the close lands on the right tile. */
  app?: DeviceApp | null;
  /** The icon that was tapped (AppsGrid onOpen's second argument). The dock
   *  and the grid can both show an app, so the tapped copy is remembered
   *  rather than looked up by id. */
  origin?: HTMLElement | null;
  /** Close at once instead of animating — a lock must not play a close on
   *  top of the lock screen. */
  instantClose?: boolean;
  /** A drag down or toward the inline end (rightward in LTR) closes the app, the window
   *  following the finger (/personal). */
  swipeToClose?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Full-screen app over its MiniAppSurface. Grows out of its icon (or fades in
 * without one), closes on the floating top-left X or Escape.
 */
export function MiniAppShell({ open, onClose, instantClose = false, ...windowProps }: MiniAppShellProps) {
  const surface = useContext(MiniAppSurfaceContext);

  const setShrunk = surface?.setShrunk;
  // Leaving the surface with an app open (a log-out, an idle lock) unmounts
  // this without a close animation, so the screen has to be released here too.
  useEffect(() => () => setShrunk?.(false), [setShrunk]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Content that handled Escape itself (a dialog, a slideshow) keeps it:
      // one press closes the innermost thing, not the whole app behind it.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!surface?.slot || !surface.root) return null;

  return createPortal(
    // Dropping the presence unmounts a closing window at once; its unmount
    // puts the home screen back.
    instantClose && !open ? null : (
      <AnimatePresence>
        {open && (
          <LaunchWindow
            key="app"
            root={surface.root}
            slot={surface.slot}
            progress={surface.progress}
            pull={surface.pull}
            homeScale={surface.homeScale}
            setShrunk={surface.setShrunk}
            pane={surface.pane}
            onClose={onClose}
            {...windowProps}
          />
        )}
      </AnimatePresence>
    ),
    surface.slot,
  );
}

type LaunchWindowProps = Omit<MiniAppShellProps, "open" | "instantClose"> &
  Pick<MiniAppSurfaceValue, "progress" | "pull" | "homeScale" | "setShrunk" | "pane"> & { root: HTMLElement; slot: HTMLElement };

/** A close swipe from touchstart on. */
interface CloseGesture {
  readonly x0: number;
  readonly y0: number;
  readonly target: Element;
  /** The element the touch began in: the window, or a page opened in the app. */
  readonly root: HTMLElement;
  /** On a page only a drag down closes; sideways drags are the page's own. */
  readonly downOnly: boolean;
  /** Decided at the axis lock; null before. */
  swipe: CloseSwipe | null;
  /** True once the finger is SWIPE_CLAIM_PX out: only then does the window move. */
  claimed: boolean;
  /** Distance along the swipe over time, for the release velocity. */
  readonly samples: SwipeSample[];
  readonly unwatch: () => void;
}

/** The picked-up window: the finger's travel, its pull, and where it took the window (window px). */
interface HeldDrag {
  dx: number;
  dy: number;
  pull: number;
  readonly originX: number;
  readonly originY: number;
}

const MAX_SAMPLES = 12;


/** Draws a DynamicUIElement page opened in the app on the window's frame (or back at rest, for null). */
function followWindow(page: HTMLElement, win: HTMLElement | null, opacity: string) {
  page.style.clipPath = win?.style.clipPath ?? "";
  page.style.transform = win?.style.transform ?? "";
  page.style.transformOrigin = win?.style.transformOrigin ?? "";
  page.style.opacity = opacity;
}

/** A page over the app is gone by the time the window is this far into its icon. */
const PAGE_GONE_AT = 0.35;
const PAGE_FADE_SPAN = 0.45;
const pageOpacityAt = (p: number) => clamp01((p - PAGE_GONE_AT) / PAGE_FADE_SPAN);
/** One line of the name pill: its natural width, up to what the pill can hold. */
const PILL_TEXT = "absolute inset-y-0 left-3.5 flex w-max max-w-[calc(100vw-102px)] items-center whitespace-nowrap";
/** The pill's inline padding and border around its text. */
const PILL_PADDING_PX = 30;
/** How long a freshly opened app shows the close hint before its name. */
const SWIPE_HINT_MS = 2000;

/** Copies of the app's icon on the home screen, best first: the tapped one
 *  while it still shows this app, then the dock's, then the grid's. */
function iconCandidates(root: HTMLElement, appId: string, tapped: HTMLElement | null | undefined): HTMLElement[] {
  const tile = `[data-app-tile="${CSS.escape(appId)}"] [data-app-icon]`;
  const found: HTMLElement[] = [];
  if (tapped && tapped.closest("[data-app-tile]")?.getAttribute("data-app-tile") === appId) found.push(tapped);
  found.push(...root.querySelectorAll<HTMLElement>(`[data-app-dock] ${tile}`), ...root.querySelectorAll<HTMLElement>(tile));
  return found;
}

/** Launch geometry for an icon, or null when it can't be zoomed from: gone,
 *  empty, off the surface or scrolled out of its grid. */
function geometryFor(el: HTMLElement, root: HTMLElement, slot: HTMLElement, homeScale: number): LaunchGeometry | null {
  if (!el.isConnected || slot.contains(el) || !root.contains(el)) return null;
  const surface = root.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const viewport = el.closest("[data-app-viewport]")?.getBoundingClientRect();
  if (viewport && (cx < viewport.left || cx > viewport.right || cy < viewport.top || cy > viewport.bottom)) return null;
  const icon = iconAtRest(
    { cx: cx - surface.left, cy: cy - surface.top, w: el.offsetWidth, h: el.offsetHeight },
    { w: surface.width, h: surface.height },
    homeScale,
  );
  if (!icon) return null;
  return {
    w: surface.width,
    h: surface.height,
    icon: { ...icon, r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 },
    screenRadius: getScreenCornerRadius() || 12,
  };
}

function LaunchWindow({
  root, slot, progress, pull, homeScale, setShrunk, pane, onClose, title, closeLabel, app, origin, swipeToClose = false, children, className,
}: LaunchWindowProps) {
  const { t, dir } = useI18n();
  // A pane sits below the status bar already: nothing to clear.
  const safeTop = pane ? 0 : getSafeAreaInsets().top;
  const reducedMotion = useReducedMotion() ?? false;
  const [isPresent, safeToRemove] = usePresence();
  const windowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const splashRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLDivElement>(null);
  const glyphRef = useRef<HTMLDivElement>(null);
  /** The current launch path; null fades instead of zooming. */
  const geometry = useRef<LaunchGeometry | null>(null);
  /** The app and tapped icon `geometry` was measured for. */
  const measuredFor = useRef<LaunchTarget | null>(null);
  /** "Swipe down to close" stands where the app's name goes for a moment after it opens. */
  const [hint, setHint] = useState(swipeToClose);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(false), SWIPE_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);
  // A DynamicUIElement page opened from the app pushes the app aside, as it
  // pushes the /manager shell. The push layer sits between the window and
  // the stage, which the launch frames write to.
  // A drag down on such a page closes the page and the app together: the
  // pages follow the window frame by frame (`paint`).
  const pushRef = useRef<HTMLDivElement>(null);
  const pages = useRef(new Set<HTMLElement>());
  /** Starts listening to a page; set while swipeToClose is on. */
  const listenToPage = useRef<((page: HTMLElement) => () => void) | null>(null);
  const [dialogHost] = useState<DialogHost>(() => ({
    pushTarget: () => pushRef.current,
    // In a pane, pages render beside the window in the surface's slot: they share the window's box
    // (and so its frames, below), slide in up to the pane's edge and leave the rest of the screen be.
    ...(pane ? { pageRoot: () => slot } : {}),
    attachPage(page) {
      pages.current.add(page);
      const unlisten = listenToPage.current?.(page);
      return () => {
        pages.current.delete(page);
        unlisten?.();
        followWindow(page, null, "");
      };
    },
  }));
  const pillRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  // The pill is as wide as the text it shows (its own max-width caps a long
  // name, which then truncates).
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const text = (hint ? hintRef : titleRef).current;
    if (pill && text) pill.style.width = `${text.offsetWidth + PILL_PADDING_PX}px`;
  }, [hint, title, app, t]);
  /** How much of a close swipe's drag still applies (see the file comment). */
  const held = useMotionValue(0);
  const drag = useRef<HeldDrag | null>(null);

  // Writes one frame straight to the DOM. Progress 1 with nothing held clears
  // everything: an open app's window keeps no transform, opacity or clip-path.
  const paint = useEffectEvent((p: number) => {
    const win = windowRef.current;
    const stage = stageRef.current;
    if (!win || !stage) return;
    const geo = geometry.current;
    const zoom = p < 1 && geo && !reducedMotion ? launchFrame(p, geo) : null;
    const fade = p < 1 && !zoom ? fadeFrame(p) : null;
    const h = held.get();
    const d = h > 0 ? drag.current : null;
    const lift = d ? dragFrame(d, h, getScreenCornerRadius() || 12) : null;
    pull.set(d ? d.pull * h : 0);
    const transforms: string[] = [];
    if (lift) transforms.push(transformCss(lift.x, lift.y, lift.scale));
    if (fade && !reducedMotion) transforms.push(`scale(${fade.scale})`);
    // The clip sits under the transform, so its radius is drawn scaled.
    win.style.clipPath = zoom ? zoom.clipPath : lift ? `inset(0px round ${lift.radius / lift.scale}px)` : "";
    win.style.opacity = fade ? String(fade.opacity) : "";
    win.style.transform = transforms.join(" ");
    win.style.transformOrigin = d ? `${d.originX}px ${d.originY}px` : "";
    for (const page of pages.current) {
      // A page shares the window's box: it rides the same frame, and fades
      // out on the way into the icon so the splash shows there.
      followWindow(page, win, p < 1 ? String(pageOpacityAt(p) * (fade ? fade.opacity : 1)) : "");
    }
    stage.style.transform = zoom ? transformCss(zoom.stage.x, zoom.stage.y, zoom.stage.scale) : "";
    const splash = splashRef.current;
    if (!splash) return;
    splash.style.visibility = zoom && zoom.splashOpacity > 0 ? "visible" : "";
    splash.style.opacity = zoom ? String(zoom.splashOpacity) : "";
    if (zoom && tintRef.current && glyphRef.current) {
      tintRef.current.style.transform = transformCss(zoom.tint.x, zoom.tint.y, zoom.tint.sx, zoom.tint.sy);
      glyphRef.current.style.transform = transformCss(zoom.glyph.x, zoom.glyph.y, zoom.glyph.scale);
    }
  });

  useLayoutEffect(() => progress.on("change", (p) => paint(p)), [progress]);
  useLayoutEffect(() => held.on("change", () => paint(progress.get())), [held, progress]);

  // The icon the window grows out of and closes into is left blank on the
  // home screen while the app is out of it, as a phone does.
  const hiddenIcon = useRef<HTMLElement | null>(null);
  const hideIcon = useEffectEvent((icon: HTMLElement | null) => {
    if (hiddenIcon.current === icon) return;
    if (hiddenIcon.current) hiddenIcon.current.style.visibility = "";
    hiddenIcon.current = icon;
    if (icon) icon.style.visibility = "hidden";
  });

  const run = useEffectEvent((present: boolean) => {
    const from = progress.get();
    const target: LaunchTarget = { appId: app?.id ?? null, origin: origin ?? null };
    // A launch from the home screen starts at the tapped icon; one that
    // reverses a close keeps the path it is on, unless another app (or
    // another copy of the icon) was tapped while the last one closed. A close
    // aims at the current app's icon, which in-app navigation may have
    // changed — an app with no tile closes with a fade.
    if (needsNewPath(present, from, measuredFor.current, target)) {
      const candidates = app ? iconCandidates(root, app.id, origin) : present && origin ? [origin] : [];
      geometry.current = null;
      let icon: HTMLElement | null = null;
      for (const el of candidates) {
        geometry.current = geometryFor(el, root, slot, homeScale.get());
        if (geometry.current) {
          icon = el;
          break;
        }
      }
      measuredFor.current = target;
      hideIcon(icon);
    }
    if (present) setShrunk(true);
    paint(from);
    let cancelled = false;
    const controls = animate(progress, present ? 1 : 0, reducedMotion ? REDUCED_FADE : present ? OPEN_SPRING : CLOSE_SPRING);
    void controls.then(() => {
      if (cancelled || present) return;
      // Only once the window is back in its icon does the home screen take
      // over again, icon and all.
      hideIcon(null);
      setShrunk(false);
      safeToRemove?.();
    });
    return () => {
      cancelled = true;
      controls.stop();
    };
  });

  useLayoutEffect(() => run(isPresent), [isPresent]);

  // Unmounted mid-launch (an instant close, a log-out): back to the home screen.
  useLayoutEffect(() => () => {
    if (hiddenIcon.current) hiddenIcon.current.style.visibility = "";
    hiddenIcon.current = null;
    held.stop();
    progress.jump(0);
    pull.jump(0);
    setShrunk(false);
  }, [held, progress, pull, setShrunk]);

  // Lets go of a picked-up window: it closes (flying into its icon as the
  // progress runs down) or springs back to cover the screen.
  const release = useEffectEvent((close: boolean) => {
    if (!drag.current) return;
    if (close) {
      void hapticLight();
      onClose();
    }
    const controls = animate(held, 0, reducedMotion ? REDUCED_FADE : close ? CLOSE_SPRING : OPEN_SPRING);
    void controls.then(() => {
      if (held.get() > 0) return;
      drag.current = null;
      paint(progress.get());
    });
  });

  // Whether a close swipe may start now: the app is open and has arrived.
  const swipeable = useEffectEvent(() => swipeToClose && isPresent && progress.get() >= 1 && !progress.isAnimating());

  // A close swipe takes nothing until the axis locks on a drag the app does
  // not want itself, and moves nothing until it is claimed; the click that
  // follows a claimed swipe is swallowed. Native listeners, so a touchmove
  // never re-renders React.
  useEffect(() => {
    const win = windowRef.current;
    if (!win || !swipeToClose) return;
    let gesture: CloseGesture | null = null;
    const clicks = createClickSuppressor(() => performance.now());

    const finish = (): CloseGesture | null => {
      const g = gesture;
      gesture = null;
      g?.unwatch();
      clicks.release();
      return g;
    };
    const cancel = () => {
      if (finish()?.claimed) release(false);
    };

    const onTouchEnd = (event: TouchEvent) => {
      const g = finish();
      if (!g?.claimed || !g.swipe || !drag.current) return;
      const lifted = event.changedTouches[0];
      if (lifted) {
        g.samples.push({ t: event.timeStamp, x: closeDistance(g.swipe, lifted.clientX - g.x0, lifted.clientY - g.y0, dir) });
      }
      release(closeOnRelease(drag.current.pull, releaseVelocity(g.samples)));
    };
    // The end of a touch is heard on its target, which keeps getting touch
    // events after React removes it mid-drag (they no longer bubble here).
    const onTargetEnd = (event: Event) => onTouchEnd(event as TouchEvent);
    const watch = (target: Element) => {
      target.addEventListener("touchend", onTargetEnd, { passive: true });
      target.addEventListener("touchcancel", cancel, { passive: true });
      return () => {
        target.removeEventListener("touchend", onTargetEnd);
        target.removeEventListener("touchcancel", cancel);
      };
    };

    const onTouchStart = (event: TouchEvent, root: HTMLElement) => {
      cancel();
      clicks.reset();
      if (event.touches.length !== 1 || !swipeable()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !closeSwipeStartAllowed(target, root)) return;
      const touch = event.touches[0];
      gesture = {
        x0: touch.clientX,
        y0: touch.clientY,
        target,
        root,
        downOnly: root !== win,
        swipe: null,
        claimed: false,
        samples: [{ t: event.timeStamp, x: 0 }],
        unwatch: watch(target),
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const g = gesture;
      if (!g) return;
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      const dx = touch.clientX - g.x0;
      const dy = touch.clientY - g.y0;

      if (g.swipe === null) {
        const swipe = closeSwipeFor(dx, dy, dir);
        if (swipe === "pending") return;
        // Not a close swipe, or the app already took the drag (a native
        // scroll, its own gesture, a scroller that wants it).
        if (
          swipe === null || (g.downOnly && swipe !== "down") ||
          !event.cancelable || event.defaultPrevented || appKeepsDrag(swipe, g.target, g.root)
        ) {
          finish();
          return;
        }
        g.swipe = swipe;
      }

      // Decided: no scroll may start under the swipe.
      event.preventDefault();
      const distance = closeDistance(g.swipe, dx, dy, dir);
      if (!g.claimed) {
        // Out far enough to be a swipe rather than a rolling tap?
        if (distance < SWIPE_CLAIM_PX) return;
        if (!swipeable()) {
          finish();
          return;
        }
        g.claimed = true;
        clicks.arm();
        held.stop();
        const box = win.getBoundingClientRect();
        // A window still springing back from the last swipe is taken where it is.
        drag.current = { dx, dy, pull: 0, originX: g.x0 - box.left, originY: g.y0 - box.top };
        held.jump(1);
      }
      g.samples.push({ t: event.timeStamp, x: distance });
      if (g.samples.length > MAX_SAMPLES) g.samples.shift();
      const d = drag.current;
      if (!d) return;
      d.dx = dx;
      d.dy = dy;
      d.pull = closePull(g.swipe, distance, { w: win.clientWidth, h: win.clientHeight });
      paint(progress.get());
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!clicks.consume()) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const listen = (root: HTMLElement) => {
      const onStart = (event: TouchEvent) => onTouchStart(event, root);
      root.addEventListener("touchstart", onStart, { passive: true });
      root.addEventListener("touchmove", onTouchMove, { passive: false });
      root.addEventListener("click", onClickCapture, true);
      return () => {
        root.removeEventListener("touchstart", onStart);
        root.removeEventListener("touchmove", onTouchMove);
        root.removeEventListener("click", onClickCapture, true);
      };
    };
    const unlisten = [listen(win), ...Array.from(pages.current, listen)];
    listenToPage.current = listen;
    window.addEventListener("resize", cancel);
    window.addEventListener("orientationchange", cancel);
    return () => {
      listenToPage.current = null;
      for (const off of unlisten) off();
      window.removeEventListener("resize", cancel);
      window.removeEventListener("orientationchange", cancel);
      cancel();
    };
  }, [swipeToClose, dir, held, progress]);

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-no-swipe
      className={cn(
        "absolute inset-0 z-50 overflow-hidden bg-background text-foreground",
        // A closing window lets taps through to the home screen it shrinks into.
        !isPresent && "pointer-events-none",
        className,
      )}
    >
      <DialogHostContext.Provider value={dialogHost}>
      <div ref={pushRef} className="absolute inset-0 bg-background">
      <div ref={stageRef} className="absolute inset-0 origin-top-left">
        {/* A solid strip under the status bar. Safari 26 frosts whatever
            scrolls under its top edge unless a fixed element sits there, and
            then takes that element's color instead. Fixed only once the
            window has arrived: until then the window's transform holds it. */}
        {safeTop > 0 && (
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-20 bg-background"
            style={{ height: safeTop }}
          />
        )}
        <div
          className="h-full overflow-y-auto overscroll-contain"
          // Clears the floating close button so an app's first row is never
          // underneath it.
          style={{ paddingTop: safeTop + 52 }}
        >
          {children}
        </div>
        <button
          type="button"
          aria-label={closeLabel ?? t("common.close")}
          onClick={() => { hapticLight(); onClose(); }}
          style={{ top: safeTop + 10 }}
          className="absolute left-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm active:scale-95"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
        {swipeToClose && title && (
          // The app's name in a pill matching the close button; a fresh app
          // first says how to close it. The pill fits whichever is showing
          // and eases its width from one to the other.
          <div
            ref={pillRef}
            aria-hidden
            style={{ top: safeTop + 10 + 4 }}
            className="pointer-events-none absolute left-[64px] z-10 h-9 max-w-[calc(100%-72px)] overflow-hidden rounded-full border border-border bg-background/80 shadow-sm backdrop-blur-sm transition-[width] duration-300 ease-out"
          >
            <span
              ref={titleRef}
              className={cn(PILL_TEXT, "gap-2 transition-opacity duration-300", hint ? "opacity-0" : "opacity-100")}
            >
              {app && (
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-[5px] text-foreground", tileGradient(app))}>
                  <TileGlyph app={app} className="h-3 w-3" />
                </span>
              )}
              <span className="truncate text-[14px] font-medium">{title}</span>
            </span>
            <span
              ref={hintRef}
              className={cn(PILL_TEXT, "text-[13px] text-muted-foreground transition-opacity duration-300", hint ? "opacity-100" : "opacity-0")}
            >
              <span className="truncate">{t("device.swipeToClose")}</span>
            </span>
          </div>
        )}
      </div>
      </div>
      </DialogHostContext.Provider>
      {/* Launch splash: the tile's tint and glyph cover the app while it
          zooms (and its first lazy load), then fade. */}
      {app && (
        <div ref={splashRef} aria-hidden className="pointer-events-none invisible absolute inset-0">
          <div ref={tintRef} className={cn("absolute inset-0 origin-top-left", tileGradient(app))} />
          <div
            ref={glyphRef}
            className="absolute left-0 top-0 origin-top-left text-foreground"
            style={{ width: SPLASH_GLYPH_PX, height: SPLASH_GLYPH_PX }}
          >
            <TileGlyph app={app} className="h-full w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
