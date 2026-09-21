"use client";

// Lite "Notifications" app for /store + /personal. The member's last 50
// notifications, newest first, one icon per type; tapping one shows the body
// large in a sheet and marks it read. Device surfaces never navigate to
// /manager, so a notification's `link` is ignored here.
//
// The mark-read reducers look rows up by `ctx.sender`, so they only work
// when the member IS the connection identity (always on /personal; on /store
// only when the PIN operator is the signed-in account). Otherwise the list
// is read-only.

import { useMemo, useState } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CalendarX,
  CheckCheck,
  Info,
  Package,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/spacetimedb/actions";
import { useI18n, useT } from "@/lib/i18n/context";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { LiteButton, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection } from "./lite";
import type { LiteAppProps } from "./types";

// ─── Row shape (cast from generated rows) ──────────────────────────────────

interface NotificationRow {
  id: { toString(): string };
  organizationId: string;
  targetId: { toHexString?: () => string; toString(): string };
  type: string;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  createdAt: unknown;
}

type IconTone = "muted" | "primary" | "success" | "warning" | "destructive";

// Mirrors components/notification-center.tsx / app/manager/notifications
// (type → icon) plus a tone per type; `emergency` is destructive.
const TYPE_META: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  emergency: { icon: AlertTriangle, tone: "destructive" },
  inventory_low: { icon: Package, tone: "warning" },
  shift_trade: { icon: ArrowLeftRight, tone: "primary" },
  time_off: { icon: CalendarX, tone: "primary" },
  team: { icon: Users, tone: "muted" },
  order: { icon: ShoppingBag, tone: "success" },
  general: { icon: Info, tone: "muted" },
};

function identityHex(id: { toHexString?: () => string; toString(): string }): string {
  return typeof id.toHexString === "function" ? id.toHexString() : id.toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventTime(v: any): Date {
  if (!v) return new Date(0);
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.microsSinceUnixEpoch === "bigint") return new Date(Number(v.microsSinceUnixEpoch / 1000n));
  if (typeof v === "object" && "seconds" in v) return new Date(Number(v.seconds) * 1000);
  return new Date(v);
}

/** "2:30 PM" for today, otherwise a short date + time. */
function formatWhen(d: Date, locale: string): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  try {
    return sameDay
      ? d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
      : d.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return d.toISOString();
  }
}

const MAX_ROWS = 50;

export function NotificationsLite({ organizationId, member }: LiteAppProps) {
  const t = useT();
  const { locale } = useI18n();
  const stdb = useSpacetimeDB();
  const [rows, ready] = useTable(tables.notification);
  const [openId, setOpenId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const connectionHex = stdb?.identity ? identityHex(stdb.identity) : null;
  // Whose inbox: the member's identity (PIN operator on /store, signed-in
  // employee on /personal); fall back to the connection identity.
  const myHex = member.userIdHex ?? connectionHex;
  // Reducers filter by ctx.sender, so writes only succeed for the connection's own rows.
  const canMark = !!myHex && myHex === connectionHex;

  const mine = useMemo(() => {
    if (!myHex || !organizationId) return [];
    const list = rows as unknown as NotificationRow[];
    return list
      .filter((n) => n.organizationId === organizationId && identityHex(n.targetId) === myHex)
      .map((n) => ({ n, at: eventTime(n.createdAt) }))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, MAX_ROWS);
  }, [rows, myHex, organizationId]);

  const unread = mine.filter((x) => !x.n.read).length;
  const open = openId ? mine.find((x) => x.n.id.toString() === openId) ?? null : null;

  const openOne = async (item: { n: NotificationRow }) => {
    setOpenId(item.n.id.toString());
    if (!canMark || item.n.read) return;
    try {
      await markNotificationRead(item.n.id.toString());
    } catch (err) {
      console.error("Failed to mark notification read:", err);
      await hapticError();
      toast.error(t("device.lite.notifications.markFailed"));
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await hapticSuccess();
      toast.success(t("device.lite.notifications.allRead"));
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
      await hapticError();
      toast.error(t("device.lite.notifications.markFailed"));
    } finally {
      setMarkingAll(false);
    }
  };

  if (!ready) {
    return (
      <LiteScreen>
        <LiteLoading />
      </LiteScreen>
    );
  }

  return (
    <LiteScreen>
      {canMark && unread > 0 && (
        <LiteButton
          icon={CheckCheck}
          label={t("device.lite.notifications.markAllRead")}
          tone="outline"
          onClick={markAll}
          busy={markingAll}
        />
      )}

      <LiteSection
        title={t("device.lite.notifications.list")}
        right={
          unread > 0 ? (
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {t("device.lite.notifications.unreadCount").replace("{n}", String(unread))}
            </span>
          ) : undefined
        }
      >
        {mine.length === 0 ? (
          <LiteEmpty icon={Bell} title={t("device.lite.notifications.empty")} description={t("device.lite.notifications.emptyHint")} />
        ) : (
          <div className="space-y-2">
            {mine.map(({ n, at }) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.general;
              return (
                <LiteRow
                  key={n.id.toString()}
                  icon={meta.icon}
                  iconTone={meta.tone}
                  title={
                    <span className={cn("inline-flex max-w-full items-center gap-2", n.read && "font-normal")}>
                      {!n.read && <i aria-hidden className="h-2 w-2 flex-none rounded-full bg-primary" />}
                      <span className="truncate">{n.title}</span>
                    </span>
                  }
                  sub={n.body}
                  right={<span className="text-[13px] text-muted-foreground">{formatWhen(at, locale)}</span>}
                  chevron
                  onClick={() => openOne({ n })}
                  className={cn(!n.read && "border-primary/40")}
                />
              );
            })}
          </div>
        )}
      </LiteSection>

      <DeviceDrawer
        open={!!open}
        onOpenChange={(o) => { if (!o) setOpenId(null); }}
        title={t("device.lite.notifications.details")}
        cancelLabel={t("device.lite.notifications.close")}
        maxWidth={480}
      >
        {open && (() => {
          const meta = TYPE_META[open.n.type] ?? TYPE_META.general;
          const Icon = meta.icon;
          return (
            <div className="space-y-4 pb-2">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid h-12 w-12 flex-none place-items-center rounded",
                    meta.tone === "muted" && "bg-muted text-foreground",
                    meta.tone === "primary" && "bg-primary text-primary-foreground",
                    meta.tone === "success" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                    meta.tone === "warning" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                    meta.tone === "destructive" && "bg-destructive/10 text-destructive",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[20px] font-semibold leading-tight">{open.n.title}</div>
                  <div className="mt-1 font-mono text-[13px] tabular-nums text-muted-foreground">{formatWhen(open.at, locale)}</div>
                </div>
              </div>
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-card px-4 py-4 text-[17px] leading-relaxed">
                {open.n.body}
              </p>
            </div>
          );
        })()}
      </DeviceDrawer>
    </LiteScreen>
  );
}
