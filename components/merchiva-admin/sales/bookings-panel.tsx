"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { Field, FilterBar, Pager, Stat, isoDaysAgo, isoToday, optStr, shortId, useMutation, usePage, useSiteScoped, type SiteBookingRow } from "./shared";

const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;

function tone(s: string): "ok" | "warn" | "danger" | "neutral" {
  if (s === "confirmed" || s === "completed") return "ok";
  if (s === "pending") return "warn";
  if (s === "cancelled" || s === "no_show") return "danger";
  return "neutral";
}

/**
 * site_booking is keyed by site_id — loaded for every site of the org.
 * Status changes via updateBookingStatus; new bookings via createSiteBooking.
 * There is no delete or edit-details reducer.
 */
export function BookingsPanel({ orgId }: { orgId: string }) {
  const { sites, rows, loading, error, reload } = useSiteScoped<SiteBookingRow>(orgId, "site_booking");
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(-30));
  const [status, setStatus] = useState("");
  const [siteId, setSiteId] = useState("");
  const [q, setQ] = useState("");
  const mut = useMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [fSite, setFSite] = useState("");
  const [fDate, setFDate] = useState(isoToday());
  const [fTime, setFTime] = useState("18:00");
  const [fParty, setFParty] = useState("2");
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fNotes, setFNotes] = useState("");

  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const statuses = useMemo(() => [...new Set([...BOOKING_STATUSES, ...rows.map((r) => r.status)])], [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
      .filter((r) => !status || r.status === status)
      .filter((r) => !siteId || r.siteId === siteId)
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.phone ?? "").includes(needle) || (r.email ?? "").toLowerCase().includes(needle) || (r.notes ?? "").toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }, [rows, from, to, status, siteId, q]);

  const stats = useMemo(() => {
    let pending = 0;
    let confirmed = 0;
    let guests = 0;
    for (const r of filtered) {
      if (r.status === "pending") pending += 1;
      if (r.status === "confirmed") confirmed += 1;
      guests += r.partySize;
    }
    return { count: filtered.length, pending, confirmed, guests };
  }, [filtered]);

  const pager = usePage(filtered.length);

  async function setBookingStatus(r: SiteBookingRow, next: string) {
    if (next === r.status) return;
    if ((next === "cancelled" || next === "no_show") && !window.confirm(`Mark booking for "${r.name}" on ${r.date} ${r.time} as ${next}?`)) return;
    const ok = await mut.run(() => adminCall("updateBookingStatus", { organizationId: orgId, bookingId: r.id, status: next }));
    if (ok) reload();
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const partySize = Math.trunc(Number(fParty));
    if (!fSite || !Number.isFinite(partySize)) return;
    const ok = await mut.run(() =>
      adminCall("createSiteBooking", {
        siteId: fSite,
        customerId: null,
        date: fDate,
        time: fTime,
        partySize,
        name: fName.trim(),
        phone: optStr(fPhone),
        email: optStr(fEmail),
        notes: optStr(fNotes),
      }),
    );
    if (ok) {
      setShowAdd(false);
      setFName("");
      setFPhone("");
      setFEmail("");
      setFNotes("");
      reload();
    }
  }

  const columns: Column<SiteBookingRow>[] = [
    { key: "date", header: "When", render: (r) => <span className="whitespace-nowrap font-mono tabular-nums">{r.date} {r.time}</span> },
    { key: "name", header: "Guest", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "partySize", header: "Party", className: "text-right", render: (r) => <span className="font-mono tabular-nums">{r.partySize}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={tone(r.status)}>{r.status}</Badge>
          <select className="rounded-[0.15rem] border border-stone-300 bg-white px-1 py-0.5 text-[11px]" value={r.status} onChange={(e) => setBookingStatus(r, e.target.value)} disabled={mut.busy}>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </span>
      ),
    },
    { key: "siteId", header: "Site", render: (r) => <span title={r.siteId}>{siteName.get(r.siteId) ?? <span className="font-mono text-[11px] text-stone-500">{shortId(r.siteId)}</span>}</span> },
    { key: "phone", header: "Phone", render: (r) => <span className="font-mono text-[12px]">{r.phone ?? "—"}</span> },
    { key: "email", header: "Email", render: (r) => <span className="text-[12px]">{r.email ?? "—"}</span> },
    { key: "customerId", header: "Customer", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.customerId ?? ""}>{r.customerId ? shortId(r.customerId) : "—"}</span> },
    { key: "notes", header: "Notes", render: (r) => <span className="text-stone-600">{r.notes ?? "—"}</span> },
    { key: "createdAt", header: "Created", render: (r) => <span className="whitespace-nowrap text-stone-500">{formatTs(r.createdAt)}</span> },
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.id}>{shortId(r.id)}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Bookings" value={stats.count} />
        <Stat label="Pending" value={stats.pending} />
        <Stat label="Confirmed" value={stats.confirmed} />
        <Stat label="Guests" value={stats.guests} />
      </div>

      <Panel
        title="Bookings"
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>Refresh</button>
            <button type="button" className={btnCls} onClick={() => { setShowAdd((s) => !s); setFSite(sites[0]?.id ?? ""); mut.clear(); }} disabled={sites.length === 0}>
              {showAdd ? "Close" : "Add booking"}
            </button>
          </>
        }
      >
        <ErrorBanner message={error} />
        <ErrorBanner message={mut.error} />
        <Notice message={!loading && sites.length === 0 ? "This organization has no sites; bookings are attached to sites." : null} />
        <Notice message={rows.length > 0 && filtered.length === 0 ? "No bookings match the current filter." : null} />
        {showAdd && (
          <form onSubmit={submitAdd} className="grid grid-cols-2 gap-2 border-b border-stone-200 bg-stone-50 px-3 py-3 sm:grid-cols-4 lg:grid-cols-8">
            <Field label="Site">
              <select className={inputCls} value={fSite} onChange={(e) => setFSite(e.target.value)} required>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" className={inputCls} value={fDate} onChange={(e) => setFDate(e.target.value)} required /></Field>
            <Field label="Time"><input type="time" className={inputCls} value={fTime} onChange={(e) => setFTime(e.target.value)} required /></Field>
            <Field label="Party"><input type="number" min={1} step={1} className={inputCls} value={fParty} onChange={(e) => setFParty(e.target.value)} required /></Field>
            <Field label="Guest name" className="col-span-2"><input className={inputCls} value={fName} onChange={(e) => setFName(e.target.value)} required /></Field>
            <Field label="Phone"><input className={inputCls} value={fPhone} onChange={(e) => setFPhone(e.target.value)} /></Field>
            <Field label="Email"><input type="email" className={inputCls} value={fEmail} onChange={(e) => setFEmail(e.target.value)} /></Field>
            <Field label="Notes" className="col-span-2 sm:col-span-3 lg:col-span-7"><input className={inputCls} value={fNotes} onChange={(e) => setFNotes(e.target.value)} /></Field>
            <div className="flex items-end">
              <button type="submit" className={btnCls} disabled={mut.busy}>{mut.busy ? "Saving…" : "Create"}</button>
            </div>
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
          <Field label="Site">
            <select className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">all sites</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Search" className="min-w-[200px] flex-1">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="guest, phone, email, notes, id" />
          </Field>
          <button type="button" className={btnGhostCls} onClick={() => { setFrom(""); setTo(""); setStatus(""); setSiteId(""); setQ(""); }}>Clear</button>
        </FilterBar>
        <DataTable columns={columns} rows={pager.slice(filtered)} loading={loading} rowKey={(r) => r.id} empty="No bookings" />
        <Pager page={pager.page} pages={pager.pages} total={filtered.length} onChange={pager.setPage} />
        <div className="border-t border-stone-200 px-3 py-1.5 text-[11px] text-stone-500">
          Bookings cannot be deleted or edited beyond status: the module has no such reducer. Use “cancelled” instead.
        </div>
      </Panel>
    </div>
  );
}
