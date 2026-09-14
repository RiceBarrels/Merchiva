"use client";

// "Training" lite app for /store + /personal. One screen: where the member is
// in the curriculum (Day N of M), the tasks for that day as big tappable rows,
// and a single next-step button (ask the trainer for sign-off). Completed days
// are listed underneath. Same rules as the intern view in
// components/training/intern-view.tsx: a day is complete when the trainer
// signed it off (day grade >= 3) or every objective is marked "pass"; the
// current day is the first incomplete one.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  Circle,
  Clock,
  GraduationCap,
  Hourglass,
  ListChecks,
  Send,
  Trophy,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";
import {
  useTrainingDayGrades,
  useTrainingDays,
  useTrainingObjectiveGrades,
  useTrainingObjectives,
  useTrainingReviewRequests,
} from "@/lib/spacetimedb/hooks";
import { requestTrainingReview } from "@/lib/spacetimedb/actions";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { StatusBadge } from "@/components/ui/status-badge";
import { LiteButton, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection, LiteStat } from "./lite";
import type { LiteAppProps } from "./types";

// ─── Row shapes (SpacetimeDB rows, cast locally) ────────────────────────────

interface DayRaw {
  id: { toString(): string };
  organizationId: string;
  dayNumber: number;
  title: string;
  sortOrder: number;
}

interface ObjectiveRaw {
  id: { toString(): string };
  organizationId: string;
  dayId: string;
  text: string;
  sortOrder: number;
}

interface DayGradeRaw {
  organizationId: string;
  traineeId: string;
  dayId: string;
  rating: number;
}

interface ObjectiveGradeRaw {
  organizationId: string;
  traineeId: string;
  objectiveId: string;
  status: string;
}

interface ReviewRequestRaw {
  organizationId: string;
  traineeId: string;
  dayId: string;
  status: string;
}

interface Day {
  id: string;
  dayNumber: number;
  title: string;
}

interface Objective {
  id: string;
  dayId: string;
  text: string;
}

/** Objective text may be rich HTML from the editor; staff only need the words. */
function plainText(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), template);
}

export function TrainingLite({ organizationId, member }: LiteAppProps) {
  const t = useT();
  const traineeId = member.id;

  const [rawDays, daysReady] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];
  const [rawDayGrades] = useTrainingDayGrades() as [unknown[], boolean];
  const [rawObjGrades] = useTrainingObjectiveGrades() as [unknown[], boolean];
  const [rawReviews] = useTrainingReviewRequests() as [unknown[], boolean];

  const days = useMemo<Day[]>(
    () =>
      (rawDays as DayRaw[])
        .filter((r) => r.organizationId === organizationId)
        .map((r) => ({ id: r.id.toString(), dayNumber: r.dayNumber, title: r.title }))
        .sort((a, b) => a.dayNumber - b.dayNumber),
    [rawDays, organizationId],
  );

  const objectivesByDay = useMemo<Map<string, Objective[]>>(() => {
    const map = new Map<string, Objective[]>();
    const sorted = (rawObjectives as ObjectiveRaw[])
      .filter((r) => r.organizationId === organizationId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const r of sorted) {
      const list = map.get(r.dayId) ?? [];
      list.push({ id: r.id.toString(), dayId: r.dayId, text: r.text });
      map.set(r.dayId, list);
    }
    return map;
  }, [rawObjectives, organizationId]);

  // objectiveId → "pass" | "fail" from the trainer.
  const objectiveGrade = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const g of rawObjGrades as ObjectiveGradeRaw[]) {
      if (g.organizationId !== organizationId || g.traineeId !== traineeId) continue;
      map.set(g.objectiveId, g.status);
    }
    return map;
  }, [rawObjGrades, organizationId, traineeId]);

  const completedDayIds = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const g of rawDayGrades as DayGradeRaw[]) {
      if (g.organizationId !== organizationId || g.traineeId !== traineeId) continue;
      if ((g.rating ?? 0) >= 3) set.add(g.dayId);
    }
    for (const [dayId, objs] of objectivesByDay) {
      if (objs.length > 0 && objs.every((o) => objectiveGrade.get(o.id) === "pass")) set.add(dayId);
    }
    return set;
  }, [rawDayGrades, objectivesByDay, objectiveGrade, organizationId, traineeId]);

  const pendingReviewDayIds = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const r of rawReviews as ReviewRequestRaw[]) {
      if (r.organizationId !== organizationId || r.traineeId !== traineeId) continue;
      if (r.status === "pending") set.add(r.dayId);
    }
    return set;
  }, [rawReviews, organizationId, traineeId]);

  const completedDays = days.filter((d) => completedDayIds.has(d.id));
  const currentDay = days.find((d) => !completedDayIds.has(d.id)) ?? null;
  const allDone = days.length > 0 && !currentDay;
  const objectives = currentDay ? objectivesByDay.get(currentDay.id) ?? [] : [];

  // Self-check ticks, shared with the manager intern view via the same
  // localStorage key so a tick here shows there too.
  const taskKey = `bz_training_tasks_${organizationId}_${traineeId}`;
  const [ticks, setTicks] = useState<Record<string, Record<string, boolean>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(taskKey);
      return raw ? (JSON.parse(raw) as Record<string, Record<string, boolean>>) : {};
    } catch {
      return {};
    }
  });
  const dayTicks = currentDay ? ticks[currentDay.id] ?? {} : {};
  const toggleTick = (objectiveId: string) => {
    if (!currentDay) return;
    setTicks((prev) => {
      const next = {
        ...prev,
        [currentDay.id]: { ...(prev[currentDay.id] ?? {}), [objectiveId]: !(prev[currentDay.id]?.[objectiveId] ?? false) },
      };
      try {
        window.localStorage.setItem(taskKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isDone = (o: Objective) => objectiveGrade.get(o.id) === "pass" || !!dayTicks[o.id];
  const doneCount = objectives.filter(isDone).length;
  const allTicked = objectives.length > 0 && doneCount === objectives.length;
  const reviewPending = currentDay ? pendingReviewDayIds.has(currentDay.id) : false;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const askSignOff = () => {
    if (!currentDay || busy) return;
    setBusy(true);
    requestTrainingReview(currentDay.id)
      .then(() => {
        setConfirmOpen(false);
        toast.success(t("device.lite.training.sent"));
      })
      .catch((err: unknown) => {
        console.error("[TrainingLite] request review failed", err);
        toast.error(t("device.lite.training.requestFailed"));
      })
      .finally(() => setBusy(false));
  };

  if (!daysReady) return <LiteLoading />;

  if (days.length === 0) {
    return (
      <LiteScreen>
        <LiteEmpty icon={GraduationCap} title={t("device.lite.training.noTraining")} description={t("device.lite.training.noTrainingSub")} />
      </LiteScreen>
    );
  }

  return (
    <LiteScreen>
      {allDone ? (
        <LiteStat icon={Trophy} label={t("device.lite.training.title")} value={t("device.lite.training.allDone")} sub={t("device.lite.training.allDoneSub")} tone="success" />
      ) : (
        <LiteStat
          icon={GraduationCap}
          label={t("device.lite.training.title")}
          value={fill(t("device.lite.training.dayOf"), { day: currentDay?.dayNumber ?? 1, total: days.length })}
          sub={currentDay?.title}
          tone={reviewPending ? "warning" : "default"}
        />
      )}

      {currentDay && (
        <LiteSection
          title={t("device.lite.training.tasks")}
          right={
            objectives.length > 0 && (
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                {doneCount}/{objectives.length}
              </span>
            )
          }
        >
          {objectives.length === 0 ? (
            <LiteRow icon={Hourglass} title={t("device.lite.training.noTasks")} />
          ) : (
            <div className="space-y-2">
              {objectives.map((o, i) => {
                const grade = objectiveGrade.get(o.id);
                const done = isDone(o);
                const label = plainText(o.text) || fill(t("device.lite.training.taskFallback"), { number: i + 1 });
                return (
                  <LiteRow
                    key={o.id}
                    icon={done ? CheckCircle2 : Circle}
                    iconTone={done ? "success" : grade === "fail" ? "destructive" : "muted"}
                    title={<span className={done ? "text-muted-foreground line-through" : undefined}>{label}</span>}
                    sub={grade === "pass" ? undefined : t("device.lite.training.tapToTick")}
                    right={
                      grade === "pass" ? (
                        <StatusBadge tone="success" dot>{t("device.lite.training.passed")}</StatusBadge>
                      ) : grade === "fail" ? (
                        <StatusBadge tone="danger" dot>{t("device.lite.training.tryAgain")}</StatusBadge>
                      ) : done ? (
                        <StatusBadge tone="neutral">{t("device.lite.training.done")}</StatusBadge>
                      ) : undefined
                    }
                    onClick={grade === "pass" ? undefined : () => toggleTick(o.id)}
                  />
                );
              })}
            </div>
          )}

          {reviewPending ? (
            <LiteRow icon={Clock} iconTone="warning" title={t("device.lite.training.waiting")} sub={t("device.lite.training.waitingSub")} />
          ) : (
            <>
              <LiteButton icon={Send} label={t("device.lite.training.askSignOff")} onClick={() => setConfirmOpen(true)} disabled={!allTicked} />
              {!allTicked && objectives.length > 0 && (
                <p className="text-center text-[13px] text-muted-foreground">
                  {fill(t("device.lite.training.tasksLeft"), { count: objectives.length - doneCount })}
                </p>
              )}
            </>
          )}
        </LiteSection>
      )}

      {completedDays.length > 0 && (
        <LiteSection title={t("device.lite.training.completed")}>
          <div className="space-y-2">
            {completedDays.map((d) => (
              <LiteRow
                key={d.id}
                icon={Check}
                iconTone="success"
                title={d.title}
                sub={fill(t("device.lite.training.dayShort"), { day: d.dayNumber })}
              />
            ))}
          </div>
        </LiteSection>
      )}

      {currentDay && (
        <DeviceDrawer
          open={confirmOpen}
          onOpenChange={(open) => { if (!busy) setConfirmOpen(open); }}
          title={fill(t("device.lite.training.confirmTitle"), { day: currentDay.dayNumber })}
          options={[
            { id: "send", icon: busy ? ListChecks : Send, label: busy ? t("device.lite.training.sending") : t("device.lite.training.confirmYes"), tone: "primary", onSelect: askSignOff },
          ]}
        />
      )}
    </LiteScreen>
  );
}
