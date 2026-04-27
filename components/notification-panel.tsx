"use client";

import { ArrowLeftRight, CalendarX, Check, Ban, Clock, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ShiftTrade, TimeOffRequest, Shift } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface NotificationPanelProps {
  trades: ShiftTrade[];
  timeOff: TimeOffRequest[];
  shifts: Shift[];
  myMemberId: string | null;
  isStaff: boolean;
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
  trades, timeOff, shifts, myMemberId, isStaff,
  getMemberName, formatTime, formatDateShort,
  onAcceptTrade, onDenyTrade, onManagerApproveTrade,
  onApproveTimeOff, onDenyTimeOff,
}: NotificationPanelProps) {
  const empty = trades.length === 0 && timeOff.length === 0;

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No notifications</p>
      </div>
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
          description = `${requesterName} is offering their shift to everyone`;
        } else if (isPending) {
          description = `${requesterName} wants to trade with you`;
        } else if (isAcceptedAwaitingManager) {
          const acceptorName = trade.acceptedById ? getMemberName(trade.acceptedById) : "Someone";
          description = `${acceptorName} accepted — awaiting manager approval`;
        } else {
          description = `Trade from ${requesterName}`;
        }

        return (
          <div key={trade.id} className="flex flex-col gap-1.5 py-2.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">{description}</p>
                {shift && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDateShort(shift.date)} &middot; {formatTime(shift.startTime)}&ndash;{formatTime(shift.endTime)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  <Clock className="inline h-3 w-3 mr-0.5 -translate-y-[0.5px]" />
                  {timeAgo(trade.createdAt)}
                </p>
              </div>
            </div>
            {isStaff && isPending && isMyTrade && (
              <div className="flex gap-2 ml-9">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAcceptTrade(trade.id)}>
                  <Check className="h-3.5 w-3.5 mr-1" />Accept
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDenyTrade(trade.id)}>
                  <Ban className="h-3.5 w-3.5 mr-1" />Deny
                </Button>
              </div>
            )}
            {!isStaff && isAcceptedAwaitingManager && (
              <div className="flex gap-2 ml-9">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onManagerApproveTrade(trade.id, true)}>
                  <Check className="h-3.5 w-3.5 mr-1" />Approve
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onManagerApproveTrade(trade.id, false)}>
                  <Ban className="h-3.5 w-3.5 mr-1" />Deny
                </Button>
              </div>
            )}
            {!isStaff && isPending && (
              <p className="text-xs text-muted-foreground ml-9">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Waiting for staff</Badge>
              </p>
            )}
            <Separator className="mt-1" />
          </div>
        );
      })}

      {timeOff.map((req) => (
        <div key={req.id} className="flex flex-col gap-1.5 py-2.5">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
              <CalendarX className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">
                {getMemberName(req.userId)} requested time off
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
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onApproveTimeOff(req.id)}>
              <Check className="h-3.5 w-3.5 mr-1" />Approve
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDenyTimeOff(req.id)}>
              <Ban className="h-3.5 w-3.5 mr-1" />Deny
            </Button>
          </div>
          <Separator className="mt-1" />
        </div>
      ))}
    </div>
  );
}
