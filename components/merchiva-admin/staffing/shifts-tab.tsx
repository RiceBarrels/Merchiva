"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "../use-admin-query";
import { Badge, DataTable, ErrorBanner, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "../ui";
import { Field, FormActions, FormRow, IdCell, StatusBadge, orgQuery, parseJsonArray, toInt, todayIso, useAction, useOrgMembers } from "./shared";
import type { ShiftPresetRow, ShiftRow, ShiftTradeRow, StaffRoleRow } from "./types";

interface ShiftForm {
  memberId: string;
  roles: string[];
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  predictedDemand: string;
}

interface PresetForm {
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  sortOrder: string;
}
const emptyPreset: PresetForm = { name: "", startTime: "09:00", endTime: "17:00", color: "#57534e", sortOrder: "0" };

type Section = "shifts" | "presets" | "trades";

export function ShiftsTab({ orgId }: { orgId: string }) {
  const members = useOrgMembers(orgId);
  const shifts = useAdminQuery<ShiftRow>(orgQuery("shift", orgId));
  const presets = useAdminQuery<ShiftPresetRow>(orgQuery("shift_preset", orgId));
  const trades = useAdminQuery<ShiftTradeRow>(orgQuery("shift_trade", orgId));
  const roles = useAdminQuery<StaffRoleRow>(orgQuery("staff_role", orgId));
  const action = useAction();

  const [section, setSection] = useState<Section>("shifts");
  const [from, setFrom] = useState(() => todayIso(-7));
  const [to, setTo] = useState(() => todayIso(14));
  const [memberFilter, setMemberFilter] = useState("");

  const activeMembers = useMemo(() => members.members.filter((m) => m.status === "active"), [members.members]);
  const roleNames = useMemo(() => roles.rows.map((r) => r.name).sort(), [roles.rows]);
  const sortedPresets = useMemo(() => [...presets.rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [presets.rows]);
  const shiftById = useMemo(() => new Map(shifts.rows.map((s) => [s.id, s])), [shifts.rows]);

  const visibleShifts = useMemo(
    () =>
      shifts.rows
        .filter((s) => (!from || s.date >= from) && (!to || s.date <= to))
        .filter((s) => !memberFilter || s.memberId === memberFilter)
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.staffName.localeCompare(b.staffName)),
    [shifts.rows, from, to, memberFilter],
  );

  // ── Shift form ─────────────────────────────────────────────────────────────
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftEditing, setShiftEditing] = useState<ShiftRow | null>(null);
  const [shiftForm, setShiftForm] = useState<ShiftForm>({ memberId: "", roles: [], date: todayIso(), shiftType: "regular", startTime: "09:00", endTime: "17:00", predictedDemand: "medium" });

  function openAddShift() {
    setShiftEditing(null);
    setShiftForm({ memberId: activeMembers[0]?.id ?? "", roles: roleNames.slice(0, 1), date: todayIso(), shiftType: "regular", startTime: "09:00", endTime: "17:00", predictedDemand: "medium" });
    setShiftOpen(true);
  }

  function openEditShift(s: ShiftRow) {
    setShiftEditing(s);
    setShiftForm({
      memberId: s.memberId ?? "",
      roles: parseJsonArray(s.staffRoles).length ? parseJsonArray(s.staffRoles) : s.staffRole ? [s.staffRole] : [],
      date: s.date,
      shiftType: s.shiftType,
      startTime: s.startTime,
      endTime: s.endTime,
      predictedDemand: s.predictedDemand,
    });
    setShiftOpen(true);
  }

  async function submitShift(e: React.FormEvent) {
    e.preventDefault();
    const member = members.byId.get(shiftForm.memberId);
    if (!member) {
      action.setError("Pick a team member");
      return;
    }
    if (shiftForm.roles.length === 0) {
      action.setError("Pick at least one role");
      return;
    }
    const args = {
      organizationId: orgId,
      memberId: member.id,
      staffName: member.displayName,
      staffRole: shiftForm.roles[0],
      staffRoles: JSON.stringify(shiftForm.roles),
      date: shiftForm.date,
      shiftType: shiftForm.shiftType.trim() || "regular",
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      predictedDemand: shiftForm.predictedDemand.trim() || "medium",
    };
    const ok = shiftEditing
      ? await action.run("shift", () => adminCall("updateShift", { ...args, shiftId: shiftEditing.id }), { after: shifts.reload })
      : await action.run("shift", () => adminCall("addShift", args), { after: shifts.reload });
    if (ok) setShiftOpen(false);
  }

  function removeShift(s: ShiftRow) {
    void action.run(`delshift:${s.id}`, () => adminCall("deleteShift", { organizationId: orgId, shiftId: s.id }), {
      confirm: `Delete ${s.staffName}'s shift on ${s.date} (${s.startTime}–${s.endTime})?`,
      after: shifts.reload,
    });
  }

  function toggleRole(name: string) {
    setShiftForm((f) => ({ ...f, roles: f.roles.includes(name) ? f.roles.filter((r) => r !== name) : [...f.roles, name] }));
  }

  const shiftCols: Column<ShiftRow>[] = [
    { key: "date", header: "Date", className: "font-mono" },
    { key: "time", header: "Time", className: "font-mono", render: (s) => `${s.startTime}–${s.endTime}` },
    { key: "staffName", header: "Staff", render: (s) => <span className="font-medium">{s.staffName}</span> },
    { key: "memberId", header: "Member", render: (s) => <IdCell id={s.memberId} /> },
    {
      key: "staffRoles",
      header: "Roles",
      render: (s) => {
        const list = parseJsonArray(s.staffRoles);
        return list.length ? (
          <span className="inline-flex flex-wrap gap-1">
            {list.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </span>
        ) : (
          s.staffRole ?? "—"
        );
      },
    },
    { key: "shiftType", header: "Type" },
    { key: "predictedDemand", header: "Demand" },
    { key: "id", header: "Id", render: (s) => <IdCell id={s.id} /> },
    { key: "createdAt", header: "Created", className: "text-stone-500", render: (s) => formatTs(s.createdAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (s) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnGhostCls} onClick={() => openEditShift(s)}>
            Edit
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy === `delshift:${s.id}`} onClick={() => removeShift(s)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  // ── Presets ────────────────────────────────────────────────────────────────
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetEditing, setPresetEditing] = useState<ShiftPresetRow | null>(null);
  const [presetForm, setPresetForm] = useState<PresetForm>(emptyPreset);

  async function submitPreset(e: React.FormEvent) {
    e.preventDefault();
    const args = { organizationId: orgId, name: presetForm.name.trim(), startTime: presetForm.startTime, endTime: presetForm.endTime, color: presetForm.color, sortOrder: toInt(presetForm.sortOrder) };
    const ok = presetEditing
      ? await action.run("preset", () => adminCall("updateShiftPreset", { ...args, presetId: presetEditing.id }), { after: presets.reload })
      : await action.run("preset", () => adminCall("addShiftPreset", args), { after: presets.reload });
    if (ok) setPresetOpen(false);
  }

  const presetCols: Column<ShiftPresetRow>[] = [
    {
      key: "name",
      header: "Preset",
      render: (p) => (
        <span className="inline-flex items-center gap-2 font-medium">
          <span className="inline-block h-3 w-3 border border-stone-300" style={{ backgroundColor: p.color }} />
          {p.name}
        </span>
      ),
    },
    { key: "time", header: "Time", className: "font-mono", render: (p) => `${p.startTime}–${p.endTime}` },
    { key: "sortOrder", header: "Order", className: "font-mono" },
    { key: "id", header: "Id", render: (p) => <IdCell id={p.id} /> },
    { key: "createdAt", header: "Created", className: "text-stone-500", render: (p) => formatTs(p.createdAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (p) => (
        <span className="inline-flex gap-1.5">
          <button
            type="button"
            className={btnGhostCls}
            onClick={() => {
              setPresetEditing(p);
              setPresetForm({ name: p.name, startTime: p.startTime, endTime: p.endTime, color: p.color, sortOrder: String(p.sortOrder) });
              setPresetOpen(true);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className={btnDangerCls}
            disabled={action.busy === `delpreset:${p.id}`}
            onClick={() =>
              void action.run(`delpreset:${p.id}`, () => adminCall("deleteShiftPreset", { organizationId: orgId, presetId: p.id }), {
                confirm: `Delete preset "${p.name}"?`,
                after: presets.reload,
              })
            }
          >
            Delete
          </button>
        </span>
      ),
    },
  ];

  // ── Trades ─────────────────────────────────────────────────────────────────
  const [tradeFilter, setTradeFilter] = useState("all");
  const visibleTrades = useMemo(
    () => [...trades.rows].filter((t) => tradeFilter === "all" || t.status === tradeFilter).sort((a, b) => b.createdAt - a.createdAt),
    [trades.rows, tradeFilter],
  );

  function shiftLabel(id: string | null): string {
    if (!id) return "—";
    const s = shiftById.get(id);
    return s ? `${s.date} ${s.startTime}–${s.endTime} · ${s.staffName}` : id;
  }

  function setTradeStatus(t: ShiftTradeRow, status: "accepted" | "denied") {
    void action.run(`trade:${t.id}`, () => adminCall("updateShiftTradeStatus", { organizationId: orgId, tradeId: t.id, status }), {
      confirm: status === "denied" ? "Deny this shift trade?" : undefined,
      after: trades.reload,
    });
  }

  const tradeCols: Column<ShiftTradeRow>[] = [
    { key: "type", header: "Type", render: (t) => <Badge>{t.type}</Badge> },
    { key: "shift", header: "Shift", render: (t) => shiftLabel(t.shiftId) },
    { key: "requester", header: "Requester", render: (t) => members.nameOf(t.requesterId) },
    { key: "target", header: "Target", render: (t) => (t.broadcastToAll ? <Badge tone="warn">broadcast</Badge> : members.nameOf(t.targetId || null)) },
    { key: "targetShift", header: "Target shift", render: (t) => shiftLabel(t.targetShiftId) },
    { key: "acceptedBy", header: "Accepted by", render: (t) => members.nameOf(t.acceptedById) },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    {
      key: "managerApproved",
      header: "Manager",
      render: (t) => (t.managerApproved ? <Badge tone="ok">approved{t.managerId ? ` · ${members.nameOf(t.managerId)}` : ""}</Badge> : <span className="text-stone-400">—</span>),
    },
    { key: "comments", header: "Comments", className: "max-w-[220px] text-stone-600" },
    { key: "createdAt", header: "Created", className: "text-stone-500", render: (t) => formatTs(t.createdAt) },
    { key: "id", header: "Id", render: (t) => <IdCell id={t.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (t) => {
        const busy = action.busy === `trade:${t.id}`;
        const canApprove = t.status === "pending" || (t.status === "accepted" && !t.managerApproved);
        return (
          <span className="inline-flex gap-1.5">
            {canApprove && (
              <button type="button" className={btnGhostCls} disabled={busy} onClick={() => setTradeStatus(t, "accepted")}>
                {t.status === "accepted" ? "Approve" : "Accept"}
              </button>
            )}
            {t.status !== "denied" && (
              <button type="button" className={btnDangerCls} disabled={busy} onClick={() => setTradeStatus(t, "denied")}>
                Deny
              </button>
            )}
          </span>
        );
      },
    },
  ];

  const sectionBtn = (s: Section, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setSection(s)}
      className={`rounded-[0.15rem] border px-2.5 py-1 text-[12px] font-medium ${section === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white hover:bg-stone-50"}`}
    >
      {label} <span className="font-mono opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {sectionBtn("shifts", "Shifts", shifts.rows.length)}
        {sectionBtn("presets", "Presets", presets.rows.length)}
        {sectionBtn("trades", "Trades", trades.rows.filter((t) => t.status === "pending" || (t.status === "accepted" && !t.managerApproved)).length)}
      </div>

      {section === "shifts" && (
        <Panel
          title={`Shifts · ${visibleShifts.length} of ${shifts.rows.length}`}
          actions={
            <>
              <input type="date" className={`${inputCls} w-auto py-1`} value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-[12px] text-stone-400">to</span>
              <input type="date" className={`${inputCls} w-auto py-1`} value={to} onChange={(e) => setTo(e.target.value)} />
              <select className={`${inputCls} w-auto py-1`} value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
                <option value="">all members</option>
                {members.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              <button type="button" className={btnGhostCls} onClick={shifts.reload}>
                Refresh
              </button>
              <button type="button" className={btnCls} onClick={openAddShift} disabled={activeMembers.length === 0}>
                Add shift
              </button>
            </>
          }
        >
          <ErrorBanner message={shifts.error ?? members.error ?? action.error} />
          <DataTable columns={shiftCols} rows={visibleShifts} loading={shifts.loading} rowKey={(s) => s.id} empty="No shifts in this range" />
          {shiftOpen && (
            <form onSubmit={submitShift}>
              <FormRow>
                <Field label="Team member">
                  <select className={inputCls} value={shiftForm.memberId} onChange={(e) => setShiftForm({ ...shiftForm, memberId: e.target.value })} required>
                    <option value="">— member —</option>
                    {activeMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Date">
                  <input type="date" className={inputCls} value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} required />
                </Field>
                <Field label="Start">
                  <input type="time" className={inputCls} value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} required />
                </Field>
                <Field label="End">
                  <input type="time" className={inputCls} value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} required />
                </Field>
                <Field label="Preset">
                  <select
                    className={inputCls}
                    value=""
                    onChange={(e) => {
                      const p = sortedPresets.find((x) => x.id === e.target.value);
                      if (p) setShiftForm({ ...shiftForm, startTime: p.startTime, endTime: p.endTime, shiftType: p.name });
                    }}
                  >
                    <option value="">— apply preset —</option>
                    {sortedPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.startTime}–{p.endTime})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Shift type">
                  <input className={inputCls} value={shiftForm.shiftType} onChange={(e) => setShiftForm({ ...shiftForm, shiftType: e.target.value })} />
                </Field>
                <Field label="Predicted demand">
                  <select className={inputCls} value={shiftForm.predictedDemand} onChange={(e) => setShiftForm({ ...shiftForm, predictedDemand: e.target.value })}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </Field>
                <Field label="Roles" className="md:col-span-4">
                  {roleNames.length === 0 ? (
                    <span className="text-[12px] text-red-700">No staff roles defined — addShift requires at least one role.</span>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {roleNames.map((n) => (
                        <label key={n} className="inline-flex items-center gap-1.5 text-[12px]">
                          <input type="checkbox" checked={shiftForm.roles.includes(n)} onChange={() => toggleRole(n)} />
                          {n}
                        </label>
                      ))}
                    </div>
                  )}
                </Field>
              </FormRow>
              <FormActions>
                <button type="submit" className={btnCls} disabled={action.busy === "shift"}>
                  {action.busy === "shift" ? "Saving…" : shiftEditing ? "Update shift" : "Add shift"}
                </button>
                <button type="button" className={btnGhostCls} onClick={() => setShiftOpen(false)}>
                  Cancel
                </button>
                {shiftEditing && <span className="font-mono text-[11px] text-stone-400">{shiftEditing.id}</span>}
              </FormActions>
            </form>
          )}
        </Panel>
      )}

      {section === "presets" && (
        <Panel
          title={`Shift presets · ${sortedPresets.length}`}
          actions={
            <>
              <button type="button" className={btnGhostCls} onClick={presets.reload}>
                Refresh
              </button>
              <button
                type="button"
                className={btnCls}
                onClick={() => {
                  setPresetEditing(null);
                  setPresetForm(emptyPreset);
                  setPresetOpen(true);
                }}
              >
                Add preset
              </button>
            </>
          }
        >
          <ErrorBanner message={presets.error ?? action.error} />
          <DataTable columns={presetCols} rows={sortedPresets} loading={presets.loading} rowKey={(p) => p.id} empty="No presets" />
          {presetOpen && (
            <form onSubmit={submitPreset}>
              <FormRow>
                <Field label="Name">
                  <input className={inputCls} value={presetForm.name} onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })} required />
                </Field>
                <Field label="Start">
                  <input type="time" className={inputCls} value={presetForm.startTime} onChange={(e) => setPresetForm({ ...presetForm, startTime: e.target.value })} required />
                </Field>
                <Field label="End">
                  <input type="time" className={inputCls} value={presetForm.endTime} onChange={(e) => setPresetForm({ ...presetForm, endTime: e.target.value })} required />
                </Field>
                <Field label="Color / order">
                  <div className="flex gap-1.5">
                    <input type="color" className="h-8 w-10 border border-stone-300 bg-white p-0.5" value={presetForm.color} onChange={(e) => setPresetForm({ ...presetForm, color: e.target.value })} />
                    <input type="number" className={inputCls} value={presetForm.sortOrder} onChange={(e) => setPresetForm({ ...presetForm, sortOrder: e.target.value })} />
                  </div>
                </Field>
              </FormRow>
              <FormActions>
                <button type="submit" className={btnCls} disabled={action.busy === "preset"}>
                  {action.busy === "preset" ? "Saving…" : presetEditing ? "Update preset" : "Add preset"}
                </button>
                <button type="button" className={btnGhostCls} onClick={() => setPresetOpen(false)}>
                  Cancel
                </button>
              </FormActions>
            </form>
          )}
        </Panel>
      )}

      {section === "trades" && (
        <Panel
          title={`Shift trades · ${visibleTrades.length}`}
          actions={
            <>
              <select className={`${inputCls} w-auto py-1`} value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)}>
                <option value="all">all statuses</option>
                <option value="pending">pending</option>
                <option value="accepted">accepted</option>
                <option value="denied">denied</option>
              </select>
              <button type="button" className={btnGhostCls} onClick={trades.reload}>
                Refresh
              </button>
            </>
          }
        >
          <ErrorBanner message={trades.error ?? action.error} />
          <DataTable columns={tradeCols} rows={visibleTrades} loading={trades.loading} rowKey={(t) => t.id} empty="No shift trades" />
          <div className="border-t border-stone-200 px-4 py-2 text-[12px] text-stone-500">
            Accept moves a pending trade to <code className="font-mono">accepted</code>; Approve on an already-accepted trade sets the manager approval flag. Deny sets <code className="font-mono">denied</code>.
          </div>
        </Panel>
      )}
    </div>
  );
}
