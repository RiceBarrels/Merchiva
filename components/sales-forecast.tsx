"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sun, Cloud, CloudRain, Snowflake, CloudLightning, TrendingUp, Users, BarChart3, MapPin, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { STATUS_TONE_DOT } from "@/components/ui/status-badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  generateForecast,
  getUSHolidays,
  type ForecastResult,
  type WeatherForecast,
  type PopularTimesData,
} from "@/lib/forecast";
import { useSalesRecords, useShifts, usePayments } from "@/lib/spacetimedb/hooks";
import { usePermissions } from "@/lib/context/permissions";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import { Spinner } from "@/components/ui/loaders/geometric";
import { useT } from "@/lib/i18n/context";

// ─── Helpers ────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weatherIcon(condition: string) {
  switch (condition) {
    case "sunny":
      return <Sun className="h-4 w-4 text-amber-500" />;
    case "rainy":
      return <CloudRain className="h-4 w-4 text-muted-foreground" />;
    case "snowy":
      return <Snowflake className="h-4 w-4 text-muted-foreground" />;
    case "stormy":
      return <CloudLightning className="h-4 w-4 text-foreground" />;
    default:
      return <Cloud className="h-4 w-4 text-muted-foreground" />;
  }
}

function confidenceColor(c: number): string {
  if (c >= 70) return STATUS_TONE_DOT.success;
  if (c >= 40) return STATUS_TONE_DOT.warning;
  return STATUS_TONE_DOT.danger;
}

function qualityBadge(q: ForecastResult["dataQuality"]): {
  labelKey: string;
  variant: "default" | "secondary" | "outline" | "destructive";
} {
  switch (q) {
    case "excellent":
      return { labelKey: "salesForecast.dataExcellent", variant: "default" };
    case "good":
      return { labelKey: "salesForecast.dataGood", variant: "secondary" };
    case "fair":
      return { labelKey: "salesForecast.dataFair", variant: "outline" };
    case "poor":
      return { labelKey: "salesForecast.dataLimited", variant: "destructive" };
  }
}

function formatMultiplier(m: number): string {
  const pct = Math.round((m - 1) * 100);
  if (pct === 0) return "neutral";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

// SpacetimeDB timestamps arrive as { microsSinceUnixEpoch: bigint } objects;
// String(...) on those yields "[object Object]" which Date can't parse, so
// every payment would silently get dropped. Normalize to epoch ms here.
function timestampToMs(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") return new Date(v).getTime();
  if (typeof v === "object") {
    const obj = v as { microsSinceUnixEpoch?: bigint | number; toDate?: () => Date };
    if (typeof obj.toDate === "function") return obj.toDate().getTime();
    const micros = obj.microsSinceUnixEpoch;
    if (typeof micros === "bigint") return Number(micros / 1000n);
    if (typeof micros === "number") return micros / 1000;
  }
  return NaN;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SalesForecast() {
  const t = useT();
  const { format } = useCurrency();
  const { organizationId } = usePermissions();
  const [rawSales] = useSalesRecords();
  const [rawShifts] = useShifts();
  const [rawPayments] = usePayments();

  const [weather, setWeather] = useState<WeatherForecast[] | null>(null);
  const [popularTimes, setPopularTimes] = useState<PopularTimesData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoRequested, setGeoRequested] = useState(false);

  // Filter data by organization
  const salesHistory = useMemo(() => {
    if (!organizationId) return [];

    const fromSalesRecord = (rawSales as unknown as Array<Record<string, unknown>>)
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        date: String(r.date ?? ""),
        hour: r.hour != null ? Number(r.hour) : undefined,
        actual: Number(r.actual ?? 0),
        predicted: Number(r.predicted ?? 0),
        weather: String(r.weather ?? ""),
        footTraffic: Number(r.footTraffic ?? 0),
        isHoliday: Boolean(r.isHoliday),
      }));

    // Aggregate built-in POS payments by date so they feed the same baseline.
    // `payment` rows are per-transaction; `sales_record` is per-day (or per-hour),
    // so we collapse payments to one synthetic daily record per date. Refunded
    // payments are excluded; partial refunds subtract refundAmount from amount.
    const posByDate = new Map<string, number>();
    for (const r of rawPayments as unknown as Array<Record<string, unknown>>) {
      if (r.organizationId !== organizationId) continue;
      if (r.status === "refunded") continue;
      const ts = timestampToMs(r.createdAt);
      if (!Number.isFinite(ts)) continue;
      const date = new Date(ts).toISOString().slice(0, 10);
      const amount = Number(r.amount ?? 0);
      const refund = Number(r.refundAmount ?? 0);
      const net = amount - refund;
      if (net <= 0) continue;
      posByDate.set(date, (posByDate.get(date) ?? 0) + net);
    }

    const fromPayments = Array.from(posByDate, ([date, actual]) => ({
      date,
      hour: undefined as number | undefined,
      actual,
      predicted: 0,
      weather: "",
      footTraffic: 0,
      isHoliday: false,
    }));

    return [...fromSalesRecord, ...fromPayments];
  }, [rawSales, rawPayments, organizationId]);

  const shifts = useMemo(() => {
    if (!organizationId) return [];
    return (rawShifts as unknown as Array<Record<string, unknown>>)
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id: String(r.id ?? ""),
        memberId: r.memberId ? String(r.memberId) : null,
        staffName: String(r.staffName ?? ""),
        staffRole: r.staffRole ? String(r.staffRole) : null,
        staffRoles: Array.isArray(r.staffRoles) ? r.staffRoles.map(String) : [],
        date: String(r.date ?? ""),
        shiftType: String(r.shiftType ?? "morning") as "morning" | "afternoon" | "evening" | "closing",
        startTime: String(r.startTime ?? ""),
        endTime: String(r.endTime ?? ""),
        predictedDemand: (String(r.predictedDemand ?? "medium")) as "low" | "medium" | "high",
      }));
  }, [rawShifts, organizationId]);

  // Try to get store coordinates from location address or browser geolocation
  useEffect(() => {
    if (geoCoords || geoRequested) return;
    setGeoRequested(true);

    // Try browser geolocation as fallback
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          // Silently fail — weather just won't be available
          setGeoCoords(null);
        },
        { timeout: 5000 },
      );
    }
  }, [geoCoords, geoRequested]);

  // Fetch weather data
  const fetchWeather = useCallback(async () => {
    if (!geoCoords) return;
    try {
      const res = await fetch(
        `/api/forecast/weather?lat=${geoCoords.lat}&lng=${geoCoords.lng}&days=7`,
      );
      if (!res.ok) throw new Error(`Weather API ${res.status}`);
      const data = await res.json();
      setWeather(data.forecasts ?? data.forecast ?? []);
    } catch (err) {
      console.error("Failed to fetch weather:", err);
      setWeatherError(true);
    }
  }, [geoCoords]);

  // Fetch popular times data
  const fetchPopularTimes = useCallback(async () => {
    try {
      const res = await fetch("/api/forecast/popular-times?placeId=default");
      if (!res.ok) throw new Error(`Popular times API ${res.status}`);
      const data = await res.json();
      setPopularTimes(data.popularTimes ?? []);
    } catch (err) {
      console.error("Failed to fetch popular times:", err);
      setPopularTimes([]);
    }
  }, []);

  // Fetch external data on mount
  useEffect(() => {
    Promise.all([
      geoCoords ? fetchWeather() : Promise.resolve(),
      fetchPopularTimes(),
    ])
      .catch((err) => console.error("Forecast data fetch error:", err))
      .finally(() => setLoading(false));
  }, [geoCoords, fetchWeather, fetchPopularTimes]);

  // Generate forecast
  const forecast = useMemo<ForecastResult | null>(() => {
    if (salesHistory.length < 7) return null;

    const today = new Date();
    const start = toISO(today);
    const end = toISO(new Date(today.getTime() + 6 * 86_400_000));
    const currentYear = today.getFullYear();
    const holidays = getUSHolidays(currentYear);

    return generateForecast(
      salesHistory,
      shifts,
      weather ?? [],
      popularTimes ?? [],
      holidays,
      { start, end },
    );
  }, [salesHistory, shifts, weather, popularTimes]);

  const selected = forecast?.days[selectedDay] ?? null;

  // ─── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Spinner size={16} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t("salesForecast.loadingData")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border p-3 space-y-2 bg-card"
            >
              <SkeletonText width="40%" />
              <SkeletonText width="55%" />
              <SkeletonText width="100%" />
              <SkeletonText width="70%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── No history state ─────────────────────────────────────────────────────

  if (salesHistory.length < 7) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={BarChart3}
            title={t("salesForecast.notEnoughData")}
            description={t("salesForecast.notEnoughDataDesc").replace(
              "{count}",
              String(
                new Set(
                  salesHistory
                    .filter((r) => r.hour === undefined)
                    .map((r) => r.date),
                ).size,
              ),
            )}
          />
        </CardContent>
      </Card>
    );
  }

  if (!forecast) return null;

  const qb = qualityBadge(forecast.dataQuality);
  const bestDay = forecast.days.reduce((best, d) =>
    d.predicted > best.predicted ? d : best,
  );
  const worstWeatherDay = forecast.days.reduce((worst, d) =>
    d.factors.weatherMultiplier < worst.factors.weatherMultiplier ? d : worst,
  );

  // Staffing advisory: find days where staff count is significantly below average
  const avgStaff =
    forecast.days.reduce((sum, d) => sum + d.factors.staffCount, 0) /
    forecast.days.length;
  const understaffedDays = forecast.days.filter(
    (d) => d.factors.staffCount > 0 && d.factors.staffCount < avgStaff * 0.7,
  );

  const hourlyData = selected
    ? selected.hourlyBreakdown
        .filter((h) => h.hour >= 6 && h.hour <= 22)
        .map((h) => ({
          time: `${h.hour}:00`,
          predicted: Math.round(h.predicted),
        }))
    : [];

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t("salesForecast.title")}</h3>
          <Badge variant={qb.variant} className="text-[10px] px-1.5 py-0">
            {t(qb.labelKey)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {!geoCoords && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {t("salesForecast.noLocation")}
            </span>
          )}
          {weatherError && geoCoords && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertCircle className="h-3 w-3" />
              {t("salesForecast.weatherUnavailable")}
            </span>
          )}
          <span className="font-mono tabular-nums">
            {t("salesForecast.confidence").replace(
              "{percent}",
              String(forecast.overallConfidence),
            )}
          </span>
        </div>
      </div>

      {/* Forecast day cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {forecast.days.map((day, i) => {
          const isSelected = i === selectedDay;
          const isToday = i === 0;
          return (
            <button
              key={day.date}
              onClick={() => setSelectedDay(i)}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-colors cursor-pointer",
                isSelected
                  ? "border-foreground bg-accent"
                  : "hover:border-foreground/30 bg-card",
              )}
            >
              {/* Day name + date */}
              <div className="flex items-center justify-between mb-1">
                <Eyebrow as="span" size="xs">
                  {isToday ? t("salesForecast.today") : day.dayOfWeek.slice(0, 3)}
                </Eyebrow>
                {weatherIcon(day.factors.weatherLabel)}
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>

              {/* Predicted revenue */}
              <p className="text-base font-bold font-mono tabular-nums leading-tight">
                {format(day.predicted, { decimals: 0 })}
              </p>

              {/* Confidence bar */}
              <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    confidenceColor(day.confidence),
                  )}
                  style={{ width: `${day.confidence}%` }}
                />
              </div>

              {/* Compact factor breakdown */}
              <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground leading-tight">
                <div className="flex items-center gap-1">
                  <span>{t("salesForecast.factorBase")}</span>
                  <span className="font-mono tabular-nums">
                    {format(day.factors.baseLine, { decimals: 0 })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span>{t("salesForecast.factorWeather")}</span>
                  <span className="font-mono tabular-nums">
                    {formatMultiplier(day.factors.weatherMultiplier)}
                  </span>
                </div>
                {day.factors.holidayName && (
                  <div className="flex items-center gap-1 text-amber-600">
                    <span>{t("salesForecast.factorHoliday")}</span>
                    <span className="truncate">
                      {formatMultiplier(day.factors.holidayMultiplier)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>{t("salesForecast.factorTraffic")}</span>
                  <span>{day.factors.footTrafficLevel}</span>
                </div>
                {day.factors.staffCount > 0 && (
                  <div className="flex items-center gap-1">
                    <span>{t("salesForecast.factorStaff")}</span>
                    <span>{day.factors.staffCount}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>{t("salesForecast.factorTrend")}</span>
                  <span className="font-mono tabular-nums">
                    {formatMultiplier(day.factors.trendMultiplier)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hourly demand curve */}
      {selected && hourlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">
                  {t("salesForecast.hourlyBreakdown")}:{" "}
                  {selected.dayOfWeek},{" "}
                  {new Date(selected.date + "T12:00:00").toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" },
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("salesForecast.predictedRevenuePerHour")}
                </CardDescription>
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {t("salesForecast.total")}: {format(selected.predicted, { decimals: 0 })}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={hourlyData}
                margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e7e5e4"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => format(Number(v), { decimals: 0 })}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "2px",
                    border: "1px solid #e7e5e4",
                    fontSize: "11px",
                  }}
                  formatter={(v) => [format(Number(v), { decimals: 0 }), t("salesForecast.predicted")]}
                />
                <Bar
                  dataKey="predicted"
                  fill="#a8a29e"
                  radius={[2, 2, 0, 0]}
                  activeBar={{ fill: "#44403c" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Insight cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Best day */}
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold">{t("salesForecast.bestDay")}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {bestDay.dayOfWeek}
              </span>{" "}
              {t("salesForecast.at")}{" "}
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {format(bestDay.predicted, { decimals: 0 })}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {bestDay.factors.holidayName
                ? t("salesForecast.boostedBy").replace(
                    "{holiday}",
                    bestDay.factors.holidayName,
                  )
                : bestDay.factors.footTrafficLevel === "high" ||
                    bestDay.factors.footTrafficLevel === "very_high"
                  ? t("salesForecast.highFootTraffic")
                  : t("salesForecast.strongBaseline").replace(
                      "{day}",
                      bestDay.dayOfWeek,
                    )}
            </p>
          </CardContent>
        </Card>

        {/* Weather impact */}
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              {weatherIcon(worstWeatherDay.factors.weatherLabel)}
              <span className="text-xs font-semibold">{t("salesForecast.weatherImpact")}</span>
            </div>
            {!geoCoords ? (
              <p className="text-xs text-muted-foreground">
                {t("salesForecast.enableLocation")}
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {worstWeatherDay.factors.weatherMultiplier < 0.95 ? (
                    <>
                      <span className="font-semibold text-foreground">
                        {worstWeatherDay.dayOfWeek}
                      </span>{" "}
                      {t("salesForecast.maySee")}{" "}
                      <span className="font-mono tabular-nums">
                        {formatMultiplier(
                          worstWeatherDay.factors.weatherMultiplier,
                        )}
                      </span>{" "}
                      {t("salesForecast.dueToWeather").replace(
                        "{weather}",
                        worstWeatherDay.factors.weatherLabel,
                      )}
                    </>
                  ) : (
                    t("salesForecast.favorableWeather")
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {weather && weather.length > 0
                    ? t("salesForecast.daysClear").replace(
                        "{count}",
                        String(
                          weather.filter(
                            (w) =>
                              w.condition === "sunny" ||
                              w.condition === "cloudy",
                          ).length,
                        ),
                      )
                    : t("salesForecast.weatherPending")}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Staffing advisory */}
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold">{t("salesForecast.staffingAdvisory")}</span>
            </div>
            {understaffedDays.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  <span className="text-amber-600 font-semibold">
                    {(understaffedDays.length > 1
                      ? t("salesForecast.daysCountPlural")
                      : t("salesForecast.daysCount")
                    ).replace("{count}", String(understaffedDays.length))}
                  </span>{" "}
                  {t("salesForecast.mayBeUnderstaffed")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("salesForecast.considerAddingShifts").replace(
                    "{days}",
                    understaffedDays
                      .map((d) => d.dayOfWeek.slice(0, 3))
                      .join(", "),
                  )}
                </p>
              </>
            ) : avgStaff === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("salesForecast.noShiftData")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("salesForecast.staffingAdequate").replace(
                  "{avg}",
                  String(Math.round(avgStaff)),
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
