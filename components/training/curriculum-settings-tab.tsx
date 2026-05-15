"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, Pencil, Loader2, ImageIcon, Video, X, ChevronDown, Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { useUploadThing } from "@/lib/uploadthing";
import { useTrainingDays, useTrainingObjectives } from "@/lib/spacetimedb/hooks";
import {
  addTrainingDay, updateTrainingDay, deleteTrainingDay,
  addTrainingObjective, updateTrainingObjective, deleteTrainingObjective,
} from "@/lib/spacetimedb/actions";
import { cn } from "@/lib/utils";
import { QuillEditor } from "./quill-editor";

function isRichText(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

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
  organizationId: string;
  dayId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  sortOrder: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDay(r: any): DayRow {
  return {
    id: r.id.toString(),
    organizationId: r.organizationId,
    dayNumber: r.dayNumber,
    title: r.title,
    description: r.description ?? null,
    sortOrder: r.sortOrder,
  };
}

function mapObjective(r: any): ObjectiveRow {
  const mt = r.mediaType ?? null;
  return {
    id: r.id.toString(),
    organizationId: r.organizationId,
    dayId: r.dayId,
    text: r.text,
    mediaUrl: r.mediaUrl ?? null,
    mediaType: mt === "image" || mt === "video" ? mt : null,
    sortOrder: r.sortOrder,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function CurriculumSettingsTab({ orgId }: { orgId: string }) {
  const t = useT();
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];

  const days = useMemo<DayRow[]>(
    () =>
      (rawDays as { organizationId: string }[])
        .filter((r) => r.organizationId === orgId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => mapDay(r))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.dayNumber - b.dayNumber),
    [rawDays, orgId],
  );

  const objectivesByDay = useMemo<Map<string, ObjectiveRow[]>>(() => {
    const map = new Map<string, ObjectiveRow[]>();
    for (const r of rawObjectives as { organizationId: string }[]) {
      if (r.organizationId !== orgId) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = mapObjective(r as any);
      const list = map.get(obj.dayId) ?? [];
      list.push(obj);
      map.set(obj.dayId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [rawObjectives, orgId]);

  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddDay = useCallback(
    async (title: string, description: string) => {
      if (!title.trim()) return;
      setBusy(true);
      try {
        await addTrainingDay({
          dayNumber: days.length + 1,
          title: title.trim(),
          description: description.trim() || null,
          sortOrder: days.length,
        });
        setAddingDay(false);
      } finally {
        setBusy(false);
      }
    },
    [days.length],
  );

  const handleUpdateDay = useCallback(
    async (day: DayRow, title: string, description: string) => {
      if (!title.trim()) return;
      setBusy(true);
      try {
        await updateTrainingDay(day.id, {
          dayNumber: day.dayNumber,
          title: title.trim(),
          description: description.trim() || null,
          sortOrder: day.sortOrder,
        });
        setEditingDayId(null);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleDeleteDay = useCallback(
    async (day: DayRow) => {
      if (!confirm(t("training.confirmDeleteDay"))) return;
      setBusy(true);
      try {
        await deleteTrainingDay(day.id);
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  return (
    <div className="space-y-3">
      {days.length === 0 && !addingDay && (
        <div className="rounded-[0.3rem] border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-[13px] text-muted-foreground">
          {t("training.noCurriculum")}
        </div>
      )}

      {days.map((day) => {
        const objectives = objectivesByDay.get(day.id) ?? [];
        const isExpanded = expandedDayIds.has(day.id);
        const isEditing = editingDayId === day.id;

        return (
          <Card key={day.id}>
            <CardHeader>
              {isEditing ? (
                <DayEditForm
                  initialTitle={day.title}
                  initialDescription={day.description ?? ""}
                  busy={busy}
                  onCancel={() => setEditingDayId(null)}
                  onSubmit={(title, description) => handleUpdateDay(day, title, description)}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => toggleExpanded(day.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {t("training.dayLabel").replace("{n}", String(day.dayNumber))}
                      </Badge>
                      <CardTitle className="text-sm">{day.title}</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">
                        {objectives.length}
                      </Badge>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform ml-auto",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </div>
                    {day.description && (
                      isRichText(day.description) ? (
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
                  </button>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingDayId(day.id)}
                      disabled={busy}
                      aria-label={t("training.editDay")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteDay(day)}
                      disabled={busy}
                      aria-label={t("training.deleteDay")}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              )}
            </CardHeader>

            {isExpanded && !isEditing && (
              <CardContent className="pt-0 space-y-2">
                {objectives.map((obj) => (
                  <ObjectiveRowEditor key={obj.id} objective={obj} />
                ))}
                <NewObjectiveRow
                  dayId={day.id}
                  nextSortOrder={objectives.length}
                />
              </CardContent>
            )}
          </Card>
        );
      })}

      {addingDay ? (
        <Card>
          <CardHeader>
            <DayEditForm
              initialTitle=""
              initialDescription=""
              busy={busy}
              onCancel={() => setAddingDay(false)}
              onSubmit={(title, description) => handleAddDay(title, description)}
            />
          </CardHeader>
        </Card>
      ) : (
        <Button
          variant="outline"
          onClick={() => setAddingDay(true)}
          disabled={busy}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("training.addDay")}
        </Button>
      )}
    </div>
  );
}

function DayEditForm({
  initialTitle,
  initialDescription,
  busy,
  onCancel,
  onSubmit,
}: {
  initialTitle: string;
  initialDescription: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (title: string, description: string) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);

  return (
    <div className="space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("training.dayTitle")}
        disabled={busy}
        autoFocus
      />
      <QuillEditor
        value={description}
        onChange={setDescription}
        placeholder={t("training.dayDescription")}
        disabled={busy}
        minHeight={180}
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {t("common.cancel") || "Cancel"}
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit(title, description)}
          disabled={busy || !title.trim()}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          {t("common.save") || "Save"}
        </Button>
      </div>
    </div>
  );
}

function ObjectiveRowEditor({ objective }: { objective: ObjectiveRow }) {
  const t = useT();
  const [text, setText] = useState(objective.text);
  const [mediaUrl, setMediaUrl] = useState<string | null>(objective.mediaUrl);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(objective.mediaType);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing("generalFile", {
    onClientUploadComplete: (res) => {
      const file = res?.[0];
      if (!file) return;
      const type = inferMediaType(file.name);
      setMediaUrl(file.ufsUrl);
      setMediaType(type);
      void persist(text, file.ufsUrl, type);
    },
    onUploadError: () => {},
  });

  const persist = useCallback(
    async (
      newText: string,
      newMediaUrl: string | null,
      newMediaType: "image" | "video" | null,
    ) => {
      setBusy(true);
      try {
        await updateTrainingObjective(objective.id, {
          text: newText,
          mediaUrl: newMediaUrl,
          mediaType: newMediaType,
          sortOrder: objective.sortOrder,
        });
      } finally {
        setBusy(false);
      }
    },
    [objective.id, objective.sortOrder],
  );

  const handleBlur = useCallback(() => {
    if (text.trim() && text !== objective.text) {
      void persist(text.trim(), mediaUrl, mediaType);
    }
  }, [text, objective.text, mediaUrl, mediaType, persist]);

  const handleRemoveMedia = useCallback(() => {
    setMediaUrl(null);
    setMediaType(null);
    void persist(text, null, null);
  }, [text, persist]);

  const handleDelete = useCallback(async () => {
    setBusy(true);
    try {
      await deleteTrainingObjective(objective.id);
    } finally {
      setBusy(false);
    }
  }, [objective.id]);

  const handleFile = useCallback(
    async (file: File) => {
      const type = inferMediaType(file.name, file.type);
      if (!type) return;
      const maxSize = type === "video" ? 64 * 1024 * 1024 : 8 * 1024 * 1024;
      if (file.size > maxSize) return;
      await startUpload([file]);
    },
    [startUpload],
  );

  return (
    <div className="rounded-[0.3rem] border border-border bg-background p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          placeholder={t("training.objectivePlaceholder")}
          rows={1}
          disabled={busy}
          className="text-[13px] resize-none flex-1"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={busy}
          aria-label={t("training.deleteObjective")}
        >
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </Button>
      </div>

      {mediaUrl && mediaType === "image" && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt=""
            className="max-h-40 rounded-[0.3rem] border border-border object-cover"
          />
          <button
            type="button"
            onClick={handleRemoveMedia}
            className="absolute top-1 right-1 rounded-full bg-background/80 p-1 hover:bg-background"
            aria-label={t("training.removeMedia")}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {mediaUrl && mediaType === "video" && (
        <div className="relative">
          <video
            src={mediaUrl}
            controls
            className="max-h-60 w-full rounded-[0.3rem] border border-border"
          />
          <button
            type="button"
            onClick={handleRemoveMedia}
            className="absolute top-1 right-1 rounded-full bg-background/80 p-1 hover:bg-background"
            aria-label={t("training.removeMedia")}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {!mediaUrl && (
        <>
          <button
            type="button"
            disabled={isUploading || busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-[0.3rem] border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("training.uploadingMedia")}
              </>
            ) : (
              <>
                <Upload className="h-3 w-3" />
                {t("training.uploadMedia")}
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

function NewObjectiveRow({
  dayId,
  nextSortOrder,
}: {
  dayId: string;
  nextSortOrder: number;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addTrainingObjective({
        dayId,
        text: text.trim(),
        mediaUrl: null,
        mediaType: null,
        sortOrder: nextSortOrder,
      });
      setText("");
    } finally {
      setBusy(false);
    }
  }, [text, dayId, nextSortOrder]);

  return (
    <div className="flex items-start gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleAdd();
          }
        }}
        placeholder={t("training.addObjective")}
        disabled={busy}
        className="text-[13px]"
      />
      <Button size="sm" variant="ghost" onClick={handleAdd} disabled={busy || !text.trim()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function inferMediaType(filename: string, mime?: string): "image" | "video" | null {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  return null;
}

// silence unused-import warnings for icons referenced only in JSX above
void ImageIcon;
void Video;
