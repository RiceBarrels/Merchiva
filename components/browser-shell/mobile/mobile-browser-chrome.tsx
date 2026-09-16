"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { toast } from "sonner";
import { TabPageOutlet } from "@/components/browser-shell/core/tab-page-outlet";
import type { AppIcon } from "@/components/device/app-icons";
import { useUnreadCount } from "@/components/notification-center";
import { skipNextPageTransition } from "@/components/page-tabs";
import { useOpenDynamicUIElementCount } from "@/components/ui/dynamic-ui-element";
import {
  MAX_TABS,
  NEW_TAB_URL,
  closeTopDialog,
  useActiveNavState,
  useActiveTab,
  useShellBackHandler,
  useShellChromeState,
  useShellCommand,
  useShellInfo,
  useTabActions,
  useTabContentHost,
  useTabHistory,
  useTabMountKey,
  useTabPresentation,
  useTabsSnapshot,
  useVirtualKeyboard,
  type PreviewKind,
  type TabId,
  type TabPresentation,
  type TabUrl,
} from "@/lib/browser-shell";
import {
  COLLAPSE_SURFACE_DY,
  GESTURE,
  GHOST_FADE,
  GHOST_FADE_MS,
  INSTANT,
  NAV_SETTLE_TIMEOUT_MS,
  SCROLL,
  chromeZIndex,
  contentFootprint,
  expandedFootprint,
  untransformedRect,
} from "@/lib/browser-shell/mobile/geometry";
import { pathOfUrl } from "@/lib/browser-shell/mobile/labels";
import { useMobilePlatform } from "@/lib/browser-shell/mobile/platform";
import { buildShareUrl, tryNativeShare } from "@/lib/browser-shell/mobile/share";
import { useBottomSafeInset } from "@/lib/browser-shell/mobile/use-bottom-inset";
import { useChromeState } from "@/lib/browser-shell/mobile/use-chrome-state";
import { useForeignOverlayOpen } from "@/lib/browser-shell/mobile/use-foreign-overlay";
import { usePillSwipe, type PillCommit } from "@/lib/browser-shell/mobile/use-pill-swipe";
import { useReserveBottom } from "@/lib/browser-shell/mobile/use-reserve-bottom";
import { useScrollMinimize } from "@/lib/browser-shell/mobile/use-scroll-minimize";
import { NewTabIcon } from "@/lib/browser-shell/routes";
import { usePermissions } from "@/lib/context/permissions";
import { hapticLight, hapticMedium, hapticWarning } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n/context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { BookmarksSheet } from "./bookmarks-sheet";
import { BottomChrome } from "./bottom-chrome";
import { EdgeBackGesture } from "./edge-back-gesture";
import { PageGhost } from "./page-ghost";
import { PageMenuSheet } from "./page-menu-sheet";
import { SearchSheet, type SearchSheetHandle } from "./search-sheet";
import { ShareDrawer } from "./share-drawer";
import { HistoryDrawer, TabActionsDrawer, TabsMenuDrawer } from "./tab-actions-drawer";
import { TabOverview, type OverviewPageRect, type TabOverviewHandle } from "./tab-overview";

/**
 * DynamicUIElement renders full-screen page sheets (with `[data-dialog-back]`) only below 640px;
 * wider it uses modals and side panels, which the chrome must not be raised over.
 */
const DIALOG_PAGE_BREAKPOINT = 640;
/** Two animation frames before a settled ghost starts fading (spec §10 step 4). */
const GHOST_SETTLE_DELAY_MS = 34;

type SheetKind = "pageMenu" | "bookmarks" | "share" | "tabsMenu" | "history" | "tabActions";

interface GhostState {
  readonly id: number;
  readonly title: string;
  readonly icon: AppIcon;
  readonly kind: PreviewKind;
  readonly isNew: boolean;
  readonly targetTabId: TabId | null;
  readonly targetPath: string;
  readonly startedAt: number;
  readonly fading: boolean;
}

interface OverviewSession {
  readonly id: number;
  readonly pageRect: OverviewPageRect;
}

function previewKindOf(presentation: TabPresentation): PreviewKind {
  return presentation.isNewTab ? "blank" : presentation.route?.previewKind ?? "list";
}

/**
 * iOS Safari-style browser chrome for viewports under 1024px (plan D2, D27; mobile-safari spec).
 * A view over the core tab store: it never writes history or `document.title` and installs no
 * global key or history listeners. It renders exactly one `#mobile-content` holding the page
 * outlet, a fixed bottom chrome that minimizes on scroll, and the overview / search / sheets.
 */
export function MobileBrowserChrome({ children }: { children: ReactNode }) {
  const { t, dir } = useI18n();
  const reducedMotion = useReducedMotion() ?? false;
  const pathname = pathOfUrl(usePathname() ?? "/");
  const snapshot = useTabsSnapshot();
  const activeTab = useActiveTab();
  const presentation = useTabPresentation(activeTab);
  const activeHistory = useTabHistory(activeTab?.id ?? null);
  const nav = useActiveNavState();
  const actions = useTabActions();
  const mountKey = useTabMountKey();
  const chromeRequest = useShellChromeState();
  const shellInfo = useShellInfo();
  const keyboard = useVirtualKeyboard();
  const platform = useMobilePlatform();
  const { currentOrg } = usePermissions();
  const unreadCount = useUnreadCount();
  const openDialogs = useOpenDynamicUIElementCount();
  const dialogPageViewport = useIsMobile(DIALOG_PAGE_BREAKPOINT);
  const dialogPages = dialogPageViewport ? openDialogs : 0;
  const foreignOverlayOpen = useForeignOverlayOpen(dialogPages > 0);

  // ── Elements ───────────────────────────────────────────────────────────────
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [chromeEl, setChromeEl] = useState<HTMLElement | null>(null);
  const [pillEl, setPillEl] = useState<HTMLDivElement | null>(null);
  const [probeEl, setProbeEl] = useState<HTMLDivElement | null>(null);
  const setContentNode = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    setContentEl(node);
  }, []);
  useTabContentHost(contentRef);

  const searchRef = useRef<SearchSheetHandle>(null);
  const overviewRef = useRef<TabOverviewHandle>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const suppressUntil = useRef(0);
  const sequence = useRef(0);

  // ── State ──────────────────────────────────────────────────────────────────
  const [openSheet, setOpenSheet] = useState<SheetKind | null>(null);
  const [tabsMenuVariant, setTabsMenuVariant] = useState<"toolbar" | "overview">("toolbar");
  const [historyDirection, setHistoryDirection] = useState<"back" | "forward">("back");
  const [tabActionsId, setTabActionsId] = useState<TabId | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [overview, setOverview] = useState<OverviewSession | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [edgeActive, setEdgeActive] = useState(false);
  const [innerScrollerPath, setInnerScrollerPath] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const ready = snapshot.status === "ready";
  const tabs = snapshot.tabs;
  const activeIndex = activeTab ? tabs.findIndex((tab) => tab.id === activeTab.id) : -1;
  const prevTab = activeIndex > 0 ? tabs[activeIndex - 1] : null;
  const nextTab = activeIndex >= 0 && activeIndex < tabs.length - 1 ? tabs[activeIndex + 1] : null;
  const prevPresentation = useTabPresentation(prevTab);
  const nextPresentation = useTabPresentation(nextTab);
  const tabCount = ready ? Math.max(1, tabs.length) : 1;
  const trackX = useMotionValue(0);

  // ── Chrome state and content reserve (spec §7, §9) ─────────────────────────
  const docked = chromeRequest.mobileChrome === "docked" || innerScrollerPath === pathname;
  const immersive = chromeRequest.immersive;
  const overviewOpen = overview !== null;
  const sheetOpen = openSheet !== null;

  const chrome = useChromeState({
    keyboardOpen: keyboard.open,
    editableFocusedInPage: keyboard.editableFocused && (shellInfo?.coarse ?? false),
    immersive,
    overviewOpen,
    searchOpen,
    openDialogs: dialogPages,
    foreignOverlayOpen,
    docked,
    autoMinimize: chromeRequest.mobileChrome === "overlay",
    reducedMotion,
    navKey: `${snapshot.activeTabId ?? ""}|${pathname}|${mountKey}`,
  });
  const { dispatch } = chrome;

  const bottomInset = useBottomSafeInset(probeEl);
  const footprint = contentFootprint({
    immersive,
    docked,
    keyboardOpen: keyboard.open,
    keyboardInset: keyboard.inset,
    bottomInset,
  });
  const scrollPad = docked || immersive ? 0 : COLLAPSE_SURFACE_DY;
  const reserveBottom = useReserveBottom(frameEl, footprint);
  const dialogBottom = dialogPages > 0 && !chrome.hidden ? expandedFootprint(bottomInset) : 0;

  // Raised over a dialog page, the expanded chrome covers its bottom; the page scroller pads for it.
  useEffect(() => {
    document.documentElement.style.setProperty("--shell-dialog-bottom", `${dialogBottom}px`);
  }, [dialogBottom]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--shell-dialog-bottom");
    },
    [],
  );

  // Programmatic scroll (restore, remount) right after navigation must not minimize the chrome.
  useEffect(() => {
    suppressUntil.current = performance.now() + SCROLL.suppressMs;
  }, [pathname, snapshot.activeTabId, mountKey]);

  useScrollMinimize(contentEl, {
    enabled:
      !docked &&
      !immersive &&
      chromeRequest.mobileChrome === "overlay" &&
      openDialogs === 0 &&
      !chrome.hidden &&
      dragWidth === null &&
      !edgeActive,
    suppressUntil,
    onDown: () => dispatch({ type: "SCROLL_DOWN" }),
    onUp: () => dispatch({ type: "SCROLL_UP" }),
    onEdge: () => dispatch({ type: "SCROLL_EDGE" }),
    onInnerScrollerDetected: () => setInnerScrollerPath(pathname),
  });

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (openDialogs > 0 && closeTopDialog()) return;
    actions.goBack({ closeToOpener: true });
  }, [openDialogs, actions]);

  const handleForward = () => actions.goForward();

  const handleReload = () => {
    setReloadTick((tick) => tick + 1);
    actions.reload();
  };

  const handleSearch = () => {
    searchRef.current?.openSync(presentation.isNewTab ? "" : presentation.url);
  };

  const handleShare = () => {
    const url = buildShareUrl(presentation.url);
    // No await before the share call: Web Share needs the tap's transient activation.
    void tryNativeShare({ url, title: presentation.title }).then((result) => {
      if (result === "unsupported") setOpenSheet("share");
    });
  };

  const navigateActive = useCallback((url: TabUrl) => actions.navigateActive(url), [actions]);
  const openInNewTab = useCallback((url: TabUrl) => actions.openUrl(url, "new-foreground"), [actions]);

  const handleSheetOpenChange = useCallback((open: boolean) => {
    if (!open) setOpenSheet(null);
  }, []);

  const openHistory = (direction: "back" | "forward") => {
    const entries = direction === "back" ? activeHistory.back : activeHistory.forward;
    if (!activeTab || entries.length === 0 || openDialogs > 0) return;
    void hapticMedium();
    setHistoryDirection(direction);
    setOpenSheet("history");
  };

  const openTabsMenu = (variant: "toolbar" | "overview") => {
    if (!ready) return;
    void hapticMedium();
    setTabsMenuVariant(variant);
    setOpenSheet("tabsMenu");
  };

  // ── Tab overview ───────────────────────────────────────────────────────────
  const openOverview = () => {
    if (overview) return;
    // Layout geometry, not getBoundingClientRect: an open dialog page pushes #mobile-content with
    // translate + scale, and the zoom must start from and return to the page's resting box.
    const frameRect = frameEl?.getBoundingClientRect() ?? null;
    const rect =
      frameEl && frameRect && contentEl
        ? untransformedRect({ left: frameRect.left + frameEl.clientLeft, top: frameRect.top + frameEl.clientTop }, contentEl)
        : null;
    const pageRect: OverviewPageRect =
      rect ?? { left: 0, top: 0, width: window.innerWidth, height: Math.max(1, window.innerHeight - reserveBottom) };
    const focused = document.activeElement;
    restoreFocusRef.current = focused instanceof HTMLElement ? focused : null;
    searchRef.current?.close();
    setOpenSheet(null);
    void hapticLight();
    sequence.current += 1;
    setOverview({ id: sequence.current, pageRect });
  };

  const handleOverviewClosed = () => {
    setOverview(null);
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    // The chrome is inert until the render that unmounts the overview commits.
    window.requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  };

  const handleOverviewActivate = (tabId: TabId) => {
    skipNextPageTransition();
    actions.activateTab(tabId);
  };

  const handleOverviewNewTab = (): TabId | null | false => {
    skipNextPageTransition();
    const result = actions.openNewTabPage();
    if (result.ok) return result.tabId;
    if (result.reason === "limit") {
      toast(t("browser.tabLimit"));
      return false;
    }
    return null;
  };

  const handleOverviewCloseTab = (tabId: TabId) => {
    actions.closeTab(tabId, { source: "pointer" });
  };

  const handleCardMenu = (tabId: TabId) => {
    void hapticMedium();
    setTabActionsId(tabId);
    setOpenSheet("tabActions");
  };

  // ── Tabs menu actions ──────────────────────────────────────────────────────
  const handleMenuNewTab = () => {
    skipNextPageTransition();
    const result = actions.openNewTabPage();
    if (!result.ok && result.reason === "limit") {
      toast(t("browser.tabLimit"));
      return;
    }
    overviewRef.current?.close(result.ok ? result.tabId : null);
  };

  const handleMenuCloseActive = () => {
    if (activeTab) actions.closeTab(activeTab.id, { source: "menu" });
  };

  const handleMenuCloseAll = () => {
    void hapticWarning();
    actions.closeAllTabs();
    overviewRef.current?.close(null);
  };

  const handleMenuReopen = () => {
    const result = actions.reopenClosedTab();
    if (!result) return;
    if (!result.ok) {
      if (result.reason === "limit") toast(t("browser.tabLimit"));
      return;
    }
    overviewRef.current?.close(result.tabId);
  };

  // ── Pill swipe between tabs (spec §10) ─────────────────────────────────────
  const handleDragActive = (active: boolean) => {
    if (active) {
      suppressUntil.current = Number.POSITIVE_INFINITY;
      setDragWidth(contentEl?.clientWidth ?? window.innerWidth);
    } else {
      suppressUntil.current = performance.now() + SCROLL.suppressMs;
      setDragWidth(null);
    }
  };

  const handlePillCommit = (direction: PillCommit) => {
    const target = direction === "prev" ? prevTab : direction === "next" ? nextTab : null;
    const targetPresentation = direction === "prev" ? prevPresentation : direction === "next" ? nextPresentation : null;
    sequence.current += 1;
    setGhost({
      id: sequence.current,
      title: targetPresentation?.title ?? t("browser.newTab"),
      icon: targetPresentation?.icon ?? NewTabIcon,
      kind: targetPresentation ? previewKindOf(targetPresentation) : "blank",
      isNew: target === null,
      targetTabId: target?.id ?? null,
      targetPath: target && targetPresentation ? pathOfUrl(targetPresentation.url) : NEW_TAB_URL,
      startedAt: performance.now(),
      fading: false,
    });
    skipNextPageTransition();
    if (target) {
      actions.activateTab(target.id);
    } else {
      const result = actions.openNewTabPage();
      if (!result.ok && result.reason === "limit") toast(t("browser.tabLimit"));
    }
    trackX.jump(0);
  };

  usePillSwipe(chromeEl, {
    enabled:
      ready &&
      openDialogs === 0 &&
      !sheetOpen &&
      !searchOpen &&
      !overviewOpen &&
      !chrome.hidden &&
      chrome.mode === "expanded" &&
      ghost === null,
    swipeUpEnabled: !chrome.hidden && !sheetOpen && !searchOpen && !overviewOpen && openDialogs === 0,
    hasPrev: prevTab !== null,
    hasNext: nextTab !== null,
    allowNew: ready && tabs.length < MAX_TABS,
    dir,
    x: trackX,
    reducedMotion,
    width: () => contentEl?.clientWidth ?? window.innerWidth,
    pill: pillEl,
    onActiveChange: handleDragActive,
    onCommit: handlePillCommit,
    onSwipeUp: openOverview,
  });

  // The ghost covers the page until the target route renders (or 700ms), then fades out.
  useEffect(() => {
    if (!ghost || ghost.fading) return;
    const settled =
      pathname === ghost.targetPath && (ghost.targetTabId === null || snapshot.activeTabId === ghost.targetTabId);
    const delay = settled
      ? GHOST_SETTLE_DELAY_MS
      : Math.max(0, NAV_SETTLE_TIMEOUT_MS - (performance.now() - ghost.startedAt));
    const id = ghost.id;
    const timer = window.setTimeout(() => {
      setGhost((current) => (current && current.id === id ? { ...current, fading: true } : current));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [ghost, pathname, snapshot.activeTabId]);

  useEffect(() => {
    if (!ghost?.fading) return;
    const id = ghost.id;
    const timer = window.setTimeout(
      () => setGhost((current) => (current && current.id === id ? null : current)),
      reducedMotion ? 0 : GHOST_FADE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ghost, reducedMotion]);

  // ── Edge back (spec §18) ───────────────────────────────────────────────────
  const handleEdgeActive = (active: boolean) => {
    suppressUntil.current = active ? Number.POSITIVE_INFINITY : performance.now() + SCROLL.suppressMs;
    setEdgeActive(active);
  };
  const edgeEnabled =
    nav.canGoBack &&
    !nav.dialogOpen &&
    !immersive &&
    !sheetOpen &&
    !searchOpen &&
    !overviewOpen &&
    !keyboard.open &&
    !chrome.hidden &&
    !platform.iosBrowserTab &&
    dragWidth === null &&
    ghost === null;

  // ── Back handlers (Android hardware back) and shell commands ───────────────
  useShellBackHandler(() => {
    overviewRef.current?.close();
    return true;
  }, overviewOpen);
  useShellBackHandler(() => {
    searchRef.current?.close();
    return true;
  }, searchOpen);
  useShellBackHandler(() => {
    setOpenSheet(null);
    return true;
  }, sheetOpen);

  useShellCommand("showTabOverview", () => {
    if (overview) overviewRef.current?.close();
    else openOverview();
  });
  useShellCommand("focusOmnibox", handleSearch);

  // ── Render ─────────────────────────────────────────────────────────────────
  const contentInert = overviewOpen || searchOpen;
  const nextOffset = (dir === "rtl" ? -1 : 1) * ((dragWidth ?? 0) + GESTURE.ghostGap);

  return (
    <div
      ref={setFrameEl}
      data-shell-frame="mobile"
      className="relative flex h-[100dvh] min-h-0 w-full flex-1 overflow-hidden bg-background"
    >
      <div
        id="mobile-content"
        ref={setContentNode}
        inert={contentInert || undefined}
        className="absolute inset-x-0 top-0 z-20 flex flex-col overflow-hidden bg-background"
        style={{ bottom: reserveBottom, "--shell-scroll-pad": `${scrollPad}px` } as CSSProperties}
      >
        <motion.div className="relative flex min-h-0 flex-1 flex-col" style={{ x: trackX }}>
          <TabPageOutlet>{children}</TabPageOutlet>
        </motion.div>

        {dragWidth !== null && (
          <>
            {prevTab && <NeighbourGhost x={trackX} offset={-nextOffset} presentation={prevPresentation} />}
            {nextTab ? (
              <NeighbourGhost x={trackX} offset={nextOffset} presentation={nextPresentation} />
            ) : (
              ready && <NeighbourGhost x={trackX} offset={nextOffset} presentation={null} />
            )}
          </>
        )}

        {ghost && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10"
            initial={false}
            animate={{ opacity: ghost.fading ? 0 : 1 }}
            transition={reducedMotion ? INSTANT : GHOST_FADE}
          >
            <PageGhost title={ghost.title} icon={ghost.icon} kind={ghost.kind} isNew={ghost.isNew} />
          </motion.div>
        )}
      </div>

      <BottomChrome
        collapse={chrome.collapse}
        hide={chrome.hide}
        hidden={chrome.hidden}
        zIndex={chromeZIndex(dialogPages)}
        bottomInset={bottomInset}
        title={presentation.title}
        icon={presentation.icon}
        isNewTab={presentation.isNewTab}
        pending={presentation.pending}
        dialogTitle={dialogPages > 0 && nav.dialogTitle ? nav.dialogTitle : null}
        dialogSwipe={nav.dialogSwipe}
        orgName={currentOrg?.name ?? ""}
        orgLogoUrl={currentOrg?.logoUrl ?? null}
        unreadCount={unreadCount}
        tabCount={tabCount}
        canBack={nav.canGoBack}
        canForward={nav.canGoForward}
        reloadDisabled={openDialogs > 0 || presentation.isNewTab}
        reloadTick={reloadTick}
        androidNative={platform.android}
        reducedMotion={reducedMotion}
        onRootElement={setChromeEl}
        onPillElement={setPillEl}
        onPageMenu={() => setOpenSheet("pageMenu")}
        onSearch={handleSearch}
        onReload={handleReload}
        onExpand={() => dispatch({ type: "TAP_MINI" })}
        onBack={handleBack}
        onForward={handleForward}
        onShare={handleShare}
        onBookmarks={() => setOpenSheet("bookmarks")}
        onTabs={openOverview}
        onLongPressBack={() => openHistory("back")}
        onLongPressForward={() => openHistory("forward")}
        onLongPressTabs={() => openTabsMenu("toolbar")}
      />

      <EdgeBackGesture
        target={contentEl}
        enabled={edgeEnabled}
        dir={dir}
        reducedMotion={reducedMotion}
        onBack={handleBack}
        onActiveChange={handleEdgeActive}
      />

      {overview && (
        <TabOverview
          key={overview.id}
          ref={overviewRef}
          tabs={tabs}
          ready={ready}
          activeTabId={snapshot.activeTabId}
          pageRect={overview.pageRect}
          bottomInset={bottomInset}
          dir={dir}
          reducedMotion={reducedMotion}
          onActivateTab={handleOverviewActivate}
          onNewTab={handleOverviewNewTab}
          onCloseTab={handleOverviewCloseTab}
          onTabsMenu={() => openTabsMenu("overview")}
          onCardMenu={handleCardMenu}
          onClosed={handleOverviewClosed}
        />
      )}

      <SearchSheet
        ref={searchRef}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        bottomInset={bottomInset}
        reducedMotion={reducedMotion}
      />

      <PageMenuSheet
        open={openSheet === "pageMenu"}
        onOpenChange={handleSheetOpenChange}
        pageUrl={presentation.url}
        pageTitle={presentation.title}
        isNewTab={presentation.isNewTab}
        unreadCount={unreadCount}
        onNavigate={navigateActive}
      />
      <BookmarksSheet
        open={openSheet === "bookmarks"}
        onOpenChange={handleSheetOpenChange}
        onNavigate={navigateActive}
        onOpenInNewTab={openInNewTab}
      />
      <ShareDrawer
        open={openSheet === "share"}
        onOpenChange={handleSheetOpenChange}
        url={presentation.url}
        title={presentation.title}
      />
      <TabsMenuDrawer
        open={openSheet === "tabsMenu"}
        onOpenChange={handleSheetOpenChange}
        variant={tabsMenuVariant}
        tabCount={tabs.length}
        closedCount={snapshot.closed.length}
        canCloseActive={activeTab !== null}
        onNewTab={handleMenuNewTab}
        onCloseActive={handleMenuCloseActive}
        onCloseAll={handleMenuCloseAll}
        onReopenClosed={handleMenuReopen}
      />
      <TabActionsDrawer open={openSheet === "tabActions"} onOpenChange={handleSheetOpenChange} tabId={tabActionsId} />
      <HistoryDrawer
        open={openSheet === "history"}
        onOpenChange={handleSheetOpenChange}
        tabId={activeTab?.id ?? null}
        direction={historyDirection}
      />

      <div
        ref={setProbeEl}
        aria-hidden
        className="pointer-events-none invisible fixed bottom-0 left-0 w-px"
        style={{ height: "env(safe-area-inset-bottom, 0px)" }}
      />
    </div>
  );
}

function NeighbourGhost({
  x,
  offset,
  presentation,
}: {
  x: MotionValue<number>;
  offset: number;
  /** `null` = the "New tab" ghost shown when swiping past the last tab. */
  presentation: TabPresentation | null;
}) {
  const { t } = useI18n();
  const ghostX = useTransform(x, (value) => value + offset);
  return (
    <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ x: ghostX }}>
      {presentation ? (
        <PageGhost
          title={presentation.title}
          icon={presentation.icon}
          kind={previewKindOf(presentation)}
          isNew={presentation.isNewTab}
        />
      ) : (
        // Swiping past the last tab really is a new tab, so this ghost keeps the "New Tab"
        // wording; every other ghost shows its page's own title (the home page reads 主页).
        <PageGhost title={t("browser.newTab")} icon={NewTabIcon} kind="blank" isNew />
      )}
    </motion.div>
  );
}
