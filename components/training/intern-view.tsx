"use client";

import { useMemo, useState } from "react";
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
  useTrainingObjectives,
} from "@/lib/spacetimedb/hooks";
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

const ACC_SOFT = "#faf5ec";
const ACC_BD = "#ecd9b8";
const ACC = "oklch(0.55 0.09 55)";

export function TrainingInternView({ orgId, userId }: { orgId: string; userId: string | null }) {
  const t = useT();
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];
  const [rawDayGrades] = useTrainingDayGrades() as [unknown[], boolean];

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

  // For the current user, find their highest-completed day from day-grades; current = next day.
  const completedDayIds = useMemo<Set<string>>(() => {
    if (!userId) return new Set();
    const set = new Set<string>();
    for (const g of rawDayGrades as any[]) {
      if (g.organizationId !== orgId) continue;
      if (g.traineeId !== userId) continue;
      if ((g.rating ?? 0) >= 3) set.add(g.dayId);
    }
    return set;
  }, [rawDayGrades, orgId, userId]);

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

  // Local task checklist (persisted per day in localStorage), keyed by dayId so
  // switching days doesn't require an effect to re-seed local state.
  const taskKey = `bz_training_tasks_${orgId}`;
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

  // Review-requested is per-day — keep it in a map so switching days doesn't need an effect to reset.
  const [reviewByDay, setReviewByDay] = useState<Record<string, boolean>>({});
  const reviewRequested = activeDay ? !!reviewByDay[activeDay.id] : false;
  const requestReview = () => {
    if (!activeDay) return;
    setReviewByDay((prev) => ({ ...prev, [activeDay.id]: true }));
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
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("training.intern.progress")}
            </span>
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
                    className="flex-1 h-1.5 rounded-sm"
                    style={{
                      background: done
                        ? "#1c1917"
                        : isNow
                          ? ACC
                          : "var(--border)",
                    }}
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
          <div
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.3rem] font-mono text-[10.5px]"
            style={{ background: ACC_SOFT, border: `1px solid ${ACC_BD}`, color: ACC }}
          >
            <Flame className="h-3 w-3" strokeWidth={1.75} />
            <span className="uppercase tracking-wider">{t("training.intern.keepGoing")}</span>
          </div>
        </div>
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
              <span className="text-stone-300 dark:text-stone-700">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.intern.practice")}
              </span>
              <span className="text-stone-300 dark:text-stone-700">·</span>
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <ShieldCheck className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.intern.required")}
              </span>
              {isLocked && (
                <>
                  <span className="text-stone-300 dark:text-stone-700">·</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Lock className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.intern.lockedUntilPrior")}
                  </span>
                </>
              )}
            </div>

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
                    className="rounded-[0.5rem] overflow-hidden border border-border bg-stone-900 my-4"
                  >
                    <video
                      src={o.mediaUrl}
                      controls
                      className="w-full aspect-video object-contain bg-stone-900"
                    />
                    {o.text && (
                      <div className="px-3 py-2 text-[11.5px] text-stone-300 border-t border-stone-800">
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

            {/* Pace controls */}
            <div className="mt-8 mb-2 flex items-center gap-3 pt-5 border-t border-border">
              <button
                type="button"
                disabled={!prevDay}
                onClick={() => prevDay && setActiveId(prevDay.id)}
                className="h-9 px-3 rounded-[0.3rem] border border-border bg-background text-[12.5px] font-medium text-stone-700 dark:text-stone-200 hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="h-[13px] w-[13px]" strokeWidth={1.75} />{" "}
                {prevDay
                  ? t("training.intern.dayWithTitle")
                      .replace("{number}", String(prevDay.dayNumber))
                      .replace("{title}", prevDay.title)
                  : t("common.previous")}
              </button>
              <div className="flex-1" />
              <button
                type="button"
                disabled={!nextDay || nextLocked}
                onClick={() => nextDay && !nextLocked && setActiveId(nextDay.id)}
                className="h-9 px-3 rounded-[0.3rem] border border-border bg-background text-[12.5px] font-medium text-stone-700 dark:text-stone-200 inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-muted"
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
              </button>
            </div>
          </div>
        </main>

        {/* Right rail */}
        <aside className="w-[340px] shrink-0 border-l border-border bg-muted/30 hidden xl:flex flex-col min-h-0 overflow-y-auto">
          {/* Practice checklist */}
          <div className="bg-background border-b border-border">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("training.intern.practice")}
                </span>
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
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-2.5 py-2 border-t border-border first:border-t-0"
                >
                  <button
                    type="button"
                    onClick={() => toggleTask(t.id)}
                    className={cn(
                      "shrink-0 w-5 h-5 rounded-[0.3rem] border inline-flex items-center justify-center transition-colors",
                      t.done
                        ? "bg-foreground border-foreground text-background"
                        : "bg-background border-border hover:border-stone-500",
                    )}
                    aria-pressed={t.done}
                  >
                    {t.done && <Check className="h-3 w-3" strokeWidth={2.5} />}
                  </button>
                  <div
                    className={cn(
                      "text-[12.5px] leading-snug flex-1 pt-0.5",
                      t.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {isHtmlContent(t.label) ? (
                      <span
                        className="merchiva-quill-prose"
                        dangerouslySetInnerHTML={{ __html: t.label }}
                      />
                    ) : (
                      t.label
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
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("training.intern.resources")}
                </span>
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
                      className="w-full h-9 px-2.5 rounded-[0.3rem] border border-border bg-background hover:bg-muted inline-flex items-center gap-2 text-left"
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
                <button
                  type="button"
                  onClick={requestReview}
                  disabled={!allDone}
                  className="w-full h-10 rounded-[0.3rem] bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {t("training.intern.requestTrainerReview")}
                  <ArrowRight className="h-[13px] w-[13px]" strokeWidth={1.75} />
                </button>
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
              <div
                className="rounded-[0.3rem] border p-3"
                style={{ background: ACC_SOFT, borderColor: ACC_BD }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: ACC }}
                  />
                  <span
                    className="font-mono text-[10.5px] uppercase tracking-wider"
                    style={{ color: ACC }}
                  >
                    {t("training.intern.awaitingReview")}
                  </span>
                </div>
                <div className="text-[12.5px] mt-1.5 text-stone-700 dark:text-stone-300">
                  {t("training.intern.liveGradingNote")}
                </div>
              </div>
            )}

            <button
              type="button"
              className="w-full h-9 mt-2 rounded-[0.3rem] border border-border bg-background text-[12.5px] text-muted-foreground hover:bg-muted inline-flex items-center justify-center gap-1.5"
            >
              <MessageSquare className="h-3 w-3" strokeWidth={1.75} /> {t("training.intern.askTrainerQuestion")}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
