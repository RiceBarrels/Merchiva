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
} from "lucide-react";
import { cn } from "@/lib/utils";
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
    <span className="font-mono text-sm text-stone-400 dark:text-stone-500 tabular-nums">
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

// ─── Kitchen Display (KDS) ──────────────────────────────────────────────────

function KitchenDisplay({ darkMode }: { darkMode: boolean }) {
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
    return "bg-red-500 text-white animate-pulse";
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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <UtensilsCrossed className={cn("h-16 w-16 mx-auto mb-4", darkMode ? "text-stone-700 dark:text-stone-300" : "text-stone-300 dark:text-stone-700")} />
          <p className={cn("text-2xl font-semibold", darkMode ? "text-stone-500 dark:text-stone-400" : "text-stone-400 dark:text-stone-500")}>
            {t("display.noOrders")}
          </p>
          <p className={cn("text-lg mt-2", darkMode ? "text-stone-600 dark:text-stone-300" : "text-stone-500 dark:text-stone-400")}>
            {t("display.waitingForOrders")}
          </p>
        </div>
      </div>
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
                "rounded-[0.3rem] border-2 flex flex-col overflow-hidden transition-colors",
                getAgeColor(ageMin),
              )}
            >
              {/* Header */}
              <div className={cn(
                "flex items-center justify-between px-4 py-3 border-b",
                darkMode ? "border-stone-700" : "border-stone-200 dark:border-stone-700",
              )}>
                <div className="flex items-center gap-3">
                  <span className={cn("text-xl font-bold font-mono", darkMode ? "text-stone-100" : "text-foreground")}>
                    #{orderId}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded text-xs font-bold uppercase", getAgeBadgeColor(ageMin))}>
                    {ageMin}m
                  </span>
                </div>
                <span className={cn(
                  "text-xs font-mono uppercase px-2 py-0.5 rounded",
                  o.status === "pending"
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-blue-500/20 text-blue-400",
                )}>
                  {o.status}
                </span>
              </div>

              {/* Customer */}
              {o.customerName && (
                <div className={cn(
                  "px-4 py-2 text-base font-medium border-b",
                  darkMode ? "text-stone-300 dark:text-stone-700 border-stone-700" : "text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700",
                )}>
                  {o.customerName}
                </div>
              )}

              {/* Items */}
              <div className="flex-1 px-4 py-3 space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className={cn(
                      "text-lg font-bold font-mono min-w-[2rem] text-center rounded px-1",
                      darkMode ? "bg-stone-800 text-stone-200" : "bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200",
                    )}>
                      {item.quantity}x
                    </span>
                    <span className={cn("text-lg font-medium flex-1", darkMode ? "text-stone-200" : "text-stone-800 dark:text-stone-200")}>
                      {item.name}
                    </span>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className={cn("text-sm italic", darkMode ? "text-stone-600 dark:text-stone-300" : "text-stone-400 dark:text-stone-500")}>
                    {t("display.noItems")}
                  </p>
                )}
              </div>

              {/* Notes */}
              {o.notes && (
                <div className={cn(
                  "px-4 py-2 text-sm italic border-t",
                  darkMode ? "text-amber-400 border-stone-700 bg-amber-500/5" : "text-amber-700 border-stone-200 dark:border-stone-700 bg-amber-50",
                )}>
                  {o.notes}
                </div>
              )}

              {/* Complete button */}
              <button
                onClick={() => handleComplete(String(o.id))}
                disabled={completingId === String(o.id)}
                className={cn(
                  "flex items-center justify-center gap-2 px-4 py-4 text-lg font-bold transition-colors border-t",
                  darkMode ? "border-stone-700" : "border-stone-200 dark:border-stone-700",
                  completingId === String(o.id)
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-emerald-500 hover:text-white active:bg-emerald-600",
                  darkMode ? "bg-stone-800 text-emerald-400" : "bg-stone-100 dark:bg-stone-800 text-emerald-700",
                )}
              >
                <Check className="h-6 w-6" />
                {t("display.complete")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Menu Board ─────────────────────────────────────────────────────────────

function MenuBoard({ darkMode }: { darkMode: boolean }) {
  const t = useT();
  const { format } = useCurrency();
  const products = useProducts();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(true);

  const productList = useMemo(() => {
    if (!products) return [];
    return Array.from(products).filter((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prod = p as any;
      return prod.price > 0;
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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ShoppingCart className={cn("h-16 w-16 mx-auto mb-4", darkMode ? "text-stone-700 dark:text-stone-300" : "text-stone-300 dark:text-stone-700")} />
          <p className={cn("text-2xl font-semibold", darkMode ? "text-stone-500 dark:text-stone-400" : "text-stone-400 dark:text-stone-500")}>
            {t("display.noProducts")}
          </p>
        </div>
      </div>
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
          <h2 className={cn(
            "text-2xl font-bold mb-4 pb-2 border-b",
            darkMode ? "text-stone-200 border-stone-700" : "text-stone-800 dark:text-stone-200 border-stone-300 dark:border-stone-700",
          )}>
            {category}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {prods.map((p) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const prod = p as any;
              return (
                <div
                  key={String(prod.id)}
                  className={cn(
                    "rounded-[0.3rem] border overflow-hidden flex flex-col",
                    darkMode ? "border-stone-700 bg-stone-900" : "border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900",
                  )}
                >
                  {prod.imageUrl && (
                    <div className="aspect-[4/3] overflow-hidden bg-stone-800">
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className={cn(
                        "text-xl font-bold",
                        darkMode ? "text-stone-100" : "text-foreground",
                      )}>
                        {prod.name}
                      </h3>
                      {prod.description && (
                        <p className={cn(
                          "text-sm mt-1 line-clamp-2",
                          darkMode ? "text-stone-400 dark:text-stone-500" : "text-stone-500 dark:text-stone-400",
                        )}>
                          {prod.description}
                        </p>
                      )}
                    </div>
                    <p className={cn(
                      "text-3xl font-bold font-mono mt-3",
                      darkMode ? "text-stone-100" : "text-foreground",
                    )}>
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

function KpiMetricCard({
  label,
  value,
  icon: Icon,
  sub,
  darkMode,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  darkMode: boolean;
  accent?: string;
}) {
  return (
    <div className={cn(
      "rounded-[0.3rem] border p-6 flex flex-col items-center justify-center text-center",
      darkMode ? "border-stone-700 bg-stone-900" : "border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900",
    )}>
      <Icon className={cn("h-8 w-8 mb-3", accent || (darkMode ? "text-stone-500 dark:text-stone-400" : "text-stone-400 dark:text-stone-500"))} />
      <p className={cn("text-6xl font-bold font-mono leading-none", darkMode ? "text-stone-100" : "text-foreground")}>
        {value}
      </p>
      <p className={cn("text-lg font-medium mt-3", darkMode ? "text-stone-400 dark:text-stone-500" : "text-stone-500 dark:text-stone-400")}>
        {label}
      </p>
      {sub && (
        <p className={cn("text-sm mt-1", darkMode ? "text-stone-600 dark:text-stone-300" : "text-stone-400 dark:text-stone-500")}>
          {sub}
        </p>
      )}
    </div>
  );
}

function KpiDashboard({ darkMode }: { darkMode: boolean }) {
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
          darkMode={darkMode}
          accent="text-emerald-500"
        />
        <KpiMetricCard
          label={t("display.ordersToday")}
          value={String(metrics.todayOrderCount)}
          icon={ShoppingCart}
          darkMode={darkMode}
          accent="text-blue-500"
        />
        <KpiMetricCard
          label={t("display.avgOrderValue")}
          value={format(metrics.avgOrder, { decimals: 0 })}
          icon={TrendingUp}
          darkMode={darkMode}
          accent="text-violet-500"
        />
        <KpiMetricCard
          label={t("display.staffOnDuty")}
          value={String(metrics.staffOnDuty)}
          icon={Users}
          darkMode={darkMode}
          accent="text-sky-500"
        />
        <KpiMetricCard
          label={t("display.lowStockAlerts")}
          value={String(metrics.lowStockCount)}
          icon={AlertTriangle}
          sub={metrics.lowStockCount > 0 ? t("display.needsAttention") : t("display.allGood")}
          darkMode={darkMode}
          accent={metrics.lowStockCount > 0 ? "text-amber-500" : "text-emerald-500"}
        />
        <KpiMetricCard
          label={t("display.pendingOrders")}
          value={String(metrics.pendingOrders)}
          icon={Clock}
          darkMode={darkMode}
          accent={metrics.pendingOrders > 0 ? "text-amber-500" : "text-stone-500 dark:text-stone-400"}
        />
        <KpiMetricCard
          label={t("display.queueLength")}
          value={String(metrics.queueLength)}
          icon={Users}
          sub={metrics.queueLength > 0 ? `~${metrics.queueLength * 5} min` : t("display.noWait")}
          darkMode={darkMode}
          accent="text-orange-500"
        />
        <KpiMetricCard
          label={t("display.inventoryItems")}
          value={String(inventoryItems ? Array.from(inventoryItems).length : 0)}
          icon={Package}
          darkMode={darkMode}
          accent="text-stone-500 dark:text-stone-400"
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
    router.push("/dashboard");
  }, [router]);

  const handleModeChange = useCallback((newMode: DisplayMode) => {
    setMode(newMode);
    // Update URL param without navigation
    const url = new URL(window.location.href);
    url.searchParams.set("mode", newMode);
    window.history.replaceState(null, "", url.toString());
    resetHideTimer();
  }, [resetHideTimer]);

  const modes: { key: DisplayMode; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "kitchen", labelKey: "display.kitchen", icon: UtensilsCrossed },
    { key: "menu", labelKey: "display.menuBoard", icon: Monitor },
    { key: "kpi", labelKey: "display.kpiDashboard", icon: BarChart3 },
  ];

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col select-none",
        darkMode ? "bg-stone-950 text-stone-100" : "bg-stone-50 dark:bg-stone-950 text-foreground",
        hideCursor && "cursor-none",
      )}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* Top bar — auto-hides */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2 border-b transition-all duration-300",
          darkMode ? "border-stone-800 bg-stone-900/80" : "border-stone-200 dark:border-stone-700 bg-white/80",
          "backdrop-blur-sm",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none",
        )}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className={cn(
              "p-2 rounded-[0.3rem] transition-colors",
              darkMode ? "hover:bg-stone-800 text-stone-400 dark:text-stone-500" : "hover:bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300",
            )}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className={cn("h-5 w-px", darkMode ? "bg-stone-700" : "bg-stone-300 dark:bg-stone-700")} />
          {/* Mode tabs */}
          <div className={cn(
            "flex items-center gap-1 rounded-[0.3rem] p-1",
            darkMode ? "bg-stone-800" : "bg-stone-200 dark:bg-stone-700",
          )}>
            {modes.map((m) => (
              <button
                key={m.key}
                onClick={() => handleModeChange(m.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-[0.3rem] text-sm font-medium transition-colors",
                  mode === m.key
                    ? darkMode
                      ? "bg-stone-700 text-stone-100"
                      : "bg-white dark:bg-stone-900 text-foreground border border-stone-200 dark:border-stone-700"
                    : darkMode
                      ? "text-stone-500 dark:text-stone-400 hover:text-stone-300 dark:text-stone-700"
                      : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:text-stone-300",
                )}
              >
                <m.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t(m.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <DisplayClock />
          <div className={cn("h-5 w-px", darkMode ? "bg-stone-700" : "bg-stone-300 dark:bg-stone-700")} />
          <button
            onClick={() => setDarkMode((v) => !v)}
            className={cn(
              "p-2 rounded-[0.3rem] transition-colors",
              darkMode ? "hover:bg-stone-800 text-stone-400 dark:text-stone-500" : "hover:bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300",
            )}
            title={darkMode ? t("display.lightMode") : t("display.darkMode")}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={requestFullscreen}
            className={cn(
              "p-2 rounded-[0.3rem] transition-colors",
              darkMode ? "hover:bg-stone-800 text-stone-400 dark:text-stone-500" : "hover:bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300",
            )}
            title={t("display.fullscreen")}
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {mode === "kitchen" && <KitchenDisplay darkMode={darkMode} />}
      {mode === "menu" && <MenuBoard darkMode={darkMode} />}
      {mode === "kpi" && <KpiDashboard darkMode={darkMode} />}

      {/* Floating clock when controls are hidden */}
      <div
        className={cn(
          "fixed bottom-4 right-4 transition-opacity duration-300",
          showControls ? "opacity-0" : "opacity-100",
        )}
      >
        <div className={cn(
          "px-3 py-1.5 rounded-[0.3rem] font-mono text-sm",
          darkMode ? "bg-stone-900/80 text-stone-400 dark:text-stone-500 border border-stone-800" : "bg-white/80 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700",
          "backdrop-blur-sm",
        )}>
          <DisplayClock />
        </div>
      </div>
    </div>
  );
}
