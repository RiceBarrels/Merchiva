"use client";

import { Check, ChevronDown, ChevronUp, GripVertical, Lock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
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

const TYPE_LABEL_KEY: Record<NonNullable<DayRailItem["type"]>, string> = {
  orientation: "training.dayRail.typeOrientation",
  theory: "training.dayRail.typeTheory",
  practice: "training.dayRail.typePractice",
  system: "training.dayRail.typeSystem",
  compliance: "training.dayRail.typeCompliance",
  assessment: "training.dayRail.typeAssessment",
};

export function DayRail({
  days,
  activeId,
  onSelect,
  role,
  traineeProgress,
  internDayNumber,
  onAddDay,
  onReorder,
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
  onReorder?: (id: string, dir: -1 | 1) => void;
  title?: string;
  subtitle?: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold leading-tight truncate">
            {title ?? t("training.curriculumDays")}
          </div>
          <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">
            <span className="font-mono">{days.length}</span> {subtitle ?? t("training.dayRail.days")}
          </div>
        </div>
        {role === "manager" && onAddDay && (
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onAddDay}
            className="text-muted-foreground"
            title={t("training.addDay")}
            aria-label={t("training.addDay")}
          >
            <Plus className="h-[13px] w-[13px]" strokeWidth={1.75} />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {days.length === 0 && (
          <div className="px-3 py-6 text-center text-[11.5px] text-muted-foreground">
            {t("training.dayRail.noDaysYet")}
          </div>
        )}
        {days.map((d, index) => {
          const active = d.id === activeId;
          const done =
            role === "intern" && internDayNumber != null && d.dayNumber < internDayNumber;
          const locked =
            role === "intern" && internDayNumber != null && d.dayNumber > internDayNumber;
          const isCurrent =
            role === "intern" && internDayNumber != null && d.dayNumber === internDayNumber;
          const dotColor = d.type ? TYPE_DOT[d.type] : "#a8a29e";
          const typeLabel = d.type
            ? t(TYPE_LABEL_KEY[d.type])
            : t("training.dayRail.typeGeneral");
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(d.id)}
              className={cn(
                "group w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors mb-0.5",
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
                  {t("training.dayRail.dayAbbrev")}
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
                      · {t("training.dayRail.optional")}
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
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-background bg-foreground">
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
              {role === "manager" && onReorder && (
                <div className="pt-0.5 shrink-0 opacity-0 group-hover:opacity-100 flex flex-col">
                  {index > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={t("training.manager.moveUp")}
                      aria-label={t("training.manager.moveUp")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorder(d.id, -1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onReorder(d.id, -1);
                        }
                      }}
                      className={cn(
                        "rounded hover:bg-background/20",
                        active ? "text-background/60" : "text-muted-foreground",
                      )}
                    >
                      <ChevronUp className="h-[11px] w-[11px]" strokeWidth={1.75} />
                    </span>
                  )}
                  {index < days.length - 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={t("training.manager.moveDown")}
                      aria-label={t("training.manager.moveDown")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorder(d.id, 1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onReorder(d.id, 1);
                        }
                      }}
                      className={cn(
                        "rounded hover:bg-background/20",
                        active ? "text-background/60" : "text-muted-foreground",
                      )}
                    >
                      <ChevronDown className="h-[11px] w-[11px]" strokeWidth={1.75} />
                    </span>
                  )}
                </div>
              )}
              {role === "manager" && !onReorder && (
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
