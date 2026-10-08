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
import { useT } from "@/lib/i18n/context";
import { getSafeAreaInsets, getScreenCornerRadius } from "@/lib/safe-area";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { TileGlyph, tileGradient } from "./apps-grid";
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
  /** The home screen's scale as drawn right now. An interrupted animation
   *  jumps `progress` ahead of the last frame, so an icon measured then has
   *  to be unscaled by this, not by the progress. */
  homeScale: MotionValue<number>;
  /** True from the moment an app opens until it is back in its icon, so the
   *  screen stays receded behind the app on the way out too. */
  setShrunk: (shrunk: boolean) => void;
}

const MiniAppSurfaceContext = createContext<MiniAppSurfaceValue | null>(null);

/** Wraps a device screen so an app can cover it. Use on the outermost element. */
export function MiniAppSurface({ children, overlay, className }: {
  children: ReactNode;
  /** Device chrome that must stay visible above an open app — the store's
   *  about-to-log-out dimmer. Positioned against the surface; give it a
   *  z-index above the app's z-50. */
  overlay?: ReactNode;
  className?: string;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [shrunk, setShrunk] = useState(false);
  const progress = useMotionValue(0);
  const reducedMotion = useReducedMotion() ?? false;
  // At progress 0 these are identity values, which motion writes as
  // `transform: none`: the screen is never left transformed at rest.
  const scale = useTransform(progress, (p) => (reducedMotion ? 1 : homeScaleAt(p)));
  const borderRadius = useTransform(progress, (p) => (reducedMotion ? 0 : clamp01(p) * HOME_RADIUS_PX));
  const dim = useTransform(progress, (p) => clamp01(p) * HOME_DIM);
  const dimVisibility = useTransform(progress, (p) => (p > 0 ? "visible" : "hidden"));

  return (
    <MiniAppSurfaceContext.Provider value={{ slot, root, progress, homeScale: scale, setShrunk }}>
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
            homeScale={surface.homeScale}
            setShrunk={surface.setShrunk}
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
  Pick<MiniAppSurfaceValue, "progress" | "homeScale" | "setShrunk"> & { root: HTMLElement; slot: HTMLElement };

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

function LaunchWindow({ root, slot, progress, homeScale, setShrunk, onClose, title, closeLabel, app, origin, children, className }: LaunchWindowProps) {
  const t = useT();
  const safeArea = getSafeAreaInsets();
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

  // Writes one frame straight to the DOM. Progress 1 clears everything: an
  // open app's window keeps no transform, opacity or clip-path.
  const paint = useEffectEvent((p: number) => {
    const win = windowRef.current;
    const stage = stageRef.current;
    if (!win || !stage) return;
    const geo = geometry.current;
    const zoom = p < 1 && geo && !reducedMotion ? launchFrame(p, geo) : null;
    const fade = p < 1 && !zoom ? fadeFrame(p) : null;
    win.style.clipPath = zoom ? zoom.clipPath : "";
    win.style.opacity = fade ? String(fade.opacity) : "";
    win.style.transform = fade && !reducedMotion ? `scale(${fade.scale})` : "";
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
      for (const el of candidates) {
        geometry.current = geometryFor(el, root, slot, homeScale.get());
        if (geometry.current) break;
      }
      measuredFor.current = target;
    }
    if (present) setShrunk(true);
    paint(from);
    let cancelled = false;
    const controls = animate(progress, present ? 1 : 0, reducedMotion ? REDUCED_FADE : present ? OPEN_SPRING : CLOSE_SPRING);
    void controls.then(() => {
      if (cancelled || present) return;
      // Only once the window is back in its icon does the home screen take
      // over again.
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
    progress.jump(0);
    setShrunk(false);
  }, [progress, setShrunk]);

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
      <div ref={stageRef} className="absolute inset-0 origin-top-left">
        <div
          className="h-full overflow-y-auto overscroll-contain"
          // Clears the floating close button so an app's first row is never
          // underneath it.
          style={{ paddingTop: safeArea.top + 52 }}
        >
          {children}
        </div>
        <button
          type="button"
          aria-label={closeLabel ?? t("common.close")}
          onClick={() => { hapticLight(); onClose(); }}
          style={{ top: safeArea.top + 10 }}
          className="absolute left-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm active:scale-95"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>
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
