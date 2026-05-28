"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Camera, ImageIcon, ArrowRight, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/loaders/geometric";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = any;

interface TaskRow {
  id: string;
  title: string;
  requiresEvidence: boolean;
  startTime: string | null;
  endTime: string | null;
  notifyChats: string[];
}

function parseNotifyChats(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
    } catch { /* fall through */ }
  }
  return [];
}

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
        <span className="text-[13px] font-semibold text-foreground">Today&rsquo;s tasks</span>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {totalTasks - pending.length} / {totalTasks} done
        </span>
        <Link
          href="/~/personnel"
          className="ml-auto h-8 px-2 -mr-2 text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 rounded-[0.3rem]"
        >
          All
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {pending.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="text-[13px] text-muted-foreground">All tasks completed today.</div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {top.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center gap-3 min-h-[56px]">
              <div className="h-[18px] w-[18px] rounded-full border-2 border-stone-300 dark:border-stone-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-foreground truncate leading-tight">{t.title}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  {t.startTime && (
                    <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-[0.25rem] bg-muted text-muted-foreground text-[10px] font-mono">
                      <Clock className="h-2.5 w-2.5" />
                      {t.startTime}
                      {t.endTime ? `–${t.endTime}` : ""}
                    </span>
                  )}
                  {t.requiresEvidence && (
                    <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-[0.25rem] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-mono">
                      <ImageIcon className="h-2.5 w-2.5" />
                      evidence
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className={cn("h-9 px-3 text-[12px] shrink-0")}
                onClick={() => setCompleteFor(t)}
              >
                <Camera className="h-3.5 w-3.5 mr-1" />
                Done
              </Button>
            </div>
          ))}
          {pending.length > top.length && (
            <div className="px-4 py-2.5 text-[11.5px] text-muted-foreground text-center bg-muted/30">
              + {pending.length - top.length} more
            </div>
          )}
        </div>
      )}

      {completeFor && (
        <InlineComplete
          task={completeFor}
          organizationId={organizationId ?? ""}
          onClose={() => setCompleteFor(null)}
        />
      )}
    </div>
  );
}

function InlineComplete({
  task,
  organizationId,
  onClose,
}: {
  task: TaskRow;
  organizationId: string;
  onClose: () => void;
}) {
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const evidenceRequired = task.requiresEvidence;

  async function submit() {
    if (evidenceRequired && !evidenceUrl) {
      toast.error("This task requires a photo as evidence");
      return;
    }
    setSubmitting(true);
    try {
      await recordTaskCompletion({
        organizationId,
        taskId: task.id,
        evidenceUrl: evidenceUrl ?? undefined,
        note: note.trim() || undefined,
      });
      // Fan-out to chats: best-effort. Don't roll back completion on failure.
      if (task.notifyChats.length > 0) {
        const trimmedNote = note.trim();
        const lines = [`✅ Task completed: ${task.title}`];
        if (trimmedNote) lines.push(trimmedNote);
        const content = lines.join("\n");
        const attachment = evidenceUrl
          ? { url: evidenceUrl, type: "image", name: `${task.title}-evidence` }
          : null;
        const results = await Promise.allSettled(
          task.notifyChats.map((chatId) => sendMessage(chatId, content, undefined, attachment))
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.warning(`Task completed, but ${failed} chat notification(s) failed`);
        }
      }
      toast.success("Task completed");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete");
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
              Evidence photo
              {evidenceRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {evidenceUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={evidenceUrl}
                  alt="Evidence"
                  className="w-full max-h-[200px] object-cover rounded-[0.2rem] border border-border"
                />
                <button
                  type="button"
                  onClick={() => setEvidenceUrl(null)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white inline-flex items-center justify-center hover:bg-black/80"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="border border-dashed border-border rounded-[0.2rem] p-3">
                <UploadButton
                  endpoint="siteImage"
                  onUploadBegin={() => setUploading(true)}
                  onClientUploadComplete={(res) => {
                    const url = res?.[0]?.serverData?.url ?? null;
                    if (url) setEvidenceUrl(url);
                    setUploading(false);
                  }}
                  onUploadError={(err) => {
                    setUploading(false);
                    toast.error(err.message ?? "Upload failed");
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
                    Uploading…
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <Label className="text-[11px]">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything to flag for the manager?"
              rows={3}
              className="text-[12.5px]"
            />
          </div>
        </div>
        <DynamicUIElementFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || uploading}>
            {submitting ? (
              <Spinner size={14} className="mr-1" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            Mark done
          </Button>
        </DynamicUIElementFooter>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
