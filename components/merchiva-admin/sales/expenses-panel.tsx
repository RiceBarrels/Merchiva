"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { Field, FilterBar, Pager, Stat, isoDaysAgo, isoToday, money, optStr, shortId, useMutation, usePage, type ExpenseRow } from "./shared";

interface ExpenseForm {
  category: string;
  description: string;
  amount: string;
  date: string;
  recurring: boolean;
  recurringPeriod: string;
  receiptUrl: string;
  notes: string;
}

const emptyForm = (): ExpenseForm => ({
  category: "",
  description: "",
  amount: "",
  date: isoToday(),
  recurring: false,
  recurringPeriod: "",
  receiptUrl: "",
  notes: "",
});

const fromRow = (r: ExpenseRow): ExpenseForm => ({
  category: r.category,
  description: r.description,
  amount: String(r.amount),
  date: r.date,
  recurring: r.recurring,
  recurringPeriod: r.recurringPeriod ?? "",
  receiptUrl: r.receiptUrl ?? "",
  notes: r.notes ?? "",
});

/** expense CRUD via addExpense / updateExpense / deleteExpense. */
export function ExpensesPanel({ orgId }: { orgId: string }) {
  const { rows, loading, error, reload } = useAdminQuery<ExpenseRow>(`SELECT * FROM expense WHERE organization_id = ${sqlString(orgId)}`);
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(isoToday());
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const mut = useMutation();

  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm());
  const set = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
      .filter((r) => !category || r.category === category)
      .filter((r) => !needle || r.description.toLowerCase().includes(needle) || (r.notes ?? "").toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [rows, from, to, category, q]);

  const totals = useMemo(() => {
    let total = 0;
    let recurring = 0;
    for (const r of filtered) {
      total += r.amount;
      if (r.recurring) recurring += r.amount;
    }
    return { count: filtered.length, total, recurring };
  }, [filtered]);

  const pager = usePage(filtered.length);

  function openNew() {
    setEditing("new");
    setForm(emptyForm());
    mut.clear();
  }
  function openEdit(r: ExpenseRow) {
    setEditing(r.id);
    setForm(fromRow(r));
    mut.clear();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount)) return;
    const args = {
      organizationId: orgId,
      category: form.category.trim(),
      description: form.description.trim(),
      amount,
      date: form.date,
      recurring: form.recurring,
      recurringPeriod: form.recurring ? optStr(form.recurringPeriod) : null,
      receiptUrl: optStr(form.receiptUrl),
      notes: optStr(form.notes),
    };
    const ok = await mut.run(() =>
      editing === "new" ? adminCall("addExpense", args) : adminCall("updateExpense", { ...args, expenseId: editing }),
    );
    if (ok) {
      setEditing(null);
      reload();
    }
  }

  async function remove(r: ExpenseRow) {
    if (!window.confirm(`Delete expense "${r.description}" (${money(r.amount)})?`)) return;
    const ok = await mut.run(() => adminCall("deleteExpense", { organizationId: orgId, expenseId: r.id }));
    if (ok) reload();
  }

  const columns: Column<ExpenseRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.id}>{shortId(r.id)}</span> },
    { key: "date", header: "Date", render: (r) => <span className="font-mono tabular-nums">{r.date}</span> },
    { key: "category", header: "Category", render: (r) => <Badge>{r.category}</Badge> },
    { key: "description", header: "Description" },
    { key: "amount", header: "Amount", className: "text-right", render: (r) => <span className="font-mono tabular-nums">{money(r.amount)}</span> },
    { key: "recurring", header: "Recurring", render: (r) => (r.recurring ? <Badge tone="warn">{r.recurringPeriod ?? "recurring"}</Badge> : <span className="text-stone-300">—</span>) },
    {
      key: "receiptUrl",
      header: "Receipt",
      render: (r) =>
        r.receiptUrl ? (
          <a href={r.receiptUrl} target="_blank" rel="noreferrer" className="text-[12px] underline">
            open
          </a>
        ) : (
          <span className="text-stone-300">—</span>
        ),
    },
    { key: "notes", header: "Notes", render: (r) => <span className="text-stone-600">{r.notes ?? "—"}</span> },
    { key: "createdAt", header: "Created", render: (r) => <span className="text-stone-500">{formatTs(r.createdAt)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={btnGhostCls} onClick={() => openEdit(r)}>Edit</button>
          <button type="button" className={btnDangerCls} onClick={() => remove(r)} disabled={mut.busy}>Delete</button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Expenses" value={totals.count} />
        <Stat label="Total" value={money(totals.total)} />
        <Stat label="Recurring" value={money(totals.recurring)} />
      </div>

      <Panel
        title="Expenses"
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>Refresh</button>
            <button type="button" className={btnCls} onClick={openNew}>Add expense</button>
          </>
        }
      >
        <ErrorBanner message={error} />
        <ErrorBanner message={mut.error} />
        <Notice message={rows.length > 0 && filtered.length === 0 ? "No expenses match the current filter." : null} />
        {editing && (
          <form onSubmit={submit} className="border-b border-stone-200 bg-stone-50 px-3 py-3">
            <div className="mb-2 text-[12px] font-medium text-stone-700">
              {editing === "new" ? "New expense" : <>Edit expense <span className="font-mono text-stone-500">{shortId(editing)}</span></>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} required /></Field>
              <Field label="Category"><input className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)} list="admin-expense-categories" required /></Field>
              <Field label="Description" className="col-span-2"><input className={inputCls} value={form.description} onChange={(e) => set("description", e.target.value)} required /></Field>
              <Field label="Amount"><input type="number" step="0.01" className={inputCls} value={form.amount} onChange={(e) => set("amount", e.target.value)} required /></Field>
              <Field label="Recurring">
                <span className="flex h-[32px] items-center gap-2">
                  <input type="checkbox" checked={form.recurring} onChange={(e) => set("recurring", e.target.checked)} />
                  <select className={inputCls} value={form.recurringPeriod} onChange={(e) => set("recurringPeriod", e.target.value)} disabled={!form.recurring}>
                    <option value="">period</option>
                    <option value="weekly">weekly</option>
                    <option value="monthly">monthly</option>
                    <option value="quarterly">quarterly</option>
                    <option value="yearly">yearly</option>
                  </select>
                </span>
              </Field>
              <Field label="Receipt URL"><input className={inputCls} value={form.receiptUrl} onChange={(e) => set("receiptUrl", e.target.value)} placeholder="https://" /></Field>
              <Field label="Notes"><input className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
            </div>
            <datalist id="admin-expense-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
            <div className="mt-2 flex gap-1.5">
              <button type="submit" className={btnCls} disabled={mut.busy}>{mut.busy ? "Saving…" : editing === "new" ? "Create" : "Save"}</button>
              <button type="button" className={btnGhostCls} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        )}
        <FilterBar>
          <Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Category">
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">all</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Search" className="min-w-[200px] flex-1">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="description, notes, id" />
          </Field>
          <button type="button" className={btnGhostCls} onClick={() => { setFrom(""); setTo(""); setCategory(""); setQ(""); }}>Clear</button>
        </FilterBar>
        <DataTable columns={columns} rows={pager.slice(filtered)} loading={loading} rowKey={(r) => r.id} empty="No expenses" />
        <Pager page={pager.page} pages={pager.pages} total={filtered.length} onChange={pager.setPage} />
      </Panel>
    </div>
  );
}
