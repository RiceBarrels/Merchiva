"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useDefaultLayout, usePanelRef, type PanelSize } from "react-resizable-panels";
import { TabPageOutlet } from "@/components/browser-shell/core/tab-page-outlet";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useActiveTab, useShellCommand, useTabContentHost, useTabPresentation } from "@/lib/browser-shell";
import { useI18n, useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { BookmarksBar } from "./bookmarks-bar";
import { useBookmarksBarVisible } from "./bookmarks-bar-state";
import { FRAME_CLASS, SIDEBAR_HANDLE_CLASS, SKIP_LINK_CLASS, TOOLBAR_AREA_CLASS } from "./chrome-classes";
import { DESKTOP_CONTENT_ID, DesktopChromeProvider, focusDesktopContent, useDesktopChrome } from "./chrome-context";
import { SLOW_LOAD_ANNOUNCE_MS, TOOLBAR_TOOLTIP_DELAY_MS, isSidebarRail } from "./chrome-geometry";
import { ShellLiveRegion, useAnnounce } from "./shell-live-region";
import {
  BrowserSidebar,
  SIDEBAR_CONTENT_PANEL_ID,
  SIDEBAR_LAYOUT_ID,
  SIDEBAR_PANEL_ID,
  TOGGLE_SIDEBAR_COMMAND,
  setSidebarCollapsed,
  toggleSidebarWithFocus,
  useSidebarState,
} from "./sidebar";
import { TabStrip } from "./tab-strip";
import { Toolbar } from "./toolbar";

/*
 * Chrome-style desktop chrome (≥1024px), rendered by ManagerShell inside BrowserShellProvider.
 *
 *   <frame>
 *     skip link · TabStrip · toolbar area (Toolbar + BookmarksBar)     full width
 *     ResizablePanelGroup
 *       BrowserSidebar panel (hidden / icon rail / resizable) · handle
 *       #desktop-content  (role=tabpanel; DynamicUIElement push target)
 *         <TabPageOutlet>{children}</TabPageOutlet>   exactly once
 *   </frame>
 *
 * Plan §B2.2: the content element carries no inline transform / borderRadius / overflow
 * (DynamicUIElement owns those), `useTabContentHost` tracks its scroll, and the chrome never
 * writes document.title, html attributes, history or global key listeners (core does).
 *
 * The sidebar panel is conditional but the content panel keeps its slot in the children array,
 * so hiding or showing the sidebar never remounts the page.
 */
/*
 * react-resizable-panels defaults `storage` to localStorage and reads it inside a
 * useSyncExternalStore snapshot with no try/catch, so a browser with site data blocked would
 * throw during render. Same policy as persistence.ts and sidebar-state.ts: storage failures
 * degrade to "no stored layout" instead of taking the page down.
 */
const SAFE_LAYOUT_STORAGE: Pick<Storage, "getItem" | "setItem"> = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // The layout is a convenience; this session keeps its width in memory.
    }
  },
};

export function DesktopBrowserChrome({ children }: { children: ReactNode }) {
  return (
    <ShellLiveRegion>
      <DesktopChromeProvider>
        <TooltipProvider delay={TOOLBAR_TOOLTIP_DELAY_MS}>
          <DesktopFrame>{children}</DesktopFrame>
        </TooltipProvider>
      </DesktopChromeProvider>
    </ShellLiveRegion>
  );
}

function DesktopFrame({ children }: { children: ReactNode }) {
  const { t, dir } = useI18n();
  const rtl = dir === "rtl";
  const { coarse, geometry } = useDesktopChrome();
  const [barVisible, setBarVisible] = useBookmarksBarVisible();
  const { hidden: sidebarHidden, collapsed: sidebarCollapsed } = useSidebarState();
  const activeTab = useActiveTab();
  const presentation = useTabPresentation(activeTab);
  const contentRef = useRef<HTMLDivElement>(null);
  const sidebarPanel = usePanelRef();

  // Separate stored layouts for "with sidebar" and "sidebar hidden" (react-resizable-panels keys
  // a saved layout by the panels rendered at mount, in their rendered order — dist:1772). RTL
  // renders them the other way round, so it keeps its own entry instead of dropping a mismatched
  // one; a device that changes language between LTR and RTL starts from the default width once.
  const panelIds = useMemo(() => {
    if (sidebarHidden) return [SIDEBAR_CONTENT_PANEL_ID];
    return rtl ? [SIDEBAR_CONTENT_PANEL_ID, SIDEBAR_PANEL_ID] : [SIDEBAR_PANEL_ID, SIDEBAR_CONTENT_PANEL_ID];
  }, [sidebarHidden, rtl]);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: SIDEBAR_LAYOUT_ID,
    panelIds,
    storage: SAFE_LAYOUT_STORAGE,
  });

  useTabContentHost(contentRef);
  useShellCommand("toggleBookmarksBar", () => setBarVisible(!barVisible));
  useShellCommand(TOGGLE_SIDEBAR_COMMAND, toggleSidebarWithFocus);

  // The persisted rail state drives the panel: the in-sidebar control and the shortcut write the
  // state, and a drag below the minimum writes it back through `onResize`.
  useEffect(() => {
    if (sidebarHidden) return;
    const panel = sidebarPanel.current;
    if (!panel) return;
    if (sidebarCollapsed) {
      if (!panel.isCollapsed()) panel.collapse();
    } else if (panel.isCollapsed()) {
      panel.expand();
    }
  }, [sidebarHidden, sidebarCollapsed, sidebarPanel]);

  const onSidebarResize = useCallback(
    (size: PanelSize, _id: string | number | undefined, previous: PanelSize | undefined) => {
      // The mount call reports the restored layout; only real resizes change the rail state.
      if (previous === undefined) return;
      setSidebarCollapsed(isSidebarRail(size.inPixels, geometry));
    },
    [geometry],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (document.getElementById("mobile-content")) {
      console.error(
        "[DesktopBrowserChrome] #mobile-content is mounted next to #desktop-content; DynamicUIElement dialogs would push the wrong element.",
      );
    }
  }, []);

  /*
   * The three slots are ordered VISUALLY below, and in RTL the group is pinned to `dir="ltr"`:
   * react-resizable-panels resizes the panel that precedes the separator in DOM order by a raw
   * clientX delta, so a mirrored DOM order sends the divider away from the pointer (the details
   * are on SIDEBAR_HANDLE_CLASS in chrome-classes.ts). The sidebar and the page region re-declare
   * the document direction on their own elements, and the stable keys let React move the panels
   * instead of remounting them when the order flips on a language change.
   */
  const sidebarSlot = sidebarHidden ? null : (
    <ResizablePanel
      key={SIDEBAR_PANEL_ID}
      id={SIDEBAR_PANEL_ID}
      panelRef={sidebarPanel}
      defaultSize={geometry.SIDEBAR_W}
      minSize={geometry.SIDEBAR_MIN_W}
      maxSize={geometry.SIDEBAR_MAX_W}
      collapsible
      collapsedSize={geometry.SIDEBAR_RAIL_W}
      groupResizeBehavior="preserve-pixel-size"
      onResize={onSidebarResize}
      className="h-full"
    >
      <BrowserSidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} />
    </ResizablePanel>
  );
  const handleSlot = sidebarHidden ? null : (
    <ResizableHandle
      key="browser-sidebar-handle"
      aria-label={t("browserDesktop.sidebar.resize")}
      className={SIDEBAR_HANDLE_CLASS}
    />
  );
  const contentSlot = (
    <ResizablePanel
      key={SIDEBAR_CONTENT_PANEL_ID}
      id={SIDEBAR_CONTENT_PANEL_ID}
      minSize={geometry.CONTENT_MIN_W}
      className="h-full"
    >
      <div
        id={DESKTOP_CONTENT_ID}
        ref={contentRef}
        role="tabpanel"
        aria-labelledby={activeTab ? `browser-tab-${activeTab.id}` : "browser-tab-current"}
        aria-busy={presentation.pending || undefined}
        dir={dir}
        tabIndex={-1}
        className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background outline-none"
      >
        <TabPageOutlet>{children}</TabPageOutlet>
      </div>
    </ResizablePanel>
  );

  return (
    <div
      data-slot="browser-frame"
      data-shell-frame="desktop"
      data-density={coarse ? "coarse" : "fine"}
      className={FRAME_CLASS}
    >
      <button type="button" className={SKIP_LINK_CLASS} onClick={() => focusDesktopContent()}>
        {t("browserDesktop.skipToContent")}
      </button>
      <TabStrip />
      <div data-slot="browser-toolbar-area" className={TOOLBAR_AREA_CLASS}>
        <Toolbar />
        {barVisible ? <BookmarksBar /> : null}
      </div>
      <ResizablePanelGroup
        orientation="horizontal"
        dir={rtl ? "ltr" : undefined}
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1"
      >
        {rtl ? [contentSlot, handleSlot, sidebarSlot] : [sidebarSlot, handleSlot, contentSlot]}
      </ResizablePanelGroup>
      <PageLoadAnnouncer pending={presentation.pending} title={presentation.title} />
    </div>
  );
}

/** Announces "<title> loaded" when a navigation in the active tab took longer than a second. */
function PageLoadAnnouncer({ pending, title }: { pending: boolean; title: string }) {
  const t = useT();
  const announce = useAnnounce();
  const pendingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (pending) {
      if (pendingSinceRef.current === null) pendingSinceRef.current = Date.now();
      return;
    }
    const since = pendingSinceRef.current;
    pendingSinceRef.current = null;
    if (since !== null && Date.now() - since > SLOW_LOAD_ANNOUNCE_MS) {
      announce(fmt(t("browserDesktop.pageLoaded"), { title }));
    }
  }, [pending, title, announce, t]);

  return null;
}
