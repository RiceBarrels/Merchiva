"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { SidebarContent } from "@/components/sidebar";
import { MerchivaLogo } from "@/components/logo";

const SIDEBAR_WIDTH = 280;
const EDGE_THRESHOLD = 30;

export function MobileShell({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  // Refs for touch state (avoid stale closures in handlers)
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const dragActive = useRef(false);
  const dragStartOffset = useRef(0);
  const directionLocked = useRef<"horizontal" | "vertical" | null>(null);
  const isOpenRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with state
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const openSidebar = useCallback(() => {
    setIsOpen(true);
    isOpenRef.current = true;
    setIsDragging(false);
    setDragOffset(SIDEBAR_WIDTH);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsOpen(false);
    isOpenRef.current = false;
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  // Use native listeners so we can call preventDefault on touchmove (passive: false)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      touchStartTime.current = Date.now();
      directionLocked.current = null;

      const open = isOpenRef.current;
      dragActive.current = touch.clientX < EDGE_THRESHOLD || open;
      dragStartOffset.current = open ? SIDEBAR_WIDTH : 0;
    }

    function onTouchMove(e: TouchEvent) {
      if (!dragActive.current) return;

      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX.current;
      const dy = touch.clientY - touchStartY.current;

      if (directionLocked.current === null) {
        if (Math.abs(dx) > Math.abs(dy) + 3) {
          directionLocked.current = "horizontal";
        } else if (Math.abs(dy) > Math.abs(dx) + 3) {
          directionLocked.current = "vertical";
          dragActive.current = false;
          return;
        } else {
          return;
        }
      }

      if (directionLocked.current !== "horizontal") return;

      e.preventDefault(); // prevent scroll during horizontal swipe
      setIsDragging(true);
      const newOffset = Math.max(0, Math.min(SIDEBAR_WIDTH, dragStartOffset.current + dx));
      setDragOffset(newOffset);
    }

    function onTouchEnd(e: TouchEvent) {
      if (!dragActive.current || directionLocked.current !== "horizontal") {
        dragActive.current = false;
        setIsDragging(false);
        return;
      }

      dragActive.current = false;
      setIsDragging(false);

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX.current;
      const elapsed = Math.max(1, Date.now() - touchStartTime.current);
      const velocity = dx / elapsed; // px/ms

      const currentOffset = Math.max(0, Math.min(SIDEBAR_WIDTH, dragStartOffset.current + dx));
      const shouldOpen = currentOffset > SIDEBAR_WIDTH * 0.4 || velocity > 0.4;

      if (shouldOpen) {
        setIsOpen(true);
        isOpenRef.current = true;
        setDragOffset(SIDEBAR_WIDTH);
      } else {
        setIsOpen(false);
        isOpenRef.current = false;
        setDragOffset(0);
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []); // empty deps — all state accessed via refs

  const transformOffset = isDragging ? dragOffset : isOpen ? SIDEBAR_WIDTH : 0;

  return (
    <>
      {/* ── Mobile layout ── */}
      <div className="md:hidden relative h-screen overflow-hidden">
        {/* Sidebar sits fixed behind main content */}
        <div
          className="fixed inset-y-0 left-0 z-10 bg-stone-50 border-r border-stone-200"
          style={{ width: SIDEBAR_WIDTH }}
        >
          <SidebarContent onClose={closeSidebar} />
        </div>

        {/* Main content — translate right to reveal sidebar */}
        <div
          ref={contentRef}
          className="absolute inset-0 z-20 flex flex-col bg-background"
          style={{
            transform: `translateX(${transformOffset}px)`,
            transition: isDragging ? "none" : "transform 200ms ease-out",
            boxShadow:
              transformOffset > 0 ? "-8px 0 20px rgba(0,0,0,0.1)" : "none",
            willChange: "transform",
          }}
        >
          {/* Mobile top bar */}
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
            <button
              onClick={isOpen ? closeSidebar : openSidebar}
              className="p-1 rounded text-muted-foreground hover:bg-muted"
              aria-label={isOpen ? "Close menu" : "Open menu"}
            >
              {isOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <MerchivaLogo size={24} fg="var(--background)" bg="var(--foreground)" rounded />
              <p className="text-sm font-semibold tracking-tight">Merchiva</p>
            </div>
          </div>

          {/* Page content — tap to close sidebar when open */}
          <main
            className="flex-1 overflow-y-auto"
            onClick={isOpen && !isDragging ? closeSidebar : undefined}
          >
            {children}
          </main>
        </div>
      </div>

      {/* ── Desktop layout — sidebar always visible, no gestures ── */}
      <div className="hidden md:flex h-screen overflow-hidden bg-background">
        <div className="w-56 shrink-0 h-full">
          <SidebarContent />
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </>
  );
}
