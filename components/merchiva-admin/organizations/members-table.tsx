"use client";

import { useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { ROLE_PERMISSION_DEFAULTS, type OrgMemberRow } from "./types";
import { fieldCls, labelCls, useAction } from "./use-action";

type Editor =
  | { kind: "permissions"; member: OrgMemberRow; role: string; json: string }
  | { kind: "rate"; member: OrgMemberRow; value: string }
  | { kind: "code"; member: OrgMemberRow; value: string };

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function MembersTable({
  orgId,
  members,
  loading,
  error,
  onChanged,
}: {
  orgId: string;
  members: OrgMemberRow[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const action = useAction(onChanged);
  const [editor, setEditor] = useState<Editor | null>(null);

  const sorted = [...members].sort((a, b) => {
    const rank = (r: string) => (r === "owner" ? 0 : r === "manager" ? 1 : 2);
    return rank(a.role) - rank(b.role) || a.displayName.localeCompare(b.displayName);
  });

  async function toggleStatus(m: OrgMemberRow) {
    const next = m.status === "active" ? "disabled" : "active";
    if (!window.confirm(`${next === "disabled" ? "Disable" : "Enable"} ${m.displayName || m.email}?`)) return;
    await action.run("setMemberStatus", { organizationId: orgId, memberId: m.id, status: next }, `Member ${next}`);
  }

  async function clearCode(m: OrgMemberRow) {
    if (!window.confirm(`Clear punch-in code for ${m.displayName || m.email}?`)) return;
    await action.run("setPunchInCode", { organizationId: orgId, memberId: m.id, code: null }, "Punch-in code cleared");
  }

  async function submitEditor(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    let ok = false;
    if (editor.kind === "permissions") {
      let compact: string;
      try {
        compact = JSON.stringify(JSON.parse(editor.json));
      } catch {
        action.setError("Permissions must be valid JSON");
        return;
      }
      ok = await action.run(
        "updateMemberPermissions",
        { organizationId: orgId, memberId: editor.member.id, role: editor.role, permissions: compact },
        "Role & permissions updated",
      );
    } else if (editor.kind === "rate") {
      const trimmed = editor.value.trim();
      const rate = trimmed === "" ? null : Number(trimmed);
      if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
        action.setError("Rate must be a non-negative number");
        return;
      }
      ok = await action.run("setMemberHourlyRate", { organizationId: orgId, memberId: editor.member.id, rate }, rate === null ? "Hourly rate cleared" : "Hourly rate updated");
    } else {
      const code = editor.value.trim();
      if (!/^[0-9]{4}$/.test(code)) {
        action.setError("Code must be exactly 4 digits");
        return;
      }
      ok = await action.run("setPunchInCode", { organizationId: orgId, memberId: editor.member.id, code }, "Punch-in code set");
    }
    if (ok) setEditor(null);
  }

  const columns: Column<OrgMemberRow>[] = [
    {
      key: "displayName",
      header: "Member",
      render: (m) => (
        <div>
          <div className="font-medium">{m.displayName || <span className="text-stone-400">(no name)</span>}</div>
          <div className="text-[11.5px] text-stone-500">{m.email}</div>
        </div>
      ),
    },
    { key: "role", header: "Role", render: (m) => <Badge tone={m.role === "owner" ? "ok" : "neutral"}>{m.role}</Badge> },
    { key: "status", header: "Status", render: (m) => <Badge tone={m.status === "active" ? "ok" : "danger"}>{m.status}</Badge> },
    { key: "hourlyRate", header: "Rate/h", className: "font-mono tabular-nums", render: (m) => (m.hourlyRate === null ? <span className="text-stone-300">—</span> : m.hourlyRate.toFixed(2)) },
    { key: "punchInCode", header: "Punch code", className: "font-mono" },
    { key: "joinedAt", header: "Joined", render: (m) => <span className="text-stone-600">{formatTs(m.joinedAt)}</span> },
    {
      key: "userId",
      header: "User / member id",
      render: (m) => (
        <div className="font-mono text-[10.5px] text-stone-500">
          <div title="user identity">{m.userId.slice(0, 16)}…</div>
          <div title="org_member id">{m.id}</div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (m) => {
        const isOwner = m.role === "owner";
        return (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <button
              type="button"
              className={btnGhostCls}
              disabled={isOwner || action.busy}
              title={isOwner ? "Owners cannot be modified by updateMemberPermissions" : undefined}
              onClick={() => setEditor({ kind: "permissions", member: m, role: m.role, json: prettyJson(m.permissions) })}
            >
              Role & perms
            </button>
            <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => setEditor({ kind: "rate", member: m, value: m.hourlyRate === null ? "" : String(m.hourlyRate) })}>
              Rate
            </button>
            <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => setEditor({ kind: "code", member: m, value: "" })}>
              Set code
            </button>
            {m.punchInCode && (
              <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => clearCode(m)}>
                Clear code
              </button>
            )}
            <button type="button" className={m.status === "active" ? btnDangerCls : btnGhostCls} disabled={action.busy} onClick={() => toggleStatus(m)}>
              {m.status === "active" ? "Disable" : "Enable"}
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <Panel title={`Members (${members.length})`}>
      <ErrorBanner message={error ?? action.error} />
      <Notice message={action.notice} />
      <DataTable columns={columns} rows={sorted} loading={loading} empty="No members" rowKey={(m) => m.id} />
      {editor && (
        <form onSubmit={submitEditor} className="border-t border-stone-200 bg-stone-50 px-4 py-3">
          <div className="mb-2 text-[12px] text-stone-600">
            {editor.kind === "permissions" && "Role & permissions for "}
            {editor.kind === "rate" && "Hourly rate for "}
            {editor.kind === "code" && "Punch-in code for "}
            <span className="font-medium text-stone-900">{editor.member.displayName || editor.member.email}</span>
          </div>
          {editor.kind === "permissions" && (
            <div className="grid gap-3 md:grid-cols-[200px_1fr]">
              <div className="space-y-3">
                <div className={fieldCls}>
                  <label className={labelCls}>Role</label>
                  <select className={inputCls} value={editor.role} onChange={(e) => setEditor({ ...editor, role: e.target.value })}>
                    <option value="manager">manager</option>
                    <option value="staff">staff</option>
                  </select>
                </div>
                <div className={fieldCls}>
                  <label className={labelCls}>Presets</label>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(ROLE_PERMISSION_DEFAULTS).map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={btnGhostCls}
                        onClick={() => setEditor({ ...editor, role, json: JSON.stringify(ROLE_PERMISSION_DEFAULTS[role], null, 2) })}
                      >
                        {role} defaults
                      </button>
                    ))}
                    <button type="button" className={btnGhostCls} onClick={() => setEditor({ ...editor, json: prettyJson(editor.member.permissions) })}>
                      reset
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-stone-500">
                  Sections: dashboard, inventory, sales, staffing, products, settings, pos, team, website, training_grading, merchiva, drive. Each has view and optionally edit / invite.
                </p>
              </div>
              <div className={fieldCls}>
                <label className={labelCls}>Permissions JSON</label>
                <textarea
                  className={`${inputCls} min-h-[220px] font-mono text-[12px]`}
                  value={editor.json}
                  onChange={(e) => setEditor({ ...editor, json: e.target.value })}
                  spellCheck={false}
                />
              </div>
            </div>
          )}
          {editor.kind === "rate" && (
            <div className={`${fieldCls} max-w-xs`}>
              <label className={labelCls}>Hourly rate (empty clears)</label>
              <input className={`${inputCls} font-mono`} type="number" min={0} step="0.01" value={editor.value} onChange={(e) => setEditor({ ...editor, value: e.target.value })} />
            </div>
          )}
          {editor.kind === "code" && (
            <div className={`${fieldCls} max-w-xs`}>
              <label className={labelCls}>4-digit code (unique within the org)</label>
              <input className={`${inputCls} font-mono`} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={editor.value} onChange={(e) => setEditor({ ...editor, value: e.target.value })} required />
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button type="submit" className={btnCls} disabled={action.busy}>
              {action.busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className={btnGhostCls} onClick={() => setEditor(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="border-t border-stone-200 px-4 py-2 text-[11px] text-stone-500">
        No reducer exists to remove a member or transfer ownership; disable the member instead.
      </div>
    </Panel>
  );
}
