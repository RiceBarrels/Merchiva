"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { Field, FilterBar, Pager, Stat, isoDaysAgo, isoToday, money, optNum, optStr, shortId, useMutation, usePage, type SalesRecordRow } from "./shared";

/**
 * sales_record for one org. Only `addSalesRecord` exists in the module; there
 * is no update/delete reducer, so rows are read-only once written.
 */
export function SalesRecordsPanel({ orgId }: { orgId: string }) {
  const { rows, loading, error, reload } = useAdminQuery<SalesRecordRow>(
    `SELECT * FROM sales_record WHERE organization_id = ${sqlString(orgId)}`,
  );
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoToday());
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const mut = useMutation();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
      .filter((r) => {
        if (!needle) return true;
        return (
          r.id.toLowerCase().includes(needle) ||
          r.date.includes(needle) ||
          (r.weather ?? "").toLowerCase().includes(needle) ||
          r.squareOrderIds.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => (a.date === b.date ? (b.hour ?? -1) - (a.hour ?? -1) : b.date.localeCompare(a.date)));
  }, [rows, from, to, q]);

  const totals = useMemo(() => {
    let revenue = 0;
    let predicted = 0;
    let traffic = 0;
    for (const r of filtered) {
      revenue += r.actual;
      predicted += r.predicted ?? 0;
      traffic += r.footTraffic ?? 0;
    }
    return { count: filtered.length, revenue, predicted, traffic };
  }, [filtered]);

  const pager = usePage(filtered.length);

  // ─── Add form ─────────────────────────────────────────────────────────────
  const [fDate, setFDate] = useState(isoToday());
  const [fHour, setFHour] = useState("");
  const [fActual, setFActual] = useState("");
  const [fPredicted, setFPredicted] = useState("");
  const [fWeather, setFWeather] = useState("");
  const [fTraffic, setFTraffic] = useState("");
  const [fHoliday, setFHoliday] = useState(false);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const actual = Number(fActual);
    if (!Number.isFinite(actual)) return;
    const ok = await mut.run(() =>
      adminCall("addSalesRecord", {
        organizationId: orgId,
        date: fDate,
        hour: optNum(fHour),
        actual,
        predicted: optNum(fPredicted),
        weather: optStr(fWeather),
        footTraffic: optNum(fTraffic),
        isHoliday: fHoliday,
      }),
    );
    if (ok) {
      setShowAdd(false);
      setFActual("");
      setFPredicted("");
      setFHour("");
      setFWeather("");
      setFTraffic("");
      setFHoliday(false);
      reload();
    }
  }

  const columns: Column<SalesRecordRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.id}>{shortId(r.id)}</span> },
    { key: "date", header: "Date", render: (r) => <span className="font-mono tabular-nums">{r.date}</span> },
    { key: "hour", header: "Hour", className: "text-right", render: (r) => <span className="font-mono tabular-nums">{r.hour ?? "—"}</span> },
    { key: "actual", header: "Actual", className: "text-right", render: (r) => <span className="font-mono tabular-nums">{money(r.actual)}</span> },
    { key: "predicted", header: "Predicted", className: "text-right", render: (r) => <span className="font-mono tabular-nums text-stone-500">{money(r.predicted)}</span> },
    { key: "footTraffic", header: "Traffic", className: "text-right", render: (r) => <span className="font-mono tabular-nums">{r.footTraffic ?? "—"}</span> },
    { key: "weather", header: "Weather" },
    { key: "isHoliday", header: "Holiday", render: (r) => (r.isHoliday ? <Badge tone="warn">holiday</Badge> : <span className="text-stone-300">—</span>) },
    {
      key: "squareOrderIds",
      header: "Square orders",
      render: (r) => {
        let n = 0;
        try {
          const parsed: unknown = JSON.parse(r.squareOrderIds || "[]");
          n = Array.isArray(parsed) ? parsed.length : 0;
        } catch {
          n = 0;
        }
        return <span className="font-mono tabular-nums text-stone-500">{n}</span>;
      },
    },
    { key: "createdAt", header: "Created", render: (r) => <span className="text-stone-500">{formatTs(r.createdAt)}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Records" value={totals.count} />
        <Stat label="Revenue (actual)" value={money(totals.revenue)} />
        <Stat label="Predicted" value={money(totals.predicted)} />
        <Stat label="Foot traffic" value={totals.traffic} />
      </div>

      <Panel
        title="Sales records"
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>
              Refresh
            </button>
            <button type="button" className={btnCls} onClick={() => { setShowAdd((s) => !s); mut.clear(); }}>
              {showAdd ? "Close" : "Add record"}
            </button>
          </>
        }
      >
        <ErrorBanner message={error} />
        <ErrorBanner message={mut.error} />
        <Notice message={rows.length > 0 && filtered.length === 0 ? "No records match the current filter." : null} />
        {showAdd && (
          <form onSubmit={submitAdd} className="grid grid-cols-2 gap-2 border-b border-stone-200 bg-stone-50 px-3 py-3 sm:grid-cols-4 lg:grid-cols-8">
            <Field label="Date"><input type="date" className={inputCls} value={fDate} onChange={(e) => setFDate(e.target.value)} required /></Field>
            <Field label="Hour (0–23)"><input type="number" min={0} max={23} className={inputCls} value={fHour} onChange={(e) => setFHour(e.target.value)} placeholder="daily" /></Field>
            <Field label="Actual"><input type="number" step="0.01" className={inputCls} value={fActual} onChange={(e) => setFActual(e.target.value)} required /></Field>
            <Field label="Predicted"><input type="number" step="0.01" className={inputCls} value={fPredicted} onChange={(e) => setFPredicted(e.target.value)} /></Field>
            <Field label="Weather"><input className={inputCls} value={fWeather} onChange={(e) => setFWeather(e.target.value)} placeholder="sunny" /></Field>
            <Field label="Foot traffic"><input type="number" min={0} className={inputCls} value={fTraffic} onChange={(e) => setFTraffic(e.target.value)} /></Field>
            <Field label="Holiday">
              <span className="flex h-[32px] items-center">
                <input type="checkbox" checked={fHoliday} onChange={(e) => setFHoliday(e.target.checked)} />
              </span>
            </Field>
            <div className="flex items-end">
              <button type="submit" className={btnCls} disabled={mut.busy}>{mut.busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        )}
        <FilterBar>
          <Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Search" className="min-w-[200px] flex-1">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="id, date, weather, square order id" />
          </Field>
          <button type="button" className={btnGhostCls} onClick={() => { setFrom(""); setTo(""); setQ(""); }}>
            Clear
          </button>
        </FilterBar>
        <DataTable columns={columns} rows={pager.slice(filtered)} loading={loading} rowKey={(r) => r.id} empty="No sales records" />
        <Pager page={pager.page} pages={pager.pages} total={filtered.length} onChange={pager.setPage} />
        <div className="border-t border-stone-200 px-3 py-1.5 text-[11px] text-stone-500">
          Records are append-only: the module has no update or delete reducer for sales_record.
        </div>
      </Panel>
    </div>
  );
}
