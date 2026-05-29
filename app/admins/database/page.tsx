"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { apiUrl } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TABLES = [
  "user",
  "organization",
  "org_member",
  "org_invitation",
  "settings",
  "inventory_item",
  "inventory_transaction",
  "sales_record",
  "product",
  "staff_member",
  "staff_role",
  "shift",
  "shift_preset",
  "payment",
  "chat_conversation",
  "chat_message",
  "site",
  "site_page",
  "site_order",
  "site_booking",
  "membership_tier",
  "notification",
  "supplier",
  "purchase_order",
  "expense",
  "coupon",
  "blog_post",
  "push_subscription",
  "todo",
  "punch_event",
];

interface QueryResult {
  schema: { elements: { name: { some?: string } }[] };
  rows: unknown[][];
}

function valueToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("__uuid__" in obj) return BigInt(obj.__uuid__ as string).toString(16).padStart(32, "0");
    if ("__identity__" in obj) return BigInt(obj.__identity__ as string).toString(16).padStart(64, "0");
    if ("__timestamp_micros_since_unix_epoch__" in obj) {
      const micros = Number(obj.__timestamp_micros_since_unix_epoch__);
      return new Date(Math.floor(micros / 1000)).toISOString();
    }
    if ("some" in obj) return valueToString(obj.some);
    if ("none" in obj) return "";
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return JSON.stringify(v);
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function AdminsDatabasePage() {
  const t = useT();
  const { getToken } = useAuth();
  const [selectedTable, setSelectedTable] = useState("blog_post");
  const [query, setQuery] = useState("SELECT * FROM blog_post LIMIT 50");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runQuery(q: string) {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(apiUrl("/api/admins/db/query"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Query failed");
        setResult(null);
      } else {
        const first = data.result?.[0];
        setResult(first ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function selectTable(name: string) {
    setSelectedTable(name);
    const q = `SELECT * FROM ${name} LIMIT 50`;
    setQuery(q);
    runQuery(q);
  }

  useEffect(() => {
    runQuery(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols = result?.schema?.elements?.map((c) => c.name?.some ?? "") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
          / {t("admins.shellTag")} / database
        </div>
        <h1 className="mt-2 font-sans text-[28px] font-semibold tracking-tight text-stone-950">
          {t("admins.database.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-stone-600">
          {t("admins.database.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <aside className="rounded border border-stone-200 bg-white p-2">
          <div className="px-2 py-1 font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
            {t("admins.database.tables")} ({TABLES.length})
          </div>
          <ul className="mt-1 max-h-[60vh] overflow-y-auto">
            {TABLES.map((tbl) => (
              <li key={tbl}>
                <button
                  type="button"
                  onClick={() => selectTable(tbl)}
                  className={
                    "w-full rounded px-2 py-1 text-left font-mono text-[12px] transition-colors " +
                    (selectedTable === tbl
                      ? "bg-stone-900 text-white"
                      : "text-stone-700 hover:bg-stone-100")
                  }
                >
                  {tbl}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="space-y-3">
          <div className="rounded border border-stone-200 bg-white p-3">
            <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
              {t("admins.database.queryLabel")}
            </label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runQuery(query);
              }}
              className="mt-1 font-mono text-[12px]"
              placeholder="SELECT * FROM blog_post LIMIT 50"
            />
            <div className="mt-2 flex gap-2">
              <Button onClick={() => runQuery(query)} disabled={loading} size="sm">
                {loading ? t("admins.database.running") : t("admins.database.run")}
              </Button>
              <span className="self-center font-mono text-[11px] text-stone-500">
                {result ? `${result.rows.length} ${t("admins.database.rows")}` : ""}
              </span>
            </div>
            {error ? (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 font-mono text-[12px] text-red-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded border border-stone-200 bg-white">
            {!result ? (
              <div className="px-4 py-10 text-center font-mono text-[12px] text-stone-500">
                {loading ? t("admins.database.running") : t("admins.database.noResult")}
              </div>
            ) : result.rows.length === 0 ? (
              <div className="px-4 py-10 text-center font-mono text-[12px] text-stone-500">
                {t("admins.database.empty")}
              </div>
            ) : (
              <table className="min-w-full divide-y divide-stone-200 text-[12px]">
                <thead className="bg-stone-50">
                  <tr>
                    {cols.map((c) => (
                      <th
                        key={c}
                        className="whitespace-nowrap px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono">
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-stone-50">
                      {row.map((cell, j) => {
                        const s = valueToString(cell);
                        return (
                          <td
                            key={j}
                            className="max-w-[280px] truncate px-3 py-1.5 text-stone-800"
                            title={s}
                          >
                            {s || <span className="text-stone-400">∅</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="font-mono text-[10.5px] text-stone-500">
            {t("admins.database.readonlyNote")}
          </p>
        </section>
      </div>
    </div>
  );
}
