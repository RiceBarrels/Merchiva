"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { TabPageOutlet } from "@/components/browser-shell/core/tab-page-outlet";
import { useMerchivaBackHandler } from "@/components/merchiva-dock";
import { useCanUseMerchiva } from "@/components/merchiva-dock/dock-panel";
import { useMerchivaRevealing } from "@/components/merchiva-dock/dock-reveal";
import { useHasDockSlot, useMerchivaDockOpen } from "@/components/merchiva-dock/dock-state";
import { useUnreadCount } from "@/components/notification-center";
import { useOpenDynamicUIElementCount } from "@/components/ui/dialog-depth";
import {
  useActiveTab,
  useShellBackHandler,
  useShellChromeState,
  useTabContentHost,
  useTabPresentation,
  useVirtualKeyboard,
} from "@/lib/browser-shell";
import {
  DRAWER_INSTANT,
  DRAWER_SETTLE,
  contentOffset,
  contentRadius,
  contentShadow,
  drawerWidth,
  pageFootprint,
  pageOwnsCorner,
  sidebarScale,
} from "@/lib/browser-shell/mobile-app/drawer";
import { useMobilePlatform } from "@/lib/browser-shell/mobile/platform";
import { useBottomSafeInset } from "@/lib/browser-shell/mobile/use-bottom-inset";
import { useReserveBottom } from "@/lib/browser-shell/mobile/use-reserve-bottom";
import { hapticLight } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n/context";
import { MenuButton } from "./menu-button";
import { SidebarDrawer } from "./sidebar-drawer";
import { usePageSwipe } from "./use-page-swipe";

/** Playback controls returned by motion's `animate`. */
type SettleAnimation = ReturnType<typeof animate>;

/**
 * The /manager chrome for viewports under 1024px: an app, not a browser. One tab, no toolbar,
 * tabs or omnibox; a view over the core tab store that writes no history or `document.title` and
 * installs no global key or history listeners.
 *
 *   #mobile-content  the page outlet, exactly once, with the menu button in its top start corner.
 *                    DynamicUIElement writes inline transforms to it, so this chrome never does:
 *                    it moves the push layer around it, which carries no transform at rest.
 *   drawer           the sidebar at the inline start. The menu button or a swipe toward the end
 *                    opens it: the page slides aside with rounded leading corners and a shadow,
 *                    a scrim covers it, and the sidebar fades and grows in beneath. Tapping the
 *                    scrim or a row, Android back, Escape or a swipe toward the start closes it.
 *   Mr. Merchiva     with the drawer closed, a swipe toward the start pulls his overlay in from
 *                    the end edge (merchiva-dock/dock-reveal.ts). The overlay lives outside the
 *                    shell provider, so Android back closes it from here.
 */
export function MobileAppChrome({ children }: { children: ReactNode }) {
  const { t, dir } = useI18n();
  const reducedMotion = useReducedMotion() ?? false;
  const pathname = usePathname() ?? "/";
  const activeTab = useActiveTab();
  const pageUrl = useTabPresentation(activeTab).url;
  const chromeRequest = useShellChromeState();
  const keyboard = useVirtualKeyboard();
  const platform = useMobilePlatform();
  const openDialogs = useOpenDynamicUIElementCount();
  const unread = useUnreadCount();
  const merchivaAllowed = useCanUseMerchiva();
  const dockOpen = useMerchivaDockOpen();
  const slotted = useHasDockSlot();
  const revealing = useMerchivaRevealing();
  // The dock flag is per device: for a member who can't use Mr. Merchiva it opens nothing.
  const merchivaOverlay = merchivaAllowed && ((dockOpen && !slotted) || revealing);

  // ── Elements ───────────────────────────────────────────────────────────────
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const setContentNode = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    setContentEl(node);
  }, []);
  useTabContentHost(contentRef);
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [sidebarEl, setSidebarEl] = useState<HTMLDivElement | null>(null);
  const [scrimEl, setScrimEl] = useState<HTMLButtonElement | null>(null);
  const [probeEl, setProbeEl] = useState<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLButtonElement | null>(null);

  // ── Bottom edge ────────────────────────────────────────────────────────────
  // The 100dvh frame runs past the padded body, so the page's bottom is measured, not assumed.
  const bottomInset = useBottomSafeInset(probeEl);
  const bottom = useReserveBottom(
    frameEl,
    pageFootprint({
      immersive: chromeRequest.immersive,
      docked: chromeRequest.mobileChrome === "docked",
      keyboardOpen: keyboard.open,
      keyboardInset: keyboard.inset,
      bottomInset,
    }),
  );

  // ── Drawer ─────────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const progress = useMotionValue(0);
  const settleRef = useRef<SettleAnimation | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const width = drawerWidth(frameWidth);

  useEffect(() => {
    if (!frameEl || typeof ResizeObserver === "undefined") return;
    // Observing reports the first size too.
    const observer = new ResizeObserver(() => setFrameWidth(frameEl.clientWidth));
    observer.observe(frameEl);
    return () => observer.disconnect();
  }, [frameEl]);

  const settle = useCallback(
    (target: 0 | 1) => {
      settleRef.current?.stop();
      settleRef.current = animate(progress, target, reducedMotion ? DRAWER_INSTANT : DRAWER_SETTLE);
    },
    [progress, reducedMotion],
  );

  // Every change of `open` settles the drawer there; a drag that ends where it began settles itself.
  useEffect(() => {
    settle(open ? 1 : 0);
  }, [open, settle]);

  // An open drawer takes focus however it opened (menu button or swipe), so Escape and screen
  // readers land in it. A frame later: motion writes the sidebar's `visibility` after the commit.
  useEffect(() => {
    if (!open || !sidebarEl) return;
    const frame = window.requestAnimationFrame(() => {
      if (!sidebarEl.contains(document.activeElement)) sidebarEl.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, sidebarEl]);

  // A closing drawer hands focus back to the menu button (or drops it) rather than strand it inside
  // — or on the scrim, which Chrome focuses on the tap that closes it and then hides.
  useEffect(() => {
    if (open || !sidebarEl) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!sidebarEl.contains(active) && !scrimEl?.contains(active)) return;
    if (menuRef.current) menuRef.current.focus({ preventScroll: true });
    else active.blur();
  }, [open, sidebarEl, scrimEl]);

  // Any navigation closes the drawer: a row, a notification, Settings in the switcher.
  const [seenUrl, setSeenUrl] = useState(pageUrl);
  if (seenUrl !== pageUrl) {
    setSeenUrl(pageUrl);
    if (open) setOpen(false);
  }

  const close = useCallback(() => setOpen(false), []);

  const openDrawer = () => {
    void hapticLight();
    setOpen(true);
  };

  const onSidebarClick = (event: MouseEvent<HTMLDivElement>) => {
    // Rows are links; the current page's own row changes no URL but still closes the drawer.
    const target = event.target;
    if (target instanceof Element && event.currentTarget.contains(target) && target.closest("a[href]")) close();
  };

  const onSidebarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Escape inside a popup the sidebar opened (portaled elsewhere) belongs to that popup.
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    event.preventDefault();
    close();
  };

  // ── Android back ───────────────────────────────────────────────────────────
  useShellBackHandler(() => {
    close();
    return true;
  }, open);
  useMerchivaBackHandler();

  // ── Swipes ─────────────────────────────────────────────────────────────────
  usePageSwipe(frameEl, {
    enabled: openDialogs === 0 && !chromeRequest.immersive && !keyboard.open && !merchivaOverlay,
    dir,
    safariEdges: platform.iosBrowserTab,
    drawerOpen: open,
    merchivaAvailable: merchivaAllowed && !dockOpen && !slotted,
    content: contentEl,
    sidebar: sidebarEl,
    scrim: scrimEl,
    progress,
    drawerWidth: width,
    onDrawerGrab: () => settleRef.current?.stop(),
    onDrawerRelease: (next) => {
      if (next === open) settle(next ? 1 : 0);
      else setOpen(next);
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  const contentX = useTransform(progress, (p) => contentOffset(p, width, dir));
  const contentCorners = useTransform(progress, (p) => contentRadius(p, dir));
  const contentLift = useTransform(progress, (p) => contentShadow(p, dir));
  const sidebarGrow = useTransform(progress, sidebarScale);
  const revealed = useTransform(progress, (p) => (p > 0 ? "visible" : "hidden"));
  // An open sidebar is visible before its settle moves `progress`, so it can take focus at once.
  const sidebarVisibility = open ? "visible" : revealed;
  // The editors draw their own Back in this corner; immersive pages own the whole screen.
  const showMenu = !chromeRequest.immersive && !pageOwnsCorner(pathname);

  return (
    <div
      ref={setFrameEl}
      data-shell-frame="mobile"
      className="relative flex h-[100dvh] min-h-0 w-full flex-1 overflow-hidden bg-background"
    >
      <motion.div
        ref={setSidebarEl}
        tabIndex={-1}
        inert={!open || undefined}
        onClick={onSidebarClick}
        onKeyDown={onSidebarKeyDown}
        className="absolute inset-y-0 start-0 z-0 flex outline-none"
        style={{ bottom, width, opacity: progress, scale: sidebarGrow, originX: dir === "rtl" ? 1 : 0, visibility: sidebarVisibility }}
      >
        <SidebarDrawer open={open} onClose={close} />
      </motion.div>

      <motion.div
        className="absolute inset-0 z-10 overflow-hidden"
        style={{ bottom, x: contentX, borderRadius: contentCorners, boxShadow: contentLift }}
      >
        <div
          id="mobile-content"
          ref={setContentNode}
          inert={open || undefined}
          className="absolute inset-0 flex flex-col overflow-hidden bg-background"
          style={{ "--shell-scroll-pad": "0px" } as CSSProperties}
        >
          <TabPageOutlet>{children}</TabPageOutlet>
          {showMenu ? <MenuButton ref={menuRef} expanded={open} unread={unread} onOpen={openDrawer} /> : null}
        </div>

        <motion.button
          ref={setScrimEl}
          type="button"
          tabIndex={-1}
          aria-label={t("components.mobile.closeMenu")}
          onClick={close}
          className="absolute inset-0 z-50 bg-black/20"
          style={{ opacity: progress, visibility: revealed, pointerEvents: open ? "auto" : "none" }}
        />
      </motion.div>

      <div
        ref={setProbeEl}
        aria-hidden
        className="pointer-events-none invisible fixed bottom-0 left-0 w-px"
        style={{ height: "env(safe-area-inset-bottom, 0px)" }}
      />
    </div>
  );
}
