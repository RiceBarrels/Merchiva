"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { sqlString } from "@/lib/merchiva-admin/client";
import { ErrorBanner, Panel, btnGhostCls } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { DevicesPanel } from "./devices-panel";
import { InvitationsTable } from "./invitations-table";
import { LocationsPanel } from "./locations-panel";
import { MembersTable } from "./members-table";
import { OrgHeader } from "./org-header";
import { SettingsForm } from "./settings-form";
import { SubscriptionForm } from "./subscription-form";
import type { LocationRow, OrgInvitationRow, OrgMemberRow, OrganizationRow, SettingsRow, StoreDeviceRow, UserRow } from "./types";

export function OrganizationDetail({ orgId }: { orgId: string }) {
  const byOrg = useMemo(() => `WHERE organization_id = ${sqlString(orgId)}`, [orgId]);

  const orgs = useAdminQuery<OrganizationRow>("SELECT * FROM organization");
  const users = useAdminQuery<UserRow>("SELECT * FROM user");
  const members = useAdminQuery<OrgMemberRow>(`SELECT * FROM org_member ${byOrg}`);
  const invitations = useAdminQuery<OrgInvitationRow>(`SELECT * FROM org_invitation ${byOrg}`);
  const settings = useAdminQuery<SettingsRow>(`SELECT * FROM settings ${byOrg}`);
  const locations = useAdminQuery<LocationRow>(`SELECT * FROM location ${byOrg}`);
  const devices = useAdminQuery<StoreDeviceRow>(`SELECT * FROM store_device ${byOrg}`);

  const org = orgs.rows.find((o) => o.id === orgId) ?? null;
  const orgKey = org ? JSON.stringify(org) : "";
  const settingsRow = settings.rows[0] ?? null;
  const owner = org ? users.rows.find((u) => u.identity.toLowerCase() === org.ownerId.toLowerCase()) : undefined;

  const reloadOrg = orgs.reload;
  const reloadMembers = members.reload;
  const reloadInvitations = invitations.reload;
  const reloadSettings = settings.reload;
  const reloadLocations = locations.reload;
  const reloadDevices = devices.reload;

  const reloadAll = useCallback(() => {
    reloadOrg();
    reloadMembers();
    reloadInvitations();
    reloadSettings();
    reloadLocations();
    reloadDevices();
  }, [reloadOrg, reloadMembers, reloadInvitations, reloadSettings, reloadLocations, reloadDevices]);

  if (orgs.loading && !org) {
    return <div className="text-[13px] text-stone-500">Loading organization…</div>;
  }

  if (!org) {
    return (
      <div>
        <Link href="/merchivaAdmin/organizations" className="font-mono text-[11px] uppercase tracking-wider text-stone-500 hover:text-stone-900">
          ← organizations
        </Link>
        <Panel className="mt-3">
          <ErrorBanner message={orgs.error} />
          <div className="px-4 py-6 text-center text-[13px] text-stone-500">
            No organization with id <span className="font-mono">{orgId}</span>.
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" className={btnGhostCls} onClick={reloadAll}>
          Refresh all
        </button>
      </div>
      {/* key = row snapshot so forms reset to fresh values after each reload */}
      <OrgHeader key={`h:${orgKey}`} org={org} owner={owner} memberCount={members.rows.length} onChanged={reloadOrg} />
      <SubscriptionForm key={`s:${orgKey}`} org={org} onChanged={reloadOrg} />
      <MembersTable orgId={orgId} members={members.rows} loading={members.loading} error={members.error} onChanged={reloadMembers} />
      <InvitationsTable orgId={orgId} invitations={invitations.rows} loading={invitations.loading} error={invitations.error} onChanged={reloadInvitations} />
      <SettingsForm key={`c:${settingsRow?.id ?? "none"}:${settingsRow?.updatedAt ?? 0}`} orgId={orgId} settings={settingsRow} loading={settings.loading} error={settings.error} onChanged={reloadSettings} />
      <LocationsPanel orgId={orgId} locations={locations.rows} loading={locations.loading} error={locations.error} onChanged={reloadLocations} />
      <DevicesPanel orgId={orgId} devices={devices.rows} users={users.rows} loading={devices.loading} error={devices.error} onChanged={reloadDevices} />
      <Panel title="Danger zone" className="border-red-200">
        <div className="px-4 py-3 text-[12px] text-stone-600">
          There is no delete-organization reducer in the module, so organizations cannot be deleted from this console. Disable members, cancel the subscription
          and remove devices instead.
        </div>
      </Panel>
    </div>
  );
}
