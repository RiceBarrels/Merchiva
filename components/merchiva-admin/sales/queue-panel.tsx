"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { Field, FilterBar, Pager, Stat, isoDaysAgo, isoToday, msToIso, optNum, optStr, shortId, useMutation, usePage, type QueueEntryRow } from "./shared";

const QUEUE_STATUSES = ["waiting", "notified", "seated", "left", "cancelled", "no_show"] as const;

function tone(s: string): "ok" | "warn" | "danger" | "neutral" {
  if (s === "seated") return "ok";
  if (s === "waiting" || s === "notified") return "warn";
  if (s === "cancelled" || s === "no_show" || s === "left") return "danger";
  return "neutral";
}

/** queue_entry via addQueueEntry / updateQueueStatus / deleteQueueEntry. */
export function QueuePanel({ orgId }: { orgId: string }) {
  const { rows, loading, error, reload } = useAdminQuery<QueueEntryRow>(`SELECT * FROM queue_entry WHERE organization_id = ${sqlString(orgId)}`);
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoToday());
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const mut = useMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [fName, setFName] = useState("");
  const [fParty, setFParty] = useState("2");
  const [fPhone, setFPhone] = useState("");
  const [fWait, setFWait] = useState("15");
  const [fNotes, setFNotes] = useState("");

  const statuses = useMemo(() => [...new Set([...QUEUE_STATUSES, ...rows.map((r) => r.status)])], [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        const d = msToIso(r.queuedAt);
        return (!from || d >= from) && (!to || d <= to);
      })
      .filter((r) => !status || r.status === status)
      .filter((r) => !needle || r.customerName.toLowerCase().includes(needle) || (r.phone ?? "").includes(needle) || (r.notes ?? "").toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle))
      .sort((a, b) => b.queuedAt - a.queuedAt);
  }, [rows, from, to, status, q]);

  const stats = useMemo(() => {
    let waiting = 0;
    let seated = 0;
    let guests = 0;
    for (const r of filtered) {
      if (r.status === "waiting" || r.status === "notified") waiting += 1;
      if (r.status === "seated") seated += 1;
      guests += r.partySize;
    }
    return { count: filtered.length, waiting, seated, guests };
  }, [filtered]);

  const pager = usePage(filtered.length);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const partySize = Math.trunc(Number(fParty));
    const estimatedWait = Math.trunc(Number(fWait));
    if (!Number.isFinite(partySize) || !Number.isFinite(estimatedWait)) return;
    const ok = await mut.run(() =>
      adminCall("addQueueEntry", { organizationId: orgId, customerName: fName.trim(), partySize, phone: optStr(fPhone), estimatedWait, notes: optStr(fNotes) }),
    );
    if (ok) {
      setShowAdd(false);
      setFName("");
      setFPhone("");
      setFNotes("");
      reload();
    }
  }

  async function setEntryStatus(r: QueueEntryRow, next: string) {
    if (next === r.status) return;
    const ok = await mut.run(() => adminCall("updateQueueStatus", { organizationId: orgId, entryId: r.id, status: next }));
    if (ok) reload();
  }

  async function remove(r: QueueEntryRow) {
    if (!window.confirm(`Remove queue entry for "${r.customerName}" (party of ${r.partySize})?`)) return;
    const ok = await mut.run(() => adminCall("deleteQueueEntry", { organizationId: orgId, entryId: r.id }));
    if (ok) reload();
  }

  const columns: Column<QueueEntryRow>[] = [
    { key: "queuedAt", header: "Queued", render: (r) => <span className="whitespace-nowrap">{formatTs(r.queuedAt)}</span> },
    { key: "customerName", header: "Customer", render: (r) => <span className="font-medium">{r.customerName}</span> },
    { key: "partySize", header: "Party", className: "text-right", render: (r) => <span className="font-mono tabular-nums">{r.partySize}</span> },
    { key: "phone", header: "Phone", render: (r) => <span className="font-mono text-[12px]">{r.phone ?? "—"}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={tone(r.status)}>{r.status}</Badge>
          <select className="rounded-[0.15rem] border border-stone-300 bg-white px-1 py-0.5 text-[11px]" value={r.status} onChange={(e) => setEntryStatus(r, e.target.value)} disabled={mut.busy}>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </span>
      ),
    },
    { key: "estimatedWait", header: "Est. wait", className: "text-right", render: (r) => <span className="font-mono tabular-nums">{r.estimatedWait} min</span> },
    { key: "seatedAt", header: "Seated", render: (r) => <span className="whitespace-nowrap text-stone-500">{formatTs(r.seatedAt)}</span> },
    { key: "notes", header: "Notes", render: (r) => <span className="text-stone-600">{r.notes ?? "—"}</span> },
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.id}>{shortId(r.id)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => <button type="button" className={btnDangerCls} onClick={() => remove(r)} disabled={mut.busy}>Remove</button>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Entries" value={stats.count} />
        <Stat label="Waiting" value={stats.waiting} />
        <Stat label="Seated" value={stats.seated} />
        <Stat label="Guests" value={stats.guests} />
      </div>

      <Panel
        title="Queue"
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>Refresh</button>
            <button type="button" className={btnCls} onClick={() => { setShowAdd((s) => !s); mut.clear(); }}>{showAdd ? "Close" : "Add entry"}</button>
          </>
        }
      >
        <ErrorBanner message={error} />
        <ErrorBanner message={mut.error} />
        <Notice message={rows.length > 0 && filtered.length === 0 ? "No entries match the current filter." : null} />
        {showAdd && (
          <form onSubmit={submitAdd} className="flex flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 px-3 py-3">
            <Field label="Customer name" className="min-w-[200px]"><input className={inputCls} value={fName} onChange={(e) => setFName(e.target.value)} required /></Field>
            <Field label="Party size"><input type="number" min={1} step={1} className={inputCls + " w-[90px]"} value={fParty} onChange={(e) => setFParty(e.target.value)} required /></Field>
            <Field label="Phone"><input className={inputCls + " w-[160px]"} value={fPhone} onChange={(e) => setFPhone(e.target.value)} /></Field>
            <Field label="Est. wait (min)"><input type="number" min={0} step={1} className={inputCls + " w-[110px]"} value={fWait} onChange={(e) => setFWait(e.target.value)} required /></Field>
            <Field label="Notes" className="min-w-[200px]"><input className={inputCls} value={fNotes} onChange={(e) => setFNotes(e.target.value)} /></Field>
            <button type="submit" className={btnCls} disabled={mut.busy || optNum(fParty) === null}>{mut.busy ? "Saving…" : "Add"}</button>
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
          <Field label="Search" className="min-w-[200px] flex-1">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, phone, notes, id" />
          </Field>
          <button type="button" className={btnGhostCls} onClick={() => { setFrom(""); setTo(""); setStatus(""); setQ(""); }}>Clear</button>
        </FilterBar>
        <DataTable columns={columns} rows={pager.slice(filtered)} loading={loading} rowKey={(r) => r.id} empty="No queue entries" />
        <Pager page={pager.page} pages={pager.pages} total={filtered.length} onChange={pager.setPage} />
      </Panel>
    </div>
  );
}
