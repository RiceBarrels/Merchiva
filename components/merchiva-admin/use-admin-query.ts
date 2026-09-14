"use client";

import { useCallback, useEffect, useState } from "react";
import { adminSql, type AdminRow } from "@/lib/merchiva-admin/client";

interface QueryResult<T> {
  query: string | null;
  tick: number;
  rows: T[];
  error: string | null;
}

/**
 * Run a read-only SQL query against a public table and keep the rows in state.
 * Pass `null` to skip (e.g. until an org is selected). `reload()` re-runs it.
 * While a reload is in flight the previous rows stay visible.
 */
export function useAdminQuery<T extends object = AdminRow>(query: string | null) {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<QueryResult<T>>({ query: null, tick: -1, rows: [], error: null });

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    adminSql<T>(query)
      .then((rows) => {
        if (!cancelled) setResult({ query, tick, rows, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ query, tick, rows: [], error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [query, tick]);

  const settled = result.query === query && result.tick === tick;
  const sameQuery = result.query === query;
  const rows: T[] = query && sameQuery ? result.rows : [];
  const loading = Boolean(query) && !settled;
  const error = query && settled ? result.error : null;

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setRows = useCallback((updater: T[] | ((prev: T[]) => T[])) => {
    setResult((prev) => ({ ...prev, rows: typeof updater === "function" ? updater(prev.rows) : updater }));
  }, []);

  return { rows, loading, error, reload, setRows };
}
