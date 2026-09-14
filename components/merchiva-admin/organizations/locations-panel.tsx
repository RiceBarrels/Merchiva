"use client";

import { useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import type { LocationRow } from "./types";
import { fieldCls, labelCls, useAction } from "./use-action";

interface Draft {
  id: string | null;
  name: string;
  address: string;
  phone: string;
  isDefault: boolean;
  sortOrder: string;
}

const EMPTY: Draft = { id: null, name: "", address: "", phone: "", isDefault: false, sortOrder: "0" };

export function LocationsPanel({ orgId, locations, loading, error, onChanged }: { orgId: string; locations: LocationRow[]; loading: boolean; error: string | null; onChanged: () => void }) {
  const action = useAction(onChanged);
  const [draft, setDraft] = useState<Draft | null>(null);

  const sorted = [...locations].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isFinite(sortOrder)) {
      action.setError("Sort order must be a number");
      return;
    }
    const args = {
      organizationId: orgId,
      name: draft.name.trim(),
      address: draft.address.trim() || null,
      phone: draft.phone.trim() || null,
      isDefault: draft.isDefault,
      sortOrder,
    };
    const ok = draft.id
      ? await action.run("updateLocation", { ...args, locationId: draft.id }, "Location updated")
      : await action.run("addLocation", args, "Location added");
    if (ok) setDraft(null);
  }

  async function remove(loc: LocationRow) {
    if (!window.confirm(`Delete location "${loc.name}"?`)) return;
    await action.run("deleteLocation", { organizationId: orgId, locationId: loc.id }, "Location deleted");
  }

  const columns: Column<LocationRow>[] = [
    { key: "name", header: "Name", render: (l) => (<span className="font-medium">{l.name}{l.isDefault && <Badge tone="ok">default</Badge>}</span>) },
    { key: "address", header: "Address" },
    { key: "phone", header: "Phone", className: "font-mono" },
    { key: "sortOrder", header: "Sort", className: "font-mono tabular-nums" },
    { key: "createdAt", header: "Created", render: (l) => <span className="text-stone-600">{formatTs(l.createdAt)}</span> },
    { key: "id", header: "Id", className: "font-mono text-[10.5px] text-stone-500" },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (l) => (
        <span className="inline-flex gap-1">
          <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => setDraft({ id: l.id, name: l.name, address: l.address ?? "", phone: l.phone ?? "", isDefault: l.isDefault, sortOrder: String(l.sortOrder) })}>
            Edit
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => remove(l)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <Panel
      title={`Locations (${locations.length})`}
      actions={
        <button type="button" className={btnGhostCls} onClick={() => setDraft({ ...EMPTY, sortOrder: String(locations.length) })}>
          Add location
        </button>
      }
    >
      <ErrorBanner message={error ?? action.error} />
      <Notice message={action.notice} />
      <DataTable columns={columns} rows={sorted} loading={loading} empty="No locations" rowKey={(l) => l.id} />
      {draft && (
        <form onSubmit={submit} className="border-t border-stone-200 bg-stone-50 px-4 py-3">
          <div className="mb-2 text-[12px] text-stone-600">{draft.id ? "Edit location" : "New location"}</div>
          <div className="grid gap-3 md:grid-cols-5">
            <div className={fieldCls}>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
            </div>
            <div className={`${fieldCls} md:col-span-2`}>
              <label className={labelCls}>Address</label>
              <input className={inputCls} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>Phone</label>
              <input className={`${inputCls} font-mono`} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>Sort order</label>
              <input className={`${inputCls} font-mono`} type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
              Default location
            </label>
            <button type="submit" className={btnCls} disabled={action.busy}>
              {action.busy ? "Saving…" : draft.id ? "Save" : "Add"}
            </button>
            <button type="button" className={btnGhostCls} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
