"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "../use-admin-query";
import { Badge, DataTable, ErrorBanner, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "../ui";
import { Field, FormActions, FormRow, IdCell, StatusBadge, money, orgQuery, toNum, useAction, useOrgMembers } from "./shared";
import type { StaffMemberRow, StaffRoleRow } from "./types";

interface StaffForm {
  name: string;
  role: string;
  hourlyRate: string;
  availability: string;
}

const emptyForm: StaffForm = { name: "", role: "", hourlyRate: "0", availability: "[]" };

export function StaffTab({ orgId }: { orgId: string }) {
  const members = useOrgMembers(orgId);
  const staff = useAdminQuery<StaffMemberRow>(orgQuery("staff_member", orgId));
  const roles = useAdminQuery<StaffRoleRow>(orgQuery("staff_role", orgId));
  const action = useAction();

  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [editing, setEditing] = useState<StaffMemberRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const memberByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of members.members) m.set(row.displayName.trim().toLowerCase(), row.id);
    return m;
  }, [members.members]);

  const sortedStaff = useMemo(() => [...staff.rows].sort((a, b) => a.name.localeCompare(b.name)), [staff.rows]);

  const roleNames = useMemo(() => roles.rows.map((r) => r.name).sort(), [roles.rows]);

  function startEdit(row: StaffMemberRow) {
    setShowAdd(false);
    setEditing(row);
    setForm({ name: row.name, role: row.role, hourlyRate: String(row.hourlyRate), availability: row.availability });
  }

  function startAdd() {
    setEditing(null);
    setShowAdd(true);
    setForm(emptyForm);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const base = { organizationId: orgId, name: form.name.trim(), role: form.role.trim(), hourlyRate: toNum(form.hourlyRate) };
    if (editing) {
      const ok = await action.run("save", () => adminCall("updateStaffMember", { ...base, staffMemberId: editing.id, availability: form.availability }), {
        after: staff.reload,
      });
      if (ok) setEditing(null);
    } else {
      const ok = await action.run("save", () => adminCall("addStaffMember", base), { after: staff.reload });
      if (ok) {
        setShowAdd(false);
        setForm(emptyForm);
      }
    }
  }

  function remove(row: StaffMemberRow) {
    void action.run(`del:${row.id}`, () => adminCall("deleteStaffMember", { organizationId: orgId, staffMemberId: row.id }), {
      confirm: `Delete staff member "${row.name}"? This cannot be undone.`,
      after: staff.reload,
    });
  }

  const staffCols: Column<StaffMemberRow>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "role", header: "Role" },
    { key: "hourlyRate", header: "Rate", className: "font-mono", render: (r) => money(r.hourlyRate) },
    {
      key: "availability",
      header: "Availability",
      render: (r) => (
        <code className="block max-w-[260px] truncate font-mono text-[11px] text-stone-500" title={r.availability}>
          {r.availability || "—"}
        </code>
      ),
    },
    {
      key: "member",
      header: "Linked member",
      render: (r) => {
        const id = memberByName.get(r.name.trim().toLowerCase());
        return id ? (
          <span className="inline-flex items-center gap-1.5">
            <Badge tone="ok">org_member</Badge>
            <IdCell id={id} />
          </span>
        ) : (
          <span className="text-stone-400">no name match</span>
        );
      },
    },
    { key: "id", header: "Id", render: (r) => <IdCell id={r.id} /> },
    { key: "updatedAt", header: "Updated", className: "text-stone-500", render: (r) => formatTs(r.updatedAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnGhostCls} onClick={() => startEdit(r)}>
            Edit
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy === `del:${r.id}`} onClick={() => remove(r)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  const memberCols: Column<(typeof members.members)[number]>[] = [
    { key: "displayName", header: "Name", render: (r) => <span className="font-medium">{r.displayName}</span> },
    { key: "email", header: "Email", className: "text-stone-600" },
    { key: "role", header: "Org role", render: (r) => <Badge tone={r.role === "owner" ? "ok" : "neutral"}>{r.role}</Badge> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "hourlyRate", header: "Rate", className: "font-mono", render: (r) => money(r.hourlyRate) },
    { key: "punchInCode", header: "Punch code", className: "font-mono", render: (r) => r.punchInCode ?? "—" },
    { key: "id", header: "Member id", render: (r) => <IdCell id={r.id} /> },
    { key: "userId", header: "Identity", render: (r) => <IdCell id={r.userId} /> },
    { key: "joinedAt", header: "Joined", className: "text-stone-500", render: (r) => formatTs(r.joinedAt) },
  ];

  const formOpen = showAdd || editing !== null;

  return (
    <div className="space-y-5">
      <Panel
        title={`Staff roster (staff_member) · ${sortedStaff.length}`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={staff.reload}>
              Refresh
            </button>
            <button type="button" className={btnCls} onClick={startAdd}>
              Add staff
            </button>
          </>
        }
      >
        <ErrorBanner message={staff.error ?? action.error} />
        <DataTable columns={staffCols} rows={sortedStaff} loading={staff.loading} rowKey={(r) => r.id} empty="No staff_member rows for this org" />
        {formOpen && (
          <form onSubmit={submit}>
            <FormRow>
              <Field label="Name">
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Role">
                <input className={inputCls} list="staff-role-names" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required />
                <datalist id="staff-role-names">
                  {roleNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
              <Field label="Hourly rate">
                <input className={inputCls} type="number" step="0.01" min="0" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
              </Field>
              {editing && (
                <Field label="Availability (JSON)">
                  <input className={`${inputCls} font-mono`} value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} />
                </Field>
              )}
            </FormRow>
            <FormActions>
              <button type="submit" className={btnCls} disabled={action.busy === "save"}>
                {action.busy === "save" ? "Saving…" : editing ? `Update ${editing.name}` : "Add staff member"}
              </button>
              <button
                type="button"
                className={btnGhostCls}
                onClick={() => {
                  setEditing(null);
                  setShowAdd(false);
                }}
              >
                Cancel
              </button>
              {editing && (
                <span className="font-mono text-[11px] text-stone-400">{editing.id}</span>
              )}
            </FormActions>
          </form>
        )}
      </Panel>

      <Panel
        title={`Team (org_member) · ${members.members.length}`}
        actions={
          <button type="button" className={btnGhostCls} onClick={members.reload}>
            Refresh
          </button>
        }
      >
        <ErrorBanner message={members.error} />
        <DataTable columns={memberCols} rows={members.members} loading={members.loading} rowKey={(r) => r.id} empty="No org_member rows" />
        <div className="border-t border-stone-200 px-4 py-2 text-[12px] text-stone-500">
          Member roles, status, rates and punch codes are edited from the Users / Organizations areas. Shifts and punches key on the org_member id shown here.
        </div>
      </Panel>
    </div>
  );
}
