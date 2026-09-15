"use client";

// "Today's tasks" lite app: big check rows, tap → confirm → done. The list is
// today's tasks: (a) role_task_assignment rows due today for this member and
// (b) role tasks of the roles on today's shift. "Done" is day-scoped exactly
// like the manager's roles overview — a task counts as done once anyone has
// completed it today (recordTaskCompletion / completeRoleTask), so the phone,
// the store tablet and /manager always agree. Managers can flip to
// "Everyone" for a read-only view of the team's open tasks.

import { useMemo, useRef, useState } from "react";
import { useTable } from "spacetimedb/react";
import { Camera, Check, CheckCircle2, Circle, ClipboardList, PartyPopper, RefreshCw, User, Users } from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { completeRoleTask, recordTaskCompletion } from "@/lib/spacetimedb/actions";
import { useI18n } from "@/lib/i18n/context";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { hapticLight } from "@/lib/haptics";
import { StatusBadge } from "@/components/ui/status-badge";
import { LiteButton, LiteChoice, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection, LiteStat } from "./lite";
import { useUploadThing } from "@/lib/uploadthing";
import type { LiteAppProps } from "./types";

// ─── Row shapes (subset of the generated tables) ─────────────────────────────

interface RoleTaskRow {
  id: { toString(): string };
  roleId: string;
  organizationId?: string | null;
  title: string;
  description: string;
  startTime?: string | null;
  endTime?: string | null;
  sortOrder: number;
  requiresEvidence: boolean;
}

interface AssignmentRow {
  id: { toString(): string };
  organizationId: string;
  taskId: string;
  memberId: string;
  dueAt: unknown;
  status: string;
  completedAt?: unknown;
}

interface ShiftRow {
  organizationId: string;
  memberId?: string | null;
  /** JSON array of role names. */
  staffRoles: string;
  date: string;
}

interface StaffRoleRow {
  id: { toString(): string };
  organizationId: string;
  name: string;
}

interface MemberRow {
  id: { toString(): string };
  organizationId: string;
  displayName: string;
  status: string;
}

/** One task as shown on screen. */
interface LiteTask {
  /** Stable key: assignment id when assigned, "role:<taskId>" otherwise. */
  key: string;
  taskId: string;
  assignmentId: string | null;
  roleId: string;
  roleName: string;
  title: string;
  description: string;
  /** "HH:mm" when the task has a time window. */
  time: string | null;
  requiresEvidence: boolean;
  done: boolean;
  skipped: boolean;
}

type Who = "me" | "everyone";

const pad = (n: number) => String(n).padStart(2, "0");

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tsToDate(v: any): Date {
  if (!v) return new Date(0);
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.microsSinceUnixEpoch === "bigint") return new Date(Number(v.microsSinceUnixEpoch / 1000n));
  return new Date(v);
}

function parseRoleNames(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return json ? [json] : [];
  }
}

function byTime(a: LiteTask, b: LiteTask): number {
  return (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title);
}

export function TasksLite({ organizationId, member, isManager }: LiteAppProps) {
  const { t, locale } = useI18n();
  const [who, setWho] = useState<Who>("me");
  const [confirm, setConfirm] = useState<LiteTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Photo evidence for the task being confirmed. Tasks flagged
  // requiresEvidence can't be finished without one — same rule as /manager.
  const [photo, setPhoto] = useState<{ url: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { startUpload } = useUploadThing("taskEvidence");

  const [taskRows, tasksReady] = useTable(tables.roleTask);
  const [assignmentRows, assignmentsReady] = useTable(tables.roleTaskAssignment);
  const [shiftRows, shiftsReady] = useTable(tables.shift);
  const [roleRows, rolesReady] = useTable(tables.staffRole);
  const [memberRows, membersReady] = useTable(tables.orgMember);

  const todayStr = localDateStr(new Date());

  // Today's task list for the store, with day-scoped completion — the same
  // rule the manager's task views use. `scheduled` maps roleId → members on
  // a shift today with that role (for the team view and the "me" filter).
  const { dayTasks, myAssigned, scheduled, myRoleIds } = useMemo(() => {
    const roles = (roleRows as unknown as StaffRoleRow[]).filter((r) => r.organizationId === organizationId);
    const roleNameById = new Map(roles.map((r) => [r.id.toString(), r.name]));
    const roleIdByName = new Map(roles.map((r) => [r.name.toLowerCase(), r.id.toString()]));
    const roleTasks = (taskRows as unknown as RoleTaskRow[]).filter(
      (r) => (r.organizationId == null || r.organizationId === organizationId) && roleNameById.has(r.roleId),
    );
    const taskById = new Map(roleTasks.map((r) => [r.id.toString(), r]));

    const orgAssignments = (assignmentRows as unknown as AssignmentRow[]).filter(
      (a) => a.organizationId === organizationId,
    );
    const doneToday = new Map<string, "completed" | "skipped">();
    for (const a of orgAssignments) {
      if (a.status !== "completed" && a.status !== "skipped") continue;
      if (localDateStr(tsToDate(a.completedAt ?? a.dueAt)) !== todayStr) continue;
      if (a.status === "completed" || !doneToday.has(a.taskId)) doneToday.set(a.taskId, a.status);
    }

    const scheduled = new Map<string, string[]>(); // roleId → memberIds on shift today
    const myRoleIds = new Set<string>();
    for (const s of shiftRows as unknown as ShiftRow[]) {
      if (s.organizationId !== organizationId || s.date !== todayStr || !s.memberId) continue;
      for (const name of parseRoleNames(s.staffRoles)) {
        const roleId = roleIdByName.get(name.toLowerCase());
        if (!roleId) continue;
        const list = scheduled.get(roleId) ?? [];
        if (!list.includes(s.memberId)) list.push(s.memberId);
        scheduled.set(roleId, list);
        if (s.memberId === member.id) myRoleIds.add(roleId);
      }
    }

    const toLite = (task: RoleTaskRow, assignmentId: string | null): LiteTask => {
      const taskId = task.id.toString();
      const state = doneToday.get(taskId);
      return {
        key: assignmentId ?? `role:${taskId}`,
        taskId,
        assignmentId,
        roleId: task.roleId,
        roleName: roleNameById.get(task.roleId) ?? "",
        title: task.title,
        description: task.description,
        time: task.startTime ?? null,
        requiresEvidence: task.requiresEvidence,
        done: !!state,
        skipped: state === "skipped",
      };
    };

    const dayTasks = roleTasks.map((task) => toLite(task, null)).sort(byTime);
    // Explicit pending assignments due today for this member.
    const myAssigned = orgAssignments
      .filter((a) => a.memberId === member.id && a.status === "pending" && localDateStr(tsToDate(a.dueAt)) === todayStr)
      .map((a) => { const task = taskById.get(a.taskId); return task ? toLite(task, a.id.toString()) : null; })
      .filter((x): x is LiteTask => !!x);
    return { dayTasks, myAssigned, scheduled, myRoleIds };
  }, [taskRows, assignmentRows, shiftRows, roleRows, organizationId, todayStr, member.id]);

  // "Me": tasks of the roles I'm on shift for today; anyone not on the rota
  // today (owner, manager, a walk-in cover) sees the store's full day list.
  const mine = useMemo(() => {
    const base = myRoleIds.size > 0 ? dayTasks.filter((x) => myRoleIds.has(x.roleId)) : dayTasks;
    const seen = new Set(myAssigned.map((x) => x.taskId));
    return [...myAssigned, ...base.filter((x) => !seen.has(x.taskId))].sort(byTime);
  }, [dayTasks, myAssigned, myRoleIds]);
  const myOpen = mine.filter((x) => !x.done);
  const myDone = mine.filter((x) => x.done);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of memberRows as unknown as MemberRow[]) {
      if (r.organizationId === organizationId) m.set(r.id.toString(), r.displayName);
    }
    return m;
  }, [memberRows, organizationId]);
  // Team view: every open task today; the sub line names who is on shift for
  // its role (falls back to the role name when nobody is scheduled).
  const teamOpen = useMemo(
    () => dayTasks.filter((x) => !x.done).map((x) => ({
      task: x,
      who: (scheduled.get(x.roleId) ?? []).map((id) => nameById.get(id) ?? t("device.unknownSender")),
    })),
    [dayTasks, scheduled, nameById, t],
  );

  const ready = tasksReady && assignmentsReady && shiftsReady && rolesReady && membersReady;
  if (!ready) return <LiteLoading />;

  const openConfirm = (task: LiteTask) => { setError(null); setPhoto(null); setConfirm(task); };
  const closeConfirm = () => { if (busy || uploading) return; setConfirm(null); setPhoto(null); setError(null); };

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await startUpload([file]);
      const first = res?.[0];
      const url = (first?.serverData as { url?: string } | undefined)?.url;
      if (!url) throw new Error("upload returned no url");
      setPhoto({ url, type: (first?.serverData as { type?: string } | undefined)?.type ?? file.type ?? "image" });
    } catch (err) {
      console.error("Evidence upload failed:", err);
      setError(t("device.lite.tasks.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const finish = async (task: LiteTask) => {
    if (task.requiresEvidence && !photo) { setError(t("device.lite.tasks.photoRequired")); return; }
    setBusy(true);
    setError(null);
    const evidenceUrls = photo ? [photo] : undefined;
    try {
      if (task.assignmentId) {
        await completeRoleTask({ assignmentId: task.assignmentId, organizationId, evidenceUrls });
      } else {
        await recordTaskCompletion({ taskId: task.taskId, memberId: member.id, organizationId, evidenceUrls });
      }
      setConfirm(null);
      setPhoto(null);
    } catch (err) {
      console.error("Failed to complete task:", err);
      setError(t("device.lite.tasks.failed"));
    } finally {
      setBusy(false);
    }
  };

  const todayLabel = new Date().toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
  const taskSub = (x: LiteTask) =>
    [x.time, x.requiresEvidence ? t("device.lite.tasks.photoNeeded") : null].filter(Boolean).join(" · ") || undefined;

  return (
    <LiteScreen>
      {isManager && (
        <LiteChoice<Who>
          value={who}
          onChange={setWho}
          options={[
            { value: "me", label: t("device.lite.tasks.me"), icon: User },
            { value: "everyone", label: t("device.lite.tasks.everyone"), icon: Users },
          ]}
        />
      )}

      {who === "me" ? (
        <>
          <LiteStat
            icon={ClipboardList}
            tone={mine.length > 0 && myOpen.length === 0 ? "success" : "default"}
            label={t("device.lite.tasks.today")}
            value={
              mine.length === 0
                ? t("device.lite.tasks.none")
                : myOpen.length === 0
                  ? t("device.lite.tasks.allDone")
                  : `${myOpen.length}`
            }
            sub={mine.length > 0 && myOpen.length > 0 ? t("device.lite.tasks.leftToDo") : todayLabel}
          />

          {mine.length === 0 ? (
            <LiteEmpty icon={PartyPopper} title={t("device.lite.tasks.emptyTitle")} description={t("device.lite.tasks.emptyDesc")} />
          ) : (
            <>
              {myOpen.length > 0 && (
                <LiteSection title={t("device.lite.tasks.toDo")}>
                  <div className="space-y-2">
                    {myOpen.map((x) => (
                      <LiteRow
                        key={x.key}
                        icon={Circle}
                        iconTone="warning"
                        title={x.title}
                        sub={taskSub(x)}
                        right={x.requiresEvidence ? <Camera className="h-5 w-5 text-muted-foreground" /> : undefined}
                        chevron
                        onClick={() => openConfirm(x)}
                      />
                    ))}
                  </div>
                </LiteSection>
              )}

              {myDone.length > 0 && (
                <LiteSection title={t("device.lite.tasks.done")}>
                  <div className="space-y-2">
                    {myDone.map((x) => (
                      <LiteRow
                        key={x.key}
                        icon={CheckCircle2}
                        iconTone="success"
                        title={<span className="line-through">{x.title}</span>}
                        sub={x.time ?? undefined}
                        right={
                          <StatusBadge tone={x.skipped ? "neutral" : "success"}>
                            {x.skipped ? t("device.lite.tasks.skipped") : t("device.lite.tasks.doneBadge")}
                          </StatusBadge>
                        }
                        className="opacity-60"
                      />
                    ))}
                  </div>
                </LiteSection>
              )}
            </>
          )}
        </>
      ) : (
        <LiteSection title={`${t("device.lite.tasks.teamOpen")} · ${todayLabel}`}>
          {teamOpen.length === 0 ? (
            <LiteEmpty icon={PartyPopper} title={t("device.lite.tasks.teamAllDone")} />
          ) : (
            <div className="space-y-2">
              {teamOpen.map(({ task: x, who }) => (
                <LiteRow
                  key={x.taskId}
                  icon={Circle}
                  iconTone="warning"
                  title={x.title}
                  sub={who.length > 0 ? who.join(", ") : x.roleName}
                  right={x.time ?? undefined}
                />
              ))}
            </div>
          )}
        </LiteSection>
      )}

      <DeviceDrawer
        open={confirm !== null}
        onOpenChange={(o) => { if (!o) closeConfirm(); }}
        title={confirm ? confirm.title : ""}
        cancelLabel={t("device.lite.tasks.notYet")}
        onCancel={closeConfirm}
      >
        {confirm && (
          <div className="flex flex-col gap-3 pb-1">
            {confirm.description && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">{confirm.description}</p>
            )}

            {confirm.requiresEvidence && (
              <div className="flex flex-col gap-2">
                {photo ? (
                  <div className="relative overflow-hidden rounded-lg border border-border bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="max-h-56 w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => { hapticLight(); fileRef.current?.click(); }}
                      disabled={uploading || busy}
                      className="absolute bottom-2 right-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-background/90 px-3 text-[13px] font-medium text-foreground"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t("device.lite.tasks.retake")}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] font-medium text-foreground">{t("device.lite.tasks.photoRequired")}</p>
                    <LiteButton
                      icon={Camera}
                      tone="outline"
                      label={uploading ? t("device.lite.tasks.uploadingPhoto") : t("device.lite.tasks.takePhoto")}
                      busy={uploading}
                      disabled={busy}
                      onClick={() => fileRef.current?.click()}
                    />
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void onPickPhoto(e.target.files?.[0])}
                />
              </div>
            )}

            {error && <p className="text-[13px] text-destructive">{error}</p>}

            <LiteButton
              icon={Check}
              label={busy ? t("device.lite.tasks.saving") : t("device.lite.tasks.markDone")}
              busy={busy}
              disabled={uploading || (confirm.requiresEvidence && !photo)}
              onClick={() => void finish(confirm)}
            />
          </div>
        )}
      </DeviceDrawer>
    </LiteScreen>
  );
}
