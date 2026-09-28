"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePanelRef, type PanelSize } from "react-resizable-panels";
import { SIDEBAR_HANDLE_CLASS } from "@/components/browser-shell/desktop/chrome-classes";
import { CHROME } from "@/components/browser-shell/desktop/chrome-geometry";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useI18n } from "@/lib/i18n/context";
import { MerchivaSidePanel, RAIL_WIDTH, useCanUseMerchiva } from "./dock-panel";
import {
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  readDockWidth,
  setMerchivaDockOpen,
  useClaimDockSlot,
  useMerchivaDockOpen,
  writeDockWidth,
} from "./dock-state";

const MAIN_PANEL_ID = "merchiva-dock-main";
const DOCK_PANEL_ID = "merchiva-dock";
/**
 * What the page region keeps however wide the dock gets: the page's minimum plus the narrowest
 * expanded sidebar and its handle, so widening the dock never squeezes the sidebar into its rail.
 */
const MAIN_MIN_WIDTH = CHROME.CONTENT_MIN_W + CHROME.SIDEBAR_MIN_W + 4;
/** A drag that ends this close to the rail counts as collapsing it. */
const RAIL_SLOP = 8;

/**
 * The desktop browser chrome's page region plus the Mr. Merchiva dock on its right (its left in
 * RTL), as its own resizable panel that collapses to the rail. `open` in dock-state.ts drives the
 * panel: the shortcut, the rail and the collapse button write it, and a drag to or from the rail
 * writes it back through `onResize` — the same arrangement as the browser sidebar.
 *
 * The dock panel is conditional (members without Merchiva get none) but the page panel keeps its
 * slot, so the page never remounts. As in the sidebar's group, RTL renders the panels in visual
 * order with the group pinned to LTR, because react-resizable-panels resizes by DOM order.
 */
export function MerchivaDockLayout({ children }: { children: ReactNode }) {
  useClaimDockSlot();
  const { t, dir } = useI18n();
  const rtl = dir === "rtl";
  const allowed = useCanUseMerchiva();
  const open = useMerchivaDockOpen();
  const panel = usePanelRef();
  const [initialSize] = useState(() => (open ? readDockWidth() : RAIL_WIDTH));

  // Retried on the next frame while the panel is not registered with its group yet (see the
  // sidebar sync in desktop-browser-chrome.tsx for why the handle can throw in between).
  useEffect(() => {
    if (!allowed) return;
    let frame = 0;
    const sync = () => {
      const handle = panel.current;
      if (!handle) return;
      try {
        if (open) {
          if (handle.isCollapsed()) handle.resize(readDockWidth());
        } else if (!handle.isCollapsed()) {
          handle.collapse();
        }
      } catch {
        frame = requestAnimationFrame(sync);
      }
    };
    sync();
    return () => cancelAnimationFrame(frame);
  }, [allowed, open, panel]);

  const onDockResize = useCallback((size: PanelSize, _id: string | number | undefined, previous: PanelSize | undefined) => {
    // The mount call reports the initial layout; only real resizes change the dock.
    if (previous === undefined) return;
    const railed = size.inPixels <= RAIL_WIDTH + RAIL_SLOP;
    if (!railed) writeDockWidth(size.inPixels);
    setMerchivaDockOpen(!railed);
  }, []);

  const mainSlot = (
    <ResizablePanel key={MAIN_PANEL_ID} id={MAIN_PANEL_ID} minSize={MAIN_MIN_WIDTH} className="h-full">
      {children}
    </ResizablePanel>
  );
  const handleSlot = allowed ? (
    <ResizableHandle key="merchiva-dock-handle" aria-label={t("merchiva.dock.resize")} className={SIDEBAR_HANDLE_CLASS} />
  ) : null;
  const dockSlot = allowed ? (
    <ResizablePanel
      key={DOCK_PANEL_ID}
      id={DOCK_PANEL_ID}
      panelRef={panel}
      defaultSize={initialSize}
      minSize={DOCK_MIN_WIDTH}
      maxSize={DOCK_MAX_WIDTH}
      collapsible
      collapsedSize={RAIL_WIDTH}
      groupResizeBehavior="preserve-pixel-size"
      onResize={onDockResize}
      className="h-full"
    >
      <div dir={dir} className="h-full">
        <MerchivaSidePanel open={open} />
      </div>
    </ResizablePanel>
  ) : null;

  return (
    <ResizablePanelGroup orientation="horizontal" dir={rtl ? "ltr" : undefined} className="min-h-0 flex-1">
      {rtl ? [dockSlot, handleSlot, mainSlot] : [mainSlot, handleSlot, dockSlot]}
    </ResizablePanelGroup>
  );
}
