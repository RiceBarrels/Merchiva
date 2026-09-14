"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "../use-admin-query";
import { Badge, DataTable, ErrorBanner, Panel, btnCls, btnGhostCls, inputCls, type Column } from "../ui";
import { Field, FormActions, FormRow, IdCell, orgQuery, todayIso, useAction, useOrgMembers } from "./shared";
import type { PunchEventRow } from "./types";

const PAGE_SIZE = 50;

function durationLabel(fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function actionTone(action: string): "ok" | "neutral" | "warn" | "danger" {
  if (action === "in") return "ok";
  if (action === "out") return "neutral";
  return "warn";
}

export function PunchTab({ orgId }: { orgId: string }) {
  const members = useOrgMembers(orgId);
  const events = useAdminQuery<PunchEventRow>(orgQuery("punch_event", orgId));
  const action = useAction();

  const [memberId, setMemberId] = useState("");
  const [page, setPage] = useState(0);
  const [winDate, setWinDate] = useState(() => todayIso());
  const [winStart, setWinStart] = useState("09:00");
  const [winEnd, setWinEnd] = useState("17:00");
  const [winOpenEnd, setWinOpenEnd] = useState(false);

  const activeMembers = useMemo(() => members.members.filter((m) => m.status === "active"), [members.members]);

  const openShifts = useMemo(
    () =>
      events.rows
        .filter((e) => e.action === "in" && !e.closed)
        .sort((a, b) => a.at - b.at),
    [events.rows],
  );

  const memberEvents = useMemo(() => (memberId ? events.rows.filter((e) => e.memberId === memberId).sort((a, b) => b.at - a.at) : []), [events.rows, memberId]);
  const pageCount = Math.max(1, Math.ceil(memberEvents.length / PAGE_SIZE));
  const pageRows = memberEvents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const eventById = useMemo(() => new Map(events.rows.map((e) => [e.id, e])), [events.rows]);
  const selectedOpen = openShifts.find((e) => e.memberId === memberId) ?? null;

  function selectMember(id: string) {
    setMemberId(id);
    setPage(0);
  }

  function punch(dir: "in" | "out") {
    if (!memberId) return;
    void action.run(`punch:${dir}`, () => adminCall("managerRecordPunch", { organizationId: orgId, memberId, action: dir }), {
      confirm: `Record a manager punch-${dir} for ${members.nameOf(memberId)} now?`,
      after: events.reload,
    });
  }

  async function submitWindow(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) return;
    const dayStart = new Date(`${winDate}T00:00:00`).getTime();
    const start = new Date(`${winDate}T${winStart}:00`).getTime();
    if (!Number.isFinite(dayStart) || !Number.isFinite(start)) {
      action.setError("Invalid date or start time");
      return;
    }
    const dayEnd = dayStart + 86_400_000;
    let end: number | null = null;
    if (!winOpenEnd) {
      end = new Date(`${winDate}T${winEnd}:00`).getTime();
      if (!Number.isFinite(end)) {
        action.setError("Invalid end time");
        return;
      }
      if (end <= start) end += 86_400_000; // overnight shift
    }
    await action.run(
      "window",
      () =>
        adminCall("managerSetPunchWindow", {
          organizationId: orgId,
          memberId,
          dayStartAt: dayStart,
          dayEndAt: dayEnd,
          startAt: start,
          endAt: end,
        }),
      { after: events.reload },
    );
  }

  const openCols: Column<PunchEventRow>[] = [
    { key: "member", header: "Member", render: (e) => <span className="font-medium">{members.nameOf(e.memberId)}</span> },
    { key: "at", header: "Clocked in", render: (e) => formatTs(e.at) },
    { key: "elapsed", header: "On shift for", className: "font-mono", render: (e) => durationLabel(e.at, Date.now()) },
    { key: "pin", header: "Via", className: "font-mono text-stone-500" },
    { key: "id", header: "Event", render: (e) => <IdCell id={e.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (e) => (
        <button
          type="button"
          className={btnGhostCls}
          onClick={() => {
            selectMember(e.memberId);
            window.scrollTo({ top: 0 });
          }}
        >
          Select
        </button>
      ),
    },
  ];

  const eventCols: Column<PunchEventRow>[] = [
    { key: "at", header: "At", render: (e) => formatTs(e.at) },
    { key: "action", header: "Action", render: (e) => <Badge tone={actionTone(e.action)}>{e.action}</Badge> },
    {
      key: "closed",
      header: "State",
      render: (e) => (e.action === "in" || e.action === "break-start" ? (e.closed ? <span className="text-stone-500">closed</span> : <Badge tone="warn">open</Badge>) : "—"),
    },
    {
      key: "pair",
      header: "Pair",
      render: (e) => {
        if (!e.pairEventId) return "—";
        const p = eventById.get(e.pairEventId);
        return p ? (
          <span className="font-mono text-[11px] text-stone-600">
            {p.action} {formatTs(p.at)} · {durationLabel(Math.min(p.at, e.at), Math.max(p.at, e.at))}
          </span>
        ) : (
          <IdCell id={e.pairEventId} />
        );
      },
    },
    { key: "pin", header: "Via", className: "font-mono text-stone-500" },
    { key: "createdAt", header: "Recorded", className: "text-stone-500", render: (e) => formatTs(e.createdAt) },
    { key: "id", header: "Id", render: (e) => <IdCell id={e.id} /> },
  ];

  return (
    <div className="space-y-5">
      <Panel
        title={`Open shifts (in without out) · ${openShifts.length}`}
        actions={
          <button type="button" className={btnGhostCls} onClick={events.reload}>
            Refresh
          </button>
        }
      >
        <ErrorBanner message={events.error ?? members.error} />
        <DataTable columns={openCols} rows={openShifts} loading={events.loading} rowKey={(e) => e.id} empty="Nobody is clocked in" />
      </Panel>

      <Panel
        title="Punch clock"
        actions={
          <>
            <select className={`${inputCls} w-auto py-1`} value={memberId} onChange={(e) => selectMember(e.target.value)}>
              <option value="">— member —</option>
              {members.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                  {m.status !== "active" ? ` (${m.status})` : ""}
                </option>
              ))}
            </select>
            <button type="button" className={btnCls} disabled={!memberId || Boolean(selectedOpen) || action.busy === "punch:in"} onClick={() => punch("in")}>
              Punch in
            </button>
            <button type="button" className={btnCls} disabled={!memberId || !selectedOpen || action.busy === "punch:out"} onClick={() => punch("out")}>
              Punch out
            </button>
          </>
        }
      >
        <ErrorBanner message={action.error} />
        {!memberId ? (
          <div className="px-4 py-8 text-center text-[13px] text-stone-500">Select a member to see their punch history.</div>
        ) : (
          <>
            <form onSubmit={submitWindow}>
              <FormRow>
                <Field label="Set attendance window · date">
                  <input type="date" className={inputCls} value={winDate} onChange={(e) => setWinDate(e.target.value)} required />
                </Field>
                <Field label="Start">
                  <input type="time" className={inputCls} value={winStart} onChange={(e) => setWinStart(e.target.value)} required />
                </Field>
                <Field label="End">
                  <div className="flex items-center gap-2">
                    <input type="time" className={inputCls} value={winEnd} disabled={winOpenEnd} onChange={(e) => setWinEnd(e.target.value)} />
                    <label className="inline-flex items-center gap-1 whitespace-nowrap text-[12px]">
                      <input type="checkbox" checked={winOpenEnd} onChange={(e) => setWinOpenEnd(e.target.checked)} /> still on shift
                    </label>
                  </div>
                </Field>
                <div className="flex items-end">
                  <button type="submit" className={btnCls} disabled={action.busy === "window"}>
                    {action.busy === "window" ? "Saving…" : "Apply window"}
                  </button>
                </div>
              </FormRow>
              <FormActions>
                <span className="text-[12px] text-stone-500">
                  Rewrites the in/out pair for {members.nameOf(memberId)} on that date (creates them if missing). Times are interpreted in this browser&apos;s timezone; an end before the start is treated as overnight.
                </span>
              </FormActions>
            </form>
            <DataTable columns={eventCols} rows={pageRows} loading={events.loading} rowKey={(e) => e.id} empty="No punch events for this member" />
            <div className="flex items-center justify-between border-t border-stone-200 px-4 py-2 text-[12px] text-stone-600">
              <span>
                {memberEvents.length} events · page {page + 1} / {pageCount}
              </span>
              <span className="inline-flex gap-1.5">
                <button type="button" className={btnGhostCls} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Newer
                </button>
                <button type="button" className={btnGhostCls} disabled={page + 1 >= pageCount} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                  Older
                </button>
              </span>
            </div>
            {!activeMembers.some((m) => m.id === memberId) && (
              <div className="border-t border-stone-200 px-4 py-2 text-[12px] text-amber-800">This member is not active; punch reducers only accept active members.</div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
