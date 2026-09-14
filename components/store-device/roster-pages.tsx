"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { parseOpeningHours, dayKeyForDate } from "@/lib/holidays";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { MerchivaLogo } from "@/components/logo";
import { StatusBadge } from "@/components/ui/status-badge";
import { OnWorkRoster, BigClock, ClockCard, type OnShiftEntry } from "@/components/device";

/** Today's closing time ("22:00") from the org's settings row, or null. */
export function useClosingTime(organizationId: string): string | null {
  const [settingsRows] = useTable(tables.settings);
  return useMemo(() => {
    const row = (settingsRows as unknown as Array<{ organizationId: string; openingHours?: string | null }>).find(
      (r) => r.organizationId === organizationId,
    );
    const hours = parseOpeningHours(row?.openingHours ?? null);
    if (!hours) return null;
    const day = hours[dayKeyForDate(new Date())];
    if (!day || day.closed || !day.close) return null;
    return day.close;
  }, [settingsRows, organizationId]);
}

export function StoreClockCard({ orgName, count, closingTime, className }: { orgName: string; count: number; closingTime: string | null; className?: string }) {
  const t = useT();
  return (
    <ClockCard
      className={className}
      title={orgName}
      badge={<StatusBadge tone="success" className="normal-case tracking-normal">{t("storeDevice.open")}</StatusBadge>}
      value={count}
      footLeft={t("storeDevice.onWorkNow")}
      footRight={closingTime ? `${t("storeDevice.closes")} ${closingTime}` : undefined}
    />
  );
}

export interface RosterPagesProps {
  orgName: string;
  entries: OnShiftEntry[];
  closingTime: string | null;
  className?: string;
}

/** Logged-out right pane: chip header + swipeable "On work" | "Clock" pages. */
export function RosterPages({ orgName, entries, closingTime, className }: RosterPagesProps) {
  const t = useT();
  const [page, setPage] = useState(0);
  const [dragX, setDragX] = useState<number | null>(null);
  const startX = useRef<number | null>(null);

  const onDown = (e: ReactPointerEvent) => { startX.current = e.clientX; setDragX(null); };
  const onMove = (e: ReactPointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 12) setDragX(dx);
  };
  const onUp = () => {
    if (startX.current === null) return;
    if (dragX !== null && Math.abs(dragX) > 80) setPage((p) => Math.max(0, Math.min(1, p + (dragX < 0 ? 1 : -1))));
    startX.current = null;
    setDragX(null);
  };

  return (
    <div className={cn("relative grid grid-rows-[54px_1fr] min-h-0 bg-background", className)}>
      <div className="flex items-center justify-between px-6 border-b border-border bg-background z-[2]">
        <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-[13px] font-medium whitespace-nowrap">
          <MerchivaLogo size={14} />
          Merchiva · {orgName}
        </span>
        <StatusBadge tone="success">{entries.length} {t("storeDevice.onWork")}</StatusBadge>
      </div>
      <div
        className="relative overflow-hidden min-h-0 touch-pan-y"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      >
        <div
          className="flex h-full w-[200%]"
          style={{
            transform: `translateX(calc(${-page * 50}% + ${dragX ?? 0}px))`,
            transition: dragX === null ? "transform .32s cubic-bezier(.2,.7,.2,1)" : "none",
          }}
        >
          <div className="w-1/2 h-full flex-none relative overflow-hidden">
            <OnWorkRoster entries={entries} emptyText={t("storeDevice.nobodyOnWork")} className="h-full pb-10" />
          </div>
          <div className="w-1/2 h-full flex-none relative overflow-hidden dark bg-[rgb(10_10_10)] text-[rgb(250_250_250)]">
            <BigClock size="md" className="absolute top-[130px] left-0 right-0" />
            <StoreClockCard
              orgName={orgName}
              count={entries.length}
              closingTime={closingTime}
              className="absolute left-1/2 top-[330px] w-[380px] max-w-[calc(100%-32px)] -translate-x-1/2"
            />
          </div>
        </div>
        <div className="absolute left-0 right-0 bottom-1.5 flex justify-center z-[2]">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`page ${i + 1}`}
              onClick={() => setPage(i)}
              className="grid h-6 w-4 min-h-0! min-w-0! place-items-center"
            >
              <i className={cn("h-[5px] w-[5px] rounded-full", i === page ? (page === 1 ? "bg-[rgb(250_250_250)]" : "bg-foreground") : "bg-border")} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
