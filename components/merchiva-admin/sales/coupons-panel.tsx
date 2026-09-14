"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { Field, FilterBar, Pager, Stat, isoDaysAgo, isoToday, money, optStr, shortId, useMutation, usePage, type CouponRow } from "./shared";

interface CouponForm {
  code: string;
  discountType: string;
  discountValue: string;
  minPurchase: string;
  maxUses: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
  description: string;
}

const emptyForm = (): CouponForm => ({
  code: "",
  discountType: "percent",
  discountValue: "",
  minPurchase: "0",
  maxUses: "0",
  validFrom: isoToday(),
  validUntil: isoDaysAgo(-30),
  active: true,
  description: "",
});

const fromRow = (r: CouponRow): CouponForm => ({
  code: r.code,
  discountType: r.discountType,
  discountValue: String(r.discountValue),
  minPurchase: String(r.minPurchase),
  maxUses: String(r.maxUses),
  validFrom: r.validFrom,
  validUntil: r.validUntil,
  active: r.active,
  description: r.description ?? "",
});

/** Full update args for updateCoupon built from an existing row + overrides. */
function updateArgs(orgId: string, r: CouponRow, patch: Partial<CouponRow>): Record<string, unknown> {
  const m = { ...r, ...patch };
  return {
    organizationId: orgId,
    couponId: r.id,
    code: m.code,
    discountType: m.discountType,
    discountValue: m.discountValue,
    minPurchase: m.minPurchase,
    maxUses: m.maxUses,
    validFrom: m.validFrom,
    validUntil: m.validUntil,
    active: m.active,
    description: m.description,
  };
}

function couponState(r: CouponRow, today: string): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (!r.active) return { label: "inactive", tone: "neutral" };
  if (today < r.validFrom) return { label: "scheduled", tone: "warn" };
  if (today > r.validUntil) return { label: "expired", tone: "danger" };
  if (r.maxUses > 0 && r.usedCount >= r.maxUses) return { label: "exhausted", tone: "danger" };
  return { label: "live", tone: "ok" };
}

/** coupon CRUD via addCoupon / updateCoupon / deleteCoupon; toggle uses updateCoupon. */
export function CouponsPanel({ orgId }: { orgId: string }) {
  const { rows, loading, error, reload } = useAdminQuery<CouponRow>(`SELECT * FROM coupon WHERE organization_id = ${sqlString(orgId)}`);
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const mut = useMutation();
  const today = isoToday();

  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm());
  const set = <K extends keyof CouponForm>(k: K, v: CouponForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !onlyActive || r.active)
      .filter((r) => !needle || r.code.toLowerCase().includes(needle) || (r.description ?? "").toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [rows, q, onlyActive]);

  const stats = useMemo(() => {
    let live = 0;
    let uses = 0;
    for (const r of rows) {
      if (couponState(r, today).label === "live") live += 1;
      uses += r.usedCount;
    }
    return { total: rows.length, live, uses };
  }, [rows, today]);

  const pager = usePage(filtered.length);

  function openNew() {
    setEditing("new");
    setForm(emptyForm());
    mut.clear();
  }
  function openEdit(r: CouponRow) {
    setEditing(r.id);
    setForm(fromRow(r));
    mut.clear();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const discountValue = Number(form.discountValue);
    const minPurchase = Number(form.minPurchase || 0);
    const maxUses = Math.trunc(Number(form.maxUses || 0));
    if (![discountValue, minPurchase, maxUses].every(Number.isFinite)) return;
    const args = {
      organizationId: orgId,
      code: form.code.trim(),
      discountType: form.discountType,
      discountValue,
      minPurchase,
      maxUses,
      validFrom: form.validFrom,
      validUntil: form.validUntil,
      description: optStr(form.description),
    };
    const ok = await mut.run(() =>
      editing === "new" ? adminCall("addCoupon", args) : adminCall("updateCoupon", { ...args, couponId: editing, active: form.active }),
    );
    if (ok) {
      setEditing(null);
      reload();
    }
  }

  async function toggle(r: CouponRow) {
    const ok = await mut.run(() => adminCall("updateCoupon", updateArgs(orgId, r, { active: !r.active })));
    if (ok) reload();
  }

  async function remove(r: CouponRow) {
    if (!window.confirm(`Delete coupon ${r.code}? Used ${r.usedCount} time(s).`)) return;
    const ok = await mut.run(() => adminCall("deleteCoupon", { organizationId: orgId, couponId: r.id }));
    if (ok) reload();
  }

  const columns: Column<CouponRow>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono font-semibold">{r.code}</span> },
    {
      key: "state",
      header: "State",
      render: (r) => {
        const s = couponState(r, today);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    {
      key: "discount",
      header: "Discount",
      className: "text-right",
      render: (r) => (
        <span className="font-mono tabular-nums">
          {r.discountType === "percent" || r.discountType === "percentage" ? `${r.discountValue}%` : money(r.discountValue)}
          <span className="ml-1 text-[11px] text-stone-500">{r.discountType}</span>
        </span>
      ),
    },
    { key: "minPurchase", header: "Min purchase", className: "text-right", render: (r) => <span className="font-mono tabular-nums text-stone-600">{money(r.minPurchase)}</span> },
    {
      key: "uses",
      header: "Uses",
      className: "text-right",
      render: (r) => (
        <span className="font-mono tabular-nums">
          {r.usedCount} / {r.maxUses > 0 ? r.maxUses : "∞"}
        </span>
      ),
    },
    { key: "valid", header: "Valid", render: (r) => <span className="font-mono text-[12px] tabular-nums">{r.validFrom} → {r.validUntil}</span> },
    { key: "description", header: "Description", render: (r) => <span className="text-stone-600">{r.description ?? "—"}</span> },
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.id}>{shortId(r.id)}</span> },
    { key: "createdAt", header: "Created", render: (r) => <span className="text-stone-500">{formatTs(r.createdAt)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={btnGhostCls} onClick={() => toggle(r)} disabled={mut.busy}>{r.active ? "Deactivate" : "Activate"}</button>
          <button type="button" className={btnGhostCls} onClick={() => openEdit(r)}>Edit</button>
          <button type="button" className={btnDangerCls} onClick={() => remove(r)} disabled={mut.busy}>Delete</button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Coupons" value={stats.total} />
        <Stat label="Live now" value={stats.live} />
        <Stat label="Total redemptions" value={stats.uses} />
      </div>

      <Panel
        title="Coupons"
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>Refresh</button>
            <button type="button" className={btnCls} onClick={openNew}>Add coupon</button>
          </>
        }
      >
        <ErrorBanner message={error} />
        <ErrorBanner message={mut.error} />
        <Notice message={rows.length > 0 && filtered.length === 0 ? "No coupons match the current filter." : null} />
        {editing && (
          <form onSubmit={submit} className="border-b border-stone-200 bg-stone-50 px-3 py-3">
            <div className="mb-2 text-[12px] font-medium text-stone-700">
              {editing === "new" ? "New coupon" : <>Edit coupon <span className="font-mono text-stone-500">{shortId(editing)}</span></>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              <Field label="Code"><input className={inputCls + " font-mono uppercase"} value={form.code} onChange={(e) => set("code", e.target.value)} required /></Field>
              <Field label="Type">
                <select className={inputCls} value={form.discountType} onChange={(e) => set("discountType", e.target.value)}>
                  <option value="percent">percent</option>
                  <option value="fixed">fixed</option>
                </select>
              </Field>
              <Field label="Value"><input type="number" step="0.01" min={0} className={inputCls} value={form.discountValue} onChange={(e) => set("discountValue", e.target.value)} required /></Field>
              <Field label="Min purchase"><input type="number" step="0.01" min={0} className={inputCls} value={form.minPurchase} onChange={(e) => set("minPurchase", e.target.value)} /></Field>
              <Field label="Max uses (0 = ∞)"><input type="number" min={0} step={1} className={inputCls} value={form.maxUses} onChange={(e) => set("maxUses", e.target.value)} /></Field>
              <Field label="Valid from"><input type="date" className={inputCls} value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} required /></Field>
              <Field label="Valid until"><input type="date" className={inputCls} value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} required /></Field>
              {editing !== "new" && (
                <Field label="Active">
                  <span className="flex h-[32px] items-center">
                    <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
                  </span>
                </Field>
              )}
              <Field label="Description" className="col-span-2 sm:col-span-4"><input className={inputCls} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button type="submit" className={btnCls} disabled={mut.busy}>{mut.busy ? "Saving…" : editing === "new" ? "Create" : "Save"}</button>
              <button type="button" className={btnGhostCls} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        )}
        <FilterBar>
          <Field label="Search" className="min-w-[200px] flex-1">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="code, description, id" />
          </Field>
          <label className="flex h-[32px] items-center gap-1.5 text-[12px] text-stone-600">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            active only
          </label>
        </FilterBar>
        <DataTable columns={columns} rows={pager.slice(filtered)} loading={loading} rowKey={(r) => r.id} empty="No coupons" />
        <Pager page={pager.page} pages={pager.pages} total={filtered.length} onChange={pager.setPage} />
        <div className="border-t border-stone-200 px-3 py-1.5 text-[11px] text-stone-500">
          used_count cannot be reset: the module only increments it via redeemCoupon.
        </div>
      </Panel>
    </div>
  );
}
