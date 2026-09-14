"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Field, Mono, NoOrg, Pager, Stat, fmtCost, fmtNum, truncate, useAction, useOrgMembers, useOrgNames, usePaged } from "./shared";

interface AiUsageRow {
  id: string;
  organizationId: string;
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  cost: number;
  day: string;
  month: string;
  createdAt: number;
  description: string | null;
}

interface AiUsageQuotaRow {
  organizationId: string;
  monthlyTokenLimit: number | null;
  monthlyCostLimit: number | null;
  updatedAt: number;
}

interface AiChatSessionRow {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  messages: string;
  summary: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AiJobRow {
  id: string;
  organizationId: string;
  sessionId: string;
  userId: string;
  prompt: string;
  status: string;
  partialText: string;
  finalText: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  consumed: boolean;
}

interface Aggregate {
  key: string;
  organizationId: string;
  month: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

function aggregate(rows: AiUsageRow[]): Aggregate[] {
  const map = new Map<string, Aggregate>();
  for (const r of rows) {
    const key = `${r.organizationId}|${r.month}`;
    const agg = map.get(key) ?? { key, organizationId: r.organizationId, month: r.month, calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    agg.calls += 1;
    agg.inputTokens += r.inputTokens;
    agg.outputTokens += r.outputTokens;
    agg.cost += r.cost;
    map.set(key, agg);
  }
  return [...map.values()].sort((a, b) => (a.month === b.month ? b.cost - a.cost : a.month < b.month ? 1 : -1));
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function messageCount(raw: string): number | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

function jobTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "done" || status === "completed" || status === "finished") return "ok";
  if (status === "error" || status === "failed") return "danger";
  if (status === "running" || status === "pending" || status === "queued" || status === "streaming") return "warn";
  return "neutral";
}

export function AiTab({ orgId }: { orgId: string | null }) {
  const usage = useAdminQuery<AiUsageRow>("SELECT * FROM ai_usage");
  const quotas = useAdminQuery<AiUsageQuotaRow>("SELECT * FROM ai_usage_quota");
  const orgs = useOrgNames();

  // The tab is remounted (keyed) when the org changes, so the initial scope is enough.
  const [scope, setScope] = useState<"org" | "all">(orgId ? "org" : "all");

  const scopedUsage = useMemo(
    () => (scope === "org" && orgId ? usage.rows.filter((r) => r.organizationId === orgId) : usage.rows),
    [usage.rows, scope, orgId],
  );
  const aggregates = useMemo(() => aggregate(scopedUsage), [scopedUsage]);
  const month = currentMonth();
  const thisMonth = useMemo(() => scopedUsage.filter((r) => r.month === month), [scopedUsage, month]);
  const totals = useMemo(
    () => ({
      calls: thisMonth.length,
      tokens: thisMonth.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
      cost: thisMonth.reduce((s, r) => s + r.cost, 0),
      allCost: scopedUsage.reduce((s, r) => s + r.cost, 0),
    }),
    [thisMonth, scopedUsage],
  );

  const rawSorted = useMemo(() => [...scopedUsage].sort((a, b) => b.createdAt - a.createdAt), [scopedUsage]);
  const rawPaged = usePaged(rawSorted, 50);
  const currentQuota = orgId ? quotas.rows.find((q) => q.organizationId === orgId) ?? null : null;

  const aggColumns: Column<Aggregate>[] = [
    { key: "month", header: "Month", className: "whitespace-nowrap font-mono" },
    { key: "org", header: "Organization", render: (a) => orgs.name(a.organizationId) },
    { key: "calls", header: "Calls", className: "text-right font-mono", render: (a) => fmtNum(a.calls) },
    { key: "inputTokens", header: "Input tokens", className: "text-right font-mono", render: (a) => fmtNum(a.inputTokens) },
    { key: "outputTokens", header: "Output tokens", className: "text-right font-mono", render: (a) => fmtNum(a.outputTokens) },
    { key: "total", header: "Total tokens", className: "text-right font-mono", render: (a) => fmtNum(a.inputTokens + a.outputTokens) },
    { key: "cost", header: "Cost", className: "text-right font-mono", render: (a) => fmtCost(a.cost) },
  ];

  const rawColumns: Column<AiUsageRow>[] = [
    { key: "createdAt", header: "At", className: "whitespace-nowrap text-stone-600", render: (r) => formatTs(r.createdAt) },
    ...(scope === "all" ? [{ key: "org", header: "Organization", render: (r: AiUsageRow) => orgs.name(r.organizationId) } as Column<AiUsageRow>] : []),
    { key: "feature", header: "Feature", render: (r) => <Badge>{r.feature}</Badge> },
    { key: "model", header: "Model", className: "font-mono text-[11px] text-stone-600" },
    { key: "userId", header: "User", render: (r) => <Mono value={r.userId} /> },
    { key: "inputTokens", header: "In", className: "text-right font-mono", render: (r) => fmtNum(r.inputTokens) },
    { key: "outputTokens", header: "Out", className: "text-right font-mono", render: (r) => fmtNum(r.outputTokens) },
    { key: "cost", header: "Cost", className: "text-right font-mono", render: (r) => fmtCost(r.cost) },
    { key: "description", header: "Description", render: (r) => (r.description ? truncate(r.description, 80) : <span className="text-stone-300">—</span>) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-stone-500">Scope</span>
        <button type="button" className={scope === "all" ? btnCls : btnGhostCls} onClick={() => setScope("all")}>
          All organizations
        </button>
        <button type="button" className={scope === "org" ? btnCls : btnGhostCls} disabled={!orgId} onClick={() => setScope("org")}>
          Selected org{orgId ? ` · ${orgs.name(orgId)}` : ""}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Calls · ${month}`} value={fmtNum(totals.calls)} />
        <Stat label={`Tokens · ${month}`} value={fmtNum(totals.tokens)} />
        <Stat label={`Cost · ${month}`} value={fmtCost(totals.cost)} />
        <Stat label="Cost · all time" value={fmtCost(totals.allCost)} />
      </div>

      <Panel
        title={`Usage by org × month (${aggregates.length})`}
        actions={
          <button type="button" className={btnGhostCls} onClick={() => usage.reload()}>
            Refresh
          </button>
        }
      >
        <ErrorBanner message={usage.error ?? orgs.error} />
        <DataTable columns={aggColumns} rows={aggregates} loading={usage.loading} empty="No AI usage recorded" rowKey={(a) => a.key} />
      </Panel>

      <QuotaPanel
        // Remount when the org or its stored quota changes so the form picks up fresh values.
        key={`${orgId ?? "none"}-${currentQuota?.updatedAt ?? 0}`}
        orgId={orgId}
        current={currentQuota}
        quotas={quotas.rows}
        loading={quotas.loading}
        error={quotas.error}
        reload={quotas.reload}
        orgName={orgs.name}
      />

      <Panel title={`Raw usage rows (${rawSorted.length})`}>
        <DataTable columns={rawColumns} rows={rawPaged.slice} loading={usage.loading} empty="No usage rows" rowKey={(r) => r.id} />
        <Pager page={rawPaged.page} pageCount={rawPaged.pageCount} total={rawPaged.total} pageSize={rawPaged.pageSize} onChange={rawPaged.setPage} label="usage rows" />
      </Panel>

      {orgId ? (
        <>
          <SessionsPanel orgId={orgId} />
          <JobsPanel orgId={orgId} />
        </>
      ) : (
        <NoOrg what="AI chat sessions and jobs" />
      )}
    </div>
  );
}

function QuotaPanel({
  orgId,
  current,
  quotas,
  loading,
  error,
  reload,
  orgName,
}: {
  orgId: string | null;
  current: AiUsageQuotaRow | null;
  quotas: AiUsageQuotaRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  orgName: (id: string) => string;
}) {
  const action = useAction();
  // Seeded from the stored quota; the parent remounts this panel whenever it changes.
  const [tokenLimit, setTokenLimit] = useState(current?.monthlyTokenLimit != null ? String(current.monthlyTokenLimit) : "");
  const [costLimit, setCostLimit] = useState(current?.monthlyCostLimit != null ? String(current.monthlyCostLimit) : "");
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    const tokens = tokenLimit.trim() === "" ? null : Number(tokenLimit);
    const cost = costLimit.trim() === "" ? null : Number(costLimit);
    if ((tokens !== null && (!Number.isFinite(tokens) || tokens < 0)) || (cost !== null && (!Number.isFinite(cost) || cost < 0))) {
      action.setError("Limits must be non-negative numbers (blank = unlimited)");
      return;
    }
    const ok = await action.run("setAiUsageQuota", { organizationId: orgId, monthlyTokenLimit: tokens, monthlyCostLimit: cost });
    if (ok) {
      setNotice("Quota saved");
      reload();
    }
  };

  const columns: Column<AiUsageQuotaRow>[] = [
    { key: "org", header: "Organization", render: (q) => orgName(q.organizationId) },
    { key: "orgId", header: "Org id", render: (q) => <Mono value={q.organizationId} /> },
    { key: "tokens", header: "Monthly token limit", className: "text-right font-mono", render: (q) => (q.monthlyTokenLimit == null ? <Badge>unlimited</Badge> : fmtNum(q.monthlyTokenLimit)) },
    { key: "cost", header: "Monthly cost limit", className: "text-right font-mono", render: (q) => (q.monthlyCostLimit == null ? <Badge>unlimited</Badge> : fmtCost(q.monthlyCostLimit)) },
    { key: "updatedAt", header: "Updated", className: "whitespace-nowrap text-stone-600", render: (q) => formatTs(q.updatedAt) },
  ];

  return (
    <Panel
      title={`Usage quotas (${quotas.length} set)`}
      actions={
        <button type="button" className={btnGhostCls} onClick={reload}>
          Refresh
        </button>
      }
    >
      <ErrorBanner message={error ?? action.error} />
      <Notice message={notice} />
      {orgId ? (
        <form onSubmit={save} className="grid gap-3 border-b border-stone-200 bg-stone-50 p-4 md:grid-cols-[1fr_1fr_auto]">
          <Field label={`Monthly token limit for ${orgName(orgId)} (blank = unlimited)`}>
            <input className={`${inputCls} font-mono`} inputMode="numeric" value={tokenLimit} onChange={(e) => setTokenLimit(e.target.value)} placeholder="unlimited" />
          </Field>
          <Field label="Monthly cost limit in USD (blank = unlimited)">
            <input className={`${inputCls} font-mono`} inputMode="decimal" value={costLimit} onChange={(e) => setCostLimit(e.target.value)} placeholder="unlimited" />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={btnCls} disabled={action.busy}>
              {action.busy ? "Saving…" : "Save quota"}
            </button>
          </div>
        </form>
      ) : (
        <Notice message="Select an organization to edit its quota." />
      )}
      <DataTable columns={columns} rows={[...quotas].sort((a, b) => b.updatedAt - a.updatedAt)} loading={loading} empty="No quotas set — every org is unlimited" rowKey={(q) => q.organizationId} />
    </Panel>
  );
}

function SessionsPanel({ orgId }: { orgId: string }) {
  const sessions = useAdminQuery<AiChatSessionRow>(`SELECT * FROM ai_chat_session WHERE organization_id = ${sqlString(orgId)}`);
  const members = useOrgMembers(orgId);
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...sessions.rows].filter((s) => showArchived || !s.archived).sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions.rows, showArchived],
  );
  const paged = usePaged(sorted, 50);
  const open = openId ? sessions.rows.find((s) => s.id === openId) ?? null : null;

  const columns: Column<AiChatSessionRow>[] = [
    { key: "title", header: "Title", render: (s) => <span className="font-medium">{s.title || <span className="text-stone-400">(untitled)</span>}</span> },
    {
      key: "user",
      header: "User",
      className: "whitespace-nowrap",
      render: (s) => (
        <div>
          <div>{members.label(s.userId)}</div>
          <Mono value={s.userId} />
        </div>
      ),
    },
    { key: "count", header: "Msgs", className: "text-right font-mono", render: (s) => messageCount(s.messages) ?? "?" },
    { key: "archived", header: "State", render: (s) => (s.archived ? <Badge>archived</Badge> : <Badge tone="ok">active</Badge>) },
    { key: "summary", header: "Summary", render: (s) => (s.summary ? truncate(s.summary, 100) : <span className="text-stone-300">—</span>) },
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (s) => formatTs(s.createdAt) },
    { key: "updatedAt", header: "Updated", className: "whitespace-nowrap text-stone-600", render: (s) => formatTs(s.updatedAt) },
    { key: "id", header: "Id", render: (s) => <Mono value={s.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (s) => (
        <button type="button" className={btnGhostCls} onClick={() => setOpenId(s.id === openId ? null : s.id)}>
          {s.id === openId ? "Close" : "View"}
        </button>
      ),
    },
  ];

  return (
    <Panel
      title={`AI chat sessions (${sessions.rows.length})`}
      actions={
        <>
          <label className="flex items-center gap-1 whitespace-nowrap text-[12px]">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> show archived
          </label>
          <button type="button" className={btnGhostCls} onClick={() => sessions.reload()}>
            Refresh
          </button>
        </>
      }
    >
      <ErrorBanner message={sessions.error} />
      <Notice message="Read-only: archiveAiChatSession only matches the caller's own sessions and there is no delete reducer." />
      <DataTable columns={columns} rows={paged.slice} loading={sessions.loading} empty="No AI chat sessions" rowKey={(s) => s.id} />
      <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} label="sessions" />
      {open && (
        <div className="border-t border-stone-200 p-4">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-stone-500">Messages JSON · {open.title}</div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[0.15rem] border border-stone-200 bg-stone-50 p-3 font-mono text-[11px]">
            {(() => {
              try {
                return JSON.stringify(JSON.parse(open.messages), null, 2);
              } catch {
                return open.messages;
              }
            })()}
          </pre>
        </div>
      )}
    </Panel>
  );
}

function JobsPanel({ orgId }: { orgId: string }) {
  const jobs = useAdminQuery<AiJobRow>(`SELECT * FROM ai_job WHERE organization_id = ${sqlString(orgId)}`);
  const members = useOrgMembers(orgId);
  const action = useAction();
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(() => [...jobs.rows].sort((a, b) => b.createdAt - a.createdAt), [jobs.rows]);
  const paged = usePaged(sorted, 50);
  const open = openId ? jobs.rows.find((j) => j.id === openId) ?? null : null;

  const remove = async (j: AiJobRow) => {
    if (!window.confirm(`Delete AI job ${j.id.slice(0, 8)}… (${j.status})?`)) return;
    const ok = await action.run("deleteAiJob", { organizationId: orgId, jobId: j.id });
    if (ok) {
      setNotice("Job deleted");
      if (openId === j.id) setOpenId(null);
      jobs.reload();
    }
  };

  const columns: Column<AiJobRow>[] = [
    { key: "status", header: "Status", render: (j) => <Badge tone={jobTone(j.status)}>{j.status}</Badge> },
    { key: "prompt", header: "Prompt", render: (j) => <span className="block max-w-[420px]">{truncate(j.prompt, 120)}</span> },
    {
      key: "user",
      header: "User",
      className: "whitespace-nowrap",
      render: (j) => (
        <div>
          <div>{members.label(j.userId)}</div>
          <Mono value={j.userId} />
        </div>
      ),
    },
    { key: "session", header: "Session", render: (j) => <Mono value={j.sessionId} /> },
    { key: "consumed", header: "Consumed", render: (j) => (j.consumed ? "yes" : "no") },
    { key: "error", header: "Error", render: (j) => (j.error ? <span className="text-red-700">{truncate(j.error, 80)}</span> : <span className="text-stone-300">—</span>) },
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (j) => formatTs(j.createdAt) },
    { key: "updatedAt", header: "Updated", className: "whitespace-nowrap text-stone-600", render: (j) => formatTs(j.updatedAt) },
    { key: "id", header: "Id", render: (j) => <Mono value={j.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (j) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnGhostCls} onClick={() => setOpenId(j.id === openId ? null : j.id)}>
            {j.id === openId ? "Close" : "View"}
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => remove(j)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <Panel
      title={`AI jobs (${jobs.rows.length})`}
      actions={
        <button type="button" className={btnGhostCls} onClick={() => jobs.reload()}>
          Refresh
        </button>
      }
    >
      <ErrorBanner message={jobs.error ?? action.error} />
      <Notice message={notice} />
      <Notice message="No cancel reducer exists; a stuck job can only be deleted (deleteAiJob)." />
      <DataTable columns={columns} rows={paged.slice} loading={jobs.loading} empty="No AI jobs" rowKey={(j) => j.id} />
      <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} label="jobs" />
      {open && (
        <div className="grid gap-4 border-t border-stone-200 p-4 lg:grid-cols-2">
          <div>
            <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-stone-500">Prompt</div>
            <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-[0.15rem] border border-stone-200 bg-stone-50 p-3 font-mono text-[11px]">{open.prompt}</pre>
          </div>
          <div>
            <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-stone-500">{open.finalText ? "Final text" : "Partial text"}</div>
            <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-[0.15rem] border border-stone-200 bg-stone-50 p-3 font-mono text-[11px]">
              {open.finalText ?? open.partialText ?? "—"}
            </pre>
            {open.error && <div className="mt-2 text-[12px] text-red-700">{open.error}</div>}
          </div>
        </div>
      )}
    </Panel>
  );
}
