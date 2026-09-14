"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { adminSql, sqlString } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "../use-admin-query";
import { Badge } from "../ui";
import type { OrgMemberRow } from "./types";

/** `SELECT * FROM <table> WHERE organization_id = '<orgId>'` or null when no org. */
export function orgQuery(table: string, orgId: string | null): string | null {
  return orgId ? `SELECT * FROM ${table} WHERE organization_id = ${sqlString(orgId)}` : null;
}

/** Every org_member row for the org, sorted by name, plus a lookup helper. */
export function useOrgMembers(orgId: string | null) {
  const q = useAdminQuery<OrgMemberRow>(orgQuery("org_member", orgId));
  const members = useMemo(() => [...q.rows].sort((a, b) => a.displayName.localeCompare(b.displayName)), [q.rows]);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const byUserId = useMemo(() => new Map(members.map((m) => [m.userId.toLowerCase(), m])), [members]);
  const nameOf = useCallback((id: string | null | undefined): string => (id ? (byId.get(id)?.displayName ?? id) : "—"), [byId]);
  const nameOfUser = useCallback((identity: string | null | undefined): string => {
    if (!identity) return "—";
    return byUserId.get(identity.toLowerCase())?.displayName ?? shortId(identity);
  }, [byUserId]);
  return { ...q, members, byId, byUserId, nameOf, nameOfUser };
}

const EMPTY_ROWS: never[] = [];

/**
 * Run several SQL queries in parallel (e.g. one per role id) and flatten the
 * results. Re-runs when the query list changes; `reload()` re-runs manually.
 * Rows for the previous key are kept visible while a reload is in flight.
 */
export function useMultiQuery<T extends object>(queries: string[]) {
  const [result, setResult] = useState<{ key: string; tick: number; rows: T[]; error: string | null }>({ key: "", tick: -1, rows: [], error: null });
  const [tick, setTick] = useState(0);
  const key = queries.join("\n");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    Promise.all(key.split("\n").map((q) => adminSql<T>(q)))
      .then((parts) => {
        if (!cancelled) setResult({ key, tick, rows: parts.flat(), error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key, tick, rows: [], error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const sameKey = Boolean(key) && result.key === key;
  const fresh = sameKey && result.tick === tick;
  const rows: T[] = sameKey ? result.rows : EMPTY_ROWS;
  const loading = Boolean(key) && !fresh;
  const error = fresh ? result.error : null;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { rows, loading, error, reload };
}

/**
 * Busy/error state for reducer calls. `run(key, fn, { confirm, after })`
 * shows a confirm dialog when asked, captures the reducer's error message
 * and calls `after` (usually `reload`) on success.
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, fn: () => Promise<void>, opts: { confirm?: string; after?: () => void } = {}): Promise<boolean> => {
      if (opts.confirm && !window.confirm(opts.confirm)) return false;
      setBusy(key);
      setError(null);
      try {
        await fn();
        opts.after?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [],
  );
  return { busy, error, setError, run };
}

export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <code className="font-mono text-[11px] text-stone-600" title={title}>
      {children}
    </code>
  );
}

export function IdCell({ id }: { id: string | null | undefined }) {
  return <Mono title={id ?? undefined}>{shortId(id)}</Mono>;
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-stone-500">{label}</span>
      {children}
    </label>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 md:grid-cols-4">{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 border-t border-stone-200 bg-stone-50 px-4 py-2.5">{children}</div>;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "").toLowerCase();
  const tone =
    s === "approved" || s === "accepted" || s === "completed" || s === "active" || s === "pass" || s === "resolved"
      ? "ok"
      : s === "pending" || s === "skipped"
        ? "warn"
        : s === "denied" || s === "rejected" || s === "fail" || s === "disabled" || s === "cancelled"
          ? "danger"
          : "neutral";
  return <Badge tone={tone}>{status || "—"}</Badge>;
}

export function EmptyOrgState() {
  return (
    <div className="rounded-[0.15rem] border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-[13px] text-stone-500">
      Select an organization to load its staffing data.
    </div>
  );
}

export function money(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v: unknown = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local datetime-input value (YYYY-MM-DDTHH:MM) for a unix-ms timestamp. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function toInt(v: string, fallback = 0): number {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function toNum(v: string, fallback = 0): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
