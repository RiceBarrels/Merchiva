"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, ErrorBanner, Notice, PageHeader, Panel, btnGhostCls, inputCls } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { subscriptionTone, userLabel, type OrgMemberRow, type OrganizationRow, type UserRow } from "./types";

type SortKey = "name" | "owner" | "members" | "status" | "periodEnd" | "created";

interface ListRow {
  org: OrganizationRow;
  ownerLabel: string;
  memberCount: number;
}

const HEADERS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "owner", label: "Owner" },
  { key: "members", label: "Members" },
  { key: "status", label: "Subscription" },
  { key: "periodEnd", label: "Period end" },
  { key: "created", label: "Created" },
];

function sortValue(row: ListRow, key: SortKey): string | number {
  switch (key) {
    case "name":
      return row.org.name.toLowerCase();
    case "owner":
      return row.ownerLabel.toLowerCase();
    case "members":
      return row.memberCount;
    case "status":
      return row.org.subscriptionStatus ?? "";
    case "periodEnd":
      return row.org.currentPeriodEnd ?? 0;
    case "created":
      return row.org.createdAt;
  }
}

export function OrganizationsList() {
  const orgs = useAdminQuery<OrganizationRow>("SELECT * FROM organization");
  const users = useAdminQuery<UserRow>("SELECT * FROM user");
  const members = useAdminQuery<OrgMemberRow>("SELECT * FROM org_member");

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo<ListRow[]>(() => {
    const userById = new Map(users.rows.map((u) => [u.identity.toLowerCase(), u]));
    const counts = new Map<string, number>();
    for (const m of members.rows) counts.set(m.organizationId, (counts.get(m.organizationId) ?? 0) + 1);
    return orgs.rows.map((org) => ({
      org,
      ownerLabel: userLabel(userById.get(org.ownerId.toLowerCase()), org.ownerId.slice(0, 12) + "…"),
      memberCount: counts.get(org.id) ?? 0,
    }));
  }, [orgs.rows, users.rows, members.rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) =>
            r.org.name.toLowerCase().includes(q) ||
            r.org.id.toLowerCase().includes(q) ||
            r.ownerLabel.toLowerCase().includes(q) ||
            (r.org.subscriptionStatus ?? "").toLowerCase().includes(q) ||
            (r.org.stripeCustomerId ?? "").toLowerCase().includes(q),
        )
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "created" || key === "members" || key === "periodEnd" ? "desc" : "asc");
    }
  }

  const loading = orgs.loading || users.loading || members.loading;
  const error = orgs.error ?? users.error ?? members.error;

  function reloadAll() {
    orgs.reload();
    users.reload();
    members.reload();
  }

  return (
    <div>
      <PageHeader eyebrow="organizations" title="Organizations">
        <div className="flex items-center gap-2">
          <input
            className={`${inputCls} w-64`}
            placeholder="Search name, id, owner, status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className={btnGhostCls} onClick={reloadAll}>
            Refresh
          </button>
        </div>
      </PageHeader>

      <Panel title={`${visible.length} of ${rows.length} organizations`}>
        <ErrorBanner message={error} />
        <Notice message="Creating an organization on behalf of another user is not supported: createOrg always makes the caller (the service identity) the owner. Orgs are created by users from the app." />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-stone-50 text-left font-mono text-[11px] uppercase tracking-wider text-stone-500">
              <tr>
                {HEADERS.map((h) => (
                  <th key={h.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    <button type="button" className="inline-flex items-center gap-1 hover:text-stone-900" onClick={() => toggleSort(h.key)}>
                      {h.label}
                      {sortKey === h.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Id</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={HEADERS.length + 1} className="px-3 py-6 text-center text-stone-500">
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={HEADERS.length + 1} className="px-3 py-6 text-center text-stone-500">
                    No organizations
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.org.id} className="border-t border-stone-100 align-top hover:bg-stone-50/60">
                    <td className="px-3 py-1.5">
                      <Link href={`/merchivaAdmin/organizations/${r.org.id}`} className="font-medium hover:underline">
                        {r.org.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-stone-700">{r.ownerLabel}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">{r.memberCount}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={subscriptionTone(r.org.subscriptionStatus)}>{r.org.subscriptionStatus || "none"}</Badge>
                      {r.org.subscriptionInterval && <span className="ml-1.5 font-mono text-[11px] text-stone-500">{r.org.subscriptionInterval}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-stone-600">{formatTs(r.org.currentPeriodEnd)}</td>
                    <td className="px-3 py-1.5 text-stone-600">{formatTs(r.org.createdAt)}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-stone-500">{r.org.id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
