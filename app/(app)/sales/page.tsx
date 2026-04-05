"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  CloudSun,
  Cloud,
  CloudRain,
  Users,
  CalendarDays,
  Zap,
  ArrowUpRight,
  RefreshCw,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { getSalesHistory, getTodayHourlyRecords } from "@/lib/db/sales";
import type { SalesRecord } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { getCached, setCache } from "@/lib/cache";

const weatherIcon = (w: string) => {
  if (w === "sunny") return <CloudSun className="h-4 w-4 text-amber-500" />;
  if (w === "rainy") return <CloudRain className="h-4 w-4 text-blue-400" />;
  return <Cloud className="h-4 w-4 text-slate-400" />;
};

type SalesCache = { history: SalesRecord[]; hourly: SalesRecord[] };

export default function SalesPage() {
  const [history, setHistory] = useState<SalesRecord[]>(() => getCached<SalesCache>("sales_30d")?.history ?? []);
  const [hourly, setHourly] = useState<SalesRecord[]>(() => getCached<SalesCache>("sales_30d")?.hourly ?? []);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setRefreshing(true);
    Promise.all([getSalesHistory(30), getTodayHourlyRecords()])
      .then(([hist, hrly]) => {
        setHistory(hist);
        setHourly(hrly);
        setCache("sales_30d", { history: hist, hourly: hrly });
      })
      .catch((err) => {
        console.error("Failed to load sales:", err);
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, []);

  const histChartData = history.map((s) => ({
    date: new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    actual: s.actual,
    predicted: s.predicted,
  }));

  const hourlyChartData = hourly.map((h) => ({
    time: `${h.hour}:00`,
    forecast: h.predicted,
    actual: h.actual || undefined,
  }));

  const avgActual =
    history.length > 0
      ? Math.round(history.reduce((s, r) => s + r.actual, 0) / history.length)
      : 0;

  const accuracy =
    history.length > 0
      ? Math.round(
          (history.reduce((sum, s) => {
            if (!s.predicted || s.predicted === 0) return sum + 1;
            const err = Math.abs(s.actual - s.predicted) / s.actual;
            return sum + Math.max(0, 1 - err);
          }, 0) /
            history.length) *
            100
        )
      : 0;

  const todayTotal = hourly.reduce((s, r) => s + r.actual, 0);

  const isEmpty = history.length === 0 && hourly.length === 0;

  return (
    <PermissionGuard section="sales">
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales Prediction</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              AI-powered forecasting using weather, foot traffic, and historical patterns
            </p>
          </div>
          {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        </div>
        {accuracy > 0 && (
          <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1.5">
            <Zap className="h-3.5 w-3.5 text-violet-500" />
            {accuracy}% forecast accuracy
          </Badge>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Avg Daily Sales"   value={avgActual > 0 ? `$${avgActual}` : "—"} sub="Last 30 days"    trend="up"    />
        <StatCard label="Today (so far)"    value={todayTotal > 0 ? `$${todayTotal}` : "—"} sub="Hourly actuals" trend="stable" />
        <StatCard label="Forecast Accuracy" value={accuracy > 0 ? `${accuracy}%` : "—"} sub="vs actual results" trend="up"   />
        <StatCard label="Records"           value={String(history.length)}  sub="Days tracked" trend="stable" />
      </div>

      {isEmpty ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
            <div>
              <p className="font-semibold">No sales data yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Connect Square in Settings to automatically import your sales history,
                or manually add records via the API.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">Historical Analysis</TabsTrigger>
            <TabsTrigger value="hourly">Today&apos;s Hourly</TabsTrigger>
          </TabsList>

          {/* History */}
          <TabsContent value="history" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">30-Day Sales History</CardTitle>
                <CardDescription>Actual vs AI-predicted sales</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={histChartData}
                    margin={{ top: 5, right: 10, left: -15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ borderRadius: "2px", border: "1px solid #e7e5e4", fontSize: "12px" }}
                      formatter={(v, name) => [`$${v}`, String(name)]}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
                    <Area type="monotone" dataKey="predicted" stroke="#a8a29e" strokeWidth={1.5} strokeDasharray="4 2" fill="none" name="Predicted" />
                    <Area type="monotone" dataKey="actual" stroke="#44403c" strokeWidth={2} fill="none" name="Actual" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Factor cards */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <FactorCard
                icon={<CloudSun className="h-4 w-4 text-stone-600" />}
                title="Weather Impact"
                description="Sunny days typically drive 10–20% higher foot traffic. Connect a weather API to factor real-time conditions into forecasts."
                badge="Weather API — pending"
              />
              <FactorCard
                icon={<Users className="h-4 w-4 text-stone-600" />}
                title="Foot Traffic"
                description="Google Maps popularity data correlates strongly with sales. High-traffic hours: 8–10am and 12–2pm."
                badge="Google Maps API — pending"
              />
              <FactorCard
                icon={<CalendarDays className="h-4 w-4 text-stone-600" />}
                title="Day & Holiday Effect"
                description="Weekends and holidays show consistent demand spikes. Mark holidays in your sales records to improve forecast accuracy."
                badge="Holiday calendar — ready"
              />
            </div>
          </TabsContent>

          {/* Hourly */}
          <TabsContent value="hourly" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Today — Hourly Breakdown</CardTitle>
                <CardDescription>Forecast vs actual sales by hour</CardDescription>
              </CardHeader>
              <CardContent>
                {hourlyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart
                      data={hourlyChartData}
                      margin={{ top: 5, right: 10, left: -15, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: "2px", border: "1px solid #e7e5e4", fontSize: "12px" }}
                        formatter={(v) => [`$${v}`, ""]}
                      />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
                      <Bar dataKey="forecast" fill="#e7e5e4" name="Forecast" radius={[2, 2, 0, 0]} />
                      <Line type="monotone" dataKey="actual" stroke="#44403c" strokeWidth={2} dot={{ fill: "#44403c", r: 3 }} name="Actual" connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                    No hourly data for today yet
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
    </PermissionGuard>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
  trend: "up" | "down" | "stable";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-lg font-bold font-mono">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        <p className="text-[10px] text-stone-400 mt-1.5 font-medium uppercase tracking-wide">{label}</p>
      </CardContent>
    </Card>
  );
}

function FactorCard({
  icon,
  title,
  description,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <p className="font-semibold text-sm">{title}</p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        <Badge variant="outline" className="text-[11px]">{badge}</Badge>
      </CardContent>
    </Card>
  );
}
