"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NotificationDot } from "@/components/ui/notification-dot";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

/**
 * Horizontally swipeable pages (Channel | Apps) with page dots. Drag beyond
 * 80px commits, otherwise it snaps back. Pointer-downs inside an element
 * marked `data-no-swipe` (an open app panel) never start a page drag.
 * An off-screen page with something new shows the notification dot in place
 * of its page dot (`dots`, see useDevicePagerDots) and says so in the
 * button's name — the aria-label wins over the dot's own sr-only text.
 */
export function PagesTrack({
  page,
  onPageChange,
  pages,
  dots,
  className,
}: {
  page: number;
  onPageChange: (p: number) => void;
  pages: ReactNode[];
  /** Per page: it has a notification dot. */
  dots?: readonly boolean[];
  className?: string;
}) {
  const t = useT();
  const [drag, setDrag] = useState<{ dx: number; active: boolean } | null>(null);
  const startX = useRef<number | null>(null);
  const count = pages.length;
  const clamp = (p: number) => Math.max(0, Math.min(count - 1, p));

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-swipe]")) return;
    startX.current = e.clientX;
    setDrag({ dx: 0, active: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 12 || drag?.active) setDrag({ dx, active: true });
  };
  const onEnd = () => {
    if (startX.current === null) return;
    const dx = drag?.dx ?? 0;
    if (drag?.active && Math.abs(dx) > 80) onPageChange(clamp(page + (dx < 0 ? 1 : -1)));
    startX.current = null;
    setDrag(null);
  };

  // Percentage offset for the page plus the live drag distance in px — no
  // layout reads during render.
  const dragPx = drag?.active ? drag.dx : 0;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className="flex h-full"
        style={{
          width: `${count * 100}%`,
          transform: `translateX(calc(${-page * (100 / count)}% + ${dragPx}px))`,
          transition: drag?.active ? "none" : "transform .32s cubic-bezier(.2,.7,.2,1)",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onPointerLeave={onEnd}
      >
        {pages.map((p, i) => (
          <div key={i} className="relative h-full shrink-0 overflow-hidden" style={{ width: `${100 / count}%` }}>
            {p}
          </div>
        ))}
      </div>
      {/* Page dots. The button is a small hit area that opts out of the global
          44px mobile touch-target rule; the visible dot is the inner <i>. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex justify-center">
        {pages.map((_, i) => {
          const dotted = !!dots?.[i] && i !== page;
          const name = fmt(t("device.pager.page"), { n: i + 1 });
          return (
            <button
              key={i}
              type="button"
              aria-label={dotted ? fmt(t("notify.dot.withName"), { name }) : name}
              aria-current={i === page ? "true" : undefined}
              onClick={() => onPageChange(i)}
              className="pointer-events-auto grid h-6 w-4 min-h-0! min-w-0! place-items-center"
            >
              {dotted ? (
                <NotificationDot inline />
              ) : (
                <i className={cn("h-[5px] w-[5px] rounded-full transition-colors", i === page ? "bg-foreground" : "bg-border")} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
