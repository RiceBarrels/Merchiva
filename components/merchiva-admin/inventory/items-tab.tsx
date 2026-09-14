"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import type { InventoryItemRow } from "./types";
import { Field, Pager, Select, TextInput, Toolbar, money, num, optNum, optStr, qty, shortId, today, usePager, useReducerAction } from "./shared";

type SortKey = "name" | "category" | "currentStock" | "costPerUnit" | "supplier" | "updatedAt";

interface ItemForm {
  name: string;
  category: string;
  currentStock: string;
  minStock: string;
  maxStock: string;
  unit: string;
  costPerUnit: string;
  supplier: string;
  lastRestocked: string;
  lossRate: string;
  minOrderQty: string;
  unitsPerCase: string;
  description: string;
  unitContentAmount: string;
  unitContentUnit: string;
  retailEnabled: "" | "true" | "false";
  retailPrice: string;
  retailDescription: string;
  retailImageUrl: string;
  retailUsageQty: string;
  expirationBatches: string;
}

const EMPTY_FORM: ItemForm = {
  name: "",
  category: "",
  currentStock: "0",
  minStock: "0",
  maxStock: "0",
  unit: "units",
  costPerUnit: "0",
  supplier: "",
  lastRestocked: today(),
  lossRate: "0",
  minOrderQty: "",
  unitsPerCase: "",
  description: "",
  unitContentAmount: "",
  unitContentUnit: "",
  retailEnabled: "",
  retailPrice: "",
  retailDescription: "",
  retailImageUrl: "",
  retailUsageQty: "",
  expirationBatches: "",
};

function str(v: number | string | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

function formFromRow(r: InventoryItemRow): ItemForm {
  return {
    name: r.name,
    category: r.category,
    currentStock: str(r.currentStock),
    minStock: str(r.minStock),
    maxStock: str(r.maxStock),
    unit: r.unit,
    costPerUnit: str(r.costPerUnit),
    supplier: r.supplier,
    lastRestocked: r.lastRestocked,
    lossRate: str(r.lossRate),
    minOrderQty: str(r.minOrderQty),
    unitsPerCase: str(r.unitsPerCase),
    description: r.description ?? "",
    unitContentAmount: str(r.unitContentAmount),
    unitContentUnit: r.unitContentUnit ?? "",
    retailEnabled: r.retailEnabled === null ? "" : r.retailEnabled ? "true" : "false",
    retailPrice: str(r.retailPrice),
    retailDescription: r.retailDescription ?? "",
    retailImageUrl: r.retailImageUrl ?? "",
    retailUsageQty: str(r.retailUsageQty),
    expirationBatches: r.expirationBatches ?? "",
  };
}

/** Shared arg block for addInventoryItem / updateInventoryItem / serviceRepairInventoryItem. */
function formToArgs(f: ItemForm): Record<string, unknown> {
  return {
    name: f.name.trim(),
    category: f.category.trim(),
    currentStock: num(f.currentStock),
    minStock: num(f.minStock),
    maxStock: num(f.maxStock),
    unit: f.unit.trim() || "units",
    costPerUnit: num(f.costPerUnit),
    supplier: f.supplier.trim(),
    lastRestocked: f.lastRestocked.trim() || today(),
    minOrderQty: optNum(f.minOrderQty),
    unitsPerCase: optNum(f.unitsPerCase),
    description: optStr(f.description),
    unitContentAmount: optNum(f.unitContentAmount),
    unitContentUnit: optStr(f.unitContentUnit),
    retailEnabled: f.retailEnabled === "" ? null : f.retailEnabled === "true",
    retailPrice: optNum(f.retailPrice),
    retailDescription: optStr(f.retailDescription),
    retailImageUrl: optStr(f.retailImageUrl),
    retailUsageQty: optNum(f.retailUsageQty),
    expirationBatches: optStr(f.expirationBatches),
  };
}

/** Full-row args for updateInventoryItem, built from the current row (so untouched fields survive). */
function rowToUpdateArgs(orgId: string, r: InventoryItemRow): Record<string, unknown> {
  return {
    organizationId: orgId,
    itemId: r.id,
    ...formToArgs(formFromRow(r)),
    lossRate: r.lossRate,
    batchExpirationDate: null,
    operatorMemberId: null,
    operatorName: "Merchiva admin",
    stockNote: null,
    evidenceUrls: null,
  };
}

export function ItemsTab({ orgId }: { orgId: string }) {
  const query = `SELECT * FROM inventory_item WHERE organization_id = ${sqlString(orgId)}`;
  const { rows, loading, error, reload } = useAdminQuery<InventoryItemRow>(query);
  const action = useReducerAction();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [mode, setMode] = useState<{ kind: "none" } | { kind: "add" } | { kind: "edit"; id: string } | { kind: "adjust"; id: string }>({ kind: "none" });
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [useRepair, setUseRepair] = useState(false);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort(), [rows]);
  const lowCount = useMemo(() => rows.filter((r) => r.currentStock <= r.minStock).length, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (lowOnly && r.currentStock > r.minStock) return false;
      if (category && r.category !== category) return false;
      if (!q) return true;
      return [r.name, r.category, r.supplier, r.unit, r.id, r.description ?? ""].some((v) => v.toLowerCase().includes(q));
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, search, category, lowOnly, sortKey, sortDir]);

  const pager = usePager(filtered, 50);

  const selected = mode.kind === "edit" || mode.kind === "adjust" ? rows.find((r) => r.id === mode.id) ?? null : null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM, lastRestocked: today() });
    setUseRepair(false);
    action.setError(null);
    setMode({ kind: "add" });
  }

  function openEdit(r: InventoryItemRow) {
    setForm(formFromRow(r));
    setUseRepair(false);
    action.setError(null);
    setMode({ kind: "edit", id: r.id });
  }

  function openAdjust(r: InventoryItemRow) {
    setAdjustQty("");
    setAdjustNote("");
    action.setError(null);
    setMode({ kind: "adjust", id: r.id });
  }

  function close() {
    setMode({ kind: "none" });
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (mode.kind === "add") {
      await action.run("addInventoryItem", { organizationId: orgId, ...formToArgs(form) }, () => {
        close();
        reload();
      });
      return;
    }
    if (mode.kind === "edit" && selected) {
      const base = { organizationId: orgId, itemId: selected.id, ...formToArgs(form), lossRate: num(form.lossRate) };
      if (useRepair) {
        await action.run("serviceRepairInventoryItem", base, () => {
          close();
          reload();
        });
      } else {
        await action.run(
          "updateInventoryItem",
          {
            ...base,
            batchExpirationDate: null,
            operatorMemberId: null,
            operatorName: "Merchiva admin",
            stockNote: num(form.currentStock) !== selected.currentStock ? "Stock edited in Merchiva admin console" : null,
            evidenceUrls: null,
          },
          () => {
            close();
            reload();
          },
        );
      }
    }
  }

  async function submitAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const delta = Number(adjustQty);
    if (!Number.isFinite(delta) || delta === 0) {
      action.setError("Enter a non-zero quantity (positive to add, negative to remove).");
      return;
    }
    const nextStock = Math.max(0, selected.currentStock + delta);
    const args = {
      ...rowToUpdateArgs(orgId, selected),
      currentStock: nextStock,
      lastRestocked: delta > 0 ? today() : selected.lastRestocked,
      stockNote: adjustNote.trim() || `Admin stock adjustment (${delta > 0 ? "+" : ""}${delta})`,
    };
    await action.run("updateInventoryItem", args, () => {
      close();
      reload();
    });
  }

  async function remove(r: InventoryItemRow) {
    if (!window.confirm(`Delete inventory item "${r.name}"?\n\nThis removes the row permanently. Transactions and waste logs referencing it are kept.`)) return;
    await action.run("deleteInventoryItem", { organizationId: orgId, itemId: r.id }, () => {
      if (mode.kind !== "none" && mode.kind !== "add" && mode.id === r.id) close();
      reload();
    });
  }

  const sortHeader = (key: SortKey, label: string) => (
    <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-stone-900" onClick={() => toggleSort(key)}>
      {label}
      {sortKey === key && <span className="text-stone-400">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );

  const columns: Column<InventoryItemRow>[] = [
    { key: "name", header: "Name", render: (r) => <span>{nameCell(r)}</span> },
    { key: "category", header: "Category" },
    {
      key: "stock",
      header: "Stock / min / max",
      className: "font-mono tabular-nums whitespace-nowrap",
      render: (r) => (
        <span className={r.currentStock <= r.minStock ? "text-red-700" : ""}>
          {qty(r.currentStock)} <span className="text-stone-400">/ {qty(r.minStock)} / {qty(r.maxStock)}</span>
        </span>
      ),
    },
    { key: "unit", header: "Unit" },
    { key: "costPerUnit", header: "Cost", className: "font-mono tabular-nums", render: (r) => money(r.costPerUnit) },
    { key: "supplier", header: "Supplier" },
    {
      key: "retail",
      header: "Retail",
      className: "whitespace-nowrap",
      render: (r) =>
        r.retailEnabled ? (
          <span className="inline-flex items-center gap-1.5">
            <Badge tone="ok">on</Badge>
            <span className="font-mono tabular-nums">{r.retailPrice === null ? "—" : money(r.retailPrice)}</span>
          </span>
        ) : (
          <Badge>off</Badge>
        ),
    },
    { key: "lastRestocked", header: "Restocked", className: "font-mono whitespace-nowrap" },
    { key: "updatedAt", header: "Updated", className: "whitespace-nowrap text-stone-600", render: (r) => formatTs(r.updatedAt) },
    { key: "id", header: "Id", className: "font-mono text-[11px] text-stone-500", render: (r) => <span title={r.id}>{shortId(r.id)}</span> },
    {
      key: "actions",
      header: "",
      className: "whitespace-nowrap text-right",
      render: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={btnGhostCls} onClick={() => openAdjust(r)}>
            Adjust
          </button>
          <button type="button" className={btnGhostCls} onClick={() => openEdit(r)}>
            Edit
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => remove(r)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  // The DataTable header is plain text; sort controls live in the toolbar instead.
  function nameCell(r: InventoryItemRow) {
    return (
      <span>
        <span className="font-medium">{r.name}</span>
        {r.currentStock <= r.minStock && (
          <span className="ml-1.5">
            <Badge tone="warn">low</Badge>
          </span>
        )}
        {r.squareItemId && (
          <span className="ml-1.5">
            <Badge>square</Badge>
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title={`Inventory items (${rows.length}${lowCount ? `, ${lowCount} low` : ""})`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>
              Refresh
            </button>
            <button type="button" className={btnCls} onClick={openAdd}>
              Add item
            </button>
          </>
        }
      >
        <ErrorBanner message={error} />
        {mode.kind === "none" && <ErrorBanner message={action.error} />}
        <Toolbar>
          <input className={`${inputCls} max-w-xs`} placeholder="Search name, category, supplier, id…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={`${inputCls} w-auto`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-stone-700">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Low stock only
          </label>
          <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-stone-500">
            sort
            {sortHeader("name", "name")}
            {sortHeader("category", "category")}
            {sortHeader("currentStock", "stock")}
            {sortHeader("costPerUnit", "cost")}
            {sortHeader("supplier", "supplier")}
            {sortHeader("updatedAt", "updated")}
          </span>
        </Toolbar>
        <DataTable columns={columns} rows={pager.slice} loading={loading} empty={rows.length ? "No items match the filter" : "No inventory items in this org"} rowKey={(r) => r.id} />
        <Pager page={pager.page} pageCount={pager.pageCount} total={filtered.length} onPage={pager.setPage} />
      </Panel>

      {(mode.kind === "add" || (mode.kind === "edit" && selected)) && (
        <Panel
          title={mode.kind === "add" ? "Add inventory item" : `Edit item · ${selected?.name ?? ""}`}
          actions={
            <button type="button" className={btnGhostCls} onClick={close}>
              Close
            </button>
          }
        >
          <ErrorBanner message={action.error} />
          <form onSubmit={submitForm} className="p-4">
            {mode.kind === "edit" && selected && (
              <div className="mb-3 font-mono text-[11px] text-stone-500">
                id {selected.id} · created {formatTs(selected.createdAt)} · updated {formatTs(selected.updatedAt)}
                {selected.squareItemId && <> · square {selected.squareItemId}</>}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Name" className="md:col-span-2">
                <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
              </Field>
              <Field label="Category">
                <TextInput value={form.category} onChange={(v) => setForm({ ...form, category: v })} required />
              </Field>
              <Field label="Supplier (name)">
                <TextInput value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} />
              </Field>
              <Field label="Current stock">
                <TextInput type="number" step="any" value={form.currentStock} onChange={(v) => setForm({ ...form, currentStock: v })} required />
              </Field>
              <Field label="Min stock">
                <TextInput type="number" step="any" value={form.minStock} onChange={(v) => setForm({ ...form, minStock: v })} required />
              </Field>
              <Field label="Max stock">
                <TextInput type="number" step="any" value={form.maxStock} onChange={(v) => setForm({ ...form, maxStock: v })} required />
              </Field>
              <Field label="Unit">
                <TextInput value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} required />
              </Field>
              <Field label="Cost per unit">
                <TextInput type="number" step="any" value={form.costPerUnit} onChange={(v) => setForm({ ...form, costPerUnit: v })} required />
              </Field>
              <Field label="Last restocked (YYYY-MM-DD)">
                <TextInput type="date" value={form.lastRestocked} onChange={(v) => setForm({ ...form, lastRestocked: v })} required />
              </Field>
              {mode.kind === "edit" && (
                <Field label="Loss rate">
                  <TextInput type="number" step="any" value={form.lossRate} onChange={(v) => setForm({ ...form, lossRate: v })} />
                </Field>
              )}
              <Field label="Min order qty">
                <TextInput type="number" step="any" value={form.minOrderQty} onChange={(v) => setForm({ ...form, minOrderQty: v })} />
              </Field>
              <Field label="Units per case">
                <TextInput type="number" step="any" value={form.unitsPerCase} onChange={(v) => setForm({ ...form, unitsPerCase: v })} />
              </Field>
              <Field label="Unit content amount">
                <TextInput type="number" step="any" value={form.unitContentAmount} onChange={(v) => setForm({ ...form, unitContentAmount: v })} />
              </Field>
              <Field label="Unit content unit">
                <TextInput value={form.unitContentUnit} onChange={(v) => setForm({ ...form, unitContentUnit: v })} placeholder="e.g. ml, g" />
              </Field>
              <Field label="Description" className="md:col-span-4">
                <TextInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
              </Field>
              <Field label="Retail enabled">
                <Select
                  value={form.retailEnabled}
                  onChange={(v) => setForm({ ...form, retailEnabled: v as ItemForm["retailEnabled"] })}
                  allowEmpty="(unset)"
                  options={[
                    { value: "true", label: "yes" },
                    { value: "false", label: "no" },
                  ]}
                />
              </Field>
              <Field label="Retail price">
                <TextInput type="number" step="any" value={form.retailPrice} onChange={(v) => setForm({ ...form, retailPrice: v })} />
              </Field>
              <Field label="Retail usage qty">
                <TextInput type="number" step="any" value={form.retailUsageQty} onChange={(v) => setForm({ ...form, retailUsageQty: v })} />
              </Field>
              <Field label="Retail image URL">
                <TextInput value={form.retailImageUrl} onChange={(v) => setForm({ ...form, retailImageUrl: v })} />
              </Field>
              <Field label="Retail description" className="md:col-span-2">
                <TextInput value={form.retailDescription} onChange={(v) => setForm({ ...form, retailDescription: v })} />
              </Field>
              <Field label="Expiration batches (JSON)" className="md:col-span-2">
                <TextInput value={form.expirationBatches} onChange={(v) => setForm({ ...form, expirationBatches: v })} placeholder='[{"qty":10,"date":"2026-12-01"}]' />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" className={btnCls} disabled={action.busy}>
                {action.busy ? "Saving…" : mode.kind === "add" ? "Create item" : "Save changes"}
              </button>
              <button type="button" className={btnGhostCls} onClick={close}>
                Cancel
              </button>
              {mode.kind === "edit" && (
                <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-stone-600" title="serviceRepairInventoryItem rewrites the row without logging a stock transaction or low-stock notification">
                  <input type="checkbox" checked={useRepair} onChange={(e) => setUseRepair(e.target.checked)} />
                  Silent repair (no transaction / notification)
                </label>
              )}
            </div>
          </form>
        </Panel>
      )}

      {mode.kind === "adjust" && selected && (
        <Panel
          title={`Quick stock adjustment · ${selected.name}`}
          actions={
            <button type="button" className={btnGhostCls} onClick={close}>
              Close
            </button>
          }
        >
          <ErrorBanner message={action.error} />
          <form onSubmit={submitAdjust} className="flex flex-wrap items-end gap-3 p-4">
            <div className="text-[12px] text-stone-600">
              Current <span className="font-mono">{qty(selected.currentStock)} {selected.unit}</span> · min <span className="font-mono">{qty(selected.minStock)}</span>
            </div>
            <Field label="Delta (+ add / − remove)">
              <input className={`${inputCls} w-36`} type="number" step="any" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} required autoFocus />
            </Field>
            <Field label="Note" className="min-w-[260px] flex-1">
              <TextInput value={adjustNote} onChange={setAdjustNote} placeholder="Reason (logged on the transaction)" />
            </Field>
            <div className="text-[12px] text-stone-600">
              → <span className="font-mono">{qty(Math.max(0, selected.currentStock + (Number(adjustQty) || 0)))}</span>
            </div>
            <button type="submit" className={btnCls} disabled={action.busy}>
              {action.busy ? "Applying…" : "Apply"}
            </button>
            <span className="basis-full text-[11px] text-stone-500">
              Uses updateInventoryItem: the module writes the new stock and logs an <code>in</code> / <code>adjustment</code> transaction automatically.
            </span>
          </form>
        </Panel>
      )}
    </div>
  );
}
