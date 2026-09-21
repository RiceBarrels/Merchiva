"use client";

// useState/useEffect handled by useSales hook
import {
  TrendingUp,
  CloudSun,
  Cloud,
  CloudRain,
  Users,
  CalendarDays,
  Zap,
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
import { EmptyState } from "@/components/ui/empty-state";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
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
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { useSales } from "@/lib/spacetimedb/hooks/useSales";
import { useCurrency } from "@/lib/currency";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/dates";
import { SalesForecast } from "@/components/sales-forecast";
import { ItemForecast } from "@/components/item-forecast";
import { PageTabs } from "@/components/page-tabs";

const weatherIcon = (w: string) => {
  if (w === "sunny") return <CloudSun className="h-4 w-4 text-amber-500" />;
  if (w === "rainy") return <CloudRain className="h-4 w-4 text-muted-foreground" />;
  return <Cloud className="h-4 w-4 text-muted-foreground" />;
};

export default function SalesPage() {
  // Data via SpacetimeDB migration hook
  const { history, hourly, refreshing } = useSales();
  const t = useT();
  const { format } = useCurrency();
  const formatDate = useDateFormat();

  const histChartData = history.map((s) => ({
    date: formatDate(s.date + "T00:00:00", { month: "short", day: "numeric" }),
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
    <div className="">
      <PageHeader
        title={t("sales.title")}
        subtitle={t("sales.subtitle")}
        right={
          <div className="flex items-center gap-2">
            {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
            {accuracy > 0 && (
              <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                {t("sales.accuracyBadge").replace("{n}", String(accuracy))}
              </Badge>
            )}
          </div>
        }
      />
      <PageTabs tabs={[
        { label: t("nav.sales"), href: "/manager/sales" },
        { label: t("nav.reports"), href: "/manager/reports" },
        { label: t("nav.finances"), href: "/manager/finances" },
      ]} />

      {/* Summary cards */}
      <StatGrid>
        <StatTile label={t("sales.summary.avgDaily")} value={avgActual > 0 ? format(avgActual, { decimals: 0 }) : "—"} sub={t("sales.summarySub.last30")} />
        <StatTile label={t("sales.summary.today")} value={todayTotal > 0 ? format(todayTotal, { decimals: 0 }) : "—"} sub={t("sales.summarySub.hourly")} />
        <StatTile label={t("sales.summary.accuracy")} value={accuracy > 0 ? `${accuracy}%` : "—"} sub={t("sales.summarySub.vsActual")} />
        <StatTile label={t("sales.summary.records")} value={String(history.length)} sub={t("sales.summarySub.daysTracked")} />
      </StatGrid>

      {isEmpty ? (
        <Card>
          <EmptyState
            icon={TrendingUp}
            title={t("sales.empty.title")}
            description={t("sales.empty.description")}
          />
        </Card>
      ) : (
        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">{t("sales.tabs.history")}</TabsTrigger>
            <TabsTrigger value="hourly">{t("sales.tabs.hourly")}</TabsTrigger>
            <TabsTrigger value="forecast">{t("sales.tabs.forecast")}</TabsTrigger>
            <TabsTrigger value="ai-items">{t("sales.tabs.aiItems")}</TabsTrigger>
          </TabsList>

          {/* History */}
          <TabsContent value="history" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("sales.history.title")}</CardTitle>
                <CardDescription>{t("sales.history.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={histChartData}
                    margin={{ top: 5, right: 10, left: -15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => format(Number(v), { decimals: 0 })} />
                    <Tooltip
                      contentStyle={{ borderRadius: "2px", border: "1px solid var(--border)", fontSize: "12px" }}
                      formatter={(v, name) => [format(Number(v), { decimals: 0 }), String(name)]}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
                    <Area type="monotone" dataKey="predicted" stroke="var(--color-chart-1)" strokeWidth={1.5} strokeDasharray="4 2" fill="none" name={t("sales.history.predicted")} />
                    <Area type="monotone" dataKey="actual" stroke="var(--color-chart-3)" strokeWidth={2} fill="none" name={t("sales.history.actual")} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Factor cards */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <FactorCard
                icon={<CloudSun className="h-4 w-4 text-muted-foreground" />}
                title={t("sales.factors.weatherTitle")}
                description={t("sales.factors.weatherDesc")}
                badge={t("sales.factors.weatherBadge")}
              />
              <FactorCard
                icon={<Users className="h-4 w-4 text-muted-foreground" />}
                title={t("sales.factors.trafficTitle")}
                description={t("sales.factors.trafficDesc")}
                badge={t("sales.factors.trafficBadge")}
              />
              <FactorCard
                icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
                title={t("sales.factors.holidayTitle")}
                description={t("sales.factors.holidayDesc")}
                badge={t("sales.factors.holidayBadge")}
              />
            </div>
          </TabsContent>

          {/* Hourly */}
          <TabsContent value="hourly" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("sales.hourly.title")}</CardTitle>
                <CardDescription>{t("sales.hourly.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                {hourlyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart
                      data={hourlyChartData}
                      margin={{ top: 5, right: 10, left: -15, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: "2px", border: "1px solid var(--border)", fontSize: "12px" }}
                        formatter={(v) => [format(Number(v), { decimals: 0 }), ""]}
                      />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
                      <Bar dataKey="forecast" fill="var(--color-chart-1)" name={t("sales.hourly.forecast")} radius={[2, 2, 0, 0]} />
                      <Line type="monotone" dataKey="actual" stroke="var(--color-chart-4)" strokeWidth={2} dot={{ fill: "var(--color-chart-4)", r: 3 }} name={t("sales.hourly.actual")} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState className="h-[300px]" description={t("sales.hourly.empty")} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Forecast */}
          <TabsContent value="forecast" className="mt-4">
            <SalesForecast />
          </TabsContent>

          {/* AI Per-Item Forecast */}
          <TabsContent value="ai-items" className="mt-4">
            <ItemForecast />
          </TabsContent>
        </Tabs>
      )}
    </div>
    </PermissionGuard>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
