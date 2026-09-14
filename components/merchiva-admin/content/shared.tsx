"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { adminCall, sqlString } from "@/lib/merchiva-admin/client";
import { btnGhostCls } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";

/* ---------------------------------------------------------------------- */
/* Row types shared by more than one tab                                    */
/* ---------------------------------------------------------------------- */

export interface OrgMemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  displayName: string;
  email: string;
  permissions: string;
  status: string;
  joinedAt: number;
  punchInCode: string | null;
  hourlyRate: number | null;
}

export interface OrganizationLite {
  id: string;
  name: string;
}

/* ---------------------------------------------------------------------- */
/* Hooks                                                                     */
/* ---------------------------------------------------------------------- */

/** Members of the selected org + a label helper for identity hex strings. */
export function useOrgMembers(orgId: string | null) {
  const query = useAdminQuery<OrgMemberRow>(orgId ? `SELECT * FROM org_member WHERE organization_id = ${sqlString(orgId)}` : null);
  const byIdentity = useMemo(() => {
    const map = new Map<string, OrgMemberRow>();
    for (const m of query.rows) map.set(m.userId.toLowerCase(), m);
    return map;
  }, [query.rows]);
  const label = useCallback(
    (identity: string | null | undefined): string => {
      if (!identity) return "—";
      const m = byIdentity.get(identity.toLowerCase());
      if (!m) return shortId(identity);
      return m.displayName || m.email || shortId(identity);
    },
    [byIdentity],
  );
  const sorted = useMemo(
    () => [...query.rows].sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)),
    [query.rows],
  );
  return { ...query, byIdentity, label, sorted };
}

/** All organizations (id → name) for global views. */
export function useOrgNames() {
  const query = useAdminQuery<OrganizationLite>("SELECT * FROM organization");
  const byId = useMemo(() => new Map(query.rows.map((o) => [o.id, o.name])), [query.rows]);
  const name = useCallback((id: string) => byId.get(id) ?? shortId(id), [byId]);
  return { ...query, byId, name };
}

/** Wraps adminCall with busy/error state. `run` resolves true on success. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (reducer: string, args: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await adminCall(reducer, args);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

/**
 * Client-side pagination over an already-sorted array. With `startAtEnd` the
 * pager sticks to the last page until the user navigates (newest-last threads).
 * The requested page is clamped on read so shrinking lists never go out of range.
 */
export function usePaged<T>(items: T[], pageSize = 50, startAtEnd = false) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const [requested, setPage] = useState<number | null>(startAtEnd ? null : 0);
  const page = requested === null ? pageCount - 1 : Math.min(Math.max(0, requested), pageCount - 1);
  const slice = useMemo(() => items.slice(page * pageSize, page * pageSize + pageSize), [items, page, pageSize]);
  return { page, setPage: setPage as (page: number) => void, pageCount, slice, total: items.length, pageSize };
}

/* ---------------------------------------------------------------------- */
/* Small presentational helpers                                              */
/* ---------------------------------------------------------------------- */

export function shortId(id: string, keep = 10): string {
  return id.length > keep + 1 ? `${id.slice(0, keep)}…` : id;
}

export function Mono({ value, title }: { value: string | null | undefined; title?: string }) {
  if (!value) return <span className="text-stone-300">—</span>;
  return (
    <code className="font-mono text-[11px] text-stone-600" title={title ?? value}>
      {shortId(value)}
    </code>
  );
}

export function truncate(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
  label = "rows",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  if (total === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-3 py-2 text-[12px] text-stone-600">
      <span>
        {from}–{to} of {total} {label}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <button type="button" className={btnGhostCls} disabled={page <= 0} onClick={() => onChange(0)}>
          First
        </button>
        <button type="button" className={btnGhostCls} disabled={page <= 0} onClick={() => onChange(page - 1)}>
          Prev
        </button>
        <span className="font-mono text-[11px]">
          {page + 1}/{pageCount}
        </span>
        <button type="button" className={btnGhostCls} disabled={page >= pageCount - 1} onClick={() => onChange(page + 1)}>
          Next
        </button>
        <button type="button" className={btnGhostCls} disabled={page >= pageCount - 1} onClick={() => onChange(pageCount - 1)}>
          Last
        </button>
      </span>
    </div>
  );
}

export function NoOrg({ what }: { what: string }) {
  return (
    <div className="rounded-[0.15rem] border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-[13px] text-stone-500">
      Select an organization to view {what}.
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[12px] font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[0.15rem] border border-stone-200 bg-white px-3 py-2">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold">{value}</div>
    </div>
  );
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString();
}

export function fmtCost(n: number): string {
  return `$${n.toFixed(n >= 100 ? 2 : 4)}`;
}
