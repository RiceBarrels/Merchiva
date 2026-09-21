"use client";

import Link from "next/link";
import { useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, ErrorBanner, Notice, Panel, btnCls, inputCls } from "@/components/merchiva-admin/ui";
import { subscriptionTone, userLabel, type OrganizationRow, type UserRow } from "./types";
import { fieldCls, labelCls, useAction } from "./use-action";

export function OrgHeader({
  org,
  owner,
  memberCount,
  onChanged,
}: {
  org: OrganizationRow;
  owner: UserRow | undefined;
  memberCount: number;
  onChanged: () => void;
}) {
  const { run, busy, error, notice } = useAction(onChanged);
  const [name, setName] = useState(org.name);
  const [logoUrl, setLogoUrl] = useState(org.logoUrl ?? "");

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
            <dt className="font-mono text-[10.5px] uppercase tracking-wider text-stone-400">Members</dt>
            <dd>
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
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
        </div>
      </Panel>
    </div>
  );
}
