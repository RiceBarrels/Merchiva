"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, ErrorBanner, Panel, btnCls, btnGhostCls, inputCls } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import type { PurchaseOrderRow, SupplierMessageRow, SupplierRow } from "./types";
import { Field, Select, TextInput, optStr, shortId, useReducerAction } from "./shared";

function statusTone(status: string | null): "neutral" | "ok" | "warn" | "danger" {
  if (status === "sent" || status === "delivered" || status === "resolved") return "ok";
  if (status === "needs_review" || status === "pending") return "warn";
  if (status === "failed" || status === "error") return "danger";
  return "neutral";
}

const DIRECTIONS = ["outbound", "inbound", "system"];
const CHANNELS = ["email", "note", "phone", "sms"];

export function SupplierMessagesTab({ orgId, supplierId, onSelectSupplier }: { orgId: string; supplierId: string | null; onSelectSupplier: (id: string | null) => void }) {
  const suppliers = useAdminQuery<SupplierRow>(`SELECT * FROM supplier WHERE organization_id = ${sqlString(orgId)}`);
  const messages = useAdminQuery<SupplierMessageRow>(`SELECT * FROM supplier_message WHERE organization_id = ${sqlString(orgId)}`);
  const orders = useAdminQuery<PurchaseOrderRow>(`SELECT * FROM purchase_order WHERE organization_id = ${sqlString(orgId)}`);
  const action = useReducerAction();

  // Keyed by supplier so switching threads closes the form without an effect.
  const [showAddFor, setShowAddFor] = useState<string | null>(null);
  const showAdd = showAddFor !== null && showAddFor === supplierId;
  const setShowAdd = (open: boolean) => setShowAddFor(open ? supplierId : null);
  const [form, setForm] = useState({ direction: "system", channel: "note", subject: "", body: "", status: "", poId: "", escalate: false });

  const supplierList = useMemo(() => {
    const counts = new Map<string, { total: number; last: number }>();
    for (const m of messages.rows) {
      const c = counts.get(m.supplierId) ?? { total: 0, last: 0 };
      c.total += 1;
      c.last = Math.max(c.last, m.createdAt);
      counts.set(m.supplierId, c);
    }
    const known = suppliers.rows.map((s) => ({ id: s.id, name: s.name, missing: false, ...(counts.get(s.id) ?? { total: 0, last: 0 }) }));
    // Threads whose supplier row was deleted.
    const orphan = Array.from(counts.keys())
      .filter((id) => !suppliers.rows.some((s) => s.id === id))
      .map((id) => ({ id, name: `${shortId(id)} (deleted supplier)`, missing: true, ...(counts.get(id) ?? { total: 0, last: 0 }) }));
    return [...known, ...orphan].sort((a, b) => b.last - a.last || a.name.localeCompare(b.name));
  }, [suppliers.rows, messages.rows]);

  const selected = supplierList.find((s) => s.id === supplierId) ?? null;
  const thread = useMemo(() => (supplierId ? messages.rows.filter((m) => m.supplierId === supplierId).sort((a, b) => a.createdAt - b.createdAt) : []), [messages.rows, supplierId]);
  const supplierOrders = useMemo(() => (supplierId ? orders.rows.filter((o) => o.supplierId === supplierId).sort((a, b) => b.createdAt - a.createdAt) : []), [orders.rows, supplierId]);
  const orderById = useMemo(() => new Map(orders.rows.map((o) => [o.id, o])), [orders.rows]);

  const loading = suppliers.loading || messages.loading;
  const error = suppliers.error ?? messages.error ?? orders.error;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId || !selected) return;
    if (!form.body.trim()) {
      action.setError("Body is required.");
      return;
    }
    await action.run(
      "logSupplierMessage",
      {
        organizationId: orgId,
        supplierId,
        supplierName: selected.name,
        poId: optStr(form.poId),
        direction: form.direction,
        channel: form.channel,
        subject: optStr(form.subject),
        body: form.body.trim(),
        status: optStr(form.status),
        escalate: form.escalate,
      },
      () => {
        setShowAdd(false);
        setForm({ direction: "system", channel: "note", subject: "", body: "", status: "", poId: "", escalate: false });
        messages.reload();
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Panel
        title={`Suppliers (${supplierList.length})`}
        actions={
          <button type="button" className={btnGhostCls} onClick={() => { suppliers.reload(); messages.reload(); orders.reload(); }} disabled={loading}>
            Refresh
          </button>
        }
      >
        <ErrorBanner message={error} />
        {loading && supplierList.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-stone-500">Loading…</div>
        ) : supplierList.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-stone-500">No suppliers in this org</div>
        ) : (
          <ul className="max-h-[70vh] overflow-y-auto">
            {supplierList.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectSupplier(s.id)}
                  className={`flex w-full items-center justify-between gap-2 border-t border-stone-100 px-4 py-2 text-left text-[13px] hover:bg-stone-50 ${s.id === supplierId ? "bg-stone-100" : ""}`}
                >
                  <span className={`truncate ${s.missing ? "text-stone-500" : "font-medium"}`}>{s.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-stone-500">
                    {s.total}
                    {s.last ? ` · ${new Date(s.last).toLocaleDateString()}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={selected ? `Thread · ${selected.name} (${thread.length})` : "Thread"}
        actions={
          selected && (
            <>
              <button type="button" className={btnGhostCls} onClick={() => onSelectSupplier(null)}>
                Clear
              </button>
              <button type="button" className={btnCls} onClick={() => setShowAdd(!showAdd)}>
                Log message
              </button>
            </>
          )
        }
      >
        {!showAdd && <ErrorBanner message={action.error} />}
        {!selected ? (
          <div className="px-4 py-10 text-center text-[13px] text-stone-500">Select a supplier to view its message thread.</div>
        ) : (
          <>
            {showAdd && (
              <form onSubmit={submit} className="border-b border-stone-200 bg-stone-50 p-4">
                <ErrorBanner message={action.error} />
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Direction">
                    <Select value={form.direction} onChange={(v) => setForm({ ...form, direction: v })} options={DIRECTIONS.map((d) => ({ value: d, label: d }))} />
                  </Field>
                  <Field label="Channel">
                    <Select value={form.channel} onChange={(v) => setForm({ ...form, channel: v })} options={CHANNELS.map((c) => ({ value: c, label: c }))} />
                  </Field>
                  <Field label="Status (optional)">
                    <TextInput value={form.status} onChange={(v) => setForm({ ...form, status: v })} placeholder="sent / failed / needs_review" />
                  </Field>
                  <Field label="Purchase order (optional)">
                    <Select value={form.poId} onChange={(v) => setForm({ ...form, poId: v })} allowEmpty="(none)" options={supplierOrders.map((o) => ({ value: o.id, label: `${shortId(o.id)} · ${o.status} · ${new Date(o.createdAt).toLocaleDateString()}` }))} />
                  </Field>
                  <Field label="Subject" className="md:col-span-4">
                    <TextInput value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} />
                  </Field>
                  <Field label="Body" className="md:col-span-4">
                    <textarea className={`${inputCls} min-h-[90px]`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="submit" className={btnCls} disabled={action.busy}>
                    {action.busy ? "Saving…" : "Append to thread"}
                  </button>
                  <button type="button" className={btnGhostCls} onClick={() => setShowAdd(false)}>
                    Cancel
                  </button>
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-stone-700">
                    <input type="checkbox" checked={form.escalate} onChange={(e) => setForm({ ...form, escalate: e.target.checked })} />
                    Escalate (notify org managers)
                  </label>
                  <span className="text-[11px] text-stone-500">Ledger-only — nothing is emailed from here.</span>
                </div>
              </form>
            )}
            {thread.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-stone-500">No messages with this supplier yet.</div>
            ) : (
              <ul className="max-h-[70vh] overflow-y-auto">
                {thread.map((m) => {
                  const po = m.poId ? orderById.get(m.poId) : undefined;
                  const inbound = m.direction === "inbound";
                  return (
                    <li key={m.id} className={`border-t border-stone-100 px-4 py-3 ${inbound ? "bg-stone-50/60" : ""}`}>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                        <Badge tone={inbound ? "warn" : m.direction === "system" ? "neutral" : "ok"}>{m.direction}</Badge>
                        <Badge>{m.channel}</Badge>
                        {m.status && <Badge tone={statusTone(m.status)}>{m.status}</Badge>}
                        <span className="font-mono">{formatTs(m.createdAt)}</span>
                        {m.poId && (
                          <span className="font-mono" title={m.poId}>
                            PO {shortId(m.poId)}
                            {po ? ` (${po.status})` : " (missing)"}
                          </span>
                        )}
                        <span className="ml-auto font-mono text-stone-400" title={m.id}>
                          {shortId(m.id)}
                        </span>
                      </div>
                      {m.subject && <div className="mt-1 text-[13px] font-medium">{m.subject}</div>}
                      <div className="mt-1 whitespace-pre-wrap break-words text-[13px] text-stone-800">{m.body}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
