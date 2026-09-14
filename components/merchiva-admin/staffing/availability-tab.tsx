"use client";

import { useMemo, useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "../use-admin-query";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnGhostCls, inputCls, type Column } from "../ui";
import { IdCell, StatusBadge, orgQuery, parseJsonArray, useOrgMembers } from "./shared";
import type { StaffAvailabilityRow } from "./types";

export function AvailabilityTab({ orgId }: { orgId: string }) {
  const members = useOrgMembers(orgId);
  const rows = useAdminQuery<StaffAvailabilityRow>(orgQuery("staff_availability", orgId));
  const [memberFilter, setMemberFilter] = useState("");

  const visible = useMemo(
    () =>
      [...rows.rows]
        .filter((r) => !memberFilter || r.userId.toLowerCase() === memberFilter.toLowerCase())
        .sort((a, b) => members.nameOfUser(a.userId).localeCompare(members.nameOfUser(b.userId)) || b.createdAt - a.createdAt),
    [rows.rows, memberFilter, members],
  );

  const cols: Column<StaffAvailabilityRow>[] = [
    { key: "member", header: "Member", render: (r) => <span className="font-medium">{members.nameOfUser(r.userId)}</span> },
    { key: "type", header: "Type", render: (r) => <Badge>{r.type}</Badge> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "range",
      header: "Dates",
      className: "font-mono",
      render: (r) => (r.startDate || r.endDate ? `${r.startDate ?? "…"} – ${r.endDate ?? "…"}` : "recurring"),
    },
    {
      key: "days",
      header: "Days",
      render: (r) => {
        const days = parseJsonArray(r.days);
        return days.length ? (
          <span className="inline-flex flex-wrap gap-1">
            {days.map((d) => (
              <Badge key={d}>{d}</Badge>
            ))}
          </span>
        ) : (
          <code className="font-mono text-[11px] text-stone-500">{r.days || "—"}</code>
        );
      },
    },
    { key: "hours", header: "Hours", className: "font-mono", render: (r) => (r.fullDay ? "full day" : `${r.startTime ?? "?"}–${r.endTime ?? "?"}`) },
    {
      key: "dayTimes",
      header: "Per-day times",
      render: (r) => (
        <code className="block max-w-[240px] truncate font-mono text-[11px] text-stone-500" title={r.dayTimes}>
          {r.dayTimes && r.dayTimes !== "{}" && r.dayTimes !== "[]" ? r.dayTimes : "—"}
        </code>
      ),
    },
    { key: "comments", header: "Comments", className: "max-w-[220px] text-stone-600" },
    { key: "createdAt", header: "Created", className: "text-stone-500", render: (r) => formatTs(r.createdAt) },
    { key: "id", header: "Id", render: (r) => <IdCell id={r.id} /> },
  ];

  return (
    <Panel
      title={`Availability (staff_availability) · ${visible.length}`}
      actions={
        <>
          <select className={`${inputCls} w-auto py-1`} value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
            <option value="">all members</option>
            {members.members.map((m) => (
              <option key={m.id} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
          <button type="button" className={btnGhostCls} onClick={rows.reload}>
            Refresh
          </button>
        </>
      }
    >
      <Notice message="Read-only. upsertAvailability keys rows on the caller's own identity, so the console cannot edit a member's availability without a member-scoped reducer." />
      <ErrorBanner message={rows.error ?? members.error} />
      <DataTable columns={cols} rows={visible} loading={rows.loading} rowKey={(r) => r.id} empty="No availability rows" />
    </Panel>
  );
}
