"use client";

import { Check, GripVertical, Lock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrainingRole } from "./role-switcher";

export interface DayRailItem {
  id: string;
  dayNumber: number;
  title: string;
  mins?: number | null;
  type?: "orientation" | "theory" | "practice" | "system" | "compliance" | "assessment" | null;
  required?: boolean;
}

const TYPE_DOT: Record<NonNullable<DayRailItem["type"]>, string> = {
  orientation: "#a8a29e",
  theory: "oklch(0.55 0.09 55)",
  practice: "#1c1917",
  system: "#0891b2",
  compliance: "#d97706",
  assessment: "#dc2626",
};

const TYPE_LABEL: Record<NonNullable<DayRailItem["type"]>, string> = {
  orientation: "orientation",
  theory: "theory",
  practice: "practice",
  system: "system",
  compliance: "compliance",
  assessment: "assessment",
};

export function DayRail({
  days,
  activeId,
  onSelect,
  role,
  traineeProgress,
  internDayNumber,
  onAddDay,
  title,
  subtitle,
}: {
  days: DayRailItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  role: TrainingRole;
  traineeProgress?: Record<string, string>;
  internDayNumber?: number;
  onAddDay?: () => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold leading-tight truncate">
            {title ?? "Curriculum"}
          </div>
          <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">
            <span className="font-mono">{days.length}</span> {subtitle ?? "days"}
          </div>
        </div>
        {role === "manager" && onAddDay && (
          <button
            type="button"
            onClick={onAddDay}
            className="h-7 w-7 rounded-[0.3rem] border border-border bg-background text-muted-foreground inline-flex items-center justify-center hover:bg-muted"
            title="Add day"
            aria-label="Add day"
          >
            <Plus className="h-[13px] w-[13px]" strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {days.length === 0 && (
          <div className="px-3 py-6 text-center text-[11.5px] text-muted-foreground">
            No days yet
          </div>
        )}
        {days.map((d) => {
          const active = d.id === activeId;
          const done =
            role === "intern" && internDayNumber != null && d.dayNumber < internDayNumber;
          const locked =
            role === "intern" && internDayNumber != null && d.dayNumber > internDayNumber;
          const isCurrent =
            role === "intern" && internDayNumber != null && d.dayNumber === internDayNumber;
          const dotColor = d.type ? TYPE_DOT[d.type] : "#a8a29e";
          const typeLabel = d.type ? TYPE_LABEL[d.type] : "general";
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(d.id)}
              className={cn(
                "group w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-[0.3rem] transition-colors mb-0.5",
                active ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              <div className="flex flex-col items-center pt-0.5 shrink-0 w-7">
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-wider",
                    active ? "text-background/60" : "text-muted-foreground",
                  )}
                >
                  DAY
                </span>
                <span
                  className={cn(
                    "font-mono text-[14px] font-semibold tabular-nums leading-none mt-0.5",
                    active ? "text-background" : "text-foreground",
                  )}
                >
                  {String(d.dayNumber).padStart(2, "0")}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: dotColor }}
                  />
                  <span
                    className={cn(
                      "text-[10px] font-mono uppercase tracking-wider",
                      active ? "text-background/70" : "text-muted-foreground",
                    )}
                  >
                    {typeLabel}
                  </span>
                  {d.required === false && (
                    <span
                      className={cn(
                        "text-[9.5px] font-mono uppercase tracking-wider",
                        active ? "text-background/60" : "text-muted-foreground/70",
                      )}
                    >
                      · optional
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "text-[13px] font-medium leading-tight truncate",
                    active ? "text-background" : "text-foreground",
                  )}
                >
                  {d.title}
                </div>
                <div
                  className={cn(
                    "flex items-center gap-2 mt-1 text-[10.5px]",
                    active ? "text-background/60" : "text-muted-foreground",
                  )}
                >
                  {d.mins != null && (
                    <span className="font-mono tabular-nums">{d.mins}m</span>
                  )}
                  {role === "trainer" && traineeProgress && (
                    <>
                      {d.mins != null && <span>·</span>}
                      <span className="font-mono">
                        {traineeProgress[d.id] ?? "0/0"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {role === "intern" && (
                <div className="pt-0.5 shrink-0">
                  {done && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white">
                      <Check className="h-[10px] w-[10px]" strokeWidth={2.5} />
                    </span>
                  )}
                  {isCurrent && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-background bg-stone-700">
                      <span className="w-1 h-1 rounded-full bg-background" />
                    </span>
                  )}
                  {locked && (
                    <Lock
                      className="h-[11px] w-[11px] text-muted-foreground"
                      strokeWidth={1.75}
                    />
                  )}
                </div>
              )}
              {role === "manager" && (
                <div className="pt-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                  <GripVertical
                    className={cn(
                      "h-[11px] w-[11px]",
                      active ? "text-background/60" : "text-muted-foreground",
                    )}
                    strokeWidth={1.75}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
