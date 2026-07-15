"use client";

import { GraduationCap, PencilRuler, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { hapticLight } from "@/lib/haptics";

export type TrainingRole = "manager" | "trainer" | "intern";

export function TrainingRoleSwitcher({
  role,
  onChange,
  canManage,
  canGrade,
}: {
  role: TrainingRole;
  onChange: (r: TrainingRole) => void;
  canManage: boolean;
  canGrade: boolean;
}) {
  const t = useT();
  const roles = [
    {
      id: "manager" as const,
      label: t("training.role.manager"),
      sub: t("training.role.managerSub"),
      icon: PencilRuler,
      enabled: canManage,
    },
    {
      id: "trainer" as const,
      label: t("training.role.trainer"),
      sub: t("training.role.trainerSub"),
      icon: Award,
      enabled: canGrade,
    },
    {
      id: "intern" as const,
      label: t("training.role.intern"),
      sub: t("training.role.internSub"),
      icon: GraduationCap,
      enabled: true,
    },
  ];

  return (
    <div className="h-12 md:h-14 border-b border-border bg-background flex items-stretch shrink-0">
      <div className="hidden md:flex items-center gap-2 px-5 border-r border-border">
        <GraduationCap className="h-[15px] w-[15px] text-foreground" strokeWidth={1.75} />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-[-0.01em]">{t("nav.training")}</div>
          <div className="text-[10.5px] text-muted-foreground font-mono uppercase tracking-wider">
            {t("training.viewAs")}
          </div>
        </div>
      </div>
      <div className="flex-1 flex min-w-0">
        {roles.map((r) => {
          const active = r.id === role;
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => {
                if (!r.enabled) return;
                hapticLight();
                onChange(r.id);
              }}
              disabled={!r.enabled}
              className={cn(
                "flex-1 min-w-0 flex items-center gap-2 lg:gap-2.5 px-3 lg:px-4 transition-colors border-r border-border last:border-r-0 relative rounded-t-[0.3rem] disabled:cursor-not-allowed disabled:opacity-50",
                active ? "bg-muted" : "bg-background hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "w-7 h-7 lg:w-8 lg:h-8 rounded-[0.3rem] inline-flex items-center justify-center shrink-0",
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-[14px] w-[14px]" strokeWidth={1.75} />
              </span>
              <div className="text-left min-w-0">
                <div
                  className={cn(
                    "text-[12.5px] md:text-[13.5px] font-semibold tracking-[-0.01em] truncate",
                    active
                      ? "text-foreground"
                      : "text-stone-700 dark:text-stone-200",
                  )}
                >
                  {r.label}
                </div>
                <div
                  className={cn(
                    "text-[11px] truncate hidden lg:block",
                    active ? "text-muted-foreground" : "text-muted-foreground/80",
                  )}
                >
                  {r.sub}
                </div>
              </div>
              {active && (
                <span className="hidden lg:inline ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground bg-background border border-border rounded-[0.3rem] px-1.5 py-0.5">
                  {t("training.role.active")}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
