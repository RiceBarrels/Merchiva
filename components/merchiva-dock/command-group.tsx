"use client";

// Runs the addRole / addRoleTask blocks of one Mr. Merchiva reply: creates the
// roles, then adds each task to its role, one card per item.
//
// A task names its role by id (the model's roleId, from viewRoles) or by name
// (legacy /tasks commands, older replies — whose `role` may also hold an id).
// Both resolve through role-ref.ts, in either id form, and the task is written
// with the role's stored (hyphenated) id: rows written as 32-hex were invisible
// to every task reader, on /manager, /store and /personal alike.
//
// Card state lives here for the session only. A reply restored from history
// shows each item as the store has it now (role_task rows), not as "added".
//
// A reply that rearranges a role's tasks deletes the old 开店准备 and adds a new
// one. The tasks it deletes (`deletes`, pinned to their ids when it arrived)
// are about to go, so they never count as "already there": the replacement is
// inserted, and its card never reports a row the delete card then removes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import {
  addRoleTask as execAddRoleTask,
  addStaffRole as execAddStaffRole,
  deleteRoleTask as execDeleteRoleTask,
  deleteStaffRole as execDeleteStaffRole,
} from "@/lib/spacetimedb/actions";
import { isUuidRef, storedId } from "@/lib/merchiva/action-ids";
import { cachedRoleTasks, cachedRoles, type CachedRole, type CachedRoleTask } from "@/lib/merchiva/role-cache";
import { excludeTasks, findRoleTask, resolveRoleRef, resolveRoleRefs, roleRefLabel } from "@/lib/merchiva/role-ref";
import type { RoleAddCmd, TaskAddCmd, TaskDeleteCmd } from "@/lib/merchiva/skills/types";
import {
  RoleAddCard,
  TaskAddCard,
  type RoleCardStatus,
  type TaskCardFailure,
  type TaskCardStatus,
} from "@/components/merchiva-dock/task-cards";

// `withEvidence`: what an add this session stored, for the card's evidence badge.
type TaskState = { status: TaskCardStatus; failure?: TaskCardFailure; withEvidence?: boolean };

const ROLE_WAIT_TRIES = 15;
const ROLE_WAIT_MS = 400;

function roleRefs(task: TaskAddCmd): unknown[] {
  return [task.roleId, task.role];
}

const NO_DELETES: readonly TaskDeleteCmd[] = [];

export function CommandGroup({ roles, tasks, deletes = NO_DELETES, storeRoles, storeTasks, groupChats, alreadyExecuted, rejectedRoles, rejectedTasks, onRejectRole, onRejectTask }: {
  roles?: RoleAddCmd[];
  tasks?: TaskAddCmd[];
  // The same reply's deleteRoleTask blocks.
  deletes?: readonly TaskDeleteCmd[];
  // The org's staff_role / role_task rows as rendered; the async steps read the
  // client cache (role-cache.ts), which is ahead of them right after a write.
  storeRoles: readonly CachedRole[];
  storeTasks: readonly CachedRoleTask[];
  groupChats: Array<{ id: string; name: string }>;
  alreadyExecuted?: boolean;
  rejectedRoles?: number[];
  rejectedTasks?: number[];
  onRejectRole?: (index: number) => void;
  onRejectTask?: (index: number) => void;
}) {
  const t = useT();
  const safeRoles = useMemo(() => roles ?? [], [roles]);
  const safeTasks = useMemo(() => tasks ?? [], [tasks]);
  const rejRoles = useMemo(() => new Set(rejectedRoles ?? []), [rejectedRoles]);
  const rejTasks = useMemo(() => new Set(rejectedTasks ?? []), [rejectedTasks]);
  const replaced = useMemo(() => deletes.map((d) => d.taskId).filter((id): id is string => !!id), [deletes]);

  // Only items touched in this session have state; the rest derive theirs.
  const [roleStatuses, setRoleStatuses] = useState<Record<number, RoleCardStatus>>({});
  const [taskStates, setTaskStates] = useState<Record<number, TaskState>>({});
  const [taskChats, setTaskChats] = useState<Record<number, string[]>>({});
  const autoRan = useRef(!!alreadyExecuted);
  const storeRolesRef = useRef(storeRoles);
  const storeTasksRef = useRef(storeTasks);
  useEffect(() => {
    storeRolesRef.current = storeRoles;
    storeTasksRef.current = storeTasks;
  }, [storeRoles, storeTasks]);

  const liveRoles = useCallback(() => cachedRoles(storeRolesRef.current), []);
  // Never the tasks this reply deletes: they are on their way out.
  const liveTasks = useCallback(() => excludeTasks(cachedRoleTasks(storeTasksRef.current), replaced), [replaced]);
  const shownTasks = useMemo(() => excludeTasks(storeTasks, replaced), [storeTasks, replaced]);
  const setTask = useCallback((i: number, state: TaskState) => {
    setTaskStates((prev) => ({ ...prev, [i]: state }));
  }, []);

  /** "Staff" — or, when the ref names no role, the name asked for, else "unknown role". Never an id. */
  const roleLabel = useCallback(
    (task: TaskAddCmd, rows: readonly CachedRole[]) =>
      roleRefLabel(rows, task) ?? t("merchiva.refs.unknownRole"),
    [t],
  );

  const failRoleNotFound = useCallback((i: number, task: TaskAddCmd) => {
    console.error(`[CommandGroup] Role not found for task "${task.title}"`);
    toast.error(t("merchiva.command.roleNotFound").replace("{role}", roleLabel(task, liveRoles())));
    setTask(i, { status: "failed", failure: "roleNotFound" });
  }, [t, roleLabel, liveRoles, setTask]);

  /**
   * The task's role. A name this reply is also creating may take a moment to
   * reach the cache, so that one is waited for; an id, or a name the store
   * simply lacks, fails at once.
   */
  const waitForRole = useCallback(async (task: TaskAddCmd): Promise<CachedRole | undefined> => {
    let role = resolveRoleRefs(liveRoles(), roleRefs(task));
    const pending = !!task.role && !isUuidRef(task.role)
      && safeRoles.some((r) => r.title.trim().toLowerCase() === task.role.trim().toLowerCase());
    for (let attempt = 0; !role && pending && attempt < ROLE_WAIT_TRIES; attempt++) {
      await new Promise((r) => setTimeout(r, ROLE_WAIT_MS));
      role = resolveRoleRefs(liveRoles(), roleRefs(task));
    }
    return role;
  }, [liveRoles, safeRoles]);

  /** Adds task `i` to `role` unless the role already has it. */
  const addTask = useCallback(async (i: number, role: CachedRole, withEvidence: boolean, chats: string[]) => {
    const task = safeTasks[i];
    const existing = findRoleTask(liveTasks(), role.id, task.title);
    if (existing) {
      setTask(i, { status: "added", withEvidence: Boolean(existing.requiresEvidence) });
      return;
    }
    try {
      await execAddRoleTask({
        roleId: storedId(role.id),
        title: task.title,
        description: task.des,
        startTime: task.startTime,
        endTime: task.endTime,
        sortOrder: i,
        requiresEvidence: withEvidence,
        notifyChats: withEvidence ? chats : [],
      });
      setTask(i, { status: "added", withEvidence });
    } catch (err) {
      console.error(`[CommandGroup] Failed to add task "${task.title}":`, err);
      toast.error(t("merchiva.command.addTaskFailed"));
      setTask(i, { status: "failed", failure: "addFailed" });
    }
  }, [safeTasks, liveTasks, setTask, t]);

  /** Resolve the role, then add the task — or park it for its evidence channel. */
  const runTask = useCallback(async (i: number) => {
    const task = safeTasks[i];
    if (!task) return;
    setTask(i, { status: "adding" });
    const role = await waitForRole(task);
    if (!role) {
      failRoleNotFound(i, task);
      return;
    }
    if (task.requiresEvidence) {
      setTask(i, { status: "needs-chat" });
      return;
    }
    await addTask(i, role, false, []);
  }, [safeTasks, setTask, waitForRole, failRoleNotFound, addTask]);

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;

    (async () => {
      // Step 1: create roles sequentially
      for (let i = 0; i < safeRoles.length; i++) {
        if (rejRoles.has(i)) continue;
        const role = safeRoles[i];
        setRoleStatuses((prev) => ({ ...prev, [i]: "adding" }));
        try {
          if (!resolveRoleRef(liveRoles(), role.title)) {
            await execAddStaffRole({
              name: role.title,
              color: role.color,
              icon: role.icon,
              description: role.des,
              permissions: JSON.stringify([]),
            });
          }
          for (let attempt = 0; attempt < ROLE_WAIT_TRIES; attempt++) {
            if (resolveRoleRef(liveRoles(), role.title)) break;
            await new Promise((r) => setTimeout(r, ROLE_WAIT_MS));
          }
          setRoleStatuses((prev) => ({ ...prev, [i]: "added" }));
        } catch (err) {
          console.error(`[CommandGroup] Failed to create role "${role.title}":`, err);
          setRoleStatuses((prev) => ({ ...prev, [i]: "not-added" }));
        }
      }

      // Step 2: add tasks, one after another.
      for (let i = 0; i < safeTasks.length; i++) {
        if (rejTasks.has(i)) continue;
        await runTask(i);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirmTask = useCallback(async (i: number, withEvidence: boolean) => {
    const task = safeTasks[i];
    if (!task) return;
    const selected = taskChats[i] ?? [];
    // Photo proof goes to at least one group channel; without one, add it without proof.
    if (withEvidence && selected.length === 0) return;
    setTask(i, { status: "adding" });
    const role = resolveRoleRefs(liveRoles(), roleRefs(task));
    if (!role) {
      failRoleNotFound(i, task);
      return;
    }
    await addTask(i, role, withEvidence, selected);
  }, [safeTasks, taskChats, setTask, liveRoles, failRoleNotFound, addTask]);

  const handleDeleteRole = useCallback(async (i: number) => {
    const role = safeRoles[i];
    if (!role) return;
    setRoleStatuses((prev) => ({ ...prev, [i]: "deleting" }));
    try {
      const found = resolveRoleRef(liveRoles(), role.title);
      // The module looks the role up by `id.toString()`: the hyphenated form.
      if (found) await execDeleteStaffRole(storedId(found.id));
      setRoleStatuses((prev) => ({ ...prev, [i]: "rejected" }));
      onRejectRole?.(i);
    } catch (err) {
      console.error(`[CommandGroup] Failed to delete role "${role.title}":`, err);
      toast.error(t("merchiva.command.deleteRoleFailed"));
      setRoleStatuses((prev) => ({ ...prev, [i]: "added" }));
    }
  }, [safeRoles, liveRoles, onRejectRole, t]);

  /** Skip (not added yet) or Delete (added): removes the task only from its own role. */
  const handleDeleteTask = useCallback(async (i: number, current: TaskCardStatus) => {
    const task = safeTasks[i];
    if (!task) return;
    if (current !== "added") {
      setTask(i, { status: "rejected" });
      onRejectTask?.(i);
      return;
    }
    setTask(i, { status: "deleting" });
    const role = resolveRoleRefs(liveRoles(), roleRefs(task));
    const dbTask = role ? findRoleTask(liveTasks(), role.id, task.title) : undefined;
    if (!dbTask) {
      toast.error(t("merchiva.tasks.deleteFailed"));
      setTask(i, role ? { status: "failed", failure: "notAdded" } : { status: "failed", failure: "roleNotFound" });
      return;
    }
    try {
      await execDeleteRoleTask(storedId(dbTask.id));
      setTask(i, { status: "rejected" });
      onRejectTask?.(i);
    } catch (err) {
      console.error(`[CommandGroup] Failed to delete task "${task.title}":`, err);
      toast.error(t("merchiva.tasks.deleteFailed"));
      setTask(i, { status: "added" });
    }
  }, [safeTasks, setTask, liveRoles, liveTasks, onRejectTask, t]);

  const toggleTaskChat = useCallback((i: number, chatId: string) => {
    setTaskChats((prev) => {
      const current = prev[i] ?? [];
      const next = current.includes(chatId)
        ? current.filter((id) => id !== chatId)
        : [...current, chatId];
      return { ...prev, [i]: next };
    });
  }, []);

  /** An item this session hasn't touched: as the store has it (restored reply) or waiting its turn. */
  const roleStatusOf = (i: number, role: RoleAddCmd): RoleCardStatus => {
    if (roleStatuses[i]) return roleStatuses[i];
    if (rejRoles.has(i)) return "rejected";
    if (!alreadyExecuted) return "pending";
    return resolveRoleRef(storeRoles, role.title) ? "added" : "not-added";
  };
  const taskStateOf = (i: number, task: TaskAddCmd): TaskState => {
    if (taskStates[i]) return taskStates[i];
    if (rejTasks.has(i)) return { status: "rejected" };
    if (!alreadyExecuted) return { status: "pending" };
    const role = resolveRoleRefs(storeRoles, roleRefs(task));
    if (!role) return { status: "failed", failure: "roleNotFound" };
    if (findRoleTask(shownTasks, role.id, task.title)) return { status: "added" };
    return task.requiresEvidence ? { status: "needs-chat" } : { status: "failed", failure: "notAdded" };
  };
  /** The evidence badge: as asked until the task is added, then as the store has it. */
  const evidenceOf = (task: TaskAddCmd, state: TaskState, role: CachedRole | undefined): boolean => {
    if (state.status !== "added") return task.requiresEvidence;
    const row = role ? findRoleTask(shownTasks, role.id, task.title) : undefined;
    return row ? Boolean(row.requiresEvidence) : state.withEvidence ?? task.requiresEvidence;
  };

  return (
    <>
      {safeRoles.map((role, i) => (
        <RoleAddCard
          key={`r-${i}`}
          role={role}
          status={roleStatusOf(i, role)}
          onDelete={() => handleDeleteRole(i)}
        />
      ))}
      {safeTasks.map((task, i) => {
        const state = taskStateOf(i, task);
        const matchedRole = resolveRoleRefs(storeRoles, roleRefs(task));
        return (
          <TaskAddCard
            key={`t-${i}`}
            task={task}
            roleName={roleLabel(task, storeRoles)}
            roleColor={typeof matchedRole?.color === "string" && matchedRole.color ? matchedRole.color : "#44403c"}
            evidence={evidenceOf(task, state, matchedRole)}
            status={state.status}
            failure={state.failure}
            groupChats={groupChats}
            selectedChats={taskChats[i] ?? []}
            onToggleChat={(chatId) => toggleTaskChat(i, chatId)}
            onConfirm={(withEvidence) => handleConfirmTask(i, withEvidence)}
            onRetry={() => runTask(i)}
            onDelete={() => handleDeleteTask(i, state.status)}
          />
        );
      })}
    </>
  );
}
