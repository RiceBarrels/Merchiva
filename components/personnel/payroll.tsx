"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-is-mobile";
import { usePermissions } from "@/lib/context/permissions";
import { useI18n, useT } from "@/lib/i18n/context";
import { useCurrency } from "@/lib/currency";
import { useOrgMembers, usePunchEvents, useUsers } from "@/lib/spacetimedb/hooks";
import { setMemberHourlyRate } from "@/lib/spacetimedb/actions";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import {
  computeMemberPayroll,
  fmtHM,
  grossPayCents,
  toPayrollEvents,
  type MemberPayroll,
} from "@/lib/payroll";
import { centsOrNull, toMajor } from "@/lib/money";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Num } from "@/components/ui/num";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { mondayOf } from "@/lib/date-key";
import { intlLocaleTag } from "@/lib/i18n/dates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";

// ─── Types ───────────────────────────────────────────────────────────────────

type PeriodUnit = "day" | "week" | "month" | "year";

interface MemberRow {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  role: string;
  hourlyRate: number | null;
  hourlyRateCents: number | null;
}

interface PayRow {
  member: MemberRow;
  pay: MemberPayroll;
  /** Exact minor units; null when no rate is set. Convert with toMajor only for display. */
  grossCents: number | null;
}

// ─── Period helpers ──────────────────────────────────────────────────────────

/** Local-time YYYY-MM-DD key. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Period keys per unit — day/week: "YYYY-MM-DD" (week keyed by its Monday),
 * month: "YYYY-MM", year: "YYYY".
 */
function defaultKey(unit: PeriodUnit, now: Date): string {
  switch (unit) {
    case "day": return isoDay(now);
    case "week": return isoDay(mondayOf(now));
    case "month": return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    case "year": return String(now.getFullYear());
  }
}

function unitStart(unit: PeriodUnit, key: string): Date {
  switch (unit) {
    case "day":
    case "week":
      return new Date(key + "T00:00:00");
    case "month": {
      const [y, m] = key.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    case "year":
      return new Date(Number(key), 0, 1);
  }
}

/** Exclusive end of the period identified by `key`. */
function unitEnd(unit: PeriodUnit, key: string): Date {
  const s = unitStart(unit, key);
  switch (unit) {
    case "day": {
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      return e;
    }
    case "week": {
      const e = new Date(s);
      e.setDate(e.getDate() + 7);
      return e;
    }
    case "month":
      return new Date(s.getFullYear(), s.getMonth() + 1, 1);
    case "year":
      return new Date(s.getFullYear() + 1, 0, 1);
  }
}

// ─── Member detail sheet ─────────────────────────────────────────────────────

function PayDetailSheet({
  row,
  onClose,
  canEditRate,
  format,
  bcp47,
}: {
  row: PayRow | null;
  onClose: () => void;
  canEditRate: boolean;
  format: (n: number) => string;
  bcp47: string;
}) {
  const t = useT();
  const [rateDraft, setRateDraft] = useState<string>("");
  const [editingRate, setEditingRate] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!row) return null;
  const { member, pay, grossCents } = row;
  const gross = grossCents != null ? toMajor(grossCents) : null;

  const startEdit = () => {
    setRateDraft(member.hourlyRate != null ? String(member.hourlyRate) : "");
    setEditingRate(true);
  };

  const saveRate = async () => {
    const trimmed = rateDraft.trim();
    const val = trimmed === "" ? null : Number(trimmed);
    if (val != null && (!Number.isFinite(val) || val < 0)) {
      toast.error(t("personnel.pay.invalidRate"));
      return;
    }
    setSaving(true);
    try {
      await setMemberHourlyRate(member.id, val);
      hapticSuccess();
      toast.success(t("personnel.pay.rateSaved"));
      setEditingRate(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personnel.pay.rateSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(bcp47, { weekday: "short", month: "short", day: "numeric" });

  return (
    <DynamicUIElement open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DynamicUIElementContent className="max-w-sm">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("personnel.pay.detailTitle")}>
            {t("personnel.pay.detailTitle")}
          </DynamicUIElementTitle>
          <DynamicUIElementDescription>{member.displayName}</DynamicUIElementDescription>
        </DynamicUIElementHeader>

        <div className="space-y-4 pt-1 pb-1">
          {/* Summary */}
          <div className="grid grid-cols-3 border border-border rounded-lg overflow-hidden">
            <div className="px-2.5 py-2 border-r border-border">
              <Eyebrow size="xs">{t("personnel.pay.hours")}</Eyebrow>
              <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">{fmtHM(pay.paidMs)}</p>
            </div>
            <div className="px-2.5 py-2 border-r border-border">
              <Eyebrow size="xs">{t("personnel.pay.breaks")}</Eyebrow>
              <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-muted-foreground">{fmtHM(pay.breakMs)}</p>
            </div>
            <div className="px-2.5 py-2">
              <Eyebrow size="xs">{t("personnel.pay.estPay")}</Eyebrow>
              <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">{gross != null ? format(gross) : "—"}</p>
            </div>
          </div>

          {/* Rate */}
          <div className="flex items-center gap-2 border border-border rounded-lg px-2.5 py-2">
            <CircleDollarSign className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
            <div className="flex-1 min-w-0">
              <Eyebrow size="xs">{t("personnel.pay.hourlyRate")}</Eyebrow>
              {editingRate ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={rateDraft}
                    onChange={(e) => setRateDraft(e.target.value)}
                    placeholder={t("personnel.pay.ratePlaceholder")}
                    className="h-8 px-2 text-[13px] font-mono tabular-nums"
                    autoFocus
                  />
                  <Button size="sm" className="h-8 px-2.5" disabled={saving} onClick={saveRate}>
                    {saving ? <Spinner size={13} /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ) : (
                <p className="font-mono text-[14px] font-semibold tabular-nums mt-0.5">
                  {member.hourlyRate != null ? `${format(member.hourlyRate)}/h` : t("personnel.pay.noRate")}
                </p>
              )}
            </div>
            {canEditRate && !editingRate && (
              <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={startEdit}>
                {t("personnel.pay.editRate")}
              </Button>
            )}
          </div>
          {!canEditRate && member.hourlyRate == null && (
            <p className="text-[11.5px] text-muted-foreground">{t("personnel.pay.askManagerForRate")}</p>
          )}

          {/* Day breakdown */}
          <div>
            <Eyebrow className="mb-1.5">{t("personnel.pay.byDay")}</Eyebrow>
            {pay.days.length === 0 ? (
              <EmptyState compact description={t("personnel.pay.noPunches")} className="border border-border rounded-lg" />
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border max-h-[240px] overflow-y-auto">
                {pay.days.map((d) => (
                  <div key={d.date} className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[12px] text-foreground">{dayLabel(d.date)}</span>
                    <Num size="xs" className="text-foreground" value={
                      <>
                        {fmtHM(d.paidMs)}
                        {d.open && <span className="text-emerald-600 dark:text-emerald-400"> ·</span>}
                        {member.hourlyRate != null && (
                          <span className="text-muted-foreground"> · {format(toMajor(grossPayCents(d.paidMs, member.hourlyRateCents ?? 0)))}</span>
                        )}
                      </>
                    } />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function PayrollPanel({ orgId, myMemberId }: { orgId: string; myMemberId: string | null }) {
  const t = useT();
  const { locale } = useI18n();
  const isMobile = useIsMobile();
  const { isOwner, role, can } = usePermissions();
  const { format } = useCurrency();

  const canViewAll = isOwner || role === "manager";
  const canEditRate = isOwner || can("team", "edit");

  const [rawPunches] = usePunchEvents() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawUsers] = useUsers() as [unknown[], boolean];

  const [unit, setUnit] = useState<PeriodUnit>("week");
  const [fromKey, setFromKey] = useState<string>(() => defaultKey("week", new Date()));
  const [toKey, setToKey] = useState<string>(() => defaultKey("week", new Date()));
  const [detailId, setDetailId] = useState<string | null>(null);

  const bcp47 = intlLocaleTag(locale);

  const changeUnit = (u: PeriodUnit) => {
    hapticLight();
    setUnit(u);
    const key = defaultKey(u, new Date());
    setFromKey(key);
    setToKey(key);
  };

  // Custom range: start of the "from" period → exclusive end of the "to"
  // period. Swapped bounds are tolerated (picking to < from just reverses).
  const { start, end } = useMemo(() => {
    const now = new Date();
    const fallback = defaultKey(unit, now);
    const f = fromKey || fallback;
    const t2 = toKey || fallback;
    const [lo, hi] = unitStart(unit, f) <= unitStart(unit, t2) ? [f, t2] : [t2, f];
    return { start: unitStart(unit, lo), end: unitEnd(unit, hi) };
  }, [unit, fromKey, toKey]);

  const weekOptions = useMemo(() => {
    const monday = mondayOf(new Date());
    return Array.from({ length: 52 }, (_, i) => {
      const s = new Date(monday);
      s.setDate(monday.getDate() - 7 * i);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return {
        key: isoDay(s),
        label: `${s.toLocaleDateString(bcp47, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(bcp47, { month: "short", day: "numeric", year: "numeric" })}`,
      };
    });
  }, [bcp47]);

  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString(bcp47, { month: "long", year: "numeric" }),
      };
    });
  }, [bcp47]);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => ({ key: String(y - i), label: String(y - i) }));
  }, []);

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
        role: String(m.role ?? "staff"),
        // Exact minor units from `hourlyRateCents` when present, else the
        // legacy f64. Everything downstream accumulates in cents.
        hourlyRateCents: centsOrNull(m, "hourlyRate"),
        hourlyRate: m.hourlyRate != null ? Number(m.hourlyRate) : null,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [rawMembers, rawUsers, orgId]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const rows = useMemo<PayRow[]>(() => {
    const now = new Date();
    const events = toPayrollEvents(rawPunches as never[], orgId);
    const byMember = new Map<string, typeof events>();
    for (const e of events) {
      const arr = byMember.get(e.memberId) ?? [];
      arr.push(e);
      byMember.set(e.memberId, arr);
    }
    const visible = canViewAll ? members : members.filter((m) => m.id === myMemberId);
    return visible
      .map((member) => {
        const pay = computeMemberPayroll(byMember.get(member.id) ?? [], start.getTime(), end.getTime(), now.getTime());
        const grossCents =
          member.hourlyRateCents != null
            ? grossPayCents(pay.paidMs, member.hourlyRateCents)
            : null;
        return { member, pay, grossCents };
      })
      .sort((a, b) => b.pay.paidMs - a.pay.paidMs);
  }, [rawPunches, orgId, members, start, end, canViewAll, myMemberId]);

  const totals = useMemo(() => {
    const paidMs = rows.reduce((s, r) => s + r.pay.paidMs, 0);
    // Summed as integers, converted once — see lib/money.
    const gross = toMajor(rows.reduce((s, r) => s + (r.grossCents ?? 0), 0));
    const missingRate = rows.filter((r) => r.member.hourlyRate == null && r.pay.paidMs > 0).length;
    const onClock = rows.filter((r) => r.pay.openNow).length;
    return { paidMs, gross, missingRate, onClock };
  }, [rows]);

  const detailRow = detailId ? rows.find((r) => r.member.id === detailId) ?? null : null;

  const boundPicker = (value: string, onChange: (v: string) => void, ariaLabel: string) => {
    if (unit === "day") {
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => { if (e.target.value) { hapticLight(); onChange(e.target.value); } }}
          aria-label={ariaLabel}
          className="h-8 px-2 text-[12px] font-mono tabular-nums flex-1 min-w-0 max-w-[160px]"
        />
      );
    }
    const options = unit === "week" ? weekOptions : unit === "month" ? monthOptions : yearOptions;
    return (
      <Select value={value} onValueChange={(v) => { if (v) { hapticLight(); onChange(v); } }}>
        <SelectTrigger className="h-8 text-[12px] flex-1 min-w-0 max-w-[200px]" aria-label={ariaLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const rangeControls = (
    <div className="flex items-center gap-1.5">
      <Select value={unit} onValueChange={(v) => changeUnit(v as PeriodUnit)}>
        <SelectTrigger className="h-8 w-auto shrink-0 text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">{t("personnel.pay.unitDay")}</SelectItem>
          <SelectItem value="week">{t("personnel.pay.unitWeek")}</SelectItem>
          <SelectItem value="month">{t("personnel.pay.unitMonth")}</SelectItem>
          <SelectItem value="year">{t("personnel.pay.unitYear")}</SelectItem>
        </SelectContent>
      </Select>
      {boundPicker(fromKey, setFromKey, t("personnel.pay.from"))}
      <span className="text-[12px] text-muted-foreground shrink-0">–</span>
      {boundPicker(toKey, setToKey, t("personnel.pay.to"))}
    </div>
  );

  const header = (
    <div className="px-4 py-2.5 lg:px-6 border-b border-border bg-background space-y-2">
      <div className="min-w-0">
        <Eyebrow>{t("personnel.pay.title")}</Eyebrow>
        <p className="text-[13px] font-semibold text-foreground">
          {canViewAll ? t("personnel.pay.subtitleManager") : t("personnel.pay.subtitleSelf")}
        </p>
      </div>
      {rangeControls}
    </div>
  );

  const stats = (
    <StatGrid className={cn("shrink-0 border-b border-border p-3", canViewAll ? "lg:grid-cols-4" : "grid-cols-3 lg:grid-cols-3")}>
      <StatTile label={t("personnel.pay.totalHours")} value={fmtHM(totals.paidMs)} />
      <StatTile label={t("personnel.pay.estPay")} value={format(totals.gross)} />
      {canViewAll ? (
        <>
          <StatTile label={t("personnel.pay.onClockNow")} value={String(totals.onClock)} />
          <StatTile label={t("personnel.pay.missingRates")} value={String(totals.missingRate)} tone={totals.missingRate > 0 ? "warning" : undefined} />
        </>
      ) : (
        <StatTile
          label={t("personnel.pay.hourlyRate")}
          value={rows[0]?.member.hourlyRate != null ? `${format(rows[0].member.hourlyRate)}/h` : "—"}
        />
      )}
    </StatGrid>
  );

  const list = rows.length === 0 ? (
    <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">{t("personnel.pay.empty")}</p>
  ) : (
    <div className="divide-y divide-border">
      {rows.map((r) => (
        <button
          key={r.member.id}
          type="button"
          onClick={() => { hapticLight(); setDetailId(r.member.id); }}
          className="w-full flex items-center gap-2.5 px-4 lg:px-6 py-3 bg-background text-left hover:bg-muted/60 active:bg-muted/60"
        >
          <Avatar name={r.member.displayName} src={r.member.avatarUrl} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-foreground tracking-[-0.01em] truncate">
              {r.member.displayName}
              {r.pay.openNow && (
                <StatusBadge tone="success" size="xs" className="ml-1.5 align-middle normal-case tracking-normal font-semibold">
                  {t("personnel.pay.onClock")}
                </StatusBadge>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono tabular-nums">
              {fmtHM(r.pay.paidMs)}
              {r.pay.breakMs > 0 && ` · ${t("personnel.pay.breaks")} ${fmtHM(r.pay.breakMs)}`}
              {" · "}
              {r.member.hourlyRate != null ? `${format(r.member.hourlyRate)}/h` : t("personnel.pay.noRate")}
            </p>
          </div>
          <span className="font-mono text-[14px] font-semibold tabular-nums text-foreground shrink-0">
            {r.grossCents != null ? format(toMajor(r.grossCents)) : "—"}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );

  const sheet = (
    <PayDetailSheet
      row={detailRow}
      onClose={() => setDetailId(null)}
      canEditRate={canEditRate}
      format={format}
      bcp47={bcp47}
    />
  );

  if (isMobile) {
    return (
      <div className="bg-background">
        {header}
        {stats}
        {list}
        {sheet}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      {header}
      {stats}
      <div className="flex-1 min-h-0 overflow-y-auto">{list}</div>
      {sheet}
    </div>
  );
}
