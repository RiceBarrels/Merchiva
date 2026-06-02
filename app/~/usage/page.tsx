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
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
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

export default function UsagePage() {
  const t = useT();
  const { entries, isReady } = useAiUsage();
  const { quota } = useAiUsageQuota();
  const [month, setMonth] = useState<string>(currentMonth());

  // Months that have data, plus the current month, newest first.
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
      .map((d) => ({ ...d, label: d.day.slice(8) })); // DD
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
    <PermissionGuard section="settings">
      <PageHeader
        title={t("usage.title")}
        subtitle={t("usage.subtitle")}
        right={
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
        }
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-4 space-y-4">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<ArrowDownToLine className="h-4 w-4" />}
            label={t("usage.inputTokens")}
            value={fmtTokens(totals.inputTokens)}
            sub={fmtCost((totals.inputTokens / 1_000_000) * 2)}
          />
          <StatCard
            icon={<ArrowUpFromLine className="h-4 w-4" />}
            label={t("usage.outputTokens")}
            value={fmtTokens(totals.outputTokens)}
            sub={fmtCost((totals.outputTokens / 1_000_000) * 10)}
          />
          <StatCard
            icon={<DollarSign className="h-4 w-4" />}
            label={t("usage.totalCost")}
            value={fmtCost(totals.cost)}
            sub={t("usage.thisMonth")}
            emphasize
          />
          <StatCard
            icon={<Activity className="h-4 w-4" />}
            label={t("usage.calls")}
            value={String(totals.calls)}
            sub={t("usage.aiRequests")}
          />
        </div>

        {/* Quota */}
        {(tokenQuotaPct !== null || costQuotaPct !== null) && (
          <Card className="rounded-[0.3rem]">
            <CardContent className="p-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("usage.quota")}
              </div>
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
        <Card className="rounded-[0.3rem]">
          <CardContent className="p-4">
            <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("usage.dailyCost")}
            </div>
            {!isReady ? (
              <div className="h-[260px] animate-pulse rounded bg-muted/40" />
            ) : daily.length === 0 ? (
              <div className="flex h-[260px] flex-col items-center justify-center text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground opacity-40" />
                <p className="mt-2 text-sm text-muted-foreground">{t("usage.empty")}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={daily} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#usageFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* By feature */}
        <Card className="rounded-[0.3rem]">
          <CardContent className="p-4">
            <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("usage.byFeature")}
            </div>
            {byFeature.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("usage.empty")}</p>
            ) : (
              <div className="space-y-2.5">
                {byFeature.map((f) => (
                  <div key={f.feature} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{featureLabel(f.feature)}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {fmtCost(f.cost)} · {fmtTokens(f.inputTokens + f.outputTokens)} tok · {f.calls}×
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-stone-700"
                        style={{ width: `${(f.cost / maxFeatureCost) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  emphasize,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <Card className="rounded-[0.3rem]">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div
          className={
            "mt-2 font-mono tabular-nums " +
            (emphasize ? "text-2xl font-semibold text-stone-900" : "text-2xl font-semibold")
          }
        >
          {value}
        </div>
        {sub && <div className="mt-0.5 font-mono text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
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
        <span className="font-mono text-xs text-muted-foreground">
          {used} / {limit} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={"h-full " + (over ? "bg-red-600" : pct > 80 ? "bg-amber-500" : "bg-stone-700")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
