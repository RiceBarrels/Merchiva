"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "../use-admin-query";
import { DataTable, ErrorBanner, Panel, btnDangerCls, btnGhostCls, inputCls, type Column } from "../ui";
import { IdCell, StatusBadge, orgQuery, useAction, useOrgMembers } from "./shared";
import type { TimeOffRequestRow } from "./types";

export function TimeOffTab({ orgId }: { orgId: string }) {
  const members = useOrgMembers(orgId);
  const requests = useAdminQuery<TimeOffRequestRow>(orgQuery("time_off_request", orgId));
  const action = useAction();
  const [filter, setFilter] = useState("all");

  const visible = useMemo(
    () => [...requests.rows].filter((r) => filter === "all" || r.status === filter).sort((a, b) => b.createdAt - a.createdAt),
    [requests.rows, filter],
  );

  function setStatus(r: TimeOffRequestRow, status: "approved" | "denied") {
    void action.run(`${status}:${r.id}`, () => adminCall("updateTimeOffStatus", { organizationId: orgId, requestId: r.id, status }), {
      confirm: status === "denied" ? `Deny ${members.nameOfUser(r.userId)}'s request (${r.startDate} – ${r.endDate})?` : undefined,
      after: requests.reload,
    });
  }

  const cols: Column<TimeOffRequestRow>[] = [
    { key: "member", header: "Member", render: (r) => <span className="font-medium">{members.nameOfUser(r.userId)}</span> },
    { key: "range", header: "Dates", className: "font-mono", render: (r) => (r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`) },
    { key: "fullDays", header: "Hours", className: "font-mono", render: (r) => (r.fullDays ? "full days" : `${r.startTime ?? "?"}–${r.endTime ?? "?"}`) },
    { key: "comments", header: "Comments", className: "max-w-[260px] text-stone-600" },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "reviewedBy", header: "Reviewed by", render: (r) => (r.reviewedBy ? (r.reviewedBy === "service" ? "Merchiva admin" : members.nameOf(r.reviewedBy)) : "—") },
    { key: "reviewedAt", header: "Reviewed", className: "text-stone-500", render: (r) => formatTs(r.reviewedAt) },
    { key: "createdAt", header: "Requested", className: "text-stone-500", render: (r) => formatTs(r.createdAt) },
    { key: "id", header: "Id", render: (r) => <IdCell id={r.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <span className="inline-flex gap-1.5">
          {r.status !== "approved" && (
            <button type="button" className={btnGhostCls} disabled={action.busy === `approved:${r.id}`} onClick={() => setStatus(r, "approved")}>
              Approve
            </button>
          )}
          {r.status !== "denied" && (
            <button type="button" className={btnDangerCls} disabled={action.busy === `denied:${r.id}`} onClick={() => setStatus(r, "denied")}>
              Deny
            </button>
          )}
        </span>
      ),
    },
  ];

  const pending = requests.rows.filter((r) => r.status === "pending").length;

  return (
    <Panel
      title={`Time off requests · ${visible.length}${pending ? ` · ${pending} pending` : ""}`}
      actions={
        <>
          <select className={`${inputCls} w-auto py-1`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">all statuses</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="denied">denied</option>
          </select>
          <button type="button" className={btnGhostCls} onClick={requests.reload}>
            Refresh
          </button>
        </>
      }
    >
      <ErrorBanner message={requests.error ?? members.error ?? action.error} />
      <DataTable columns={cols} rows={visible} loading={requests.loading} rowKey={(r) => r.id} empty="No time off requests" />
      <div className="border-t border-stone-200 px-4 py-2 text-[12px] text-stone-500">
        Status changes notify the requesting member. There is no reducer to delete or create requests on a member&apos;s behalf, so those are not offered here.
      </div>
    </Panel>
  );
}
