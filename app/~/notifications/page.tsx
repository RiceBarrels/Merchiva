"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { PageHeader } from "@/components/page-header";
import type { NotificationType } from "@/lib/types";

type FilterKey = "all" | NotificationType;

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  inventory_low: Package,
  shift_trade: ArrowLeftRight,
  time_off: CalendarX,
  team: Users,
  order: ShoppingBag,
  general: Info,
};

const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: "all", labelKey: "notifications.filterAll" },
  { key: "shift_trade", labelKey: "notifications.filterShift" },
  { key: "time_off", labelKey: "notifications.filterTimeOff" },
  { key: "team", labelKey: "notifications.filterTeam" },
  { key: "inventory_low", labelKey: "notifications.filterInventory" },
  { key: "order", labelKey: "notifications.filterOrder" },
  { key: "general", labelKey: "notifications.filterGeneral" },
];

function timeAgo(dateStr: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("notifications.justNow");
  if (mins < 60) return t("notifications.minutesAgo").replace("{n}", String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("notifications.hoursAgo").replace("{n}", String(hrs));
  return t("notifications.daysAgo").replace("{n}", String(Math.floor(hrs / 24)));
}

function createdAtIso(raw: unknown): string {
  if (raw && typeof raw === "object" && "seconds" in (raw as object)) {
    return new Date((raw as { seconds: number }).seconds * 1000).toISOString();
  }
  return String(raw);
}

export default function NotificationsPage() {
  const t = useT();
  const stdb = useSpacetimeDB();
  const [notifications] = useNotifications();
  const { organizationId } = usePermissions();
  const identity = stdb?.identity;
  const [filter, setFilter] = useState<FilterKey>("all");

  const mine = useMemo(() => {
    if (!identity || !organizationId) return [];
    return notifications
      .filter(
        (n) =>
          n.organizationId === organizationId &&
          n.targetId.toString() === identity.toString()
      )
      .sort((a, b) => {
        const ta = new Date(createdAtIso(a.createdAt)).getTime();
        const tb = new Date(createdAtIso(b.createdAt)).getTime();
        return tb - ta;
      });
  }, [notifications, identity, organizationId]);

  const countsByType = useMemo(() => {
    const map: Partial<Record<FilterKey, number>> = { all: mine.length };
    for (const n of mine) {
      const k = (n.type as NotificationType) || "general";
      map[k] = (map[k] ?? 0) + 1;
    }
    return map;
  }, [mine]);

  const visible = useMemo(() => {
    if (filter === "all") return mine;
    return mine.filter((n) => (n.type as NotificationType) === filter);
  }, [mine, filter]);

  const unreadCount = mine.filter((n) => !n.read).length;

  return (
    <div className="pb-24">
      <PageHeader
        title={t("notifications.title")}
        subtitle={
          unreadCount > 0
            ? t("notifications.unreadCount").replace("{n}", String(unreadCount))
            : t("notifications.emptyDesc")
        }
        actions={
          unreadCount > 0
            ? [
                {
                  icon: <CheckCheck className="h-[18px] w-[18px]" />,
                  onClick: () =>
                    markAllNotificationsRead().catch(console.error),
                },
              ]
            : undefined
        }
        right={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => markAllNotificationsRead().catch(console.error)}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              {t("notifications.markAllRead")}
            </Button>
          ) : undefined
        }
      />

      {/* Filter chips — horizontal scroll on mobile */}
      <div className="border-b border-border bg-background">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const count = countsByType[f.key] ?? 0;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-[0.4rem] border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {t(f.labelKey)}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] leading-[14px] font-semibold tabular-nums",
                      active
                        ? "bg-background/15 text-background"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Inbox className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium text-foreground">
            {t("notifications.empty")}
          </p>
          <p className="text-xs mt-1">{t("notifications.emptyDesc")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visible.map((n) => {
            const Icon = TYPE_ICON[(n.type as NotificationType) || "general"] ?? Info;
            const created = createdAtIso(n.createdAt);
            return (
              <div
                key={n.id.toString()}
                className={cn(
                  "flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40",
                  !n.read && "bg-muted/30"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.4rem] border",
                    !n.read
                      ? "bg-foreground text-background border-foreground"
                      : "bg-muted text-muted-foreground border-border"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => {
                    if (!n.read) {
                      markNotificationRead(n.id.toString()).catch(console.error);
                    }
                    if (n.link) window.location.href = n.link;
                  }}
                >
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        "text-sm leading-tight truncate",
                        !n.read
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {n.title}
                    </p>
                    {!n.read && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                        aria-hidden
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {n.body}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground/70 mt-1">
                    {timeAgo(created, t)}
                  </p>
                </button>
                <button
                  type="button"
                  className="mt-1 p-1.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={t("notifications.dismiss")}
                  onClick={() =>
                    dismissNotification(n.id.toString()).catch(console.error)
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
