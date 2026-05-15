"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { useTrainingDays, useTrainingObjectives } from "@/lib/spacetimedb/hooks";

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

export function CurriculumView({ orgId }: { orgId: string }) {
  const t = useT();
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];

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

  if (days.length === 0) {
    return (
      <div className="rounded-[0.3rem] border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-[13px] text-muted-foreground">
        {t("training.noCurriculum")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {days.map((day) => {
        const objectives = objectivesByDay.get(day.id) ?? [];
        return (
          <Card key={day.id}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {t("training.dayLabel").replace("{n}", String(day.dayNumber))}
                </Badge>
                <CardTitle className="text-sm">{day.title}</CardTitle>
              </div>
              {day.description && (
                /<\/?[a-z][\s\S]*>/i.test(day.description) ? (
                  <div
                    className="merchiva-rich-text mt-1 text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: day.description }}
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                    {day.description}
                  </p>
                )
              )}
            </CardHeader>
            <CardContent className="space-y-2.5">
              {objectives.map((obj) => (
                <div key={obj.id} className="rounded-[0.3rem] border border-border p-2.5">
                  <p className="text-[13px] leading-snug">{obj.text}</p>
                  {obj.mediaUrl && obj.mediaType === "image" && (
                    <div className="mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={obj.mediaUrl}
                        alt=""
                        className="max-h-48 rounded-[0.3rem] border border-border object-cover"
                      />
                    </div>
                  )}
                  {obj.mediaUrl && obj.mediaType === "video" && (
                    <div className="mt-2">
                      <video
                        src={obj.mediaUrl}
                        controls
                        className="max-h-64 w-full rounded-[0.3rem] border border-border"
                      />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
