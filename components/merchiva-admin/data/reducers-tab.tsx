"use client";

/**
 * Reducer console: every module reducer, with a form generated from its
 * parameter types (or a raw JSON args editor), invoked as the service
 * identity through adminCall. Keeps the last 20 calls in memory.
 */

import { useEffect, useMemo, useState } from "react";
import { adminCall } from "@/lib/merchiva-admin/client";
import { Badge, ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls } from "@/components/merchiva-admin/ui";

interface ReducerParam {
  name: string;
  type: string;
}
interface ReducerDef {
  name: string;
  params: ReducerParam[];
}

type FieldKind = "string" | "number" | "boolean" | "identity" | "timestamp" | "uuid" | "json";
interface ParsedType {
  kind: FieldKind;
  optional: boolean;
  inner: string;
}

const PRIMITIVES: Record<string, FieldKind> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  identity: "identity",
  timestamp: "timestamp",
  uuid: "uuid",
};

export function parseType(type: string): ParsedType {
  const optional = type.endsWith("?");
  const inner = optional ? type.slice(0, -1) : type;
  return { kind: PRIMITIVES[inner] ?? "json", optional, inner };
}

const DANGEROUS_RE = /^(delete|remove|clear|reset)/i;

type FieldValue = string | boolean;
type Values = Record<string, FieldValue>;
type OptSet = Record<string, boolean>;

interface HistoryEntry {
  id: number;
  at: number;
  reducer: string;
  args: Record<string, unknown>;
  ok: boolean;
  message: string;
  ms: number;
}

const HISTORY_MAX = 20;

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fieldError(name: string, msg: string): Error {
  return new Error(`${name}: ${msg}`);
}

/** Convert one form field to its wire value; throws on invalid input when strict. */
function fieldToArg(param: ReducerParam, values: Values, optSet: OptSet, strict: boolean): unknown {
  const p = parseType(param.type);
  if (p.optional && !optSet[param.name]) return null;
  const raw = values[param.name];
  const str = typeof raw === "string" ? raw : "";
  switch (p.kind) {
    case "string":
      return str;
    case "boolean":
      return raw === true;
    case "number": {
      if (str.trim() === "") {
        if (strict) throw fieldError(param.name, "number required");
        return null;
      }
      const n = Number(str);
      if (!Number.isFinite(n)) {
        if (strict) throw fieldError(param.name, `not a number: ${str}`);
        return str;
      }
      return n;
    }
    case "identity": {
      const v = str.trim().replace(/^0x/, "");
      if (strict && !/^[0-9a-f]{64}$/i.test(v)) throw fieldError(param.name, "identity must be 64 hex chars");
      return v;
    }
    case "uuid": {
      const v = str.trim();
      if (strict && v === "") throw fieldError(param.name, "uuid required");
      return v;
    }
    case "timestamp": {
      if (str.trim() === "") {
        if (strict) throw fieldError(param.name, "timestamp required");
        return null;
      }
      const ms = /^\d+$/.test(str.trim()) ? Number(str.trim()) : new Date(str).getTime();
      if (!Number.isFinite(ms)) {
        if (strict) throw fieldError(param.name, `invalid timestamp: ${str}`);
        return str;
      }
      return ms;
    }
    case "json": {
      if (str.trim() === "") {
        if (strict) throw fieldError(param.name, `JSON value required (${p.inner})`);
        return null;
      }
      try {
        return JSON.parse(str) as unknown;
      } catch (err) {
        if (strict) throw fieldError(param.name, `invalid JSON — ${err instanceof Error ? err.message : String(err)}`);
        return str;
      }
    }
  }
}

function buildArgs(def: ReducerDef, values: Values, optSet: OptSet, strict: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const param of def.params) out[param.name] = fieldToArg(param, values, optSet, strict);
  return out;
}

/** Populate form state from an args object (history reuse / raw → form). */
function argsToForm(def: ReducerDef, args: Record<string, unknown>): { values: Values; optSet: OptSet } {
  const values: Values = {};
  const optSet: OptSet = {};
  for (const param of def.params) {
    const p = parseType(param.type);
    const v = args[param.name];
    if (p.optional) optSet[param.name] = v !== null && v !== undefined;
    if (v === null || v === undefined) {
      values[param.name] = p.kind === "boolean" ? false : "";
      continue;
    }
    switch (p.kind) {
      case "boolean":
        values[param.name] = v === true || v === "true";
        break;
      case "timestamp":
        values[param.name] = typeof v === "number" ? toLocalInput(v) : typeof v === "string" ? toLocalInput(Date.parse(v)) : "";
        break;
      case "json":
        values[param.name] = typeof v === "string" ? v : JSON.stringify(v, null, 2);
        break;
      default:
        values[param.name] = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
  }
  return { values, optSet };
}

export function ReducersTab({ reducer, onReducerChange }: { reducer: string; onReducerChange: (name: string) => void }) {
  const [reducers, setReducers] = useState<ReducerDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [values, setValues] = useState<Values>({});
  const [optSet, setOptSet] = useState<OptSet>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState("{}");
  const [formError, setFormError] = useState<string | null>(null);

  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [openHistory, setOpenHistory] = useState<number | null>(null);
  /** Args to prefill once `reducer` (URL param) catches up after a history "Reuse". */
  const [pending, setPending] = useState<{ reducer: string; args: Record<string, unknown> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/merchiva-admin/reducers", { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { error?: string; reducers?: ReducerDef[] };
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        if (!cancelled) setReducers(Array.isArray(data.reducers) ? data.reducers : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => reducers.find((r) => r.name === reducer), [reducers, reducer]);

  // Reset (or prefill from a pending "Reuse") when a different reducer is picked.
  const [prevSelected, setPrevSelected] = useState(selected);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    if (selected) {
      const args = pending && pending.reducer === selected.name ? pending.args : {};
      const f = argsToForm(selected, args);
      setValues(f.values);
      setOptSet(f.optSet);
      setRawText(JSON.stringify(args, null, 2));
      setFormError(null);
      setResult(null);
      if (pending) setPending(null);
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return reducers;
    return reducers.filter((r) => r.name.toLowerCase().includes(q) || r.params.some((p) => p.name.toLowerCase().includes(q)));
  }, [reducers, filter]);

  function switchMode(toRaw: boolean) {
    if (!selected) return;
    setFormError(null);
    if (toRaw) {
      setRawText(JSON.stringify(buildArgs(selected, values, optSet, false), null, 2));
      setRawMode(true);
      return;
    }
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const f = argsToForm(selected, parsed as Record<string, unknown>);
        setValues(f.values);
        setOptSet(f.optSet);
      }
    } catch {
      // keep current form values when raw JSON is unparsable
    }
    setRawMode(false);
  }

  function setValue(name: string, v: FieldValue) {
    setValues((s) => ({ ...s, [name]: v }));
  }

  function submit() {
    if (!selected || calling) return;
    setFormError(null);
    setResult(null);
    let args: Record<string, unknown>;
    try {
      if (rawMode) {
        const parsed = JSON.parse(rawText) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Args must be a JSON object");
        args = parsed as Record<string, unknown>;
      } else {
        args = buildArgs(selected, values, optSet, true);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (DANGEROUS_RE.test(selected.name) && !window.confirm(`Call ${selected.name}? This looks destructive and runs as the platform identity.`)) return;

    const name = selected.name;
    const t0 = performance.now();
    setCalling(true);
    adminCall(name, args)
      .then(() => {
        const ms = Math.round(performance.now() - t0);
        const message = `Committed in ${ms} ms`;
        setResult({ ok: true, message });
        setHistory((h) => [{ id: Date.now(), at: Date.now(), reducer: name, args, ok: true, message, ms }, ...h].slice(0, HISTORY_MAX));
      })
      .catch((err: unknown) => {
        const ms = Math.round(performance.now() - t0);
        const message = err instanceof Error ? err.message : String(err);
        setResult({ ok: false, message });
        setHistory((h) => [{ id: Date.now(), at: Date.now(), reducer: name, args, ok: false, message, ms }, ...h].slice(0, HISTORY_MAX));
      })
      .finally(() => setCalling(false));
  }

  function reuse(entry: HistoryEntry) {
    const def = reducers.find((r) => r.name === entry.reducer);
    if (!def) return;
    if (selected && selected.name === def.name) {
      const f = argsToForm(def, entry.args);
      setValues(f.values);
      setOptSet(f.optSet);
      setRawText(JSON.stringify(entry.args, null, 2));
      setFormError(null);
      setResult(null);
      return;
    }
    // The URL param updates asynchronously; the render-time reset above picks this up.
    setPending({ reducer: def.name, args: entry.args });
    onReducerChange(def.name);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel title={`Reducers${reducers.length ? ` (${reducers.length})` : ""}`} className="lg:sticky lg:top-4 lg:self-start">
        <ErrorBanner message={loadError} />
        <div className="border-b border-stone-200 px-3 py-2">
          <input className={inputCls} placeholder="Search reducers…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <ul className="max-h-[70vh] overflow-auto">
          {loading && reducers.length === 0 && <li className="px-3 py-4 text-center text-[12px] text-stone-500">Loading…</li>}
          {!loading && filtered.length === 0 && <li className="px-3 py-4 text-center text-[12px] text-stone-500">No reducers</li>}
          {filtered.map((r) => (
            <li key={r.name}>
              <button
                type="button"
                onClick={() => onReducerChange(r.name)}
                className={`flex w-full items-center justify-between gap-2 border-t border-stone-100 px-3 py-1.5 text-left font-mono text-[12px] hover:bg-stone-50 ${r.name === reducer ? "bg-stone-100 font-semibold" : ""}`}
              >
                <span className={`truncate ${DANGEROUS_RE.test(r.name) ? "text-red-700" : ""}`}>{r.name}</span>
                <span className="shrink-0 text-[10.5px] text-stone-400">{r.params.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="min-w-0 space-y-4">
        <Panel
          title={selected ? selected.name : "Call a reducer"}
          actions={
            selected ? (
              <>
                {DANGEROUS_RE.test(selected.name) && <Badge tone="danger">destructive</Badge>}
                <button type="button" className={btnGhostCls} onClick={() => switchMode(!rawMode)}>
                  {rawMode ? "Form mode" : "Raw JSON mode"}
                </button>
                <button type="button" className={btnCls} onClick={submit} disabled={calling}>
                  {calling ? "Calling…" : "Call reducer"}
                </button>
              </>
            ) : null
          }
        >
          {!selected && <Notice message={loading ? "Loading reducers…" : "Pick a reducer on the left. Calls run as the platform service identity against production data."} />}
          {selected && (
            <>
              <ErrorBanner message={formError} />
              {result && (
                <div className={`border-b px-4 py-2 text-[12px] ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {result.ok ? "OK — " : "Reducer error — "}
                  {result.message}
                </div>
              )}
              {selected.params.length === 0 && !rawMode && <Notice message="This reducer takes no arguments." />}
              {rawMode ? (
                <div className="px-4 py-3">
                  <label className="mb-1 block text-[12px] font-medium text-stone-600">Args (JSON object)</label>
                  <textarea
                    className={`${inputCls} min-h-[220px] font-mono text-[12px]`}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    spellCheck={false}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                  />
                  <div className="mt-1 text-[11px] text-stone-500">
                    identity → 64-char hex string · timestamp → unix ms or ISO string · uuid → string · optional none → null · Cmd/Ctrl+Enter to call
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {selected.params.map((param) => (
                    <ParamField
                      key={param.name}
                      param={param}
                      value={values[param.name] ?? ""}
                      isSet={optSet[param.name] ?? false}
                      onChange={(v) => setValue(param.name, v)}
                      onToggleSet={(s) => setOptSet((o) => ({ ...o, [param.name]: s }))}
                      onSubmit={submit}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title={`History (${history.length})`} actions={history.length > 0 ? <button type="button" className={btnGhostCls} onClick={() => setHistory([])}>Clear</button> : null}>
          {history.length === 0 ? (
            <div className="px-4 py-4 text-center text-[12px] text-stone-500">No calls yet this session</div>
          ) : (
            <ul>
              {history.map((h) => (
                <li key={h.id} className="border-t border-stone-100 first:border-t-0">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-1.5 text-[12px]">
                    <Badge tone={h.ok ? "ok" : "danger"}>{h.ok ? "ok" : "error"}</Badge>
                    <button type="button" className="font-mono font-medium hover:underline" onClick={() => setOpenHistory((o) => (o === h.id ? null : h.id))}>
                      {h.reducer}
                    </button>
                    <span className="text-stone-500">{new Date(h.at).toLocaleTimeString()}</span>
                    <span className="font-mono text-[11px] text-stone-400">{h.ms} ms</span>
                    <span className={`min-w-0 flex-1 truncate ${h.ok ? "text-stone-600" : "text-red-700"}`} title={h.message}>
                      {h.message}
                    </span>
                    <button type="button" className={btnGhostCls} onClick={() => reuse(h)}>
                      Reuse
                    </button>
                  </div>
                  {openHistory === h.id && (
                    <pre className="max-h-64 overflow-auto border-t border-stone-100 bg-stone-50 px-4 py-2 font-mono text-[11.5px] leading-snug text-stone-800 whitespace-pre-wrap break-all">
                      {JSON.stringify(h.args, null, 2)}
                      {!h.ok && `\n\n// error: ${h.message}`}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ParamField({
  param,
  value,
  isSet,
  onChange,
  onToggleSet,
  onSubmit,
}: {
  param: ReducerParam;
  value: FieldValue;
  isSet: boolean;
  onChange: (v: FieldValue) => void;
  onToggleSet: (set: boolean) => void;
  onSubmit: () => void;
}) {
  const p = parseType(param.type);
  const disabled = p.optional && !isSet;
  const str = typeof value === "string" ? value : "";
  const enterSubmits = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  let control: React.ReactNode;
  switch (p.kind) {
    case "boolean":
      control = (
        <label className="inline-flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          {value === true ? "true" : "false"}
        </label>
      );
      break;
    case "number":
      control = <input type="number" step="any" className={`${inputCls} max-w-xs font-mono`} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} onKeyDown={enterSubmits} />;
      break;
    case "identity":
      control = (
        <input
          className={`${inputCls} font-mono`}
          placeholder="64 hex chars"
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterSubmits}
          spellCheck={false}
        />
      );
      break;
    case "uuid":
      control = (
        <input
          className={`${inputCls} max-w-md font-mono`}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterSubmits}
          spellCheck={false}
        />
      );
      break;
    case "timestamp": {
      const ms = str.trim() === "" ? null : /^\d+$/.test(str.trim()) ? Number(str.trim()) : new Date(str).getTime();
      control = (
        <div className="flex flex-wrap items-center gap-2">
          <input type="datetime-local" step="1" className={`${inputCls} max-w-xs font-mono`} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} onKeyDown={enterSubmits} />
          <button type="button" className={btnGhostCls} disabled={disabled} onClick={() => onChange(toLocalInput(Date.now()))}>
            Now
          </button>
          <span className="font-mono text-[11px] text-stone-500">{ms !== null && Number.isFinite(ms) ? `${ms} ms` : "—"}</span>
        </div>
      );
      break;
    }
    case "json":
      control = (
        <textarea
          className={`${inputCls} min-h-[90px] font-mono text-[12px]`}
          placeholder={p.inner.endsWith("[]") ? "[ … ]" : "{ … }"}
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterSubmits}
          spellCheck={false}
        />
      );
      break;
    default:
      control = <input className={inputCls} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} onKeyDown={enterSubmits} />;
  }

  return (
    <div className="grid gap-1 px-4 py-2.5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-4">
      <div className="min-w-0">
        <div className="truncate font-mono text-[12px] font-medium" title={param.name}>
          {param.name}
        </div>
        <div className="truncate font-mono text-[11px] text-stone-500" title={param.type}>
          {param.type}
        </div>
        {p.optional && (
          <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-stone-600">
            <input type="checkbox" checked={isSet} onChange={(e) => onToggleSet(e.target.checked)} />
            {isSet ? "set" : "unset (null)"}
          </label>
        )}
      </div>
      <div className="min-w-0">{control}</div>
    </div>
  );
}
