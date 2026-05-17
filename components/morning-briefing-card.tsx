"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles, Check, X, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/lib/context/permissions";
import {
  useDailyBriefings,
  useScheduleProposals,
  useShifts,
  useStaffMembers,
  useStaffRoles,
  useInventoryItems,
  useTimeOffRequests,
  useShiftTrades,
  useShiftPresets,
  useStaffAvailability,
  useSettingsRows,
} from "@/lib/spacetimedb/hooks";
import {
  saveDailyBriefing,
  saveScheduleProposal,
  commitScheduleProposal,
  rejectScheduleProposal,
  addShift,
} from "@/lib/spacetimedb/actions";
import { useI18n } from "@/lib/i18n/context";
import { useT } from "@/lib/i18n/context";
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

interface ProposalRow {
  id: { toString(): string };
  organizationId: string;
  weekStart: string;
  weekEnd: string;
  shifts: string;        // JSON
  status: "draft" | "committed" | "rejected" | string;
  generatedBy: string;
}

interface ProposalShift {
  date: string;
  staffName: string;
  staffRoles: string[];
  startTime: string;
  endTime: string;
  shiftType: "morning" | "afternoon" | "evening" | "overnight";
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextWeekRange(): { start: string; end: string } {
  // 7 days starting tomorrow
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

export function MorningBriefingCard() {
  const t = useT();
  const { locale } = useI18n();
  const { organizationId, isOwner, role: orgRole } = usePermissions();
  const isAdmin = isOwner || orgRole === "manager";

  const [rawBriefings] = useDailyBriefings() as [unknown[], boolean];
  const [rawProposals] = useScheduleProposals() as [unknown[], boolean];
  const [shifts] = useShifts() as [unknown[], boolean];
  const [staffMembers] = useStaffMembers() as [unknown[], boolean];
  const [staffRoles] = useStaffRoles() as [unknown[], boolean];
  const [inventoryItems] = useInventoryItems() as [unknown[], boolean];
  const [timeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [shiftTrades] = useShiftTrades() as [unknown[], boolean];
  const [shiftPresets] = useShiftPresets() as [unknown[], boolean];
  const [availability] = useStaffAvailability() as [unknown[], boolean];
  const [settingsRows] = useSettingsRows() as [unknown[], boolean];

  const today = todayLocal();
  const { start: weekStart, end: weekEnd } = useMemo(() => nextWeekRange(), []);

  const todaysBriefing = useMemo<BriefingRow | null>(() => {
    if (!organizationId) return null;
    for (const r of rawBriefings as BriefingRow[]) {
      if (r.organizationId === organizationId && r.date === today) return r;
    }
    return null;
  }, [rawBriefings, organizationId, today]);

  const currentProposal = useMemo<ProposalRow | null>(() => {
    if (!organizationId) return null;
    let best: ProposalRow | null = null;
    for (const r of rawProposals as ProposalRow[]) {
      if (r.organizationId !== organizationId) continue;
      if (r.weekStart !== weekStart) continue;
      if (!best || r.generatedBy === "draft") best = r;
      // Prefer draft over decided rows
      if (r.status === "draft") return r;
    }
    return best;
  }, [rawProposals, organizationId, weekStart]);

  const proposalShifts = useMemo<ProposalShift[]>(() => {
    if (!currentProposal) return [];
    try {
      return JSON.parse(currentProposal.shifts) as ProposalShift[];
    } catch {
      return [];
    }
  }, [currentProposal]);

  const orgSettings = useMemo(() => {
    return (settingsRows as { organizationId: string; autoCommitSchedules?: boolean | null }[])
      .find((s) => s.organizationId === organizationId);
  }, [settingsRows, organizationId]);
  // Default to true (auto-commit) unless explicitly set to false.
  const autoCommit = orgSettings?.autoCommitSchedules !== false;

  // Check if the upcoming week already has shifts — if yes, skip proposal.
  const upcomingWeekHasShifts = useMemo(() => {
    return (shifts as { organizationId: string; date: string }[]).some(
      (s) => s.organizationId === organizationId && s.date >= weekStart && s.date <= weekEnd,
    );
  }, [shifts, organizationId, weekStart, weekEnd]);

  const [busyBriefing, setBusyBriefing] = useState(false);
  const [busyProposal, setBusyProposal] = useState(false);
  const [busyAccept, setBusyAccept] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const [proposalExpanded, setProposalExpanded] = useState(true);

  // Build minimal context blobs for the AI generators.
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
        name: s.staffName, start: s.startTime, end: s.endTime, type: s.shiftType,
      })),
      pendingTimeOff: pendingTimeOff.length,
      pendingShiftTrades: pendingTrades.length,
    };
  }, [staffMembers, inventoryItems, shifts, timeOff, shiftTrades, organizationId, today]);

  const buildProposalContext = useCallback(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const team = (staffMembers as any[]).filter((m) => m.organizationId === organizationId);
    const roles = (staffRoles as any[])
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({ id: String(r.id), name: r.name }));
    // Last 4 weeks of shifts
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recentShifts = (shifts as any[])
      .filter((s) => s.organizationId === organizationId && s.date >= cutoffStr && s.date <= today)
      .map((s) => ({
        date: s.date,
        staffName: s.staffName,
        roles: s.staffRoles,
        start: s.startTime,
        end: s.endTime,
        type: s.shiftType,
      }));
    const approvedTimeOff = (timeOff as any[])
      .filter((r) => r.organizationId === organizationId && r.status === "approved")
      .map((r) => ({
        staffName: r.staffName,
        startDate: r.startDate,
        endDate: r.endDate,
      }));
    const avail = (availability as any[])
      .filter((a) => a.organizationId === organizationId)
      .map((a) => ({
        staffName: a.staffName,
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      }));
    const presets = (shiftPresets as any[])
      .filter((p) => p.organizationId === organizationId)
      .map((p) => ({ name: p.name, startTime: p.startTime, endTime: p.endTime }));
    const pendingTrades = (shiftTrades as any[]).filter(
      (r) => r.organizationId === organizationId && r.status === "pending",
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return {
      team: team.map((m) => ({
        name: m.name,
        roles: m.role ? [m.role] : [],
        hourlyRate: m.hourlyRate,
      })),
      roles,
      recentShifts,
      shiftPresets: presets,
      availability: avail,
      approvedTimeOff,
      shiftTrades: pendingTrades.length,
    };
  }, [
    staffMembers, staffRoles, shifts, timeOff, availability,
    shiftPresets, shiftTrades, organizationId, today,
  ]);

  // ── Generate briefing ─────────────────────────────────────────────────
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

  // ── Generate proposal ─────────────────────────────────────────────────
  const generateProposal = useCallback(async () => {
    if (!organizationId || busyProposal) return;
    setBusyProposal(true);
    try {
      const res = await fetch("/api/insights/schedule-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: buildProposalContext(),
          lang: locale,
          weekStart,
          weekEnd,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Schedule proposal failed", { description: err.error });
        return;
      }
      const data = (await res.json()) as {
        weekStart: string;
        weekEnd: string;
        shifts: ProposalShift[];
        rationale: string;
        generatedBy: string;
      };

      const status: "draft" | "committed" = autoCommit ? "committed" : "draft";
      // If auto-committing, insert real shifts first so the proposal record
      // matches reality even if a later addShift fails.
      if (autoCommit) {
        for (const s of data.shifts) {
          try {
            await addShift({
              staffName: s.staffName,
              date: s.date,
              startTime: s.startTime,
              endTime: s.endTime,
              shiftType: s.shiftType,
              staffRoles: s.staffRoles,
              memberId: null,
              predictedDemand: null,
            });
          } catch (e) {
            console.warn("[proposal] addShift failed for", s, e);
          }
        }
      }
      await saveScheduleProposal({
        weekStart: data.weekStart,
        weekEnd: data.weekEnd,
        shifts: data.shifts,
        status,
        generatedBy: data.generatedBy,
      });
      if (autoCommit) toast.success("Next week's schedule auto-committed");
    } catch (e) {
      console.error("[proposal] error:", e);
    } finally {
      setBusyProposal(false);
    }
  }, [organizationId, busyProposal, buildProposalContext, locale, weekStart, weekEnd, autoCommit]);

  // Auto-trigger ONCE per mount when conditions are met.
  const briefingFiredRef = useRef(false);
  const proposalFiredRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || !organizationId) return;
    if (!todaysBriefing && !busyBriefing && !briefingFiredRef.current) {
      briefingFiredRef.current = true;
      void generateBriefing();
    }
  }, [isAdmin, organizationId, todaysBriefing, busyBriefing, generateBriefing]);

  useEffect(() => {
    if (!isAdmin || !organizationId) return;
    if (
      !upcomingWeekHasShifts &&
      !currentProposal &&
      !busyProposal &&
      !proposalFiredRef.current
    ) {
      proposalFiredRef.current = true;
      void generateProposal();
    }
  }, [isAdmin, organizationId, upcomingWeekHasShifts, currentProposal, busyProposal, generateProposal]);

  const handleAccept = useCallback(async () => {
    if (!currentProposal) return;
    setBusyAccept(true);
    try {
      for (const s of proposalShifts) {
        try {
          await addShift({
            staffName: s.staffName,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            shiftType: s.shiftType,
            staffRoles: s.staffRoles,
            memberId: null,
            predictedDemand: null,
          });
        } catch (e) {
          console.warn("[proposal] addShift failed", e);
        }
      }
      await commitScheduleProposal(currentProposal.id.toString());
      toast.success("Schedule accepted");
    } finally {
      setBusyAccept(false);
    }
  }, [currentProposal, proposalShifts]);

  const handleReject = useCallback(async () => {
    if (!currentProposal) return;
    await rejectScheduleProposal(currentProposal.id.toString());
    toast.info("Proposal rejected");
  }, [currentProposal]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-3">
      {/* Briefing */}
      <Card>
        <CardHeader>
          <div
            role="button"
            tabIndex={0}
            className="flex w-full items-center gap-2 text-left cursor-pointer"
            onClick={() => setBriefingExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setBriefingExpanded((v) => !v);
              }
            }}
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm">{t("dashboard.morningBriefing") || "Morning Briefing"}</CardTitle>
            {todaysBriefing?.summary && (
              <span className="text-[11.5px] text-muted-foreground truncate ml-2">
                · {todaysBriefing.summary}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
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
                {busyBriefing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </button>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", briefingExpanded && "rotate-180")} />
            </div>
          </div>
        </CardHeader>
        {briefingExpanded && (
          <CardContent className="pt-0">
            {todaysBriefing ? (
              <div
                className="merchiva-rich-text text-[13px] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeBriefingHtml(todaysBriefing.content) }}
              />
            ) : busyBriefing ? (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating today's briefing…
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground py-1">
                No briefing yet. Click the refresh icon to generate one.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Schedule proposal */}
      {(currentProposal || busyProposal) && (
        <Card>
          <CardHeader>
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={() => setProposalExpanded((v) => !v)}
            >
              <Sparkles className="h-4 w-4 text-sky-500" />
              <CardTitle className="text-sm">Next week's schedule</CardTitle>
              {currentProposal && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] ml-2",
                    currentProposal.status === "committed" && "border-emerald-500 text-emerald-600",
                    currentProposal.status === "rejected" && "border-stone-400 text-stone-500",
                  )}
                >
                  {currentProposal.status}
                </Badge>
              )}
              <span className="ml-auto flex items-center gap-1">
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", proposalExpanded && "rotate-180")} />
              </span>
            </button>
          </CardHeader>
          {proposalExpanded && (
            <CardContent className="pt-0 space-y-2">
              {busyProposal && !currentProposal ? (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Drafting next week's schedule from your patterns…
                </div>
              ) : currentProposal ? (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    {currentProposal.weekStart} → {currentProposal.weekEnd} ·{" "}
                    {proposalShifts.length} shift{proposalShifts.length === 1 ? "" : "s"}
                  </p>
                  <ul className="space-y-1 max-h-64 overflow-auto">
                    {proposalShifts.map((s, i) => (
                      <li
                        key={`${s.date}-${s.staffName}-${i}`}
                        className="grid grid-cols-[88px_1fr_110px] gap-2 items-center text-[12px] rounded-[0.3rem] border border-border px-2 py-1.5"
                      >
                        <span className="font-mono tabular-nums text-muted-foreground">{s.date}</span>
                        <span className="font-medium truncate">{s.staffName}</span>
                        <span className="font-mono tabular-nums text-muted-foreground text-right">
                          {s.startTime}–{s.endTime}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {currentProposal.status === "draft" && (
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleReject}
                        disabled={busyAccept}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                      <Button size="sm" onClick={handleAccept} disabled={busyAccept}>
                        {busyAccept ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Accept all
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              ) : null}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
