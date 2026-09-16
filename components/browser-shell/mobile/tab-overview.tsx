"use client";

import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { ChevronDown, Plus } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from "motion/react";
import { Button } from "@/components/ui/button";
import { useTab, useTabPresentation, type BrowserTab, type TabId } from "@/lib/browser-shell";
import {
  GHOST_FADE,
  GRID_FADE,
  INSTANT,
  NAV_SETTLE_TIMEOUT_MS,
  OVERVIEW_FADE,
  ZOOM,
  bottomPad,
} from "@/lib/browser-shell/mobile/geometry";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { PageGhost } from "./page-ghost";
import { CURRENT_PAGE_CARD_KEY, TabCard } from "./tab-card";

export interface OverviewPageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TabOverviewHandle {
  /** Zooms into `targetTabId` (default: the active tab) and closes. `null` fades out without a zoom. */
  close(targetTabId?: TabId | null): void;
}

export interface TabOverviewProps {
  ref?: Ref<TabOverviewHandle>;
  tabs: readonly BrowserTab[];
  /** Tab store ready; otherwise a single card stands for the current page. */
  ready: boolean;
  activeTabId: TabId | null;
  /** Rect of `#mobile-content` when the overview opened: the zoom's full-screen end. */
  pageRect: OverviewPageRect;
  bottomInset: number;
  dir: "ltr" | "rtl";
  reducedMotion: boolean;
  onActivateTab(tabId: TabId): void;
  /** Opens a New Tab page. Returns its id, `null` when it navigated without a tab id, `false` when it could not open. */
  onNewTab(): TabId | null | false;
  onCloseTab(tabId: TabId): void;
  onTabsMenu(): void;
  onCardMenu(tabId: TabId): void;
  onClosed(): void;
}

type Phase = "opening" | "open" | "closing";

interface ProxyTarget {
  readonly tabId: TabId | null;
}

/** `rounded-lg` at the design system's 0.15rem radius. */
const CARD_RADIUS_PX = 2.4;
/** The focus card's row sits this far below the top of the grid when the overview opens. */
const OPEN_SCROLL_OFFSET = 80;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findCard(grid: HTMLElement | null, key: string | null): HTMLElement | null {
  if (!grid || !key) return null;
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(key) : key.replace(/"/g, '\\"');
  return grid.querySelector<HTMLElement>(`[data-tab-card="${escaped}"]`);
}

/**
 * Tab overview grid (mobile-safari spec §11). Opening zooms a placeholder of the active page into
 * its card; opening a card zooms back out while the page already loads underneath. The live
 * `#mobile-content` stays mounted (inert) the whole time.
 */
export function TabOverview({
  ref,
  tabs,
  ready,
  activeTabId,
  pageRect,
  bottomInset,
  dir,
  reducedMotion,
  onActivateTab,
  onNewTab,
  onCloseTab,
  onTabsMenu,
  onCardMenu,
  onClosed,
}: TabOverviewProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const settledRef = useRef(false);

  const focusKey = ready ? activeTabId : CURRENT_PAGE_CARD_KEY;
  const [phase, setPhase] = useState<Phase>("opening");
  const [proxy, setProxy] = useState<ProxyTarget | null>(() => ({ tabId: activeTabId }));
  const [concealedKey, setConcealedKey] = useState<string | null>(focusKey);
  const [closingTarget, setClosingTarget] = useState<TabId | null>(null);

  const containerOpacity = useMotionValue(reducedMotion ? 1 : 0);
  const gridOpacity = useMotionValue(1);
  const proxyX = useMotionValue(pageRect.left);
  const proxyY = useMotionValue(pageRect.top);
  const proxyScale = useMotionValue(1);
  const proxyHeight = useMotionValue(pageRect.height);
  const proxyRadius = useMotionValue(0);
  const proxyOpacity = useMotionValue(1);

  const aspect = clamp(pageRect.width / Math.max(1, pageRect.height), 0.5, 0.75);
  const count = ready ? tabs.length : 1;

  useEffect(() => {
    settledRef.current = !ready || closingTarget === null || activeTabId === closingTarget;
  }, [ready, closingTarget, activeTabId]);

  // ── Opening: full-screen placeholder → focus card ──────────────────────────
  const runOpen = useEffectEvent(() => {
    containerRef.current?.focus({ preventScroll: true });
    const grid = gridRef.current;
    const card = findCard(grid, focusKey);
    if (grid && card) grid.scrollTop = Math.max(0, card.offsetTop - OPEN_SCROLL_OFFSET);
    const rect = card?.getBoundingClientRect() ?? null;

    let cancelled = false;
    let frame = 0;
    const running = [animate(containerOpacity, 1, reducedMotion ? INSTANT : OVERVIEW_FADE)];
    const done = () => {
      if (cancelled) return;
      setProxy(null);
      setConcealedKey(null);
      setPhase("open");
      card?.querySelector<HTMLButtonElement>("[data-tab-card-open]")?.focus({ preventScroll: true });
    };

    if (!rect || rect.width <= 0 || reducedMotion) {
      frame = window.requestAnimationFrame(done);
    } else {
      const scale = rect.width / pageRect.width;
      running.push(
        animate(proxyX, rect.left, ZOOM),
        animate(proxyY, rect.top, ZOOM),
        animate(proxyScale, scale, ZOOM),
        animate(proxyHeight, rect.height / scale, ZOOM),
        animate(proxyRadius, CARD_RADIUS_PX / scale, ZOOM),
      );
      Promise.all(running).then(done, done);
    }
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      for (const animation of running) animation.stop();
    };
  });

  useLayoutEffect(() => runOpen(), []);

  // ── Closing: card (or nothing) → full screen, then fade out ────────────────
  const runClose = useEffectEvent(() => {
    let cancelled = false;
    const zoom = reducedMotion ? INSTANT : ZOOM;
    const running = [animate(gridOpacity, 0, reducedMotion ? INSTANT : GRID_FADE)];
    if (proxy) {
      running.push(
        animate(proxyX, pageRect.left, zoom),
        animate(proxyY, pageRect.top, zoom),
        animate(proxyScale, 1, zoom),
        animate(proxyHeight, pageRect.height, zoom),
        animate(proxyRadius, 0, zoom),
        animate(proxyOpacity, 1, zoom),
      );
    }
    const startedAt = performance.now();
    const waitForPage = () =>
      new Promise<void>((resolve) => {
        const tick = () => {
          if (cancelled || settledRef.current || performance.now() - startedAt >= NAV_SETTLE_TIMEOUT_MS) resolve();
          else window.requestAnimationFrame(tick);
        };
        tick();
      });
    const finish = () => {
      if (!cancelled) onClosed();
    };

    Promise.all(running)
      .then(waitForPage)
      .then(() => {
        if (cancelled) return;
        const fade = animate(containerOpacity, 0, reducedMotion ? INSTANT : GHOST_FADE);
        running.push(fade);
        return fade;
      })
      .then(finish, finish);

    return () => {
      cancelled = true;
      for (const animation of running) animation.stop();
    };
  });

  useEffect(() => {
    if (phase !== "closing") return;
    return runClose();
  }, [phase]);

  const requestClose = (targetTabId: TabId | null) => {
    if (closingRef.current) return;
    closingRef.current = true;
    const key = ready ? targetTabId : CURRENT_PAGE_CARD_KEY;
    const card = findCard(gridRef.current, key);
    const rect = card?.getBoundingClientRect() ?? null;
    const showProxy = !ready || targetTabId !== null;

    if (rect && rect.width > 0) {
      const scale = rect.width / pageRect.width;
      proxyX.jump(rect.left);
      proxyY.jump(rect.top);
      proxyScale.jump(scale);
      proxyHeight.jump(rect.height / scale);
      proxyRadius.jump(CARD_RADIUS_PX / scale);
      proxyOpacity.jump(1);
      setConcealedKey(key);
    } else {
      // No card to zoom from (a tab that was just opened): the placeholder fades in full screen.
      proxyX.jump(pageRect.left);
      proxyY.jump(pageRect.top);
      proxyScale.jump(1);
      proxyHeight.jump(pageRect.height);
      proxyRadius.jump(0);
      proxyOpacity.jump(0);
    }
    setProxy(showProxy ? { tabId: targetTabId } : null);
    setClosingTarget(targetTabId);
    setPhase("closing");
  };

  useImperativeHandle(ref, () => ({
    close(targetTabId?: TabId | null) {
      requestClose(targetTabId === undefined ? activeTabId : targetTabId);
    },
  }));

  const openCard = (tabId: TabId | null) => {
    if (closingRef.current) return;
    void hapticLight();
    if (tabId && tabId !== activeTabId) onActivateTab(tabId);
    requestClose(tabId);
  };

  const handleNewTab = () => {
    if (closingRef.current) return;
    const tabId = onNewTab();
    if (tabId === false) return;
    requestClose(tabId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    requestClose(activeTabId);
  };

  const interactive = phase === "open";

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("browserMobile.tabOverview")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[80] flex flex-col bg-muted outline-none"
      style={{ opacity: containerOpacity }}
    >
      <motion.div
        ref={gridRef}
        className="relative grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto overscroll-contain px-3 min-[600px]:grid-cols-3"
        style={{
          opacity: gridOpacity,
          pointerEvents: interactive ? "auto" : "none",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: `calc(48px + max(env(safe-area-inset-bottom, 0px), ${bottomPad(bottomInset)}px) + 12px)`,
        }}
      >
        <AnimatePresence initial={false}>
          {ready ? (
            tabs.map((tab) => (
              <TabCard
                key={tab.id}
                tab={tab}
                cardKey={tab.id}
                active={tab.id === activeTabId}
                concealed={concealedKey === tab.id}
                aspect={aspect}
                dir={dir}
                reducedMotion={reducedMotion}
                closable
                onOpen={() => openCard(tab.id)}
                onClose={() => onCloseTab(tab.id)}
                onLongPress={() => onCardMenu(tab.id)}
              />
            ))
          ) : (
            <TabCard
              key={CURRENT_PAGE_CARD_KEY}
              tab={null}
              cardKey={CURRENT_PAGE_CARD_KEY}
              active
              concealed={concealedKey === CURRENT_PAGE_CARD_KEY}
              aspect={aspect}
              dir={dir}
              reducedMotion={reducedMotion}
              closable={false}
              onOpen={() => openCard(null)}
              onClose={() => undefined}
              onLongPress={() => undefined}
            />
          )}
        </AnimatePresence>
      </motion.div>

      <div
        className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur-md"
        style={{ paddingBottom: `max(env(safe-area-inset-bottom, 0px), ${bottomPad(bottomInset)}px)` }}
      >
        <div className="mx-auto grid h-[48px] max-w-[640px] grid-cols-3 items-center px-2">
          <Button
            variant="ghost"
            size="icon"
            className="justify-self-start"
            aria-label={t("browser.actions.newTab")}
            disabled={!interactive}
            onClick={handleNewTab}
          >
            <Plus className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={onTabsMenu}
            disabled={!interactive || !ready}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-1 justify-self-center rounded-lg px-2 text-[13px] font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {fmt(t("browserMobile.tabsCount"), { n: count })}
            <ChevronDown aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => requestClose(activeTabId)}
            disabled={phase === "closing"}
            className="justify-self-end rounded-lg px-3 text-[15px] font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("browserMobile.done")}
          </button>
        </div>
      </div>

      {proxy && (
        <ZoomProxy
          tabId={proxy.tabId}
          width={pageRect.width}
          pageHeight={pageRect.height}
          x={proxyX}
          y={proxyY}
          scale={proxyScale}
          height={proxyHeight}
          radius={proxyRadius}
          opacity={proxyOpacity}
        />
      )}
    </motion.div>
  );
}

function ZoomProxy({
  tabId,
  width,
  pageHeight,
  x,
  y,
  scale,
  height,
  radius,
  opacity,
}: {
  tabId: TabId | null;
  width: number;
  pageHeight: number;
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  height: MotionValue<number>;
  radius: MotionValue<number>;
  opacity: MotionValue<number>;
}) {
  const tab = useTab(tabId);
  const presentation = useTabPresentation(tab);
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-20 overflow-hidden border border-border bg-background"
      style={{ x, y, scale, height, width, borderRadius: radius, opacity, originX: 0, originY: 0 }}
    >
      <div style={{ width, height: pageHeight }}>
        <PageGhost
          title={presentation.title}
          icon={presentation.icon}
          kind={presentation.isNewTab ? "blank" : presentation.route?.previewKind ?? "list"}
          isNew={presentation.isNewTab}
        />
      </div>
    </motion.div>
  );
}
