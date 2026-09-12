"use client";

// Scrollable list rows: avatar tile · name / role · elapsed / "since HH:MM".

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { fmtDurationHM, fmtHM, useNow } from "./time";
import type { OnShiftEntry } from "./types";

export interface OnWorkRosterProps {
  entries: OnShiftEntry[];
  emptyText?: string;
  className?: string;
}

export function OnWorkRoster({ entries, emptyText, className }: OnWorkRosterProps) {
  const t = useT();
  const now = useNow(15000);
  return (
    <div className={cn("h-full overflow-y-auto pb-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {entries.length === 0 && (
        <div className="flex min-h-[160px] items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
          {emptyText ?? t("device.nobodyOnWork")}
        </div>
      )}
      {entries.map((e) => (
        <div key={e.memberId} className="grid grid-cols-[36px_1fr_auto] items-center gap-3.5 border-b border-border px-6 py-[13px]">
          <div className="grid h-9 w-9 place-items-center rounded bg-primary text-[12px] font-semibold text-primary-foreground">
            {e.initials}
          </div>
          <div className="min-w-0">
            <b className="block truncate text-[14px] font-semibold">{e.name}</b>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">
              {e.roleLabel}
              {e.onBreak && ` · ${t("device.onBreak")}`}
            </span>
          </div>
          <div className="text-right">
            <b className="block font-mono text-[14px] font-semibold tabular-nums">{fmtDurationHM(now.getTime() - e.since.getTime())}</b>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {t("device.since")} {fmtHM(e.since)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
