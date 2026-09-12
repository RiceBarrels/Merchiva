"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Two horizontally swipeable pages (Channel | Apps) with page dots. Drag
 * beyond 80px commits, otherwise it snaps back — same feel as the prototype.
 */
export function PagesTrack({
  page,
  onPageChange,
  pages,
  className,
}: {
  page: number;
  onPageChange: (p: number) => void;
  pages: ReactNode[];
  className?: string;
}) {
  const [drag, setDrag] = useState<{ dx: number; active: boolean } | null>(null);
  const startX = useRef<number | null>(null);
  const count = pages.length;
  const clamp = (p: number) => Math.max(0, Math.min(count - 1, p));

  const onDown = (e: React.PointerEvent) => {
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
      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[2] flex justify-center gap-1.5">
        {pages.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Page ${i + 1}`}
            onClick={() => onPageChange(i)}
            className={cn(
              "pointer-events-auto h-[5px] w-[5px] rounded-full transition-colors",
              i === page ? "bg-foreground" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}
