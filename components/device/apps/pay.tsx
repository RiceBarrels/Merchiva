"use client";

// "My hours & pay" lite app for /store + /personal. Shows ONLY the member's own
// numbers: hours this week (Mon–Sun) and this month, the estimated pay when an
// hourly rate is set on org_member, and a short list of recent shifts. All the
// payroll math comes from lib/payroll.ts — the same helper the manager Pay tab
// uses — so the two screens always agree.

import { useEffect, useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { BadgeDollarSign, CalendarDays, CalendarRange, Clock, History } from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePunchEvents } from "@/lib/spacetimedb/hooks";
import { buildSessions, computeMemberPayroll, fmtHM, grossPay, toPayrollEvents } from "@/lib/payroll";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n/context";
import { LOCALE_BCP47 } from "@/lib/i18n/config";
import { LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection, LiteStat } from "./lite";
import type { LiteAppProps } from "./types";

interface MemberRaw {
  id: { toString(): string };
  organizationId: string;
  hourlyRate?: number | null;
}

const RECENT_SHIFTS = 8;

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const out = new Date(d);
  out.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  out.setHours(0, 0, 0, 0);
  return out;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), template);
}

export function PayLite({ organizationId, member }: LiteAppProps) {
  const { t, locale } = useI18n();
  const bcp47 = LOCALE_BCP47[locale];
  const { format } = useCurrency();

  const [rawPunches, punchesReady] = usePunchEvents() as [unknown[], boolean];
  const [rawMembers, membersReady] = useTable(tables.orgMember);

  // Tick once a minute so an open shift counts up live.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const hourlyRate = useMemo<number | null>(() => {
    const row = (rawMembers as unknown as MemberRaw[]).find(
      (m) => m.organizationId === organizationId && m.id.toString() === member.id,
    );
    return row?.hourlyRate != null ? Number(row.hourlyRate) : null;
  }, [rawMembers, organizationId, member.id]);

  const myEvents = useMemo(
    () => toPayrollEvents(rawPunches as never[], organizationId).filter((e) => e.memberId === member.id),
    [rawPunches, organizationId, member.id],
  );

  const { week, month, shifts } = useMemo(() => {
    const now = new Date(nowMs);
    const weekStart = mondayOf(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      week: computeMemberPayroll(myEvents, weekStart.getTime(), weekEnd.getTime(), nowMs),
      month: computeMemberPayroll(myEvents, monthStart.getTime(), monthEnd.getTime(), nowMs),
      shifts: buildSessions(myEvents, nowMs)
        .sort((a, b) => b.inMs - a.inMs)
        .slice(0, RECENT_SHIFTS),
    };
  }, [myEvents, nowMs]);

  const payLine = (paidMs: number) =>
    hourlyRate != null
      ? fill(t("device.lite.pay.estimated"), { amount: format(grossPay(paidMs, hourlyRate)) })
      : t("device.lite.pay.noRate");

  const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(bcp47, { weekday: "short", month: "short", day: "numeric" });
  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(bcp47, { hour: "numeric", minute: "2-digit" });

  if (!punchesReady || !membersReady) return <LiteLoading />;

  return (
    <LiteScreen>
      <LiteStat
        icon={CalendarDays}
        label={t("device.lite.pay.thisWeek")}
        value={fmtHM(week.paidMs)}
        sub={week.openNow ? t("device.lite.pay.workingNow") : payLine(week.paidMs)}
        tone={week.openNow ? "success" : "default"}
      />
      <LiteStat icon={CalendarRange} label={t("device.lite.pay.thisMonth")} value={fmtHM(month.paidMs)} sub={payLine(month.paidMs)} />

      {hourlyRate != null && (
        <LiteRow icon={BadgeDollarSign} iconTone="primary" title={t("device.lite.pay.rate")} right={`${format(hourlyRate)}/h`} />
      )}

      <LiteSection title={t("device.lite.pay.recent")}>
        {shifts.length === 0 ? (
          <LiteEmpty icon={History} title={t("device.lite.pay.noShifts")} description={t("device.lite.pay.noShiftsSub")} className="min-h-[24vh]" />
        ) : (
          <div className="space-y-2">
            {shifts.map((s) => {
              const open = s.outMs == null;
              const paidMs = Math.max(0, (s.outMs ?? nowMs) - s.inMs - s.breakMs);
              return (
                <LiteRow
                  key={s.inMs}
                  icon={Clock}
                  iconTone={open ? "success" : "muted"}
                  title={fmtDay(s.inMs)}
                  sub={open ? `${fmtTime(s.inMs)} · ${t("device.lite.pay.stillWorking")}` : `${fmtTime(s.inMs)} – ${fmtTime(s.outMs as number)}`}
                  right={fmtHM(paidMs)}
                />
              );
            })}
          </div>
        )}
      </LiteSection>
    </LiteScreen>
  );
}
