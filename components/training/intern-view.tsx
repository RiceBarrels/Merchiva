"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  FileText,
  Flame,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import {
  useTrainingDayGrades,
  useTrainingDays,
  useTrainingObjectiveGrades,
  useTrainingObjectives,
  useTrainingReviewRequests,
} from "@/lib/spacetimedb/hooks";
import { requestTrainingReview } from "@/lib/spacetimedb/actions";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SegmentedControl } from "@/components/ui/segmented-control";
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

function isHtmlContent(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

export function TrainingInternView({ orgId, userId }: { orgId: string; userId: string | null }) {
  const t = useT();
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];
  const [rawDayGrades] = useTrainingDayGrades() as [unknown[], boolean];
  const [rawObjGrades] = useTrainingObjectiveGrades() as [unknown[], boolean];
  const [rawReviewRequests] = useTrainingReviewRequests() as [unknown[], boolean];

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

  // A day counts as completed for this trainee when either the trainer signed
  // it off (day grade rating >= 3) or every lesson in the day was passed.
  const completedDayIds = useMemo<Set<string>>(() => {
    if (!userId) return new Set();
    const set = new Set<string>();
    for (const g of rawDayGrades as any[]) {
      if (g.organizationId !== orgId) continue;
      if (g.traineeId !== userId) continue;
      if ((g.rating ?? 0) >= 3) set.add(g.dayId);
    }
    const passedObjectives = new Set<string>();
    for (const g of rawObjGrades as any[]) {
      if (g.organizationId !== orgId) continue;
      if (g.traineeId !== userId) continue;
      if (g.status === "pass") passedObjectives.add(g.objectiveId);
    }
    for (const [dayId, objs] of objectivesByDay) {
      if (objs.length > 0 && objs.every((o) => passedObjectives.has(o.id))) {
        set.add(dayId);
      }
    }
    return set;
  }, [rawDayGrades, rawObjGrades, objectivesByDay, orgId, userId]);

  const pendingReviewDayIds = useMemo<Set<string>>(() => {
    if (!userId) return new Set();
    const set = new Set<string>();
    for (const r of rawReviewRequests as any[]) {
      if (r.organizationId !== orgId) continue;
      if (r.traineeId !== userId) continue;
      if (r.status === "pending") set.add(r.dayId);
    }
    return set;
  }, [rawReviewRequests, orgId, userId]);

  const currentDay = useMemo<DayRow | null>(() => {
    if (days.length === 0) return null;
    // First non-completed day; if all completed, last day.
    const next = days.find((d) => !completedDayIds.has(d.id));
    return next ?? days[days.length - 1] ?? null;
  }, [days, completedDayIds]);

  const [pickedId, setPickedId] = useState<string | null>(null);
  // Active day = user pick, falling back to current/first available day.
  const activeId =
    pickedId && days.some((d) => d.id === pickedId)
      ? pickedId
      : (currentDay?.id ?? days[0]?.id ?? null);
  const setActiveId = (id: string) => setPickedId(id);

  const activeDay = days.find((d) => d.id === activeId) ?? null;
  const activeObjectives = activeDay ? objectivesByDay.get(activeDay.id) ?? [] : [];

  // Local task checklist (persisted per user + day in localStorage), keyed by
  // dayId so switching days doesn't require an effect to re-seed local state.
  const taskKey = `bz_training_tasks_${orgId}_${userId ?? "anon"}`;
  const [allTaskState, setAllTaskState] = useState<Record<string, Record<string, boolean>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(taskKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const taskState = activeDay ? (allTaskState[activeDay.id] ?? {}) : {};
  const toggleTask = (objId: string) => {
    if (!activeDay) return;
    setAllTaskState((prev) => {
      const next = {
        ...prev,
        [activeDay.id]: {
          ...(prev[activeDay.id] ?? {}),
          [objId]: !(prev[activeDay.id]?.[objId] ?? false),
        },
      };
      try {
        window.localStorage.setItem(taskKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const tasks = activeObjectives.map((o, i) => ({
    id: o.id,
    label: o.text || t("training.intern.objectiveFallback").replace("{number}", String(i + 1)),
    done: !!taskState[o.id],
  }));
  const doneCount = tasks.filter((t) => t.done).length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  const reviewRequested = activeDay ? pendingReviewDayIds.has(activeDay.id) : false;
  const [reviewBusy, setReviewBusy] = useState(false);
  const requestReview = async () => {
    if (!activeDay || reviewBusy) return;
    setReviewBusy(true);
    try {
      await requestTrainingReview(activeDay.id);
    } catch (err) {
      console.error("[Training] request review failed", err);
      toast.error(t("training.intern.reviewRequestFailed"));
    } finally {
      setReviewBusy(false);
    }
  };

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

  const internDayNumber = currentDay?.dayNumber ?? days[0]?.dayNumber ?? 1;
  const completedCount = days.filter((d) => completedDayIds.has(d.id)).length;
  const total = days.length || 1;
  const pct = Math.round((completedCount / total) * 100);

  const isLocked = activeDay ? activeDay.dayNumber > internDayNumber : false;

  const desc = activeDay?.description ?? "";

  const prevDay = activeDay
    ? days.find((d) => d.dayNumber === activeDay.dayNumber - 1) ?? null
    : null;
  const nextDay = activeDay
    ? days.find((d) => d.dayNumber === activeDay.dayNumber + 1) ?? null
    : null;
  const nextLocked = nextDay ? nextDay.dayNumber > internDayNumber : false;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Progress strip */}
      <div className="border-b border-border bg-background">
        <div className="px-4 lg:px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Eyebrow as="span" size="xs" className="font-mono">
              {t("training.intern.progress")}
            </Eyebrow>
            <span className="text-[13px] font-semibold">
              {t("training.intern.dayOfTotal")
                .replace("{day}", String(internDayNumber))
                .replace("{total}", String(total))}
            </span>
          </div>
          <div className="flex-1 min-w-[200px] max-w-[420px]">
            <div className="flex items-center gap-0.5">
              {days.map((d) => {
                const done = completedDayIds.has(d.id);
                const isNow = d.dayNumber === internDayNumber;
                return (
                  <div
                    key={d.id}
                    className={cn(
                      "flex-1 h-1.5 rounded-sm",
                      done
                        ? "bg-foreground"
                        : isNow
                          ? "bg-amber-600 dark:bg-amber-500"
                          : "bg-border",
                    )}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10.5px] text-muted-foreground font-mono">
              <span>{t("training.intern.doneCount").replace("{count}", String(completedCount))}</span>
              <span className="text-foreground font-semibold">{pct}%</span>
              <span>{t("training.intern.remainingCount").replace("{count}", String(total - completedCount))}</span>
            </div>
          </div>
          <div className="flex-1" />
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded font-mono text-[10.5px] bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300">
            <Flame className="h-3 w-3" strokeWidth={1.75} />
            <span className="uppercase tracking-wider">{t("training.intern.keepGoing")}</span>
          </div>
        </div>
      </div>

      {/* Mobile day picker */}
      <div className="lg:hidden border-b border-border bg-background px-3 py-2 flex gap-1.5 overflow-x-auto">
        <SegmentedControl
          variant="chips"
          size="md"
          className="flex-nowrap"
          value={activeId ?? ""}
          onChange={(id) => setActiveId(id)}
          options={days.map((d) => {
            const done = completedDayIds.has(d.id);
            const locked = d.dayNumber > internDayNumber;
            return {
              value: d.id,
              label: (
                <>
                  <span className="font-mono tabular-nums">
                    {t("training.dayRail.dayAbbrev")} {String(d.dayNumber).padStart(2, "0")}
                  </span>
                  {done && <Check className="h-3 w-3 text-emerald-500" strokeWidth={2.5} />}
                  {locked && <Lock className="h-[10px] w-[10px] opacity-60" strokeWidth={1.75} />}
                </>
              ),
            };
          })}
        />
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-[260px] shrink-0 border-r border-border bg-background hidden lg:flex flex-col">
          <DayRail
            days={dayRailItems}
            activeId={activeId}
            onSelect={setActiveId}
            role="intern"
            internDayNumber={internDayNumber}
          />
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-background">
          <div className="max-w-[680px] mx-auto px-6 lg:px-8 py-8">
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground mb-5 flex-wrap">
              <span className="font-mono uppercase tracking-wider text-muted-foreground/80">
                {t("training.intern.dayLabel").replace("{number}", String(activeDay?.dayNumber ?? "—"))}
              </span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.intern.practice")}
              </span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <ShieldCheck className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.intern.required")}
              </span>
              {isLocked && (
                <>
                  <span className="text-border">·</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Lock className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.intern.lockedUntilPrior")}
                  </span>
                </>
              )}
            </div>

            {isLocked ? (
              <div className="rounded-lg border border-border bg-muted/30 px-6 py-14 text-center">
                <Lock className="h-6 w-6 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
                <div className="text-[14px] font-semibold">{activeDay?.title ?? "—"}</div>
                <div className="text-[12.5px] text-muted-foreground mt-1.5">
                  {t("training.intern.lockedContent")}
                </div>
              </div>
            ) : (
              <>
                <div className="merchiva-quill-prose">
                  <h1>{activeDay?.title ?? "—"}</h1>
                  {desc.trim() ? (
                    isHtmlContent(desc) ? (
                      <div dangerouslySetInnerHTML={{ __html: desc }} />
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{desc}</p>
                    )
                  ) : (
                    <p className="italic text-muted-foreground">
                      {t("training.intern.noContentYet")}
                    </p>
                  )}
                </div>

                {/* Inline media from objectives */}
                {activeObjectives.map((o) => {
                  if (o.mediaType === "video" && o.mediaUrl) {
                    return (
                      <div
                        key={o.id}
                        className="rounded-lg overflow-hidden border border-border bg-foreground my-4"
                      >
                        <video
                          src={o.mediaUrl}
                          controls
                          className="w-full aspect-video object-contain bg-foreground"
                        />
                        {o.text && (
                          <div className="px-3 py-2 text-[11.5px] text-background/80 border-t border-background/20">
                            {o.text}
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (o.mediaType === "image" && o.mediaUrl) {
                    return (
                      <div
                        key={o.id}
                        className="my-4 rounded-[0.5rem] border border-border overflow-hidden"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={o.mediaUrl}
                          alt={o.text || ""}
                          className="block w-full max-h-[420px] object-cover"
                        />
                        {o.text && (
                          <div className="px-3 py-2 text-[11.5px] text-muted-foreground italic border-t border-border">
                            {o.text}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </>
            )}

            {/* Pace controls */}
            <div className="mt-8 mb-2 flex items-center gap-3 pt-5 border-t border-border">
              <Button
                variant="outline"
                size="lg"
                disabled={!prevDay}
                onClick={() => prevDay && setActiveId(prevDay.id)}
                className="px-3 text-[12.5px]"
              >
                <ArrowLeft className="h-[13px] w-[13px]" strokeWidth={1.75} />{" "}
                {prevDay
                  ? t("training.intern.dayWithTitle")
                      .replace("{number}", String(prevDay.dayNumber))
                      .replace("{title}", prevDay.title)
                  : t("common.previous")}
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="lg"
                disabled={!nextDay || nextLocked}
                onClick={() => nextDay && !nextLocked && setActiveId(nextDay.id)}
                className="px-3 text-[12.5px]"
              >
                {nextDay
                  ? t("training.intern.dayWithTitle")
                      .replace("{number}", String(nextDay.dayNumber))
                      .replace("{title}", nextDay.title)
                  : t("common.next")}
                {nextLocked ? (
                  <Lock className="h-[12px] w-[12px]" strokeWidth={1.75} />
                ) : (
                  <ArrowRight className="h-[12px] w-[12px]" strokeWidth={1.75} />
                )}
              </Button>
            </div>

            {/* Mobile practice + review (right rail is hidden below xl) */}
            <div className="xl:hidden mt-6">
              <PracticePanel
                t={t}
                tasks={tasks}
                doneCount={doneCount}
                allDone={allDone}
                locked={isLocked}
                toggleTask={toggleTask}
                activeObjectives={activeObjectives}
                reviewRequested={reviewRequested}
                reviewBusy={reviewBusy}
                requestReview={requestReview}
              />
            </div>
          </div>
        </main>

        {/* Right rail */}
        <aside className="w-[340px] shrink-0 border-l border-border bg-muted/30 hidden xl:flex flex-col min-h-0 overflow-y-auto">
          <PracticePanel
            t={t}
            tasks={tasks}
            doneCount={doneCount}
            allDone={allDone}
            locked={isLocked}
            toggleTask={toggleTask}
            activeObjectives={activeObjectives}
            reviewRequested={reviewRequested}
            reviewBusy={reviewBusy}
            requestReview={requestReview}
          />
        </aside>
      </div>
    </div>
  );
}

function PracticePanel({
  t,
  tasks,
  doneCount,
  allDone,
  locked,
  toggleTask,
  activeObjectives,
  reviewRequested,
  reviewBusy,
  requestReview,
}: {
  t: (key: string) => string;
  tasks: { id: string; label: string; done: boolean }[];
  doneCount: number;
  allDone: boolean;
  locked: boolean;
  toggleTask: (id: string) => void;
  activeObjectives: ObjectiveRow[];
  reviewRequested: boolean;
  reviewBusy: boolean;
  requestReview: () => void;
}) {
  return (
    <div className="rounded-lg border border-border xl:rounded-none xl:border-0 overflow-hidden">
      {/* Practice checklist */}
      <div className="bg-background border-b border-border">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-baseline gap-2">
            <Eyebrow as="span" size="xs" className="font-mono">
              {t("training.intern.practice")}
            </Eyebrow>
            <span className="ml-auto font-mono text-[11px] tabular-nums">
              <span className="text-foreground font-semibold">{doneCount}</span>
              <span className="text-muted-foreground">/{tasks.length}</span>
            </span>
          </div>
          <div className="text-[13.5px] font-semibold leading-tight mt-1">{t("training.intern.tasksForToday")}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {t("training.intern.checkEachOff")}
          </div>
        </div>
        <div className="px-4 pb-3">
          {tasks.length === 0 && (
            <div className="text-[12px] italic text-muted-foreground py-2">
              {t("training.intern.noTasksYet")}
            </div>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-2.5 py-2 border-t border-border first:border-t-0"
            >
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                disabled={locked}
                className={cn(
                  "shrink-0 w-5 h-5 rounded border inline-flex items-center justify-center transition-colors disabled:opacity-50",
                  task.done
                    ? "bg-foreground border-foreground text-background"
                    : "bg-background border-border hover:border-foreground",
                )}
                aria-pressed={task.done}
              >
                {task.done && <Check className="h-3 w-3" strokeWidth={2.5} />}
              </button>
              <div
                className={cn(
                  "text-[12.5px] leading-snug flex-1 pt-0.5",
                  task.done ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {isHtmlContent(task.label) ? (
                  <span
                    className="merchiva-quill-prose"
                    dangerouslySetInnerHTML={{ __html: task.label }}
                  />
                ) : (
                  task.label
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resources */}
      {activeObjectives.length > 0 && (
        <div className="bg-background border-b border-border">
          <div className="px-4 pt-3 pb-2">
            <Eyebrow as="span" size="xs" className="font-mono">
              {t("training.intern.resources")}
            </Eyebrow>
          </div>
          <div className="px-4 pb-3 flex flex-col gap-1.5">
            {activeObjectives.map((a) => {
              const Icon =
                a.mediaType === "video"
                  ? PlayCircle
                  : a.mediaType === "image"
                    ? ImageIcon
                    : FileText;
              return (
                <a
                  key={a.id}
                  href={a.mediaUrl ?? "#"}
                  target={a.mediaUrl ? "_blank" : undefined}
                  rel="noreferrer"
                  className="w-full h-9 px-2.5 rounded-lg border border-border bg-background hover:bg-muted inline-flex items-center gap-2 text-left"
                >
                  <Icon
                    className="h-[13px] w-[13px] text-muted-foreground shrink-0"
                    strokeWidth={1.75}
                  />
                  <span className="text-[12px] truncate flex-1">
                    {a.text || a.mediaType}
                  </span>
                  <span className="font-mono text-[9.5px] text-muted-foreground tabular-nums shrink-0">
                    {a.mediaType ?? t("training.intern.note")}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Request review */}
      <div className="bg-background p-4">
        {!reviewRequested ? (
          <>
            <Button
              size="lg"
              onClick={requestReview}
              disabled={!allDone || locked || reviewBusy}
              className="w-full h-10 text-[13px] gap-2"
            >
              {reviewBusy ? (
                <Spinner size={14} />
              ) : (
                <>
                  {t("training.intern.requestTrainerReview")}
                  <ArrowRight className="h-[13px] w-[13px]" strokeWidth={1.75} />
                </>
              )}
            </Button>
            <div className="mt-1.5 text-[10.5px] text-muted-foreground text-center">
              {allDone
                ? t("training.intern.trainerWillBeNotified")
                : tasks.length === 0
                  ? t("training.intern.waitForTasks")
                  : (tasks.length - doneCount === 1
                      ? t("training.intern.completeMoreTask")
                      : t("training.intern.completeMoreTasks")
                    ).replace("{count}", String(tasks.length - doneCount))}
            </div>
          </>
        ) : (
          <div className="rounded-lg border p-3 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                {t("training.intern.awaitingReview")}
              </span>
            </div>
            <div className="text-[12.5px] mt-1.5 text-foreground">
              {t("training.intern.liveGradingNote")}
            </div>
          </div>
        )}

        <Link
          href="/manager/channel"
          className="w-full h-9 mt-2 rounded-lg border border-border bg-background text-[12.5px] text-muted-foreground hover:bg-muted inline-flex items-center justify-center gap-1.5"
        >
          <MessageSquare className="h-3 w-3" strokeWidth={1.75} /> {t("training.intern.askTrainerQuestion")}
        </Link>
      </div>
    </div>
  );
}
