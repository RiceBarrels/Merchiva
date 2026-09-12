"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, RefreshCw, Package, TrendingUp, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
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
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/loaders/geometric";

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
  const t = useT();
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
      setError(err instanceof Error ? err.message : t("itemForecast.trainingFailed"));
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
      setError(err instanceof Error ? err.message : t("itemForecast.predictionFailed"));
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
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={Brain}
            title={t("itemForecast.modelNotTrained")}
            description={
              trainingRecords.length >= 100
                ? t("itemForecast.recordsReady").replace("{count}", trainingRecords.length.toLocaleString())
                : t("itemForecast.recordsNeeded").replace("{count}", String(trainingRecords.length))
            }
            action={
              trainingRecords.length >= 100 ? (
                <Button
                  onClick={handleTrain}
                  disabled={training}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  {training ? (
                    <Spinner size={14} />
                  ) : (
                    <Brain className="h-3.5 w-3.5" />
                  )}
                  {training ? t("itemForecast.training") : t("itemForecast.trainModel")}
                </Button>
              ) : undefined
            }
          >
            {trainResult && (
              <div className="text-xs text-muted-foreground">
                {t("itemForecast.modelTrainedSummary")
                  .replace("{items}", String(trainResult.items_count))
                  .replace("{days}", String(trainResult.days_count))
                  .replace("{r2}", trainResult.metrics.r2.toFixed(2))}
              </div>
            )}
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t("itemForecast.title")}</h3>
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
              <Spinner size={12} />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t("itemForecast.retrain")}
          </Button>
          <Button
            onClick={handlePredict}
            disabled={loading}
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
          >
            {loading ? (
              <Spinner size={12} />
            ) : (
              <TrendingUp className="h-3 w-3" />
            )}
            {t("itemForecast.refresh")}
          </Button>
        </div>
      </div>

      {error && !error.includes("404") && (
        <Callout tone="danger" icon={AlertCircle}>
          {error}
        </Callout>
      )}

      {loading && !predictions && (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Spinner size={16} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t("itemForecast.loadingPredictions")}</span>
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
                  "rounded-lg border p-2.5 text-left transition-colors cursor-pointer",
                  i === selectedDay
                    ? "border-foreground bg-accent"
                    : "hover:border-foreground/30 bg-card",
                )}
              >
                <Eyebrow as="span" size="xs">
                  {i === 0 ? t("itemForecast.today") : day.dayLabel.split(" ")[0]}
                </Eyebrow>
                <p className="text-xs text-muted-foreground">
                  {day.dayLabel.split(" ")[1]}
                </p>
                <p className="text-lg font-bold font-mono tabular-nums leading-tight mt-1">
                  {day.total}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t("itemForecast.itemsTotal")}
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
                      {t("itemForecast.topItems").replace("{day}", selected.dayLabel)}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {t("itemForecast.predictedUnits")}
                    </CardDescription>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {t("itemForecast.totalItems").replace("{count}", String(selected.total))}
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
                      formatter={(v) => [t("itemForecast.unitsValue").replace("{count}", String(v)), t("itemForecast.predicted")]}
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
                  {t("itemForecast.allItems").replace("{day}", selected.dayLabel)}
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
                      <span className="text-sm font-mono font-semibold tabular-nums shrink-0 ml-2">
                        {item.predicted_sales}
                      </span>
                    </div>
                  ))}
                </div>
                {selected.items.length > 15 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowAll(!showAll)}
                    className="flex mt-2 mx-auto text-muted-foreground"
                  >
                    {showAll ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        {t("itemForecast.showLess")}
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        {t("itemForecast.showAllItems").replace("{count}", String(selected.items.length))}
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Train result toast */}
          {trainResult && (
            <div className="text-xs text-muted-foreground text-center">
              {t("itemForecast.lastTrainedSummary")
                .replace("{items}", String(trainResult.items_count))
                .replace("{days}", String(trainResult.days_count))
                .replace("{mae}", trainResult.metrics.mae.toFixed(1))
                .replace("{r2}", trainResult.metrics.r2.toFixed(2))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
