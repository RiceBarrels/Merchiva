"use client";

// Responses ▸ Summary: one card per question from summarizeResponses (lib/forms/summary.ts). Counts are single-series
// bars in one hue (no legend: the card title names the series), each with a hover tooltip and its count printed in
// muted ink at the bar's end; numbers get average / min / max; text gets the latest answers; files a count.

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { StatusBadge } from "@/components/ui/status-badge";
import type { FormSummary, QuestionSummary } from "@/lib/forms/summary";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDateFormat } from "@/lib/i18n/use-date-format";

interface Bucket {
  label: string;
  count: number;
}

const BAR = "var(--chart-1)";
const INK = "var(--muted-foreground)";
const GRID = "var(--border)";
const tooltipStyle = { borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--popover)", fontSize: 12 };

/** Horizontal bars, one row per bucket (options, yes/no). */
function RowBars({ data, countLabel }: { data: Bucket[]; countLabel: string }) {
  const height = Math.max(64, data.length * 32 + 8);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={140} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: INK }} />
        <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} formatter={(v) => [String(v), countLabel]} />
        <Bar dataKey="count" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
          <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: INK, fontVariantNumeric: "tabular-nums" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical bars for a rating or scale distribution (low to high). */
function ColumnBars({ data, countLabel }: { data: Bucket[]; countLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: -24 }} barCategoryGap={4}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: INK }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: INK }} />
        <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} formatter={(v) => [String(v), countLabel]} />
        <Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {value === null ? <span className="text-sm text-muted-foreground">—</span> : <Num value={value} decimals={value % 1 === 0 ? 0 : 1} />}
    </div>
  );
}

function QuestionBody({ q }: { q: QuestionSummary }) {
  const t = useT();
  const formatDate = useDateFormat();
  const countLabel = t("forms.responses.count");
  switch (q.kind) {
    case "choice": {
      const data: Bucket[] = q.counts.map((c) => ({ label: c.label, count: c.count }));
      if (q.otherCount > 0) data.push({ label: t("forms.export.removedOption"), count: q.otherCount });
      return <RowBars data={data} countLabel={countLabel} />;
    }
    case "boolean":
      return (
        <RowBars
          countLabel={countLabel}
          data={[{ label: t("forms.export.yes"), count: q.yes }, { label: t("forms.export.no"), count: q.no }]}
        />
      );
    case "numeric":
      return (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric label={t("forms.responses.average")} value={q.average} />
            <Metric label={t("forms.responses.min")} value={q.min} />
            <Metric label={t("forms.responses.max")} value={q.max} />
          </div>
          {q.distribution.length > 0 && (
            <ColumnBars countLabel={countLabel} data={q.distribution.map((d) => ({ label: String(d.value), count: d.count }))} />
          )}
        </div>
      );
    case "text":
      if (q.recent.length === 0) return <p className="text-sm text-muted-foreground">{t("forms.responses.noAnswers")}</p>;
      return (
        <ul className="flex flex-col divide-y divide-border">
          {q.recent.map((r, i) => (
            <li key={i} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
              <span className="text-sm break-words whitespace-pre-line">{r.value}</span>
              <span className="text-xs text-muted-foreground">
                {r.respondentName || t("forms.export.anonymous")} ·{" "}
                <span className="font-mono tabular-nums">{formatDate(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
              </span>
            </li>
          ))}
        </ul>
      );
    case "files":
      return <p className="text-sm">{fmt(t("forms.responses.fileCount"), { count: q.fileCount })}</p>;
  }
}

export function ResponsesSummary({ summary }: { summary: FormSummary }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      {summary.questions.map((q) => (
        <Card key={q.questionId} className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium break-words">{q.title}</h3>
              <p className="text-xs text-muted-foreground">
                {fmt(t("forms.responses.answeredOf"), { answered: q.answered, total: summary.total })}
              </p>
            </div>
            {q.archived && <StatusBadge>{t("forms.responses.archivedQuestion")}</StatusBadge>}
          </div>
          <QuestionBody q={q} />
        </Card>
      ))}
    </div>
  );
}
