"use client";

import { createElement, useId, useState } from "react";
import {
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  ListChecks,
  Minus,
  Package,
  Plug,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { Spinner } from "@/components/ui/loaders/geometric";
import { dateFromKey } from "@/lib/date-key";
import { useI18n } from "@/lib/i18n/context";
import { formatDate, intlLocaleTag } from "@/lib/i18n/dates";
import { fmt } from "@/lib/i18n/fmt";
import type { ToolStep, ToolStepStatus } from "@/lib/merchiva/tool-steps";
import { cn } from "@/lib/utils";

/*
 * The tool calls Mr. Merchiva made for one reply, at the top of his chat bubble: what he looked
 * at, whether it is still running, and how much came back. Built from ChatMessage.steps
 * (lib/merchiva/tool-steps.ts).
 */

type T = (key: string) => string;
/** Labels of one tool: [running, done, error]. */
type Labels = readonly [string, string, string];

/** More steps than this collapse behind a "{n} steps" toggle. */
const COLLAPSE_AFTER = 4;

// One line per tool with literal keys, so scripts/tests/i18n/keys.test.ts checks every one.
const TOOL_LABELS = new Map<string, (t: T) => Labels>([
  ["viewTeam", (t) => [t("merchiva.tools.viewTeam.running"), t("merchiva.tools.viewTeam.done"), t("merchiva.tools.viewTeam.error")]],
  ["viewRoles", (t) => [t("merchiva.tools.viewRoles.running"), t("merchiva.tools.viewRoles.done"), t("merchiva.tools.viewRoles.error")]],
  ["viewScheduleHistory", (t) => [t("merchiva.tools.viewScheduleHistory.running"), t("merchiva.tools.viewScheduleHistory.done"), t("merchiva.tools.viewScheduleHistory.error")]],
  ["viewUpcomingShifts", (t) => [t("merchiva.tools.viewUpcomingShifts.running"), t("merchiva.tools.viewUpcomingShifts.done"), t("merchiva.tools.viewUpcomingShifts.error")]],
  ["viewShiftPresets", (t) => [t("merchiva.tools.viewShiftPresets.running"), t("merchiva.tools.viewShiftPresets.done"), t("merchiva.tools.viewShiftPresets.error")]],
  ["viewAvailability", (t) => [t("merchiva.tools.viewAvailability.running"), t("merchiva.tools.viewAvailability.done"), t("merchiva.tools.viewAvailability.error")]],
  ["viewInventory", (t) => [t("merchiva.tools.viewInventory.running"), t("merchiva.tools.viewInventory.done"), t("merchiva.tools.viewInventory.error")]],
  ["viewSuppliers", (t) => [t("merchiva.tools.viewSuppliers.running"), t("merchiva.tools.viewSuppliers.done"), t("merchiva.tools.viewSuppliers.error")]],
  ["viewProducts", (t) => [t("merchiva.tools.viewProducts.running"), t("merchiva.tools.viewProducts.done"), t("merchiva.tools.viewProducts.error")]],
  ["viewSales", (t) => [t("merchiva.tools.viewSales.running"), t("merchiva.tools.viewSales.done"), t("merchiva.tools.viewSales.error")]],
  ["viewFinance", (t) => [t("merchiva.tools.viewFinance.running"), t("merchiva.tools.viewFinance.done"), t("merchiva.tools.viewFinance.error")]],
  ["viewForecast", (t) => [t("merchiva.tools.viewForecast.running"), t("merchiva.tools.viewForecast.done"), t("merchiva.tools.viewForecast.error")]],
  ["viewRestockSuggestions", (t) => [t("merchiva.tools.viewRestockSuggestions.running"), t("merchiva.tools.viewRestockSuggestions.done"), t("merchiva.tools.viewRestockSuggestions.error")]],
  ["proposeSchedule", (t) => [t("merchiva.tools.proposeSchedule.running"), t("merchiva.tools.proposeSchedule.done"), t("merchiva.tools.proposeSchedule.error")]],
]);

/** One icon per domain, matching the page each tool reads (lib/merchiva/tool-targets.ts). */
const TOOL_ICONS = new Map<string, LucideIcon>([
  ["viewTeam", Users],
  ["viewRoles", ListChecks],
  ["viewScheduleHistory", CalendarDays],
  ["viewUpcomingShifts", CalendarDays],
  ["viewShiftPresets", CalendarDays],
  ["viewAvailability", CalendarDays],
  ["proposeSchedule", CalendarDays],
  ["viewInventory", Package],
  ["viewRestockSuggestions", Package],
  ["viewSuppliers", Truck],
  ["viewProducts", ShoppingCart],
  ["viewSales", TrendingUp],
  ["viewForecast", TrendingUp],
  ["viewFinance", Banknote],
]);

/** The MCP tool's own name, without the `mcp_<label>_` key prefix (lib/merchiva/mcp/ai-tools.ts). */
function mcpToolName(tool: string, server: string): string {
  const prefix = `mcp_${server.toLowerCase().replace(/[^a-z0-9_]+/g, "_")}_`;
  if (tool.startsWith(prefix) && tool.length > prefix.length) return tool.slice(prefix.length);
  return tool.startsWith("mcp_") ? tool.slice(4) : tool;
}

interface StepText {
  label: string;
  /** False when the label does not say whether the call is running or finished (MCP tools). */
  saysStatus: boolean;
}

function stepText(step: ToolStep, t: T): StepText {
  const labels = TOOL_LABELS.get(step.tool)?.(t);
  if (labels) {
    const [running, done, error] = labels;
    return { label: step.status === "running" ? running : step.status === "done" ? done : error, saysStatus: true };
  }
  if (step.server) {
    return { label: fmt(t("merchiva.steps.mcp"), { server: step.server, tool: mcpToolName(step.tool, step.server) }), saysStatus: false };
  }
  const template = step.status === "running"
    ? t("merchiva.steps.unknownRunning")
    : step.status === "done" ? t("merchiva.steps.unknownDone") : t("merchiva.steps.unknownError");
  return { label: fmt(template, { tool: step.tool }), saysStatus: true };
}

/** viewFinance `period` values (lib/merchiva/tools/view-finance.ts). */
const PERIOD_LABELS = new Map<string, (t: T) => string>([
  ["this_week", (t) => t("merchiva.steps.period.thisWeek")],
  ["last_week", (t) => t("merchiva.steps.period.lastWeek")],
  ["this_month", (t) => t("merchiva.steps.period.thisMonth")],
  ["last_month", (t) => t("merchiva.steps.period.lastMonth")],
  ["this_quarter", (t) => t("merchiva.steps.period.thisQuarter")],
  ["this_year", (t) => t("merchiva.steps.period.thisYear")],
]);

/**
 * Tools whose `days` input counts forward: a forecast from today, a schedule draft from its first
 * day (lib/merchiva/tools/view-forecast.ts, propose-schedule.ts). Every other `days` looks back.
 */
const FORWARD_DAYS_TOOLS: ReadonlySet<string> = new Set(["viewForecast", "proposeSchedule"]);

/** The inputs worth showing next to the label ("last 30 days", "low stock only"). */
function argDetails(step: ToolStep, t: T, locale: string, num: (n: number) => string): string[] {
  const args = step.args;
  if (!args) return [];
  const out: string[] = [];
  if (typeof args.days === "number") {
    const template = FORWARD_DAYS_TOOLS.has(step.tool) ? t("merchiva.steps.nextDays") : t("merchiva.steps.days");
    out.push(fmt(template, { n: num(args.days) }));
  } else if (typeof args.period === "string") {
    const period = PERIOD_LABELS.get(args.period)?.(t);
    if (period) out.push(period);
  }
  if (args.lowOnly === true) out.push(t("merchiva.steps.lowOnly"));
  if (typeof args.supplier === "string") out.push(fmt(t("merchiva.steps.supplier"), { name: args.supplier }));
  if (typeof args.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.weekStart)) {
    const date = formatDate(dateFromKey(args.weekStart), locale, { month: "short", day: "numeric" });
    if (date) out.push(fmt(t("merchiva.steps.weekStart"), { date }));
  }
  return out;
}

function statusSrText(status: ToolStepStatus, t: T): string {
  if (status === "running") return t("merchiva.steps.status.running");
  if (status === "done") return t("merchiva.steps.status.done");
  if (status === "error") return t("merchiva.steps.status.error");
  return t("merchiva.steps.status.interrupted");
}

function StatusGlyph({ status }: { status: ToolStepStatus }) {
  if (status === "running") {
    return (
      <span aria-hidden className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center motion-reduce:[&_*]:animate-none!">
        <Spinner size={12} />
      </span>
    );
  }
  if (status === "done") return <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  if (status === "error") return <X aria-hidden className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  return <Minus aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />;
}

interface StepDescription {
  label: string;
  details: string[];
  /** "{n} results" once a call is done, else "". */
  results: string;
  /** The status in words when the label does not say it (MCP tools, interrupted calls), else "". */
  srStatus: string;
}

function describeStep(step: ToolStep, t: T, locale: string, num: (n: number) => string): StepDescription {
  const { label, saysStatus } = stepText(step, t);
  const results = step.status === "done" && typeof step.count === "number"
    ? step.count === 1 ? t("merchiva.steps.oneResult") : fmt(t("merchiva.steps.results"), { n: num(step.count) })
    : "";
  const srStatus = !saysStatus || step.status === "interrupted" ? statusSrText(step.status, t) : "";
  return { label, details: argDetails(step, t, locale, num), results, srStatus };
}

function numberFormatter(locale: string): (n: number) => string {
  const format = new Intl.NumberFormat(intlLocaleTag(locale));
  return (n) => format.format(n);
}

function StepRow({ step, t, locale, num }: { step: ToolStep; t: T; locale: string; num: (n: number) => string }) {
  const { label, details, results, srStatus } = describeStep(step, t, locale, num);
  const icon = TOOL_ICONS.get(step.tool) ?? (step.server ? Plug : Wrench);
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-[12px] leading-5">
      {createElement(icon, { "aria-hidden": true, className: "h-3.5 w-3.5 shrink-0 text-muted-foreground" })}
      <span
        className={cn(
          "min-w-0 truncate",
          step.status === "running" ? "text-foreground" : "text-muted-foreground",
          step.status === "interrupted" && "text-muted-foreground/70",
        )}
      >
        {label}
        {details.length > 0 && <span className="text-muted-foreground/80">{` · ${details.join(" · ")}`}</span>}
        {srStatus && <span className="sr-only">{` · ${srStatus}`}</span>}
      </span>
      <span className="ms-auto flex shrink-0 items-center gap-1.5 ps-2">
        {results && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{results}</span>}
        <StatusGlyph status={step.status} />
      </span>
    </li>
  );
}

/**
 * The steps of one reply. Screen readers hear them through the chat's ToolStepsAnnouncer, which is
 * mounted before the first step: a live region inserted together with its content is not read out.
 */
export function ToolSteps({ steps }: { steps: readonly ToolStep[] | undefined }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!steps || steps.length === 0) return null;
  const num = numberFormatter(locale);
  const collapsible = steps.length > COLLAPSE_AFTER;
  // Collapsed, the latest call stays visible so a running reply still shows what he is doing.
  const shown = collapsible && !open ? steps.slice(-1) : steps;
  return (
    <div className="flex flex-col gap-0.5">
      {collapsible && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="-mx-1 inline-flex h-6 items-center gap-1 self-start rounded px-1 text-[11.5px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
              !open && "-rotate-90 rtl:rotate-90",
            )}
          />
          <span className="font-mono tabular-nums">{fmt(t("merchiva.steps.count"), { n: num(steps.length) })}</span>
        </button>
      )}
      <ul id={listId} aria-label={t("merchiva.steps.label")} className="flex min-w-0 flex-col gap-0.5">
        {shown.map((step) => (
          <StepRow key={step.id} step={step} t={t} locale={locale} num={num} />
        ))}
      </ul>
    </div>
  );
}

/** The chat's latest message, as far as the announcer cares (a ChatMessage fits). */
export interface AnnouncedMessage {
  id: string;
  from: string;
  steps?: readonly ToolStep[];
}

/**
 * The reply the announcer speaks for, given the one it followed so far and the chat's latest
 * message. It picks up a Merchiva reply still being written — no calls yet, or one running — and
 * keeps it once its calls finish, so the last result is read out too. A reply restored from
 * history only has finished calls and is never picked up: opening a conversation reads nothing.
 */
export function followedReply(followed: string | null, latest: AnnouncedMessage | undefined): string | null {
  if (!latest || latest.from !== "merchiva") return followed;
  const writing = !latest.steps?.length || latest.steps.some((s) => s.status === "running");
  return writing ? latest.id : followed;
}

/** The step the announcer reads out: the latest call of the reply it follows. */
export function announcedStep(followed: string | null, latest: AnnouncedMessage | undefined): ToolStep | undefined {
  if (!latest || followed === null || latest.id !== followed || !latest.steps?.length) return undefined;
  return latest.steps[latest.steps.length - 1];
}

/**
 * One polite status region per chat, mounted for as long as the chat is, that reads out the latest
 * call of the reply Mr. Merchiva is writing: "Checking inventory…", then "Checked inventory · 12
 * results". The step lists in the bubbles are not live regions themselves — each first appears
 * together with its first step, and screen readers skip a region inserted with its content.
 */
export function ToolStepsAnnouncer({ message }: { message: AnnouncedMessage | undefined }) {
  const { t, locale } = useI18n();
  const [followed, setFollowed] = useState<string | null>(null);
  const next = followedReply(followed, message);
  if (next !== followed) setFollowed(next);
  const step = announcedStep(next, message);
  let text = "";
  if (step) {
    const { label, details, results, srStatus } = describeStep(step, t, locale, numberFormatter(locale));
    text = [label, ...details, results, srStatus].filter(Boolean).join(" · ");
  }
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {text}
    </div>
  );
}
