"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight, X, Film } from "lucide-react";
import { TaskRow as TaskRowComp, parseNotifyChats } from "@/components/personnel/task-row";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementFooter,
} from "@/components/ui/dynamic-ui-element";
import { UploadButton } from "@/lib/uploadthing";
import { useRoleTasks, useRoleTaskAssignments, useStaffRoles } from "@/lib/spacetimedb/hooks";
import { recordTaskCompletion, sendMessage } from "@/lib/spacetimedb/actions";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = any;

export interface CompletableTask {
  id: string;
  title: string;
  requiresEvidence: boolean;
  startTime: string | null;
  endTime: string | null;
  notifyChats: string[];
}

type TaskRow = CompletableTask;

function tsToMs(ts: RawRow): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts === "object" && "microsSinceUnixEpoch" in ts) {
    const micros = (ts as { microsSinceUnixEpoch: bigint | number }).microsSinceUnixEpoch;
    return typeof micros === "bigint" ? Number(micros / 1000n) : Number(micros) / 1000;
  }
  return 0;
}

function startOfDayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Dashboard widget: shows role tasks that haven't been completed today.
// Each card has a Complete button that opens an evidence-upload dialog and
// records a completion row directly (no pre-assignment step).
export function MyTasksCard() {
  const t = useT();
  const { organizationId } = usePermissions();
  const [taskRows] = useRoleTasks();
  const [roleRows] = useStaffRoles();
  const [assignmentTuple] = useRoleTaskAssignments();
  const assignmentRows = Array.isArray(assignmentTuple) ? assignmentTuple : [];

  // Tasks whose roleId still maps to an existing staff_role. Orphans (from
  // previously-deleted roles) are filtered out so the dashboard stays clean.
  const liveRoleIds = useMemo(() => {
    const out = new Set<string>();
    for (const r of roleRows) {
      if (r.organizationId === organizationId) out.add(r.id.toString());
    }
    return out;
  }, [roleRows, organizationId]);

  // taskId set for tasks already completed today
  const completedToday = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    if (!organizationId) return out;
    const sod = startOfDayMs();
    for (const r of assignmentRows) {
      if (r.organizationId !== organizationId) continue;
      if (r.status !== "completed") continue;
      const completedAt = tsToMs(r.completedAt);
      if (!completedAt || completedAt < sod) continue;
      out.add(String(r.taskId));
    }
    return out;
  }, [assignmentRows, organizationId]);

  const liveTasks = useMemo<TaskRow[]>(() => {
    if (!organizationId) return [];
    return taskRows
      .filter((r: RawRow) => r.organizationId === organizationId && liveRoleIds.has(String(r.roleId)))
      .map((r: RawRow): TaskRow => ({
        id: r.id.toString(),
        title: String(r.title ?? ""),
        requiresEvidence: Boolean(r.requiresEvidence),
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        notifyChats: parseNotifyChats(r.notifyChats),
      }));
  }, [taskRows, organizationId, liveRoleIds]);

  const pending = useMemo<TaskRow[]>(() => {
    return liveTasks
      .filter((t: TaskRow) => !completedToday.has(t.id))
      .sort((a: TaskRow, b: TaskRow) => {
        // Sort by earliest startTime; nulls last
        const at = a.startTime ?? "99:99";
        const bt = b.startTime ?? "99:99";
        return at.localeCompare(bt);
      });
  }, [liveTasks, completedToday]);

  const totalTasks = liveTasks.length;

  const [completeFor, setCompleteFor] = useState<TaskRow | null>(null);

  // Hide entirely when there's nothing in scope — dashboard stays clean.
  if (totalTasks === 0) return null;

  const top = pending.slice(0, 4);

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span className="text-[13px] font-semibold text-foreground">{t("myTasks.title")}</span>
        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {t("myTasks.doneCount").replace("{done}", String(totalTasks - pending.length)).replace("{total}", String(totalTasks))}
        </span>
        <Link
          href="/manager/personnel"
          className="ml-auto h-8 px-2 -mr-2 text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 rounded-lg"
        >
          {t("myTasks.all")}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {pending.length === 0 ? (
        <EmptyState icon={CheckCircle2} description={t("myTasks.allCompleted")} />
      ) : (
        <div className="divide-y divide-border">
          {top.map((task) => (
            <TaskRowComp
              key={task.id}
              task={task}
              completion={null}
              onComplete={() => setCompleteFor(task)}
              className="px-1"
            />
          ))}
          {pending.length > top.length && (
            <div className="px-4 py-2.5 text-[11.5px] text-muted-foreground text-center bg-muted/30">
              {t("myTasks.moreCount").replace("{count}", String(pending.length - top.length))}
            </div>
          )}
        </div>
      )}

      {completeFor && (
        <TaskCompleteDialog
          task={completeFor}
          organizationId={organizationId ?? ""}
          onClose={() => setCompleteFor(null)}
        />
      )}
    </div>
  );
}

/** Evidence-upload completion dialog. Records the completion and fans out to
 *  the task's notify chats. Shared by the dashboard card and the personnel
 *  roles views — anyone can complete a task from either place. */
export function TaskCompleteDialog({
  task,
  organizationId,
  onClose,
}: {
  task: TaskRow;
  organizationId: string;
  onClose: () => void;
}) {
  const t = useT();
  const [evidence, setEvidence] = useState<{ url: string; type: string }[]>([]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const evidenceRequired = task.requiresEvidence;

  function removeEvidence(url: string) {
    setEvidence((prev) => prev.filter((e) => e.url !== url));
  }

  async function submit() {
    if (evidenceRequired && evidence.length === 0) {
      toast.error(t("myTasks.evidenceRequiredError"));
      return;
    }
    setSubmitting(true);
    try {
      await recordTaskCompletion({
        organizationId,
        taskId: task.id,
        evidenceUrls: evidence.length > 0 ? evidence : undefined,
        note: note.trim() || undefined,
      });
      // Fan-out to chats: best-effort. Don't roll back completion on failure.
      // Send the note first (with a header), then one message per attachment.
      if (task.notifyChats.length > 0) {
        const trimmedNote = note.trim();
        const lines = [t("myTasks.chatHeader").replace("{title}", task.title)];
        if (trimmedNote) lines.push(trimmedNote);
        if (evidence.length > 0) lines.push(t("myTasks.chatAttachments").replace("{count}", String(evidence.length)));
        const header = lines.join("\n");

        const sends: Promise<unknown>[] = [];
        // First message carries the header (+ first attachment if any).
        sends.push(
          sendMessage(
            task.notifyChats[0],
            header,
            undefined,
            evidence[0]
              ? { url: evidence[0].url, type: evidence[0].type, name: `${task.title}-evidence-1` }
              : null,
          ),
        );
        // Remaining attachments to the first chat.
        for (let i = 1; i < evidence.length; i++) {
          sends.push(
            sendMessage(task.notifyChats[0], "", undefined, {
              url: evidence[i].url,
              type: evidence[i].type,
              name: `${task.title}-evidence-${i + 1}`,
            }),
          );
        }
        // Other chats get the header + all attachments too.
        for (let c = 1; c < task.notifyChats.length; c++) {
          const chatId = task.notifyChats[c];
          sends.push(
            sendMessage(
              chatId,
              header,
              undefined,
              evidence[0]
                ? { url: evidence[0].url, type: evidence[0].type, name: `${task.title}-evidence-1` }
                : null,
            ),
          );
          for (let i = 1; i < evidence.length; i++) {
            sends.push(
              sendMessage(chatId, "", undefined, {
                url: evidence[i].url,
                type: evidence[i].type,
                name: `${task.title}-evidence-${i + 1}`,
              }),
            );
          }
        }

        const results = await Promise.allSettled(sends);
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.warning(t("myTasks.partialChatFailure").replace("{count}", String(failed)));
        }
      }
      toast.success(t("myTasks.completedSuccess"));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("myTasks.completeError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DynamicUIElement open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DynamicUIElementContent className="sm:max-w-md">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle>{task.title}</DynamicUIElementTitle>
        </DynamicUIElementHeader>
        <div className="space-y-3 p-4">
          <div>
            <Label className="text-[11px]">
              {t("myTasks.evidenceLabel")}
              {evidenceRequired && <span className="text-destructive ml-1">*</span>}
              {evidence.length > 0 && (
                <span className="text-muted-foreground ml-1">({evidence.length})</span>
              )}
            </Label>
            {evidence.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {evidence.map((item) => {
                  const isVideo = item.type?.startsWith("video");
                  return (
                    <div key={item.url} className="relative aspect-square">
                      {isVideo ? (
                        <video
                          src={item.url}
                          className="w-full h-full object-cover rounded-lg border border-border bg-black"
                          muted
                          playsInline
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt={t("myTasks.evidenceAlt")}
                          className="w-full h-full object-cover rounded-lg border border-border"
                        />
                      )}
                      {isVideo && (
                        <span className="absolute bottom-1 left-1 h-4 w-4 rounded bg-black/60 text-white inline-flex items-center justify-center">
                          <Film className="h-2.5 w-2.5" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeEvidence(item.url)}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white inline-flex items-center justify-center hover:bg-black/80"
                        title={t("myTasks.remove")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {evidence.length < 10 && (
              <div className="border border-dashed border-border rounded-lg p-3 mt-1.5">
                <UploadButton
                  endpoint="taskEvidence"
                  onUploadBegin={() => setUploading(true)}
                  onClientUploadComplete={(res) => {
                    const uploaded = (res ?? [])
                      .map((r) => ({
                        url: r?.serverData?.url as string | undefined,
                        type: (r?.serverData?.type as string | undefined) ?? r?.type ?? "image",
                      }))
                      .filter((x): x is { url: string; type: string } => !!x.url);
                    if (uploaded.length > 0) {
                      setEvidence((prev) => {
                        const seen = new Set(prev.map((e) => e.url));
                        const merged = [...prev];
                        for (const u of uploaded) {
                          if (!seen.has(u.url)) merged.push(u);
                        }
                        return merged.slice(0, 10);
                      });
                    }
                    setUploading(false);
                  }}
                  onUploadError={(err) => {
                    setUploading(false);
                    toast.error(err.message ?? t("myTasks.uploadError"));
                  }}
                  appearance={{
                    button:
                      "h-9 text-[12px] bg-foreground text-background hover:bg-foreground/90",
                    allowedContent: "text-[10px] text-muted-foreground mt-1",
                  }}
                />
                {uploading && (
                  <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                    <Spinner size={12} />
                    {t("myTasks.uploading")}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <Label className="text-[11px]">
              {t("myTasks.noteLabel")} <span className="text-muted-foreground">{t("myTasks.optional")}</span>
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("myTasks.notePlaceholder")}
              rows={3}
              className="text-[12.5px]"
            />
          </div>
        </div>
        <DynamicUIElementFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={submitting || uploading}>
            {submitting ? (
              <Spinner size={14} className="mr-1" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            {t("myTasks.markDone")}
          </Button>
        </DynamicUIElementFooter>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
