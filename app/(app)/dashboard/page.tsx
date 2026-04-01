"use client";

import { useEffect, useState } from "react";
import {
  Package,
  TrendingUp,
  Users,
  ShoppingBag,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CloudSun,
  Zap,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import type { InventoryItem, SalesRecord, Product } from "@/lib/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default function DashboardPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [hourlySales, setHourlySales] = useState<SalesRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];
    const since = new Date();
    since.setDate(since.getDate() - 14);

    Promise.all([
      supabase
        .from("inventory_items")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("sales_records")
        .select("*")
        .is("hour", null)
        .gte("date", since.toISOString().split("T")[0])
        .order("date"),
      supabase
        .from("sales_records")
        .select("*")
        .eq("date", today)
        .not("hour", "is", null)
        .order("hour"),
      supabase
        .from("products")
        .select("*")
        .order("revenue", { ascending: false }),
    ]).then(([inv, sal, hourly, prod]) => {
      if (inv.data) {
        setInventory(
          inv.data.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            currentStock: Number(r.current_stock),
            minStock: Number(r.min_stock),
            maxStock: Number(r.max_stock),
            unit: r.unit,
            costPerUnit: Number(r.cost_per_unit),
            supplier: r.supplier ?? "",
            lastRestocked: r.last_restocked ?? "",
            status:
              Number(r.current_stock) === 0
                ? "out_of_stock"
                : Number(r.current_stock) < Number(r.min_stock)
                ? "low_stock"
                : "in_stock",
            lossRate: Number(r.loss_rate ?? 0),
          }))
        );
      }
      if (sal.data) {
        setSales(
          sal.data.map((r) => ({
            date: r.date,
            actual: Number(r.actual),
            predicted: Number(r.predicted ?? 0),
            weather: r.weather ?? "unknown",
            footTraffic: Number(r.foot_traffic ?? 0),
            isHoliday: Boolean(r.is_holiday),
          }))
        );
      }
      if (hourly.data) {
        setHourlySales(
          hourly.data.map((r) => ({
            date: r.date,
            hour: r.hour,
            actual: Number(r.actual),
            predicted: Number(r.predicted ?? 0),
            weather: r.weather ?? "unknown",
            footTraffic: Number(r.foot_traffic ?? 0),
            isHoliday: Boolean(r.is_holiday),
          }))
        );
      }
      if (prod.data) {
        setProducts(
          prod.data.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            price: Number(r.price),
            cost: Number(r.cost),
            unitsSoldThisMonth: Number(r.units_sold_this_month),
            unitsSoldLastMonth: Number(r.units_sold_last_month),
            revenue: Number(r.revenue),
            margin: Number(r.margin),
            rating: Number(r.rating),
            trend: r.trend,
            alert: r.alert,
            alertReason: r.alert_reason ?? undefined,
          }))
        );
      }
      setLoading(false);
    });
  }, []);

  const inventoryValue = inventory.reduce(
    (s, i) => s + i.currentStock * i.costPerUnit,
    0
  );
  const lowStockCount = inventory.filter(
    (i) => i.status !== "in_stock"
  ).length;
  const todayActual = hourlySales.reduce((s, r) => s + r.actual, 0);
  const todayPredicted =
    hourlySales.length > 0
      ? hourlySales.reduce((s, r) => s + r.predicted, 0)
      : 0;
  const productsAtRisk = products.filter((p) => p.alert !== "none").length;

  const recentSales = sales.map((s) => ({
    date: new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    actual: s.actual,
    predicted: s.predicted,
  }));

  const hourlyData = hourlySales.map((h) => ({
    time: `${h.hour}:00`,
    actual: h.actual || undefined,
    predicted: h.predicted,
  }));

  const alerts = [
    ...inventory
      .filter((i) => i.status !== "in_stock")
      .map((i) => ({
        message: `${i.name} is ${
          i.status === "out_of_stock" ? "out of stock" : "running low"
        } (${i.currentStock} ${i.unit} left)`,
        severity: i.status === "out_of_stock" ? "high" : "medium",
      })),
    ...products
      .filter((p) => p.alert === "remove")
      .map((p) => ({
        message: `${p.name}: recommended for removal — ${p.alertReason}`,
        severity: "medium" as const,
      })),
  ].slice(0, 5);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEmpty =
    inventory.length === 0 && sales.length === 0 && products.length === 0;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · Live overview
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <CloudSun className="h-4 w-4 text-amber-500" />
          <span className="font-medium">Weather</span>
          <span className="text-muted-foreground">· Connect API</span>
        </div>
      </div>

      {isEmpty && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-2">
            <Zap className="h-10 w-10 text-muted-foreground mx-auto" />
            <h3 className="font-semibold text-lg">No data yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Start by adding inventory items, products, and staff in each module.
              Connect Square in Settings to automatically import your data.
            </p>
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Inventory Value"
          value={fmt(inventoryValue)}
          subtitle={`${lowStockCount} item${lowStockCount !== 1 ? "s" : ""} need restocking`}
          icon={Package}
          trend={lowStockCount > 0 ? "down" : "stable"}
          trendLabel={lowStockCount > 0 ? "Action needed" : "All stocked"}
          iconColor="text-blue-500"
          iconBg="bg-blue-50"
        />
        <MetricCard
          title="Today's Sales"
          value={fmt(todayActual)}
          subtitle={
            todayPredicted > 0
              ? `${Math.round((todayActual / todayPredicted) * 100)}% of ${fmt(todayPredicted)} forecast`
              : "No forecast yet"
          }
          icon={TrendingUp}
          trend="up"
          trendLabel="Live"
          iconColor="text-emerald-500"
          iconBg="bg-emerald-50"
          progress={
            todayPredicted > 0
              ? Math.min(100, Math.round((todayActual / todayPredicted) * 100))
              : undefined
          }
        />
        <MetricCard
          title="Products"
          value={String(products.length)}
          subtitle={
            productsAtRisk > 0
              ? `${productsAtRisk} flagged for review`
              : "All performing well"
          }
          icon={ShoppingBag}
          trend={productsAtRisk > 0 ? "down" : "stable"}
          trendLabel={productsAtRisk > 0 ? "Review needed" : "Healthy"}
          iconColor="text-rose-500"
          iconBg="bg-rose-50"
        />
        <MetricCard
          title="Inventory Items"
          value={String(inventory.length)}
          subtitle={`${inventory.filter((i) => i.status === "in_stock").length} in stock`}
          icon={Users}
          trend="stable"
          trendLabel="Tracked"
          iconColor="text-violet-500"
          iconBg="bg-violet-50"
        />
      </div>

      {/* Charts */}
      {recentSales.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Sales: Actual vs Predicted</CardTitle>
                  <CardDescription>Last {recentSales.length} days</CardDescription>
                </div>
                <Badge variant="outline" className="gap-1.5">
                  <Zap className="h-3 w-3" /> AI Forecast
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={recentSales}
                  margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="predictedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "12px" }}
                    formatter={(v) => [`$${v}`, ""]}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  <Area type="monotone" dataKey="predicted" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" fill="url(#predictedGrad)" name="Predicted" />
                  <Area type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} fill="url(#actualGrad)" name="Actual" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Today&apos;s Hourly Sales</CardTitle>
              <CardDescription>Actual vs hourly forecast</CardDescription>
            </CardHeader>
            <CardContent>
              {hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "12px" }}
                    />
                    <Bar dataKey="predicted" fill="#e0e7ff" name="Forecast" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="actual" fill="#6366f1" name="Actual" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  No hourly data for today yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts + Inventory snapshot */}
      {(alerts.length > 0 || inventory.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {alerts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <CardTitle className="text-base">Active Alerts</CardTitle>
                  <Badge variant="destructive" className="ml-auto">{alerts.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                      a.severity === "high"
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-amber-500/30 bg-amber-50/50"
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                        a.severity === "high" ? "bg-destructive" : "bg-amber-500"
                      }`}
                    />
                    <span className="text-foreground/80 leading-snug">{a.message}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {inventory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Inventory Snapshot</CardTitle>
                <CardDescription>Stock level vs capacity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {inventory.slice(0, 6).map((item) => {
                  const pct = Math.min(
                    100,
                    Math.round((item.currentStock / item.maxStock) * 100)
                  );
                  return (
                    <div key={item.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate max-w-[180px]">{item.name}</span>
                        <span
                          className={`text-xs font-medium ${
                            item.status === "out_of_stock"
                              ? "text-destructive"
                              : item.status === "low_stock"
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {item.currentStock} {item.unit}
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        className={`h-1.5 ${
                          item.status === "out_of_stock"
                            ? "[&>div]:bg-destructive"
                            : item.status === "low_stock"
                            ? "[&>div]:bg-amber-500"
                            : "[&>div]:bg-emerald-500"
                        }`}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
  iconColor,
  iconBg,
  progress,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  trend: "up" | "down" | "stable";
  trendLabel: string;
  iconColor: string;
  iconBg: string;
  progress?: number;
}) {
  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor =
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
      ? "text-rose-600"
      : "text-muted-foreground";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={`rounded-lg p-2 ${iconBg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {trendLabel}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {progress !== undefined && (
          <Progress value={progress} className="mt-3 h-1.5" />
        )}
        <p className="text-[11px] text-muted-foreground mt-1.5 font-medium uppercase tracking-wide">
          {title}
        </p>
      </CardContent>
    </Card>
  );
}
