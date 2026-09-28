"use client";

// Runs the deleteRoleTask blocks of one Mr. Merchiva reply, one card each.
//
// A block names its task by `taskId` (the model, from viewRoles) or by title
// within a role (legacy /tasks commands); the dashboard pins each to the task
// it names when the reply arrives (role-ref.ts pinTaskDeletes), so a task the
// same reply adds under that title is never the one deleted. A title never
// matches across roles, a task that isn't there is a failure — not "deleted" —
// and the card shows the task's title and role, never an id, even once the row
// is gone. The org's autonomy config decides whether Mr. Merchiva's deletes run
// at once or wait for a click (`confirm`); a command the user typed runs as typed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/geometric";
import { STATUS_TONE_CLASSES } from "@/components/ui/status-badge";
import { deleteRoleTask as execDeleteRoleTask } from "@/lib/spacetimedb/actions";
import { looksLikeId, storedId } from "@/lib/merchiva/action-ids";
import { cachedRoleTasks, cachedRoles, type CachedRole, type CachedRoleTask } from "@/lib/merchiva/role-cache";
import { resolveRoleRef, resolveTaskRef, roleRefLabel } from "@/lib/merchiva/role-ref";
import type { TaskDeleteCmd } from "@/lib/merchiva/skills/types";

type Status = "pending" | "confirm" | "deleting" | "deleted" | "failed" | "cancelled";
type Labels = { title: string | null; role: string | null };

export function TaskDeleteGroup({ deletes, storeRoles, storeTasks, alreadyExecuted, confirm, cancelled, onCancel }: {
  deletes: TaskDeleteCmd[];
  storeRoles: readonly CachedRole[];
  storeTasks: readonly CachedRoleTask[];
  alreadyExecuted?: boolean;
  // The autonomy gate proposes deleteRoleTask (medium risk) under the org's config.
  confirm: boolean;
  cancelled?: number[];
  onCancel?: (index: number) => void;
}) {
  const t = useT();
  const cancelledSet = useMemo(() => new Set(cancelled ?? []), [cancelled]);
  const [statuses, setStatuses] = useState<Record<number, Status>>({});
  // What the card showed before the row was deleted: afterwards nothing resolves.
  const [captured, setCaptured] = useState<Record<number, Labels>>({});
  // Decided once, when the reply arrives: a config that loads later doesn't
  // strand a card between "waiting for a click" and "running on its own".
  const [autoRun] = useState(() => !alreadyExecuted && !confirm);
  const autoRan = useRef(!autoRun);
  const storeRolesRef = useRef(storeRoles);
  const storeTasksRef = useRef(storeTasks);
  useEffect(() => {
    storeRolesRef.current = storeRoles;
    storeTasksRef.current = storeTasks;
  }, [storeRoles, storeTasks]);

  /** The task as the store has it now; else as pinned when the reply arrived; else as the block named it. */
  const labelsFor = useCallback((del: TaskDeleteCmd, roles: readonly CachedRole[], tasks: readonly CachedRoleTask[]): Labels => {
    const task = resolveTaskRef(tasks, roles, del);
    if (task) {
      return { title: String(task.title ?? "") || null, role: String(resolveRoleRef(roles, task.roleId)?.name ?? "") || null };
    }
    return {
      title: del.taskTitle || (del.title && !looksLikeId(del.title) ? del.title : null),
      role: del.roleName || roleRefLabel(roles, del),
    };
  }, []);

  const deleteOne = useCallback(async (i: number) => {
    const del = deletes[i];
    if (!del) return;
    setStatuses((prev) => ({ ...prev, [i]: "deleting" }));
    const roles = cachedRoles(storeRolesRef.current);
    const tasks = cachedRoleTasks(storeTasksRef.current);
    const task = resolveTaskRef(tasks, roles, del);
    if (!task) {
      console.warn("[TaskDeleteGroup] Task not found");
      setStatuses((prev) => ({ ...prev, [i]: "failed" }));
      return;
    }
    setCaptured((prev) => ({ ...prev, [i]: labelsFor(del, roles, tasks) }));
    try {
      // The module matches `id.toString()`: the hyphenated form.
      await execDeleteRoleTask(storedId(task.id));
      setStatuses((prev) => ({ ...prev, [i]: "deleted" }));
    } catch (err) {
      console.error("[TaskDeleteGroup] Failed to delete task:", err);
      setStatuses((prev) => ({ ...prev, [i]: "failed" }));
    }
  }, [deletes, labelsFor]);

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    (async () => {
      for (let i = 0; i < deletes.length; i++) {
        if (!cancelledSet.has(i)) await deleteOne(i);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = (i: number) => {
    setStatuses((prev) => ({ ...prev, [i]: "cancelled" }));
    onCancel?.(i);
  };

  /** A delete this session hasn't run: as the store has it (restored reply), or waiting. */
  const statusOf = (i: number, del: TaskDeleteCmd): Status => {
    if (statuses[i]) return statuses[i];
    if (cancelledSet.has(i)) return "cancelled";
    if (alreadyExecuted) return resolveTaskRef(storeTasks, storeRoles, del) ? "confirm" : "deleted";
    return autoRun ? "pending" : "confirm";
  };

  return (
    <>
      {deletes.map((del, i) => {
        const status = statusOf(i, del);
        const labels = captured[i] ?? labelsFor(del, storeRoles, storeTasks);
        return (
          <div key={`del-${i}`} className={cn(
            "rounded-lg border p-3 mt-2",
            status === "deleted" ? "border-destructive/30 bg-destructive/5" :
            status === "failed" ? "border-amber-200 bg-amber-50/50" :
            "border-border bg-muted/40"
          )}>
            <div className="flex items-center gap-2">
              <span className={cn("h-5 px-1.5 rounded inline-flex items-center gap-1 border", STATUS_TONE_CLASSES.danger)}>
                <Trash2 className="h-[10px] w-[10px]" />
                <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">{t("merchiva.taskDelete.tag")}</span>
              </span>
              <span className="text-[12px] font-medium truncate">{labels.title ?? t("merchiva.refs.unknownTask")}</span>
              {labels.role && <span className="text-[11px] text-muted-foreground truncate">← {labels.role}</span>}
              {status === "deleting" && (
                <span className="text-[10.5px] font-mono text-muted-foreground inline-flex items-center gap-1 ml-auto">
                  <Spinner size={12} /> {t("merchiva.status.deleting")}
                </span>
              )}
              {status === "deleted" && (
                <span className="text-[10.5px] font-mono text-destructive inline-flex items-center gap-1 ml-auto">
                  <Check className="h-3 w-3" /> {t("merchiva.status.deleted")}
                </span>
              )}
              {status === "failed" && (
                <span className="text-[10.5px] font-mono text-amber-600 ml-auto">{t("merchiva.taskDelete.failed")}</span>
              )}
              {status === "cancelled" && (
                <span className="text-[10.5px] font-mono text-muted-foreground ml-auto">{t("merchiva.status.cancelled")}</span>
              )}
            </div>
            {status === "confirm" && (
              <div className="flex items-center gap-2 mt-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteOne(i)}
                  className="px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" /> {t("common.delete")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleCancel(i)} className="px-3 text-muted-foreground">
                  <X className="h-3 w-3" /> {t("merchiva.ui.cancel")}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
