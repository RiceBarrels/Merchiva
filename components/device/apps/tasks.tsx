"use client";

// "Today's tasks" lite app: big check rows, tap → confirm → done. Open tasks
// come from (a) role_task_assignment rows due today for this member and
// (b) role tasks of the roles on today's shift that have no assignment yet
// (completed one-shot via recordTaskCompletion, same as the manager UI).
// Managers can flip to "Everyone" for a read-only view of the team's open
// tasks.

import { useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { Camera, Check, CheckCircle2, Circle, ClipboardList, PartyPopper, User, Users, X } from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { completeRoleTask, recordTaskCompletion } from "@/lib/spacetimedb/actions";
import { useI18n } from "@/lib/i18n/context";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { StatusBadge } from "@/components/ui/status-badge";
import { LiteChoice, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection, LiteStat } from "./lite";
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
  memberId: string;
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

  const [taskRows, tasksReady] = useTable(tables.roleTask);
  const [assignmentRows, assignmentsReady] = useTable(tables.roleTaskAssignment);
  const [shiftRows, shiftsReady] = useTable(tables.shift);
  const [roleRows, rolesReady] = useTable(tables.staffRole);
  const [memberRows, membersReady] = useTable(tables.orgMember);

  const todayStr = localDateStr(new Date());

  const tasks = useMemo(() => {
    const roleTasks = (taskRows as unknown as RoleTaskRow[]).filter(
      (r) => r.organizationId == null || r.organizationId === organizationId,
    );
    const taskById = new Map(roleTasks.map((r) => [r.id.toString(), r]));
    const roles = (roleRows as unknown as StaffRoleRow[]).filter((r) => r.organizationId === organizationId);
    const roleIdByName = new Map(roles.map((r) => [r.name.toLowerCase(), r.id.toString()]));
    const todayShifts = (shiftRows as unknown as ShiftRow[]).filter(
      (s) => s.organizationId === organizationId && s.date === todayStr && !!s.memberId,
    );
    const todayAssignments = (assignmentRows as unknown as AssignmentRow[]).filter(
      (a) => a.organizationId === organizationId && localDateStr(tsToDate(a.dueAt)) === todayStr,
    );

    const out: LiteTask[] = [];
    const seen = new Set<string>(); // `${memberId}:${taskId}`

    for (const a of todayAssignments) {
      const task = taskById.get(a.taskId);
      if (!task) continue;
      seen.add(`${a.memberId}:${a.taskId}`);
      out.push({
        key: a.id.toString(),
        taskId: a.taskId,
        assignmentId: a.id.toString(),
        memberId: a.memberId,
        title: task.title,
        description: task.description,
        time: task.startTime ?? null,
        requiresEvidence: task.requiresEvidence,
        done: a.status === "completed" || a.status === "skipped",
        skipped: a.status === "skipped",
      });
    }

    // Role tasks implied by today's shift roles, for anyone working today.
    for (const s of todayShifts) {
      const memberId = s.memberId as string;
      const roleIds = parseRoleNames(s.staffRoles)
        .map((n) => roleIdByName.get(n.toLowerCase()))
        .filter((id): id is string => !!id);
      for (const task of roleTasks) {
        if (!roleIds.includes(task.roleId)) continue;
        const taskId = task.id.toString();
        const dedupe = `${memberId}:${taskId}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        out.push({
          key: `role:${memberId}:${taskId}`,
          taskId,
          assignmentId: null,
          memberId,
          title: task.title,
          description: task.description,
          time: task.startTime ?? null,
          requiresEvidence: task.requiresEvidence,
          done: false,
          skipped: false,
        });
      }
    }
    return out.sort(byTime);
  }, [taskRows, assignmentRows, shiftRows, roleRows, organizationId, todayStr]);

  const mine = useMemo(() => tasks.filter((x) => x.memberId === member.id), [tasks, member.id]);
  const myOpen = mine.filter((x) => !x.done);
  const myDone = mine.filter((x) => x.done);

  const teamOpen = useMemo(() => tasks.filter((x) => !x.done), [tasks]);
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of memberRows as unknown as MemberRow[]) {
      if (r.organizationId === organizationId) m.set(r.id.toString(), r.displayName);
    }
    return m;
  }, [memberRows, organizationId]);

  const ready = tasksReady && assignmentsReady && shiftsReady && rolesReady && membersReady;
  if (!ready) return <LiteLoading />;

  const finish = async (task: LiteTask) => {
    setBusy(true);
    setError(null);
    try {
      if (task.assignmentId) {
        await completeRoleTask({ assignmentId: task.assignmentId, organizationId });
      } else {
        await recordTaskCompletion({ taskId: task.taskId, memberId: task.memberId, organizationId });
      }
      setConfirm(null);
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
                        onClick={() => { setError(null); setConfirm(x); }}
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
              {teamOpen.map((x) => (
                <LiteRow
                  key={x.key}
                  icon={Circle}
                  iconTone="warning"
                  title={x.title}
                  sub={nameById.get(x.memberId) ?? t("device.unknownSender")}
                  right={x.time ?? undefined}
                />
              ))}
            </div>
          )}
        </LiteSection>
      )}

      <DeviceDrawer
        open={confirm !== null}
        onOpenChange={(o) => { if (!o && !busy) setConfirm(null); }}
        title={confirm ? confirm.title : ""}
        options={[
          {
            id: "done",
            icon: Check,
            tone: "primary",
            label: busy ? t("device.lite.tasks.saving") : t("device.lite.tasks.markDone"),
            // The drawer has no separate error slot: a failed save shows here so
            // the row doubles as "try again".
            sub: error ?? (confirm?.requiresEvidence ? t("device.lite.tasks.photoLater") : (confirm?.description || undefined)),
            onSelect: () => { if (confirm && !busy) void finish(confirm); },
          },
          {
            id: "notYet",
            icon: X,
            label: t("device.lite.tasks.notYet"),
            onSelect: () => { if (!busy) setConfirm(null); },
          },
        ]}
        onCancel={() => { if (!busy) setConfirm(null); }}
      />
    </LiteScreen>
  );
}
