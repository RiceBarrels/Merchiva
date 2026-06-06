"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  Plus,
  X,
  Bell,
  BarChart3,
  Activity,
  ChevronRight,
  Trash2,
  Users,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/context/permissions";
import { useCurrency } from "@/lib/currency";
import { useT } from "@/lib/i18n/context";
import { useSales } from "@/lib/spacetimedb/hooks/useSales";
import { useInventory } from "@/lib/spacetimedb/hooks/useInventory";
import { useStaffing } from "@/lib/spacetimedb/hooks/useStaffing";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";
import {
  useTodos,
  useWasteLogs,
  useNotifications,
} from "@/lib/spacetimedb/hooks";
import {
  addTodo,
  toggleTodo,
  deleteTodo,
  markAllNotificationsRead,
} from "@/lib/spacetimedb/actions";
import type {
  Todo,
  WasteLog,
  AppNotification,
  WasteReason,
  NotificationType,
} from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  return `${hr === 0 ? 12 : hr > 12 ? hr - 12 : hr}:${m} ${ampm}`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function WidgetSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-5 w-24 bg-muted rounded-sm animate-pulse" />
      <div className="h-4 w-full bg-muted rounded-sm animate-pulse" />
      <div className="h-4 w-3/4 bg-muted rounded-sm animate-pulse" />
    </div>
  );
}

function WidgetEmpty({ message }: { message: string }) {
  return (
    <div className="text-xs text-muted-foreground text-center py-4">
      {message}
    </div>
  );
}

// ── Widget Shell ─────────────────────────────────────────────────────────────

export function WidgetCard({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="rounded-[0.3rem] border h-full flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {action && <div className="ml-auto">{action}</div>}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">{children}</CardContent>
    </Card>
  );
}

// ── 1. Sales Today Widget ────────────────────────────────────────────────────

export function SalesTodayWidget() {
  const t = useT();
  const { format } = useCurrency();
  const { organizationId } = usePermissions();
  const { history, isReady } = useSales();

  const today = getToday();
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const todayRecord = useMemo(
    () => history.find((r) => r.date === today),
    [history, today]
  );
  const yesterdayRecord = useMemo(
    () => history.find((r) => r.date === yesterday),
    [history, yesterday]
  );

  const actual = todayRecord?.actual ?? 0;
  const predicted = todayRecord?.predicted ?? 0;
  const yesterdayActual = yesterdayRecord?.actual ?? 0;

  const diff = yesterdayActual > 0 ? ((actual - yesterdayActual) / yesterdayActual) * 100 : 0;
  const isUp = diff > 0;
  const isDown = diff < 0;

  if (!isReady) {
    return (
      <WidgetCard icon={DollarSign} title={t("dashboard.widgets.salesToday.title")}>
        <WidgetSkeleton />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard icon={DollarSign} title={t("dashboard.widgets.salesToday.title")}>
      <div className="space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold font-mono">
            {format(actual, { decimals: 0 })}
          </span>
          {predicted > 0 && (
            <span className="text-xs text-muted-foreground">
              / {format(predicted, { decimals: 0 })} {t("dashboard.widgets.salesToday.predicted")}
            </span>
          )}
        </div>
        {predicted > 0 && (
          <div className="w-full bg-muted rounded-sm h-1.5">
            <div
              className={cn(
                "h-1.5 rounded-sm transition-all",
                actual >= predicted ? "bg-emerald-600" : "bg-amber-500"
              )}
              style={{ width: `${Math.min((actual / predicted) * 100, 100)}%` }}
            />
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs">
          {isUp && <TrendingUp className="h-3 w-3 text-emerald-600" />}
          {isDown && <TrendingDown className="h-3 w-3 text-destructive" />}
          {!isUp && !isDown && <Minus className="h-3 w-3 text-muted-foreground" />}
          <span
            className={cn(
              "font-mono",
              isUp && "text-emerald-600",
              isDown && "text-destructive",
              !isUp && !isDown && "text-muted-foreground"
            )}
          >
            {diff !== 0 ? `${isUp ? "+" : ""}${diff.toFixed(1)}%` : "0%"}
          </span>
          <span className="text-muted-foreground">{t("dashboard.widgets.salesToday.vsYesterday")}</span>
        </div>
      </div>
    </WidgetCard>
  );
}

// ── 2. Inventory Alerts Widget ───────────────────────────────────────────────

export function InventoryAlertsWidget() {
  const t = useT();
  const { organizationId } = usePermissions();
  const { items } = useInventory(organizationId);

  const alertItems = useMemo(
    () =>
      items
        .filter((i) => i.status === "low_stock" || i.status === "out_of_stock")
        .sort((a, b) => a.currentStock - b.currentStock)
        .slice(0, 5),
    [items]
  );

  const lowCount = items.filter((i) => i.status === "low_stock").length;
  const outCount = items.filter((i) => i.status === "out_of_stock").length;
  const totalAlerts = lowCount + outCount;

  return (
    <WidgetCard
      icon={Package}
      title={t("dashboard.widgets.inventoryAlerts.title")}
      action={
        <Link
          href="/~/inventory"
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          {t("dashboard.shifts.viewAll")} <ChevronRight className="h-3 w-3" />
        </Link>
      }
    >
      {totalAlerts === 0 ? (
        <WidgetEmpty message={t("dashboard.widgets.inventoryAlerts.allStocked")} />
      ) : (
        <div className="space-y-2">
          <div className="flex gap-3 text-xs">
            {outCount > 0 && (
              <span className="text-destructive font-medium">
                {t("dashboard.widgets.inventoryAlerts.outOfStock").replace("{count}", String(outCount))}
              </span>
            )}
            {lowCount > 0 && (
              <span className="text-amber-600 font-medium">
                {t("dashboard.widgets.inventoryAlerts.lowStock").replace("{count}", String(lowCount))}
              </span>
            )}
          </div>
          <div className="space-y-1">
            {alertItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5"
              >
                <span className="text-xs truncate flex-1">{item.name}</span>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {item.currentStock} {item.unit}
                </span>
                <Badge
                  variant={item.status === "out_of_stock" ? "destructive" : "outline"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {item.status === "out_of_stock"
                    ? t("dashboard.widgets.inventoryAlerts.outBadge")
                    : t("dashboard.widgets.inventoryAlerts.lowBadge")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

// ── 3. Schedule Overview Widget ──────────────────────────────────────────────

export function ScheduleOverviewWidget() {
  const t = useT();
  const { organizationId } = usePermissions();
  const { shifts } = useStaffing(organizationId, null, false);

  const today = getToday();

  const todayShifts = useMemo(
    () =>
      shifts
        .filter((s) => s.date === today)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [shifts, today]
  );

  const now = useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, []);

  const nextShift = useMemo(
    () => todayShifts.find((s) => s.startTime > now),
    [todayShifts, now]
  );

  // Group by shift type
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    todayShifts.forEach((s) => {
      map[s.shiftType] = (map[s.shiftType] || 0) + 1;
    });
    return map;
  }, [todayShifts]);

  return (
    <WidgetCard
      icon={Clock}
      title={t("dashboard.widgets.scheduleOverview.title")}
      action={
        <Link
          href="/~/personnel"
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          {t("dashboard.shifts.viewAll")} <ChevronRight className="h-3 w-3" />
        </Link>
      }
    >
      {todayShifts.length === 0 ? (
        <WidgetEmpty message={t("dashboard.widgets.scheduleOverview.empty")} />
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-mono">
              {todayShifts.length}
            </span>
            <span className="text-xs text-muted-foreground">
              {todayShifts.length !== 1
                ? t("dashboard.widgets.scheduleOverview.shiftsToday")
                : t("dashboard.widgets.scheduleOverview.shiftToday")}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byType).map(([type, count]) => (
              <div
                key={type}
                className="flex items-center gap-1.5 rounded border border-border px-2 py-1"
              >
                <span className="text-xs capitalize">{type}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {count}
                </span>
              </div>
            ))}
          </div>
          {nextShift && (
            <div className="text-xs text-muted-foreground">
              {t("dashboard.widgets.scheduleOverview.nextLabel")}{" "}
              <span className="font-medium text-foreground">{nextShift.staffName}</span>{" "}
              {t("dashboard.widgets.scheduleOverview.atLabel")}{" "}
              <span className="font-mono">{formatTime(nextShift.startTime)}</span>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// ── 4. Todo Widget ───────────────────────────────────────────────────────────

export function TodoWidget() {
  const t = useT();
  const { organizationId } = usePermissions();
  const [rawTodos] = useTodos();
  const [todoInput, setTodoInput] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todos = useMemo(() => {
    if (!organizationId) return [] as Todo[];
    return rawTodos
      .filter((t) => t.organizationId === organizationId)
      .map((t) => ({
        id: t.id.toString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userId: typeof t.userId === "string" ? t.userId : (t.userId as any)?.toHexString?.() ?? "",
        organizationId: t.organizationId,
        title: t.title,
        completed: t.completed,
        sortOrder: t.sortOrder ?? 0,
        createdAt: String(t.createdAt ?? new Date().toISOString()),
      }))
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }) as Todo[];
  }, [rawTodos, organizationId]);

  const pending = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);
  const shown = [...pending, ...completed].slice(0, 8);

  const userId = useMemo(() => {
    try {
      const token = localStorage.getItem("stdb_token");
      return token ? token.slice(0, 36) : "";
    } catch {
      return "";
    }
  }, []);

  const handleAdd = async () => {
    const title = todoInput.trim();
    if (!title || !userId || !organizationId) return;
    setTodoInput("");
    setAddingTodo(false);
    try {
      await addTodo(userId, organizationId, title);
    } catch (err) {
      console.error("Failed to add todo:", err);
    }
  };

  const handleToggle = async (id: string, completed: boolean) => {
    try {
      await toggleTodo(id, completed);
    } catch (err) {
      console.error("Failed to toggle todo:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTodo(id);
    } catch (err) {
      console.error("Failed to delete todo:", err);
    }
  };

  return (
    <WidgetCard
      icon={CheckCircle2}
      title={t("dashboard.widgets.todo.title")}
      action={
        <button
          onClick={() => {
            setAddingTodo(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          <Plus className="h-3 w-3" /> {t("dashboard.todo.add")}
        </button>
      }
    >
      <div className="space-y-1">
        {addingTodo && (
          <div className="flex gap-1.5 mb-1">
            <input
              ref={inputRef}
              type="text"
              value={todoInput}
              onChange={(e) => setTodoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") {
                  setAddingTodo(false);
                  setTodoInput("");
                }
              }}
              placeholder={t("dashboard.widgets.todo.placeholder")}
              className="flex-1 rounded-[0.3rem] border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleAdd}
              className="rounded-[0.3rem] bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("dashboard.todo.add")}
            </button>
          </div>
        )}
        {shown.length === 0 && !addingTodo ? (
          <WidgetEmpty message={t("dashboard.widgets.todo.empty")} />
        ) : (
          shown.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-center gap-2 rounded border border-border px-2 py-1.5 group",
                t.completed && "opacity-50 border-border/50"
              )}
            >
              <button
                onClick={() => handleToggle(t.id, !t.completed)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {t.completed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </button>
              <span
                className={cn(
                  "flex-1 text-xs truncate",
                  t.completed && "line-through"
                )}
              >
                {t.title}
              </span>
              <button
                onClick={() => handleDelete(t.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
        {todos.length > 8 && (
          <div className="text-[10px] text-muted-foreground text-center pt-1">
            {t("dashboard.widgets.todo.more").replace("{count}", String(todos.length - 8))}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

// ── 5. Waste Cost Widget ─────────────────────────────────────────────────────

const REASON_COLORS: Record<WasteReason, string> = {
  expired: "bg-red-500",
  damaged: "bg-amber-500",
  overproduction: "bg-blue-500",
  other: "bg-stone-400",
};

const REASON_LABELS: Record<WasteReason, string> = {
  expired: "Expired",
  damaged: "Damaged",
  overproduction: "Overproduction",
  other: "Other",
};

export function WasteCostWidget() {
  const t = useT();
  const { format } = useCurrency();
  const { organizationId } = usePermissions();
  const [rawLogs] = useWasteLogs();

  const today = getToday();
  const weekStart = getWeekStart();
  const monthStart = getMonthStart();

  const logs = useMemo(() => {
    if (!organizationId) return [] as WasteLog[];
    return rawLogs
      .filter((l) => l.organizationId === organizationId)
      .map((l) => ({
        id: l.id.toString(),
        organizationId: l.organizationId,
        itemId: l.itemId ?? null,
        itemName: l.itemName,
        quantity: l.quantity,
        unit: l.unit,
        reason: l.reason as WasteReason,
        costPerUnit: l.costPerUnit,
        totalCost: l.totalCost,
        date: l.date,
        notes: l.notes ?? null,
        createdBy: l.createdBy ?? null,
        createdAt: String(l.createdAt ?? l.date),
      })) as WasteLog[];
  }, [rawLogs, organizationId]);

  const todayCost = useMemo(
    () => logs.filter((l) => l.date === today).reduce((s, l) => s + l.totalCost, 0),
    [logs, today]
  );
  const weekCost = useMemo(
    () => logs.filter((l) => l.date >= weekStart).reduce((s, l) => s + l.totalCost, 0),
    [logs, weekStart]
  );
  const monthCost = useMemo(
    () => logs.filter((l) => l.date >= monthStart).reduce((s, l) => s + l.totalCost, 0),
    [logs, monthStart]
  );

  // Reason breakdown for this month
  const byReason = useMemo(() => {
    const map: Record<string, number> = {};
    logs
      .filter((l) => l.date >= monthStart)
      .forEach((l) => {
        map[l.reason] = (map[l.reason] || 0) + l.totalCost;
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [logs, monthStart]);

  return (
    <WidgetCard
      icon={Trash2}
      title={t("dashboard.widgets.wasteCost.title")}
      action={
        <Link
          href="/~/inventory"
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          {t("dashboard.widgets.wasteCost.details")} <ChevronRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[10px] text-muted-foreground">{t("dashboard.widgets.wasteCost.today")}</div>
            <div className="text-sm font-bold font-mono">
              {format(todayCost)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">{t("dashboard.widgets.wasteCost.thisWeek")}</div>
            <div className="text-sm font-bold font-mono">
              {format(weekCost)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">{t("dashboard.widgets.wasteCost.thisMonth")}</div>
            <div className="text-sm font-bold font-mono">
              {format(monthCost)}
            </div>
          </div>
        </div>
        {byReason.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {byReason.map(([reason, cost]) => (
              <div key={reason} className="flex items-center gap-1.5 text-[10px]">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    REASON_COLORS[reason as WasteReason] ?? "bg-stone-400"
                  )}
                />
                <span className="text-muted-foreground">
                  {REASON_LABELS[reason as WasteReason] ?? reason}
                </span>
                <span className="font-mono">{format(cost)}</span>
              </div>
            ))}
          </div>
        )}
        {logs.length === 0 && <WidgetEmpty message={t("dashboard.widgets.wasteCost.empty")} />}
      </div>
    </WidgetCard>
  );
}

// ── 6. Notification Feed Widget ──────────────────────────────────────────────

const NOTIF_ICONS: Record<NotificationType, LucideIcon> = {
  inventory_low: Package,
  shift_trade: Clock,
  time_off: Clock,
  team: Users,
  order: ShoppingCart,
  general: Bell,
};

export function NotificationFeedWidget() {
  const t = useT();
  const { organizationId } = usePermissions();
  const [rawNotifs] = useNotifications();

  const notifications = useMemo(() => {
    if (!organizationId) return [] as AppNotification[];
    return rawNotifs
      .filter((n) => n.organizationId === organizationId && !n.read)
      .map((n) => ({
        id: n.id.toString(),
        organizationId: n.organizationId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        targetId: typeof n.targetId === "string" ? n.targetId : (n.targetId as any)?.toHexString?.() ?? "",
        type: (n.type ?? "general") as NotificationType,
        title: n.title,
        body: n.body ?? "",
        link: n.link ?? null,
        read: n.read,
        createdAt: String(n.createdAt ?? new Date().toISOString()),
      }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 5) as AppNotification[];
  }, [rawNotifs, organizationId]);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
    } catch (err) {
      console.error("Failed to mark all read:", err);
    }
  };

  return (
    <WidgetCard
      icon={Bell}
      title={t("dashboard.widgets.notifications.title")}
      action={
        notifications.length > 0 ? (
          <button
            onClick={handleMarkAllRead}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {t("notifications.markAllRead")}
          </button>
        ) : null
      }
    >
      {notifications.length === 0 ? (
        <WidgetEmpty message={t("dashboard.widgets.notifications.empty")} />
      ) : (
        <div className="space-y-1">
          {notifications.map((n) => {
            const Icon = NOTIF_ICONS[n.type] ?? Bell;
            return (
              <div
                key={n.id}
                className="flex items-start gap-2 rounded border border-border px-2 py-1.5"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{n.title}</p>
                  {n.body && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {n.body}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {timeAgo(n.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

// ── 7. Product Performance Widget ────────────────────────────────────────────

export function ProductPerformanceWidget() {
  const t = useT();
  const { format } = useCurrency();
  const { organizationId } = usePermissions();
  const { products } = useProducts(organizationId);

  const topProducts = useMemo(
    () =>
      [...products]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    [products]
  );

  const maxRevenue = topProducts.length > 0 ? topProducts[0].revenue : 1;

  return (
    <WidgetCard
      icon={BarChart3}
      title={t("dashboard.widgets.topProducts.title")}
      action={
        <Link
          href="/~/products"
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          {t("dashboard.shifts.viewAll")} <ChevronRight className="h-3 w-3" />
        </Link>
      }
    >
      {topProducts.length === 0 ? (
        <WidgetEmpty message={t("dashboard.widgets.topProducts.empty")} />
      ) : (
        <div className="space-y-1.5">
          {topProducts.map((p, i) => (
            <div key={p.id} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-[10px] text-muted-foreground font-mono w-3 shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-xs truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-mono">
                    {format(p.revenue, { decimals: 0 })}
                  </span>
                  {p.trend === "up" && (
                    <TrendingUp className="h-3 w-3 text-emerald-600" />
                  )}
                  {p.trend === "down" && (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  {p.trend === "stable" && (
                    <Minus className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="w-full bg-muted rounded-sm h-1 ml-[18px]">
                <div
                  className="h-1 rounded-sm bg-foreground/20"
                  style={{
                    width: `${Math.max((p.revenue / maxRevenue) * 100, 2)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── 8. Quick Stats Widget ────────────────────────────────────────────────────

export function QuickStatsWidget() {
  const t = useT();
  const { organizationId } = usePermissions();
  const { products } = useProducts(organizationId);
  const { items } = useInventory(organizationId);
  const { shifts } = useStaffing(organizationId, null, false);

  const today = getToday();
  const todayShifts = shifts.filter((s) => s.date === today);
  const uniqueStaff = new Set(todayShifts.map((s) => s.staffName)).size;

  const stats = [
    {
      label: t("dashboard.widgets.quickStats.products"),
      value: products.length,
      icon: ShoppingCart,
    },
    {
      label: t("dashboard.widgets.quickStats.staffOnDuty"),
      value: uniqueStaff,
      icon: Users,
    },
    {
      label: t("dashboard.widgets.quickStats.inventoryItems"),
      value: items.length,
      icon: Package,
    },
    {
      label: t("dashboard.widgets.quickStats.lowStock"),
      value: items.filter((i) => i.status === "low_stock" || i.status === "out_of_stock").length,
      icon: AlertTriangle,
    },
  ];

  return (
    <WidgetCard icon={Activity} title={t("dashboard.widgets.quickStats.title")}>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded border border-border px-2.5 py-2 space-y-0.5"
            >
              <div className="flex items-center gap-1.5">
                <Icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  {s.label}
                </span>
              </div>
              <div className="text-lg font-bold font-mono">{s.value}</div>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}

// ── Widget Registry ──────────────────────────────────────────────────────────

export type WidgetId =
  | "sales-today"
  | "inventory-alerts"
  | "schedule-overview"
  | "todo"
  | "waste-cost"
  | "notification-feed"
  | "product-performance"
  | "quick-stats";

export interface WidgetDef {
  id: WidgetId;
  label: string;
  component: React.ComponentType;
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  { id: "sales-today", label: "Sales Today", component: SalesTodayWidget },
  { id: "inventory-alerts", label: "Inventory Alerts", component: InventoryAlertsWidget },
  { id: "schedule-overview", label: "Schedule Overview", component: ScheduleOverviewWidget },
  { id: "todo", label: "Todos", component: TodoWidget },
  { id: "waste-cost", label: "Waste Cost", component: WasteCostWidget },
  { id: "notification-feed", label: "Notifications", component: NotificationFeedWidget },
  { id: "product-performance", label: "Top Products", component: ProductPerformanceWidget },
  { id: "quick-stats", label: "Quick Stats", component: QuickStatsWidget },
];

export const DEFAULT_WIDGET_ORDER: WidgetId[] = [
  "sales-today",
  "inventory-alerts",
  "schedule-overview",
  "todo",
  "waste-cost",
  "notification-feed",
  "product-performance",
  "quick-stats",
];
