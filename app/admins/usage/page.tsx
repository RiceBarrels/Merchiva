"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { apiUrl } from "@/lib/api-client";
import { setAiUsageQuota } from "@/lib/spacetimedb/actions";
import { toast } from "sonner";

interface OrgUsage {
  organizationId: string;
  name: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  calls: number;
  quota: { tokenLimit: number | null; costLimit: number | null };
}

interface UsageResponse {
  month: string;
  totals: { cost: number; inputTokens: number; outputTokens: number; orgs: number };
  orgs: OrgUsage[];
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtCost(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function recentMonths(count = 12): string[] {
  // Build YYYY-MM strings backward from the current month without Date.now
  // arithmetic surprises — derive from today's ISO month.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export default function AdminUsagePage() {
  const t = useT();
  const { getToken } = useAuth();
  const months = useMemo(() => recentMonths(12), []);
  const [month, setMonth] = useState<string>(months[0]);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-org draft quota inputs, keyed by org id.
  const [drafts, setDrafts] = useState<Record<string, { tokens: string; cost: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(
    async (m: string) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const res = await fetch(apiUrl(`/api/admins/usage?month=${encodeURIComponent(m)}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setData(json as UsageResponse);
        const nextDrafts: Record<string, { tokens: string; cost: string }> = {};
        for (const o of (json as UsageResponse).orgs) {
          nextDrafts[o.organizationId] = {
            tokens: o.quota.tokenLimit != null ? String(o.quota.tokenLimit) : "",
            cost: o.quota.costLimit != null ? String(o.quota.costLimit) : "",
          };
        }
        setDrafts(nextDrafts);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    load(month);
  }, [month, load]);

  const saveQuota = useCallback(
    async (orgId: string) => {
      const draft = drafts[orgId];
      if (!draft) return;
      const tokenLimit = draft.tokens.trim() === "" ? null : Number(draft.tokens);
      const costLimit = draft.cost.trim() === "" ? null : Number(draft.cost);
      if ((tokenLimit != null && !Number.isFinite(tokenLimit)) || (costLimit != null && !Number.isFinite(costLimit))) {
        toast.error(t("adminsUsage.invalidNumber"));
        return;
      }
      setSaving(orgId);
      try {
        await setAiUsageQuota(orgId, tokenLimit, costLimit);
        toast.success(t("adminsUsage.quotaSaved"));
      } catch (e) {
        toast.error(t("adminsUsage.quotaFailed"), { description: e instanceof Error ? e.message : String(e) });
      } finally {
        setSaving(null);
      }
    },
    [drafts, t],
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
            / {t("admins.shellTag")}
          </div>
          <h1 className="mt-2 font-sans text-[28px] font-semibold tracking-tight text-stone-950">
            {t("adminsUsage.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-stone-600">
            {t("adminsUsage.subtitle")}
          </p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 rounded border border-stone-300 bg-white px-3 font-mono text-[12px] text-foreground"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Totals */}
      {data && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AdminStat label={t("adminsUsage.totalCost")} value={fmtCost(data.totals.cost)} />
          <AdminStat label={t("usage.inputTokens")} value={fmtTokens(data.totals.inputTokens)} />
          <AdminStat label={t("usage.outputTokens")} value={fmtTokens(data.totals.outputTokens)} />
          <AdminStat label={t("adminsUsage.orgs")} value={String(data.totals.orgs)} />
        </div>
      )}

      {error && (
        <div className="mt-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 font-mono text-[12px] text-stone-500">{t("adminsUsage.loading")}</div>
      ) : data && data.orgs.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-stone-300 bg-white px-4 py-10 text-center font-mono text-[12px] text-stone-500">
          {t("adminsUsage.empty")}
        </div>
      ) : (
        data && (
          <div className="mt-6 overflow-x-auto rounded border border-stone-200 bg-white">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left font-mono text-[11px] uppercase tracking-wider text-stone-500">
                  <th className="px-4 py-2.5 font-medium">{t("adminsUsage.org")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("usage.inputTokens")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("usage.outputTokens")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("adminsUsage.cost")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("usage.calls")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("adminsUsage.tokenQuota")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("adminsUsage.costQuota")}</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.orgs.map((o) => {
                  const draft = drafts[o.organizationId] ?? { tokens: "", cost: "" };
                  return (
                    <tr key={o.organizationId} className="border-b border-stone-100 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-foreground">{o.name}</div>
                        <div className="font-mono text-[10px] text-stone-400">{o.organizationId.slice(0, 12)}…</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtTokens(o.inputTokens)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtTokens(o.outputTokens)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-foreground">{fmtCost(o.cost)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-stone-500">{o.calls}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          value={draft.tokens}
                          placeholder="∞"
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [o.organizationId]: { ...draft, tokens: e.target.value } }))
                          }
                          className="h-8 w-28 rounded border border-stone-300 bg-white px-2 font-mono text-[12px]"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          value={draft.cost}
                          placeholder="∞"
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [o.organizationId]: { ...draft, cost: e.target.value } }))
                          }
                          className="h-8 w-24 rounded border border-stone-300 bg-white px-2 font-mono text-[12px]"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => saveQuota(o.organizationId)}
                          disabled={saving === o.organizationId}
                          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                        >
                          {saving === o.organizationId ? "…" : t("adminsUsage.save")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      <p className="mt-3 font-mono text-[11px] text-stone-400">{t("adminsUsage.quotaNote")}</p>
    </div>
  );
}

function AdminStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-200 bg-white px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-stone-950">{value}</div>
    </div>
  );
}
