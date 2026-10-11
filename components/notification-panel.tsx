"use client";

import { ArrowLeftRight, CalendarX, Check, Ban, Clock, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/lib/i18n/context";
import type { ShiftTrade, TimeOffRequest, Shift } from "@/lib/types";

function timeAgo(dateStr: string, t: (key: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("notifications.justNow");
  if (mins < 60) return t("notifications.minutesAgo").replace("{n}", String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("notifications.hoursAgo").replace("{n}", String(hrs));
  return t("notifications.daysAgo").replace("{n}", String(Math.floor(hrs / 24)));
}

interface NotificationPanelProps {
  trades: ShiftTrade[];
  timeOff: TimeOffRequest[];
  shifts: Shift[];
  myMemberId: string | null;
  canEdit: boolean;
  getMemberName: (id: string) => string;
  formatTime: (t: string) => string;
  formatDateShort: (d: string) => string;
  onAcceptTrade: (id: string) => void;
  onDenyTrade: (id: string) => void;
  onManagerApproveTrade: (id: string, approved: boolean) => void;
  onApproveTimeOff: (id: string) => void;
  onDenyTimeOff: (id: string) => void;
}

export function NotificationPanel({
  trades, timeOff, shifts, myMemberId, canEdit,
  getMemberName, formatTime, formatDateShort,
  onAcceptTrade, onDenyTrade, onManagerApproveTrade,
  onApproveTimeOff, onDenyTimeOff,
}: NotificationPanelProps) {
  const t = useT();
  const empty = trades.length === 0 && timeOff.length === 0;

  if (empty) {
    return (
      <EmptyState icon={Inbox} description={t("staffing.requests.noPending")} className="py-16" />
    );
  }

  return (
    <div className="flex flex-col gap-1 px-4 pb-4 pt-2">
      {trades.map((trade) => {
        const shift = shifts.find((s) => s.id === trade.shiftId);
        const requesterName = getMemberName(trade.requesterId);
        const isAcceptedAwaitingManager = trade.status === "accepted" && !trade.managerApproved;
        const isPending = trade.status === "pending";
        const isMyTrade = trade.targetId === myMemberId || (trade.broadcastToAll && trade.requesterId !== myMemberId);

        let description: string;
        if (trade.broadcastToAll && isPending) {
          description = t("notifications.tradeOfferedToEveryone").replace("{name}", requesterName);
        } else if (isPending) {
          description = t("notifications.tradeWantsToTrade").replace("{name}", requesterName);
        } else if (isAcceptedAwaitingManager) {
          const acceptorName = trade.acceptedById ? getMemberName(trade.acceptedById) : t("notifications.someone");
          description = t("notifications.tradeAcceptedAwaitingManager").replace("{name}", acceptorName);
        } else {
          description = t("notifications.tradeFrom").replace("{name}", requesterName);
        }

        return (
          <div key={trade.id} className="flex flex-col gap-1.5 py-2.5">
            <div className="flex items-start gap-2.5">
              <IconTile icon={ArrowLeftRight} size="sm" className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">{description}</p>
                {shift && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDateShort(shift.date)} &middot; {formatTime(shift.startTime)}&ndash;{formatTime(shift.endTime)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  <Clock className="inline h-3 w-3 mr-0.5 -translate-y-[0.5px]" />
                  {timeAgo(trade.createdAt, t)}
                </p>
              </div>
            </div>
            {!canEdit && isPending && isMyTrade && (
              <div className="flex gap-2 ml-9">
                <Button size="sm" variant="outline" onClick={() => onAcceptTrade(trade.id)}>
                  <Check className="h-3.5 w-3.5 mr-1" />{t("staffing.requests.accept")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onDenyTrade(trade.id)}>
                  <Ban className="h-3.5 w-3.5 mr-1" />{t("staffing.requests.deny")}
                </Button>
              </div>
            )}
            {canEdit && isAcceptedAwaitingManager && (
              <div className="flex gap-2 ml-9">
                <Button size="sm" variant="outline" onClick={() => onManagerApproveTrade(trade.id, true)}>
                  <Check className="h-3.5 w-3.5 mr-1" />{t("staffing.requests.approve")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onManagerApproveTrade(trade.id, false)}>
                  <Ban className="h-3.5 w-3.5 mr-1" />{t("staffing.requests.deny")}
                </Button>
              </div>
            )}
            {canEdit && isPending && (
              <p className="text-xs text-muted-foreground ml-9">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t("notifications.waitingForStaff")}</Badge>
              </p>
            )}
            <Separator className="mt-1" />
          </div>
        );
      })}

      {timeOff.map((req) => (
        <div key={req.id} className="flex flex-col gap-1.5 py-2.5">
          <div className="flex items-start gap-2.5">
            <IconTile icon={CalendarX} size="sm" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">
                {t("notifications.requestedTimeOff").replace("{name}", getMemberName(req.userId))}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDateShort(req.startDate)} &ndash; {formatDateShort(req.endDate)}
                {!req.fullDays && req.startTime && req.endTime && (
                  <> &middot; {formatTime(req.startTime)}&ndash;{formatTime(req.endTime)}</>
                )}
              </p>
              {req.comments && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.comments}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 ml-9">
            <Button size="sm" variant="outline" onClick={() => onApproveTimeOff(req.id)}>
              <Check className="h-3.5 w-3.5 mr-1" />{t("staffing.requests.approve")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDenyTimeOff(req.id)}>
              <Ban className="h-3.5 w-3.5 mr-1" />{t("staffing.requests.deny")}
            </Button>
          </div>
          <Separator className="mt-1" />
        </div>
      ))}
    </div>
  );
}
