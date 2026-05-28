"use client";

import { GraduationCap, PencilRuler, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

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
    <div className="h-14 border-b border-border bg-background flex items-stretch shrink-0">
      <div className="hidden md:flex items-center gap-2 px-5 border-r border-border">
        <GraduationCap className="h-[15px] w-[15px] text-foreground" strokeWidth={1.75} />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-[-0.01em]">{t("nav.training")}</div>
          <div className="text-[10.5px] text-muted-foreground font-mono uppercase tracking-wider">
            {t("training.viewAs")}
          </div>
        </div>
      </div>
      <div className="flex-1 flex">
        {roles.map((r) => {
          const active = r.id === role;
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => r.enabled && onChange(r.id)}
              disabled={!r.enabled}
              className={cn(
                "flex-1 flex items-center gap-3 px-3 md:px-5 transition-colors border-r border-border last:border-r-0 disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "w-8 h-8 rounded-[0.3rem] inline-flex items-center justify-center shrink-0",
                  active ? "bg-background/10" : "bg-muted",
                )}
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} />
              </span>
              <div className="text-left min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13.5px] font-semibold tracking-[-0.01em]">
                    {r.label}
                  </span>
                </div>
                <div
                  className={cn(
                    "text-[11px] truncate hidden md:block",
                    active ? "text-background/70" : "text-muted-foreground",
                  )}
                >
                  {r.sub}
                </div>
              </div>
              {active && (
                <span className="hidden lg:inline ml-auto font-mono text-[10px] uppercase tracking-wider text-background/70 bg-background/10 rounded-[0.3rem] px-1.5 py-0.5">
                  {t("training.role.active")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
