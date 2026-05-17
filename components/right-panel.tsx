"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { motion } from "motion/react";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { MerchivaChat, NotchM } from "@/components/merchiva-chat-dashboard";

// ─── RightPanel Component ───────────────────────────────────────────────────

const PANEL_WIDTH = 420;

export function RightPanel({ collapsible = true }: { collapsible?: boolean } = {}) {
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const safeAreaInsets = getSafeAreaInsets();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("right_panel_open");
      if (stored === "false") setOpen(false);
    } catch {}
    setLoaded(true);
  }, []);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("right_panel_open", String(next));
      } catch {}
      return next;
    });
  };

  if (!collapsible) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-background">
        <div className="flex-1 min-h-0 overflow-hidden">
          <MerchivaChat compact header={false} />
        </div>
      </div>
    );
  }

  const COLLAPSED_WIDTH = 44;

  const springTransition = { type: "spring" as const, stiffness: 500, damping: 38, mass: 0.6 };

  return (
    <div className="h-full shrink-0 flex lg:border-l lg:border-border bg-background" style={{ position: "relative" }}>
      <motion.div
        animate={{ width: open ? PANEL_WIDTH : COLLAPSED_WIDTH }}
        initial={loaded ? undefined : false}
        transition={springTransition}
        className="h-full relative overflow-hidden"
      >
        {/* Expanded panel — always mounted */}
        <div
          className="absolute inset-0 flex flex-col"
          style={{
            width: PANEL_WIDTH,
            paddingTop: safeAreaInsets.top,
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            transition: "opacity 180ms ease",
          }}
        >
          {/* Top bar — reserve space for the animated label + close button */}
          <div className="flex items-center px-4 py-2.5 shrink-0" style={{ minHeight: 42 }}>
            <div className="flex-1" />
            <button
              type="button"
              onClick={toggleOpen}
              className="p-1 rounded-[0.3rem] hover:bg-muted transition-colors"
              title="Collapse panel"
            >
              <PanelRightClose className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <MerchivaChat compact header={false} />
          </div>
        </div>

        {/* Collapsed strip — icon only */}
        <div
          className="absolute inset-y-0 left-0 flex flex-col items-center cursor-pointer select-none"
          style={{
            width: COLLAPSED_WIDTH,
            opacity: open ? 0 : 1,
            pointerEvents: open ? "none" : "auto",
            transition: "opacity 180ms ease",
          }}
          onClick={toggleOpen}
          title="Open Mr. Merchiva"
        >
          <div className="pt-3">
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </motion.div>

      {/* Floating animated label — lives outside overflow-hidden so it's never clipped */}
      <motion.div
        className="absolute z-20 flex items-center gap-2 select-none"
        animate={open ? {
          left: 16,
          top: safeAreaInsets.top + 10,
          rotate: 0,
          scale: 1,
          translateX: 0,
          translateY: 0,
        } : {
          left: COLLAPSED_WIDTH / 2,
          top: "50%",
          rotate: 90,
          scale: 0.9,
          translateX: "-50%",
          translateY: "-50%",
        }}
        initial={false}
        transition={springTransition}
        style={{
          pointerEvents: open ? "none" : "auto",
          cursor: open ? "default" : "pointer",
        }}
        onClick={!open ? toggleOpen : undefined}
      >
        <NotchM size={20} />
        <span className="text-[13px] font-semibold tracking-tight text-foreground whitespace-nowrap">
          Mr. Merchiva
        </span>
      </motion.div>
    </div>
  );
}

// ─── Mobile Right Panel (swipe left to open, mirrors sidebar behavior) ──────

const RPANEL_WIDTH = 280;
const RPANEL_VELOCITY_THRESHOLD = 0.3;
const RPANEL_SNAP_THRESHOLD = 0.4;

const RightPanelMobileContext = createContext<{
  isOpen: boolean;
  open: () => void;
  close: () => void;
  progress: number;
  dragging: boolean;
  transitionStyle: string;
}>({ isOpen: false, open: () => {}, close: () => {}, progress: 0, dragging: false, transitionStyle: "none" });

export function useRightPanelMobile() {
  return useContext(RightPanelMobileContext);
}

export function RightPanelMobileProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastXRef = useRef(0);
  const isHorizRef = useRef<boolean | null>(null);
  const isOpenRef = useRef(false);
  const draggingRef = useRef(false);
  const leftSidebarOpenRef = useRef(false);

  isOpenRef.current = isOpen;
  draggingRef.current = dragging;

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      directionLocked = null;

      const mobileContent = document.getElementById("mobile-content");
      if (mobileContent) {
        const transform = getComputedStyle(mobileContent).transform;
        if (transform && transform !== "none") {
          const match = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+)/);
          if (match && parseFloat(match[1]) > 10) {
            leftSidebarOpenRef.current = true;
            return;
          }
        }
      }
      leftSidebarOpenRef.current = false;

      const t = e.touches[0];
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      startTimeRef.current = Date.now();
      lastXRef.current = t.clientX;
      isHorizRef.current = null;
    }

    function getOrCreateOverlay(): HTMLDivElement {
      let overlay = document.getElementById("rpanel-overlay") as HTMLDivElement | null;
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "rpanel-overlay";
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.zIndex = "30";
        overlay.style.backdropFilter = "blur(4px)";
        (overlay.style as unknown as Record<string, string>).webkitBackdropFilter = "blur(4px)";
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";
        overlay.style.background = "color-mix(in oklab, var(--foreground) 20%, transparent)";
        const el = document.getElementById("mobile-content");
        if (el) el.appendChild(overlay);
      }
      return overlay;
    }

    function applyContentShift(offset: number, useTransition: boolean) {
      const el = document.getElementById("mobile-content");
      if (!el) return;
      const progress = offset / RPANEL_WIDTH;
      const shift = -progress * RPANEL_WIDTH;
      const trans = useTransition ? "all 220ms cubic-bezier(0.4, 0, 0.2, 1)" : "none";
      el.style.transition = trans;
      const overlay = getOrCreateOverlay();
      overlay.style.transition = trans;
      if (offset > 0) {
        el.style.transform = `translateX(${shift}px)`;
        el.style.boxShadow = "4px 0 16px rgba(0, 0, 0, 0.15)";
        el.style.borderRadius = "0 38px 38px 0";
        overlay.style.opacity = String(progress);
        overlay.style.pointerEvents = "none";
      } else {
        el.style.transform = "";
        el.style.boxShadow = "";
        el.style.borderRadius = "";
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";
      }
    }

    let directionLocked: "left" | "right" | null = null;

    function onTouchMove(e: TouchEvent) {
      if (leftSidebarOpenRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      if (isHorizRef.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isHorizRef.current = Math.abs(dx) > Math.abs(dy);
        if (isHorizRef.current) {
          directionLocked = dx < 0 ? "left" : "right";
        }
      }
      if (!isHorizRef.current) return;

      if (!isOpenRef.current && directionLocked === "right") return;
      if (isOpenRef.current && directionLocked === "left") return;

      lastXRef.current = t.clientX;
      let offset: number;

      if (isOpenRef.current) {
        offset = Math.max(0, Math.min(RPANEL_WIDTH, RPANEL_WIDTH + dx));
      } else {
        offset = Math.max(0, Math.min(RPANEL_WIDTH, -dx));
      }

      if (offset > 8) {
        e.preventDefault();
        draggingRef.current = true;
        setDragging(true);
        setDragOffset(offset);
        applyContentShift(offset, false);
      } else if (draggingRef.current) {
        draggingRef.current = false;
        setDragging(false);
        setDragOffset(0);
        applyContentShift(0, false);
      }
    }

    function onTouchEnd() {
      if (!draggingRef.current) return;

      const dx = lastXRef.current - startXRef.current;
      const dt = Math.max(1, Date.now() - startTimeRef.current);
      const velocity = dx / dt;

      let currentOffset: number;
      if (isOpenRef.current) {
        currentOffset = Math.max(0, Math.min(RPANEL_WIDTH, RPANEL_WIDTH + dx));
      } else {
        currentOffset = Math.max(0, Math.min(RPANEL_WIDTH, -dx));
      }

      let shouldOpen: boolean;
      if (isOpenRef.current) {
        shouldOpen = !(
          currentOffset < RPANEL_WIDTH * (1 - RPANEL_SNAP_THRESHOLD) ||
          velocity > RPANEL_VELOCITY_THRESHOLD
        );
      } else {
        shouldOpen =
          currentOffset > RPANEL_WIDTH * RPANEL_SNAP_THRESHOLD ||
          velocity < -RPANEL_VELOCITY_THRESHOLD;
      }

      applyContentShift(shouldOpen ? RPANEL_WIDTH : 0, true);
      setIsOpen(shouldOpen);
      setDragging(false);
      setDragOffset(0);
      draggingRef.current = false;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const translateX = dragging ? dragOffset : isOpen ? RPANEL_WIDTH : 0;
  const progress = Math.min(1, Math.max(0, translateX / RPANEL_WIDTH));
  const transitionStyle = dragging ? "none" : "all 220ms cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <RightPanelMobileContext.Provider value={{
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      progress,
      dragging,
      transitionStyle,
    }}>
      {children}
    </RightPanelMobileContext.Provider>
  );
}

export function MobileRightPanel() {
  const { isOpen, close, progress, dragging, transitionStyle } = useRightPanelMobile();

  const panelScale = 0.92 + progress * 0.08;
  const panelTranslateX = 30 - progress * 30;
  const panelOpacity = progress;

  const wasActiveRef = useRef(false);

  useEffect(() => {
    const el = document.getElementById("mobile-content");
    if (!el || dragging) return;

    if (!isOpen && !wasActiveRef.current) return;

    const trans = "all 220ms cubic-bezier(0.4, 0, 0.2, 1)";
    el.style.transition = trans;

    let overlay = document.getElementById("rpanel-overlay") as HTMLDivElement | null;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "rpanel-overlay";
      overlay.style.position = "absolute";
      overlay.style.inset = "0";
      overlay.style.zIndex = "30";
      overlay.style.backdropFilter = "blur(4px)";
      (overlay.style as unknown as Record<string, string>).webkitBackdropFilter = "blur(4px)";
      overlay.style.background = "color-mix(in oklab, var(--foreground) 20%, transparent)";
      el.appendChild(overlay);
    }
    overlay.style.transition = trans;

    if (isOpen) {
      wasActiveRef.current = true;
      el.style.transform = `translateX(${-RPANEL_WIDTH}px)`;
      el.style.boxShadow = "4px 0 16px rgba(0, 0, 0, 0.15)";
      el.style.borderRadius = "0 38px 38px 0";
      overlay.style.opacity = "1";
      overlay.style.pointerEvents = "auto";
      overlay.onclick = () => close();
    } else {
      wasActiveRef.current = false;
      el.style.transform = "";
      el.style.boxShadow = "";
      el.style.borderRadius = "";
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
      overlay.onclick = null;
    }
  }, [isOpen, dragging, close]);

  // Keep Mr. Merchiva mounted at all times — previously this branch returned
  // `null` when the panel was closed, which unmounted <RightPanel> on every
  // tiny right-swipe and reset the chat session each time. Hide via CSS
  // (`visibility: hidden` + `pointer-events: none`) so children retain state
  // and SpacetimeDB subscriptions stay alive while the panel is offscreen.
  const isHidden = progress === 0 && !isOpen && !dragging;

  return (
    <div
      aria-hidden={isHidden}
      className="fixed inset-y-0 right-0 z-10 flex flex-col overflow-hidden bg-background"
      style={{
        width: RPANEL_WIDTH,
        transform: `translateX(${panelTranslateX}px) scale(${panelScale})`,
        opacity: panelOpacity,
        transformOrigin: "right center",
        transition: transitionStyle,
        visibility: isHidden ? "hidden" : "visible",
        pointerEvents: isHidden ? "none" : "auto",
      }}
    >
      <RightPanel collapsible={false} />
    </div>
  );
}
