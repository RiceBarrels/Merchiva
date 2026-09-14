"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import {
  Badge,
  ErrorBanner,
  PageHeader,
  Panel,
  btnCls,
  btnGhostCls,
  inputCls,
} from "@/components/merchiva-admin/ui";
import { IdentityCell } from "./identity-cell";
import { UserDetail } from "./user-detail";
import {
  normIdentity,
  type DeviceLoginRequestRow,
  type OrgMemberRow,
  type OrganizationRow,
  type PushSubscriptionRow,
  type UserRow,
} from "./types";

const PAGE_SIZE = 50;

type SortKey =
  | "email"
  | "displayName"
  | "createdAt"
  | "memberships"
  | "lastActiveOrg";
type SortDir = "asc" | "desc";

interface UserView {
  user: UserRow;
  id: string; // normalised identity
  memberships: OrgMemberRow[];
  lastActiveOrgName: string | null;
  isAdmin: boolean;
  hasEmail: boolean;
}

export function UsersPanel() {
  const users = useAdminQuery<UserRow>("SELECT * FROM user");
  const orgs = useAdminQuery<OrganizationRow>("SELECT * FROM organization");
  const members = useAdminQuery<OrgMemberRow>("SELECT * FROM org_member");
  const pushes = useAdminQuery<PushSubscriptionRow>(
    "SELECT * FROM push_subscription",
  );
  const deviceReqs = useAdminQuery<DeviceLoginRequestRow>(
    "SELECT * FROM device_login_request",
  );

  const [search, setSearch] = useState("");
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [hideAnon, setHideAnon] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  function reloadAll() {
    users.reload();
    orgs.reload();
    members.reload();
    pushes.reload();
    deviceReqs.reload();
  }

  const loading = users.loading || orgs.loading || members.loading;
  const loadError =
    users.error ??
    orgs.error ??
    members.error ??
    pushes.error ??
    deviceReqs.error ??
    null;

  const orgById = useMemo(() => {
    const m = new Map<string, OrganizationRow>();
    for (const o of orgs.rows) m.set(o.id, o);
    return m;
  }, [orgs.rows]);

  const membersByUser = useMemo(() => {
    const m = new Map<string, OrgMemberRow[]>();
    for (const row of members.rows) {
      const key = normIdentity(row.userId);
      const list = m.get(key);
      if (list) list.push(row);
      else m.set(key, [row]);
    }
    return m;
  }, [members.rows]);

  const pushCountByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of pushes.rows) {
      const key = normIdentity(row.targetId);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [pushes.rows]);

  const pendingDeviceReqByMember = useMemo(() => {
    const m = new Map<string, DeviceLoginRequestRow[]>();
    for (const row of deviceReqs.rows) {
      if (row.status !== "pending" || !row.memberId) continue;
      const list = m.get(row.memberId);
      if (list) list.push(row);
      else m.set(row.memberId, [row]);
    }
    return m;
  }, [deviceReqs.rows]);

  const views = useMemo<UserView[]>(
    () =>
      users.rows.map((u) => {
        const id = normIdentity(u.identity);
        return {
          user: u,
          id,
          memberships: membersByUser.get(id) ?? [],
          lastActiveOrgName: u.lastActiveOrgId
            ? (orgById.get(u.lastActiveOrgId)?.name ?? null)
            : null,
          isAdmin: u.isAdmin === true,
          hasEmail: Boolean(u.email && u.email.trim()),
        };
      }),
    [users.rows, membersByUser, orgById],
  );

  const stats = useMemo(
    () => ({
      total: views.length,
      withEmail: views.filter((v) => v.hasEmail).length,
      admins: views.filter((v) => v.isAdmin).length,
      withMembership: views.filter((v) => v.memberships.length > 0).length,
      anonymous: views.filter((v) => !v.hasEmail).length,
    }),
    [views],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qId = normIdentity(q);
    let list = views;
    if (adminsOnly) list = list.filter((v) => v.isAdmin);
    if (hideAnon) list = list.filter((v) => v.hasEmail);
    if (q) {
      list = list.filter(
        (v) =>
          v.user.email.toLowerCase().includes(q) ||
          (v.user.displayName ?? "").toLowerCase().includes(q) ||
          (qId.length > 0 && v.id.includes(qId)) ||
          (v.lastActiveOrgName ?? "").toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const cmpStr = (a: string, b: string) => a.localeCompare(b) * dir;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "email":
          return cmpStr(a.user.email, b.user.email);
        case "displayName":
          return cmpStr(a.user.displayName ?? "", b.user.displayName ?? "");
        case "memberships":
          return (
            (a.memberships.length - b.memberships.length) * dir ||
            cmpStr(a.user.email, b.user.email)
          );
        case "lastActiveOrg":
          return cmpStr(a.lastActiveOrgName ?? "", b.lastActiveOrgName ?? "");
        case "createdAt":
        default:
          return (a.user.createdAt - b.user.createdAt) * dir;
      }
    });
  }, [views, search, adminsOnly, hideAnon, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);
  const pageRows = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "createdAt" || key === "memberships" ? "desc" : "asc");
    }
  }

  async function setAdmin(v: UserView, isAdmin: boolean) {
    if (!v.hasEmail) return;
    const verb = isAdmin ? "Promote" : "Demote";
    if (
      !window.confirm(
        `${verb} ${v.user.email} ${isAdmin ? "to" : "from"} site admin?`,
      )
    )
      return;
    setBusyUser(v.id);
    setActionError(null);
    try {
      await adminCall("setUserAdmin", { targetEmail: v.user.email, isAdmin });
      users.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUser(null);
    }
  }

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const th = (key: SortKey | null, label: string, cls = "") => (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${cls}`}>
      {key ? (
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="uppercase hover:text-stone-900"
        >
          {label}
          {sortIndicator(key)}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div>
      <PageHeader eyebrow="users" title="Users">
        <button
          type="button"
          className={btnGhostCls}
          onClick={reloadAll}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total users" value={stats.total} />
        <StatTile
          label="With email"
          value={stats.withEmail}
          hint={
            stats.anonymous > 0 ? `${stats.anonymous} anonymous` : undefined
          }
        />
        <StatTile label="Site admins" value={stats.admins} />
        <StatTile label="With ≥1 membership" value={stats.withMembership} />
      </div>

      <Panel
        title={`${filtered.length.toLocaleString()} user${filtered.length === 1 ? "" : "s"}`}
        actions={
          <span className="font-mono text-[11px] text-stone-500">
            page {page + 1} / {pageCount}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-2.5">
          <input
            className={`${inputCls} max-w-xs`}
            placeholder="Search email, name, identity, org…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <label className="flex items-center gap-1.5 text-[12px] text-stone-700">
            <input
              type="checkbox"
              checked={adminsOnly}
              onChange={(e) => {
                setAdminsOnly(e.target.checked);
                setPage(0);
              }}
            />
            Site admins only
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-stone-700">
            <input
              type="checkbox"
              checked={hideAnon}
              onChange={(e) => {
                setHideAnon(e.target.checked);
                setPage(0);
              }}
            />
            Hide anonymous
            <span className="font-mono text-[10.5px] text-stone-400">
              ({stats.anonymous} with no email)
            </span>
          </label>
        </div>

        <ErrorBanner message={loadError} />
        <ErrorBanner message={actionError} />

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-stone-50 text-left font-mono text-[11px] uppercase tracking-wider text-stone-500">
              <tr>
                <th className="w-6 px-2 py-2" />
                {th("email", "Email")}
                {th("displayName", "Name")}
                {th(null, "Identity")}
                {th(null, "Admin")}
                {th("lastActiveOrg", "Last active org")}
                {th("memberships", "Members", "text-right")}
                {th("createdAt", "Created")}
                {th(null, "", "text-right")}
              </tr>
            </thead>
            <tbody>
              {loading && pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-stone-500"
                  >
                    Loading…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-stone-500"
                  >
                    No users match
                  </td>
                </tr>
              ) : (
                pageRows.map((v) => {
                  const open = expanded === v.id;
                  const busy = busyUser === v.id;
                  return (
                    <Fragment key={v.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : v.id)}
                        className={`cursor-pointer border-t border-stone-100 align-middle hover:bg-stone-50/60 ${open ? "bg-stone-50" : ""}`}
                      >
                        <td className="px-2 py-1.5 font-mono text-[11px] text-stone-400">
                          {open ? "▾" : "▸"}
                        </td>
                        <td className="px-3 py-1.5">
                          {v.hasEmail ? (
                            <span className="font-medium">{v.user.email}</span>
                          ) : (
                            <span className="italic text-stone-400">
                              anonymous
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {v.user.displayName || (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <IdentityCell value={v.user.identity} />
                        </td>
                        <td className="px-3 py-1.5">
                          {v.isAdmin ? (
                            <Badge tone="danger">admin</Badge>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {v.user.lastActiveOrgId ? (
                            (v.lastActiveOrgName ?? (
                              <code className="font-mono text-[11px] text-stone-500">
                                {v.user.lastActiveOrgId}
                              </code>
                            ))
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          {v.memberships.length}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-stone-600">
                          {formatTs(v.user.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">
                          {v.hasEmail && (
                            <button
                              type="button"
                              className={v.isAdmin ? btnGhostCls : btnCls}
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdmin(v, !v.isAdmin).catch(() => {});
                              }}
                            >
                              {busy ? "…" : v.isAdmin ? "Demote" : "Make admin"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <UserDetail
                              user={v.user}
                              memberships={v.memberships}
                              orgById={orgById}
                              pushCount={pushCountByUser.get(v.id) ?? 0}
                              deviceRequests={v.memberships.flatMap(
                                (m) => pendingDeviceReqByMember.get(m.id) ?? [],
                              )}
                              onChanged={() => {
                                members.reload();
                                users.reload();
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-stone-200 px-4 py-2 text-[12px] text-stone-600">
          <span>
            {filtered.length === 0
              ? "0"
              : `${page * PAGE_SIZE + 1}–${Math.min(filtered.length, (page + 1) * PAGE_SIZE)}`}{" "}
            of {filtered.length.toLocaleString()}
          </span>
          <span className="inline-flex gap-1.5">
            <button
              type="button"
              className={btnGhostCls}
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className={btnGhostCls}
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </button>
          </span>
        </div>
      </Panel>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-[0.15rem] border border-stone-200 bg-white px-3 py-2.5">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[20px] font-semibold leading-tight">
        {value.toLocaleString()}
      </div>
      {hint && <div className="text-[11px] text-stone-500">{hint}</div>}
    </div>
  );
}
