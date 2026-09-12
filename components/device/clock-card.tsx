"use client";

// ClockCard: bordered card with an uppercase header, a big mono value and a
// two-column footnote row. BigClock: centered mono clock + date line.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { fmtBigClock, fmtBigDate, useNow } from "./time";

export interface ClockCardProps {
  title: ReactNode;
  badge?: ReactNode;
  value: ReactNode;
  footLeft?: ReactNode;
  footRight?: ReactNode;
  className?: string;
}

export function ClockCard({ title, badge, value, footLeft, footRight, className }: ClockCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card text-card-foreground", className)}>
      <div className="flex items-center justify-between gap-2 whitespace-nowrap border-b border-border px-[15px] py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        <span className="truncate">{title}</span>
        {badge && <span className="normal-case tracking-normal">{badge}</span>}
      </div>
      <div className="px-[15px] py-3">
        <div className="font-mono text-[26px] font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
        {(footLeft || footRight) && (
          <div className="mt-2 flex justify-between text-[13px]">
            <span>{footLeft}</span>
            <span className="font-mono text-muted-foreground tabular-nums">{footRight}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Big centered mono clock (84–96px) with the "PM · Thu 11 Sep" line under it. */
export function BigClock({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  const now = useNow(1000);
  const { locale } = useI18n();
  return (
    <div className={cn("text-center", className)}>
      <div
        className={cn(
          "font-mono font-semibold leading-none tracking-[-0.03em] tabular-nums",
          size === "lg" ? "text-[96px]" : "text-[84px]",
        )}
      >
        {fmtBigClock(now)}
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {fmtBigDate(now, locale)}
      </div>
    </div>
  );
}
