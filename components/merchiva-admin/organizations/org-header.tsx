"use client";

import Link from "next/link";
import { useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls } from "@/components/merchiva-admin/ui";
import { subscriptionTone, userLabel, type OrganizationRow, type UserRow } from "./types";
import { fieldCls, labelCls, useAction } from "./use-action";

export function OrgHeader({
  org,
  allOrgs,
  owner,
  memberCount,
  onChanged,
}: {
  org: OrganizationRow;
  allOrgs: OrganizationRow[];
  owner: UserRow | undefined;
  memberCount: number;
  onChanged: () => void;
}) {
  const { run, busy, error, notice } = useAction(onChanged);
  const [name, setName] = useState(org.name);
  const [logoUrl, setLogoUrl] = useState(org.logoUrl ?? "");
  const [parentOrgId, setParentOrgId] = useState(org.parentOrgId ?? "");

  const parent = org.parentOrgId ? allOrgs.find((o) => o.id === org.parentOrgId) : undefined;
  const children = allOrgs.filter((o) => o.parentOrgId === org.id);
  const parentCandidates = allOrgs.filter((o) => o.id !== org.id && !o.parentOrgId);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === org.name) return;
    await run("updateOrg", { organizationId: org.id, name: trimmed }, "Renamed");
  }

  async function saveLogo(e: React.FormEvent) {
    e.preventDefault();
    await run("updateOrgLogo", { organizationId: org.id, logoUrl: logoUrl.trim() || null }, logoUrl.trim() ? "Logo updated" : "Logo cleared");
  }

  async function saveParent(e: React.FormEvent) {
    e.preventDefault();
    if ((parentOrgId || "") === (org.parentOrgId ?? "")) return;
    const target = parentOrgId ? allOrgs.find((o) => o.id === parentOrgId)?.name ?? parentOrgId : null;
    const msg = target ? `Attach "${org.name}" as a sub-store of "${target}"?` : `Detach "${org.name}" from its parent and make it a root org?`;
    if (!window.confirm(msg)) return;
    await run("updateOrgParent", { organizationId: org.id, parentOrgId: parentOrgId || null }, target ? "Parent updated" : "Detached");
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/merchivaAdmin/organizations" className="font-mono text-[11px] uppercase tracking-wider text-stone-500 hover:text-stone-900">
          ← organizations
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {org.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="h-9 w-9 rounded-[0.15rem] border border-stone-200 object-cover" />
          )}
          <h1 className="font-sans text-[24px] font-semibold tracking-tight">{org.name}</h1>
          <Badge tone={subscriptionTone(org.subscriptionStatus)}>{org.subscriptionStatus || "no subscription"}</Badge>
          {org.parentOrgId && <Badge>sub-store</Badge>}
          {children.length > 0 && <Badge>{children.length} sub-store{children.length === 1 ? "" : "s"}</Badge>}
        </div>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] text-stone-600 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-mono text-[10.5px] uppercase tracking-wider text-stone-400">Id</dt>
            <dd className="font-mono text-[11.5px] text-stone-800">{org.id}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10.5px] uppercase tracking-wider text-stone-400">Owner</dt>
            <dd>
              {userLabel(owner, "unknown user")}
              <div className="font-mono text-[10.5px] text-stone-400">{org.ownerId}</div>
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10.5px] uppercase tracking-wider text-stone-400">Created</dt>
            <dd>{formatTs(org.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10.5px] uppercase tracking-wider text-stone-400">Members / Parent</dt>
            <dd>
              {memberCount} member{memberCount === 1 ? "" : "s"}
              {parent && (
                <>
                  {" · parent "}
                  <Link href={`/merchivaAdmin/organizations/${parent.id}`} className="hover:underline">
                    {parent.name}
                  </Link>
                </>
              )}
            </dd>
          </div>
        </dl>
        {children.length > 0 && (
          <div className="mt-1 text-[12px] text-stone-600">
            Sub-stores:{" "}
            {children.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/merchivaAdmin/organizations/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </span>
            ))}
          </div>
        )}
      </div>

      <Panel title="Organization">
        <ErrorBanner message={error} />
        <Notice message={notice} />
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <form onSubmit={rename} className={fieldCls}>
            <label className={labelCls}>Name</label>
            <div className="flex gap-1.5">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
              <button type="submit" className={btnCls} disabled={busy || name.trim() === org.name || !name.trim()}>
                Rename
              </button>
            </div>
          </form>
          <form onSubmit={saveLogo} className={fieldCls}>
            <label className={labelCls}>Logo URL</label>
            <div className="flex gap-1.5">
              <input className={inputCls} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://… (empty clears)" />
              <button type="submit" className={btnCls} disabled={busy || logoUrl.trim() === (org.logoUrl ?? "")}>
                Save
              </button>
            </div>
          </form>
          <form onSubmit={saveParent} className={fieldCls}>
            <label className={labelCls}>Parent org</label>
            <div className="flex gap-1.5">
              <select className={inputCls} value={parentOrgId} onChange={(e) => setParentOrgId(e.target.value)} disabled={children.length > 0}>
                <option value="">— none (root org) —</option>
                {parentCandidates.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button type="submit" className={btnGhostCls} disabled={busy || children.length > 0 || (parentOrgId || "") === (org.parentOrgId ?? "")}>
                Apply
              </button>
            </div>
            <p className="text-[11px] text-stone-500">
              {children.length > 0
                ? "Has sub-stores, so it cannot itself become a sub-store."
                : "Detaching always works. Attaching is accepted by the module only when the caller owns the parent, so it may be rejected for the admin identity."}
            </p>
          </form>
        </div>
      </Panel>
    </div>
  );
}
