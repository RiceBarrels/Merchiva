"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Panel, btnCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { PO_STATUSES, parsePoLines, type PoLine, type PurchaseOrderRow, type SupplierRow } from "./types";
import { Field, Pager, Select, TextInput, Toolbar, money, optStr, qty, shortId, usePager, useReducerAction } from "./shared";

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" {
  if (status === "received") return "ok";
  if (status === "sent") return "warn";
  if (status === "cancelled") return "danger";
  return "neutral";
}

/** Legal next states from each status. Everything else is reachable via the "Force status" select. */
const NEXT: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["received", "cancelled"],
  received: [],
  cancelled: ["draft"],
};

interface LineForm {
  name: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

const EMPTY_LINE: LineForm = { name: "", quantity: "1", unit: "units", unitCost: "0" };

function LinesTable({ lines }: { lines: PoLine[] }) {
  if (lines.length === 0) return <span className="text-stone-400">no parsable lines</span>;
  return (
    <table className="w-full text-[12px]">
      <thead className="font-mono text-[10.5px] uppercase text-stone-500">
        <tr>
          <th className="pr-3 text-left font-medium">Item</th>
          <th className="pr-3 text-right font-medium">Qty</th>
          <th className="pr-3 text-right font-medium">Unit cost</th>
          <th className="text-right font-medium">Line</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-t border-stone-100">
            <td className="pr-3 py-0.5">
              {l.name || <span className="text-stone-400">(unnamed)</span>}
              {l.caseCount !== undefined && l.unitsPerCase !== undefined && (
                <span className="ml-1 font-mono text-[10.5px] text-stone-500">
                  {l.caseCount} case × {l.unitsPerCase}
                </span>
              )}
            </td>
            <td className="pr-3 py-0.5 text-right font-mono tabular-nums">
              {qty(l.quantity)} {l.unit}
            </td>
            <td className="pr-3 py-0.5 text-right font-mono tabular-nums">{money(l.unitCost)}</td>
            <td className="py-0.5 text-right font-mono tabular-nums">{money(l.quantity * l.unitCost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PurchaseOrdersTab({ orgId, onOpenMessages }: { orgId: string; onOpenMessages: (supplierId: string) => void }) {
  const { rows, loading, error, reload } = useAdminQuery<PurchaseOrderRow>(`SELECT * FROM purchase_order WHERE organization_id = ${sqlString(orgId)}`);
  const suppliers = useAdminQuery<SupplierRow>(`SELECT * FROM supplier WHERE organization_id = ${sqlString(orgId)}`);
  const action = useReducerAction();

  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createSupplier, setCreateSupplier] = useState("");
  const [createLines, setCreateLines] = useState<LineForm[]>([{ ...EMPTY_LINE }]);
  const [createTax, setCreateTax] = useState("0");
  const [createNotes, setCreateNotes] = useState("");

  const supplierName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers.rows) m.set(s.id, s.name);
    return (id: string) => m.get(id) ?? `${shortId(id)} (missing)`;
  }, [suppliers.rows]);

  const filtered = useMemo(
    () =>
      rows
        .filter((o) => (!statusFilter || o.status === statusFilter) && (!supplierFilter || o.supplierId === supplierFilter))
        .sort((a, b) => b.createdAt - a.createdAt),
    [rows, statusFilter, supplierFilter],
  );
  const pager = usePager(filtered, 25);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of rows) m.set(o.status, (m.get(o.status) ?? 0) + 1);
    return m;
  }, [rows]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setStatus(o: PurchaseOrderRow, status: string) {
    if (status === o.status) return;
    const destructive = status === "cancelled" || (o.status === "received" && status !== "received");
    if (destructive && !window.confirm(`Change purchase order ${shortId(o.id)} from "${o.status}" to "${status}"?`)) return;
    await action.run("updatePurchaseOrderStatus", { organizationId: orgId, orderId: o.id, status }, reload);
  }

  const createSubtotal = createLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const createTotal = createSubtotal + (Number(createTax) || 0);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createSupplier) {
      action.setError("Pick a supplier.");
      return;
    }
    const lines = createLines
      .filter((l) => l.name.trim())
      .map((l) => ({ name: l.name.trim(), quantity: Number(l.quantity) || 0, unit: l.unit.trim() || "units", unitCost: Number(l.unitCost) || 0 }));
    if (lines.length === 0) {
      action.setError("Add at least one named line item.");
      return;
    }
    await action.run(
      "createPurchaseOrder",
      {
        organizationId: orgId,
        supplierId: createSupplier,
        items: JSON.stringify(lines),
        subtotal: createSubtotal,
        tax: Number(createTax) || 0,
        total: createTotal,
        notes: optStr(createNotes),
      },
      () => {
        setShowCreate(false);
        setCreateLines([{ ...EMPTY_LINE }]);
        setCreateTax("0");
        setCreateNotes("");
        reload();
      },
    );
  }

  const columns: Column<PurchaseOrderRow>[] = [
    {
      key: "expand",
      header: "",
      className: "w-6",
      render: (o) => (
        <button type="button" className="font-mono text-stone-500 hover:text-stone-900" onClick={() => toggle(o.id)} aria-label="Toggle items">
          {expanded.has(o.id) ? "▾" : "▸"}
        </button>
      ),
    },
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (o) => formatTs(o.createdAt) },
    { key: "status", header: "Status", render: (o) => <Badge tone={statusTone(o.status)}>{o.status}</Badge> },
    {
      key: "supplierId",
      header: "Supplier",
      render: (o) => (
        <button type="button" className="font-medium underline decoration-stone-300 underline-offset-2 hover:decoration-stone-900" onClick={() => onOpenMessages(o.supplierId)}>
          {supplierName(o.supplierId)}
        </button>
      ),
    },
    {
      key: "items",
      header: "Items",
      className: "min-w-[280px]",
      render: (o) => {
        const lines = parsePoLines(o.items);
        if (expanded.has(o.id)) return <LinesTable lines={lines} />;
        const head = lines
          .slice(0, 3)
          .map((l) => `${l.name || "?"} ×${qty(l.quantity)}`)
          .join(", ");
        return (
          <span className="text-stone-700">
            {lines.length === 0 ? <span className="text-stone-400">no parsable lines</span> : head}
            {lines.length > 3 && <span className="text-stone-400"> +{lines.length - 3} more</span>}
          </span>
        );
      },
    },
    { key: "subtotal", header: "Subtotal", className: "font-mono tabular-nums whitespace-nowrap", render: (o) => money(o.subtotal) },
    { key: "tax", header: "Tax", className: "font-mono tabular-nums whitespace-nowrap", render: (o) => money(o.tax) },
    { key: "total", header: "Total", className: "font-mono tabular-nums whitespace-nowrap font-medium", render: (o) => money(o.total) },
    { key: "sentAt", header: "Sent", className: "whitespace-nowrap text-stone-600", render: (o) => formatTs(o.sentAt) },
    { key: "receivedAt", header: "Received", className: "whitespace-nowrap text-stone-600", render: (o) => formatTs(o.receivedAt) },
    { key: "notes", header: "Notes", className: "max-w-[240px]", render: (o) => <span className="line-clamp-2 break-words">{o.notes || <span className="text-stone-300">—</span>}</span> },
    { key: "id", header: "Id", className: "font-mono text-[11px] text-stone-500", render: (o) => <span title={o.id}>{shortId(o.id)}</span> },
    {
      key: "actions",
      header: "",
      className: "whitespace-nowrap text-right",
      render: (o) => (
        <span className="inline-flex items-center gap-1">
          {(NEXT[o.status] ?? []).map((s) => (
            <button key={s} type="button" className={s === "cancelled" ? "rounded-[0.15rem] border border-red-200 bg-white px-2.5 py-1 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" : btnGhostCls} disabled={action.busy} onClick={() => setStatus(o, s)}>
              {s === "sent" ? "Mark sent" : s === "received" ? "Mark received" : s === "cancelled" ? "Cancel" : `→ ${s}`}
            </button>
          ))}
          <select className="rounded-[0.15rem] border border-stone-300 bg-white px-1.5 py-1 text-[11px]" value="" onChange={(e) => e.target.value && setStatus(o, e.target.value)} disabled={action.busy} title="Force any status">
            <option value="">force…</option>
            {PO_STATUSES.filter((s) => s !== o.status).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title={`Purchase orders (${rows.length})`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>
              Refresh
            </button>
            <button type="button" className={btnCls} onClick={() => setShowCreate((s) => !s)}>
              New draft PO
            </button>
          </>
        }
      >
        <ErrorBanner message={error ?? suppliers.error} />
        {!showCreate && <ErrorBanner message={action.error} />}
        {showCreate && (
          <form onSubmit={submitCreate} className="border-b border-stone-200 bg-stone-50 p-4">
            <ErrorBanner message={action.error} />
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Supplier" className="md:col-span-2">
                <Select value={createSupplier} onChange={setCreateSupplier} allowEmpty="— select —" options={suppliers.rows.map((s) => ({ value: s.id, label: s.name })).sort((a, b) => a.label.localeCompare(b.label))} />
              </Field>
              <Field label="Tax">
                <TextInput type="number" step="any" value={createTax} onChange={setCreateTax} />
              </Field>
              <div className="self-end font-mono text-[12px] text-stone-700">
                subtotal {money(createSubtotal)} · total {money(createTotal)}
              </div>
              <Field label="Notes" className="md:col-span-4">
                <TextInput value={createNotes} onChange={setCreateNotes} />
              </Field>
            </div>
            <div className="mt-3 space-y-2">
              {createLines.map((l, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-[1fr_120px_100px_120px_auto]">
                  <input className={inputCls} placeholder="Item name" value={l.name} onChange={(e) => setCreateLines(createLines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input className={inputCls} type="number" step="any" placeholder="Qty" value={l.quantity} onChange={(e) => setCreateLines(createLines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                  <input className={inputCls} placeholder="Unit" value={l.unit} onChange={(e) => setCreateLines(createLines.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                  <input className={inputCls} type="number" step="any" placeholder="Unit cost" value={l.unitCost} onChange={(e) => setCreateLines(createLines.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)))} />
                  <button type="button" className={btnGhostCls} disabled={createLines.length === 1} onClick={() => setCreateLines(createLines.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className={btnGhostCls} onClick={() => setCreateLines([...createLines, { ...EMPTY_LINE }])}>
                Add line
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="submit" className={btnCls} disabled={action.busy}>
                {action.busy ? "Creating…" : "Create draft"}
              </button>
              <button type="button" className={btnGhostCls} onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <span className="text-[11px] text-stone-500">Creates a <code>draft</code> only — no email is sent from here.</span>
            </div>
          </form>
        )}
        <Toolbar>
          <select className={`${inputCls} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {PO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s} ({statusCounts.get(s) ?? 0})
              </option>
            ))}
          </select>
          <select className={`${inputCls} w-auto max-w-xs`} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">All suppliers</option>
            {[...suppliers.rows]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <button type="button" className={btnGhostCls} onClick={() => setExpanded(expanded.size ? new Set() : new Set(filtered.map((o) => o.id)))}>
            {expanded.size ? "Collapse all" : "Expand all"}
          </button>
        </Toolbar>
        <DataTable columns={columns} rows={pager.slice} loading={loading} empty={rows.length ? "No purchase orders match the filter" : "No purchase orders in this org"} rowKey={(o) => o.id} />
        <Pager page={pager.page} pageCount={pager.pageCount} total={filtered.length} onPage={pager.setPage} />
      </Panel>
    </div>
  );
}
