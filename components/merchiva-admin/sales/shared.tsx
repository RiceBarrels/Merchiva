"use client";

/**
 * Shared bits for the /merchivaAdmin/sales panels: row types, a tiny mutation
 * hook that surfaces reducer errors inline, pager, tab strip, and a hook that
 * loads site-scoped tables (customer_points, site_booking) for one org.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { adminSql, sqlString } from "@/lib/merchiva-admin/client";

// ─── Row types ───────────────────────────────────────────────────────────────

export interface SalesRecordRow {
  id: string;
  organizationId: string;
  date: string;
  hour: number | null;
  actual: number;
  predicted: number | null;
  weather: string | null;
  footTraffic: number | null;
  isHoliday: boolean;
  squareOrderIds: string;
  createdAt: number;
}

export interface PaymentRow {
  id: string;
  organizationId: string;
  userId: string | null;
  orderId: string | null;
  amount: number;
  currency: string;
  method: string;
  status: string;
  processorId: string | null;
  processorResponse: string | null;
  customerName: string | null;
  notes: string | null;
  items: string | null;
  taxAmount: number;
  discountAmount: number;
  refundAmount: number | null;
  refundReason: string | null;
  refundedAt: number | null;
  createdAt: number;
}

export interface ExpenseRow {
  id: string;
  organizationId: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
  recurringPeriod: string | null;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: number;
}

export interface CouponRow {
  id: string;
  organizationId: string;
  code: string;
  discountType: string;
  discountValue: number;
  minPurchase: number;
  maxUses: number;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  active: boolean;
  description: string | null;
  createdAt: number;
}

export interface CustomerPointsRow {
  id: string;
  customerId: string;
  siteId: string;
  points: number;
  lifetimePoints: number;
  updatedAt: number;
}

export interface QueueEntryRow {
  id: string;
  organizationId: string;
  customerName: string;
  partySize: number;
  phone: string | null;
  status: string;
  estimatedWait: number;
  notes: string | null;
  queuedAt: number;
  seatedAt: number | null;
}

export interface SiteBookingRow {
  id: string;
  siteId: string;
  customerId: string | null;
  date: string;
  time: string;
  partySize: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  createdAt: number;
}

export interface SiteRow {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  published: boolean;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function money(n: unknown, currency?: string): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${s} ${currency.toUpperCase()}` : s;
}

/** Empty string → null, so option args reach the reducer as `none`. */
export function optStr(s: string): string | null {
  const v = s.trim();
  return v === "" ? null : v;
}

export function optNum(s: string): number | null {
  const v = s.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ─── Mutation hook ───────────────────────────────────────────────────────────

/**
 * Runs an async write, keeps a busy flag and the last error message (the
 * reducer's real message via adminCall). Returns true on success.
 */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { busy, error, run, clear };
}

// ─── Site-scoped tables ──────────────────────────────────────────────────────

/**
 * customer_points and site_booking are keyed by site_id, not organization_id.
 * Load the org's sites, then one query per site, and merge client-side.
 */
export function useSiteScoped<T extends object>(orgId: string, table: string) {
  const [tick, setTick] = useState(0);
  const key = `${orgId}|${table}|${tick}`;
  const [result, setResult] = useState<{ key: string; sites: SiteRow[]; rows: T[]; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminSql<SiteRow>(`SELECT * FROM site WHERE organization_id = ${sqlString(orgId)}`)
      .then(async (sites) => {
        const perSite = await Promise.all(
          sites.map((s) => adminSql<T>(`SELECT * FROM ${table} WHERE site_id = ${sqlString(s.id)}`)),
        );
        if (!cancelled) setResult({ key, sites, rows: perSite.flat(), error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key, sites: [], rows: [], error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, orgId, table]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  // Previous data stays visible while a reload is in flight.
  return { sites: result?.sites ?? [], rows: result?.rows ?? [], loading: result?.key !== key, error: result?.error ?? null, reload };
}

// ─── UI bits ─────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 50;

/** Client-side pager; the current page is clamped when the filtered set shrinks. */
export function usePage(total: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safe = Math.min(page, pages - 1);
  const go = useCallback((p: number) => setPage(Math.max(0, p)), []);
  return { page: safe, pages, setPage: go, slice: <T,>(rows: T[]) => rows.slice(safe * PAGE_SIZE, safe * PAGE_SIZE + PAGE_SIZE) };
}

export function Pager({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (p: number) => void }) {
  if (total === 0) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-3 py-2 text-[12px] text-stone-600">
      <span className="font-mono tabular-nums">
        {from}–{to} of {total}
      </span>
      <span className="inline-flex gap-1">
        <button type="button" className={pagerBtn} disabled={page <= 0} onClick={() => onChange(page - 1)}>
          Prev
        </button>
        <span className="px-1 font-mono tabular-nums">
          {page + 1} / {pages}
        </span>
        <button type="button" className={pagerBtn} disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}
const pagerBtn = "rounded-[0.15rem] border border-stone-300 bg-white px-2 py-0.5 text-[12px] hover:bg-stone-50 disabled:opacity-40";

export function TabStrip<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-stone-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={
            "-mb-px border-b-2 px-3 py-1.5 text-[13px] font-medium " +
            (t.id === active ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-stone-500">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[0.15rem] border border-stone-200 bg-white px-3 py-2">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">{children}</div>;
}

export function EmptyOrg() {
  return (
    <div className="rounded-[0.15rem] border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
      Select an organization to view its sales and finance data.
    </div>
  );
}
