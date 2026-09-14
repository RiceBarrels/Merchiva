"use client";

/**
 * Generic browser for every public SpacetimeDB table: pick a table (row count
 * loads on selection), optionally build an ANDed WHERE clause, load, then
 * search / sort / page through the rows client-side.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminSql, sqlString, type AdminRow } from "@/lib/merchiva-admin/client";
import { Badge, ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls } from "@/components/merchiva-admin/ui";
import { ResultGrid } from "./result-grid";
import { TABLES, TABLE_BY_NAME, type ColumnKind, type TableColumn } from "./tables";

interface WhereClause {
  column: string;
  value: string;
}

type CountState = number | "loading" | "error";

function isNumeric(kind: ColumnKind): boolean {
  return kind === "number" || kind === "boolean";
}

function clauseSql(col: TableColumn | undefined, value: string): string {
  const v = value.trim();
  if (!col) return `${value} = ${sqlString(v)}`;
  if (col.type === "boolean") return `${col.sql} = ${v === "true" ? "true" : "false"}`;
  if (col.type === "number") return `${col.sql} = ${Number(v)}`;
  return `${col.sql} = ${sqlString(v)}`;
}

export function buildTableQuery(table: string, clauses: WhereClause[]): string {
  const def = TABLE_BY_NAME[table];
  const parts = clauses.map((c) => clauseSql(def?.columns.find((x) => x.name === c.column), c.value));
  return `SELECT * FROM ${table}${parts.length ? ` WHERE ${parts.join(" AND ")}` : ""}`;
}

export function TablesTab({ table, onTableChange }: { table: string; onTableChange: (name: string) => void }) {
  const def = table ? TABLE_BY_NAME[table] : undefined;
  const [counts, setCounts] = useState<Record<string, CountState>>({});
  const cache = useRef<Record<string, AdminRow[]>>({});

  const [clauses, setClauses] = useState<WhereClause[]>([]);
  const [whereCol, setWhereCol] = useState("");
  const [whereVal, setWhereVal] = useState("");

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const query = def ? buildTableQuery(def.name, clauses) : "";

  // Row count on selection: a full SELECT is the only way (no aggregates).
  // The rows are cached so the first unfiltered load is free.
  useEffect(() => {
    if (!def) return;
    if (counts[def.name] !== undefined && counts[def.name] !== "error") return;
    let cancelled = false;
    setCounts((c) => ({ ...c, [def.name]: "loading" }));
    adminSql(`SELECT * FROM ${def.name}`)
      .then((r) => {
        if (cancelled) return;
        cache.current[def.name] = r;
        setCounts((c) => ({ ...c, [def.name]: r.length }));
      })
      .catch(() => {
        if (!cancelled) setCounts((c) => ({ ...c, [def.name]: "error" }));
      })
      .finally(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.name]);

  // Reset the WHERE builder + results when the table changes (derived during render).
  const [prevTable, setPrevTable] = useState(table);
  if (prevTable !== table) {
    setPrevTable(table);
    setClauses([]);
    setWhereCol("");
    setWhereVal("");
    setRows([]);
    setLoadedQuery(null);
    setError(null);
    setElapsed(null);
  }

  const load = useCallback(() => {
    if (!def) return;
    const q = buildTableQuery(def.name, clauses);
    const cached = clauses.length === 0 ? cache.current[def.name] : undefined;
    if (cached) {
      setRows(cached);
      setLoadedQuery(q);
      setError(null);
      setElapsed(0);
      return;
    }
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    adminSql(q)
      .then((r) => {
        setRows(r);
        setLoadedQuery(q);
        setElapsed(Math.round(performance.now() - t0));
        if (clauses.length === 0) {
          cache.current[def.name] = r;
          setCounts((c) => ({ ...c, [def.name]: r.length }));
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [def, clauses]);

  const reload = useCallback(() => {
    if (!def) return;
    delete cache.current[def.name];
    setCounts((c) => {
      const n = { ...c };
      delete n[def.name];
      return n;
    });
    load();
  }, [def, load]);

  const columnTypes = useMemo(() => {
    const m: Record<string, ColumnKind> = {};
    for (const c of def?.columns ?? []) m[c.name] = c.type;
    return m;
  }, [def]);

  const selectedCol = def?.columns.find((c) => c.name === whereCol);

  function addClause() {
    if (!selectedCol) return;
    if (selectedCol.type === "number" && !Number.isFinite(Number(whereVal.trim()))) return;
    setClauses((cs) => [...cs, { column: selectedCol.name, value: selectedCol.type === "boolean" ? whereVal || "true" : whereVal }]);
    setWhereVal("");
  }

  const count = def ? counts[def.name] : undefined;

  return (
    <div className="space-y-4">
      <Panel title="Table">
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-stone-600">Table ({TABLES.length})</span>
            <select className={`${inputCls} min-w-[260px] font-mono`} value={table} onChange={(e) => onTableChange(e.target.value)}>
              <option value="">— select a table —</option>
              {TABLES.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                  {typeof counts[t.name] === "number" ? ` (${counts[t.name]})` : ""}
                </option>
              ))}
            </select>
          </label>
          {def && (
            <div className="flex items-center gap-2 pb-1.5 text-[12px] text-stone-600">
              <span>{def.columns.length} columns</span>
              <span className="text-stone-300">·</span>
              {count === "loading" ? (
                <span className="text-stone-400">counting…</span>
              ) : count === "error" ? (
                <Badge tone="danger">count failed</Badge>
              ) : typeof count === "number" ? (
                <span className="font-mono">{count.toLocaleString()} rows</span>
              ) : null}
            </div>
          )}
        </div>
        {def && (
          <div className="border-t border-stone-200 px-4 py-2">
            <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-stone-500">Columns</div>
            <div className="flex flex-wrap gap-1">
              {def.columns.map((c) => (
                <span key={c.name} className="rounded-[0.15rem] border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[11px]" title={`SQL: ${c.sql}`}>
                  {c.name}
                  <span className="text-stone-400">
                    : {c.type}
                    {c.optional ? "?" : ""}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {def && (
        <Panel
          title="Filter (WHERE)"
          actions={
            <>
              <Link href={`/merchivaAdmin/data?tab=sql&q=${encodeURIComponent(query)}`} className={btnGhostCls}>
                Open in SQL
              </Link>
              <button type="button" className={btnGhostCls} onClick={reload} disabled={loading}>
                Reload
              </button>
              <button type="button" className={btnCls} onClick={load} disabled={loading}>
                {loading ? "Loading…" : "Load rows"}
              </button>
            </>
          }
        >
          <div className="flex flex-wrap items-end gap-2 px-4 py-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-stone-600">Column</span>
              <select
                className={`${inputCls} min-w-[200px] font-mono`}
                value={whereCol}
                onChange={(e) => {
                  setWhereCol(e.target.value);
                  setWhereVal("");
                }}
              >
                <option value="">— column —</option>
                {def.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.sql} ({c.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-stone-600">Equals</span>
              {selectedCol?.type === "boolean" ? (
                <select className={`${inputCls} min-w-[120px]`} value={whereVal || "true"} onChange={(e) => setWhereVal(e.target.value)}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  className={`${inputCls} min-w-[280px] ${selectedCol && !isNumeric(selectedCol.type) && selectedCol.type !== "string" ? "font-mono" : ""}`}
                  type={selectedCol?.type === "number" ? "number" : "text"}
                  step="any"
                  placeholder={selectedCol ? (selectedCol.type === "timestamp" ? "unix ms" : `${selectedCol.type} value`) : "value"}
                  value={whereVal}
                  disabled={!selectedCol}
                  onChange={(e) => setWhereVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addClause();
                    }
                  }}
                />
              )}
            </label>
            <button type="button" className={btnGhostCls} onClick={addClause} disabled={!selectedCol || (selectedCol.type !== "boolean" && whereVal.trim() === "")}>
              Add clause
            </button>
            {selectedCol?.type === "identity" && (
              <span className="pb-1.5 text-[11px] text-amber-700">Identity columns cannot be reliably compared in WHERE; prefer loading and searching.</span>
            )}
          </div>
          {clauses.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-200 px-4 py-2">
              {clauses.map((c, i) => (
                <span key={`${c.column}-${i}`} className="inline-flex items-center gap-1 rounded-[0.15rem] border border-stone-300 bg-white px-1.5 py-0.5 font-mono text-[11px]">
                  {clauseSql(def.columns.find((x) => x.name === c.column), c.value)}
                  <button type="button" className="ml-1 text-stone-400 hover:text-red-700" onClick={() => setClauses((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove clause">
                    ×
                  </button>
                </span>
              ))}
              <button type="button" className="text-[11px] text-stone-500 hover:underline" onClick={() => setClauses([])}>
                clear all
              </button>
            </div>
          )}
          <div className="border-t border-stone-200 bg-stone-50 px-4 py-2 font-mono text-[11.5px] text-stone-700">{query}</div>
        </Panel>
      )}

      {def && (
        <Panel
          title="Rows"
          actions={
            loadedQuery ? (
              <span className="text-[11px] text-stone-500">
                {elapsed === 0 ? "from count cache" : elapsed !== null ? `${elapsed} ms` : ""}
              </span>
            ) : null
          }
        >
          <ErrorBanner message={error} />
          {!loadedQuery && !loading && !error && <Notice message="Build an optional filter, then Load rows." />}
          <ResultGrid
            rows={rows}
            loading={loading}
            columns={def.columns.map((c) => c.name)}
            columnTypes={columnTypes}
            empty={loadedQuery ? "No rows match" : "Nothing loaded yet"}
          />
        </Panel>
      )}

      {!def && <Notice message="Select a table to browse its rows." />}
    </div>
  );
}
