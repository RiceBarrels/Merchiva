"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Clock, Eye, FileText, History, Link2, Pencil, Play, Settings2, ShieldCheck, Upload, UploadCloud, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrainingDays, useTrainingObjectives } from "@/lib/spacetimedb/hooks";
import {
  addTrainingDay,
  addTrainingObjective,
  deleteTrainingObjective,
  updateTrainingDay,
} from "@/lib/spacetimedb/actions";
import { useUploadThing } from "@/lib/uploadthing";
import { useT } from "@/lib/i18n/context";
import { QuillEditor } from "./quill-editor";
import { DayRail, type DayRailItem } from "./day-rail";
import { Spinner } from "@/components/ui/loaders/geometric";

/* eslint-disable @typescript-eslint/no-explicit-any */

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

function isHtmlContent(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

function plainTextFromHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? tmp.innerText ?? "";
}

export function TrainingManagerView({ orgId }: { orgId: string }) {
  const t = useT();
  const [rawDays] = useTrainingDays() as [unknown[], boolean];
  const [rawObjectives] = useTrainingObjectives() as [unknown[], boolean];

  const days = useMemo<DayRow[]>(
    () =>
      (rawDays as any[])
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

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [showPreview, setShowPreview] = useState(false);

  // Track last loaded id so we don't overwrite local edits when subscription re-emits
  const loadedRef = useRef<string | null>(null);

  // Default-select first day; keep selection on day list change
  useEffect(() => {
    if (activeId && days.some((d) => d.id === activeId)) return;
    setActiveId(days[0]?.id ?? null);
  }, [days, activeId]);

  // Load selected day into draft state when active id changes (or first load)
  useEffect(() => {
    const day = days.find((d) => d.id === activeId);
    if (!day) {
      setDraftTitle("");
      setDraftDesc("");
      setDirty(false);
      loadedRef.current = null;
      return;
    }
    if (loadedRef.current === day.id) return;
    loadedRef.current = day.id;
    setDraftTitle(day.title);
    setDraftDesc(day.description ?? "");
    setDirty(false);
  }, [activeId, days]);

  const activeDay = days.find((d) => d.id === activeId) ?? null;
  const activeObjectives = activeDay ? objectivesByDay.get(activeDay.id) ?? [] : [];

  const dayRailItems = useMemo<DayRailItem[]>(
    () =>
      days.map((d) => ({
        id: d.id,
        dayNumber: d.dayNumber,
        title: d.title,
        mins: null,
        type: "practice" as const,
      })),
    [days],
  );

  const wordCount = useMemo(() => {
    const text = isHtmlContent(draftDesc) ? plainTextFromHtml(draftDesc) : draftDesc;
    return text.split(/\s+/).filter(Boolean).length;
  }, [draftDesc]);

  const readingMin = Math.max(1, Math.ceil(wordCount / 200));

  const handleSave = useCallback(async () => {
    if (!activeDay) return;
    if (!draftTitle.trim()) return;
    setBusy(true);
    try {
      await updateTrainingDay(activeDay.id, {
        dayNumber: activeDay.dayNumber,
        title: draftTitle.trim(),
        description: draftDesc.trim() ? draftDesc : null,
        sortOrder: activeDay.sortOrder,
      });
      setDirty(false);
    } catch (err) {
      console.error("[Training] save day failed", err);
    } finally {
      setBusy(false);
    }
  }, [activeDay, draftTitle, draftDesc]);

  const handleAddDay = useCallback(async () => {
    setBusy(true);
    try {
      await addTrainingDay({
        dayNumber: days.length + 1,
        title: t("training.dayLabel").replace("{n}", String(days.length + 1)),
        description: null,
        sortOrder: days.length,
      });
    } catch (err) {
      console.error("[Training] add day failed", err);
    } finally {
      setBusy(false);
    }
  }, [days.length]);

  const onTitleChange = (v: string) => {
    setDraftTitle(v);
    setDirty(true);
  };
  const onDescChange = (v: string) => {
    setDraftDesc(v);
    setDirty(true);
  };

  // UploadThing wiring for inline images inserted from the Quill toolbar.
  // `useUploadThing` is intentionally separate from the AttachmentUploadButton's
  // instance below — they share the same preset but track upload state
  // independently so an inline image upload doesn't show the attachment-rail
  // spinner (and vice versa).
  const { startUpload: startInlineUpload } = useUploadThing("generalFile", {
    onUploadError: (err) => {
      console.error("[Training] inline image upload failed", err);
    },
  });
  const handleUploadInlineImage = useCallback(
    async (file: File): Promise<string | null> => {
      const max = 8 * 1024 * 1024;
      if (!file.type.startsWith("image/")) return null;
      if (file.size > max) return null;
      const res = await startInlineUpload([file]);
      const first = res?.[0];
      return first?.ufsUrl ?? null;
    },
    [startInlineUpload],
  );

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Left rail */}
      <aside className="w-[260px] shrink-0 border-r border-border bg-background hidden lg:flex flex-col">
        <DayRail
          days={dayRailItems}
          activeId={activeId}
          onSelect={setActiveId}
          role="manager"
          onAddDay={handleAddDay}
          title={t("training.curriculumDays")}
          subtitle={
            days.length === 1
              ? t("training.manager.dayCount").replace("{count}", String(days.length))
              : t("training.manager.dayCountPlural").replace("{count}", String(days.length))
          }
        />
        <div className="border-t border-border px-3 py-2.5 flex items-center gap-2">
          <Settings2 className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-[11.5px] text-muted-foreground">{t("training.manager.curriculumSettings")}</span>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Module bar */}
        <div className="border-b border-border bg-background">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("training.manager.moduleLabel")}
              </span>
              {activeDay && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-foreground bg-muted border border-border rounded-[0.3rem] px-1.5 py-0.5">
                  D{String(activeDay.dayNumber).padStart(2, "0")}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-[200px]">
              {activeDay ? (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      value={draftTitle}
                      onChange={(e) => onTitleChange(e.target.value)}
                      placeholder={t("training.manager.untitledDay")}
                      className="text-[18px] font-semibold tracking-[-0.01em] bg-transparent border-0 outline-none w-full max-w-[400px] focus:bg-muted rounded-[0.3rem] px-1 -mx-1"
                    />
                    <Pencil className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
                  </div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-[11px] w-[11px]" strokeWidth={1.75} />
                      {t("training.dayLabel").replace("{n}", String(activeDay.dayNumber))}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-[11px] w-[11px]" strokeWidth={1.75} />
                      {t("training.manager.allRoles")}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-[11px] w-[11px]" strokeWidth={1.75} />
                      {t("training.manager.required")}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-[14px] text-muted-foreground">
                  {t("training.manager.selectOrAddDay")}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {dirty && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[0.3rem] bg-amber-50 border border-amber-200 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {t("training.manager.unsaved")}
                </span>
              )}
              <button
                type="button"
                className="h-8 px-3 rounded-[0.3rem] border border-border bg-background text-[12.5px] font-medium text-stone-700 dark:text-stone-200 hover:bg-muted inline-flex items-center gap-1.5"
                title={t("training.manager.history")}
              >
                <History className="h-[13px] w-[13px]" strokeWidth={1.75} />
                <span className="hidden md:inline">{t("training.manager.history")}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className={cn(
                  "h-8 px-3 rounded-[0.3rem] border border-border text-[12.5px] font-medium inline-flex items-center gap-1.5",
                  showPreview
                    ? "bg-muted text-foreground"
                    : "bg-background text-stone-700 dark:text-stone-200 hover:bg-muted",
                )}
              >
                <Eye className="h-[13px] w-[13px]" strokeWidth={1.75} />
                <span className="hidden md:inline">{t("training.manager.previewAsIntern")}</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!activeDay || !dirty || busy}
                className="h-8 px-3.5 rounded-[0.3rem] bg-foreground text-background text-[12.5px] font-medium hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {busy ? (
                  <Spinner size={16} />
                ) : (
                  <>
                    <span>{t("training.manager.publish")}</span>
                    <ArrowUpRight className="h-[13px] w-[13px]" strokeWidth={1.75} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Editor + Preview */}
        <div
          className={cn(
            "flex-1 min-h-0 grid",
            showPreview
              ? "grid-cols-1 lg:grid-cols-2"
              : "grid-cols-1",
          )}
        >
          {/* Editor column */}
          <div className="flex flex-col border-r border-border bg-background min-h-0">
            <div className="px-4 h-9 border-b border-border flex items-center gap-2 shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("training.manager.editor")}
              </span>
              <span className="text-stone-300 dark:text-stone-700">·</span>
              <span className="text-[11px] text-muted-foreground">
                <span className="font-mono">{wordCount}</span> {t("training.manager.words")} · ~
                <span className="font-mono">{readingMin}</span> {t("training.manager.minRead")}
              </span>
              <div className="flex-1" />
              {!dirty && activeDay && (
                <span className="font-mono text-[10px] text-emerald-600 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {t("training.manager.saved")}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {activeDay ? (
                <div className="p-3">
                  <QuillEditor
                    value={draftDesc}
                    onChange={onDescChange}
                    placeholder={t("training.manager.lessonPlaceholder")}
                    minHeight={420}
                    onUploadImage={handleUploadInlineImage}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
                  {t("training.manager.pickDayToEdit")}
                </div>
              )}
            </div>
          </div>

          {/* Preview column */}
          {showPreview && (
            <div className="hidden lg:flex flex-col bg-muted/30 min-h-0">
              <div className="px-4 h-9 border-b border-border flex items-center gap-2 shrink-0">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("training.manager.preview")}
                </span>
                <span className="text-stone-300 dark:text-stone-700">·</span>
                <span className="text-[11px] text-muted-foreground">
                  {t("training.manager.howInternsSeeIt")}
                </span>
                <div className="flex-1" />
                <div className="inline-flex rounded-[0.3rem] border border-border bg-background overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("desktop")}
                    className={cn(
                      "px-2.5 h-6 text-[11px] font-medium",
                      previewMode === "desktop"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground",
                    )}
                  >
                    {t("training.manager.desktop")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("mobile")}
                    className={cn(
                      "px-2.5 h-6 text-[11px] font-medium border-l border-border",
                      previewMode === "mobile"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground",
                    )}
                  >
                    {t("training.manager.mobile")}
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div
                  className={cn(
                    "mx-auto",
                    previewMode === "mobile" ? "max-w-[360px]" : "max-w-[560px]",
                  )}
                >
                  {activeDay ? (
                    draftDesc.trim() ? (
                      isHtmlContent(draftDesc) ? (
                        <div
                          className="merchiva-quill-prose"
                          dangerouslySetInnerHTML={{ __html: draftDesc }}
                        />
                      ) : (
                        <p className="text-[13px] whitespace-pre-wrap leading-relaxed">
                          {draftDesc}
                        </p>
                      )
                    ) : (
                      <p className="text-[12.5px] italic text-muted-foreground">
                        {t("training.manager.emptyDay")}
                      </p>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Attachments rail */}
        <div className="border-t border-border bg-background shrink-0">
          <div className="px-4 lg:px-6 h-10 flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("training.manager.attachments")}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              <span className="font-mono">{activeObjectives.length}</span>{" "}
              {activeObjectives.length === 1 ? t("training.manager.item") : t("training.manager.items")}
            </span>
            <div className="flex-1" />
            <AttachmentUploadButton
              dayId={activeDay?.id}
              sortOrder={activeObjectives.length}
              disabled={!activeDay || busy}
            />
            <button
              type="button"
              disabled={!activeDay}
              className="h-7 px-2.5 rounded-[0.3rem] border border-border bg-background text-[11.5px] font-medium text-stone-700 dark:text-stone-200 hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Link2 className="h-3 w-3" strokeWidth={1.75} /> {t("training.manager.embedUrl")}
            </button>
          </div>
          <div className="px-4 lg:px-6 pb-4 pt-1 flex gap-2.5 overflow-x-auto">
            <AttachmentDropZone />
            {activeObjectives.map((a) => (
              <AttachmentTile key={a.id} a={a} />
            ))}
            {!activeDay && (
              <div className="text-[12px] text-muted-foreground italic self-center pl-2">
                {t("training.manager.selectDayForAttachments")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachmentTile({ a }: { a: ObjectiveRow }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const isVideo = a.mediaType === "video";
  const isPhoto = a.mediaType === "image";
  const label =
    plainTextFromHtml(a.text).slice(0, 60) ||
    (isVideo
      ? t("training.manager.video")
      : isPhoto
        ? t("training.manager.photo")
        : t("training.manager.note"));

  const onDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteTrainingObjective(a.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group relative rounded-[0.3rem] border border-border bg-background overflow-hidden shrink-0 w-[140px]">
      <div
        className="relative h-[78px]"
        style={{
          background: isVideo
            ? "linear-gradient(135deg, #2a2520 0%, #44403c 100%)"
            : isPhoto
              ? "repeating-linear-gradient(135deg, #efe9dd 0 8px, #e8e1d2 8px 16px)"
              : "#f5f5f4",
        }}
      >
        {isVideo && a.mediaUrl && (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-7 h-7 rounded-full bg-background/90 flex items-center justify-center">
                <Play className="h-[13px] w-[13px] text-foreground ml-0.5" strokeWidth={1.75} />
              </span>
            </div>
          </>
        )}
        {isPhoto && a.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.mediaUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {!a.mediaUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText className="h-[22px] w-[22px] text-muted-foreground" strokeWidth={1.75} />
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="absolute top-1 right-1 w-5 h-5 rounded-[0.3rem] bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-black/60 disabled:opacity-50"
          title={t("training.manager.remove")}
          aria-label={t("training.manager.remove")}
        >
          {busy ? <Spinner size={16} /> : <X className="h-[11px] w-[11px]" />}
        </button>
      </div>
      <div className="px-2 py-1.5 border-t border-border">
        <div className="text-[11px] font-medium text-foreground truncate" title={label}>
          {label || "—"}
        </div>
        <div className="font-mono text-[9.5px] text-muted-foreground tabular-nums">
          {a.mediaType ?? t("training.manager.note")}
        </div>
      </div>
    </div>
  );
}

function AttachmentDropZone() {
  const t = useT();
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
      }}
      className={cn(
        "shrink-0 w-[140px] h-[112px] rounded-[0.3rem] border border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors",
        hover
          ? "border-foreground bg-muted"
          : "border-border bg-muted/30 hover:bg-muted/60",
      )}
    >
      <UploadCloud className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
      <div className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
        {t("training.manager.dropFile")}
      </div>
      <div className="font-mono text-[9.5px] text-muted-foreground uppercase tracking-wider">
        jpg · png · webp
      </div>
    </div>
  );
}

function AttachmentUploadButton({
  dayId,
  sortOrder,
  disabled,
}: {
  dayId: string | undefined;
  sortOrder: number;
  disabled?: boolean;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { startUpload, isUploading } = useUploadThing("generalFile", {
    onClientUploadComplete: async (res) => {
      const file = res?.[0];
      if (!file || !dayId) return;
      const isImage = /\.(png|jpe?g|gif|webp|avif)$/i.test(file.name);
      const isVideo = /\.(mp4|mov|webm|m4v)$/i.test(file.name);
      try {
        await addTrainingObjective({
          dayId,
          text: file.name,
          mediaUrl: file.ufsUrl,
          mediaType: isImage ? "image" : isVideo ? "video" : null,
          sortOrder,
        });
      } finally {
        setBusy(false);
      }
    },
    onUploadError: () => setBusy(false),
  });

  const onPickFile = () => inputRef.current?.click();

  const onFile = async (file: File) => {
    if (!dayId) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) return;
    const max = isVideo ? 64 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > max) return;
    setBusy(true);
    try {
      await startUpload([file]);
    } catch (err) {
      console.error("[Training] attachment upload failed", err);
      setBusy(false);
    }
  };

  const showBusy = busy || isUploading;

  return (
    <>
      <button
        type="button"
        onClick={onPickFile}
        disabled={disabled || showBusy || !dayId}
        className="h-7 px-2.5 rounded-[0.3rem] border border-border bg-background text-[11.5px] font-medium text-stone-700 dark:text-stone-200 hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {showBusy ? (
          <Spinner size={12} />
        ) : (
          <Upload className="h-3 w-3" strokeWidth={1.75} />
        )}{" "}
        {t("training.manager.upload")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
