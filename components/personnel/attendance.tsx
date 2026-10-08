"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-is-mobile";
import { usePermissions } from "@/lib/context/permissions";
import { useI18n, useT } from "@/lib/i18n/context";
import { useOrgMembers, usePunchEvents, useShifts, useUsers } from "@/lib/spacetimedb/hooks";
import { managerRecordPunch, managerSetPunchWindow } from "@/lib/spacetimedb/actions";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { dateKey, mondayOf } from "@/lib/date-key";
import { intlLocaleTag } from "@/lib/i18n/dates";
import { useAttendancePageContext } from "@/components/personnel/use-page-context";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PunchEventRow {
  id: { toString(): string };
  organizationId: string;
  memberId: string;
  action: string;
  at: { toDate?: () => Date; microsSinceUnixEpoch?: bigint };
  closed: boolean;
  pairEventId?: string | null;
}

interface MemberRow {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface ShiftWindow {
  memberId: string;
  date: string;
  startMin: number;
  endMin: number;
}

type CellState = "none" | "on" | "break" | "complete" | "missing";

interface DayCell {
  date: string;
  state: CellState;
  inAt: Date | null;
  outAt: Date | null;
  openIn: boolean;
  workedMin: number | null;
  scheduledStart: number | null;
  scheduledEnd: number | null;
  overtimeMin: number;
  startTime: string; // "HH:MM" or ""
  endTime: string;
}

interface MemberWeek {
  member: MemberRow;
  cells: DayCell[]; // 7 entries, Mon..Sun
  weekWorkedMin: number;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function punchTime(e: PunchEventRow): Date {
  if (e.at && typeof e.at.toDate === "function") return e.at.toDate();
  if (typeof e.at?.microsSinceUnixEpoch === "bigint") {
    return new Date(Number(e.at.microsSinceUnixEpoch / BigInt(1000)));
  }
  return new Date();
}

function fmtHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeToMin(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minLabel(minutes: number): string {
  const n = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}

function pct(value: number, start: number, end: number): string {
  const clamped = Math.max(start, Math.min(end, value));
  return `${((clamped - start) / Math.max(1, end - start)) * 100}%`;
}

function dateTimeFrom(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function dayStartOf(date: string): Date {
  return dateTimeFrom(date, "00:00");
}

function nextDayStartOf(date: string): Date {
  const d = dayStartOf(date);
  d.setDate(d.getDate() + 1);
  return d;
}

// ─── Small UI bits ───────────────────────────────────────────────────────────

function StateBadge({ state, t }: { state: CellState; t: (k: string) => string }) {
  const tones: Record<CellState, StatusTone> = {
    on: "success",
    break: "neutral",
    complete: "neutral",
    missing: "warning",
    none: "neutral",
  };
  const labels: Record<CellState, string> = {
    on: t("staffing.attendance.on"),
    break: t("staffing.attendance.break"),
    complete: t("staffing.attendance.complete"),
    missing: t("staffing.attendance.missingOut"),
    none: t("staffing.attendance.noRecord"),
  };
  return (
    <StatusBadge tone={tones[state]} size="xs" className={cn("normal-case tracking-normal font-semibold", state === "complete" && "text-foreground")}>
      {labels[state]}
    </StatusBadge>
  );
}

// ─── Editor sheet (shared by both layouts) ──────────────────────────────────

function CellEditor({
  open,
  onClose,
  member,
  cell,
  todayIso,
  weekdayLabel,
}: {
  open: boolean;
  onClose: () => void;
  member: MemberRow | null;
  cell: DayCell | null;
  todayIso: string;
  weekdayLabel: (iso: string) => string;
}) {
  const t = useT();
  const [draft, setDraft] = useState({ startTime: "", endTime: "" });
  const [saving, setSaving] = useState(false);
  const [punching, setPunching] = useState(false);

  // Re-seed drafts only when the target cell (or its server times) changes, so
  // unrelated realtime punch updates don't clobber in-progress edits.
  const cellKey = cell ? `${cell.date}:${cell.startTime}:${cell.endTime}` : "";
  useEffect(() => {
    if (open && cell) setDraft({ startTime: cell.startTime, endTime: cell.endTime });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cellKey]);

  if (!member || !cell) return null;

  const isToday = cell.date === todayIso;
  const dirty = draft.startTime !== cell.startTime || draft.endTime !== cell.endTime;
  const punchAction: "in" | "out" = cell.openIn ? "out" : "in";

  // Mini timeline window: pad an hour around everything visible, ≥6h span.
  const points = [cell.scheduledStart, cell.scheduledEnd, timeToMin(draft.startTime), timeToMin(draft.endTime)]
    .filter((v): v is number => typeof v === "number");
  const rawStart = points.length > 0 ? Math.min(...points) : 8 * 60;
  const rawEnd = points.length > 0 ? Math.max(...points) : 18 * 60;
  const winStart = Math.max(0, Math.floor((rawStart - 60) / 60) * 60);
  const winEnd = Math.min(1440, Math.max(winStart + 360, Math.ceil((rawEnd + 60) / 60) * 60));
  const draftStart = timeToMin(draft.startTime);
  const draftEnd = timeToMin(draft.endTime);

  const save = async () => {
    if (!draft.startTime) {
      toast.error(t("staffing.attendance.startRequired"));
      return;
    }
    const startAt = dateTimeFrom(cell.date, draft.startTime);
    const endAt = draft.endTime ? dateTimeFrom(cell.date, draft.endTime) : null;
    if (endAt && endAt <= startAt) {
      toast.error(t("staffing.attendance.invalidWindow"));
      return;
    }
    setSaving(true);
    try {
      await managerSetPunchWindow(member.id, dayStartOf(cell.date), nextDayStartOf(cell.date), startAt, endAt);
      hapticSuccess();
      toast.success(t("staffing.attendance.saved"));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("punchIn.toastFailed"));
    } finally {
      setSaving(false);
    }
  };

  const punch = async () => {
    setPunching(true);
    try {
      await managerRecordPunch(member.id, punchAction);
      hapticSuccess();
      toast.success(punchAction === "in" ? t("staffing.attendance.clockedIn") : t("staffing.attendance.clockedOut"));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("punchIn.toastFailed"));
    } finally {
      setPunching(false);
    }
  };

  return (
    <DynamicUIElement open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DynamicUIElementContent className="max-w-sm">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("staffing.attendance.editTitle")}>
            {t("staffing.attendance.editTitle")}
          </DynamicUIElementTitle>
          <DynamicUIElementDescription>
            {member.displayName} · {weekdayLabel(cell.date)}
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>

        <div className="space-y-4 pt-1">
          {/* Status */}
          <div className="flex items-center gap-2.5">
            <Avatar name={member.displayName} src={member.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground truncate">{member.displayName}</p>
              <p className="text-[11px] text-muted-foreground font-mono tabular-nums">{cell.date}</p>
            </div>
            <StateBadge state={cell.state} t={t} />
          </div>

          {/* Mini timeline: scheduled vs actual */}
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
              <span>{minLabel(winStart)}</span>
              <span>{minLabel((winStart + winEnd) / 2)}</span>
              <span>{minLabel(winEnd)}</span>
            </div>
            <div className="relative h-8 rounded-lg border border-border bg-muted/30 overflow-hidden">
              {cell.scheduledStart != null && cell.scheduledEnd != null && (
                <div
                  className="absolute top-1.5 h-2 rounded-sm border border-border bg-muted"
                  style={{
                    left: pct(cell.scheduledStart, winStart, winEnd),
                    width: `max(6px, calc(${pct(cell.scheduledEnd, winStart, winEnd)} - ${pct(cell.scheduledStart, winStart, winEnd)}))`,
                  }}
                />
              )}
              {draftStart != null && (
                <div
                  className={cn("absolute bottom-1.5 h-2.5 rounded-sm", cell.overtimeMin > 0 ? "bg-amber-500" : "bg-foreground")}
                  style={{
                    left: pct(draftStart, winStart, winEnd),
                    width: `max(6px, calc(${pct(draftEnd ?? Math.min(winEnd, draftStart + 15), winStart, winEnd)} - ${pct(draftStart, winStart, winEnd)}))`,
                  }}
                />
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-4 rounded-sm bg-muted border border-border" />{t("staffing.attendance.scheduled")}</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-4 rounded-sm bg-foreground" />{t("staffing.attendance.actual")}</span>
              {cell.workedMin != null && (
                <span className="ml-auto font-mono tabular-nums">{t("staffing.attendance.worked")} {hoursLabel(cell.workedMin)}</span>
              )}
            </div>
          </div>

          {/* Time inputs */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Eyebrow className="mb-1">{t("staffing.attendance.start")}</Eyebrow>
              <Input
                type="time"
                value={draft.startTime}
                onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))}
                className="h-9 px-2 text-[13px] font-mono tabular-nums"
              />
            </div>
            <span className="text-muted-foreground mt-4">–</span>
            <div className="flex-1">
              <Eyebrow className="mb-1">{t("staffing.attendance.end")}</Eyebrow>
              <Input
                type="time"
                value={draft.endTime}
                onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))}
                className="h-9 px-2 text-[13px] font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pb-1">
            <Button
              className="flex-1 h-9 text-[13px]"
              variant={isToday && !dirty ? "outline" : "default"}
              disabled={saving || punching || !dirty || !draft.startTime}
              onClick={save}
            >
              {saving ? <Spinner size={14} /> : <><Check className="h-3.5 w-3.5" /> {t("staffing.attendance.save")}</>}
            </Button>
            {isToday && (
              <Button
                className="flex-1 h-9 text-[13px]"
                variant={punchAction === "out" ? "outline" : "default"}
                disabled={saving || punching}
                onClick={punch}
              >
                {punching ? <Spinner size={14} /> : punchAction === "in" ? t("staffing.attendance.clockIn") : t("staffing.attendance.clockOut")}
              </Button>
            )}
          </div>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

// ─── Cell content (desktop matrix) ───────────────────────────────────────────

function CellContent({ cell, t }: { cell: DayCell; t: (k: string) => string }) {
  if (cell.state === "none") {
    if (cell.scheduledStart != null && cell.scheduledEnd != null) {
      return (
        <span className="text-[10.5px] font-mono tabular-nums text-muted-foreground/50">
          {minLabel(cell.scheduledStart)}–{minLabel(cell.scheduledEnd)}
        </span>
      );
    }
    return <span className="text-[11px] text-muted-foreground/40">–</span>;
  }
  const timeTone =
    cell.state === "missing" ? "text-amber-700 dark:text-amber-400"
    : cell.state === "on" || cell.state === "break" ? "text-emerald-700 dark:text-emerald-400"
    : "text-foreground";
  return (
    <span className="flex flex-col items-center gap-0.5 leading-none">
      <span className={cn("text-[11px] font-mono tabular-nums font-semibold", timeTone)}>
        {cell.startTime}–{cell.state === "missing" ? "?" : cell.endTime || (cell.openIn ? "···" : "")}
      </span>
      <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
        {cell.workedMin != null ? hoursLabel(cell.workedMin) : cell.state === "missing" ? t("staffing.attendance.missingOut") : t("staffing.attendance.ongoing")}
        {cell.overtimeMin > 0 && <span className="text-amber-600 dark:text-amber-400"> +{hoursLabel(cell.overtimeMin)}</span>}
      </span>
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AttendanceWeek({
  orgId,
  shownOn,
}: {
  orgId: string;
  /** Set when the host mounts this instance for one layout and hides it on the other, so only
   *  the visible instance describes the page to Mr. Merchiva. */
  shownOn?: "mobile" | "desktop";
}) {
  const t = useT();
  const { locale } = useI18n();
  const isMobile = useIsMobile();
  const { isOwner, role } = usePermissions();
  const canManage = isOwner || role === "manager";

  const [rawPunches] = usePunchEvents() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawUsers] = useUsers() as [unknown[], boolean];
  const [rawShifts] = useShifts() as [unknown[], boolean];

  const todayIso = dateKey(new Date());
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [selDate, setSelDate] = useState<string>(todayIso);
  const [editing, setEditing] = useState<{ memberId: string; date: string } | null>(null);

  const week = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart],
  );
  const weekIsos = useMemo(() => week.map((d) => dateKey(d)), [week]);

  const bcp47 = intlLocaleTag(locale);
  const weekdayShort = (d: Date) => d.toLocaleDateString(bcp47, { weekday: "short" });
  const weekdayLabel = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(bcp47, { weekday: "long", month: "short", day: "numeric" });
  const weekLabel = `${week[0].toLocaleDateString(bcp47, { month: "short", day: "numeric" })} – ${week[6].toLocaleDateString(bcp47, { month: "short", day: "numeric" })}`;

  // ── Row mapping (SpacetimeDB rows) ──
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const members = useMemo<MemberRow[]>(() => {
    const avatarByUser = new Map<string, string | null>();
    for (const u of rawUsers as any[]) {
      const key = u.identity?.toHexString?.() ?? String(u.identity ?? "");
      avatarByUser.set(key, u.avatarUrl ? String(u.avatarUrl) : null);
    }
    return (rawMembers as any[])
      .filter((m) => m.organizationId === orgId && m.status === "active")
      .map((m) => ({
        id: m.id?.toString?.() ?? String(m.id),
        displayName: String(m.displayName ?? "—"),
        avatarUrl: avatarByUser.get(m.userId?.toHexString?.() ?? String(m.userId ?? "")) ?? null,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [rawMembers, rawUsers, orgId]);

  const punches = useMemo<PunchEventRow[]>(
    () => (rawPunches as any[]).filter((e) => e.organizationId === orgId) as PunchEventRow[],
    [rawPunches, orgId],
  );

  const shiftWindows = useMemo<ShiftWindow[]>(() => {
    return (rawShifts as any[])
      .filter((s) => s.organizationId === orgId && weekIsos.includes(String(s.date ?? "")))
      .map((s) => {
        const startMin = timeToMin(String(s.startTime ?? ""));
        let endMin = timeToMin(String(s.endTime ?? ""));
        if (startMin == null || endMin == null) return null;
        if (endMin <= startMin) endMin += 1440;
        return {
          memberId: s.memberId ? String(s.memberId) : "",
          date: String(s.date ?? ""),
          startMin,
          endMin,
        };
      })
      .filter(Boolean) as ShiftWindow[];
  }, [rawShifts, orgId, weekIsos]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Per member × day cells ──
  const memberWeeks = useMemo<MemberWeek[]>(() => {
    const now = new Date();
    const nowIso = dateKey(now);
    return members.map((member) => {
      const events = punches
        .filter((e) => e.memberId === member.id)
        .sort((a, b) => punchTime(a).getTime() - punchTime(b).getTime());
      const cells = weekIsos.map<DayCell>((date) => {
        const dayEvents = events.filter((e) => dateKey(punchTime(e)) === date);
        const openInEvent = dayEvents.find((e) => e.action === "in" && !e.closed) ?? null;
        const inEvent = openInEvent ?? dayEvents.find((e) => e.action === "in") ?? null;
        const outEvent = inEvent
          ? events.find((e) => e.action === "out" && e.pairEventId === inEvent.id.toString())
            ?? dayEvents.find((e) => e.action === "out")
            ?? null
          : null;
        const openBreak = events.find((e) => e.action === "break-start" && !e.closed) ?? null;
        const isToday = date === nowIso;
        const activeOpen = !!openInEvent && !outEvent && isToday;

        const inAt = inEvent ? punchTime(inEvent) : null;
        const outAt = outEvent ? punchTime(outEvent) : null;
        const state: CellState = activeOpen
          ? (openBreak ? "break" : "on")
          : inAt && outAt
            ? "complete"
            : inAt
              ? "missing"
              : "none";

        const dayStart = dayStartOf(date).getTime();
        const inMin = inAt ? Math.round((inAt.getTime() - dayStart) / 60000) : null;
        const outMin = outAt
          ? Math.round((outAt.getTime() - dayStart) / 60000)
          : activeOpen
            ? Math.round((now.getTime() - dayStart) / 60000)
            : null;
        const workedMin = inMin != null && outMin != null ? Math.max(0, outMin - inMin) : null;

        const windows = shiftWindows.filter((w) => w.memberId === member.id && w.date === date);
        const scheduledStart = windows.length > 0 ? Math.min(...windows.map((w) => w.startMin)) : null;
        const scheduledEnd = windows.length > 0 ? Math.max(...windows.map((w) => w.endMin)) : null;
        const overtimeMin = scheduledEnd != null && outMin != null && outMin > scheduledEnd ? outMin - scheduledEnd : 0;

        return {
          date,
          state,
          inAt,
          outAt,
          openIn: activeOpen,
          workedMin,
          scheduledStart,
          scheduledEnd,
          overtimeMin,
          startTime: inAt ? fmtHM(inAt) : "",
          endTime: outAt ? fmtHM(outAt) : "",
        };
      });
      const weekWorkedMin = cells.reduce((acc, c) => acc + (c.workedMin ?? 0), 0);
      return { member, cells, weekWorkedMin };
    });
  }, [members, punches, shiftWindows, weekIsos]);

  // ── Aggregates ──
  const allCells = memberWeeks.flatMap((mw) => mw.cells);
  const weekStats = {
    recorded: allCells.filter((c) => c.state !== "none").length,
    stillIn: allCells.filter((c) => c.state === "on" || c.state === "break").length,
    overtime: allCells.filter((c) => c.overtimeMin > 0).length,
    missing: allCells.filter((c) => c.state === "missing").length,
  };
  const dayCellsFor = (iso: string) => memberWeeks.map((mw) => ({ member: mw.member, cell: mw.cells[weekIsos.indexOf(iso)] }));
  const selCells = dayCellsFor(selDate);
  const dayStats = {
    recorded: selCells.filter(({ cell }) => cell && cell.state !== "none").length,
    stillIn: selCells.filter(({ cell }) => cell && (cell.state === "on" || cell.state === "break")).length,
    overtime: selCells.filter(({ cell }) => cell && cell.overtimeMin > 0).length,
    none: selCells.filter(({ cell }) => cell && cell.state === "none").length,
  };

  const navigateWeek = (delta: number) => {
    hapticLight();
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta * 7);
      return next;
    });
    // Keep the selected day on the same weekday in the new week.
    setSelDate((prev) => {
      const d = new Date(prev + "T00:00:00");
      d.setDate(d.getDate() + delta * 7);
      return dateKey(d);
    });
  };
  const jumpToday = () => {
    hapticLight();
    setWeekStart(mondayOf(new Date()));
    setSelDate(todayIso);
  };
  const onCurrentWeek = weekIsos.includes(todayIso);

  const editingMember = editing ? members.find((m) => m.id === editing.memberId) ?? null : null;
  const editingCell = editing
    ? memberWeeks.find((mw) => mw.member.id === editing.memberId)?.cells[weekIsos.indexOf(editing.date)] ?? null
    : null;
  useAttendancePageContext({ shownOn, canManage, weekIsos, day: selDate, members, weekStats, dayStats, editing });

  if (!canManage) return null;

  // ── Shared week nav header ──
  const weekNav = (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 lg:px-6 border-b border-border bg-background">
      <div className="min-w-0">
        <Eyebrow>{t("staffing.attendance.title")}</Eyebrow>
        <p className="text-[13px] font-semibold text-foreground font-mono tabular-nums">{weekLabel}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!onCurrentWeek && (
          <Button
            type="button"
            variant="outline"
            onClick={jumpToday}
            className="text-[11.5px] font-semibold text-muted-foreground"
          >
            {t("staffing.attendance.today")}
          </Button>
        )}
        <Button type="button" variant="outline" size="icon" onClick={() => navigateWeek(-1)} className="text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => navigateWeek(1)} className="text-muted-foreground">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const editor = (
    <CellEditor
      open={!!editing}
      onClose={() => setEditing(null)}
      member={editingMember}
      cell={editingCell}
      todayIso={todayIso}
      weekdayLabel={weekdayLabel}
    />
  );

  // ─── Mobile: week strip + day list ────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="bg-background">
        {weekNav}

        {/* Week strip — same visual language as the schedule strip */}
        <div className="border-b border-border bg-muted/30">
          <div className="grid grid-cols-7 px-2.5 py-2 gap-0.5">
            {week.map((d) => {
              const iso = dateKey(d);
              const active = iso === selDate;
              const dayIsToday = iso === todayIso;
              const idx = weekIsos.indexOf(iso);
              const recorded = memberWeeks.filter((mw) => mw.cells[idx]?.state !== "none").length;
              const hasMissing = memberWeeks.some((mw) => mw.cells[idx]?.state === "missing");
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => { hapticLight(); setSelDate(iso); }}
                  className={cn(
                    "py-2 px-0 rounded-lg flex flex-col items-center gap-0.5 relative transition-colors",
                    active ? "bg-foreground text-background border border-foreground" : "bg-transparent border border-transparent",
                    !active && dayIsToday && "text-foreground",
                    !active && !dayIsToday && "text-muted-foreground",
                  )}
                >
                  <span className={cn("text-[9.5px] font-semibold uppercase tracking-wider", active ? "opacity-75" : "opacity-60")}>
                    {weekdayShort(d)}
                  </span>
                  <span className="font-mono tabular-nums text-[16px] font-semibold leading-none">{d.getDate()}</span>
                  <span className={cn(
                    "mt-0.5 font-mono tabular-nums text-[9px] font-semibold",
                    active ? "opacity-85" : hasMissing ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                  )}>
                    {recorded}
                  </span>
                  {dayIsToday && !active && <span className="absolute bottom-1 w-[3px] h-[3px] rounded-full bg-foreground" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day stats */}
        <StatGrid className="grid-cols-4 gap-2 border-b border-border p-2.5">
          <StatTile label={t("staffing.attendance.recorded")} value={dayStats.recorded} />
          <StatTile label={t("staffing.attendance.stillIn")} value={dayStats.stillIn} />
          <StatTile label={t("staffing.attendance.overtime")} value={dayStats.overtime} tone={dayStats.overtime > 0 ? "warning" : undefined} />
          <StatTile label={t("staffing.attendance.noRecord")} value={dayStats.none} />
        </StatGrid>

        {/* Day member list */}
        {selCells.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">{t("staffing.attendance.empty")}</p>
        ) : (
          <div className="divide-y divide-border">
            {selCells.map(({ member, cell }) => {
              if (!cell) return null;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => { hapticLight(); setEditing({ memberId: member.id, date: selDate }); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 bg-background text-left active:bg-muted/60"
                >
                  <Avatar name={member.displayName} src={member.avatarUrl} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-foreground tracking-[-0.01em] truncate">{member.displayName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono tabular-nums">
                      {cell.state === "none"
                        ? (cell.scheduledStart != null && cell.scheduledEnd != null
                          ? `${t("staffing.attendance.scheduled")} ${minLabel(cell.scheduledStart)}–${minLabel(cell.scheduledEnd)}`
                          : t("staffing.attendance.noRecord"))
                        : `${cell.startTime}–${cell.state === "missing" ? "?" : cell.endTime || "···"}`}
                      {cell.workedMin != null && ` · ${hoursLabel(cell.workedMin)}`}
                      {cell.overtimeMin > 0 && <span className="text-amber-600 dark:text-amber-400"> +{hoursLabel(cell.overtimeMin)}</span>}
                    </p>
                  </div>
                  <StateBadge state={cell.state} t={t} />
                </button>
              );
            })}
          </div>
        )}
        {editor}
      </div>
    );
  }

  // ─── Desktop: week matrix ──────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      {weekNav}

      <StatGrid className="shrink-0 border-b border-border p-3">
        <StatTile label={t("staffing.attendance.punchDays")} value={weekStats.recorded} />
        <StatTile label={t("staffing.attendance.stillIn")} value={weekStats.stillIn} />
        <StatTile label={t("staffing.attendance.overtime")} value={weekStats.overtime} tone={weekStats.overtime > 0 ? "warning" : undefined} />
        <StatTile label={t("staffing.attendance.missingOut")} value={weekStats.missing} tone={weekStats.missing > 0 ? "warning" : undefined} />
      </StatGrid>

      {memberWeeks.length === 0 ? (
        <p className="px-6 py-8 text-[12px] text-muted-foreground">{t("staffing.attendance.empty")}</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="min-w-[920px]">
            {/* Day header row */}
            <div className="grid grid-cols-[200px_repeat(7,1fr)] border-b border-border bg-muted/40 sticky top-0 z-10">
              <Eyebrow as="div" className="px-4 py-2 sticky left-0 bg-muted/40 backdrop-blur-sm">
                {t("staffing.attendance.records")}
              </Eyebrow>
              {week.map((d) => {
                const iso = dateKey(d);
                const dayIsToday = iso === todayIso;
                return (
                  <div key={iso} className={cn("px-2 py-2 text-center border-l border-border/60", dayIsToday && "bg-foreground/[0.04]")}>
                    <p className={cn("text-[10px] font-semibold uppercase tracking-wider", dayIsToday ? "text-foreground" : "text-muted-foreground")}>
                      {weekdayShort(d)}
                    </p>
                    <p className={cn("text-[12px] font-mono tabular-nums font-semibold", dayIsToday ? "text-foreground" : "text-muted-foreground")}>
                      {d.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Member rows */}
            <div className="divide-y divide-border">
              {memberWeeks.map(({ member, cells, weekWorkedMin }) => (
                <div key={member.id} className="grid grid-cols-[200px_repeat(7,1fr)] items-stretch">
                  <div className="flex items-center gap-2.5 px-4 py-2.5 min-w-0 sticky left-0 bg-background">
                    <Avatar name={member.displayName} src={member.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground leading-tight">{member.displayName}</p>
                      <p className="text-[10.5px] text-muted-foreground font-mono tabular-nums leading-tight">
                        {hoursLabel(weekWorkedMin)} · {t("staffing.attendance.weekTotal")}
                      </p>
                    </div>
                  </div>
                  {cells.map((cell) => {
                    const dayIsToday = cell.date === todayIso;
                    return (
                      <button
                        key={cell.date}
                        type="button"
                        onClick={() => setEditing({ memberId: member.id, date: cell.date })}
                        className={cn(
                          "border-l border-border/60 px-1 py-2 flex items-center justify-center transition-colors hover:bg-muted/60",
                          dayIsToday && "bg-foreground/[0.04]",
                        )}
                        title={`${member.displayName} · ${weekdayLabel(cell.date)}`}
                      >
                        <CellContent cell={cell} t={t} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {editor}
    </div>
  );
}
