"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";
import { ownerPermissions } from "@/lib/db/team";
import { clearCache } from "@/lib/cache";

export interface PermissionsContextValue {
  role: OrgRole;
  permissions: Permissions;
  organizationId: string | null;
  isOwner: boolean;
  can: (section: keyof Permissions, action: "view" | "edit" | "invite") => boolean;
  organizations: OrgSummary[];
  currentOrg: OrgSummary | null;
  switchOrg: (orgId: string) => Promise<void>;
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

  return (
    <PermissionsContext.Provider
      value={{ role, permissions, organizationId, isOwner, can, organizations, currentOrg, switchOrg }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
