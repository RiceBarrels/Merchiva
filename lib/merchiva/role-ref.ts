/**
 * Role and role-task references in Mr. Merchiva's task cards. Pure.
 *
 * Since the tool work in b44acf0 the model names a role by its id (viewRoles
 * roles[].id); older replies, the legacy /tasks commands and the tools-off
 * path name it by title, and saved chat history holds either — an id sometimes
 * sits in the `role` field that used to carry a name. Ids come hyphenated
 * (String(uuid), the form every reference column stores) or as 32 bare hex
 * digits (toHexString(), older replies and the dashboard's old writes), so they
 * are always compared canonically, and a uuid is never shown to a person.
 */

import { isUuidRef, looksLikeId, sameId, storedId } from "@/lib/merchiva/action-ids";

export interface RoleLike {
  id?: unknown;
  name?: unknown;
}

export interface RoleTaskLike {
  id?: unknown;
  roleId?: unknown;
  title?: unknown;
}

function text(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function lower(v: unknown): string {
  return text(v).toLowerCase();
}

/** The role `ref` names: by id (either form), else by trimmed, case-insensitive name. */
export function resolveRoleRef<R extends RoleLike>(roles: readonly R[], ref: unknown): R | undefined {
  const wanted = text(ref);
  if (!wanted) return undefined;
  return roles.find((r) => sameId(r.id, wanted)) ?? roles.find((r) => lower(r.name) === wanted.toLowerCase());
}

/** The first of `refs` that resolves; the model's roleId goes before the name it may also send. */
export function resolveRoleRefs<R extends RoleLike>(roles: readonly R[], refs: readonly unknown[]): R | undefined {
  for (const ref of refs) {
    const role = resolveRoleRef(roles, ref);
    if (role) return role;
  }
  return undefined;
}

/**
 * What a card shows for a role reference: the role's name; else the NAME the
 * block asked for (`role`) when the store has no such role. A `roleId` that
 * resolves to nothing is never shown, and neither is anything in `role` that
 * looks like an id (an old reply's uuid, a truncated one, "cashier-role-id").
 * Null means the caller shows its neutral "unknown role" label.
 */
export function roleRefLabel(roles: readonly RoleLike[], ref: { roleId?: unknown; role?: unknown }): string | null {
  const role = resolveRoleRefs(roles, [ref.roleId, ref.role]);
  if (role) return text(role.name) || null;
  const name = text(ref.role);
  return name && !looksLikeId(name) ? name : null;
}

/** A role's tasks, whatever form their roleId was stored in. */
export function tasksOfRole<T extends RoleTaskLike>(tasks: readonly T[], roleId: unknown): T[] {
  return tasks.filter((t) => sameId(t.roleId, roleId));
}

/** The role's task with this title (case-insensitive): adding it again would duplicate it. */
export function findRoleTask<T extends RoleTaskLike>(tasks: readonly T[], roleId: unknown, title: unknown): T | undefined {
  const wanted = lower(title);
  if (!wanted) return undefined;
  return tasks.find((t) => sameId(t.roleId, roleId) && lower(t.title) === wanted);
}

/**
 * The task a delete names: by its taskId, else by title within the named role.
 * A title never matches across roles — "Clean up" on another role is not this task.
 * Replies saved by b44acf0 hold the model's taskId in `title` (and no role),
 * so a uuid there is looked up as an id.
 */
export function resolveTaskRef<T extends RoleTaskLike, R extends RoleLike>(
  tasks: readonly T[],
  roles: readonly R[],
  ref: { taskId?: unknown; title?: unknown; roleId?: unknown; role?: unknown },
): T | undefined {
  const idRef = text(ref.taskId) || (isUuidRef(ref.title) ? text(ref.title) : "");
  if (idRef) {
    const byId = tasks.find((t) => sameId(t.id, idRef));
    if (byId) return byId;
  }
  const role = resolveRoleRefs(roles, [ref.roleId, ref.role]);
  return role ? findRoleTask(tasks, role.id, ref.title) : undefined;
}

/** `tasks` without the ones `ids` name (either form). */
export function excludeTasks<T extends RoleTaskLike>(tasks: readonly T[], ids: readonly unknown[]): T[] {
  return ids.length === 0 ? [...tasks] : tasks.filter((t) => !ids.some((id) => sameId(t.id, id)));
}

export interface TaskDeleteRef {
  role?: unknown;
  title?: unknown;
  roleId?: unknown;
  taskId?: string;
}

/** What pinning adds to a delete. */
export interface TaskDeletePin {
  taskId?: string;
  taskTitle?: string;
  roleName?: string;
}

/**
 * A reply's deletes, each pinned to the task it names when the reply arrives —
 * before anything in it runs: its stored id, title and role name. A delete by
 * title would otherwise resolve again at click time and could hit the same-titled
 * task the same reply adds ("rearrange the tasks": delete the old 开店准备, add a
 * new one); and once the row is gone, the card still names it. A delete that
 * names no task is left as it is (its card fails).
 */
export function pinTaskDeletes<D extends TaskDeleteRef, T extends RoleTaskLike, R extends RoleLike>(
  deletes: readonly D[],
  tasks: readonly T[],
  roles: readonly R[],
): Array<D & TaskDeletePin> {
  return deletes.map((del): D & TaskDeletePin => {
    const task = resolveTaskRef(tasks, roles, del);
    if (!task) return del;
    const taskTitle = text(task.title);
    const roleName = text(resolveRoleRef(roles, task.roleId)?.name);
    return {
      ...del,
      taskId: storedId(task.id),
      ...(taskTitle ? { taskTitle } : {}),
      ...(roleName ? { roleName } : {}),
    };
  });
}

