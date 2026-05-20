"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  Loader2,
  RefreshCw,
  Package,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  predictItems,
  trainModel,
  getNextNDates,
  type ItemPrediction,
  type TrainResponse,
} from "@/lib/ai-forecast";
import { usePermissions } from "@/lib/context/permissions";
import { usePayments } from "@/lib/spacetimedb/hooks";
import { useSettings } from "@/lib/spacetimedb/hooks/useSettings";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DayPredictions {
  date: string;
  dayLabel: string;
  items: ItemPrediction[];
  total: number;
}

export function ItemForecast() {
  const { organizationId } = usePermissions();
  const { settings } = useSettings();
  const [rawPayments] = usePayments();

  const [predictions, setPredictions] = useState<DayPredictions[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainResult, setTrainResult] = useState<TrainResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const trainingRecords = useMemo(() => {
    if (!organizationId || !rawPayments) return [];
    const payments = (rawPayments as unknown as Array<Record<string, unknown>>).filter(
      (p) =>
        p.organizationId === organizationId &&
        p.items &&
        p.status !== "refunded",
    );

    const records: { date: string; item: string; quantity: number }[] = [];
    for (const p of payments) {
      // payment.createdAt is a SpacetimeDB Timestamp object — extract epoch ms
      // from microsSinceUnixEpoch (preferred) or fall back to toDate().
      let ts = NaN;
      const ca = p.createdAt as
        | { microsSinceUnixEpoch?: bigint | number; toDate?: () => Date }
        | string
        | number
        | null
        | undefined;
      if (ca && typeof ca === "object") {
        if (typeof ca.toDate === "function") ts = ca.toDate().getTime();
        else if (typeof ca.microsSinceUnixEpoch === "bigint")
          ts = Number(ca.microsSinceUnixEpoch / 1000n);
        else if (typeof ca.microsSinceUnixEpoch === "number")
          ts = ca.microsSinceUnixEpoch / 1000;
      } else if (typeof ca === "number") ts = ca;
      else if (typeof ca === "string") ts = new Date(ca).getTime();
      if (!Number.isFinite(ts)) continue;
      const date = new Date(ts).toISOString().slice(0, 10);
      try {
        const items = JSON.parse(String(p.items ?? "[]")) as Array<{
          name: string;
          quantity: number;
        }>;
        for (const item of items) {
          if (item.name && item.quantity > 0) {
            records.push({ date, item: item.name, quantity: item.quantity });
          }
        }
      } catch {
        continue;
      }
    }
    return records;
  }, [rawPayments, organizationId]);

  const storeLocation = useMemo(() => {
    if (!settings?.locationLatitude || !settings?.locationLongitude) return undefined;
    return {
      lat: parseFloat(settings.locationLatitude),
      lon: parseFloat(settings.locationLongitude),
      timezone: settings.timezone ?? "America/New_York",
      country: "US",
    };
  }, [settings]);

  const handleTrain = useCallback(async () => {
    if (!organizationId || trainingRecords.length < 100) return;
    setTraining(true);
    setError(null);
    try {
      const result = await trainModel({
        org_id: organizationId,
        records: trainingRecords,
        location: storeLocation,
      });
      setTrainResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed");
    } finally {
      setTraining(false);
    }
  }, [organizationId, trainingRecords, storeLocation]);

  const handlePredict = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const dates = getNextNDates(7);
      const result = await predictItems(organizationId, dates);

      const byDay: DayPredictions[] = dates.map((date) => {
        const d = new Date(date + "T12:00:00");
        const items = result.predictions.filter((p) => p.date === date);
        return {
          date,
          dayLabel: `${DAY_NAMES[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`,
          items,
          total: items.reduce((s, p) => s + p.predicted_sales, 0),
        };
      });

      setPredictions(byDay);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      handlePredict();
    }
  }, [organizationId, handlePredict]);

  const selected = predictions?.[selectedDay];
  const displayItems = selected
    ? showAll
      ? selected.items
      : selected.items.slice(0, 15)
    : [];

  const chartData = selected
    ? selected.items.slice(0, 10).map((p) => ({
        name: p.item.length > 18 ? p.item.slice(0, 16) + "..." : p.item,
        qty: p.predicted_sales,
      }))
    : [];

  if (!organizationId) return null;

  if (error?.includes("No model trained") || error?.includes("404")) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center space-y-4">
          <Brain className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
          <div>
            <p className="font-semibold text-sm">AI Model Not Trained Yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {trainingRecords.length >= 100
                ? `You have ${trainingRecords.length.toLocaleString()} item-day records. Train the AI model to get per-item predictions.`
                : `Need at least 100 item-day records from payment history. Currently have ${trainingRecords.length}.`}
            </p>
          </div>
          {trainingRecords.length >= 100 && (
            <Button
              onClick={handleTrain}
              disabled={training}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {training ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Brain className="h-3.5 w-3.5" />
              )}
              {training ? "Training..." : "Train AI Model"}
            </Button>
          )}
          {trainResult && (
            <div className="text-xs text-muted-foreground">
              Model trained: {trainResult.items_count} items, {trainResult.days_count} days, R²={trainResult.metrics.r2.toFixed(2)}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Per-Item AI Forecast</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
            <Brain className="h-3 w-3" />
            XGBoost
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleTrain}
            disabled={training || trainingRecords.length < 100}
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
          >
            {training ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Retrain
          </Button>
          <Button
            onClick={handlePredict}
            disabled={loading}
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <TrendingUp className="h-3 w-3" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {error && !error.includes("404") && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded-[0.3rem]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !predictions && (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading predictions...</span>
        </div>
      )}

      {predictions && (
        <>
          {/* Day selector */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {predictions.map((day, i) => (
              <button
                key={day.date}
                onClick={() => {
                  setSelectedDay(i);
                  setShowAll(false);
                }}
                className={cn(
                  "rounded-[0.3rem] border p-2.5 text-left transition-colors cursor-pointer",
                  i === selectedDay
                    ? "border-foreground bg-accent"
                    : "hover:border-foreground/30 bg-card",
                )}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {i === 0 ? "Today" : day.dayLabel.split(" ")[0]}
                </span>
                <p className="text-xs text-muted-foreground">
                  {day.dayLabel.split(" ")[1]}
                </p>
                <p className="text-lg font-bold font-mono leading-tight mt-1">
                  {day.total}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  items total
                </p>
              </button>
            ))}
          </div>

          {/* Chart */}
          {selected && chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">
                      Top Items: {selected.dayLabel}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Predicted units to sell
                    </CardDescription>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    Total: {selected.total} items
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e7e5e4"
                      horizontal={false}
                    />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={130}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "2px",
                        border: "1px solid #e7e5e4",
                        fontSize: "11px",
                      }}
                      formatter={(v) => [`${v} units`, "Predicted"]}
                    />
                    <Bar
                      dataKey="qty"
                      fill="#a8a29e"
                      radius={[0, 2, 2, 0]}
                      activeBar={{ fill: "#44403c" }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Item list */}
          {selected && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  All Items: {selected.dayLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {displayItems.map((item) => (
                    <div
                      key={item.item}
                      className="flex items-center justify-between py-1.5 px-2 rounded-sm hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{item.item}</span>
                      </div>
                      <span className="text-sm font-mono font-semibold shrink-0 ml-2">
                        {item.predicted_sales}
                      </span>
                    </div>
                  ))}
                </div>
                {selected.items.length > 15 && (
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 mx-auto cursor-pointer"
                  >
                    {showAll ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Show all {selected.items.length} items
                      </>
                    )}
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Train result toast */}
          {trainResult && (
            <div className="text-xs text-muted-foreground text-center">
              Last trained: {trainResult.items_count} items across {trainResult.days_count} days — MAE: {trainResult.metrics.mae.toFixed(1)}, R²: {trainResult.metrics.r2.toFixed(2)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
