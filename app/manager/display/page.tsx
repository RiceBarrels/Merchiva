"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Maximize,
  Monitor,
  UtensilsCrossed,
  BarChart3,
  Check,
  Clock,
  AlertTriangle,
  Package,
  Users,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge, STATUS_TONE_TEXT, type StatusTone } from "@/components/ui/status-badge";
import { useT } from "@/lib/i18n/context";
import { useCurrency } from "@/lib/currency";
import { usePermissions } from "@/lib/context/permissions";
import {
  useSiteOrders,
  useProducts,
  usePayments,
  useSalesRecords,
  useShifts,
  useInventoryItems,
  useQueueEntries,
} from "@/lib/spacetimedb/hooks";
import { updateOrderStatus } from "@/lib/spacetimedb/actions";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

type DisplayMode = "kitchen" | "menu" | "kpi";

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

// ─── Clock Component ────────────────────────────────────────────────────────

function DisplayClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <span className="font-mono text-sm text-muted-foreground tabular-nums">
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

// ─── Kitchen Display (KDS) ──────────────────────────────────────────────────

function KitchenDisplay() {
  const t = useT();
  const orders = useSiteOrders();
  const [completingId, setCompletingId] = useState<string | null>(null);

  const pendingOrders = useMemo(() => {
    if (!orders) return [];
    return Array.from(orders)
      .filter((o) => {
        const s = (o as { status?: string }).status;
        return s === "pending" || s === "confirmed";
      })
      .sort((a, b) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aTime = new Date((a as any).createdAt).getTime();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bTime = new Date((b as any).createdAt).getTime();
        return aTime - bTime;
      });
  }, [orders]);

  const getAgeMinutes = useCallback((createdAt: string) => {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  }, []);

  const getAgeColor = useCallback((minutes: number) => {
    if (minutes < 5) return "border-emerald-500 bg-emerald-500/10";
    if (minutes <= 15) return "border-amber-500 bg-amber-500/10";
    return "border-red-500 bg-red-500/10";
  }, []);

  const getAgeBadgeColor = useCallback((minutes: number) => {
    if (minutes < 5) return "bg-emerald-500 text-white";
    if (minutes <= 15) return "bg-amber-500 text-white";
    return "bg-destructive text-white";
  }, []);

  const handleComplete = async (orderId: string) => {
    setCompletingId(orderId);
    try {
      await updateOrderStatus(orderId, "completed");
      toast.success(t("display.orderCompleted"));
    } catch (err) {
      console.error("Failed to complete order:", err);
      toast.error(t("display.orderCompleteFailed"));
    } finally {
      setCompletingId(null);
    }
  };

  const parseItems = (items: unknown): OrderItem[] => {
    if (!items) return [];
    if (typeof items === "string") {
      try { return JSON.parse(items); } catch { return []; }
    }
    if (Array.isArray(items)) return items as OrderItem[];
    return [];
  };

  if (pendingOrders.length === 0) {
    return (
      <EmptyState
        className="flex-1"
        icon={UtensilsCrossed}
        title={t("display.noOrders")}
        description={t("display.waitingForOrders")}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {pendingOrders.map((order) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const o = order as any;
          const ageMin = getAgeMinutes(o.createdAt);
          const items = parseItems(o.items);
          const orderId = typeof o.id === "object" && o.id?.toHexString ? o.id.toHexString().slice(0, 6).toUpperCase() : String(o.id).slice(0, 6).toUpperCase();

          return (
            <div
              key={String(o.id)}
              className={cn(
                "rounded-lg border-2 flex flex-col overflow-hidden transition-colors",
                getAgeColor(ageMin),
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold font-mono tabular-nums text-foreground">
                    #{orderId}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded text-xs font-bold uppercase tabular-nums", getAgeBadgeColor(ageMin))}>
                    {ageMin}m
                  </span>
                </div>
                <StatusBadge tone={o.status === "pending" ? "warning" : "info"} className="font-mono uppercase">
                  {o.status}
                </StatusBadge>
              </div>

              {/* Customer */}
              {o.customerName && (
                <div className="px-4 py-2 text-base font-medium border-b border-border text-foreground">
                  {o.customerName}
                </div>
              )}

              {/* Items */}
              <div className="flex-1 px-4 py-3 space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="text-lg font-bold font-mono tabular-nums min-w-[2rem] text-center rounded px-1 bg-muted text-foreground">
                      {item.quantity}x
                    </span>
                    <span className="text-lg font-medium flex-1 text-foreground">
                      {item.name}
                    </span>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-sm italic text-muted-foreground">
                    {t("display.noItems")}
                  </p>
                )}
              </div>

              {/* Notes */}
              {o.notes && (
                <div className="px-4 py-2 text-sm italic border-t border-border bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {o.notes}
                </div>
              )}

              {/* Complete button */}
              <Button
                variant="ghost"
                onClick={() => handleComplete(String(o.id))}
                disabled={completingId === String(o.id)}
                className="h-auto w-full gap-2 rounded-none border-t border-border bg-muted px-4 py-4 text-lg font-bold text-emerald-700 hover:bg-emerald-500 hover:text-white active:bg-emerald-600 dark:text-emerald-400 [&_svg:not([class*='size-'])]:size-6"
              >
                <Check className="h-6 w-6" />
                {t("display.complete")}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Menu Board ─────────────────────────────────────────────────────────────

function MenuBoard() {
  const t = useT();
  const { format } = useCurrency();
  const [products] = useProducts() as [unknown[], boolean];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(true);

  const productList = useMemo(() => {
    if (!products) return [];
    return Array.from(products)
      .filter((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prod = p as any;
        return prod.retailEnabled === true && Number(prod.retailPrice ?? 0) > 0;
      })
      .map((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prod = p as any;
        return {
          id: prod.id,
          name: prod.name,
          category: prod.category,
          description: prod.retailDescription ?? prod.description,
          imageUrl: prod.retailImageUrl,
          price: Number(prod.retailPrice ?? 0),
        };
      });
  }, [products]);

  const categories = useMemo(() => {
    const catMap = new Map<string, typeof productList>();
    for (const p of productList) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cat = (p as any).category || t("display.uncategorized");
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(p);
    }
    return catMap;
  }, [productList, t]);

  // Auto-scroll carousel
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    const iv = setInterval(() => {
      if (!autoScrollRef.current || !el) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ top: 2, behavior: "auto" });
      }
    }, 50);
    return () => clearInterval(iv);
  }, [autoScroll]);

  // Pause on interaction
  const handleInteraction = useCallback(() => {
    setAutoScroll(false);
    const timeout = setTimeout(() => setAutoScroll(true), 10000);
    return () => clearTimeout(timeout);
  }, []);

  if (productList.length === 0) {
    return (
      <EmptyState className="flex-1" icon={ShoppingCart} title={t("display.noProducts")} />
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto p-6"
      onMouseMove={handleInteraction}
      onTouchStart={handleInteraction}
    >
      {Array.from(categories.entries()).map(([category, prods]) => (
        <div key={category} className="mb-8">
          <h2 className="text-2xl font-bold mb-4 pb-2 border-b border-border text-foreground">
            {category}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {prods.map((p) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const prod = p as any;
              return (
                <div
                  key={String(prod.id)}
                  className="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
                >
                  {prod.imageUrl && (
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-foreground">
                        {prod.name}
                      </h3>
                      {prod.description && (
                        <p className="text-sm mt-1 line-clamp-2 text-muted-foreground">
                          {prod.description}
                        </p>
                      )}
                    </div>
                    <p className="text-3xl font-bold font-mono tabular-nums mt-3 text-foreground">
                      {format(Number(prod.price))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── KPI Dashboard ──────────────────────────────────────────────────────────

// Kiosk-sized KPI tile: keeps the large read-from-across-the-room value but
// uses design tokens (StatTile is too dense for a wall display).
function KpiMetricCard({
  label,
  value,
  icon: Icon,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  tone?: StatusTone;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 flex flex-col items-center justify-center text-center">
      <Icon className={cn("h-8 w-8 mb-3", STATUS_TONE_TEXT[tone])} />
      <p className="text-6xl font-bold font-mono tabular-nums leading-none text-foreground">
        {value}
      </p>
      <p className="text-lg font-medium mt-3 text-muted-foreground">
        {label}
      </p>
      {sub && (
        <p className="text-sm mt-1 text-muted-foreground">
          {sub}
        </p>
      )}
    </div>
  );
}

function KpiDashboard() {
  const t = useT();
  const { format } = useCurrency();
  const payments = usePayments();
  const salesRecords = useSalesRecords();
  const shifts = useShifts();
  const inventoryItems = useInventoryItems();
  const queueEntries = useQueueEntries();
  const orders = useSiteOrders();

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const metrics = useMemo(() => {
    // Today's sales total
    let todaySales = 0;
    let todayOrderCount = 0;
    if (payments) {
      for (const p of payments) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pay = p as any;
        if (pay.status === "completed" && pay.createdAt) {
          const payDate = typeof pay.createdAt === "string"
            ? pay.createdAt.slice(0, 10)
            : new Date(pay.createdAt).toISOString().slice(0, 10);
          if (payDate === today) {
            todaySales += Number(pay.amount) || 0;
            todayOrderCount++;
          }
        }
      }
    }

    // Also count from sales records
    if (salesRecords) {
      for (const sr of salesRecords) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rec = sr as any;
        if (rec.date && rec.date.slice(0, 10) === today) {
          todaySales += Number(rec.actual) || 0;
        }
      }
    }

    // Avg order value
    const avgOrder = todayOrderCount > 0 ? todaySales / todayOrderCount : 0;

    // Staff on duty
    let staffOnDuty = 0;
    if (shifts) {
      for (const s of shifts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sh = s as any;
        if (sh.date === today) staffOnDuty++;
      }
    }

    // Inventory alerts (low stock)
    let lowStockCount = 0;
    if (inventoryItems) {
      for (const item of inventoryItems) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = item as any;
        if (inv.status === "low_stock" || inv.status === "out_of_stock" ||
            (inv.currentStock !== undefined && inv.minStock !== undefined && inv.currentStock <= inv.minStock)) {
          lowStockCount++;
        }
      }
    }

    // Queue length
    let queueLength = 0;
    if (queueEntries) {
      for (const q of queueEntries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((q as any).status === "waiting") queueLength++;
      }
    }

    // Pending orders
    let pendingOrders = 0;
    if (orders) {
      for (const o of orders) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ord = o as any;
        if (ord.status === "pending" || ord.status === "confirmed") pendingOrders++;
      }
    }

    return { todaySales, todayOrderCount, avgOrder, staffOnDuty, lowStockCount, queueLength, pendingOrders };
  }, [payments, salesRecords, shifts, inventoryItems, queueEntries, orders, today]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
        <KpiMetricCard
          label={t("display.todaysSales")}
          value={format(metrics.todaySales, { decimals: 0 })}
          icon={DollarSign}
          tone="success"
        />
        <KpiMetricCard
          label={t("display.ordersToday")}
          value={String(metrics.todayOrderCount)}
          icon={ShoppingCart}
        />
        <KpiMetricCard
          label={t("display.avgOrderValue")}
          value={format(metrics.avgOrder, { decimals: 0 })}
          icon={TrendingUp}
        />
        <KpiMetricCard
          label={t("display.staffOnDuty")}
          value={String(metrics.staffOnDuty)}
          icon={Users}
        />
        <KpiMetricCard
          label={t("display.lowStockAlerts")}
          value={String(metrics.lowStockCount)}
          icon={AlertTriangle}
          sub={metrics.lowStockCount > 0 ? t("display.needsAttention") : t("display.allGood")}
          tone={metrics.lowStockCount > 0 ? "warning" : "success"}
        />
        <KpiMetricCard
          label={t("display.pendingOrders")}
          value={String(metrics.pendingOrders)}
          icon={Clock}
          tone={metrics.pendingOrders > 0 ? "warning" : "neutral"}
        />
        <KpiMetricCard
          label={t("display.queueLength")}
          value={String(metrics.queueLength)}
          icon={Users}
          sub={metrics.queueLength > 0 ? `~${metrics.queueLength * 5} min` : t("display.noWait")}
        />
        <KpiMetricCard
          label={t("display.inventoryItems")}
          value={String(inventoryItems ? Array.from(inventoryItems).length : 0)}
          icon={Package}
        />
      </div>
    </div>
  );
}

// ─── Main Display Page ──────────────────────────────────────────────────────

export default function DisplayPage() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();

  const initialMode = (searchParams.get("mode") as DisplayMode) || "kitchen";
  const [mode, setMode] = useState<DisplayMode>(initialMode);
  const [darkMode, setDarkMode] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hideCursor, setHideCursor] = useState(false);

  // Auto-hide controls after 5 seconds of no interaction
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    setHideCursor(false);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 5000);
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    cursorTimerRef.current = setTimeout(() => setHideCursor(true), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    };
  }, [resetHideTimer]);

  // Mouse/touch listener for showing controls
  useEffect(() => {
    const handler = () => resetHideTimer();
    window.addEventListener("mousemove", handler);
    window.addEventListener("touchstart", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("mousemove", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [resetHideTimer]);

  const requestFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const handleBack = useCallback(() => {
    router.push("/manager/");
  }, [router]);

  const handleModeChange = useCallback((newMode: DisplayMode) => {
    setMode(newMode);
    // Update URL param without navigation
    const url = new URL(window.location.href);
    url.searchParams.set("mode", newMode);
    window.history.replaceState(null, "", url.toString());
    resetHideTimer();
  }, [resetHideTimer]);

  const modes: { key: DisplayMode; labelKey: string; icon: LucideIcon }[] = [
    { key: "kitchen", labelKey: "display.kitchen", icon: UtensilsCrossed },
    { key: "menu", labelKey: "display.menuBoard", icon: Monitor },
    { key: "kpi", labelKey: "display.kpiDashboard", icon: BarChart3 },
  ];

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col select-none bg-background text-foreground",
        // Kiosk-local theme: scoping the `dark` class here flips every semantic token below.
        darkMode && "dark",
        hideCursor && "cursor-none",
      )}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* Top bar — auto-hides */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm transition-all duration-300",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none",
        )}
      >
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-5 w-px bg-border" />
          {/* Mode tabs */}
          <SegmentedControl<DisplayMode>
            size="sm"
            value={mode}
            onChange={handleModeChange}
            options={modes.map((m) => ({
              value: m.key,
              icon: m.icon,
              label: <span className="hidden sm:inline">{t(m.labelKey)}</span>,
            }))}
          />
        </div>

        <div className="flex items-center gap-3">
          <DisplayClock />
          <div className="h-5 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDarkMode((v) => !v)}
            className="text-muted-foreground"
            title={darkMode ? t("display.lightMode") : t("display.darkMode")}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={requestFullscreen} className="text-muted-foreground" title={t("display.fullscreen")}>
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {mode === "kitchen" && <KitchenDisplay />}
      {mode === "menu" && <MenuBoard />}
      {mode === "kpi" && <KpiDashboard />}

      {/* Floating clock when controls are hidden */}
      <div
        className={cn(
          "fixed bottom-4 right-4 transition-opacity duration-300",
          showControls ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="px-3 py-1.5 rounded-lg border border-border bg-background/80 backdrop-blur-sm">
          <DisplayClock />
        </div>
      </div>
    </div>
  );
}
