"use client";

import { useCallback, useState, type ReactNode } from "react";
import { adminCall } from "@/lib/merchiva-admin/client";
import { btnGhostCls, inputCls } from "@/components/merchiva-admin/ui";

/** Serialises reducer calls behind a busy flag and captures the reducer's message. */
export function useReducerAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (reducer: string, args: Record<string, unknown>, onDone?: () => void): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await adminCall(reducer, args);
      onDone?.();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-stone-500">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  step,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  min?: string;
}) {
  return (
    <input
      type={type}
      className={inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      step={step}
      min={min}
    />
  );
}

export function Select({ value, onChange, options, allowEmpty }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; allowEmpty?: string }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50/60 px-4 py-2">{children}</div>;
}

export function Pager({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-4 py-2 text-[12px] text-stone-600">
      <span className="font-mono text-[11px]">
        {total} row{total === 1 ? "" : "s"} · page {Math.min(page, Math.max(pageCount, 1))} / {Math.max(pageCount, 1)}
      </span>
      <span className="flex gap-1.5">
        <button type="button" className={btnGhostCls} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <button type="button" className={btnGhostCls} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}

export function usePager<T>(rows: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const slice = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { page: safePage, pageCount, slice, setPage };
}

/** Empty option → null, otherwise trimmed string. */
export function optStr(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

/** Empty option → null, otherwise a finite number (NaN → null). */
export function optNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function num(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function money(v: number): string {
  return Number.isFinite(v) ? v.toLocaleString(undefined, { style: "currency", currency: "USD" }) : "—";
}

export function qty(v: number): string {
  return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—";
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
