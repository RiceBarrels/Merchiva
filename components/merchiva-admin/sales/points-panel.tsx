"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { Field, FilterBar, Pager, Stat, shortId, useMutation, usePage, useSiteScoped, type CustomerPointsRow } from "./shared";

/**
 * customer_points is keyed by site_id — rows are loaded for every site of the
 * selected org. Adjust via addPoints (positive or negative delta; lifetime only
 * grows) and redeemPoints (subtract, fails if insufficient).
 */
export function PointsPanel({ orgId }: { orgId: string }) {
  const { sites, rows, loading, error, reload } = useSiteScoped<CustomerPointsRow>(orgId, "customer_points");
  const [siteId, setSiteId] = useState("");
  const [q, setQ] = useState("");
  const mut = useMutation();

  const [target, setTarget] = useState<CustomerPointsRow | null>(null);
  const [mode, setMode] = useState<"add" | "redeem">("add");
  const [delta, setDelta] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [newSite, setNewSite] = useState("");
  const [newCustomer, setNewCustomer] = useState("");
  const [newPoints, setNewPoints] = useState("");

  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !siteId || r.siteId === siteId)
      .filter((r) => !needle || r.customerId.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle))
      .sort((a, b) => b.points - a.points);
  }, [rows, siteId, q]);

  const stats = useMemo(() => {
    let balance = 0;
    let lifetime = 0;
    for (const r of filtered) {
      balance += r.points;
      lifetime += r.lifetimePoints;
    }
    return { count: filtered.length, balance, lifetime };
  }, [filtered]);

  const pager = usePage(filtered.length);

  async function submitAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    const n = Math.trunc(Number(delta));
    if (!Number.isFinite(n) || n === 0) return;
    const ok = await mut.run(() =>
      adminCall(mode === "add" ? "addPoints" : "redeemPoints", { siteId: target.siteId, customerId: target.customerId, points: mode === "add" ? n : Math.abs(n) }),
    );
    if (ok) {
      setTarget(null);
      setDelta("");
      reload();
    }
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.trunc(Number(newPoints));
    if (!newSite || !newCustomer.trim() || !Number.isFinite(n)) return;
    const ok = await mut.run(() => adminCall("addPoints", { siteId: newSite, customerId: newCustomer.trim(), points: n }));
    if (ok) {
      setShowNew(false);
      setNewCustomer("");
      setNewPoints("");
      reload();
    }
  }

  const columns: Column<CustomerPointsRow>[] = [
    { key: "customerId", header: "Customer id", render: (r) => <span className="font-mono text-[12px]">{r.customerId}</span> },
    { key: "siteId", header: "Site", render: (r) => <span title={r.siteId}>{siteName.get(r.siteId) ?? <span className="font-mono text-[11px] text-stone-500">{shortId(r.siteId)}</span>}</span> },
    { key: "points", header: "Balance", className: "text-right", render: (r) => <span className="font-mono font-semibold tabular-nums">{r.points}</span> },
    { key: "lifetimePoints", header: "Lifetime", className: "text-right", render: (r) => <span className="font-mono tabular-nums text-stone-500">{r.lifetimePoints}</span> },
    { key: "updatedAt", header: "Updated", render: (r) => <span className="text-stone-500">{formatTs(r.updatedAt)}</span> },
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[11px] text-stone-500" title={r.id}>{shortId(r.id)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={btnGhostCls} onClick={() => { setTarget(r); setMode("add"); setDelta(""); mut.clear(); }}>Adjust</button>
          <button type="button" className={btnGhostCls} onClick={() => { setTarget(r); setMode("redeem"); setDelta(""); mut.clear(); }} disabled={r.points <= 0}>Redeem</button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Customers" value={stats.count} />
        <Stat label="Outstanding points" value={stats.balance} />
        <Stat label="Lifetime issued" value={stats.lifetime} />
      </div>

      <Panel
        title="Customer points"
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>Refresh</button>
            <button type="button" className={btnCls} onClick={() => { setShowNew((s) => !s); setNewSite(sites[0]?.id ?? ""); mut.clear(); }} disabled={sites.length === 0}>
              {showNew ? "Close" : "Grant points"}
            </button>
          </>
        }
      >
        <ErrorBanner message={error} />
        <ErrorBanner message={mut.error} />
        <Notice message={!loading && sites.length === 0 ? "This organization has no sites; customer points are attached to sites." : null} />
        <Notice message={rows.length > 0 && filtered.length === 0 ? "No rows match the current filter." : null} />
        {showNew && (
          <form onSubmit={submitNew} className="flex flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 px-3 py-3">
            <Field label="Site">
              <select className={inputCls} value={newSite} onChange={(e) => setNewSite(e.target.value)} required>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Customer id" className="min-w-[260px]"><input className={inputCls + " font-mono"} value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} required /></Field>
            <Field label="Points"><input type="number" step={1} className={inputCls + " w-[120px]"} value={newPoints} onChange={(e) => setNewPoints(e.target.value)} required /></Field>
            <button type="submit" className={btnCls} disabled={mut.busy}>{mut.busy ? "Saving…" : "Grant"}</button>
          </form>
        )}
        {target && (
          <form onSubmit={submitAdjust} className="flex flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 px-3 py-3">
            <div className="text-[12px] text-stone-600">
              {mode === "add" ? "Adjust" : "Redeem"} points for <span className="font-mono">{target.customerId}</span> (balance {target.points})
            </div>
            <Field label={mode === "add" ? "Delta (+/-)" : "Points to redeem"}>
              <input type="number" step={1} min={mode === "redeem" ? 1 : undefined} max={mode === "redeem" ? target.points : undefined} className={inputCls + " w-[140px]"} value={delta} onChange={(e) => setDelta(e.target.value)} required />
            </Field>
            <button type="submit" className={btnCls} disabled={mut.busy}>{mut.busy ? "Saving…" : "Apply"}</button>
            <button type="button" className={btnGhostCls} onClick={() => setTarget(null)}>Cancel</button>
            <Badge tone="warn">{mode === "add" ? "addPoints" : "redeemPoints"}</Badge>
          </form>
        )}
        <FilterBar>
          <Field label="Site">
            <select className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">all sites</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Search" className="min-w-[200px] flex-1">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="customer id, row id" />
          </Field>
        </FilterBar>
        <DataTable columns={columns} rows={pager.slice(filtered)} loading={loading} rowKey={(r) => r.id} empty="No customer points" />
        <Pager page={pager.page} pages={pager.pages} total={filtered.length} onChange={pager.setPage} />
        <div className="border-t border-stone-200 px-3 py-1.5 text-[11px] text-stone-500">
          A negative delta via addPoints lowers the balance without touching lifetime; redeemPoints refuses to go below zero. Rows cannot be deleted.
        </div>
      </Panel>
    </div>
  );
}
