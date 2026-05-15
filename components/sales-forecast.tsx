"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  CloudLightning,
  TrendingUp,
  Users,
  BarChart3,
  MapPin,
  AlertCircle,
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
import { useSalesRecords, useShifts } from "@/lib/spacetimedb/hooks";
import { usePermissions } from "@/lib/context/permissions";
import { cn } from "@/lib/utils";

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
      return <CloudRain className="h-4 w-4 text-blue-400" />;
    case "snowy":
      return <Snowflake className="h-4 w-4 text-sky-300" />;
    case "stormy":
      return <CloudLightning className="h-4 w-4 text-violet-400" />;
    default:
      return <Cloud className="h-4 w-4 text-stone-400 dark:text-stone-500" />;
  }
}

function confidenceColor(c: number): string {
  if (c >= 70) return "bg-emerald-500";
  if (c >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function qualityBadge(q: ForecastResult["dataQuality"]): {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
} {
  switch (q) {
    case "excellent":
      return { label: "Excellent data", variant: "default" };
    case "good":
      return { label: "Good data", variant: "secondary" };
    case "fair":
      return { label: "Fair data", variant: "outline" };
    case "poor":
      return { label: "Limited data", variant: "destructive" };
  }
}

function formatMultiplier(m: number): string {
  const pct = Math.round((m - 1) * 100);
  if (pct === 0) return "neutral";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SalesForecast() {
  const { organizationId } = usePermissions();
  const [rawSales] = useSalesRecords();
  const [rawShifts] = useShifts();

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
    return (rawSales as unknown as Array<Record<string, unknown>>)
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
  }, [rawSales, organizationId]);

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
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading forecast data...
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[0.3rem] border p-3 space-y-2 bg-card"
            >
              <div className="h-3 w-10 bg-muted rounded-sm animate-pulse" />
              <div className="h-5 w-14 bg-muted rounded-sm animate-pulse" />
              <div className="h-1.5 w-full bg-muted rounded-sm animate-pulse" />
              <div className="h-3 w-20 bg-muted rounded-sm animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── No history state ─────────────────────────────────────────────────────

  if (salesHistory.length < 7) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center space-y-3">
          <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
          <div>
            <p className="font-semibold text-sm">
              Not enough data for forecasting
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Need at least 7 days of sales data for predictions. Currently
              tracking{" "}
              {new Set(salesHistory.filter((r) => r.hour === undefined).map((r) => r.date)).size}{" "}
              days.
            </p>
          </div>
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
          <h3 className="text-sm font-semibold">7-Day Forecast</h3>
          <Badge variant={qb.variant} className="text-[10px] px-1.5 py-0">
            {qb.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {!geoCoords && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              No location — weather unavailable
            </span>
          )}
          {weatherError && geoCoords && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertCircle className="h-3 w-3" />
              Weather data unavailable
            </span>
          )}
          <span className="font-mono">
            {forecast.overallConfidence}% confidence
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
                "rounded-[0.3rem] border p-2.5 text-left transition-colors cursor-pointer",
                isSelected
                  ? "border-foreground bg-accent"
                  : "hover:border-foreground/30 bg-card",
              )}
            >
              {/* Day name + date */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {isToday ? "Today" : day.dayOfWeek.slice(0, 3)}
                </span>
                {weatherIcon(day.factors.weatherLabel)}
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>

              {/* Predicted revenue */}
              <p className="text-base font-bold font-mono leading-tight">
                {formatCurrency(day.predicted)}
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
                  <span>Base:</span>
                  <span className="font-mono">
                    {formatCurrency(day.factors.baseLine)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Weather:</span>
                  <span className="font-mono">
                    {formatMultiplier(day.factors.weatherMultiplier)}
                  </span>
                </div>
                {day.factors.holidayName && (
                  <div className="flex items-center gap-1 text-amber-600">
                    <span>Holiday:</span>
                    <span className="truncate">
                      {formatMultiplier(day.factors.holidayMultiplier)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>Traffic:</span>
                  <span>{day.factors.footTrafficLevel}</span>
                </div>
                {day.factors.staffCount > 0 && (
                  <div className="flex items-center gap-1">
                    <span>Staff:</span>
                    <span>{day.factors.staffCount}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>Trend:</span>
                  <span className="font-mono">
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
                  Hourly Breakdown:{" "}
                  {selected.dayOfWeek},{" "}
                  {new Date(selected.date + "T12:00:00").toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" },
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  Predicted revenue per hour
                </CardDescription>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                Total: {formatCurrency(selected.predicted)}
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
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "2px",
                    border: "1px solid #e7e5e4",
                    fontSize: "11px",
                  }}
                  formatter={(v) => [`$${v}`, "Predicted"]}
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
              <span className="text-xs font-semibold">Best Day</span>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {bestDay.dayOfWeek}
              </span>{" "}
              at{" "}
              <span className="font-mono font-semibold text-foreground">
                {formatCurrency(bestDay.predicted)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {bestDay.factors.holidayName
                ? `Boosted by ${bestDay.factors.holidayName}`
                : bestDay.factors.footTrafficLevel === "high" ||
                    bestDay.factors.footTrafficLevel === "very_high"
                  ? "High expected foot traffic"
                  : `Strong ${bestDay.dayOfWeek} baseline`}
            </p>
          </CardContent>
        </Card>

        {/* Weather impact */}
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              {weatherIcon(worstWeatherDay.factors.weatherLabel)}
              <span className="text-xs font-semibold">Weather Impact</span>
            </div>
            {!geoCoords ? (
              <p className="text-xs text-muted-foreground">
                Enable location access to see weather-based predictions
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {worstWeatherDay.factors.weatherMultiplier < 0.95 ? (
                    <>
                      <span className="font-semibold text-foreground">
                        {worstWeatherDay.dayOfWeek}
                      </span>{" "}
                      may see{" "}
                      <span className="font-mono">
                        {formatMultiplier(
                          worstWeatherDay.factors.weatherMultiplier,
                        )}
                      </span>{" "}
                      due to {worstWeatherDay.factors.weatherLabel} weather
                    </>
                  ) : (
                    "Favorable weather expected all week"
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {weather && weather.length > 0
                    ? `${weather.filter((w) => w.condition === "sunny" || w.condition === "cloudy").length}/7 days clear`
                    : "Weather data pending"}
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
              <span className="text-xs font-semibold">Staffing Advisory</span>
            </div>
            {understaffedDays.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  <span className="text-amber-600 font-semibold">
                    {understaffedDays.length} day
                    {understaffedDays.length > 1 ? "s" : ""}
                  </span>{" "}
                  may be understaffed
                </p>
                <p className="text-xs text-muted-foreground">
                  {understaffedDays.map((d) => d.dayOfWeek.slice(0, 3)).join(", ")}{" "}
                  — consider adding shifts
                </p>
              </>
            ) : avgStaff === 0 ? (
              <p className="text-xs text-muted-foreground">
                No shift data available. Schedule shifts to enable staffing
                recommendations.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Staffing looks adequate across all 7 days (avg{" "}
                {Math.round(avgStaff)} per day)
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
