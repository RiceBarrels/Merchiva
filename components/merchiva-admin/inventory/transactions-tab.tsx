"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Panel, btnCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { TRANSACTION_TYPES, type InventoryItemRow, type InventoryTransactionRow } from "./types";
import { Field, Pager, Select, TextInput, Toolbar, optStr, qty, shortId, today, usePager, useReducerAction } from "./shared";

function typeTone(type: string): "ok" | "danger" | "warn" | "neutral" {
  if (type === "in") return "ok";
  if (type === "loss") return "danger";
  if (type === "out") return "warn";
  return "neutral";
}

function sign(type: string): string {
  if (type === "in") return "+";
  if (type === "out" || type === "loss") return "−";
  return "±";
}

export function TransactionsTab({ orgId }: { orgId: string }) {
  const { rows, loading, error, reload } = useAdminQuery<InventoryTransactionRow>(`SELECT * FROM inventory_transaction WHERE organization_id = ${sqlString(orgId)}`);
  const items = useAdminQuery<InventoryItemRow>(`SELECT * FROM inventory_item WHERE organization_id = ${sqlString(orgId)}`);
  const action = useReducerAction();

  const [itemFilter, setItemFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [form, setForm] = useState({ itemId: "", itemName: "", type: "adjustment", quantity: "", note: "", date: today() });

  const itemOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const i of items.rows) byId.set(i.id, i.name);
    // Transactions can reference items that no longer exist; keep those selectable too.
    for (const t of rows) if (t.itemId && !byId.has(t.itemId)) byId.set(t.itemId, `${t.itemName} (deleted)`);
    return Array.from(byId.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items.rows, rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((t) => {
        if (itemFilter && t.itemId !== itemFilter) return false;
        if (typeFilter && t.type !== typeFilter) return false;
        if (!q) return true;
        return [t.itemName, t.note, t.operatorName ?? "", t.id].some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [rows, itemFilter, typeFilter, search]);

  const pager = usePager(filtered, 50);

  async function submitLog(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      action.setError("Quantity must be a positive number.");
      return;
    }
    const itemName = form.itemId ? (itemOptions.find((o) => o.value === form.itemId)?.label ?? form.itemName) : form.itemName.trim();
    if (!itemName) {
      action.setError("Pick an item or type an item name.");
      return;
    }
    await action.run(
      "addInventoryTransaction",
      {
        organizationId: orgId,
        itemId: optStr(form.itemId),
        itemName,
        type: form.type,
        quantity,
        note: form.note.trim(),
        date: form.date || today(),
        operatorMemberId: null,
        operatorName: "Merchiva admin",
        evidenceUrls: null,
        batchExpirationDate: null,
      },
      () => {
        setShowLog(false);
        setForm({ itemId: "", itemName: "", type: "adjustment", quantity: "", note: "", date: today() });
        reload();
      },
    );
  }

  const columns: Column<InventoryTransactionRow>[] = [
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (t) => formatTs(t.createdAt) },
    { key: "date", header: "Date", className: "font-mono whitespace-nowrap" },
    { key: "type", header: "Type", render: (t) => <Badge tone={typeTone(t.type)}>{t.type}</Badge> },
    { key: "itemName", header: "Item", render: (t) => <span className="font-medium">{t.itemName}</span> },
    {
      key: "quantity",
      header: "Qty",
      className: "font-mono tabular-nums whitespace-nowrap",
      render: (t) => (
        <span className={t.type === "in" ? "text-emerald-700" : t.type === "loss" ? "text-red-700" : ""}>
          {sign(t.type)}
          {qty(t.quantity)}
        </span>
      ),
    },
    { key: "note", header: "Note", className: "max-w-[360px]", render: (t) => <span className="line-clamp-2 break-words">{t.note || <span className="text-stone-300">—</span>}</span> },
    { key: "operatorName", header: "Operator", className: "whitespace-nowrap text-stone-600" },
    { key: "batchExpirationDate", header: "Batch exp.", className: "font-mono whitespace-nowrap text-stone-600" },
    {
      key: "evidenceUrls",
      header: "Evidence",
      render: (t) => (t.evidenceUrls ? <span className="font-mono text-[11px] text-stone-500">{t.evidenceUrls.length > 40 ? `${t.evidenceUrls.slice(0, 40)}…` : t.evidenceUrls}</span> : <span className="text-stone-300">—</span>),
    },
    { key: "itemId", header: "Item id", className: "font-mono text-[11px] text-stone-500", render: (t) => (t.itemId ? <span title={t.itemId}>{shortId(t.itemId)}</span> : <span className="text-stone-300">—</span>) },
    { key: "id", header: "Id", className: "font-mono text-[11px] text-stone-500", render: (t) => <span title={t.id}>{shortId(t.id)}</span> },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title={`Inventory transactions (${rows.length})`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>
              Refresh
            </button>
            <button type="button" className={btnCls} onClick={() => setShowLog((s) => !s)}>
              Log transaction
            </button>
          </>
        }
      >
        <ErrorBanner message={error ?? items.error} />
        {!showLog && <ErrorBanner message={action.error} />}
        {showLog && (
          <form onSubmit={submitLog} className="border-b border-stone-200 bg-stone-50 p-4">
            <ErrorBanner message={action.error} />
            <div className="grid gap-3 md:grid-cols-6">
              <Field label="Item" className="md:col-span-2">
                <Select value={form.itemId} onChange={(v) => setForm({ ...form, itemId: v })} allowEmpty="(free text below)" options={itemOptions} />
              </Field>
              <Field label="Item name (if no item)">
                <TextInput value={form.itemName} onChange={(v) => setForm({ ...form, itemName: v })} />
              </Field>
              <Field label="Type">
                <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={TRANSACTION_TYPES.map((t) => ({ value: t, label: t }))} />
              </Field>
              <Field label="Quantity">
                <TextInput type="number" step="any" min="0" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} required />
              </Field>
              <Field label="Date">
                <TextInput type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
              </Field>
              <Field label="Note" className="md:col-span-6">
                <TextInput value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="submit" className={btnCls} disabled={action.busy}>
                {action.busy ? "Saving…" : "Add log entry"}
              </button>
              <button type="button" className={btnGhostCls} onClick={() => setShowLog(false)}>
                Cancel
              </button>
              <span className="text-[11px] text-stone-500">Ledger-only: addInventoryTransaction does not change the item&apos;s stock. Use Items → Adjust to change stock.</span>
            </div>
          </form>
        )}
        <Toolbar>
          <select className={`${inputCls} w-auto max-w-xs`} value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
            <option value="">All items</option>
            {itemOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select className={`${inputCls} w-auto`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input className={`${inputCls} max-w-xs`} placeholder="Search item, note, operator…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Toolbar>
        <DataTable columns={columns} rows={pager.slice} loading={loading} empty={rows.length ? "No transactions match the filter" : "No transactions in this org"} rowKey={(t) => t.id} />
        <Pager page={pager.page} pageCount={pager.pageCount} total={filtered.length} onPage={pager.setPage} />
      </Panel>
    </div>
  );
}
