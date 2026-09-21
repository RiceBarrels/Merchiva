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
  // Soft switch used by /choose: re-scopes the layout's auth state in place
  // (no reload). Falls back to switchOrg when the layout didn't wire it.
  pickOrg: (orgId: string) => void;
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
  pickOrg: () => {},
});

export function PermissionsProvider({
  children,
  role,
  permissions,
  organizationId,
  organizations,
  currentOrg,
  onPickOrg,
}: {
  children: React.ReactNode;
  role: OrgRole;
  permissions: Permissions;
  organizationId: string | null;
  organizations: OrgSummary[];
  currentOrg: OrgSummary | null;
  onPickOrg?: (orgId: string) => void;
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

  function pickOrg(orgId: string) {
    if (!orgId || orgId === organizationId) return;
    if (onPickOrg) {
      try { localStorage.setItem("active_org_id", orgId); } catch {}
      onPickOrg(orgId);
      return;
    }
    void switchOrg(orgId);
  }

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
        pickOrg,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
