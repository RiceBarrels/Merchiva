"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { hapticLight } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { STATUS_TONE_CLASSES, STATUS_TONE_TEXT } from "@/components/ui/status-badge";
import { useOrgMembers, useRoleTaskAssignments, useRoleTasks } from "@/lib/spacetimedb/hooks";
import type { StaffRole } from "@/lib/types";
import { RoleIconComp, taskCompletionsForDate } from "@/components/personnel/role-dialogs";
import { TaskRow, parseNotifyChats, type TaskRowTask } from "@/components/personnel/task-row";
import { TaskCompleteDialog } from "@/components/task-complete-dialog";
import { dateKey } from "@/lib/date-key";

/**
 * All-tasks completion overview shown at the top of the Roles & tasks views
 * (mobile and desktop): every role task grouped by its role, each row marked
 * done / not done for the browsed day.
 */
export function RoleTasksOverview({ orgId, roles, className }: {
  orgId: string;
  roles: StaffRole[];
  className?: string;
}) {
  const t = useT();
  const [rawTasks] = useRoleTasks() as [unknown[], boolean];
  const [rawAssignments] = useRoleTaskAssignments() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];

  const todayStr = dateKey(new Date());
  const [statusDate, setStatusDate] = useState(todayStr);
  const shiftStatusDate = (delta: number) => {
    hapticLight();
    setStatusDate((prev) => {
      const d = new Date(prev + "T00:00:00");
      d.setDate(d.getDate() + delta);
      const next = dateKey(d);
      return next > todayStr ? prev : next;
    });
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const tasksByRole = useMemo(() => {
    const map = new Map<string, TaskRowTask[]>();
    for (const r of rawTasks as any[]) {
      if (r.organizationId && r.organizationId !== orgId) continue;
      const roleId = String(r.roleId ?? "");
      const list = map.get(roleId) ?? [];
      list.push({
        id: r.id?.toString?.() ?? String(r.id),
        title: String(r.title ?? ""),
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        requiresEvidence: !!r.requiresEvidence,
        notifyChats: parseNotifyChats(r.notifyChats),
      });
      map.set(roleId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
    }
    return map;
  }, [rawTasks, orgId]);

  const nameByIdentity = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of rawMembers as any[]) {
      if (m.organizationId !== orgId) continue;
      const key = m.userId?.toHexString?.() ?? String(m.userId ?? "");
      map.set(key, String(m.displayName ?? "—"));
    }
    return map;
  }, [rawMembers, orgId]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const dayCompletions = useMemo(
    () => taskCompletionsForDate(rawAssignments, orgId, statusDate),
    [rawAssignments, orgId, statusDate],
  );

  const groups = useMemo(
    () =>
      roles
        .map((role) => ({ role, tasks: tasksByRole.get(role.id) ?? [] }))
        .filter((g) => g.tasks.length > 0),
    [roles, tasksByRole],
  );

  const [completeFor, setCompleteFor] = useState<TaskRowTask | null>(null);

  if (groups.length === 0) return null;

  const total = groups.reduce((s, g) => s + g.tasks.length, 0);
  const done = groups.reduce((s, g) => s + g.tasks.filter((task) => dayCompletions.has(task.id)).length, 0);

  return (
    <div className={cn("bg-background", className)}>
      {/* Header: title, overall progress, day nav */}
      <div className="flex items-center gap-2 px-4 lg:px-6 py-2.5 border-b border-border">
        <div className="flex-1 min-w-0">
          <Eyebrow>{t("staffing.roles.overviewTitle")}</Eyebrow>
        </div>
        <span
          className={cn(
            "font-mono text-[12px] font-semibold tabular-nums px-1.5 py-0.5 rounded border",
            done >= total ? STATUS_TONE_CLASSES.success : "border-border text-foreground",
          )}
        >
          {done}/{total}
        </span>
        <div className="flex items-center gap-0.5 border border-border rounded-lg px-1 py-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => shiftStatusDate(-1)}
            aria-label={t("staffing.roles.prevDay")}
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <span className="text-[11px] font-medium tabular-nums min-w-[72px] text-center">
            {statusDate === todayStr
              ? t("staffing.roles.today")
              : new Date(statusDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" })}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => shiftStatusDate(1)}
            aria-label={t("staffing.roles.nextDay")}
            disabled={statusDate >= todayStr}
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Groups: one per role that has tasks */}
      {groups.map(({ role, tasks }) => {
        const groupDone = tasks.filter((task) => dayCompletions.has(task.id)).length;
        return (
          <div key={role.id} className="border-b border-border">
            <div className="flex items-center gap-2 px-4 lg:px-6 py-1.5 bg-muted/50">
              <span
                className="w-5 h-5 rounded inline-flex items-center justify-center border shrink-0"
                style={{ borderColor: role.color, color: role.color }}
              >
                <RoleIconComp name={role.icon} className="h-3 w-3" />
              </span>
              <span className="text-[12px] font-semibold text-foreground truncate flex-1 min-w-0">{role.name}</span>
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums shrink-0",
                  groupDone >= tasks.length ? STATUS_TONE_TEXT.success : STATUS_TONE_TEXT.neutral,
                )}
              >
                {groupDone}/{tasks.length}
              </span>
            </div>
            <div className="divide-y divide-border">
              {tasks.map((task) => {
                const comp = dayCompletions.get(task.id);
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    completion={comp ? {
                      completedAtMs: comp.completedAtMs,
                      completedByName: comp.completedBy ? nameByIdentity.get(comp.completedBy) ?? null : null,
                      evidence: comp.evidence,
                      note: comp.note,
                    } : null}
                    onComplete={statusDate === todayStr ? () => setCompleteFor(task) : undefined}
                    className="px-1 lg:px-3"
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {completeFor && (
        <TaskCompleteDialog
          task={completeFor}
          organizationId={orgId}
          onClose={() => setCompleteFor(null)}
        />
      )}
    </div>
  );
}
