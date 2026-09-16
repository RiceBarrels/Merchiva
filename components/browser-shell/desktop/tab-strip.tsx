"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcutLabel, useTabActions, useTabPresentation, useTabsSnapshot } from "@/lib/browser-shell";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useNativeWindowState } from "@/lib/native-shell";
import { cn } from "@/lib/utils";
import {
  STRIP_BUTTON_CLASS,
  STRIP_CLASS,
  TABLIST_CLASS,
  TAB_ACTIVE_CLASS,
  TAB_BASE_CLASS,
  TAB_TITLE_CLASS,
} from "./chrome-classes";
import { useDesktopChrome } from "./chrome-context";
import { captionButtonsWidth } from "./chrome-geometry";
import { useAnnounce } from "./shell-live-region";
import { TabContextMenu } from "./tab-context-menu";
import { reportOpenResult } from "./tab-describe";
import { TabItem } from "./tab-item";
import { TabSearchButton } from "./tab-search-button";
import { useStableCallback } from "./use-stable-callback";
import { useTabDrag } from "./use-tab-drag";
import { tabContentMode, useTabStripLayout } from "./use-tab-strip-layout";
import { MacTrafficLightInset, WindowCaptionButtons, macLeadInset, useNativeDesktopPlatform } from "./window-controls";

/*
 * The Chrome-style tab strip (desktop spec §3.2, §5, §8):
 *   [lead inset] [tablist: pinned, unpinned] [+] [filler] [tab search] [caption buttons]
 * Widths follow use-tab-strip-layout; drag reorder follows use-tab-drag; activation is
 * immediate on pointerdown; keyboard follows the WAI-ARIA tabs "manual activation" pattern.
 * Tauri: the strip root, tablist gaps, lead inset and filler are bare drag regions (tabs and
 * buttons block dragging), so double-click there maximizes / zooms natively.
 */

type Fade = "none" | "left" | "right" | "both";

const FOCUS_ACTIVE = "__focus-active__";

export function TabStrip() {
  const { t, dir } = useI18n();
  const rtl = dir === "rtl";
  const chrome = useDesktopChrome();
  const { geometry, coarse } = chrome;
  const snapshot = useTabsSnapshot();
  const actions = useTabActions();
  const announce = useAnnounce();
  const platform = useNativeDesktopPlatform();
  const native = platform !== null;
  const { fullscreen, maximized } = useNativeWindowState();
  const newTabShortcut = useShortcutLabel("newTab");

  const { tabs } = snapshot;
  const highlightedId = snapshot.requestedTabId ?? snapshot.activeTabId;
  const pinnedCount = useMemo(() => tabs.filter((tab) => tab.pinned).length, [tabs]);
  const hasTabs = tabs.length > 0;
  const unpinnedCount = hasTabs ? tabs.length - pinnedCount : 1;

  const leadInset = macLeadInset(platform, fullscreen);
  const captionWidth = platform === "windows" || platform === "linux" ? captionButtonsWidth(geometry) : 0;

  const stripRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [fade, setFade] = useState<Fade>("none");

  const layout = useTabStripLayout(stripRef, {
    pinnedCount,
    unpinnedCount,
    leadInset,
    trailingWidth: captionWidth,
    native,
    geometry,
  });

  const onActivate = useStableCallback((id: string) => actions.activateTab(id));
  const onReorder = useStableCallback((id: string, toIndex: number) => {
    // A drag that moves the focused tab's DOM node rightward blurs it; restore after the commit.
    if (document.activeElement?.id === `browser-tab-${id}`) pendingFocusRef.current = id;
    actions.reorderTab(id, toIndex);
  });
  const drag = useTabDrag({ listRef, tabs, pinnedCount, rtl, onActivate, onReorder });

  const focusableId =
    focusedId && tabs.some((tab) => tab.id === focusedId) ? focusedId : highlightedId ?? tabs[0]?.id ?? null;

  const focusTabAt = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    const el = document.getElementById(`browser-tab-${tab.id}`);
    el?.focus();
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  };

  const onClose = useStableCallback((id: string, via: "pointer" | "keyboard") => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const tab = tabs[index];
    // Close-freeze: the next tab's close glyph slides under the pointer (not for the last tab).
    if (via === "pointer" && !tab.pinned && index < tabs.length - 1) layout.freezeAt(layout.unpinnedWidth, tabs.length);
    if (via === "keyboard") {
      const neighbour = tabs[index + 1] ?? tabs[index - 1];
      pendingFocusRef.current = tab.id === highlightedId || !neighbour ? FOCUS_ACTIVE : neighbour.id;
    }
    actions.closeTab(id, { source: via });
    announce(t("browserDesktop.tabs.closed"));
  });

  const onFocusTab = useStableCallback((id: string) => setFocusedId(id));

  const onTabKeyDown = useStableCallback((event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === "Escape" && drag.drag) {
      event.preventDefault();
      drag.cancel();
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const tab = tabs[index];
    const nextKey = rtl ? "ArrowLeft" : "ArrowRight";
    const prevKey = rtl ? "ArrowRight" : "ArrowLeft";

    const moveModifiers = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
    const isMoveKey =
      event.key === nextKey || event.key === prevKey || (native && (event.key === "PageDown" || event.key === "PageUp"));
    if (moveModifiers && isMoveKey) {
      event.preventDefault();
      const delta = event.key === nextKey || event.key === "PageDown" ? 1 : -1;
      const groupStart = tab.pinned ? 0 : pinnedCount;
      const groupEnd = tab.pinned ? pinnedCount - 1 : tabs.length - 1;
      const to = Math.min(groupEnd, Math.max(groupStart, index + delta));
      if (to === index) return;
      // React moves a keyed node with insertBefore/appendChild; when that node is the focused tab
      // (a move toward higher indexes) focus drops to <body>. Refocus it after the commit.
      pendingFocusRef.current = id;
      actions.reorderTab(id, to);
      announce(fmt(t("browserDesktop.tabs.moved"), { n: to + 1, total: tabs.length }));
      return;
    }
    if (event.altKey || event.metaKey || event.ctrlKey) return;

    switch (event.key) {
      case nextKey:
        event.preventDefault();
        focusTabAt((index + 1) % tabs.length);
        break;
      case prevKey:
        event.preventDefault();
        focusTabAt((index - 1 + tabs.length) % tabs.length);
        break;
      case "Home":
        event.preventDefault();
        focusTabAt(0);
        break;
      case "End":
        event.preventDefault();
        focusTabAt(tabs.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        actions.activateTab(id);
        break;
      case "Delete":
        event.preventDefault();
        onClose(id, "keyboard");
        break;
      default:
        break;
    }
  });

  // After a keyboard close, move focus to the tab that became focusable; after a reorder, back
  // to the moved tab. Runs before paint, and only while focus is lost (<body>) or still in the
  // strip, so a request that outlived its commit never pulls focus from elsewhere.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const id = pending === FOCUS_ACTIVE ? highlightedId : pending;
    if (!id || !tabs.some((tab) => tab.id === id)) return;
    pendingFocusRef.current = null;
    const current = document.activeElement;
    if (current && current !== document.body && !stripRef.current?.contains(current)) return;
    const el = document.getElementById(`browser-tab-${id}`);
    if (el && el !== current) el.focus();
  }, [tabs, highlightedId]);

  // Keep the highlighted tab visible in an overflowing strip.
  useEffect(() => {
    if (!highlightedId) return;
    document.getElementById(`browser-tab-${highlightedId}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [highlightedId]);

  // Overflow fades and vertical-wheel → horizontal scroll (non-passive so the page doesn't scroll).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const max = list.scrollWidth - list.clientWidth;
      if (max <= 1) {
        setFade("none");
        return;
      }
      // scrollLeft runs 0 → max in LTR and 0 → -max in RTL.
      const pos = Math.abs(list.scrollLeft);
      const atStart = pos <= 1;
      const atEnd = pos >= max - 1;
      const hiddenLeft = rtl ? !atEnd : !atStart;
      const hiddenRight = rtl ? !atStart : !atEnd;
      setFade(hiddenLeft && hiddenRight ? "both" : hiddenLeft ? "left" : hiddenRight ? "right" : "none");
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    const onWheel = (event: WheelEvent) => {
      if (list.scrollWidth <= list.clientWidth || event.deltaX !== 0 || event.deltaY === 0) return;
      event.preventDefault();
      list.scrollLeft += rtl ? -event.deltaY : event.deltaY;
    };
    list.addEventListener("scroll", schedule, { passive: true });
    list.addEventListener("wheel", onWheel, { passive: false });
    const observer = new ResizeObserver(schedule);
    observer.observe(list);
    schedule();
    return () => {
      list.removeEventListener("scroll", schedule);
      list.removeEventListener("wheel", onWheel);
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [rtl]);

  // Content width changes (tabs added / widths recomputed) don't resize the tablist box itself.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const frame = window.requestAnimationFrame(() => list.dispatchEvent(new Event("scroll")));
    return () => window.cancelAnimationFrame(frame);
  }, [tabs.length, layout.unpinnedWidth]);

  const openNewTab = () => {
    reportOpenResult(actions.openNewTabPage(), t, (message) => toast(message));
  };

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    // Web only: in Tauri the drag script owns double-click (maximize / zoom).
    if (native) return;
    const target = event.target;
    if (target === stripRef.current || target === listRef.current || (target instanceof HTMLElement && target.dataset.stripGap !== undefined)) {
      openNewTab();
    }
  };

  const dragRegion = native ? "" : undefined;
  const newTabLabel = newTabShortcut ? `${t("browser.actions.newTab")} (${newTabShortcut})` : t("browser.actions.newTab");

  return (
    <TabContextMenu>
      <div
        ref={stripRef}
        data-slot="browser-tab-strip"
        data-tauri-drag-region={dragRegion}
        className={cn(
          STRIP_CLASS,
          platform === "macos" ? "transition-[padding] duration-200 ease-out motion-reduce:transition-none" : "ps-2",
          "pe-1.5",
        )}
        // Physical insets: the traffic lights stay left and caption buttons right in RTL.
        style={{
          paddingLeft: platform === "macos" ? leadInset : undefined,
          paddingRight: captionWidth > 0 ? captionWidth + 4 : undefined,
        }}
        onPointerLeave={layout.unfreeze}
        onDoubleClick={onDoubleClick}
      >
        {platform === "macos" ? <MacTrafficLightInset fullscreen={fullscreen} /> : null}
        <div
          ref={listRef}
          role="tablist"
          aria-label={t("browserDesktop.tabs.label")}
          aria-orientation="horizontal"
          data-fade={fade === "none" ? undefined : fade}
          data-tauri-drag-region={dragRegion}
          className={TABLIST_CLASS}
        >
          {hasTabs ? (
            tabs.map((tab, index) => {
              const active = tab.id === highlightedId;
              const dragState = drag.drag;
              return (
                <TabItem
                  key={tab.id}
                  tab={tab}
                  index={index}
                  width={tab.pinned ? geometry.TAB_PINNED_W : layout.unpinnedWidth}
                  active={active}
                  prevActive={index > 0 && tabs[index - 1].id === highlightedId}
                  focusable={tab.id === focusableId}
                  translateX={drag.translateFor(tab.id, index)}
                  dragged={dragState?.phase === "dragging" && dragState.id === tab.id}
                  dragActive={dragState?.phase === "dragging"}
                  settling={dragState?.phase === "settling"}
                  coarse={coarse}
                  handlers={drag.handlers}
                  onClose={onClose}
                  onKeyDown={onTabKeyDown}
                  onFocusTab={onFocusTab}
                />
              );
            })
          ) : (
            <CurrentPageTab width={layout.unpinnedWidth} coarse={coarse} />
          )}
        </div>
        <Tooltip>
          <TooltipTrigger
            delay={600}
            render={
              <button
                type="button"
                aria-label={newTabLabel}
                onClick={openNewTab}
                className={cn(STRIP_BUTTON_CLASS, "ms-1")}
              />
            }
          >
            <Plus className="h-4 w-4" aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">{newTabLabel}</TooltipContent>
        </Tooltip>
        <div
          aria-hidden
          data-strip-gap=""
          data-tauri-drag-region={dragRegion}
          className="h-full flex-1"
          style={{ minWidth: native ? geometry.MIN_DRAG_GAP_NATIVE : geometry.MIN_DRAG_GAP_WEB }}
        />
        <TabSearchButton />
        {captionWidth > 0 ? (
          <div className="absolute inset-y-0 right-0 z-10" style={{ width: captionWidth }}>
            <WindowCaptionButtons maximized={maximized} />
          </div>
        ) : null}
      </div>
    </TabContextMenu>
  );
}

/**
 * Until the tab store is ready (or without it) the strip shows the current page as a single
 * tab, so the chrome never renders an empty strip.
 */
function CurrentPageTab({ width, coarse }: { width: number; coarse: boolean }) {
  const presentation = useTabPresentation(null);
  const mode = tabContentMode(width, true, coarse);
  const Icon = presentation.icon;
  return (
    <div
      role="tab"
      id="browser-tab-current"
      aria-selected
      aria-controls="desktop-content"
      aria-label={mode.title ? undefined : presentation.title}
      tabIndex={0}
      style={{ width }}
      className={cn(TAB_BASE_CLASS, TAB_ACTIVE_CLASS)}
    >
      {mode.icon ? (
        <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
          <Icon className="size-4" />
        </span>
      ) : null}
      {mode.title ? <span className={TAB_TITLE_CLASS}>{presentation.title}</span> : null}
    </div>
  );
}
