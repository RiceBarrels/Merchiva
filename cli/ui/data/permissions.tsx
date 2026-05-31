// Permission resolution for the TUI, mirroring lib/context/permissions.tsx +
// lib/db/team.ts. Finds the signed-in user's org_member row for the active org
// and derives a `can(section, action)` gate.
//
//   - service-token / admin connection (no user login) → full access
//   - org owner (organization.ownerId === my identity, or member.role==="owner")
//       → full access
//   - active member → their saved JSON permissions
//   - logged-in user who isn't a member of this org → no access
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { createContext, useContext, useMemo } from "react";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { useOrg } from "./provider.tsx";
import { isUserMode } from "./connection.ts";
import type { PermKey } from "../nav.ts";

type Action = "view" | "edit" | "invite";
type Section = { view?: boolean; edit?: boolean; invite?: boolean };
type Perms = Record<string, Section>;

function defaultPermissions(): Perms {
  return {
    dashboard: { view: true },
    inventory: { view: true, edit: false },
    sales: { view: true },
    staffing: { view: true, edit: false },
    products: { view: true, edit: false },
    settings: { view: true },
    pos: { view: true, edit: false },
    team: { view: false, invite: false, edit: false },
    website: { view: false, edit: false },
    training_grading: { view: false, edit: false },
  };
}

function parsePermissions(raw: unknown): Perms {
  const base = defaultPermissions();
  if (!raw) return base;
  let parsed: Partial<Perms> = {};
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Partial<Perms>;
    } catch {
      return base;
    }
  } else {
    parsed = raw as Partial<Perms>;
  }
  return { ...base, ...parsed } as Perms;
}

function normId(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/^0x/, "");
}

export interface PermsValue {
  ready: boolean;
  isOwner: boolean;
  role: string;
  serviceMode: boolean;
  /** True if the signed-in user has any access to this org at all. */
  member: boolean;
  can: (section: PermKey | undefined, action?: Action) => boolean;
}

const PermsContext = createContext<PermsValue>({
  ready: false,
  isOwner: true,
  role: "owner",
  serviceMode: true,
  member: true,
  can: () => true,
});
export const usePerms = () => useContext(PermsContext);

export function PermsProvider({ children }: { children: React.ReactNode }) {
  const { orgId } = useOrg();
  const conn = useSpacetimeDB();
  const identity = (conn as any)?.identity;
  const myId = identity ? normId(identity.toHexString ? identity.toHexString() : identity) : "";
  const serviceMode = !isUserMode();

  const [members, membersReady] = useTable(tables.orgMember as any);
  const [orgs, orgsReady] = useTable(tables.organization as any);

  const value = useMemo<PermsValue>(() => {
    const ready = membersReady && orgsReady;

    const org = (orgs as any[]).find((o) => String(o.id) === orgId);
    const ownerById = !!org && !!myId && normId(org.ownerId) === myId;

    const member = (members as any[]).find(
      (m) => m.organizationId === orgId && normId(m.userId) === myId && (m.status === "active" || m.status == null),
    );

    const isOwner = serviceMode || ownerById || member?.role === "owner";
    const perms = parsePermissions(member?.permissions);

    const can = (section: PermKey | undefined, action: Action = "view"): boolean => {
      if (!section) return true; // ungated (membership / settings)
      if (!ready) return true; // optimistic until membership loads
      if (serviceMode || isOwner) return true;
      if (!member) return false; // signed in but not a member of this org
      const s = perms[section];
      if (!s) return false;
      return s[action] === true;
    };

    return {
      ready,
      isOwner: Boolean(isOwner),
      role: serviceMode ? "service" : (member?.role ?? (ownerById ? "owner" : "none")),
      serviceMode,
      member: serviceMode || ownerById || Boolean(member),
      can,
    };
  }, [members, membersReady, orgs, orgsReady, orgId, myId, serviceMode]);

  return <PermsContext.Provider value={value}>{children}</PermsContext.Provider>;
}
