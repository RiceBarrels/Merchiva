"use client";

import { createContext, useContext } from "react";
import type { Permissions, OrgRole } from "@/lib/types";
import { ownerPermissions } from "@/lib/db/team";

export interface PermissionsContextValue {
  role: OrgRole;
  permissions: Permissions;
  organizationId: string | null;
  isOwner: boolean;
  can: (section: keyof Permissions, action: "view" | "edit") => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  role: "owner",
  permissions: ownerPermissions(),
  organizationId: null,
  isOwner: true,
  can: () => true,
});

export function PermissionsProvider({
  children,
  role,
  permissions,
  organizationId,
}: {
  children: React.ReactNode;
  role: OrgRole;
  permissions: Permissions;
  organizationId: string | null;
}) {
  const isOwner = role === "owner";

  function can(section: keyof Permissions, action: "view" | "edit"): boolean {
    if (isOwner) return true;
    const section_perms = permissions[section];
    if (!section_perms) return false;
    if (action === "view") return section_perms.view === true;
    if (action === "edit") return section_perms.edit === true;
    return false;
  }

  return (
    <PermissionsContext.Provider
      value={{ role, permissions, organizationId, isOwner, can }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
