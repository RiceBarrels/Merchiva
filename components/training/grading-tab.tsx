"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Check, X, Star, Loader2, ChevronDown, Image as ImageIcon, Video as VideoIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/context";
import {
  useOrgMembers,
  useTrainingDays,
  useTrainingObjectives,
  useTrainingObjectiveGrades,
  useTrainingDayGrades,
  useTrainingFinalGrades,
} from "@/lib/spacetimedb/hooks";
import {
  gradeTrainingObjective, clearTrainingObjectiveGrade,
  gradeTrainingDay, setTrainingFinalGrade,
} from "@/lib/spacetimedb/actions";
import { cn } from "@/lib/utils";

interface MemberRow { id: string; displayName: string; role: string; status: string }
interface DayRow {
  id: string;
  organizationId: string;
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
interface ObjectiveGradeRow {
  id: string;
  traineeId: string;
  objectiveId: string;
  status: "pass" | "fail";
  comment: string | null;
}
interface DayGradeRow {
  id: string;
  traineeId: string;
  dayId: string;
  rating: number;
  comment: string | null;
}
interface FinalGradeRow {
  id: string;
  traineeId: string;
  score: number;
  comment: string | null;
}

export function GradingTab({ orgId }: { orgId: string }) {
  const t = useT();
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];
  const [rawObjGrades] = useTrainingObjectiveGrades() as [unknown[], boolean];
  const [rawDayGrades] = useTrainingDayGrades() as [unknown[], boolean];
  const [rawFinalGrades] = useTrainingFinalGrades() as [unknown[], boolean];

  const members = useMemo<MemberRow[]>(
    () =>
      (rawMembers as { id: { toString(): string }; organizationId: string; displayName: string; role: string; status: string }[])
        .filter((m) => m.organizationId === orgId && m.status === "active")
        .map((m) => ({
          id: m.id.toString(),
          displayName: m.displayName || "—",
          role: m.role,
          status: m.status,
        })),
    [rawMembers, orgId],
  );

  const days = useMemo<DayRow[]>(
    () =>
      (rawDays as { id: { toString(): string }; organizationId: string; dayNumber: number; title: string; description?: string | null; sortOrder: number }[])
        .filter((r) => r.organizationId === orgId)
        .map((r) => ({
          id: r.id.toString(),
          organizationId: r.organizationId,
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
    for (const r of rawObjectives as { id: { toString(): string }; organizationId: string; dayId: string; text: string; mediaUrl?: string | null; mediaType?: string | null; sortOrder: number }[]) {
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

  const [traineeId, setTraineeId] = useState<string | null>(null);

  const objGradeMap = useMemo<Map<string, ObjectiveGradeRow>>(() => {
    const map = new Map<string, ObjectiveGradeRow>();
    if (!traineeId) return map;
    for (const g of rawObjGrades as { id: { toString(): string }; organizationId: string; traineeId: string; objectiveId: string; status: string; comment?: string | null }[]) {
      if (g.organizationId !== orgId || g.traineeId !== traineeId) continue;
      map.set(g.objectiveId, {
        id: g.id.toString(),
        traineeId: g.traineeId,
        objectiveId: g.objectiveId,
        status: g.status === "pass" ? "pass" : "fail",
        comment: g.comment ?? null,
      });
    }
    return map;
  }, [rawObjGrades, orgId, traineeId]);

  const dayGradeMap = useMemo<Map<string, DayGradeRow>>(() => {
    const map = new Map<string, DayGradeRow>();
    if (!traineeId) return map;
    for (const g of rawDayGrades as { id: { toString(): string }; organizationId: string; traineeId: string; dayId: string; rating: number; comment?: string | null }[]) {
      if (g.organizationId !== orgId || g.traineeId !== traineeId) continue;
      map.set(g.dayId, {
        id: g.id.toString(),
        traineeId: g.traineeId,
        dayId: g.dayId,
        rating: g.rating,
        comment: g.comment ?? null,
      });
    }
    return map;
  }, [rawDayGrades, orgId, traineeId]);

  const finalGrade = useMemo<FinalGradeRow | null>(() => {
    const rows = rawFinalGrades as { id: { toString(): string }; organizationId: string; traineeId: string; score: number; comment?: string | null }[];
    const match = traineeId
      ? rows.find((g) => g.organizationId === orgId && g.traineeId === traineeId)
      : undefined;
    if (!match) return null;
    return {
      id: match.id.toString(),
      traineeId: match.traineeId,
      score: match.score,
      comment: match.comment ?? null,
    };
  }, [rawFinalGrades, orgId, traineeId]);

  if (members.length === 0) {
    return (
      <div className="rounded-[0.3rem] border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-[13px] text-muted-foreground">
        {t("training.noTrainees")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {t("training.selectTrainee")}
        </label>
        <Select value={traineeId ?? ""} onValueChange={(v) => setTraineeId(v || null)}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder={t("training.selectTrainee")} />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.displayName} <span className="text-muted-foreground text-[10px]">· {m.role}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!traineeId ? (
        <div className="rounded-[0.3rem] border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-[13px] text-muted-foreground">
          {t("training.selectTrainee")}
        </div>
      ) : (
        <>
          {days.map((day) => (
            <DayGradingCard
              key={day.id}
              day={day}
              objectives={objectivesByDay.get(day.id) ?? []}
              traineeId={traineeId}
              objGrades={objGradeMap}
              dayGrade={dayGradeMap.get(day.id) ?? null}
            />
          ))}

          {days.length > 0 && (
            <FinalGradeCard traineeId={traineeId} current={finalGrade} />
          )}
        </>
      )}
    </div>
  );
}

function DayGradingCard({
  day,
  objectives,
  traineeId,
  objGrades,
  dayGrade,
}: {
  day: DayRow;
  objectives: ObjectiveRow[];
  traineeId: string;
  objGrades: Map<string, ObjectiveGradeRow>;
  dayGrade: DayGradeRow | null;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const [rating, setRating] = useState<number>(dayGrade?.rating ?? 0);
  const [comment, setComment] = useState<string>(dayGrade?.comment ?? "");
  const [busy, setBusy] = useState(false);

  const passed = objectives.filter((o) => objGrades.get(o.id)?.status === "pass").length;
  const failed = objectives.filter((o) => objGrades.get(o.id)?.status === "fail").length;
  const ungraded = objectives.length - passed - failed;

  const handleSaveDay = useCallback(async () => {
    if (rating < 1) return;
    setBusy(true);
    try {
      await gradeTrainingDay({
        traineeId,
        dayId: day.id,
        rating,
        comment: comment.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }, [traineeId, day.id, rating, comment]);

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {t("training.dayLabel").replace("{n}", String(day.dayNumber))}
          </Badge>
          <CardTitle className="text-sm">{day.title}</CardTitle>
          <div className="ml-auto flex items-center gap-2">
            {passed > 0 && (
              <Badge className="text-[10px] bg-emerald-600">
                {passed} {t("training.pass")}
              </Badge>
            )}
            {failed > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {failed} {t("training.fail")}
              </Badge>
            )}
            {ungraded > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {ungraded}
              </Badge>
            )}
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          </div>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          {objectives.map((obj) => (
            <ObjectiveGradingRow
              key={obj.id}
              objective={obj}
              traineeId={traineeId}
              grade={objGrades.get(obj.id) ?? null}
            />
          ))}

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mr-1">
                {t("training.dayRating")}
              </span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  disabled={busy}
                  aria-label={`${n}`}
                >
                  <Star
                    className={cn(
                      "h-5 w-5 transition-colors",
                      n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                    )}
                  />
                </button>
              ))}
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("training.dayRatingComment")}
              rows={2}
              disabled={busy}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveDay} disabled={busy || rating < 1}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {t("training.saveGrade")}
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ObjectiveGradingRow({
  objective,
  traineeId,
  grade,
}: {
  objective: ObjectiveRow;
  traineeId: string;
  grade: ObjectiveGradeRow | null;
}) {
  const t = useT();
  const [comment, setComment] = useState<string>(grade?.comment ?? "");
  const [showComment, setShowComment] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleGrade = useCallback(
    async (status: "pass" | "fail") => {
      setBusy(true);
      try {
        if (grade?.status === status && !comment.trim()) {
          // Toggle off
          await clearTrainingObjectiveGrade({ traineeId, objectiveId: objective.id });
        } else {
          await gradeTrainingObjective({
            traineeId,
            objectiveId: objective.id,
            status,
            comment: comment.trim() || null,
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [traineeId, objective.id, grade?.status, comment],
  );

  return (
    <div className="rounded-[0.3rem] border border-border p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-snug">{objective.text}</p>
          {objective.mediaUrl && objective.mediaType === "image" && (
            <div className="mt-2 flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={objective.mediaUrl}
                alt=""
                className="max-h-32 rounded-[0.3rem] border border-border object-cover"
              />
            </div>
          )}
          {objective.mediaUrl && objective.mediaType === "video" && (
            <div className="mt-2">
              <video
                src={objective.mediaUrl}
                controls
                className="max-h-48 w-full rounded-[0.3rem] border border-border"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant={grade?.status === "pass" ? "default" : "outline"}
            onClick={() => handleGrade("pass")}
            disabled={busy}
            className={cn(grade?.status === "pass" && "bg-emerald-600 hover:bg-emerald-700")}
            aria-label={t("training.pass")}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={grade?.status === "fail" ? "destructive" : "outline"}
            onClick={() => handleGrade("fail")}
            disabled={busy}
            aria-label={t("training.fail")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <button
        type="button"
        className="text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => setShowComment((v) => !v)}
      >
        {grade?.comment ? grade.comment : t("training.objectiveComment")}
      </button>
      {showComment && (
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => {
            if (comment !== (grade?.comment ?? "") && grade?.status) {
              void gradeTrainingObjective({
                traineeId,
                objectiveId: objective.id,
                status: grade.status,
                comment: comment.trim() || null,
              });
            }
          }}
          placeholder={t("training.objectiveComment")}
          className="text-[12px]"
        />
      )}
    </div>
  );
}

function FinalGradeCard({
  traineeId,
  current,
}: {
  traineeId: string;
  current: FinalGradeRow | null;
}) {
  const t = useT();
  const [score, setScore] = useState<string>(current?.score != null ? String(current.score) : "");
  const [comment, setComment] = useState<string>(current?.comment ?? "");
  const [busy, setBusy] = useState(false);

  const handleSave = useCallback(async () => {
    const n = Number(score);
    if (!Number.isFinite(n)) return;
    setBusy(true);
    try {
      await setTrainingFinalGrade({
        traineeId,
        score: n,
        comment: comment.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }, [traineeId, score, comment]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("training.finalScore")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="0-100"
            className="w-24 text-center tabular-nums"
          />
          <span className="text-[12px] text-muted-foreground">/ 100</span>
        </div>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("training.finalScoreComment")}
          rows={2}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={busy || !score}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {t("training.saveGrade")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// silence unused-import warnings for icons not yet referenced
void ImageIcon;
void VideoIcon;
