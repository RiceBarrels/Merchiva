"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useOrgMembers,
  useTrainingDayGrades,
  useTrainingDays,
  useTrainingObjectiveGrades,
  useTrainingObjectives,
  useTrainingReviewRequests,
} from "@/lib/spacetimedb/hooks";
import { gradeTrainingDay, gradeTrainingObjective } from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";

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

interface LessonRow extends ObjectiveRow {
  lessonNumber: number;
  dayNumber: number;
  dayTitle: string;
}

interface GradeTarget {
  traineeId: string;
  lessonId: string;
}

interface ReviewRequestRow {
  id: string;
  traineeId: string;
  dayId: string;
  createdAtMs: number;
}

function avatarColor(name: string): string {
  const colors = [
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
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

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function timestampMs(value: any): number {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const date = new Date(value as string | number | Date);
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function TrainingTrainerView({ orgId }: { orgId: string }) {
  const t = useT();
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawObjGrades] = useTrainingObjectiveGrades() as [unknown[], boolean];
  const [rawDayGrades] = useTrainingDayGrades() as [unknown[], boolean];
  const [rawReviewRequests] = useTrainingReviewRequests() as [unknown[], boolean];

  const lessonTitle = useCallback(
    (lesson: LessonRow): string => {
      const raw = lesson.text.trim();
      const text = isHtmlContent(raw) ? plainTextFromHtml(raw) : raw;
      return text || t("training.trainer.lessonFallback").replace("{n}", String(lesson.lessonNumber));
    },
    [t],
  );

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

  const lessons = useMemo<LessonRow[]>(() => {
    const dayMap = new Map(days.map((d) => [d.id, d]));
    return (rawObjectives as any[])
      .filter((r) => r.organizationId === orgId && dayMap.has(r.dayId))
      .map((r) => {
        const day = dayMap.get(r.dayId)!;
        const mt = r.mediaType ?? null;
        return {
          id: r.id.toString(),
          dayId: r.dayId,
          text: r.text,
          mediaUrl: r.mediaUrl ?? null,
          mediaType: mt === "image" || mt === "video" ? mt : null,
          sortOrder: r.sortOrder,
          lessonNumber: 0,
          dayNumber: day.dayNumber,
          dayTitle: day.title,
        };
      })
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder)
      .map((lesson, index) => ({ ...lesson, lessonNumber: index + 1 }));
  }, [rawObjectives, orgId, days]);

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

  const gradeByTarget = useMemo(() => {
    const map = new Map<string, any>();
    for (const g of rawObjGrades as any[]) {
      if (g.organizationId !== orgId) continue;
      map.set(`${g.traineeId}:${g.objectiveId}`, g);
    }
    return map;
  }, [rawObjGrades, orgId]);

  const dayGradeByTarget = useMemo(() => {
    const map = new Map<string, any>();
    for (const g of rawDayGrades as any[]) {
      if (g.organizationId !== orgId) continue;
      map.set(`${g.traineeId}:${g.dayId}`, g);
    }
    return map;
  }, [rawDayGrades, orgId]);

  const reviewQueue = useMemo<ReviewRequestRow[]>(() => {
    const dayIds = new Set(days.map((d) => d.id));
    const traineeIds = new Set(trainees.map((m) => m.id));
    return (rawReviewRequests as any[])
      .filter(
        (r) =>
          r.organizationId === orgId &&
          r.status === "pending" &&
          dayIds.has(r.dayId) &&
          traineeIds.has(r.traineeId),
      )
      .map((r) => ({
        id: r.id.toString(),
        traineeId: r.traineeId,
        dayId: r.dayId,
        createdAtMs: timestampMs(r.createdAt),
      }))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }, [rawReviewRequests, orgId, days, trainees]);

  const pendingReviewByTarget = useMemo(() => {
    const set = new Set<string>();
    for (const r of reviewQueue) set.add(`${r.traineeId}:${r.dayId}`);
    return set;
  }, [reviewQueue]);

  const [target, setTarget] = useState<GradeTarget | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [verdict, setVerdict] = useState<"pass" | "fail" | null>(null);
  const [busy, setBusy] = useState(false);
  const [signOffBusyDayId, setSignOffBusyDayId] = useState<string | null>(null);

  const firstLessonOfDay = useCallback(
    (traineeId: string, dayId: string): string | null => {
      const dayLessons = lessons.filter((l) => l.dayId === dayId);
      const ungraded = dayLessons.find((l) => !gradeByTarget.has(`${traineeId}:${l.id}`));
      return (ungraded ?? dayLessons[0])?.id ?? null;
    },
    [lessons, gradeByTarget],
  );

  useEffect(() => {
    if (
      target &&
      trainees.some((m) => m.id === target.traineeId) &&
      lessons.some((l) => l.id === target.lessonId)
    )
      return;
    const req = reviewQueue[0];
    if (req) {
      const lessonId = firstLessonOfDay(req.traineeId, req.dayId);
      if (lessonId) {
        setTarget({ traineeId: req.traineeId, lessonId });
        return;
      }
    }
    setTarget(
      trainees[0] && lessons[0]
        ? { traineeId: trainees[0].id, lessonId: lessons[0].id }
        : null,
    );
  }, [target, trainees, lessons, reviewQueue, firstLessonOfDay]);

  useEffect(() => {
    if (selectedMemberId && trainees.some((m) => m.id === selectedMemberId)) return;
    setSelectedMemberId(target?.traineeId ?? trainees[0]?.id ?? null);
  }, [selectedMemberId, trainees, target]);

  const activeTrainee = trainees.find((m) => m.id === target?.traineeId) ?? null;
  const activeLesson = lessons.find((l) => l.id === target?.lessonId) ?? null;
  const selectedMember = trainees.find((m) => m.id === selectedMemberId) ?? null;
  const existingGrade = target
    ? gradeByTarget.get(`${target.traineeId}:${target.lessonId}`) ?? null
    : null;

  useEffect(() => {
    if (existingGrade) {
      setVerdict(existingGrade.status === "pass" ? "pass" : "fail");
      setNotes(existingGrade.comment ?? "");
    } else {
      setVerdict(null);
      setNotes("");
    }
  }, [existingGrade, target?.traineeId, target?.lessonId]);

  const filteredTrainees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trainees;
    return trainees.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [trainees, query]);

  const memberDayGroups = useMemo(() => {
    if (!selectedMember) return [];
    return days.map((day) => {
      const dayLessons = lessons
        .filter((l) => l.dayId === day.id)
        .map((lesson) => ({
          lesson,
          grade: gradeByTarget.get(`${selectedMember.id}:${lesson.id}`) ?? null,
        }));
      return {
        day,
        lessons: dayLessons,
        passedCount: dayLessons.filter((i) => i.grade?.status === "pass").length,
        dayGrade: dayGradeByTarget.get(`${selectedMember.id}:${day.id}`) ?? null,
        reviewPending: pendingReviewByTarget.has(`${selectedMember.id}:${day.id}`),
      };
    });
  }, [selectedMember, days, lessons, gradeByTarget, dayGradeByTarget, pendingReviewByTarget]);

  const gradedCount = memberDayGroups.reduce(
    (n, g) => n + g.lessons.filter((i) => i.grade).length,
    0,
  );

  const submit = useCallback(async () => {
    if (!target || !verdict) return;
    setBusy(true);
    try {
      await gradeTrainingObjective({
        traineeId: target.traineeId,
        objectiveId: target.lessonId,
        status: verdict,
        comment: notes.trim() || null,
      });
      toast.success(t("training.trainer.gradeSaved"));
      // Advance to this trainee's next ungraded lesson so the trainer can
      // keep grading without hunting through the list.
      const next = lessons.find(
        (l) =>
          l.id !== target.lessonId &&
          !gradeByTarget.has(`${target.traineeId}:${l.id}`),
      );
      if (next) setTarget({ traineeId: target.traineeId, lessonId: next.id });
    } catch (err) {
      console.error("[Training] submit lesson grade failed", err);
      toast.error(t("training.trainer.gradeFailed"));
    } finally {
      setBusy(false);
    }
  }, [target, verdict, notes, lessons, gradeByTarget, t]);

  const signOffDay = useCallback(
    async (dayId: string) => {
      if (!selectedMember || signOffBusyDayId) return;
      setSignOffBusyDayId(dayId);
      try {
        await gradeTrainingDay({ traineeId: selectedMember.id, dayId, rating: 5 });
        toast.success(
          t("training.trainer.daySignedOffToast").replace(
            "{name}",
            selectedMember.displayName,
          ),
        );
      } catch (err) {
        console.error("[Training] day sign-off failed", err);
        toast.error(t("training.trainer.daySignOffFailed"));
      } finally {
        setSignOffBusyDayId(null);
      }
    },
    [selectedMember, signOffBusyDayId, t],
  );

  const focusReviewRequest = (req: ReviewRequestRow) => {
    setSelectedMemberId(req.traineeId);
    const lessonId = firstLessonOfDay(req.traineeId, req.dayId);
    if (lessonId) setTarget({ traineeId: req.traineeId, lessonId });
  };

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] bg-background">
      <aside className="border-r border-border min-h-0 flex flex-col">
        <section className="border-b border-border">
          <div className="px-4 py-3 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold leading-tight">
                {t("training.trainer.reviewQueue")}
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-0.5">
                {t("training.trainer.reviewWaiting").replace(
                  "{count}",
                  String(reviewQueue.length),
                )}
              </div>
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto divide-y divide-border">
            {reviewQueue.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                {t("training.trainer.noPendingReviews")}
              </div>
            ) : (
              reviewQueue.map((req) => {
                const trainee = trainees.find((m) => m.id === req.traineeId);
                const day = days.find((d) => d.id === req.dayId);
                if (!trainee || !day) return null;
                const active =
                  target?.traineeId === req.traineeId &&
                  selectedMemberId === req.traineeId;
                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => focusReviewRequest(req)}
                    className={cn(
                      "w-full px-4 py-3 text-left border-l-2 hover:bg-muted/60 transition-colors",
                      active ? "bg-muted border-l-foreground" : "border-l-transparent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "w-7 h-7 rounded-full inline-flex items-center justify-center text-[10.5px] font-semibold",
                          avatarColor(trainee.displayName),
                        )}
                      >
                        {initials(trainee.displayName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium truncate">
                          {trainee.displayName}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground truncate">
                          {t("training.dayLabel").replace("{n}", String(day.dayNumber))} ·{" "}
                          {day.title}
                        </div>
                      </div>
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <div className="text-[13.5px] font-semibold">{t("training.trainer.allStaff")}</div>
              <div className="flex-1" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {trainees.length}
              </span>
            </div>
            <div className="relative">
              <Search
                className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.75}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("training.trainer.searchStaff")}
                className="h-8 w-full rounded-[0.3rem] border border-border bg-background pl-7 pr-2 text-[12px] outline-none focus:border-stone-400"
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-[170px_minmax(0,1fr)] divide-x divide-border">
            <div className="overflow-y-auto divide-y divide-border">
              {filteredTrainees.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMemberId(m.id)}
                  className={cn(
                    "w-full px-3 py-2.5 text-left flex items-center gap-2 border-l-2 hover:bg-muted/50",
                    selectedMemberId === m.id
                      ? "bg-muted border-l-foreground"
                      : "border-l-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px] font-semibold shrink-0",
                      avatarColor(m.displayName),
                    )}
                  >
                    {initials(m.displayName)}
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] font-medium truncate">
                    {m.displayName}
                  </span>
                </button>
              ))}
            </div>
            <div className="overflow-y-auto">
              {!selectedMember ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  {t("training.trainer.pickPerson")}
                </div>
              ) : (
                <>
                  <div className="px-3 py-2 bg-muted/40 text-[11px] text-muted-foreground border-b border-border">
                    {t("training.trainer.lessonsGraded")
                      .replace("{done}", String(gradedCount))
                      .replace("{total}", String(lessons.length))}
                  </div>
                  {memberDayGroups.map(({ day, lessons: dayLessons, passedCount, dayGrade, reviewPending }) => (
                    <div key={day.id} className="border-b border-border">
                      <div className="px-3 py-2 bg-muted/25 flex items-center gap-2">
                        <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground shrink-0">
                          {t("training.dayLabel").replace("{n}", String(day.dayNumber))}
                        </span>
                        <span className="min-w-0 flex-1 text-[11.5px] font-medium truncate">
                          {day.title}
                        </span>
                        {reviewPending && (
                          <span className="shrink-0 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            {t("training.trainer.reviewRequested")}
                          </span>
                        )}
                        {dayGrade ? (
                          <span className="shrink-0 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-[11px] w-[11px]" strokeWidth={2} />
                            {t("training.trainer.signedOff")}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void signOffDay(day.id)}
                            disabled={signOffBusyDayId !== null}
                            title={t("training.trainer.signOffDay")}
                            className="shrink-0 h-6 px-1.5 rounded-[0.3rem] border border-border bg-background text-[10px] font-medium text-stone-700 dark:text-stone-200 hover:bg-muted inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            {signOffBusyDayId === day.id ? (
                              <Spinner size={11} />
                            ) : (
                              <ShieldCheck className="h-[11px] w-[11px]" strokeWidth={1.75} />
                            )}
                            {t("training.trainer.signOffDay")}
                            <span className="font-mono text-muted-foreground">
                              {passedCount}/{dayLessons.length}
                            </span>
                          </button>
                        )}
                      </div>
                      {dayLessons.map(({ lesson, grade }) => {
                        const active =
                          target?.traineeId === selectedMember.id &&
                          target.lessonId === lesson.id;
                        return (
                          <button
                            key={lesson.id}
                            type="button"
                            onClick={() =>
                              setTarget({ traineeId: selectedMember.id, lessonId: lesson.id })
                            }
                            className={cn(
                              "w-full px-3 py-2 text-left border-l-2 hover:bg-muted/50",
                              active ? "bg-muted border-l-foreground" : "border-l-transparent",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-muted-foreground">
                                L{String(lesson.lessonNumber).padStart(2, "0")}
                              </span>
                              <span className="min-w-0 flex-1 text-[12px] font-medium truncate">
                                {lessonTitle(lesson)}
                              </span>
                              {grade ? (
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold",
                                    grade.status === "pass"
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-amber-700 dark:text-amber-400",
                                  )}
                                >
                                  {grade.status === "pass"
                                    ? t("training.pass")
                                    : t("training.trainer.retry")}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  {t("training.trainer.ungraded")}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
      </aside>

      <main className="min-w-0 min-h-0 flex flex-col">
        <div className="border-b border-border px-4 lg:px-6 py-3 flex items-center gap-3 flex-wrap">
          {activeLesson && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground bg-muted border border-border rounded-[0.3rem] px-1.5 py-0.5">
              L{String(activeLesson.lessonNumber).padStart(2, "0")}
            </span>
          )}
          <div className="flex-1 min-w-[200px]">
            <div className="text-[15px] font-semibold tracking-[-0.01em] truncate">
              {activeLesson ? lessonTitle(activeLesson) : t("training.trainer.pickLesson")}
            </div>
            <div className="text-[11.5px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-[11px] w-[11px]" strokeWidth={1.75} />
                {activeLesson
                  ? `${t("training.dayLabel").replace("{n}", String(activeLesson.dayNumber))} · ${activeLesson.dayTitle}`
                  : t("training.trainer.noLessonSelected")}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-[11px] w-[11px]" strokeWidth={1.75} />
                {t("training.trainer.gradeByLesson")}
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[0.3rem] font-mono text-[10px] uppercase tracking-wider bg-muted border border-border text-muted-foreground">
            <Award className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.trainer.badge")}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-10 py-6">
          <div className="max-w-[760px] mx-auto space-y-5">
            {activeLesson ? (
              <>
                <article className="rounded-[0.3rem] border border-border bg-background p-5 merchiva-quill-prose">
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("training.trainer.lessonContent")}
                  </div>
                  {isHtmlContent(activeLesson.text) ? (
                    <div dangerouslySetInnerHTML={{ __html: activeLesson.text }} />
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{activeLesson.text}</p>
                  )}
                  {activeLesson.mediaUrl && activeLesson.mediaType === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeLesson.mediaUrl}
                      alt=""
                      className="mt-4 max-h-[320px] rounded-[0.3rem] border border-border object-contain"
                    />
                  )}
                  {activeLesson.mediaUrl && activeLesson.mediaType === "video" && (
                    <video
                      src={activeLesson.mediaUrl}
                      controls
                      className="mt-4 max-h-[320px] w-full rounded-[0.3rem] border border-border"
                    />
                  )}
                </article>

                <section className="rounded-[0.3rem] border border-border bg-background overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2.5 bg-muted/30 border-b border-border">
                    {activeTrainee && (
                      <span
                        className={cn(
                          "w-8 h-8 rounded-full inline-flex items-center justify-center text-[11px] font-semibold shrink-0",
                          avatarColor(activeTrainee.displayName),
                        )}
                      >
                        {initials(activeTrainee.displayName)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold leading-tight truncate">
                        {activeTrainee?.displayName ?? t("training.trainer.noTraineeSelected")}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t("training.trainer.giveGrade")}
                      </div>
                    </div>
                    <Link
                      href="/~/chat"
                      className="h-7 px-2 rounded-[0.3rem] border border-border bg-background text-[11px] hover:bg-muted inline-flex items-center gap-1"
                      title={t("training.trainer.message")}
                    >
                      <MessageSquare className="h-[11px] w-[11px]" strokeWidth={1.75} />{" "}
                      {t("training.trainer.dm")}
                    </Link>
                  </div>

                  <div className="px-4 py-3">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                      {t("training.trainer.lessonResult")}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVerdict("pass")}
                        disabled={busy}
                        className={cn(
                          "flex-1 h-9 rounded-[0.3rem] border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
                          verdict === "pass"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-background text-stone-700 dark:text-stone-200 border-stone-300 dark:border-stone-700 hover:border-emerald-400 hover:text-emerald-700",
                        )}
                      >
                        <CheckCircle2 className="h-[14px] w-[14px]" strokeWidth={1.75} />{" "}
                        {t("training.pass")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVerdict("fail")}
                        disabled={busy}
                        className={cn(
                          "flex-1 h-9 rounded-[0.3rem] border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
                          verdict === "fail"
                            ? "bg-amber-500 text-white border-amber-500"
                            : "bg-background text-stone-700 dark:text-stone-200 border-stone-300 dark:border-stone-700 hover:border-amber-400 hover:text-amber-700",
                        )}
                      >
                        <RotateCcw className="h-[14px] w-[14px]" strokeWidth={1.75} />{" "}
                        {t("training.trainer.retry")}
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-border">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t("training.trainer.notesForTrainee")}
                      </span>
                      <div className="flex-1" />
                      {activeTrainee && (
                        <span className="text-[10.5px] text-muted-foreground">
                          {t("training.trainer.visibleTo").replace(
                            "{name}",
                            activeTrainee.displayName.split(" ")[0],
                          )}
                        </span>
                      )}
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

                  <div className="px-4 py-3 border-t border-border bg-muted/20">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!target || !verdict || busy}
                      className="w-full h-9 rounded-[0.3rem] bg-foreground text-background text-[12.5px] font-medium hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                    >
                      {busy ? (
                        <Spinner size={14} />
                      ) : (
                        <>
                          {t("training.trainer.submitGrade")}
                          <ArrowRight className="h-[13px] w-[13px]" strokeWidth={1.75} />
                        </>
                      )}
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-[0.3rem] border border-border bg-muted/30 px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                {t("training.trainer.addLessonsFirst")}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
