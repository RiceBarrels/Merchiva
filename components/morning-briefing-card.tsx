"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  Package,
  Calendar,
  ArrowRightLeft,
  AlertTriangle,
  History,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MerchivaLogo } from "@/components/logo";
import { usePermissions } from "@/lib/context/permissions";
import {
  useDailyBriefings,
  useShifts,
  useStaffMembers,
  useOrgMembers,
  useInventoryItems,
  useTimeOffRequests,
  useShiftTrades,
} from "@/lib/spacetimedb/hooks";
import {
  saveDailyBriefing,
  updateTimeOffStatus,
  managerApproveShiftTrade,
  addInventoryTransaction,
} from "@/lib/spacetimedb/actions";
import { useI18n, useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function sanitizeBriefingHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "");
}

interface BriefingRow {
  id: { toString(): string };
  organizationId: string;
  date: string;
  content: string;
  summary?: string | null;
  generatedBy: string;
}

type AgentState = "working" | "done" | "idle" | "attention";

function MerchivaMark({ state }: { state: AgentState }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-[0.3rem] bg-stone-900 dark:bg-stone-100">
        <MerchivaLogo size={16} fg="var(--background)" />
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
          state === "working" && "bg-amber-500 animate-pulse",
          state === "attention" && "bg-rose-500",
          state === "done" && "bg-emerald-500",
          state === "idle" && "bg-stone-400",
        )}
      />
    </span>
  );
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Issue model ──────────────────────────────────────────────────────────
type Severity = "high" | "medium" | "low";

type IssueAction =
  | { kind: "approveTimeOff"; requestId: string }
  | { kind: "rejectTimeOff"; requestId: string }
  | { kind: "approveTrade"; tradeId: string }
  | { kind: "rejectTrade"; tradeId: string }
  | { kind: "restock"; itemName: string; delta: number };

interface IssueActionButton {
  label: string;
  primary?: boolean;
  action: IssueAction;
}

interface Issue {
  id: string;
  severity: Severity;
  icon: LucideIcon;
  label: string;
  sub?: string;
  actions: IssueActionButton[];
}

export function MorningBriefingCard() {
  const t = useT();
  const { locale } = useI18n();
  const { organizationId, isOwner, role: orgRole } = usePermissions();
  const isAdmin = isOwner || orgRole === "manager";

  const [rawBriefings] = useDailyBriefings() as [unknown[], boolean];
  const [shifts] = useShifts() as [unknown[], boolean];
  const [staffMembers] = useStaffMembers() as [unknown[], boolean];
  const [orgMembers] = useOrgMembers() as [unknown[], boolean];
  const [inventoryItems] = useInventoryItems() as [unknown[], boolean];
  const [timeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [shiftTrades] = useShiftTrades() as [unknown[], boolean];

  const today = todayLocal();

  const todaysBriefing = useMemo<BriefingRow | null>(() => {
    if (!organizationId) return null;
    for (const r of rawBriefings as BriefingRow[]) {
      if (r.organizationId === organizationId && r.date === today) return r;
    }
    return null;
  }, [rawBriefings, organizationId, today]);

  const briefingHistory = useMemo<BriefingRow[]>(() => {
    if (!organizationId) return [];
    return (rawBriefings as BriefingRow[])
      .filter((r) => r.organizationId === organizationId && r.date !== today)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 14);
  }, [rawBriefings, organizationId, today]);

  // ── Live issue detection from current DB state ─────────────────────────
  const issues = useMemo<Issue[]>(() => {
    if (!organizationId) return [];
    const out: Issue[] = [];

    /* eslint-disable @typescript-eslint/no-explicit-any */

    // Pending time-off requests
    for (const r of timeOff as any[]) {
      if (r.organizationId !== organizationId || r.status !== "pending") continue;
      const member = (orgMembers as any[]).find(
        (m) => m.userId?.toString?.() === r.userId?.toString?.(),
      );
      const name = member?.displayName || "Staff member";
      const range = r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`;
      const rid = r.id.toString();
      out.push({
        id: `to-${rid}`,
        severity: "medium",
        icon: Calendar,
        label: `${name} requested time off`,
        sub: range,
        actions: [
          { label: "Reject", action: { kind: "rejectTimeOff", requestId: rid } },
          { label: "Approve", primary: true, action: { kind: "approveTimeOff", requestId: rid } },
        ],
      });
    }

    // Pending shift trades
    for (const r of shiftTrades as any[]) {
      if (r.organizationId !== organizationId || r.status !== "pending") continue;
      const requester = (staffMembers as any[]).find(
        (m) => m.id?.toString?.() === r.requesterId?.toString?.(),
      );
      const target = (staffMembers as any[]).find(
        (m) => m.id?.toString?.() === r.targetId?.toString?.(),
      );
      const reqName = requester?.name || "Staff";
      const tgtName = target?.name || (r.broadcastToAll ? "anyone" : "Staff");
      const tid = r.id.toString();
      out.push({
        id: `st-${tid}`,
        severity: "medium",
        icon: ArrowRightLeft,
        label: `Shift trade · ${reqName} → ${tgtName}`,
        sub: r.comments || r.type,
        actions: [
          { label: "Reject", action: { kind: "rejectTrade", tradeId: tid } },
          { label: "Approve", primary: true, action: { kind: "approveTrade", tradeId: tid } },
        ],
      });
    }

    // Inventory at or below minimum
    for (const i of inventoryItems as any[]) {
      if (i.organizationId !== organizationId) continue;
      const cur = Number(i.currentStock ?? 0);
      const min = Number(i.minStock ?? 0);
      if (min <= 0 || cur > min) continue;
      const isOut = cur <= 0;
      const target = Math.max(min * 2, min + 1);
      const delta = Math.max(1, Math.ceil(target - cur));
      out.push({
        id: `inv-${i.id.toString()}`,
        severity: isOut ? "high" : "medium",
        icon: Package,
        label: `${i.name} ${isOut ? "out of stock" : "below minimum"}`,
        sub: `${cur} / ${min} ${i.unit || ""}`.trim(),
        actions: [
          {
            label: `Restock +${delta}`,
            primary: true,
            action: { kind: "restock", itemName: i.name, delta },
          },
        ],
      });
    }

    // Today's shifts without an assigned org member
    for (const s of shifts as any[]) {
      if (s.organizationId !== organizationId) continue;
      if (s.date !== today) continue;
      if (s.memberId) continue;
      out.push({
        id: `shift-${s.id.toString()}`,
        severity: "high",
        icon: AlertTriangle,
        label: "Unassigned shift today",
        sub: `${s.startTime}–${s.endTime} · ${s.staffName || s.staffRole || "no one"}`,
        actions: [],
      });
    }

    /* eslint-enable @typescript-eslint/no-explicit-any */

    const weight = (x: Severity) => (x === "high" ? 0 : x === "medium" ? 1 : 2);
    return out.sort((a, b) => weight(a.severity) - weight(b.severity));
  }, [organizationId, today, timeOff, shiftTrades, inventoryItems, shifts, orgMembers, staffMembers]);

  const [busyBriefing, setBusyBriefing] = useState(false);
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // ── Build briefing context for the AI ──────────────────────────────────
  const buildBriefingContext = useCallback(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const team = (staffMembers as any[]).filter((m) => m.organizationId === organizationId);
    const inv = (inventoryItems as any[])
      .filter((i) => i.organizationId === organizationId)
      .map((i) => ({
        name: i.name,
        category: i.category,
        stock: i.currentStock,
        min: i.minStock,
        unit: i.unit,
      }));
    const todayShifts = (shifts as any[]).filter(
      (s) => s.organizationId === organizationId && s.date === today,
    );
    const pendingTimeOff = (timeOff as any[]).filter(
      (r) => r.organizationId === organizationId && r.status === "pending",
    );
    const pendingTrades = (shiftTrades as any[]).filter(
      (r) => r.organizationId === organizationId && r.status === "pending",
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return {
      date: today,
      team: team.map((m) => ({ name: m.name, role: m.role })),
      inventory: inv,
      todayShifts: todayShifts.map((s) => ({
        name: s.staffName,
        start: s.startTime,
        end: s.endTime,
        type: s.shiftType,
      })),
      pendingTimeOff: pendingTimeOff.length,
      pendingShiftTrades: pendingTrades.length,
    };
  }, [staffMembers, inventoryItems, shifts, timeOff, shiftTrades, organizationId, today]);

  // ── Generate briefing — guarded to once per day per org ───────────────
  const generateBriefing = useCallback(async () => {
    if (!organizationId || busyBriefing) return;
    setBusyBriefing(true);
    try {
      const res = await fetch("/api/insights/morning-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: buildBriefingContext(),
          lang: locale,
          dateStr: today,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Briefing failed", { description: err.error });
        return;
      }
      const data = (await res.json()) as {
        summary: string;
        content: string;
        date: string;
        generatedBy: string;
      };
      await saveDailyBriefing({
        date: data.date,
        content: data.content,
        summary: data.summary,
        generatedBy: data.generatedBy,
      });
    } catch (e) {
      console.error("[briefing] error:", e);
    } finally {
      setBusyBriefing(false);
    }
  }, [organizationId, busyBriefing, buildBriefingContext, locale, today]);

  // Auto-generate once per mount, only when today's row is missing.
  const briefingFiredRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || !organizationId) return;
    if (!todaysBriefing && !busyBriefing && !briefingFiredRef.current) {
      briefingFiredRef.current = true;
      void generateBriefing();
    }
  }, [isAdmin, organizationId, todaysBriefing, busyBriefing, generateBriefing]);

  // ── Quick-action dispatcher (re-uses Mr. Merchiva's reducer wrappers) ─
  const runAction = useCallback(
    async (issueId: string, action: IssueAction) => {
      if (busyActions.has(issueId)) return;
      setBusyActions((prev) => new Set(prev).add(issueId));
      try {
        switch (action.kind) {
          case "approveTimeOff":
            await updateTimeOffStatus(action.requestId, "approved");
            toast.success("Time-off approved");
            break;
          case "rejectTimeOff":
            await updateTimeOffStatus(action.requestId, "rejected");
            toast.info("Time-off rejected");
            break;
          case "approveTrade":
            await managerApproveShiftTrade(action.tradeId, "", true);
            toast.success("Shift trade approved");
            break;
          case "rejectTrade":
            await managerApproveShiftTrade(action.tradeId, "", false);
            toast.info("Shift trade rejected");
            break;
          case "restock":
            await addInventoryTransaction({
              itemName: action.itemName,
              type: "in",
              quantity: action.delta,
              date: today,
              notes: "Restocked via Mr. Merchiva",
            });
            toast.success(`Restocked ${action.itemName} +${action.delta}`);
            break;
        }
      } catch (e) {
        console.error("[merchiva] action failed:", e);
        toast.error("Action failed");
      } finally {
        setBusyActions((prev) => {
          const next = new Set(prev);
          next.delete(issueId);
          return next;
        });
      }
    },
    [busyActions, today],
  );

  if (!isAdmin) return null;

  const issueCount = issues.length;
  const hasHigh = issues.some((i) => i.severity === "high");
  const agentState: AgentState = busyBriefing
    ? "working"
    : hasHigh
    ? "attention"
    : issueCount > 0
    ? "idle"
    : todaysBriefing
    ? "done"
    : "idle";

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <div
            role="button"
            tabIndex={0}
            className="flex w-full items-center gap-2.5 text-left cursor-pointer"
            onClick={() => setBriefingExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setBriefingExpanded((v) => !v);
              }
            }}
          >
            <MerchivaMark state={agentState} />
            <div className="flex flex-1 min-w-0 flex-col">
              <div className="flex flex-wrap items-center gap-1.5">
                <CardTitle className="text-sm tracking-tight">Mr. Merchiva</CardTitle>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-muted-foreground">
                  · {busyBriefing
                    ? "briefing…"
                    : t("dashboard.morningBriefing") || "morning briefing"}
                </span>
                {issueCount > 0 && (
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-[0.12em]",
                      hasHigh
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    · {issueCount} needs attention
                  </span>
                )}
              </div>
              {todaysBriefing?.summary && (
                <span className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                  {todaysBriefing.summary}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  briefingFiredRef.current = false;
                  void generateBriefing();
                }}
                disabled={busyBriefing}
                className="h-6 w-6 inline-flex items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Regenerate"
              >
                {busyBriefing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </button>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  briefingExpanded && "rotate-180",
                )}
              />
            </div>
          </div>
        </CardHeader>

        {briefingExpanded && (
          <CardContent className="pt-0 space-y-3">
            {/* AI summary */}
            {todaysBriefing ? (
              <div
                className="merchiva-rich-text text-[13px] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeBriefingHtml(todaysBriefing.content) }}
              />
            ) : busyBriefing ? (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating today&apos;s briefing…
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground py-1">
                No briefing yet. Click the refresh icon to generate one.
              </p>
            )}

            {/* Live issues */}
            {issueCount > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-muted-foreground">
                    Needs attention · {issueCount}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <ul className="space-y-1">
                  {issues.map((iss) => (
                    <IssueRow
                      key={iss.id}
                      issue={iss}
                      busy={busyActions.has(iss.id)}
                      onAction={(a) => runAction(iss.id, a)}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* History */}
            {briefingHistory.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setHistoryExpanded((v) => !v)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <History className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-muted-foreground">
                    Past briefings · {briefingHistory.length}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-muted-foreground transition-transform",
                      historyExpanded && "rotate-180",
                    )}
                  />
                </button>
                {historyExpanded && (
                  <ul className="space-y-1 max-h-56 overflow-auto mt-2">
                    {briefingHistory.map((b) => (
                      <li
                        key={b.id.toString()}
                        className="grid grid-cols-[88px_1fr] gap-2 items-center text-[12px] rounded-[0.3rem] border border-border px-2 py-1.5"
                      >
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {b.date}
                        </span>
                        <span className="truncate">{b.summary || "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function IssueRow({
  issue,
  busy,
  onAction,
}: {
  issue: Issue;
  busy: boolean;
  onAction: (a: IssueAction) => void;
}) {
  const Icon = issue.icon;
  const dotClass =
    issue.severity === "high"
      ? "bg-rose-500"
      : issue.severity === "medium"
      ? "bg-amber-500"
      : "bg-stone-400";
  return (
    <li className="flex items-center gap-2 text-[12px] rounded-[0.3rem] border border-border px-2 py-1.5">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)} />
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{issue.label}</div>
        {issue.sub && (
          <div className="font-mono text-[10px] text-muted-foreground tabular-nums truncate">
            {issue.sub}
          </div>
        )}
      </div>
      {issue.actions.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {issue.actions.map((act) => (
            <Button
              key={act.label}
              size="sm"
              variant={act.primary ? "default" : "ghost"}
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => onAction(act.action)}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : act.label}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
