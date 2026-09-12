"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ArrowDownToLine, ArrowUpFromLine, DollarSign, Activity, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/context";
import { useAiUsage, useAiUsageQuota } from "@/lib/spacetimedb/hooks/useAiUsage";

const FEATURE_LABELS: Record<string, string> = {
  mr_merchiva: "Mr. Merchiva",
  store_ai: "Mr. Merchiva (chat)",
  store_ai_bg: "Mr. Merchiva (background)",
  store_ai_triage: "Mr. Merchiva (triage)",
  store_ai_bg_triage: "Mr. Merchiva (bg triage)",
  store_ai_voice: "Mr. Merchiva (voice)",
  store_ai_summarize: "Chat summarize",
  store_ai_weekly_summary: "Weekly summary",
  morning_briefing: "Morning briefing",
  schedule_proposal: "Schedule proposal",
  supplier_agent: "Supplier agent",
  design_chat: "Design chat",
  design_generate: "Design generate",
  builder_chat: "Site builder chat",
  builder_generate: "Site builder generate",
};

function featureLabel(f: string): string {
  return FEATURE_LABELS[f] ?? f;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtCost(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function fmtTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * AI usage dashboard, designed to drop into a settings sub-panel. Self-contained:
 * subscribes to the org's ai_usage / ai_usage_quota tables and renders monthly
 * totals, a daily-cost chart, a by-feature breakdown, quota progress, and a
 * month selector.
 */
export function UsageSection() {
  const t = useT();
  const { entries, isReady } = useAiUsage();
  const { quota } = useAiUsageQuota();
  const [month, setMonth] = useState<string>(currentMonth());
  const [featureFilter, setFeatureFilter] = useState<string>("all");

  const months = useMemo(() => {
    const set = new Set<string>(entries.map((e) => e.month).filter(Boolean));
    set.add(currentMonth());
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [entries]);

  const monthEntries = useMemo(
    () => entries.filter((e) => e.month === month),
    [entries, month],
  );

  const totals = useMemo(() => {
    return monthEntries.reduce(
      (acc, e) => {
        acc.inputTokens += e.inputTokens;
        acc.outputTokens += e.outputTokens;
        acc.cost += e.cost;
        acc.calls += 1;
        return acc;
      },
      { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 },
    );
  }, [monthEntries]);

  const daily = useMemo(() => {
    const map = new Map<string, { day: string; cost: number; inputTokens: number; outputTokens: number }>();
    for (const e of monthEntries) {
      const d = map.get(e.day) ?? { day: e.day, cost: 0, inputTokens: 0, outputTokens: 0 };
      d.cost += e.cost;
      d.inputTokens += e.inputTokens;
      d.outputTokens += e.outputTokens;
      map.set(e.day, d);
    }
    return [...map.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({ ...d, label: d.day.slice(8) }));
  }, [monthEntries]);

  const byFeature = useMemo(() => {
    const map = new Map<string, { feature: string; cost: number; inputTokens: number; outputTokens: number; calls: number }>();
    for (const e of monthEntries) {
      const f = map.get(e.feature) ?? { feature: e.feature, cost: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
      f.cost += e.cost;
      f.inputTokens += e.inputTokens;
      f.outputTokens += e.outputTokens;
      f.calls += 1;
      map.set(e.feature, f);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [monthEntries]);

  const maxFeatureCost = Math.max(1e-9, ...byFeature.map((f) => f.cost));

  // Distinct features present this month (for the activity-log filter).
  const logFeatures = useMemo(
    () => [...new Set(monthEntries.map((e) => e.feature))].sort(),
    [monthEntries],
  );
  // monthEntries is already newest-first (the hook sorts by createdAt desc).
  const logEntries = useMemo(
    () =>
      featureFilter === "all"
        ? monthEntries
        : monthEntries.filter((e) => e.feature === featureFilter),
    [monthEntries, featureFilter],
  );

  const tokenQuotaUsed = totals.inputTokens + totals.outputTokens;
  const tokenQuotaPct =
    quota?.monthlyTokenLimit && quota.monthlyTokenLimit > 0
      ? Math.min(100, (tokenQuotaUsed / quota.monthlyTokenLimit) * 100)
      : null;
  const costQuotaPct =
    quota?.monthlyCostLimit && quota.monthlyCostLimit > 0
      ? Math.min(100, (totals.cost / quota.monthlyCostLimit) * 100)
      : null;

  return (
    <div className="space-y-4 p-4">
      {/* Header row with month selector */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{t("usage.title")}</div>
          <div className="text-xs text-muted-foreground">{t("usage.subtitle")}</div>
        </div>
        <Select value={month} onValueChange={(v) => v && setMonth(v)}>
          <SelectTrigger className="h-9 w-[140px] font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m} className="font-mono text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stat cards */}
      <StatGrid>
        <StatTile
          icon={ArrowDownToLine}
          label={t("usage.inputTokens")}
          value={fmtTokens(totals.inputTokens)}
          sub={fmtCost((totals.inputTokens / 1_000_000) * 2)}
        />
        <StatTile
          icon={ArrowUpFromLine}
          label={t("usage.outputTokens")}
          value={fmtTokens(totals.outputTokens)}
          sub={fmtCost((totals.outputTokens / 1_000_000) * 10)}
        />
        <StatTile
          icon={DollarSign}
          label={t("usage.totalCost")}
          value={fmtCost(totals.cost)}
          sub={t("usage.thisMonth")}
        />
        <StatTile
          icon={Activity}
          label={t("usage.calls")}
          value={String(totals.calls)}
          sub={t("usage.aiRequests")}
        />
      </StatGrid>

      {/* Quota */}
      {(tokenQuotaPct !== null || costQuotaPct !== null) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Eyebrow>{t("usage.quota")}</Eyebrow>
            {costQuotaPct !== null && quota?.monthlyCostLimit != null && (
              <QuotaBar
                label={t("usage.costLimit")}
                used={fmtCost(totals.cost)}
                limit={fmtCost(quota.monthlyCostLimit)}
                pct={costQuotaPct}
              />
            )}
            {tokenQuotaPct !== null && quota?.monthlyTokenLimit != null && (
              <QuotaBar
                label={t("usage.tokenLimit")}
                used={fmtTokens(tokenQuotaUsed)}
                limit={fmtTokens(quota.monthlyTokenLimit)}
                pct={tokenQuotaPct}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Daily chart */}
      <Card>
        <CardContent className="p-4">
          <Eyebrow className="mb-3">{t("usage.dailyCost")}</Eyebrow>
          {!isReady ? (
            <div className="flex h-[220px] flex-col justify-center gap-2">
              <SkeletonText width="60%" />
              <SkeletonText width="85%" />
              <SkeletonText width="40%" />
            </div>
          ) : daily.length === 0 ? (
            <EmptyState icon={Sparkles} description={t("usage.empty")} className="h-[220px]" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={daily} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="usageSectionFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#44403c" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#44403c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#a8a29e" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="#a8a29e"
                  tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                  width={56}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "0.3rem", border: "1px solid #e7e5e4", fontSize: 12 }}
                  formatter={(value) => [fmtCost(Number(value)), t("usage.cost")]}
                  labelFormatter={(l) => `${month}-${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#44403c"
                  strokeWidth={2}
                  fill="url(#usageSectionFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* By feature */}
      <Card>
        <CardContent className="p-4">
          <Eyebrow className="mb-3">{t("usage.byFeature")}</Eyebrow>
          {byFeature.length === 0 ? (
            <EmptyState compact description={t("usage.empty")} />
          ) : (
            <div className="space-y-2.5">
              {byFeature.map((f) => (
                <div key={f.feature} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{featureLabel(f.feature)}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {fmtCost(f.cost)} · {fmtTokens(f.inputTokens + f.outputTokens)} tok · {f.calls}×
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-foreground"
                      style={{ width: `${(f.cost / maxFeatureCost) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity log — every call, newest first, filterable by feature */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Eyebrow>{t("usage.activityLog")}</Eyebrow>
            <Select value={featureFilter} onValueChange={(v) => v && setFeatureFilter(v)}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {t("usage.allFeatures")}
                </SelectItem>
                {logFeatures.map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">
                    {featureLabel(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {logEntries.length === 0 ? (
            <EmptyState compact description={t("usage.noRecords")} />
          ) : (
            <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
              {logEntries.map((e) => (
                <div key={e.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                        {featureLabel(e.feature)}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {fmtTime(e.createdAtMs)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] text-foreground/90">
                      {e.description || (
                        <span className="text-muted-foreground">{t("usage.noDescription")}</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[13px] font-semibold tabular-nums">
                      {fmtCost(e.cost)}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {fmtTokens(e.inputTokens)}↓ / {fmtTokens(e.outputTokens)}↑
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuotaBar({
  label,
  used,
  limit,
  pct,
}: {
  label: string;
  used: string;
  limit: string;
  pct: number;
}) {
  const over = pct >= 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {used} / {limit} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={"h-full " + (over ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-foreground")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
