"use client";

import { Users } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { initialsOf, fmtHM, type OnShiftEntry } from "@/components/device";
import type { StoreMember } from "./use-org-members";

export interface DirectoryPanelProps {
  members: StoreMember[];
  forMember: (memberId: string) => OnShiftEntry | null;
  className?: string;
}

export function DirectoryPanel({ members, forMember, className }: DirectoryPanelProps) {
  const t = useT();
  if (members.length === 0) {
    return <EmptyState icon={Users} description={t("storeDevice.noMembers")} className={className} />;
  }
  return (
    <div className={cn("overflow-y-auto", className)}>
      {members.map((m) => {
        const shift = forMember(m.id);
        const tone = !shift ? "neutral" : shift.onBreak ? "warning" : "success";
        const label = !shift ? t("storeDevice.offShift") : shift.onBreak ? t("storeDevice.onBreak") : t("storeDevice.onShift");
        return (
          <div key={m.id} className="grid grid-cols-[36px_1fr_auto] items-center gap-3.5 px-6 py-3 border-b border-border">
            <div className="h-9 w-9 rounded grid place-items-center bg-primary text-primary-foreground text-xs font-semibold">
              {initialsOf(m.displayName)}
            </div>
            <div className="min-w-0">
              <b className="block text-sm font-semibold truncate">{m.displayName || t("storeDevice.unnamed")}</b>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {m.role === "owner"
                  ? t("device.roleOwner")
                  : m.role === "manager"
                    ? t("device.roleManager")
                    : t("device.roleStaff")}
              </span>
            </div>
            <div className="text-right">
              <StatusBadge tone={tone} dot>{label}</StatusBadge>
              {shift && <span className="block text-[11px] text-muted-foreground mt-1 font-mono tabular-nums">{t("storeDevice.since")} {fmtHM(shift.since)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
