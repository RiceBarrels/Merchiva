"use client";

/**
 * Tiny presentational primitives for /merchivaAdmin pages. Stone palette,
 * sharp corners, compact density. Keep pages consistent by using these
 * instead of hand-rolled markup.
 */

import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-[0.15rem] border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-stone-900 disabled:bg-stone-50";
export const btnCls =
  "rounded-[0.15rem] bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-stone-800 disabled:opacity-60";
export const btnGhostCls =
  "rounded-[0.15rem] border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium hover:bg-stone-50 disabled:opacity-60";
export const btnDangerCls =
  "rounded-[0.15rem] border border-red-200 bg-white px-2.5 py-1 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60";

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">/ {eyebrow}</div>
        <h1 className="mt-1 font-sans text-[24px] font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[0.15rem] border border-stone-200 bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <div className="flex items-center gap-1.5">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700">{message}</div>;
}

export function Notice({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-[12px] text-stone-700">{message}</div>;
}

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends object>({
  columns,
  rows,
  loading,
  empty = "No rows",
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  empty?: string;
  rowKey: (row: T, index: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-stone-50 text-left font-mono text-[11px] uppercase tracking-wider text-stone-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-3 py-2 font-medium ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-stone-500">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-stone-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-t border-stone-100 align-top hover:bg-stone-50/60">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-1.5 ${c.className ?? ""}`}>
                    {c.render ? c.render(row) : cell((row as Record<string, unknown>)[c.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function cell(v: unknown): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-stone-300">—</span>;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return <code className="font-mono text-[11px]">{JSON.stringify(v)}</code>;
  return String(v);
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" }) {
  const tones = {
    neutral: "border-stone-300 text-stone-700",
    ok: "border-emerald-300 text-emerald-800",
    warn: "border-amber-300 text-amber-800",
    danger: "border-red-300 text-red-800",
  } as const;
  return <span className={`inline-block rounded-[0.15rem] border px-1.5 py-0.5 font-mono text-[10.5px] uppercase ${tones[tone]}`}>{children}</span>;
}
