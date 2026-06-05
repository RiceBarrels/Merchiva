"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  Filter,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useOrgMembers,
  useTrainingDayGrades,
  useTrainingDays,
  useTrainingObjectiveGrades,
  useTrainingObjectives,
} from "@/lib/spacetimedb/hooks";
import { gradeTrainingDay } from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { DayRail, type DayRailItem } from "./day-rail";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface DayRow {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
  sortOrder: number;
}

interface ObjectiveRow {
  id: string;
  dayId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  sortOrder: number;
}

interface MemberRow {
  id: string;
  displayName: string;
  role: string;
}

function avatarColor(name: string): string {
  const colors = [
    "bg-cyan-100 text-cyan-800",
    "bg-violet-100 text-violet-800",
    "bg-rose-100 text-rose-800",
    "bg-amber-100 text-amber-800",
    "bg-emerald-100 text-emerald-800",
    "bg-sky-100 text-sky-800",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function isHtmlContent(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

export function TrainingTrainerView({ orgId }: { orgId: string }) {
  const t = useT();
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawDayGrades] = useTrainingDayGrades() as [unknown[], boolean];
  const [rawObjGrades] = useTrainingObjectiveGrades() as [unknown[], boolean];

  const days = useMemo<DayRow[]>(
    () =>
      (rawDays as any[])
        .filter((r) => r.organizationId === orgId)
        .map((r) => ({
          id: r.id.toString(),
          dayNumber: r.dayNumber,
          title: r.title,
          description: r.description ?? null,
          sortOrder: r.sortOrder,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.dayNumber - b.dayNumber),
    [rawDays, orgId],
  );

  const objectivesByDay = useMemo<Map<string, ObjectiveRow[]>>(() => {
    const map = new Map<string, ObjectiveRow[]>();
    for (const r of rawObjectives as any[]) {
      if (r.organizationId !== orgId) continue;
      const mt = r.mediaType ?? null;
      const obj: ObjectiveRow = {
        id: r.id.toString(),
        dayId: r.dayId,
        text: r.text,
        mediaUrl: r.mediaUrl ?? null,
        mediaType: mt === "image" || mt === "video" ? mt : null,
        sortOrder: r.sortOrder,
      };
      const list = map.get(obj.dayId) ?? [];
      list.push(obj);
      map.set(obj.dayId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [rawObjectives, orgId]);

  const trainees = useMemo<MemberRow[]>(
    () =>
      (rawMembers as any[])
        .filter(
          (m) =>
            m.organizationId === orgId &&
            m.status === "active" &&
            m.role === "staff",
        )
        .map((m) => ({
          id: m.id.toString(),
          displayName: m.displayName || "—",
          role: m.role,
        })),
    [rawMembers, orgId],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [traineeId, setTraineeId] = useState<string | null>(null);

  useEffect(() => {
    if (activeId && days.some((d) => d.id === activeId)) return;
    setActiveId(days[0]?.id ?? null);
  }, [days, activeId]);

  useEffect(() => {
    if (traineeId && trainees.some((m) => m.id === traineeId)) return;
    setTraineeId(trainees[0]?.id ?? null);
  }, [trainees, traineeId]);

  const activeDay = days.find((d) => d.id === activeId) ?? null;
  const activeObjectives = activeDay ? objectivesByDay.get(activeDay.id) ?? [] : [];
  const activeTrainee = trainees.find((m) => m.id === traineeId) ?? null;

  // Per-day completion (n/m) — count of objectives passed by EACH trainee on the day
  const traineeProgressByDay = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const totalTrainees = trainees.length || 0;
    for (const d of days) {
      const passed = (rawObjGrades as any[]).filter(
        (g) =>
          g.organizationId === orgId &&
          g.status === "pass" &&
          (objectivesByDay.get(d.id) ?? []).some((o) => o.id === g.objectiveId),
      );
      // Per-trainee — count distinct trainees who passed at least one objective in this day
      const distinct = new Set<string>(passed.map((g) => g.traineeId));
      out[d.id] = `${distinct.size}/${totalTrainees}`;
    }
    return out;
  }, [days, objectivesByDay, rawObjGrades, orgId, trainees.length]);

  // Existing day grade for selected trainee + day
  const existingDayGrade = useMemo(() => {
    if (!activeDay || !traineeId) return null;
    return (
      (rawDayGrades as any[]).find(
        (g) =>
          g.organizationId === orgId &&
          g.traineeId === traineeId &&
          g.dayId === activeDay.id,
      ) ?? null
    );
  }, [rawDayGrades, orgId, traineeId, activeDay]);

  // Rubric — five 1-5 sliders that average into a 1-5 day rating
  const [rubric, setRubric] = useState<number[]>([0, 0, 0, 0, 0]);
  const [notes, setNotes] = useState("");
  const [verdict, setVerdict] = useState<"pass" | "retry" | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed when trainee or day changes
  useEffect(() => {
    if (existingDayGrade) {
      // Reverse-engineer a uniform rubric matching the stored rating
      const r = Math.max(1, Math.min(5, Math.round(existingDayGrade.rating ?? 0)));
      setRubric([r, r, r, r, r]);
      setNotes(existingDayGrade.comment ?? "");
      setVerdict(r >= 3 ? "pass" : "retry");
    } else {
      setRubric([0, 0, 0, 0, 0]);
      setNotes("");
      setVerdict(null);
    }
  }, [existingDayGrade, traineeId, activeId]);

  const rubricItems = [
    { id: 0, label: t("training.rubric.knowsMaterial"), hint: t("training.rubric.knowsMaterialHint") },
    { id: 1, label: t("training.rubric.practicalSkill"), hint: t("training.rubric.practicalSkillHint") },
    { id: 2, label: t("training.rubric.speedFlow"), hint: t("training.rubric.speedFlowHint") },
    { id: 3, label: t("training.rubric.recovery"), hint: t("training.rubric.recoveryHint") },
    { id: 4, label: t("training.rubric.stationDiscipline"), hint: t("training.rubric.stationDisciplineHint") },
  ];

  const total = rubric.reduce((a, b) => a + b, 0);
  const max = 25;
  const avg = total === 0 ? 0 : total / rubric.length;

  const submit = useCallback(async () => {
    if (!activeDay || !traineeId || !verdict) return;
    const rating = Math.max(
      1,
      Math.min(5, Math.round(verdict === "pass" ? Math.max(avg, 3) : Math.min(avg || 1, 2))),
    );
    setBusy(true);
    try {
      await gradeTrainingDay({
        traineeId,
        dayId: activeDay.id,
        rating,
        comment: notes.trim() || null,
      });
    } catch (err) {
      console.error("[Training] submit grade failed", err);
    } finally {
      setBusy(false);
    }
  }, [activeDay, traineeId, verdict, avg, notes]);

  const dayRailItems = useMemo<DayRailItem[]>(
    () =>
      days.map((d) => ({
        id: d.id,
        dayNumber: d.dayNumber,
        title: d.title,
        type: "practice" as const,
      })),
    [days],
  );

  const desc = activeDay?.description ?? "";

  return (
    <div className="flex-1 min-h-0 flex">
      <aside className="w-[260px] shrink-0 border-r border-border bg-background hidden lg:flex flex-col">
        <DayRail
          days={dayRailItems}
          activeId={activeId}
          onSelect={setActiveId}
          role="trainer"
          traineeProgress={traineeProgressByDay}
        />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col bg-background min-h-0">
        <div className="border-b border-border px-4 lg:px-6 py-3 flex items-center gap-3 flex-wrap">
          {activeDay && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground bg-muted border border-border rounded-[0.3rem] px-1.5 py-0.5">
              D{String(activeDay.dayNumber).padStart(2, "0")}
            </span>
          )}
          <div className="flex-1 min-w-[200px]">
            <div className="text-[15px] font-semibold tracking-[-0.01em] truncate">
              {activeDay?.title ?? t("training.trainer.pickADay")}
            </div>
            <div className="text-[11.5px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-[11px] w-[11px]" strokeWidth={1.75} />
                {t("training.trainer.dayN").replace("{n}", String(activeDay?.dayNumber ?? "—"))}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-[11px] w-[11px]" strokeWidth={1.75} />
                {t("training.trainer.required")}
              </span>
              {activeDay && (
                <>
                  <span>·</span>
                  <span>
                    <span className="font-mono">{traineeProgressByDay[activeDay.id] ?? "0/0"}</span>{" "}
                    {t("training.trainer.traineesPassed")}
                  </span>
                </>
              )}
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[0.3rem] font-mono text-[10px] uppercase tracking-wider"
            style={{
              background: "#faf5ec",
              border: "1px solid #ecd9b8",
              color: "oklch(0.55 0.09 55)",
            }}
          >
            <Award className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.trainer.badge")}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-10 py-6">
          <div className="max-w-[640px] mx-auto merchiva-quill-prose">
            {desc.trim() ? (
              isHtmlContent(desc) ? (
                <div dangerouslySetInnerHTML={{ __html: desc }} />
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{desc}</p>
              )
            ) : (
              <p className="italic text-muted-foreground">
                {t("training.trainer.noContent")}
              </p>
            )}

            {activeObjectives.length > 0 && (
              <>
                <h2>{t("training.trainer.objectives")}</h2>
                <ul>
                  {activeObjectives.map((o) => (
                    <li key={o.id}>
                      {isHtmlContent(o.text) ? (
                        <span dangerouslySetInnerHTML={{ __html: o.text }} />
                      ) : (
                        o.text
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right rail: trainee roster + grading panel */}
      <aside className="w-[400px] shrink-0 border-l border-border bg-background hidden xl:flex flex-col min-h-0">
        <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2 shrink-0">
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold leading-tight">{t("training.trainer.trainees")}</div>
            <div className="text-[10.5px] text-muted-foreground mt-0.5">
              <span className="font-mono">{trainees.length}</span> {t("training.role.active")}
            </div>
          </div>
          <button
            type="button"
            className="h-7 w-7 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center text-muted-foreground hover:bg-muted"
            title={t("training.trainer.filter")}
          >
            <Filter className="h-3 w-3" strokeWidth={1.75} />
          </button>
        </div>

        <div className="border-b border-border divide-y divide-border shrink-0 max-h-[240px] overflow-y-auto">
          {trainees.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              {t("training.trainer.noTraineesYet")}
            </div>
          ) : (
            trainees.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTraineeId(m.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-l-2 transition-colors",
                  traineeId === m.id
                    ? "bg-muted border-l-foreground"
                    : "border-l-transparent hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "w-7 h-7 rounded-full inline-flex items-center justify-center text-[10.5px] font-semibold shrink-0",
                    avatarColor(m.displayName),
                  )}
                >
                  {initials(m.displayName)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium leading-tight truncate">
                    {m.displayName}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">{m.role}</div>
                </div>
              </button>
            ))
          )}
        </div>

        {activeTrainee && activeDay ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-4 pt-4 pb-3 flex items-center gap-2.5 bg-muted/30">
              <span
                className={cn(
                  "w-8 h-8 rounded-full inline-flex items-center justify-center text-[11px] font-semibold shrink-0",
                  avatarColor(activeTrainee.displayName),
                )}
              >
                {initials(activeTrainee.displayName)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold leading-tight truncate">
                  {activeTrainee.displayName}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {t("training.trainer.gradingDay").replace("{n}", String(activeDay.dayNumber))}
                </div>
              </div>
              <button
                type="button"
                className="h-7 px-2 rounded-[0.3rem] border border-border bg-background text-[11px] hover:bg-muted inline-flex items-center gap-1"
                title={t("training.trainer.message")}
              >
                <MessageSquare className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.trainer.dm")}
              </button>
            </div>

            {/* Rubric */}
            <div className="border-y border-border">
              <div className="px-4 py-2 flex items-center gap-2 bg-muted/60 border-b border-border">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("training.trainer.rubricLabel")}
                </span>
                <div className="flex-1" />
                <span className="font-mono text-[11px] tabular-nums">
                  <span className="text-foreground font-semibold">{total}</span>
                  <span className="text-muted-foreground">/{max}</span>
                </span>
              </div>
              {rubricItems.map((r) => (
                <RubricRow
                  key={r.id}
                  label={r.label}
                  hint={r.hint}
                  value={rubric[r.id]}
                  onChange={(v) =>
                    setRubric((prev) => prev.map((x, i) => (i === r.id ? v : x)))
                  }
                  disabled={busy}
                />
              ))}
            </div>

            {/* Notes */}
            <div className="px-4 py-3">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("training.trainer.notesForTrainee")}
                </span>
                <div className="flex-1" />
                <span className="text-[10.5px] text-muted-foreground">
                  {t("training.trainer.visibleTo").replace("{name}", activeTrainee.displayName.split(" ")[0])}
                </span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                disabled={busy}
                placeholder={t("training.trainer.notesPlaceholder")}
                className="w-full rounded-[0.3rem] border border-border bg-background p-2.5 text-[12.5px] leading-relaxed outline-none focus:border-stone-400 resize-none disabled:opacity-50"
              />
            </div>

            {/* Verdict + submit */}
            <div className="px-4 py-3 border-t border-border bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setVerdict("pass")}
                  className={cn(
                    "flex-1 h-9 rounded-[0.3rem] border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors",
                    verdict === "pass"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-background text-stone-700 dark:text-stone-200 border-stone-300 hover:border-emerald-400 hover:text-emerald-700",
                  )}
                >
                  <CheckCircle2 className="h-[14px] w-[14px]" strokeWidth={1.75} /> {t("training.pass")}
                </button>
                <button
                  type="button"
                  onClick={() => setVerdict("retry")}
                  className={cn(
                    "flex-1 h-9 rounded-[0.3rem] border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors",
                    verdict === "retry"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-background text-stone-700 dark:text-stone-200 border-stone-300 hover:border-amber-400 hover:text-amber-700",
                  )}
                >
                  <RotateCcw className="h-[14px] w-[14px]" strokeWidth={1.75} /> {t("training.trainer.retry")}
                </button>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={!verdict || total === 0 || busy}
                className="w-full h-9 rounded-[0.3rem] bg-foreground text-background text-[12.5px] font-medium hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                {t("training.trainer.submitGrade")}
                <ArrowRight className="h-[13px] w-[13px]" strokeWidth={1.75} />
              </button>
              <div className="mt-1.5 text-[10.5px] text-muted-foreground text-center">
                {t("training.trainer.willBeNotified").replace("{name}", activeTrainee.displayName.split(" ")[0])}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center px-4 text-[12.5px] text-muted-foreground text-center">
            {t("training.trainer.pickTrainee")}
          </div>
        )}
      </aside>
    </div>
  );
}

function RubricRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="px-4 py-3 border-t border-border first:border-t-0">
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-[12.5px] font-medium flex-1">{label}</div>
        <div className="font-mono text-[10.5px] text-muted-foreground">{hint}</div>
      </div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value >= n;
          const isTop = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={cn(
                "flex-1 h-7 rounded-[0.3rem] border text-[11px] font-mono tabular-nums font-semibold transition-colors disabled:cursor-not-allowed",
                filled
                  ? isTop
                    ? "bg-foreground text-background border-foreground"
                    : "bg-stone-800 text-white border-stone-800"
                  : "bg-background text-muted-foreground border-border hover:border-stone-400",
              )}
            >
              {n}
            </button>
          );
        })}
        <div className="ml-2 w-[80px] text-right">
          {value > 0 ? (
            <span className="font-mono text-[11px] tabular-nums">
              <span className="text-foreground font-semibold">{value}</span>
              <span className="text-muted-foreground">/5</span>
            </span>
          ) : (
            <span className="font-mono text-[10.5px] text-muted-foreground">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
