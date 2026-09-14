"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { DataTable, ErrorBanner, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import type { InventoryItemRow, WasteLogRow } from "./types";
import { Field, Pager, Select, TextInput, Toolbar, money, optStr, qty, shortId, today, usePager, useReducerAction } from "./shared";

const REASONS = ["expired", "damaged", "spoiled", "overproduction", "spillage", "theft", "other"];

interface WasteForm {
  itemId: string;
  itemName: string;
  quantity: string;
  unit: string;
  reason: string;
  costPerUnit: string;
  date: string;
  notes: string;
}

const EMPTY: WasteForm = { itemId: "", itemName: "", quantity: "", unit: "units", reason: "expired", costPerUnit: "0", date: today(), notes: "" };

export function WasteTab({ orgId }: { orgId: string }) {
  const { rows, loading, error, reload } = useAdminQuery<WasteLogRow>(`SELECT * FROM waste_log WHERE organization_id = ${sqlString(orgId)}`);
  const items = useAdminQuery<InventoryItemRow>(`SELECT * FROM inventory_item WHERE organization_id = ${sqlString(orgId)}`);
  const action = useReducerAction();

  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<WasteForm>(EMPTY);

  const reasons = useMemo(() => Array.from(new Set([...REASONS, ...rows.map((r) => r.reason)])).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((w) => {
        if (reasonFilter && w.reason !== reasonFilter) return false;
        if (!q) return true;
        return [w.itemName, w.reason, w.notes ?? "", w.createdBy ?? "", w.id].some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [rows, search, reasonFilter]);

  const totalCost = useMemo(() => filtered.reduce((s, w) => s + (Number.isFinite(w.totalCost) ? w.totalCost : 0), 0), [filtered]);
  const pager = usePager(filtered, 50);

  function pickItem(id: string) {
    const item = items.rows.find((i) => i.id === id);
    if (item) setForm({ ...form, itemId: id, itemName: item.name, unit: item.unit, costPerUnit: String(item.costPerUnit) });
    else setForm({ ...form, itemId: "" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      action.setError("Quantity must be a positive number.");
      return;
    }
    if (!form.itemName.trim()) {
      action.setError("Item name is required.");
      return;
    }
    await action.run(
      "addWasteLog",
      {
        organizationId: orgId,
        itemId: optStr(form.itemId),
        itemName: form.itemName.trim(),
        quantity,
        unit: form.unit.trim() || "units",
        reason: form.reason.trim() || "other",
        costPerUnit: Number(form.costPerUnit) || 0,
        date: form.date || today(),
        notes: optStr(form.notes),
        operatorMemberId: null,
        operatorName: "Merchiva admin",
      },
      () => {
        setShowAdd(false);
        setForm({ ...EMPTY, date: today() });
        reload();
      },
    );
  }

  async function remove(w: WasteLogRow) {
    if (!window.confirm(`Delete waste log for "${w.itemName}" (${qty(w.quantity)} ${w.unit})?\n\nStock is NOT restored — the module only removes the log row.`)) return;
    await action.run("deleteWasteLog", { organizationId: orgId, wasteLogId: w.id }, reload);
  }

  const columns: Column<WasteLogRow>[] = [
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (w) => formatTs(w.createdAt) },
    { key: "date", header: "Date", className: "font-mono whitespace-nowrap" },
    { key: "itemName", header: "Item", render: (w) => <span className="font-medium">{w.itemName}</span> },
    { key: "quantity", header: "Qty", className: "font-mono tabular-nums whitespace-nowrap", render: (w) => `${qty(w.quantity)} ${w.unit}` },
    { key: "reason", header: "Reason" },
    { key: "costPerUnit", header: "Cost/unit", className: "font-mono tabular-nums", render: (w) => money(w.costPerUnit) },
    { key: "totalCost", header: "Total", className: "font-mono tabular-nums", render: (w) => money(w.totalCost) },
    { key: "notes", header: "Notes", className: "max-w-[320px]", render: (w) => <span className="line-clamp-2 break-words">{w.notes || <span className="text-stone-300">—</span>}</span> },
    { key: "createdBy", header: "By", className: "whitespace-nowrap text-stone-600" },
    { key: "itemId", header: "Item id", className: "font-mono text-[11px] text-stone-500", render: (w) => (w.itemId ? <span title={w.itemId}>{shortId(w.itemId)}</span> : <span className="text-stone-300">—</span>) },
    { key: "id", header: "Id", className: "font-mono text-[11px] text-stone-500", render: (w) => <span title={w.id}>{shortId(w.id)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (w) => (
        <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => remove(w)}>
          Delete
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title={`Waste log (${rows.length}) · ${money(totalCost)} shown`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>
              Refresh
            </button>
            <button type="button" className={btnCls} onClick={() => setShowAdd((s) => !s)}>
              Add waste
            </button>
          </>
        }
      >
        <ErrorBanner message={error ?? items.error} />
        {!showAdd && <ErrorBanner message={action.error} />}
        {showAdd && (
          <form onSubmit={submit} className="border-b border-stone-200 bg-stone-50 p-4">
            <ErrorBanner message={action.error} />
            <div className="grid gap-3 md:grid-cols-6">
              <Field label="Inventory item" className="md:col-span-2">
                <Select value={form.itemId} onChange={pickItem} allowEmpty="(unlinked)" options={items.rows.map((i) => ({ value: i.id, label: `${i.name} · ${qty(i.currentStock)} ${i.unit}` })).sort((a, b) => a.label.localeCompare(b.label))} />
              </Field>
              <Field label="Item name" className="md:col-span-2">
                <TextInput value={form.itemName} onChange={(v) => setForm({ ...form, itemName: v })} required />
              </Field>
              <Field label="Quantity">
                <TextInput type="number" step="any" min="0" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} required />
              </Field>
              <Field label="Unit">
                <TextInput value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} required />
              </Field>
              <Field label="Reason">
                <Select value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} options={reasons.map((r) => ({ value: r, label: r }))} />
              </Field>
              <Field label="Cost per unit">
                <TextInput type="number" step="any" value={form.costPerUnit} onChange={(v) => setForm({ ...form, costPerUnit: v })} required />
              </Field>
              <Field label="Date">
                <TextInput type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
              </Field>
              <Field label="Notes" className="md:col-span-3">
                <TextInput value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="submit" className={btnCls} disabled={action.busy}>
                {action.busy ? "Saving…" : "Add waste log"}
              </button>
              <button type="button" className={btnGhostCls} onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <span className="text-[11px] text-stone-500">Linked items are auto-deducted and a <code>loss</code> transaction is written.</span>
            </div>
          </form>
        )}
        <Toolbar>
          <input className={`${inputCls} max-w-xs`} placeholder="Search item, reason, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={`${inputCls} w-auto`} value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
            <option value="">All reasons</option>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Toolbar>
        <DataTable columns={columns} rows={pager.slice} loading={loading} empty={rows.length ? "No waste logs match the filter" : "No waste logs in this org"} rowKey={(w) => w.id} />
        <Pager page={pager.page} pageCount={pager.pageCount} total={filtered.length} onPage={pager.setPage} />
      </Panel>
    </div>
  );
}
