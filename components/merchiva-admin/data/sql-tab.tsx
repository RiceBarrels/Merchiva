"use client";

/**
 * Free-form SELECT console. Cmd/Ctrl+Enter runs; results go through the
 * shared ResultGrid (search / sort / paginate / JSON view). The last 10
 * queries are remembered in localStorage.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { adminSql, type AdminRow } from "@/lib/merchiva-admin/client";
import { ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls } from "@/components/merchiva-admin/ui";
import { ResultGrid } from "./result-grid";
import { TABLES, TABLE_BY_NAME, type ColumnKind } from "./tables";

const STORAGE_KEY = "merchivaAdmin.sql.history";
const HISTORY_MAX = 10;
const DEFAULT_QUERY = "SELECT * FROM organization";

// ─── localStorage-backed history as an external store ──────────────────────
// (useSyncExternalStore avoids a setState-in-effect and hydrates safely: the
// server snapshot is always empty.)

const EMPTY: string[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedList: string[] = EMPTY;

function parseHistory(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, HISTORY_MAX) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getHistorySnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parseHistory(raw);
  }
  return cachedList;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribeHistory(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function writeHistory(list: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    // storage may be unavailable (private mode / quota); ignore
  }
  listeners.forEach((l) => l());
}

export function SqlTab({ initialQuery }: { initialQuery?: string }) {
  const [text, setText] = useState(initialQuery?.trim() || DEFAULT_QUERY);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [ran, setRan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const history = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getServerSnapshot);

  const run = useCallback(
    (q?: string) => {
      const query = (q ?? text).trim();
      if (!query || loading) return;
      if (q !== undefined) setText(query);
      setLoading(true);
      setError(null);
      const t0 = performance.now();
      adminSql(query)
        .then((r) => {
          setRows(r);
          setRan(query);
          setElapsed(Math.round(performance.now() - t0));
          writeHistory([query, ...getHistorySnapshot().filter((x) => x !== query)]);
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    },
    [text, loading]
  );

  // If the query is a plain `SELECT * FROM <known table>`, reuse its column types.
  const columnTypes = useMemo(() => {
    const m = ran?.match(/from\s+([a-z0-9_]+)/i);
    const def = m ? TABLE_BY_NAME[m[1].toLowerCase()] : undefined;
    if (!def) return undefined;
    const out: Record<string, ColumnKind> = {};
    for (const c of def.columns) out[c.name] = c.type;
    return out;
  }, [ran]);

  function clearHistory() {
    writeHistory([]);
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Query"
        actions={
          <>
            <select
              className="rounded-[0.15rem] border border-stone-300 bg-white px-1.5 py-1 font-mono text-[12px]"
              value=""
              onChange={(e) => {
                if (e.target.value) setText(`SELECT * FROM ${e.target.value}`);
              }}
            >
              <option value="">insert table…</option>
              {TABLES.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="button" className={btnCls} onClick={() => run()} disabled={loading || !text.trim()}>
              {loading ? "Running…" : "Run"}
            </button>
          </>
        }
      >
        <div className="px-4 py-3">
          <textarea
            className={`${inputCls} min-h-[110px] font-mono text-[12.5px]`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder="SELECT * FROM org_member WHERE organization_id = '…'"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                run();
              }
            }}
          />
          <div className="mt-1 text-[11px] text-stone-500">
            SpacetimeDB SQL: single <code className="font-mono">SELECT * FROM table [WHERE col = &apos;x&apos; [AND …]]</code>. snake_case names, single-quoted strings,
            bare numbers/booleans. No JOIN / ORDER BY / LIMIT / aggregates — sort and filter below. Cmd/Ctrl+Enter runs.
          </div>
        </div>
        {history.length > 0 && (
          <div className="border-t border-stone-200 px-4 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">Recent</span>
              <button type="button" className="text-[11px] text-stone-500 hover:underline" onClick={clearHistory}>
                clear
              </button>
            </div>
            <ul className="space-y-0.5">
              {history.map((q) => (
                <li key={q} className="flex items-center gap-2">
                  <button type="button" className="min-w-0 flex-1 truncate text-left font-mono text-[11.5px] text-stone-700 hover:underline" title={q} onClick={() => setText(q)}>
                    {q}
                  </button>
                  <button type="button" className={btnGhostCls} onClick={() => run(q)} disabled={loading}>
                    Run
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel
        title="Results"
        actions={ran ? <span className="text-[11px] text-stone-500">{elapsed !== null ? `${elapsed} ms` : ""}</span> : null}
      >
        <ErrorBanner message={error} />
        {!ran && !error && !loading && <Notice message="Run a query to see rows." />}
        {ran && <div className="border-b border-stone-200 bg-stone-50 px-4 py-1.5 font-mono text-[11px] text-stone-600">{ran}</div>}
        <ResultGrid rows={rows} loading={loading} columnTypes={columnTypes} empty={ran ? "No rows" : "Nothing run yet"} />
      </Panel>
    </div>
  );
}
