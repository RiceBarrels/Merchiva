"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useOrgMembers,
  useTrainingDays,
  useTrainingObjectiveGrades,
  useTrainingObjectives,
} from "@/lib/spacetimedb/hooks";
import { gradeTrainingObjective } from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";

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

function lessonTitle(lesson: LessonRow): string {
  const raw = lesson.text.trim();
  const text = isHtmlContent(raw) ? plainTextFromHtml(raw) : raw;
  return text || `Lesson ${lesson.lessonNumber}`;
}

export function TrainingTrainerView({ orgId }: { orgId: string }) {
  const t = useT();
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
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

  const pendingTargets = useMemo<GradeTarget[]>(() => {
    const out: GradeTarget[] = [];
    for (const trainee of trainees) {
      for (const lesson of lessons) {
        if (!gradeByTarget.has(`${trainee.id}:${lesson.id}`)) {
          out.push({ traineeId: trainee.id, lessonId: lesson.id });
        }
      }
    }
    return out;
  }, [trainees, lessons, gradeByTarget]);

  const [target, setTarget] = useState<GradeTarget | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [verdict, setVerdict] = useState<"pass" | "fail" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target && trainees.some((m) => m.id === target.traineeId) && lessons.some((l) => l.id === target.lessonId)) return;
    const first = pendingTargets[0];
    setTarget(first ?? (trainees[0] && lessons[0] ? { traineeId: trainees[0].id, lessonId: lessons[0].id } : null));
  }, [target, trainees, lessons, pendingTargets]);

  useEffect(() => {
    if (selectedMemberId && trainees.some((m) => m.id === selectedMemberId)) return;
    setSelectedMemberId(target?.traineeId ?? trainees[0]?.id ?? null);
  }, [selectedMemberId, trainees, target]);

  const activeTrainee = trainees.find((m) => m.id === target?.traineeId) ?? null;
  const activeLesson = lessons.find((l) => l.id === target?.lessonId) ?? null;
  const selectedMember = trainees.find((m) => m.id === selectedMemberId) ?? null;
  const existingGrade = target ? gradeByTarget.get(`${target.traineeId}:${target.lessonId}`) ?? null : null;

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

  const selectedMemberLessons = useMemo(() => {
    if (!selectedMember) return [];
    return lessons.map((lesson) => ({
      lesson,
      grade: gradeByTarget.get(`${selectedMember.id}:${lesson.id}`) ?? null,
    }));
  }, [selectedMember, lessons, gradeByTarget]);

  const completedCount = selectedMemberLessons.filter((item) => item.grade).length;

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
    } catch (err) {
      console.error("[Training] submit lesson grade failed", err);
    } finally {
      setBusy(false);
    }
  }, [target, verdict, notes]);

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] bg-background">
      <aside className="border-r border-border min-h-0 flex flex-col">
        <section className="border-b border-border">
          <div className="px-4 py-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-700" strokeWidth={1.75} />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold leading-tight">待改分</div>
              <div className="text-[10.5px] text-muted-foreground mt-0.5">
                <span className="font-mono">{pendingTargets.length}</span> lesson grades waiting
              </div>
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto divide-y divide-border">
            {pendingTargets.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                No pending lesson grades.
              </div>
            ) : (
              pendingTargets.map((item) => {
                const trainee = trainees.find((m) => m.id === item.traineeId);
                const lesson = lessons.find((l) => l.id === item.lessonId);
                if (!trainee || !lesson) return null;
                const active = target?.traineeId === item.traineeId && target.lessonId === item.lessonId;
                return (
                  <button
                    key={`${item.traineeId}:${item.lessonId}`}
                    type="button"
                    onClick={() => {
                      setTarget(item);
                      setSelectedMemberId(item.traineeId);
                    }}
                    className={cn(
                      "w-full px-4 py-3 text-left border-l-2 hover:bg-muted/60 transition-colors",
                      active ? "bg-muted border-l-foreground" : "border-l-transparent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("w-7 h-7 rounded-full inline-flex items-center justify-center text-[10.5px] font-semibold", avatarColor(trainee.displayName))}>
                        {initials(trainee.displayName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium truncate">{trainee.displayName}</div>
                        <div className="text-[10.5px] text-muted-foreground truncate">
                          L{String(lesson.lessonNumber).padStart(2, "0")} · {lessonTitle(lesson)}
                        </div>
                      </div>
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
              <div className="text-[13.5px] font-semibold">全部人员列表</div>
              <div className="flex-1" />
              <span className="font-mono text-[10px] text-muted-foreground">{trainees.length}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search staff"
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
                    selectedMemberId === m.id ? "bg-muted border-l-foreground" : "border-l-transparent",
                  )}
                >
                  <span className={cn("w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px] font-semibold shrink-0", avatarColor(m.displayName))}>
                    {initials(m.displayName)}
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] font-medium truncate">{m.displayName}</span>
                </button>
              ))}
            </div>
            <div className="overflow-y-auto divide-y divide-border">
              {!selectedMember ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">Pick a person to grade lessons.</div>
              ) : (
                <>
                  <div className="px-3 py-2 bg-muted/40 text-[11px] text-muted-foreground">
                    <span className="font-mono">{completedCount}/{lessons.length}</span> lessons graded
                  </div>
                  {selectedMemberLessons.map(({ lesson, grade }) => {
                    const active = target?.traineeId === selectedMember.id && target.lessonId === lesson.id;
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => setTarget({ traineeId: selectedMember.id, lessonId: lesson.id })}
                        className={cn(
                          "w-full px-3 py-2.5 text-left border-l-2 hover:bg-muted/50",
                          active ? "bg-muted border-l-foreground" : "border-l-transparent",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">L{String(lesson.lessonNumber).padStart(2, "0")}</span>
                          <span className="min-w-0 flex-1 text-[12px] font-medium truncate">{lessonTitle(lesson)}</span>
                          {grade ? (
                            <span className={cn("text-[10px] font-semibold", grade.status === "pass" ? "text-emerald-700" : "text-amber-700")}>
                              {grade.status === "pass" ? t("training.pass") : t("training.trainer.retry")}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">待改</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-muted-foreground truncate">Day {lesson.dayNumber} · {lesson.dayTitle}</div>
                      </button>
                    );
                  })}
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
              {activeLesson ? lessonTitle(activeLesson) : "Pick a lesson"}
            </div>
            <div className="text-[11.5px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-[11px] w-[11px]" strokeWidth={1.75} />
                {activeLesson ? `Day ${activeLesson.dayNumber} · ${activeLesson.dayTitle}` : "No lesson selected"}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-[11px] w-[11px]" strokeWidth={1.75} />
                Grade by lesson
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
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Lesson content</div>
                  {isHtmlContent(activeLesson.text) ? (
                    <div dangerouslySetInnerHTML={{ __html: activeLesson.text }} />
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{activeLesson.text}</p>
                  )}
                  {activeLesson.mediaUrl && activeLesson.mediaType === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activeLesson.mediaUrl} alt="" className="mt-4 max-h-[320px] rounded-[0.3rem] border border-border object-contain" />
                  )}
                  {activeLesson.mediaUrl && activeLesson.mediaType === "video" && (
                    <video src={activeLesson.mediaUrl} controls className="mt-4 max-h-[320px] w-full rounded-[0.3rem] border border-border" />
                  )}
                </article>

                <section className="rounded-[0.3rem] border border-border bg-background overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2.5 bg-muted/30 border-b border-border">
                    {activeTrainee && (
                      <span className={cn("w-8 h-8 rounded-full inline-flex items-center justify-center text-[11px] font-semibold shrink-0", avatarColor(activeTrainee.displayName))}>
                        {initials(activeTrainee.displayName)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold leading-tight truncate">{activeTrainee?.displayName ?? "No trainee selected"}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">Give a grade for this lesson.</div>
                    </div>
                    <button type="button" className="h-7 px-2 rounded-[0.3rem] border border-border bg-background text-[11px] hover:bg-muted inline-flex items-center gap-1" title={t("training.trainer.message")}>
                      <MessageSquare className="h-[11px] w-[11px]" strokeWidth={1.75} /> {t("training.trainer.dm")}
                    </button>
                  </div>

                  <div className="px-4 py-3">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Lesson result</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVerdict("pass")}
                        disabled={busy}
                        className={cn(
                          "flex-1 h-9 rounded-[0.3rem] border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
                          verdict === "pass"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-background text-stone-700 dark:text-stone-200 border-stone-300 hover:border-emerald-400 hover:text-emerald-700",
                        )}
                      >
                        <CheckCircle2 className="h-[14px] w-[14px]" strokeWidth={1.75} /> {t("training.pass")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVerdict("fail")}
                        disabled={busy}
                        className={cn(
                          "flex-1 h-9 rounded-[0.3rem] border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
                          verdict === "fail"
                            ? "bg-amber-500 text-white border-amber-500"
                            : "bg-background text-stone-700 dark:text-stone-200 border-stone-300 hover:border-amber-400 hover:text-amber-700",
                        )}
                      >
                        <RotateCcw className="h-[14px] w-[14px]" strokeWidth={1.75} /> {t("training.trainer.retry")}
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-border">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t("training.trainer.notesForTrainee")}</span>
                      <div className="flex-1" />
                      {activeTrainee && (
                        <span className="text-[10.5px] text-muted-foreground">{t("training.trainer.visibleTo").replace("{name}", activeTrainee.displayName.split(" ")[0])}</span>
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
                      {t("training.trainer.submitGrade")}
                      <ArrowRight className="h-[13px] w-[13px]" strokeWidth={1.75} />
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-[0.3rem] border border-border bg-muted/30 px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                Add lessons to the training curriculum before grading.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
