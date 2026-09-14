"use client";

import { useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import type { StoreDeviceRow, UserRow } from "./types";
import { userLabel } from "./types";
import { useAction } from "./use-action";

export function DevicesPanel({
  orgId,
  devices,
  users,
  loading,
  error,
  onChanged,
}: {
  orgId: string;
  devices: StoreDeviceRow[];
  users: UserRow[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const action = useAction(onChanged);
  const [renaming, setRenaming] = useState<{ deviceId: string; name: string } | null>(null);
  const userById = new Map(users.map((u) => [u.identity.toLowerCase(), u]));
  const sorted = [...devices].sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  async function toggle(d: StoreDeviceRow) {
    await action.run("updateStoreDevice", { organizationId: orgId, deviceId: d.deviceId, name: null, enabled: !d.enabled }, `Device ${d.enabled ? "disabled" : "enabled"}`);
  }

  async function remove(d: StoreDeviceRow) {
    if (!window.confirm(`Remove device "${d.name}"? It will need to be registered again.`)) return;
    await action.run("removeStoreDevice", { organizationId: orgId, deviceId: d.deviceId }, "Device removed");
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    const ok = await action.run("updateStoreDevice", { organizationId: orgId, deviceId: renaming.deviceId, name: renaming.name.trim(), enabled: null }, "Device renamed");
    if (ok) setRenaming(null);
  }

  const columns: Column<StoreDeviceRow>[] = [
    { key: "name", header: "Name", render: (d) => <span className="font-medium">{d.name}</span> },
    { key: "enabled", header: "Enabled", render: (d) => <Badge tone={d.enabled ? "ok" : "danger"}>{d.enabled ? "enabled" : "disabled"}</Badge> },
    { key: "lastSeenAt", header: "Last seen", render: (d) => <span className="text-stone-600">{formatTs(d.lastSeenAt)}</span> },
    { key: "registeredBy", header: "Registered by", render: (d) => <span className="text-stone-700">{userLabel(userById.get(d.registeredBy.toLowerCase()), d.registeredBy.slice(0, 12) + "…")}</span> },
    { key: "createdAt", header: "Created", render: (d) => <span className="text-stone-600">{formatTs(d.createdAt)}</span> },
    { key: "deviceId", header: "Device id", className: "font-mono text-[10.5px] text-stone-500" },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (d) => (
        <span className="inline-flex gap-1">
          <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => setRenaming({ deviceId: d.deviceId, name: d.name })}>
            Rename
          </button>
          <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => toggle(d)}>
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
    <Panel title={`Store devices (${devices.length})`}>
      <ErrorBanner message={error ?? action.error} />
      <Notice message={action.notice} />
      <DataTable columns={columns} rows={sorted} loading={loading} empty="No store devices registered" rowKey={(d) => d.id} />
      {renaming && (
        <form onSubmit={rename} className="flex flex-wrap items-center gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3">
          <span className="text-[12px] text-stone-600">Rename device</span>
          <input className={`${inputCls} max-w-xs`} value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} required />
          <button type="submit" className={btnCls} disabled={action.busy}>
            Save
          </button>
          <button type="button" className={btnGhostCls} onClick={() => setRenaming(null)}>
            Cancel
          </button>
        </form>
      )}
    </Panel>
  );
}
