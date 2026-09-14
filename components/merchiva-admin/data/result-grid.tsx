"use client";

/**
 * Generic client-side results grid for the data tools: full-text search,
 * click-to-sort headers, pagination, column chooser, row detail panel with
 * copy buttons, JSON view and export-to-clipboard. Rows are plain decoded
 * SpacetimeDB rows (camelCase keys).
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatTs, type AdminRow } from "@/lib/merchiva-admin/client";
import { btnGhostCls, inputCls } from "@/components/merchiva-admin/ui";
import type { ColumnKind } from "./tables";

export const PAGE_SIZES = [25, 50, 100, 500] as const;
const TRUNCATE_AT = 72;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTITY_RE = /^[0-9a-f]{64}$/i;

type SortDir = "asc" | "desc";

export function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function compare(a: unknown, b: unknown): number {
  const an = a === null || a === undefined || a === "";
  const bn = b === null || b === undefined || b === "";
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return stringify(a).localeCompare(stringify(b), undefined, { numeric: true });
}

function isIdLike(key: string, value: unknown, type: ColumnKind | undefined): boolean {
  if (typeof value !== "string" || value === "") return false;
  if (type === "identity" || type === "uuid") return true;
  if (/(^id$|Id$|_id$)/.test(key)) return true;
  return UUID_RE.test(value) || IDENTITY_RE.test(value);
}

export function useCopy(): { copied: string | null; copy: (text: string, label: string) => void } {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = (text: string, label: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopied("Clipboard unavailable");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(label))
      .catch(() => setCopied("Copy failed"));
  };
  return { copied, copy };
}

function CellValue({ value, type, expanded, onToggle }: { value: unknown; type?: ColumnKind; expanded: boolean; onToggle: () => void }) {
  if (value === null || value === undefined || value === "") return <span className="text-stone-300">—</span>;
  if (typeof value === "boolean") return <span className={value ? "text-emerald-700" : "text-stone-500"}>{value ? "true" : "false"}</span>;
  if (type === "timestamp" && typeof value === "number") {
    return (
      <span title={String(value)} className="whitespace-nowrap text-stone-700">
        {formatTs(value)}
      </span>
    );
  }
  const mono = type === "identity" || type === "uuid" || typeof value === "object" || typeof value === "number";
  const text = stringify(value);
  const long = text.length > TRUNCATE_AT;
  const shown = long && !expanded ? text.slice(0, TRUNCATE_AT) + "…" : text;
  return (
    <span
      title={long && !expanded ? text.slice(0, 600) : undefined}
      onClick={(e) => {
        if (!long) return;
        e.stopPropagation();
        onToggle();
      }}
      className={`${mono ? "font-mono text-[11.5px]" : ""} ${long ? "cursor-pointer" : ""} ${expanded ? "whitespace-pre-wrap break-all" : "whitespace-nowrap"}`}
    >
      {shown}
    </span>
  );
}

export function ResultGrid({
  rows,
  loading,
  columns,
  columnTypes,
  empty = "No rows",
  toolbar,
}: {
  rows: AdminRow[];
  loading?: boolean;
  /** Column order; defaults to the union of keys across rows. */
  columns?: string[];
  columnTypes?: Record<string, ColumnKind>;
  empty?: string;
  toolbar?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(50);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [chooserOpen, setChooserOpen] = useState(false);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [jsonView, setJsonView] = useState(false);
  const { copied, copy } = useCopy();

  const allColumns = useMemo(() => {
    if (columns && columns.length > 0) return columns;
    const seen: string[] = [];
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!set.has(k)) {
          set.add(k);
          seen.push(k);
        }
      }
    }
    return seen;
  }, [columns, rows]);

  const visibleColumns = useMemo(() => allColumns.filter((c) => !hidden.has(c)), [allColumns, hidden]);

  // New result set: reset paging/selection but keep search + column prefs.
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setPage(0);
    setSelected(null);
    setExpanded(new Set());
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => allColumns.some((c) => stringify(r[c]).toLowerCase().includes(q)));
  }, [rows, search, allColumns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const out = filtered.map((r, i) => ({ r, i }));
    out.sort((a, b) => {
      const c = compare(a.r[key], b.r[key]);
      return (c !== 0 ? c : a.i - b.i) * (dir === "asc" ? 1 : -1);
    });
    return out.map((x) => x.r);
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  function toggleSort(key: string) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function toggleHidden(key: string) {
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function exportJson() {
    copy(JSON.stringify(sorted, null, 2), `Copied ${sorted.length} row${sorted.length === 1 ? "" : "s"} as JSON`);
  }

  const thCls = "whitespace-nowrap px-3 py-2 font-medium select-none cursor-pointer hover:text-stone-900";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search all cells…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <div className="relative">
          <button type="button" className={btnGhostCls} onClick={() => setChooserOpen((o) => !o)}>
            Columns ({visibleColumns.length}/{allColumns.length})
          </button>
          {chooserOpen && (
            <div className="absolute left-0 z-20 mt-1 max-h-80 w-64 overflow-auto rounded-[0.15rem] border border-stone-300 bg-white p-2 text-[12px] shadow-sm">
              <div className="mb-1 flex items-center justify-between border-b border-stone-200 pb-1">
                <span className="flex gap-2">
                  <button type="button" className="text-stone-600 hover:underline" onClick={() => setHidden(new Set())}>
                    All
                  </button>
                  <button type="button" className="text-stone-600 hover:underline" onClick={() => setHidden(new Set(allColumns))}>
                    None
                  </button>
                </span>
                <button type="button" className="text-stone-500 hover:text-stone-900" onClick={() => setChooserOpen(false)}>
                  Close
                </button>
              </div>
              {allColumns.length === 0 && <div className="py-1 text-stone-400">No columns</div>}
              {allColumns.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 py-0.5 font-mono text-[11.5px]">
                  <input type="checkbox" checked={!hidden.has(c)} onChange={() => toggleHidden(c)} />
                  {c}
                </label>
              ))}
            </div>
          )}
        </div>
        <button type="button" className={btnGhostCls} onClick={() => setJsonView((v) => !v)}>
          {jsonView ? "Table" : "JSON"}
        </button>
        <button type="button" className={btnGhostCls} onClick={exportJson} disabled={sorted.length === 0}>
          Export JSON
        </button>
        {toolbar}
        <span className="ml-auto flex items-center gap-2 text-[12px] text-stone-500">
          {copied && <span className="text-emerald-700">{copied}</span>}
          {sort && (
            <span className="font-mono text-[11px]">
              sort {sort.key} {sort.dir}
            </span>
          )}
          <span>
            {sorted.length === rows.length ? `${rows.length} rows` : `${sorted.length} of ${rows.length} rows`}
          </span>
        </span>
      </div>

      <div className="flex min-w-0">
        <div className="min-w-0 flex-1">
          {jsonView ? (
            <pre className="max-h-[70vh] overflow-auto px-3 py-2 font-mono text-[11.5px] leading-snug text-stone-800">
              {loading && pageRows.length === 0 ? "Loading…" : pageRows.length === 0 ? empty : JSON.stringify(pageRows, null, 2)}
            </pre>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-stone-50 text-left font-mono text-[11px] uppercase tracking-wider text-stone-500">
                  <tr>
                    {visibleColumns.map((c) => (
                      <th key={c} className={thCls} onClick={() => toggleSort(c)} title="Click to sort">
                        {c}
                        {sort?.key === c && <span className="ml-1 text-stone-900">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={Math.max(1, visibleColumns.length)} className="px-3 py-6 text-center text-stone-500">
                        Loading…
                      </td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={Math.max(1, visibleColumns.length)} className="px-3 py-6 text-center text-stone-500">
                        {empty}
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row, i) => {
                      const idx = start + i;
                      const isSel = selected === row;
                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelected(isSel ? null : row)}
                          className={`cursor-pointer border-t border-stone-100 align-top ${isSel ? "bg-stone-100" : "hover:bg-stone-50/60"}`}
                        >
                          {visibleColumns.map((c) => {
                            const ck = `${idx}:${c}`;
                            return (
                              <td key={c} className="max-w-[420px] px-3 py-1.5">
                                <CellValue
                                  value={row[c]}
                                  type={columnTypes?.[c]}
                                  expanded={expanded.has(ck)}
                                  onToggle={() =>
                                    setExpanded((s) => {
                                      const n = new Set(s);
                                      if (n.has(ck)) n.delete(ck);
                                      else n.add(ck);
                                      return n;
                                    })
                                  }
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 px-3 py-2 text-[12px] text-stone-600">
            <button type="button" className={btnGhostCls} onClick={() => setPage(0)} disabled={safePage === 0}>
              «
            </button>
            <button type="button" className={btnGhostCls} onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
              Prev
            </button>
            <span className="font-mono">
              {sorted.length === 0 ? "0" : `${start + 1}–${Math.min(start + pageSize, sorted.length)}`} / {sorted.length}
            </span>
            <button type="button" className={btnGhostCls} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>
              Next
            </button>
            <button type="button" className={btnGhostCls} onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}>
              »
            </button>
            <span className="font-mono text-stone-400">
              page {safePage + 1} / {pageCount}
            </span>
            <label className="ml-auto flex items-center gap-1.5">
              Rows / page
              <select
                className="rounded-[0.15rem] border border-stone-300 bg-white px-1.5 py-1 text-[12px]"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {selected && (
          <RowDetail row={selected} columnTypes={columnTypes} onClose={() => setSelected(null)} copy={copy} />
        )}
      </div>
    </div>
  );
}

function RowDetail({
  row,
  columnTypes,
  onClose,
  copy,
}: {
  row: AdminRow;
  columnTypes?: Record<string, ColumnKind>;
  onClose: () => void;
  copy: (text: string, label: string) => void;
}) {
  const ids = Object.entries(row).filter(([k, v]) => isIdLike(k, v, columnTypes?.[k]));
  const json = JSON.stringify(row, null, 2);
  return (
    <aside className="w-[380px] max-w-[45%] shrink-0 border-l border-stone-200 bg-stone-50/40">
      <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
        <span className="text-[12px] font-semibold">Row detail</span>
        <span className="flex gap-1.5">
          <button type="button" className={btnGhostCls} onClick={() => copy(json, "Copied row JSON")}>
            Copy JSON
          </button>
          <button type="button" className={btnGhostCls} onClick={onClose}>
            Close
          </button>
        </span>
      </div>
      {ids.length > 0 && (
        <div className="border-b border-stone-200 px-3 py-2">
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-stone-500">Ids</div>
          <ul className="space-y-1">
            {ids.map(([k, v]) => (
              <li key={k} className="flex items-center gap-2 text-[12px]">
                <span className="w-24 shrink-0 truncate text-stone-500" title={k}>
                  {k}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px]" title={String(v)}>
                  {String(v)}
                </code>
                <button type="button" className={btnGhostCls} onClick={() => copy(String(v), `Copied ${k}`)}>
                  Copy
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <pre className="max-h-[60vh] overflow-auto px-3 py-2 font-mono text-[11.5px] leading-snug text-stone-800 whitespace-pre-wrap break-all">{json}</pre>
    </aside>
  );
}
