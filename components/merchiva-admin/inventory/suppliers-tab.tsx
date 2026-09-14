"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { DataTable, ErrorBanner, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { SUPPLIER_LANGUAGES, type PurchaseOrderRow, type SupplierMessageRow, type SupplierRow } from "./types";
import { Field, Select, TextInput, Toolbar, num, optStr, shortId, useReducerAction } from "./shared";

interface SupplierForm {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  notes: string;
  rating: string;
  language: string;
}

const EMPTY: SupplierForm = { name: "", contactName: "", email: "", phone: "", address: "", paymentTerms: "", notes: "", rating: "5", language: "en" };

function formFromRow(s: SupplierRow): SupplierForm {
  return {
    name: s.name,
    contactName: s.contactName ?? "",
    email: s.email ?? "",
    phone: s.phone ?? "",
    address: s.address ?? "",
    paymentTerms: s.paymentTerms ?? "",
    notes: s.notes ?? "",
    rating: String(s.rating),
    language: s.language ?? "en",
  };
}

export function SuppliersTab({ orgId, onOpenMessages }: { orgId: string; onOpenMessages: (supplierId: string) => void }) {
  const { rows, loading, error, reload } = useAdminQuery<SupplierRow>(`SELECT * FROM supplier WHERE organization_id = ${sqlString(orgId)}`);
  const orders = useAdminQuery<PurchaseOrderRow>(`SELECT * FROM purchase_order WHERE organization_id = ${sqlString(orgId)}`);
  const messages = useAdminQuery<SupplierMessageRow>(`SELECT * FROM supplier_message WHERE organization_id = ${sqlString(orgId)}`);
  const action = useReducerAction();

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<{ kind: "none" } | { kind: "add" } | { kind: "edit"; id: string }>({ kind: "none" });
  const [form, setForm] = useState<SupplierForm>(EMPTY);

  const counts = useMemo(() => {
    const po = new Map<string, number>();
    const msg = new Map<string, number>();
    for (const o of orders.rows) po.set(o.supplierId, (po.get(o.supplierId) ?? 0) + 1);
    for (const m of messages.rows) msg.set(m.supplierId, (msg.get(m.supplierId) ?? 0) + 1);
    return { po, msg };
  }, [orders.rows, messages.rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((s) => !q || [s.name, s.contactName ?? "", s.email ?? "", s.phone ?? "", s.id].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search]);

  const selected = mode.kind === "edit" ? rows.find((s) => s.id === mode.id) ?? null : null;

  function openAdd() {
    setForm(EMPTY);
    action.setError(null);
    setMode({ kind: "add" });
  }
  function openEdit(s: SupplierRow) {
    setForm(formFromRow(s));
    action.setError(null);
    setMode({ kind: "edit", id: s.id });
  }
  function close() {
    setMode({ kind: "none" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const base = {
      organizationId: orgId,
      name: form.name.trim(),
      contactName: optStr(form.contactName),
      email: optStr(form.email),
      phone: optStr(form.phone),
      address: optStr(form.address),
      paymentTerms: optStr(form.paymentTerms),
      notes: optStr(form.notes),
      language: optStr(form.language),
    };
    if (mode.kind === "add") {
      await action.run("addSupplier", base, () => {
        close();
        reload();
      });
    } else if (mode.kind === "edit" && selected) {
      await action.run("updateSupplier", { ...base, supplierId: selected.id, rating: num(form.rating, 5) }, () => {
        close();
        reload();
      });
    }
  }

  async function remove(s: SupplierRow) {
    const po = counts.po.get(s.id) ?? 0;
    const msg = counts.msg.get(s.id) ?? 0;
    if (!window.confirm(`Delete supplier "${s.name}"?\n\n${po} purchase order(s) and ${msg} message(s) reference it and will be orphaned (not deleted).`)) return;
    await action.run("deleteSupplier", { organizationId: orgId, supplierId: s.id }, () => {
      if (mode.kind === "edit" && mode.id === s.id) close();
      reload();
    });
  }

  const columns: Column<SupplierRow>[] = [
    { key: "name", header: "Name", render: (s) => <span className="font-medium">{s.name}</span> },
    { key: "contactName", header: "Contact" },
    { key: "email", header: "Email", className: "font-mono text-[12px]" },
    { key: "phone", header: "Phone", className: "font-mono text-[12px] whitespace-nowrap" },
    { key: "language", header: "Lang", className: "font-mono uppercase" },
    { key: "paymentTerms", header: "Terms" },
    { key: "rating", header: "Rating", className: "font-mono tabular-nums", render: (s) => s.rating.toFixed(1) },
    { key: "address", header: "Address", className: "max-w-[240px]", render: (s) => <span className="line-clamp-2 break-words">{s.address || <span className="text-stone-300">—</span>}</span> },
    {
      key: "links",
      header: "PO / msgs",
      className: "font-mono tabular-nums whitespace-nowrap",
      render: (s) => (
        <button type="button" className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-900" onClick={() => onOpenMessages(s.id)}>
          {counts.po.get(s.id) ?? 0} / {counts.msg.get(s.id) ?? 0}
        </button>
      ),
    },
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (s) => formatTs(s.createdAt) },
    { key: "id", header: "Id", className: "font-mono text-[11px] text-stone-500", render: (s) => <span title={s.id}>{shortId(s.id)}</span> },
    {
      key: "actions",
      header: "",
      className: "whitespace-nowrap text-right",
      render: (s) => (
        <span className="inline-flex gap-1">
          <button type="button" className={btnGhostCls} onClick={() => openEdit(s)}>
            Edit
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => remove(s)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title={`Suppliers (${rows.length})`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>
              Refresh
            </button>
            <button type="button" className={btnCls} onClick={openAdd}>
              Add supplier
            </button>
          </>
        }
      >
        <ErrorBanner message={error} />
        {mode.kind === "none" && <ErrorBanner message={action.error} />}
        <Toolbar>
          <input className={`${inputCls} max-w-xs`} placeholder="Search name, contact, email, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Toolbar>
        <DataTable columns={columns} rows={filtered} loading={loading} empty={rows.length ? "No suppliers match the filter" : "No suppliers in this org"} rowKey={(s) => s.id} />
      </Panel>

      {(mode.kind === "add" || (mode.kind === "edit" && selected)) && (
        <Panel
          title={mode.kind === "add" ? "Add supplier" : `Edit supplier · ${selected?.name ?? ""}`}
          actions={
            <button type="button" className={btnGhostCls} onClick={close}>
              Close
            </button>
          }
        >
          <ErrorBanner message={action.error} />
          <form onSubmit={submit} className="p-4">
            {selected && (
              <div className="mb-3 font-mono text-[11px] text-stone-500">
                id {selected.id} · created {formatTs(selected.createdAt)}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Name" className="md:col-span-2">
                <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
              </Field>
              <Field label="Contact name">
                <TextInput value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} />
              </Field>
              <Field label="Language">
                <Select value={form.language} onChange={(v) => setForm({ ...form, language: v })} options={SUPPLIER_LANGUAGES.map((l) => ({ value: l, label: l }))} />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              </Field>
              <Field label="Phone">
                <TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              </Field>
              <Field label="Payment terms">
                <TextInput value={form.paymentTerms} onChange={(v) => setForm({ ...form, paymentTerms: v })} placeholder="e.g. Net 30" />
              </Field>
              {mode.kind === "edit" ? (
                <Field label="Rating (0–5)">
                  <TextInput type="number" step="0.1" min="0" value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />
                </Field>
              ) : (
                <div className="self-end text-[11px] text-stone-500">Rating starts at 5 (set by the module).</div>
              )}
              <Field label="Address" className="md:col-span-2">
                <TextInput value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              </Field>
              <Field label="Notes" className="md:col-span-2">
                <TextInput value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button type="submit" className={btnCls} disabled={action.busy}>
                {action.busy ? "Saving…" : mode.kind === "add" ? "Create supplier" : "Save changes"}
              </button>
              <button type="button" className={btnGhostCls} onClick={close}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
