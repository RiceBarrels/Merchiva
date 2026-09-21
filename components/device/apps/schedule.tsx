"use client";

// "My schedule" lite app. A week picker up top (‹ last week · this week ·
// next week ›), then either "Me" — today's shift plus every day of the
// picked week with hours — or, for managers, "Everyone" — a day strip for
// the picked week and who works that day. Read-only: editing lives in the
// original manager schedule, one tap away via the panel's "Full" switch.

import { useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Moon, Sun, User, Users } from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { StatusBadge } from "@/components/ui/status-badge";
import { LiteChoice, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection, LiteStat } from "./lite";
import type { LiteAppProps } from "./types";
import { dateKey } from "@/lib/date-key";

interface ShiftRow {
  id: { toString(): string };
  organizationId: string;
  memberId?: string | null;
  staffName: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  startTime: string;
  endTime: string;
}

interface Shift {
  id: string;
  memberId: string | null;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
}

type Who = "me" | "everyone";

const pad = (n: number) => String(n).padStart(2, "0");

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

/** Monday → Sunday of the week containing `base` (same rule as the manager schedule). */
function weekDates(base: Date): Date[] {
  const day = base.getDay();
  const mon = new Date(base);
  mon.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

function minutesOf(hm: string): number {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

/** Shift length in minutes; an end before the start wraps past midnight. */
function shiftMinutes(s: Shift): number {
  const diff = minutesOf(s.endTime) - minutesOf(s.startTime);
  return diff > 0 ? diff : diff + 24 * 60;
}

/** "8h" / "7h 30m" */
function fmtHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${pad(m)}m`;
}

function timeRange(s: Shift): string {
  return `${s.startTime}–${s.endTime}`;
}

function byStart(a: Shift, b: Shift): number {
  return a.startTime.localeCompare(b.startTime) || a.staffName.localeCompare(b.staffName);
}

/** Time range with the shift length underneath (right slot of a row). */
function ShiftTimes({ shifts }: { shifts: Shift[] }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      {shifts.map((s) => (
        <span key={s.id} className="flex flex-col items-end">
          <span>{timeRange(s)}</span>
          <span className="text-[12px] font-sans text-muted-foreground">{fmtHours(shiftMinutes(s))}</span>
        </span>
      ))}
    </span>
  );
}

export function ScheduleLite({ organizationId, member, isManager }: LiteAppProps) {
  const { t, locale } = useI18n();
  const [who, setWho] = useState<Who>("me");
  // Weeks relative to the current one; the lite app never edits, so any
  // week may be browsed.
  const [weekOffset, setWeekOffset] = useState(0);
  // "Everyone" view: index into the picked week; null = today / Monday.
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const [shiftRows, shiftsReady] = useTable(tables.shift);

  const todayStr = dateKey(new Date());
  const week = useMemo(() => weekDates(addDays(new Date(), weekOffset * 7)), [weekOffset]);
  const weekKeys = useMemo(() => week.map(dateKey), [week]);

  const orgShifts = useMemo<Shift[]>(() => {
    const rows = shiftRows as unknown as ShiftRow[];
    return rows
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id: r.id.toString(),
        memberId: r.memberId ?? null,
        staffName: r.staffName,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
      }));
  }, [shiftRows, organizationId]);

  const myShifts = useMemo(
    () => orgShifts.filter((s) => s.memberId === member.id),
    [orgShifts, member.id],
  );

  const todayShifts = useMemo(
    () => myShifts.filter((s) => s.date === todayStr).sort(byStart),
    [myShifts, todayStr],
  );

  // Picked week, grouped by day (everyone) + my weekly total.
  const weekByDay = useMemo(() => {
    const map = new Map<string, Shift[]>(weekKeys.map((k) => [k, []]));
    for (const s of orgShifts) map.get(s.date)?.push(s);
    for (const list of map.values()) list.sort(byStart);
    return map;
  }, [orgShifts, weekKeys]);
  const myWeekMinutes = useMemo(
    () => myShifts.filter((s) => weekKeys.includes(s.date)).reduce((sum, s) => sum + shiftMinutes(s), 0),
    [myShifts, weekKeys],
  );

  const todayInWeek = weekKeys.indexOf(todayStr);
  const selectedDay = dayIdx ?? (todayInWeek >= 0 ? todayInWeek : 0);
  const dayShifts = weekByDay.get(weekKeys[selectedDay]) ?? [];
  const dayMinutes = dayShifts.reduce((sum, s) => sum + shiftMinutes(s), 0);

  if (!shiftsReady) return <LiteLoading />;

  const dayName = (d: Date) => d.toLocaleDateString(locale, { weekday: "long" });
  const shortDate = (d: Date) => d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const rangeLabel = `${shortDate(week[0])} – ${shortDate(week[6])}`;
  const weekLabel =
    weekOffset === 0 ? t("device.lite.schedule.thisWeek")
    : weekOffset === -1 ? t("device.lite.schedule.lastWeek")
    : weekOffset === 1 ? t("device.lite.schedule.nextWeek")
    : rangeLabel;

  const goWeek = (offset: number) => { hapticLight(); setWeekOffset(offset); setDayIdx(null); };

  const first = todayShifts[0];
  const extraToday = todayShifts.slice(1);

  return (
    <LiteScreen>
      {isManager && (
        <LiteChoice<Who>
          value={who}
          onChange={setWho}
          options={[
            { value: "me", label: t("device.lite.schedule.me"), icon: User },
            { value: "everyone", label: t("device.lite.schedule.everyone"), icon: Users },
          ]}
        />
      )}

      {/* Week picker */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label={t("device.lite.schedule.lastWeek")}
          onClick={() => goWeek(weekOffset - 1)}
          className="grid w-12 flex-none place-items-center rounded-lg border border-border bg-background active:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => goWeek(0)}
          className={cn(
            "flex min-h-14 flex-1 flex-col items-center justify-center rounded-lg border px-3 py-2",
            weekOffset === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background active:bg-muted",
          )}
        >
          <span className="text-[15px] font-semibold leading-tight">{weekLabel}</span>
          <span className={cn("text-[12px] leading-tight", weekOffset === 0 ? "text-primary-foreground/80" : "text-muted-foreground")}>
            {weekLabel === rangeLabel ? t("device.lite.schedule.backToToday") : weekOffset === 0 ? rangeLabel : `${rangeLabel} · ${t("device.lite.schedule.backToToday")}`}
          </span>
        </button>
        <button
          type="button"
          aria-label={t("device.lite.schedule.nextWeek")}
          onClick={() => goWeek(weekOffset + 1)}
          className="grid w-12 flex-none place-items-center rounded-lg border border-border bg-background active:bg-muted"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {who === "me" ? (
        <>
          {weekOffset === 0 && (first ? (
            <LiteStat
              icon={Sun}
              tone="success"
              label={t("device.lite.schedule.todayShift")}
              value={timeRange(first)}
              sub={
                extraToday.length > 0
                  ? `${t("device.lite.schedule.alsoToday")} ${extraToday.map(timeRange).join(", ")}`
                  : `${shortDate(new Date())} · ${fmtHours(shiftMinutes(first))}`
              }
            />
          ) : (
            <LiteStat
              icon={Moon}
              label={t("device.lite.schedule.today")}
              value={t("device.lite.schedule.noShiftToday")}
              sub={shortDate(new Date())}
            />
          ))}

          <LiteSection
            title={weekLabel}
            right={
              <span className="text-[12px] font-mono tabular-nums text-muted-foreground">
                {t("device.lite.schedule.total")} {fmtHours(myWeekMinutes)}
              </span>
            }
          >
            <div className="space-y-2">
              {week.map((d, i) => {
                const key = weekKeys[i];
                const isToday = key === todayStr;
                const shifts = (weekByDay.get(key) ?? []).filter((s) => s.memberId === member.id);
                const off = shifts.length === 0;
                return (
                  <LiteRow
                    key={key}
                    icon={off ? Moon : Clock}
                    iconTone={isToday ? "primary" : off ? "muted" : "success"}
                    title={
                      <span className="inline-flex items-center gap-2">
                        {dayName(d)}
                        {isToday && <StatusBadge tone="info">{t("device.lite.schedule.todayBadge")}</StatusBadge>}
                      </span>
                    }
                    sub={shortDate(d)}
                    right={
                      off ? <span className="text-muted-foreground">{t("device.lite.schedule.off")}</span> : <ShiftTimes shifts={shifts} />
                    }
                    className={isToday ? "border-primary" : off ? "opacity-70" : undefined}
                  />
                );
              })}
            </div>
          </LiteSection>
        </>
      ) : (
        <>
          {/* Day strip for the picked week; the number under each day is how many people work it. */}
          <div className="grid grid-cols-7 gap-1">
            {week.map((d, i) => {
              const key = weekKeys[i];
              const on = i === selectedDay;
              const isToday = key === todayStr;
              const count = (weekByDay.get(key) ?? []).length;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { hapticLight(); setDayIdx(i); }}
                  className={cn(
                    "flex flex-col items-center rounded-lg border py-2",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background active:bg-muted",
                    isToday && !on && "border-primary",
                  )}
                >
                  <span className="text-[11px] font-medium uppercase">{d.toLocaleDateString(locale, { weekday: "short" })}</span>
                  <span className="text-[16px] font-semibold leading-tight">{d.getDate()}</span>
                  <span className={cn("text-[11px] font-mono tabular-nums", on ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {count > 0 ? count : "·"}
                  </span>
                </button>
              );
            })}
          </div>

          <LiteSection
            title={`${t("device.lite.schedule.working")} · ${dayName(week[selectedDay])} ${shortDate(week[selectedDay])}`}
            right={
              dayShifts.length > 0 ? (
                <span className="text-[12px] font-mono tabular-nums text-muted-foreground">
                  {dayShifts.length} · {fmtHours(dayMinutes)}
                </span>
              ) : undefined
            }
          >
            {dayShifts.length === 0 ? (
              <LiteEmpty icon={CalendarDays} title={t("device.lite.schedule.nobodyOn")} />
            ) : (
              <div className="space-y-2">
                {dayShifts.map((s) => (
                  <LiteRow
                    key={s.id}
                    icon={User}
                    iconTone={s.memberId === member.id ? "primary" : "muted"}
                    title={s.staffName}
                    sub={s.memberId === member.id ? t("device.lite.schedule.thatsYou") : undefined}
                    right={<ShiftTimes shifts={[s]} />}
                  />
                ))}
              </div>
            )}
          </LiteSection>
        </>
      )}
    </LiteScreen>
  );
}
