"use client";

import { useMemo } from "react";
import {
  Bell,
  Package,
  ArrowLeftRight,
  CalendarX,
  Users,
  ShoppingBag,
  Info,
  X,
  CheckCheck,
  Inbox,
  FileText,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { useSpacetimeDB } from "spacetimedb/react";
import { useNotifications } from "@/lib/spacetimedb/hooks";
import { usePermissions } from "@/lib/context/permissions";
import {
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@/lib/types";

function timeAgo(dateStr: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("notifications.justNow");
  if (mins < 60) return t("notifications.minutesAgo").replace("{n}", String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("notifications.hoursAgo").replace("{n}", String(hrs));
  return t("notifications.daysAgo").replace("{n}", String(Math.floor(hrs / 24)));
}

const typeIcon: Record<NotificationType, typeof Bell> = {
  inventory_low: Package,
  shift_trade: ArrowLeftRight,
  time_off: CalendarX,
  team: Users,
  order: ShoppingBag,
  general: Info,
};

// Docs notifications (WP-4 server types, not part of NotificationType).
const docTypeIcon: Readonly<Record<string, typeof Bell>> = {
  doc_comment: MessageSquare,
  doc_share: FileText,
};

export function useUnreadCount(): number {
  const stdb = useSpacetimeDB();
  const [notifications] = useNotifications();
  const { organizationId } = usePermissions();
  const identity = stdb?.identity;

  return useMemo(() => {
    if (!identity || !organizationId) return 0;
    return notifications.filter(
      (n) =>
        n.organizationId === organizationId &&
        n.targetId.toString() === identity.toString() &&
        !n.read
    ).length;
  }, [notifications, identity, organizationId]);
}

export function NotificationCenter({ onNavigate }: { onNavigate?: (href: string) => void } = {}) {
  const t = useT();
  const stdb = useSpacetimeDB();
  const [notifications] = useNotifications();
  const { organizationId } = usePermissions();
  const identity = stdb?.identity;

  const myNotifications = useMemo(() => {
    if (!identity || !organizationId) return [];
    return notifications
      .filter(
        (n) =>
          n.organizationId === organizationId &&
          n.targetId.toString() === identity.toString()
      )
      .sort((a, b) => {
        const ta = typeof a.createdAt === "object" && "seconds" in (a.createdAt as object)
          ? (a.createdAt as unknown as { seconds: number }).seconds * 1000
          : new Date(String(a.createdAt)).getTime();
        const tb = typeof b.createdAt === "object" && "seconds" in (b.createdAt as object)
          ? (b.createdAt as unknown as { seconds: number }).seconds * 1000
          : new Date(String(b.createdAt)).getTime();
        return tb - ta;
      });
  }, [notifications, identity, organizationId]);

  const unreadCount = myNotifications.filter((n) => !n.read).length;

  if (myNotifications.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t("notifications.empty")}
        description={t("notifications.emptyDesc")}
        className="py-16"
      />
    );
  }

  return (
    <div className="flex flex-col">
      {unreadCount > 0 && (
        <div className="flex items-center justify-end px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => markAllNotificationsRead().catch(console.error)}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            {t("notifications.markAllRead")}
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-0.5 px-4 pb-4">
        {myNotifications.map((notif) => {
          const Icon = typeIcon[(notif.type as NotificationType) || "general"] ?? docTypeIcon[notif.type] ?? Info;
          const createdStr =
            typeof notif.createdAt === "object" && "seconds" in (notif.createdAt as object)
              ? new Date((notif.createdAt as unknown as { seconds: number }).seconds * 1000).toISOString()
              : String(notif.createdAt);

          return (
            <div
              key={notif.id.toString()}
              className={cn(
                "flex items-start gap-2.5 py-2.5 rounded-lg px-1 transition-colors",
                !notif.read && "bg-muted/50"
              )}
            >
              <IconTile icon={Icon} size="sm" className="mt-0.5" />
              <button
                type="button"
                className="flex-1 min-w-0 text-left"
                onClick={() => {
                  if (!notif.read) {
                    markNotificationRead(notif.id.toString()).catch(console.error);
                  }
                  if (notif.link) {
                    if (onNavigate) onNavigate(notif.link);
                    else window.location.href = notif.link;
                  }
                }}
              >
                <p className={cn("text-sm leading-tight", !notif.read ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {notif.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{timeAgo(createdStr, t)}</p>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="mt-1 text-muted-foreground/50 hover:text-muted-foreground"
                onClick={() => dismissNotification(notif.id.toString()).catch(console.error)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
