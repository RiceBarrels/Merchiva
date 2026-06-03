"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";
import { ownerPermissions } from "@/lib/db/team";
import { clearCache } from "@/lib/cache";
import { rootOrgId as computeRootOrgId, shareGroupOrgIds as computeShareGroupOrgIds } from "@/lib/share-group";

export interface PermissionsContextValue {
  role: OrgRole;
  permissions: Permissions;
  organizationId: string | null;
  isOwner: boolean;
  can: (section: keyof Permissions, action: "view" | "edit" | "invite") => boolean;
  organizations: OrgSummary[];
  currentOrg: OrgSummary | null;
  switchOrg: (orgId: string) => Promise<void>;
  // ─── Multi-store share group ──────────────────────────────────────────────
  // The "root" of the current org's parent/child tree. Equals organizationId
  // when the current org is a root (top-level) store, or the parent id when
  // it's a sub-store.
  rootOrgId: string | null;
  // All org ids in the current share group: root + every sub-store of that
  // root. Used as the filter set for shared resources (staff, products, chat,
  // design, sites). Inventory and forecasts ignore this list and stay strictly
  // per-org.
  shareGroupOrgIds: string[];
  // Stores in the share group, materialized as OrgSummary rows from the live
  // organization subscription. Excludes orgs the user has no membership in —
  // those are filtered out upstream in layout.tsx.
  shareGroupOrgs: OrgSummary[];
  // True when the current org has a parent (is a sub-store).
  isSubStore: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  role: "owner",
  permissions: ownerPermissions(),
  organizationId: null,
  isOwner: true,
  can: () => true,
  organizations: [],
  currentOrg: null,
  switchOrg: async () => {},
  rootOrgId: null,
  shareGroupOrgIds: [],
  shareGroupOrgs: [],
  isSubStore: false,
});

export function PermissionsProvider({
  children,
  role,
  permissions,
  organizationId,
  organizations,
  currentOrg,
}: {
  children: React.ReactNode;
  role: OrgRole;
  permissions: Permissions;
  organizationId: string | null;
  organizations: OrgSummary[];
  currentOrg: OrgSummary | null;
}) {
  const router = useRouter();
  const isOwner = role === "owner";

  function can(section: keyof Permissions, action: "view" | "edit" | "invite"): boolean {
    if (isOwner) return true;
    const section_perms = permissions[section];
    if (!section_perms) return false;
    if (action === "view") return section_perms.view === true;
    if (action === "edit") return section_perms.edit === true;
    if (action === "invite") return section_perms.invite === true;
    return false;
  }

  async function switchOrg(orgId: string) {
    if (!orgId) return;
    // Persist preference so the layout picks this org on next render/refresh.
    try {
      localStorage.setItem("active_org_id", orgId);
    } catch {
      // localStorage may be unavailable in some contexts — ignore.
    }
    clearCache();
    router.refresh();
    // Hard reload so the layout re-reads localStorage and SpacetimeDB
    // subscriptions re-scope under the new active org.
    window.location.reload();
  }

  const { rootOrgId, shareGroupOrgIds, shareGroupOrgs, isSubStore } = useMemo(() => {
    const root = computeRootOrgId(organizationId, organizations);
    const ids = computeShareGroupOrgIds(organizationId, organizations);
    const groupOrgs = organizations.filter((o) => ids.includes(o.id));
    const sub = !!currentOrg?.parentOrgId;
    return { rootOrgId: root, shareGroupOrgIds: ids, shareGroupOrgs: groupOrgs, isSubStore: sub };
  }, [organizationId, organizations, currentOrg]);

  return (
    <PermissionsContext.Provider
      value={{
        role,
        permissions,
        organizationId,
        isOwner,
        can,
        organizations,
        currentOrg,
        switchOrg,
        rootOrgId,
        shareGroupOrgIds,
        shareGroupOrgs,
        isSubStore,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
