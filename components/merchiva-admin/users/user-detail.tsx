"use client";

import { useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import {
  Badge,
  ErrorBanner,
  btnDangerCls,
  btnGhostCls,
} from "@/components/merchiva-admin/ui";
import { IdentityCell } from "./identity-cell";
import {
  MEMBER_ROLES,
  type DeviceLoginRequestRow,
  type OrgMemberRow,
  type OrganizationRow,
  type UserRow,
} from "./types";

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "active") return "ok";
  if (status === "disabled") return "warn";
  if (status === "removed") return "danger";
  return "neutral";
}

export function UserDetail({
  user,
  memberships,
  orgById,
  pushCount,
  deviceRequests,
  onChanged,
}: {
  user: UserRow;
  memberships: OrgMemberRow[];
  orgById: Map<string, OrganizationRow>;
  pushCount: number;
  deviceRequests: DeviceLoginRequestRow[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(memberId: string, fn: () => Promise<void>) {
    setBusyId(memberId);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function orgName(orgId: string): string {
    return orgById.get(orgId)?.name ?? orgId;
  }

  function setStatus(m: OrgMemberRow, status: string) {
    const org = orgName(m.organizationId);
    const label =
      status === "active"
        ? "Re-enable"
        : status === "disabled"
          ? "Disable"
          : "Remove";
    const ownerWarning =
      m.role === "owner"
        ? "\n\nThis member is the OWNER of the organization."
        : "";
    if (
      !window.confirm(
        `${label} ${m.email || m.displayName || m.id} in "${org}"?${ownerWarning}`,
      )
    )
      return;
    run(m.id, () =>
      adminCall("setMemberStatus", {
        organizationId: m.organizationId,
        memberId: m.id,
        status,
      }),
    ).catch(() => {});
  }

  function setRole(m: OrgMemberRow, role: string) {
    if (role === m.role) return;
    const org = orgName(m.organizationId);
    if (
      !window.confirm(
        `Change role of ${m.email || m.displayName || m.id} in "${org}" from ${m.role} to ${role}?`,
      )
    )
      return;
    run(m.id, () =>
      adminCall("updateMemberPermissions", {
        organizationId: m.organizationId,
        memberId: m.id,
        role,
        permissions: m.permissions,
      }),
    ).catch(() => {});
  }

  const sortedMemberships = [...memberships].sort((a, b) =>
    orgName(a.organizationId).localeCompare(orgName(b.organizationId)),
  );

  return (
    <div className="border-t border-stone-200 bg-stone-50/70">
      <ErrorBanner message={error} />
      <div className="grid gap-4 px-4 py-3 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-stone-500">
            Memberships ({memberships.length})
          </div>
          <div className="overflow-x-auto rounded-[0.15rem] border border-stone-200 bg-white">
            <table className="w-full text-[12.5px]">
              <thead className="bg-stone-50 text-left font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                    Organization
                  </th>
                  <th className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                    Member id
                  </th>
                  <th className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                    Role
                  </th>
                  <th className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                    Status
                  </th>
                  <th className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                    Joined
                  </th>
                  <th className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                    Punch code
                  </th>
                  <th className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                    Rate
                  </th>
                  <th className="px-2.5 py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sortedMemberships.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-2.5 py-4 text-center text-stone-500"
                    >
                      No memberships
                    </td>
                  </tr>
                ) : (
                  sortedMemberships.map((m) => {
                    const busy = busyId === m.id;
                    const isOwner = m.role === "owner";
                    const org = orgById.get(m.organizationId);
                    return (
                      <tr
                        key={m.id}
                        className="border-t border-stone-100 align-middle"
                      >
                        <td className="px-2.5 py-1.5">
                          <div className="font-medium">
                            {org?.name ?? (
                              <span className="text-stone-400">
                                unknown org
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10.5px] text-stone-400">
                            {m.organizationId}
                          </div>
                        </td>
                        <td className="px-2.5 py-1.5">
                          <IdentityCell value={m.id} head={8} tail={4} />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <select
                            value={m.role}
                            disabled={isOwner || busy}
                            onChange={(e) => setRole(m, e.target.value)}
                            title={
                              isOwner
                                ? "Owner role cannot be changed by updateMemberPermissions"
                                : "Change role"
                            }
                            className="rounded-[0.15rem] border border-stone-300 bg-white px-1.5 py-0.5 text-[12px] outline-none focus:border-stone-900 disabled:bg-stone-50 disabled:text-stone-500"
                          >
                            {MEMBER_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                            {!MEMBER_ROLES.includes(
                              m.role as (typeof MEMBER_ROLES)[number],
                            ) && <option value={m.role}>{m.role}</option>}
                          </select>
                        </td>
                        <td className="px-2.5 py-1.5">
                          <Badge tone={statusTone(m.status)}>
                            {m.status || "—"}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-stone-600">
                          {formatTs(m.joinedAt)}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-stone-600">
                          {m.punchInCode ?? (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-stone-600">
                          {typeof m.hourlyRate === "number" ? (
                            m.hourlyRate.toFixed(2)
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
                          <span className="inline-flex gap-1.5">
                            {m.status === "active" ? (
                              <>
                                <button
                                  type="button"
                                  className={btnGhostCls}
                                  disabled={busy}
                                  onClick={() => setStatus(m, "disabled")}
                                >
                                  Disable
                                </button>
                                <button
                                  type="button"
                                  className={btnDangerCls}
                                  disabled={busy}
                                  onClick={() => setStatus(m, "removed")}
                                >
                                  Remove
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={btnGhostCls}
                                disabled={busy}
                                onClick={() => setStatus(m, "active")}
                              >
                                Re-enable
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-stone-500">
            Role changes keep the member&apos;s existing permissions JSON.
            Status values: active / disabled / removed.
          </p>
        </div>

        <div className="space-y-3">
          <Section title="Profile">
            <KV label="Identity">
              <IdentityCell value={user.identity} head={12} tail={8} />
            </KV>
            <KV label="Avatar">
              {user.avatarUrl ? (
                <a
                  className="underline"
                  href={user.avatarUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  open
                </a>
              ) : (
                "—"
              )}
            </KV>
            <KV label="Password hash">{user.passwordHash ? "set" : "none"}</KV>
            <KV label="Last active org">
              {user.lastActiveOrgId ? (
                <span>
                  {orgName(user.lastActiveOrgId)}
                  <span className="ml-1 font-mono text-[10.5px] text-stone-400">
                    {user.lastActiveOrgId}
                  </span>
                </span>
              ) : (
                "—"
              )}
            </KV>
            <KV label="Created">{formatTs(user.createdAt)}</KV>
          </Section>

          <Section title="Push subscriptions">
            <div className="text-[12.5px]">
              <span className="font-mono text-[14px] font-semibold">
                {pushCount}
              </span>{" "}
              <span className="text-stone-500">
                device subscription{pushCount === 1 ? "" : "s"}
              </span>
            </div>
          </Section>

          <Section title={`Pending device logins (${deviceRequests.length})`}>
            {deviceRequests.length === 0 ? (
              <div className="text-[12px] text-stone-500">
                None linked to this user&apos;s memberships.
              </div>
            ) : (
              <ul className="space-y-1 text-[12px]">
                {deviceRequests.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                  >
                    <Badge tone="warn">{r.status}</Badge>
                    <span>{orgName(r.organizationId)}</span>
                    <span className="font-mono text-[10.5px] text-stone-400">
                      {r.deviceId}
                    </span>
                    {r.intent && (
                      <span className="font-mono text-[10.5px] text-stone-500">
                        {r.intent}
                      </span>
                    )}
                    <span className="text-stone-500">
                      exp {formatTs(r.expiresAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[0.15rem] border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
        {title}
      </div>
      <div className="space-y-1 px-3 py-2">{children}</div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12.5px]">
      <div className="w-[104px] shrink-0 text-stone-500">{label}</div>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  );
}
