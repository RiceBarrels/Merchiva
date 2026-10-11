"use client";

import { BellPlus, BellRing, CalendarDays, Clock, Mail } from "lucide-react";
import { initialsOf, fmtHM, type OnShiftEntry } from "@/components/device";
import { LitePage } from "@/components/device/apps/lite-page";
import { LiteButton, LiteRow } from "@/components/device/apps/lite";
import type { FollowToggle } from "@/components/channel/follow-rules";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { useT } from "@/lib/i18n/context";
import type { MemberRow } from "./use-me";

/** One colleague from the directory, as a page: who they are, whether they are on now, how to reach them. */
export function MemberDetailPage({ member, entry, isMe, followMode, followBusy, onToggleFollow, onClose }: {
  member: MemberRow | null;
  entry: OnShiftEntry | null;
  isMe: boolean;
  followMode: FollowToggle;
  followBusy: boolean;
  onToggleFollow: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const formatDate = useDateFormat();
  const roleLabel = (role: string) =>
    role === "owner" ? t("personalDevice.directory.owner") : role === "manager" ? t("personalDevice.directory.manager") : t("personalDevice.directory.staff");
  const email = member?.email.trim() ?? "";
  const joined = member ? formatDate(member.joinedAt.toDate(), { dateStyle: "medium" }) : "";

  return (
    <LitePage open={member !== null} onClose={onClose} title={member?.displayName ?? ""}>
      {member && (
        <>
          <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4">
            <div className="flex h-16 w-16 flex-none items-center justify-center rounded bg-primary text-[22px] font-semibold text-primary-foreground">
              {initialsOf(member.displayName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[20px] font-semibold leading-tight">
                {member.displayName}
                {isMe && <span className="ml-1 text-[13px] font-medium text-muted-foreground">({t("personalDevice.directory.you")})</span>}
              </p>
              <p className="mt-1 text-[14px] text-muted-foreground">{roleLabel(member.role)}</p>
            </div>
          </div>

          <LiteRow
            icon={Clock}
            iconTone={entry ? (entry.onBreak ? "warning" : "success") : "muted"}
            title={entry ? (entry.onBreak ? t("personalDevice.directory.onBreak") : t("personalDevice.directory.onShift")) : t("personalDevice.directory.off")}
            sub={t("personalDevice.directory.status")}
            right={entry ? `${t("personalDevice.directory.since")} ${fmtHM(entry.since)}` : undefined}
          />

          <LiteRow
            icon={Mail}
            title={email || t("personalDevice.directory.noEmail")}
            sub={t("personalDevice.directory.email")}
            chevron={email !== ""}
            onClick={email ? () => { window.location.href = `mailto:${email}`; } : undefined}
          />

          {joined && <LiteRow icon={CalendarDays} title={joined} sub={t("personalDevice.directory.joined")} />}

          {followMode !== "hidden" && (
            <LiteButton
              icon={followMode === "unfollow" ? BellRing : BellPlus}
              label={followMode === "unfollow" ? t("notify.follow.turnOff") : t("notify.follow.label")}
              tone={followMode === "unfollow" ? "outline" : "primary"}
              busy={followBusy}
              onClick={onToggleFollow}
            />
          )}
        </>
      )}
    </LitePage>
  );
}
