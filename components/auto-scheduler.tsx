"use client";

import { useState, useMemo, useCallback } from "react";
import { Sparkles, Check, AlertTriangle, X, RotateCcw, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import {
  generateSchedule,
  type ScheduleConfig,
  type ScheduledShift,
  type ScheduleResult,
} from "@/lib/scheduler";
import type {
  OrgMember, Shift, StaffAvailability, TimeOffRequest,
  ShiftPreset, StaffRole, SalesRecord,
} from "@/lib/types";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/loaders/geometric";
import { useT } from "@/lib/i18n/context";

// ─── Props ──────────────────────────────────────────────────────────────────

interface AutoSchedulerProps {
  members: OrgMember[];
  shifts: Shift[];
  availability: StaffAvailability[];
  timeOff: TimeOffRequest[];
  presets: ShiftPreset[];
  roles: StaffRole[];
  salesHistory: SalesRecord[];
  organizationId: string;
  onApply: (shifts: ScheduledShift[]) => Promise<void>;
  compact?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  return isoDate(mon);
}

function getNextSunday(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return isoDate(d);
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-50 border-emerald-200";
  if (score >= 40) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AutoScheduler({
  members, shifts, availability, timeOff,
  presets, roles, salesHistory, organizationId, onApply,
  compact,
}: AutoSchedulerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Config state
  const defaultStart = useMemo(getNextMonday, []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(() => getNextSunday(defaultStart));
  const [maxHours, setMaxHours] = useState(40);
  const [maxConsecutive, setMaxConsecutive] = useState(6);
  const [minRest, setMinRest] = useState(10);

  // Reset state when dialog opens
  const handleOpen = useCallback(() => {
    setResult(null);
    setSelected(new Set());
    setGenerating(false);
    setApplying(false);
    const start = getNextMonday();
    setStartDate(start);
    setEndDate(getNextSunday(start));
    setMaxHours(40);
    setMaxConsecutive(6);
    setMinRest(10);
    setOpen(true);
  }, []);

  const handleGenerate = useCallback(() => {
    setGenerating(true);

    // Use requestAnimationFrame to let the spinner render before heavy computation
    requestAnimationFrame(() => {
      try {
        const config: ScheduleConfig = {
          dateRange: { start: startDate, end: endDate },
          maxHoursPerWeek: maxHours,
          maxConsecutiveDays: maxConsecutive,
          minRestHours: minRest,
          staffPerShift: {},
        };

        const scheduleResult = generateSchedule(
          config,
          members,
          availability,
          timeOff,
          shifts,
          presets,
          roles,
          salesHistory,
        );

        setResult(scheduleResult);
        // Select all shifts by default
        setSelected(new Set(scheduleResult.shifts.map((_, i) => i)));

        if (scheduleResult.shifts.length === 0) {
          toast.error(t("scheduler.auto.noShiftsGenerated"));
        }
      } catch (err) {
        console.error("Auto-schedule error:", err);
        toast.error(t("scheduler.auto.generateFailed"));
      } finally {
        setGenerating(false);
      }
    });
  }, [startDate, endDate, maxHours, maxConsecutive, minRest, members, availability, timeOff, shifts, presets, roles, salesHistory]);

  const handleApply = useCallback(async () => {
    if (!result) return;
    const selectedShifts = result.shifts.filter((_, i) => selected.has(i));
    if (selectedShifts.length === 0) {
      toast.error(t("scheduler.auto.noShiftsSelected"));
      return;
    }

    setApplying(true);
    try {
      await onApply(selectedShifts);
      toast.success(t("scheduler.auto.shiftsAdded").replace("{count}", String(selectedShifts.length)));
      setOpen(false);
    } catch (err) {
      console.error("Apply schedule error:", err);
      toast.error(t("scheduler.auto.applyFailed"));
    } finally {
      setApplying(false);
    }
  }, [result, selected, onApply]);

  const toggleShift = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!result) return;
    setSelected((prev) => {
      if (prev.size === result.shifts.length) {
        return new Set();
      }
      return new Set(result.shifts.map((_, i) => i));
    });
  }, [result]);

  const selectedCount = selected.size;
  const totalCount = result?.shifts.length ?? 0;

  return (
    <>
      {compact ? (
        <button
          onClick={handleOpen}
          className="h-8 w-8 flex items-center justify-center rounded-[0.3rem] border border-border text-foreground hover:bg-muted transition-colors"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpen}
          className="gap-1.5 text-xs font-medium"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t("scheduler.auto.button")}
        </Button>
      )}

      <DynamicUIElement open={open} onOpenChange={setOpen}>
        <DynamicUIElementContent className="max-w-2xl max-h-[90vh]" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("scheduler.auto.title")}>
              {t("scheduler.auto.title")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription>
              {t("scheduler.auto.description")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>

          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {/* ─── Config Section ─── */}
              <div className="px-4 pt-2 pb-4 space-y-4 border-b border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {t("scheduler.auto.startDate")}
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="border-0 border-b border-border rounded-none px-0 h-8 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {t("scheduler.auto.endDate")}
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="border-0 border-b border-border rounded-none px-0 h-8 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {t("scheduler.auto.maxHoursPerWeek")}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={maxHours}
                      onChange={(e) => setMaxHours(Number(e.target.value) || 40)}
                      className="mt-1 border-0 border-b border-border rounded-none px-0 h-8 text-sm font-mono shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {t("scheduler.auto.maxConsecutiveDays")}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={7}
                      value={maxConsecutive}
                      onChange={(e) => setMaxConsecutive(Number(e.target.value) || 6)}
                      className="mt-1 border-0 border-b border-border rounded-none px-0 h-8 text-sm font-mono shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {t("scheduler.auto.minRestHours")}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={24}
                      value={minRest}
                      onChange={(e) => setMinRest(Number(e.target.value) || 10)}
                      className="mt-1 border-0 border-b border-border rounded-none px-0 h-8 text-sm font-mono shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={generating || !startDate || !endDate}
                  className="w-full h-10 text-sm font-semibold"
                >
                  {generating ? (
                    <Spinner size={16} />
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      {t("scheduler.auto.generate")}
                    </>
                  )}
                </Button>
              </div>

              {/* ─── Results Section ─── */}
              {result && (
                <>
                  {/* Stats bar */}
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center">
                        <div className="text-lg font-mono font-bold">{result.stats.totalShifts}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("scheduler.auto.statShifts")}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-mono font-bold">{result.stats.totalHours}h</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("scheduler.auto.statTotalHours")}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-mono font-bold">{result.stats.avgHoursPerStaff}h</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("scheduler.auto.statAvgPerStaff")}</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-lg font-mono font-bold ${scoreColor(result.stats.fairnessScore)}`}>
                          {result.stats.fairnessScore}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("scheduler.auto.statFairness")}</div>
                        <Progress value={result.stats.fairnessScore} className="mt-1 h-1" />
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {result.warnings.length > 0 && (
                    <div className="px-4 py-2 space-y-1.5 border-b border-border">
                      {result.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 text-xs bg-amber-50 border border-amber-200 rounded-[0.3rem]">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span className="text-amber-800">{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unfilled slots */}
                  {result.unfilledSlots.length > 0 && (
                    <div className="px-4 py-2 space-y-1.5 border-b border-border">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                        {t("scheduler.auto.unfilledSlots").replace("{count}", String(result.unfilledSlots.length))}
                      </div>
                      {result.unfilledSlots.slice(0, 5).map((slot, i) => (
                        <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 text-xs bg-red-50 border border-red-200 rounded-[0.3rem]">
                          <X className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                          <span className="text-red-800">
                            {formatDateShort(slot.date)} &mdash; {slot.shiftType}: {slot.reason}
                          </span>
                        </div>
                      ))}
                      {result.unfilledSlots.length > 5 && (
                        <div className="text-[11px] text-muted-foreground pl-6">
                          {t("scheduler.auto.moreUnfilled").replace("{count}", String(result.unfilledSlots.length - 5))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Schedule preview table */}
                  {result.shifts.length > 0 && (
                    <div className="px-4 py-2">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                          {t("scheduler.auto.schedulePreview")}
                        </div>
                        <button
                          onClick={toggleAll}
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {selectedCount === totalCount ? t("scheduler.auto.deselectAll") : t("scheduler.auto.selectAll")} ({selectedCount}/{totalCount})
                        </button>
                      </div>

                      <div className="border border-border rounded-[0.3rem] overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b border-border">
                                <th className="w-8 px-2 py-1.5 text-center">&nbsp;</th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{t("scheduler.auto.colDate")}</th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{t("scheduler.auto.colShift")}</th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{t("scheduler.auto.colTime")}</th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{t("scheduler.auto.colStaff")}</th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{t("scheduler.auto.colRoles")}</th>
                                <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">{t("scheduler.auto.colScore")}</th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{t("scheduler.auto.colStatus")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.shifts.map((shift, i) => {
                                const isChecked = selected.has(i);
                                const preset = presets.find(
                                  (p) => p.startTime === shift.startTime && p.endTime === shift.endTime
                                );
                                return (
                                  <tr
                                    key={i}
                                    className={`border-b border-border last:border-b-0 transition-colors ${
                                      isChecked ? "bg-background" : "bg-muted/20 opacity-60"
                                    }`}
                                  >
                                    <td className="px-2 py-1.5 text-center">
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={() => toggleShift(i)}
                                        className="h-3.5 w-3.5"
                                      />
                                    </td>
                                    <td className="px-2 py-1.5 whitespace-nowrap font-mono text-[11px]">
                                      {formatDateShort(shift.date)}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0"
                                        style={preset ? {
                                          borderColor: preset.color,
                                          color: preset.color,
                                        } : undefined}
                                      >
                                        {shift.shiftType}
                                      </Badge>
                                    </td>
                                    <td className="px-2 py-1.5 whitespace-nowrap font-mono text-[11px]">
                                      {formatTime(shift.startTime)} &ndash; {formatTime(shift.endTime)}
                                    </td>
                                    <td className="px-2 py-1.5 whitespace-nowrap text-[11px] font-medium">
                                      {shift.memberName}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <div className="flex gap-1 flex-wrap">
                                        {shift.roles.length > 0 ? shift.roles.map((r) => {
                                          const role = roles.find((rl) => rl.name === r);
                                          return (
                                            <span
                                              key={r}
                                              className="inline-block h-2 w-2 rounded-full"
                                              style={{ backgroundColor: role?.color ?? "#78716c" }}
                                              title={r}
                                            />
                                          );
                                        }) : (
                                          <span className="text-muted-foreground">&mdash;</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                      <span className={`font-mono font-bold text-[11px] ${scoreColor(shift.score)}`}>
                                        {shift.score}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1.5">
                                      {shift.warnings.length > 0 ? (
                                        <div className="flex items-center gap-1">
                                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                                          <span className="text-[10px] text-amber-700 truncate max-w-[120px]" title={shift.warnings.join("; ")}>
                                            {shift.warnings[0]}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 text-emerald-600">
                                          <Check className="h-3 w-3" />
                                          <span className="text-[10px]">{t("scheduler.auto.statusOk")}</span>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ─── Action Buttons ─── */}
            {result && result.shifts.length > 0 && (
              <div className="px-4 py-3 border-t border-border flex items-center gap-2 mt-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                  className="text-xs"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="text-xs gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t("scheduler.auto.regenerate")}
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={applying || selectedCount === 0}
                  className="text-xs gap-1 font-semibold"
                >
                  {applying ? (
                    <Spinner size={14} />
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      {t("scheduler.auto.applySelected").replace("{count}", String(selectedCount))}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>
    </>
  );
}
