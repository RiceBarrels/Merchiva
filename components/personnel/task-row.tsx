"use client";

import { useState } from "react";
import { Check, Clock, Film, ImageIcon, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { hapticLight } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementFooter,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";

export interface TaskRowTask {
  id: string;
  title: string;
  description?: string;
  requiresEvidence: boolean;
  startTime: string | null;
  endTime: string | null;
  notifyChats: string[];
}

export interface TaskRowCompletion {
  completedAtMs: number;
  completedByName: string | null;
  /** Evidence + note submitted with the completion — shown when tapping a done row. */
  evidence?: { url: string; type: string }[];
  note?: string | null;
}

export function parseNotifyChats(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
    } catch { /* fall through */ }
  }
  return [];
}

/**
 * Unified role-task row used by the dashboard card, the roles overview, and
 * the role detail views (mobile sheet + desktop panel). Tapping a pending row
 * opens the evidence-upload completion dialog via `onComplete`.
 */
export function TaskRow({ task, completion, onComplete, onEdit, className }: {
  task: TaskRowTask;
  completion: TaskRowCompletion | null;
  /** Opens the completion dialog. Omit to render read-only (e.g. browsing a past day). */
  onComplete?: () => void;
  onEdit?: () => void;
  className?: string;
}) {
  const t = useT();
  const done = !!completion;
  // Tapping a pending row opens the completion dialog; tapping a done row
  // opens a read-only view of what was submitted (photos + note).
  const [viewOpen, setViewOpen] = useState(false);
  const clickable = done || !!onComplete;

  return (
    <div className={cn("flex items-center bg-background", className)}>
      <button
        type="button"
        disabled={!clickable}
        aria-label={done ? t("myTasks.viewSubmission") : onComplete ? t("myTasks.markDone") : undefined}
        onClick={() => {
          hapticLight();
          if (done) setViewOpen(true);
          else onComplete?.();
        }}
        className={cn(
          "flex-1 min-w-0 text-left flex items-center gap-2.5 px-3 py-2.5",
          clickable ? "hover:bg-muted/60 active:bg-muted/60" : "cursor-default",
        )}
      >
        <span
          className={cn(
            "w-[18px] h-[18px] rounded-sm border-[1.5px] shrink-0 inline-flex items-center justify-center",
            done ? "bg-emerald-600 border-emerald-600 text-white" : "border-border bg-background",
          )}
        >
          {done && <Check className="h-3 w-3" strokeWidth={2.5} />}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-[13px] font-medium tracking-[-0.01em] truncate",
              done ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-foreground",
            )}
          >
            {task.title}
          </div>
          {!done && task.description && (
            <div className="text-[11.5px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
              {task.description}
            </div>
          )}
          {done ? (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">
              {t("staffing.roles.doneBy")
                .replace("{name}", completion.completedByName ?? "—")
                .replace("{time}", new Date(completion.completedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
            </div>
          ) : (
            (task.startTime || task.requiresEvidence) && (
              <div className="flex items-center gap-1.5 mt-1">
                {task.startTime && (
                  <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-[0.25rem] bg-muted text-muted-foreground text-[10px] font-mono tabular-nums">
                    <Clock className="h-2.5 w-2.5" />
                    {task.startTime}
                    {task.endTime ? `–${task.endTime}` : ""}
                  </span>
                )}
                {task.requiresEvidence && (
                  <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-[0.25rem] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-mono">
                    <ImageIcon className="h-2.5 w-2.5" />
                    {t("myTasks.evidenceBadge")}
                  </span>
                )}
              </div>
            )
          )}
        </div>
      </button>
      {onEdit && (
        <button
          type="button"
          aria-label={t("staffing.roles.editTask")}
          onClick={onEdit}
          className="h-8 w-8 mr-1.5 shrink-0 inline-flex items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-muted active:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      )}
      {viewOpen && completion && (
        <TaskCompletionViewDialog
          task={task}
          completion={completion}
          onClose={() => setViewOpen(false)}
        />
      )}
    </div>
  );
}

/** Read-only view of a submitted completion: who/when, evidence, note. */
export function TaskCompletionViewDialog({ task, completion, onClose }: {
  task: TaskRowTask;
  completion: TaskRowCompletion;
  onClose: () => void;
}) {
  const t = useT();
  const evidence = completion.evidence ?? [];
  const note = completion.note ?? null;

  return (
    <DynamicUIElement open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DynamicUIElementContent className="sm:max-w-md">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={task.title}>{task.title}</DynamicUIElementTitle>
          <DynamicUIElementDescription>
            <span className="text-emerald-700 dark:text-emerald-400">
              {t("staffing.roles.doneBy")
                .replace("{name}", completion.completedByName ?? "—")
                .replace("{time}", new Date(completion.completedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
            </span>
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-3 p-4">
          {evidence.length === 0 && !note && (
            <p className="text-[12.5px] text-muted-foreground py-3 text-center border border-dashed border-border rounded-[0.3rem]">
              {t("myTasks.noSubmission")}
            </p>
          )}
          {evidence.length > 0 && (
            <div>
              <Label className="text-[11px]">
                {t("myTasks.evidenceLabel")}
                <span className="text-muted-foreground ml-1">({evidence.length})</span>
              </Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {evidence.map((item) => {
                  const isVideo = item.type?.startsWith("video");
                  if (isVideo) {
                    return (
                      <div key={item.url} className="relative aspect-square">
                        <video
                          src={item.url}
                          className="w-full h-full object-cover rounded-[0.2rem] border border-border bg-black"
                          playsInline
                          controls
                        />
                        <span className="absolute bottom-1 left-1 h-4 w-4 rounded-[0.15rem] bg-black/60 text-white inline-flex items-center justify-center pointer-events-none">
                          <Film className="h-2.5 w-2.5" />
                        </span>
                      </div>
                    );
                  }
                  return (
                    // Tap an image to open it full-size in a new tab
                    <a
                      key={item.url}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative aspect-square block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={t("myTasks.evidenceAlt")}
                        className="w-full h-full object-cover rounded-[0.2rem] border border-border"
                      />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          {note && (
            <div>
              <Label className="text-[11px]">{t("myTasks.noteLabel")}</Label>
              <p className="mt-1 text-[12.5px] leading-relaxed text-foreground whitespace-pre-wrap border border-border rounded-[0.3rem] px-2.5 py-2 bg-muted/20">
                {note}
              </p>
            </div>
          )}
        </div>
        <DynamicUIElementFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
        </DynamicUIElementFooter>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
