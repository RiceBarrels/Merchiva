"use client";

import { useState } from "react";
import { BellPlus, BellRing, ChevronRight, Users } from "lucide-react";
import { useSpacetimeDB } from "spacetimedb/react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtHM, initialsOf, type OnShiftEntry } from "@/components/device";
import { useFollowControl } from "@/components/channel/follow";
import { usePermissions } from "@/lib/context/permissions";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { MemberDetailPage } from "./member-detail";
import { identityHex, type MemberRow } from "./use-me";

export function DirectoryPanel({
  members,
  onShift,
  myMemberId,
  follows = true,
}: {
  members: MemberRow[];
  onShift: OnShiftEntry[];
  myMemberId: string | null;
  /** Offer special follows: off on a store tablet, where a follow would be the tablet account's. */
  follows?: boolean;
}) {
  const t = useT();
  const stdb = useSpacetimeDB();
  const { organizationId } = usePermissions();
  // Special follow (特别关注). A phone is one person's, so the follows are theirs; a store tablet offers none.
  const follow = useFollowControl(organizationId ?? null, follows);
  const selfHex = stdb?.identity ? identityHex(stdb.identity) : null;
  const [openId, setOpenId] = useState<string | null>(null);
  const followModeOf = (m: MemberRow) => {
    const id = m.id.toString();
    const hex = identityHex(m.userId);
    return follow.toggleFor(hex, true, [selfHex, id === myMemberId ? hex : null]);
  };
  const sorted = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName));
  // Looked up live, so the page follows a rename or a shift change; it closes if they leave.
  const opened = openId ? sorted.find((m) => m.id.toString() === openId) ?? null : null;
  if (sorted.length === 0) {
    return <EmptyState icon={Users} description={t("personalDevice.directory.empty")} />;
  }
  return (
    <div>
      {follow.available && (
        <p className="flex items-start gap-2 border-b border-border px-4 py-3 text-[13px] leading-snug text-muted-foreground">
          <BellPlus className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>{t("notify.follow.directoryHint")}</span>
        </p>
      )}
      {sorted.map((m) => {
        const id = m.id.toString();
        const hex = identityHex(m.userId);
        const entry = onShift.find((e) => e.memberId === id) ?? null;
        const roleLabel = m.role === "owner" ? t("personalDevice.directory.owner") : m.role === "manager" ? t("personalDevice.directory.manager") : t("personalDevice.directory.staff");
        const mode = followModeOf(m);
        const following = mode === "unfollow";
        return (
          <div key={id} className={cn("grid items-center gap-3 border-b border-border pe-4", follow.available ? "grid-cols-[1fr_auto]" : "grid-cols-[1fr]")}>
            <button
              type="button"
              onClick={() => { hapticLight(); setOpenId(id); }}
              className="grid min-w-0 grid-cols-[36px_1fr_auto_16px] items-center gap-3 py-3 ps-4 text-start active:bg-muted"
            >
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
              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" aria-hidden />
            </button>
            {follow.available && (mode === "hidden" ? (
              <span className="h-10 w-10" aria-hidden />
            ) : (
              <button
                type="button"
                disabled={follow.busy(hex)}
                aria-pressed={following}
                aria-label={t("notify.follow.label")}
                title={following ? t("notify.follow.turnOff") : fmt(t("notify.follow.hint"), { name: m.displayName })}
                onClick={() => { hapticLight(); follow.toggle(hex, m.displayName); }}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors active:translate-y-px disabled:opacity-50",
                  following ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground active:bg-muted",
                )}
              >
                {following ? <BellRing className="h-5 w-5" /> : <BellPlus className="h-5 w-5" />}
              </button>
            ))}
          </div>
        );
      })}
      <MemberDetailPage
        member={opened}
        entry={opened ? onShift.find((e) => e.memberId === openId) ?? null : null}
        isMe={openId !== null && openId === myMemberId}
        followMode={opened && follow.available ? followModeOf(opened) : "hidden"}
        followBusy={opened ? follow.busy(identityHex(opened.userId)) : false}
        onToggleFollow={() => { if (opened) { hapticLight(); follow.toggle(identityHex(opened.userId), opened.displayName); } }}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
