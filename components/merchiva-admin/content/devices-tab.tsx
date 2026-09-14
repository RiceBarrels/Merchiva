"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnDangerCls, btnGhostCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Mono, NoOrg, Pager, Stat, truncate, useAction, useOrgMembers, usePaged } from "./shared";

interface StoreDeviceRow {
  id: string;
  organizationId: string;
  deviceId: string;
  name: string;
  enabled: boolean;
  lastSeenAt: number;
  registeredBy: string;
  createdAt: number;
}

interface DeviceLoginRequestRow {
  id: string;
  organizationId: string;
  deviceId: string;
  nonce: string;
  status: string;
  memberId: string | null;
  intent: string | null;
  createdAt: number;
  expiresAt: number;
}

interface PushSubscriptionRow {
  id: string;
  organizationId: string;
  targetId: string;
  endpoint: string;
  p256Dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: number;
}

interface PushCount {
  targetId: string;
  count: number;
  latest: number;
  agents: string[];
}

function requestTone(status: string, expired: boolean): "ok" | "warn" | "danger" | "neutral" {
  if (status === "pending") return expired ? "danger" : "warn";
  if (status === "approved") return "ok";
  return "neutral";
}

export function DevicesTab({ orgId }: { orgId: string | null }) {
  if (!orgId) return <NoOrg what="store devices, login requests and push subscriptions" />;
  return (
    <div className="space-y-4">
      <StoreDevicesPanel orgId={orgId} />
      <LoginRequestsPanel orgId={orgId} />
      <PushSubscriptionsPanel orgId={orgId} />
    </div>
  );
}

function StoreDevicesPanel({ orgId }: { orgId: string }) {
  const devices = useAdminQuery<StoreDeviceRow>(`SELECT * FROM store_device WHERE organization_id = ${sqlString(orgId)}`);
  const members = useOrgMembers(orgId);
  const action = useAction();
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = useMemo(() => [...devices.rows].sort((a, b) => b.lastSeenAt - a.lastSeenAt), [devices.rows]);

  const setEnabled = async (d: StoreDeviceRow, enabled: boolean) => {
    if (!enabled && !window.confirm(`Disable device "${d.name}"? The store tablet will be locked out until re-enabled.`)) return;
    const ok = await action.run("updateStoreDevice", { organizationId: orgId, deviceId: d.deviceId, name: null, enabled });
    if (ok) {
      setNotice(`${d.name} ${enabled ? "enabled" : "disabled"}`);
      devices.reload();
    }
  };

  const rename = async (d: StoreDeviceRow) => {
    const name = window.prompt(`New name for device "${d.name}"`, d.name);
    if (name === null || !name.trim() || name.trim() === d.name) return;
    const ok = await action.run("updateStoreDevice", { organizationId: orgId, deviceId: d.deviceId, name: name.trim(), enabled: null });
    if (ok) {
      setNotice(`Renamed to "${name.trim()}"`);
      devices.reload();
    }
  };

  const remove = async (d: StoreDeviceRow) => {
    if (!window.confirm(`Remove device "${d.name}" (${d.deviceId})? It will have to be registered again.`)) return;
    const ok = await action.run("removeStoreDevice", { organizationId: orgId, deviceId: d.deviceId });
    if (ok) {
      setNotice(`Removed "${d.name}"`);
      devices.reload();
    }
  };

  const columns: Column<StoreDeviceRow>[] = [
    { key: "name", header: "Name", render: (d) => <span className="font-medium">{d.name}</span> },
    { key: "deviceId", header: "Device id", render: (d) => <Mono value={d.deviceId} /> },
    { key: "enabled", header: "State", render: (d) => (d.enabled ? <Badge tone="ok">enabled</Badge> : <Badge tone="danger">disabled</Badge>) },
    { key: "lastSeenAt", header: "Last seen", className: "whitespace-nowrap text-stone-600", render: (d) => formatTs(d.lastSeenAt) },
    {
      key: "registeredBy",
      header: "Registered by",
      className: "whitespace-nowrap",
      render: (d) => (
        <div>
          <div>{members.label(d.registeredBy)}</div>
          <Mono value={d.registeredBy} />
        </div>
      ),
    },
    { key: "createdAt", header: "Registered", className: "whitespace-nowrap text-stone-600", render: (d) => formatTs(d.createdAt) },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (d) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => rename(d)}>
            Rename
          </button>
          <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => setEnabled(d, !d.enabled)}>
            {d.enabled ? "Disable" : "Enable"}
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => remove(d)}>
            Remove
          </button>
        </span>
      ),
    },
  ];

  return (
    <Panel
      title={`Store devices (${devices.rows.length})`}
      actions={
        <button type="button" className={btnGhostCls} onClick={() => devices.reload()}>
          Refresh
        </button>
      }
    >
      <ErrorBanner message={devices.error ?? action.error} />
      <Notice message={notice} />
      <DataTable columns={columns} rows={sorted} loading={devices.loading} empty="No store devices registered" rowKey={(d) => d.id} />
    </Panel>
  );
}

function LoginRequestsPanel({ orgId }: { orgId: string }) {
  const requests = useAdminQuery<DeviceLoginRequestRow>(`SELECT * FROM device_login_request WHERE organization_id = ${sqlString(orgId)}`);
  const members = useOrgMembers(orgId);
  const action = useAction();
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  // Snapshot of "now" for expiry checks; refreshed alongside the data from the Refresh button.
  const [now, setNow] = useState(() => Date.now());
  const refresh = () => {
    setNow(Date.now());
    requests.reload();
  };

  const memberById = useMemo(() => new Map(members.rows.map((m) => [m.id, m])), [members.rows]);
  const sorted = useMemo(
    () => [...requests.rows].filter((r) => !pendingOnly || r.status === "pending").sort((a, b) => b.createdAt - a.createdAt),
    [requests.rows, pendingOnly],
  );
  const paged = usePaged(sorted, 50);
  const pending = requests.rows.filter((r) => r.status === "pending" && r.expiresAt > now).length;

  const revoke = async (r: DeviceLoginRequestRow) => {
    if (!window.confirm(`Revoke login request ${r.id.slice(0, 8)}… for device ${r.deviceId}? It will be marked consumed and can no longer be used.`)) return;
    const ok = await action.run("consumeDeviceLogin", { id: r.id });
    if (ok) {
      setNotice("Request revoked (marked consumed)");
      refresh();
    }
  };

  const columns: Column<DeviceLoginRequestRow>[] = [
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const expired = r.expiresAt <= now;
        return (
          <span className="inline-flex gap-1">
            <Badge tone={requestTone(r.status, expired)}>{r.status}</Badge>
            {expired && r.status === "pending" && <Badge tone="danger">expired</Badge>}
          </span>
        );
      },
    },
    { key: "deviceId", header: "Device", render: (r) => <Mono value={r.deviceId} /> },
    {
      key: "member",
      header: "Member",
      render: (r) => {
        if (!r.memberId) return <span className="text-stone-300">—</span>;
        const m = memberById.get(r.memberId);
        return m ? m.displayName || m.email : <Mono value={r.memberId} />;
      },
    },
    { key: "intent", header: "Intent", render: (r) => (r.intent ? <Badge>{r.intent}</Badge> : <span className="text-stone-300">—</span>) },
    { key: "nonce", header: "Nonce", render: (r) => <Mono value={r.nonce} /> },
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (r) => formatTs(r.createdAt) },
    { key: "expiresAt", header: "Expires", className: "whitespace-nowrap text-stone-600", render: (r) => formatTs(r.expiresAt) },
    { key: "id", header: "Id", render: (r) => <Mono value={r.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) =>
        r.status === "consumed" ? null : (
          <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => revoke(r)}>
            Revoke
          </button>
        ),
    },
  ];

  return (
    <Panel
      title={`Device login requests (${requests.rows.length}, ${pending} live)`}
      actions={
        <>
          <label className="flex items-center gap-1 whitespace-nowrap text-[12px]">
            <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} /> pending only
          </label>
          <button type="button" className={btnGhostCls} onClick={refresh}>
            Refresh
          </button>
        </>
      }
    >
      <ErrorBanner message={requests.error ?? action.error} />
      <Notice message={notice} />
      <Notice message="Revoke marks the request consumed (consumeDeviceLogin). Rows are never deleted — there is no delete reducer." />
      <DataTable columns={columns} rows={paged.slice} loading={requests.loading} empty="No login requests" rowKey={(r) => r.id} />
      <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} label="requests" />
    </Panel>
  );
}

function PushSubscriptionsPanel({ orgId }: { orgId: string }) {
  const subs = useAdminQuery<PushSubscriptionRow>(`SELECT * FROM push_subscription WHERE organization_id = ${sqlString(orgId)}`);
  const members = useOrgMembers(orgId);

  const counts = useMemo<PushCount[]>(() => {
    const map = new Map<string, PushCount>();
    for (const s of subs.rows) {
      const key = s.targetId.toLowerCase();
      const c = map.get(key) ?? { targetId: s.targetId, count: 0, latest: 0, agents: [] };
      c.count += 1;
      c.latest = Math.max(c.latest, s.createdAt);
      if (s.userAgent && !c.agents.includes(s.userAgent)) c.agents.push(s.userAgent);
      map.set(key, c);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.latest - a.latest);
  }, [subs.rows]);

  const columns: Column<PushCount>[] = [
    {
      key: "target",
      header: "Target",
      className: "whitespace-nowrap",
      render: (c) => (
        <div>
          <div>{members.label(c.targetId)}</div>
          <Mono value={c.targetId} />
        </div>
      ),
    },
    { key: "count", header: "Subscriptions", className: "text-right font-mono", render: (c) => c.count },
    { key: "latest", header: "Latest", className: "whitespace-nowrap text-stone-600", render: (c) => formatTs(c.latest) },
    {
      key: "agents",
      header: "User agents",
      render: (c) => (c.agents.length ? <span className="text-[11px] text-stone-600">{c.agents.map((a) => truncate(a, 70)).join(" · ")}</span> : <span className="text-stone-300">—</span>),
    },
  ];

  return (
    <Panel
      title={`Push subscriptions (${subs.rows.length})`}
      actions={
        <button type="button" className={btnGhostCls} onClick={() => subs.reload()}>
          Refresh
        </button>
      }
    >
      <ErrorBanner message={subs.error} />
      <div className="grid gap-3 border-b border-stone-200 p-4 sm:grid-cols-3">
        <Stat label="Subscriptions" value={subs.rows.length} />
        <Stat label="Subscribed users" value={counts.length} />
        <Stat label="Members" value={members.rows.length} />
      </div>
      <Notice message="Read-only: deletePushSubscription only removes the caller's own subscriptions." />
      <DataTable columns={columns} rows={counts} loading={subs.loading} empty="No push subscriptions" rowKey={(c) => c.targetId} />
    </Panel>
  );
}
