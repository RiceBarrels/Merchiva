"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "../use-admin-query";
import { DataTable, ErrorBanner, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "../ui";
import {
  Field,
  FormActions,
  FormRow,
  IdCell,
  StatusBadge,
  fromLocalInput,
  orgQuery,
  toInt,
  toLocalInput,
  useAction,
  useMultiQuery,
  useOrgMembers,
} from "./shared";
import type { RoleTaskAssignmentRow, RoleTaskRow, StaffMemberRow, StaffRoleRow } from "./types";

interface RoleForm {
  name: string;
  color: string;
  icon: string;
  description: string;
  permissions: string;
}
const emptyRole: RoleForm = { name: "", color: "#57534e", icon: "user", description: "", permissions: "{}" };

interface TaskForm {
  roleId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  sortOrder: string;
  requiresEvidence: boolean;
  notifyChats: string;
}
const emptyTask: TaskForm = { roleId: "", title: "", description: "", startTime: "", endTime: "", sortOrder: "0", requiresEvidence: false, notifyChats: "[]" };

export function RolesTab({ orgId }: { orgId: string }) {
  const roles = useAdminQuery<StaffRoleRow>(orgQuery("staff_role", orgId));
  const staff = useAdminQuery<StaffMemberRow>(orgQuery("staff_member", orgId));
  const members = useOrgMembers(orgId);
  const assignments = useAdminQuery<RoleTaskAssignmentRow>(orgQuery("role_task_assignment", orgId));
  const action = useAction();

  const sortedRoles = useMemo(() => [...roles.rows].sort((a, b) => a.name.localeCompare(b.name)), [roles.rows]);
  const roleById = useMemo(() => new Map(sortedRoles.map((r) => [r.id, r])), [sortedRoles]);

  // role_task.organization_id is an option column; query per role id instead.
  const taskQueries = useMemo(() => sortedRoles.map((r) => `SELECT * FROM role_task WHERE role_id = ${sqlString(r.id)}`), [sortedRoles]);
  const tasks = useMultiQuery<RoleTaskRow>(taskQueries);
  const sortedTasks = useMemo(
    () =>
      [...tasks.rows].sort((a, b) => {
        const ra = roleById.get(a.roleId)?.name ?? "";
        const rb = roleById.get(b.roleId)?.name ?? "";
        return ra.localeCompare(rb) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
      }),
    [tasks.rows, roleById],
  );
  const taskById = useMemo(() => new Map(sortedTasks.map((t) => [t.id, t])), [sortedTasks]);
  const staffById = useMemo(() => new Map(staff.rows.map((s) => [s.id, s])), [staff.rows]);

  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRole);
  const [roleEditing, setRoleEditing] = useState<StaffRoleRow | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);

  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTask);
  const [taskEditing, setTaskEditing] = useState<RoleTaskRow | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);

  const [assignTask, setAssignTask] = useState("");
  const [assignMember, setAssignMember] = useState("");
  const [assignDue, setAssignDue] = useState(() => toLocalInput(Date.now() + 60 * 60 * 1000));
  const [assignFilter, setAssignFilter] = useState<string>("all");

  // ── Roles ──────────────────────────────────────────────────────────────────
  async function submitRole(e: React.FormEvent) {
    e.preventDefault();
    const args = { organizationId: orgId, ...roleForm, name: roleForm.name.trim() };
    const ok = roleEditing
      ? await action.run("role", () => adminCall("updateStaffRole", { ...args, roleId: roleEditing.id }), { after: roles.reload })
      : await action.run("role", () => adminCall("addStaffRole", args), { after: roles.reload });
    if (ok) {
      setRoleEditing(null);
      setRoleOpen(false);
      setRoleForm(emptyRole);
    }
  }

  function removeRole(r: StaffRoleRow) {
    void action.run(`delrole:${r.id}`, () => adminCall("deleteStaffRole", { organizationId: orgId, roleId: r.id }), {
      confirm: `Delete role "${r.name}"? Its role tasks are deleted too.`,
      after: () => {
        roles.reload();
        tasks.reload();
      },
    });
  }

  const roleCols: Column<StaffRoleRow>[] = [
    {
      key: "name",
      header: "Role",
      render: (r) => (
        <span className="inline-flex items-center gap-2 font-medium">
          <span className="inline-block h-3 w-3 border border-stone-300" style={{ backgroundColor: r.color }} />
          {r.name}
        </span>
      ),
    },
    { key: "icon", header: "Icon", className: "font-mono text-stone-600" },
    { key: "description", header: "Description", className: "text-stone-600" },
    {
      key: "permissions",
      header: "Permissions",
      render: (r) => (
        <code className="block max-w-[240px] truncate font-mono text-[11px] text-stone-500" title={r.permissions}>
          {r.permissions}
        </code>
      ),
    },
    { key: "tasks", header: "Tasks", className: "font-mono", render: (r) => String(sortedTasks.filter((t) => t.roleId === r.id).length) },
    { key: "id", header: "Id", render: (r) => <IdCell id={r.id} /> },
    { key: "updatedAt", header: "Updated", className: "text-stone-500", render: (r) => formatTs(r.updatedAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <span className="inline-flex gap-1.5">
          <button
            type="button"
            className={btnGhostCls}
            onClick={() => {
              setRoleEditing(r);
              setRoleOpen(true);
              setRoleForm({ name: r.name, color: r.color, icon: r.icon, description: r.description, permissions: r.permissions });
            }}
          >
            Edit
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy === `delrole:${r.id}`} onClick={() => removeRole(r)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  // ── Tasks ──────────────────────────────────────────────────────────────────
  async function submitTask(e: React.FormEvent) {
    e.preventDefault();
    const args = {
      organizationId: orgId,
      title: taskForm.title.trim(),
      description: taskForm.description,
      startTime: taskForm.startTime || null,
      endTime: taskForm.endTime || null,
      sortOrder: toInt(taskForm.sortOrder),
      requiresEvidence: taskForm.requiresEvidence,
      notifyChats: taskForm.notifyChats || "[]",
    };
    const ok = taskEditing
      ? await action.run("task", () => adminCall("updateRoleTask", { ...args, roleTaskId: taskEditing.id }), { after: tasks.reload })
      : await action.run("task", () => adminCall("addRoleTask", { ...args, roleId: taskForm.roleId }), { after: tasks.reload });
    if (ok) {
      setTaskEditing(null);
      setTaskOpen(false);
      setTaskForm(emptyTask);
    }
  }

  function removeTask(t: RoleTaskRow) {
    void action.run(`deltask:${t.id}`, () => adminCall("deleteRoleTask", { organizationId: orgId, roleTaskId: t.id }), {
      confirm: `Delete role task "${t.title}"?`,
      after: tasks.reload,
    });
  }

  const taskCols: Column<RoleTaskRow>[] = [
    { key: "role", header: "Role", render: (t) => roleById.get(t.roleId)?.name ?? <IdCell id={t.roleId} /> },
    { key: "title", header: "Title", render: (t) => <span className="font-medium">{t.title}</span> },
    { key: "description", header: "Description", className: "max-w-[280px] text-stone-600" },
    { key: "window", header: "Window", className: "font-mono", render: (t) => (t.startTime || t.endTime ? `${t.startTime ?? "…"} – ${t.endTime ?? "…"}` : "—") },
    { key: "sortOrder", header: "Order", className: "font-mono" },
    { key: "requiresEvidence", header: "Evidence", render: (t) => (t.requiresEvidence ? "required" : "—") },
    { key: "notifyChats", header: "Notify", render: (t) => <code className="font-mono text-[11px] text-stone-500">{t.notifyChats}</code> },
    { key: "id", header: "Id", render: (t) => <IdCell id={t.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (t) => (
        <span className="inline-flex gap-1.5">
          <button
            type="button"
            className={btnGhostCls}
            onClick={() => {
              setTaskEditing(t);
              setTaskOpen(true);
              setTaskForm({
                roleId: t.roleId,
                title: t.title,
                description: t.description,
                startTime: t.startTime ?? "",
                endTime: t.endTime ?? "",
                sortOrder: String(t.sortOrder),
                requiresEvidence: t.requiresEvidence,
                notifyChats: t.notifyChats,
              });
            }}
          >
            Edit
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy === `deltask:${t.id}`} onClick={() => removeTask(t)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  // ── Assignments ────────────────────────────────────────────────────────────
  const filteredAssignments = useMemo(() => {
    const list = assignFilter === "all" ? assignments.rows : assignments.rows.filter((a) => a.status === assignFilter);
    return [...list].sort((a, b) => b.dueAt - a.dueAt);
  }, [assignments.rows, assignFilter]);

  function assigneeName(id: string): string {
    if (!id) return "—";
    return staffById.get(id)?.name ?? members.byId.get(id)?.displayName ?? id;
  }

  async function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    const dueAt = fromLocalInput(assignDue);
    if (dueAt === null) {
      action.setError("Pick a valid due time");
      return;
    }
    await action.run("assign", () => adminCall("assignRoleTask", { organizationId: orgId, taskId: assignTask, memberId: assignMember, dueAt }), {
      after: assignments.reload,
    });
  }

  const assignCols: Column<RoleTaskAssignmentRow>[] = [
    { key: "task", header: "Task", render: (a) => taskById.get(a.taskId)?.title ?? <IdCell id={a.taskId} /> },
    { key: "member", header: "Assignee", render: (a) => assigneeName(a.memberId) },
    { key: "dueAt", header: "Due", className: "text-stone-600", render: (a) => formatTs(a.dueAt) },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
    { key: "completedAt", header: "Completed", className: "text-stone-600", render: (a) => formatTs(a.completedAt) },
    { key: "note", header: "Note / reason", className: "max-w-[220px] text-stone-600", render: (a) => a.skipReason ?? a.note ?? "—" },
    {
      key: "evidence",
      header: "Evidence",
      render: (a) =>
        a.evidenceUrl ? (
          <a href={a.evidenceUrl} target="_blank" rel="noreferrer" className="underline">
            open
          </a>
        ) : a.evidenceUrls ? (
          <code className="font-mono text-[11px] text-stone-500">{a.evidenceUrls.length > 30 ? `${a.evidenceUrls.slice(0, 30)}…` : a.evidenceUrls}</code>
        ) : (
          "—"
        ),
    },
    { key: "id", header: "Id", render: (a) => <IdCell id={a.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (a) => (
        <span className="inline-flex gap-1.5">
          {a.status === "pending" && (
            <>
              <button
                type="button"
                className={btnGhostCls}
                disabled={action.busy === `complete:${a.id}`}
                onClick={() =>
                  void action.run(
                    `complete:${a.id}`,
                    () => adminCall("completeRoleTask", { organizationId: orgId, assignmentId: a.id, evidenceUrl: null, note: "Completed from admin console", evidenceUrls: null }),
                    { after: assignments.reload },
                  )
                }
              >
                Complete
              </button>
              <button
                type="button"
                className={btnGhostCls}
                disabled={action.busy === `skip:${a.id}`}
                onClick={() => {
                  const reason = window.prompt("Skip reason (optional)") ?? "";
                  void action.run(`skip:${a.id}`, () => adminCall("skipRoleTask", { organizationId: orgId, assignmentId: a.id, reason: reason || null }), {
                    after: assignments.reload,
                  });
                }}
              >
                Skip
              </button>
            </>
          )}
          <button
            type="button"
            className={btnDangerCls}
            disabled={action.busy === `delassign:${a.id}`}
            onClick={() =>
              void action.run(`delassign:${a.id}`, () => adminCall("deleteRoleTaskAssignment", { organizationId: orgId, assignmentId: a.id }), {
                confirm: "Delete this assignment row?",
                after: assignments.reload,
              })
            }
          >
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Panel
        title={`Roles (staff_role) · ${sortedRoles.length}`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={roles.reload}>
              Refresh
            </button>
            <button
              type="button"
              className={btnCls}
              onClick={() => {
                setRoleEditing(null);
                setRoleForm(emptyRole);
                setRoleOpen(true);
              }}
            >
              Add role
            </button>
          </>
        }
      >
        <ErrorBanner message={roles.error ?? action.error} />
        <DataTable columns={roleCols} rows={sortedRoles} loading={roles.loading} rowKey={(r) => r.id} empty="No roles defined" />
        {roleOpen && (
          <form onSubmit={submitRole}>
            <FormRow>
              <Field label="Name">
                <input className={inputCls} value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} required />
              </Field>
              <Field label="Color">
                <div className="flex gap-1.5">
                  <input type="color" className="h-8 w-10 border border-stone-300 bg-white p-0.5" value={roleForm.color} onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })} />
                  <input className={`${inputCls} font-mono`} value={roleForm.color} onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })} />
                </div>
              </Field>
              <Field label="Icon (lucide name)">
                <input className={`${inputCls} font-mono`} value={roleForm.icon} onChange={(e) => setRoleForm({ ...roleForm, icon: e.target.value })} />
              </Field>
              <Field label="Description">
                <input className={inputCls} value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
              </Field>
              <Field label="Permissions (JSON)" className="md:col-span-4">
                <input className={`${inputCls} font-mono`} value={roleForm.permissions} onChange={(e) => setRoleForm({ ...roleForm, permissions: e.target.value })} />
              </Field>
            </FormRow>
            <FormActions>
              <button type="submit" className={btnCls} disabled={action.busy === "role"}>
                {action.busy === "role" ? "Saving…" : roleEditing ? "Update role" : "Add role"}
              </button>
              <button type="button" className={btnGhostCls} onClick={() => setRoleOpen(false)}>
                Cancel
              </button>
            </FormActions>
          </form>
        )}
      </Panel>

      <Panel
        title={`Role tasks (role_task) · ${sortedTasks.length}`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={tasks.reload}>
              Refresh
            </button>
            <button
              type="button"
              className={btnCls}
              disabled={sortedRoles.length === 0}
              onClick={() => {
                setTaskEditing(null);
                setTaskForm({ ...emptyTask, roleId: sortedRoles[0]?.id ?? "" });
                setTaskOpen(true);
              }}
            >
              Add task
            </button>
          </>
        }
      >
        <ErrorBanner message={tasks.error} />
        <DataTable columns={taskCols} rows={sortedTasks} loading={tasks.loading || roles.loading} rowKey={(t) => t.id} empty="No role tasks" />
        {taskOpen && (
          <form onSubmit={submitTask}>
            <FormRow>
              <Field label="Role">
                <select className={inputCls} value={taskForm.roleId} disabled={taskEditing !== null} onChange={(e) => setTaskForm({ ...taskForm, roleId: e.target.value })} required>
                  {sortedRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title">
                <input className={inputCls} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
              </Field>
              <Field label="Description" className="md:col-span-2">
                <input className={inputCls} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
              </Field>
              <Field label="Start time">
                <input className={inputCls} type="time" value={taskForm.startTime} onChange={(e) => setTaskForm({ ...taskForm, startTime: e.target.value })} />
              </Field>
              <Field label="End time">
                <input className={inputCls} type="time" value={taskForm.endTime} onChange={(e) => setTaskForm({ ...taskForm, endTime: e.target.value })} />
              </Field>
              <Field label="Sort order">
                <input className={inputCls} type="number" value={taskForm.sortOrder} onChange={(e) => setTaskForm({ ...taskForm, sortOrder: e.target.value })} />
              </Field>
              <Field label="Notify chats (JSON)">
                <input className={`${inputCls} font-mono`} value={taskForm.notifyChats} onChange={(e) => setTaskForm({ ...taskForm, notifyChats: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-[12px] md:col-span-4">
                <input type="checkbox" checked={taskForm.requiresEvidence} onChange={(e) => setTaskForm({ ...taskForm, requiresEvidence: e.target.checked })} />
                Requires photo evidence
              </label>
            </FormRow>
            <FormActions>
              <button type="submit" className={btnCls} disabled={action.busy === "task"}>
                {action.busy === "task" ? "Saving…" : taskEditing ? "Update task" : "Add task"}
              </button>
              <button type="button" className={btnGhostCls} onClick={() => setTaskOpen(false)}>
                Cancel
              </button>
            </FormActions>
          </form>
        )}
      </Panel>

      <Panel
        title={`Task assignments (role_task_assignment) · ${filteredAssignments.length}`}
        actions={
          <>
            <select className={`${inputCls} w-auto py-1`} value={assignFilter} onChange={(e) => setAssignFilter(e.target.value)}>
              <option value="all">all statuses</option>
              <option value="pending">pending</option>
              <option value="completed">completed</option>
              <option value="skipped">skipped</option>
            </select>
            <button type="button" className={btnGhostCls} onClick={assignments.reload}>
              Refresh
            </button>
          </>
        }
      >
        <ErrorBanner message={assignments.error ?? staff.error} />
        <form onSubmit={submitAssign}>
          <FormRow>
            <Field label="Task">
              <select className={inputCls} value={assignTask} onChange={(e) => setAssignTask(e.target.value)} required>
                <option value="">— task —</option>
                {sortedTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {roleById.get(t.roleId)?.name ?? "?"} · {t.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assignee (staff_member)">
              <select className={inputCls} value={assignMember} onChange={(e) => setAssignMember(e.target.value)} required>
                <option value="">— staff member —</option>
                {[...staff.rows]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Due at">
              <input className={inputCls} type="datetime-local" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} required />
            </Field>
            <div className="flex items-end">
              <button type="submit" className={btnCls} disabled={action.busy === "assign" || !assignTask || !assignMember}>
                {action.busy === "assign" ? "Assigning…" : "Assign task"}
              </button>
            </div>
          </FormRow>
        </form>
        <DataTable columns={assignCols} rows={filteredAssignments} loading={assignments.loading} rowKey={(a) => a.id} empty="No assignments" />
        <div className="border-t border-stone-200 px-4 py-2 text-[12px] text-stone-500">
          assignRoleTask validates the assignee against staff_member (legacy roster), so only that table is offered here.
        </div>
      </Panel>
    </div>
  );
}
