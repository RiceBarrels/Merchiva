"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { Field, FilterBar, Pager, Stat, isoDaysAgo, isoToday, money, msToIso, shortId, useMutation, usePage, type PaymentRow } from "./shared";

function statusTone(s: string): "ok" | "warn" | "danger" | "neutral" {
  if (s === "completed") return "ok";
  if (s === "refunded" || s === "failed" || s === "voided") return "danger";
  if (s === "pending") return "warn";
  return "neutral";
}

/**
 * payment rows for one org. Writes: refundPayment (completed → refunded).
 * There is no void / delete reducer, so those are not offered.
 */
export function PaymentsPanel({ orgId }: { orgId: string }) {
  const { rows, loading, error, reload } = useAdminQuery<PaymentRow>(
    `SELECT * FROM payment WHERE organization_id = ${sqlString(orgId)}`,
  );
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoToday());
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState("");
  const mut = useMutation();

  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))].sort(), [rows]);
  const methods = useMemo(() => [...new Set(rows.map((r) => r.method))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        const d = msToIso(r.createdAt);
        return (!from || d >= from) && (!to || d <= to);
      })
      .filter((r) => !status || r.status === status)
      .filter((r) => !method || r.method === method)
      .filter((r) => {
        if (!needle) return true;
        return (
          r.id.toLowerCase().includes(needle) ||
          (r.orderId ?? "").toLowerCase().includes(needle) ||
          (r.processorId ?? "").toLowerCase().includes(needle) ||
          (r.customerName ?? "").toLowerCase().includes(needle) ||
          (r.notes ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [rows, from, to, status, method, q]);

  const totals = useMemo(() => {
    let gross = 0;
    let refunded = 0;
    let tax = 0;
    for (const r of filtered) {
      gross += r.amount;
      refunded += r.refundAmount ?? 0;
      tax += r.taxAmount;
    }
    return { count: filtered.length, gross, refunded, tax };
  }, [filtered]);

  const pager = usePage(filtered.length);

  async function submitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!refundTarget) return;
    const amt = Number(refundAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (!window.confirm(`Refund ${money(amt, refundTarget.currency)} on payment ${shortId(refundTarget.id)}? This marks the payment as refunded.`)) return;
    const ok = await mut.run(() =>
      adminCall("refundPayment", { organizationId: orgId, paymentId: refundTarget.id, refundAmount: amt, refundReason: refundReason.trim() || "Admin refund" }),
    );
    if (ok) {
      setRefundTarget(null);
      setRefundAmount("");
      setRefundReason("");
      reload();
    }
  }

  const columns: Column<PaymentRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.id}>{shortId(r.id)}</span> },
    { key: "createdAt", header: "Created", render: (r) => <span className="whitespace-nowrap">{formatTs(r.createdAt)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: "method", header: "Provider / method", render: (r) => <span className="font-mono text-[12px]">{r.method}</span> },
    { key: "amount", header: "Amount", className: "text-right", render: (r) => <span className="font-mono tabular-nums">{money(r.amount, r.currency)}</span> },
    { key: "taxAmount", header: "Tax", className: "text-right", render: (r) => <span className="font-mono tabular-nums text-stone-500">{money(r.taxAmount)}</span> },
    { key: "discountAmount", header: "Discount", className: "text-right", render: (r) => <span className="font-mono tabular-nums text-stone-500">{money(r.discountAmount)}</span> },
    {
      key: "refundAmount",
      header: "Refund",
      className: "text-right",
      render: (r) =>
        r.refundAmount == null ? (
          <span className="text-stone-300">—</span>
        ) : (
          <span className="font-mono tabular-nums text-red-700" title={`${r.refundReason ?? ""} ${formatTs(r.refundedAt)}`}>
            {money(r.refundAmount)}
          </span>
        ),
    },
    { key: "customerName", header: "Customer" },
    { key: "orderId", header: "Order", render: (r) => <span className="font-mono text-[11px] text-stone-500">{r.orderId ?? "—"}</span> },
    { key: "processorId", header: "Processor id", render: (r) => <span className="font-mono text-[11px] text-stone-500">{r.processorId ?? "—"}</span> },
    { key: "userId", header: "User", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.userId ?? ""}>{r.userId ? shortId(r.userId) : "—"}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) =>
        r.status === "completed" ? (
          <button type="button" className={btnGhostCls} onClick={() => { setRefundTarget(r); setRefundAmount(String(r.amount)); setRefundReason(""); mut.clear(); }}>
            Refund
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Payments" value={totals.count} />
        <Stat label="Gross" value={money(totals.gross)} />
        <Stat label="Tax" value={money(totals.tax)} />
        <Stat label="Refunded" value={money(totals.refunded)} />
      </div>

      <Panel
        title="Payments"
        actions={
          <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>
            Refresh
          </button>
        }
      >
        <ErrorBanner message={error} />
        <ErrorBanner message={mut.error} />
        <Notice message={rows.length > 0 && filtered.length === 0 ? "No payments match the current filter." : null} />
        {refundTarget && (
          <form onSubmit={submitRefund} className="flex flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 px-3 py-3">
            <div className="text-[12px] text-stone-600">
              Refund payment <span className="font-mono">{shortId(refundTarget.id)}</span> ({money(refundTarget.amount, refundTarget.currency)})
            </div>
            <Field label="Amount"><input type="number" step="0.01" min={0.01} max={refundTarget.amount} className={inputCls + " w-[140px]"} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} required /></Field>
            <Field label="Reason" className="min-w-[220px]"><input className={inputCls} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Admin refund" /></Field>
            <button type="submit" className={btnCls} disabled={mut.busy}>{mut.busy ? "Refunding…" : "Confirm refund"}</button>
            <button type="button" className={btnGhostCls} onClick={() => setRefundTarget(null)}>Cancel</button>
          </form>
        )}
        <FilterBar>
          <Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">all</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Method">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">all</option>
              {methods.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Search" className="min-w-[200px] flex-1">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="id, order, processor id, customer, notes" />
          </Field>
          <button type="button" className={btnGhostCls} onClick={() => { setFrom(""); setTo(""); setStatus(""); setMethod(""); setQ(""); }}>
            Clear
          </button>
        </FilterBar>
        <DataTable columns={columns} rows={pager.slice(filtered)} loading={loading} rowKey={(r) => r.id} empty="No payments" />
        <Pager page={pager.page} pages={pager.pages} total={filtered.length} onChange={pager.setPage} />
        <div className="border-t border-stone-200 px-3 py-1.5 text-[11px] text-stone-500">
          Refund marks a completed payment as refunded in the ledger only; no processor call is made. There is no void or delete reducer.
        </div>
      </Panel>
    </div>
  );
}
