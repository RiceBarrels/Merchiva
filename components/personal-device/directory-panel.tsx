"use client";

import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtHM, initialsOf, type OnShiftEntry } from "@/components/device";
import { useT } from "@/lib/i18n/context";
import type { MemberRow } from "./use-me";

export function DirectoryPanel({
  members,
  onShift,
  myMemberId,
}: {
  members: MemberRow[];
  onShift: OnShiftEntry[];
  myMemberId: string | null;
}) {
  const t = useT();
  const sorted = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (sorted.length === 0) {
    return <EmptyState icon={Users} description={t("personalDevice.directory.empty")} />;
  }
  return (
    <div>
      {sorted.map((m) => {
        const id = m.id.toString();
        const entry = onShift.find((e) => e.memberId === id) ?? null;
        const roleLabel = m.role === "owner" ? t("personalDevice.directory.owner") : m.role === "manager" ? t("personalDevice.directory.manager") : t("personalDevice.directory.staff");
        return (
          <div key={id} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-border px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-primary text-[12px] font-semibold text-primary-foreground">
              {initialsOf(m.displayName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">
                {m.displayName}{id === myMemberId && <span className="ml-1 text-[11px] font-medium text-muted-foreground">({t("personalDevice.directory.you")})</span>}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{roleLabel}</p>
            </div>
            <div className="text-right">
              {entry ? (
                <>
                  <StatusBadge tone={entry.onBreak ? "warning" : "success"} dot>
                    {entry.onBreak ? t("personalDevice.directory.onBreak") : t("personalDevice.directory.onShift")}
                  </StatusBadge>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">{t("personalDevice.directory.since")} {fmtHM(entry.since)}</p>
                </>
              ) : (
                <StatusBadge tone="neutral">{t("personalDevice.directory.off")}</StatusBadge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
