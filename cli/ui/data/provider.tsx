// React providers for the TUI data layer:
//   <DataProvider> = <SpacetimeDBProvider> + <OrgProvider>
//
// OrgProvider mirrors the web's StoreSwitcher / active-org concept: it lists
// organizations from the live `organization` table and tracks the selected one,
// so every page can filter rows by the same orgId the web uses.

import React, { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { SpacetimeDBProvider, useTable, useSpacetimeDB } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { buildConnectionBuilder, subscribeConn, getConnState, isUserMode, type ConnState } from "./connection.ts";
import { loadConfig } from "../../lib/config.ts";

function normId(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/^0x/, "");
}

export function useConnState(): ConnState {
  return useSyncExternalStore(subscribeConn, getConnState, getConnState);
}

export interface Org {
  id: string;
  name: string;
}
interface OrgCtxValue {
  orgId: string | null;
  orgName: string;
  orgs: Org[];
  ready: boolean;
  select: (id: string) => void;
}

const OrgContext = createContext<OrgCtxValue>({
  orgId: null,
  orgName: "",
  orgs: [],
  ready: false,
  select: () => {},
});
export const useOrg = () => useContext(OrgContext);

function OrgProvider({ children }: { children: React.ReactNode }) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [rawOrgs, ready] = useTable(tables.organization as any);
  const [members] = useTable(tables.orgMember as any);
  const conn = useSpacetimeDB();
  const identity = (conn as any)?.identity;
  const myId = identity ? normId(identity.toHexString ? identity.toHexString() : identity) : "";

  // Restrict the org list to ones the user owns or belongs to (mirrors the web
  // StoreSwitcher). The org table is visible globally, but switching between
  // orgs you can't access would be confusing. Service/admin mode sees all.
  const orgs = useMemo<Org[]>(() => {
    const all = (rawOrgs as any[]).map((o) => ({
      id: String(o.id),
      name: String(o.name ?? "Untitled"),
      ownerId: normId(o.ownerId),
    }));
    const mine = new Set<string>();
    if (myId) {
      for (const o of all) if (o.ownerId === myId) mine.add(o.id);
      for (const m of members as any[]) if (normId(m.userId) === myId) mine.add(m.organizationId);
    }
    const filtered = isUserMode() && mine.size > 0 ? all.filter((o) => mine.has(o.id)) : all;
    return filtered
      .map((o) => ({ id: o.id, name: o.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawOrgs, members, myId]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const configuredOrg = loadConfig().orgId;
  const [selected, setSelected] = useState<string | null>(configuredOrg ?? null);

  // Default to the first org the user actually belongs to.
  const orgId = selected ?? orgs[0]?.id ?? null;
  const orgName = orgs.find((o) => o.id === orgId)?.name ?? "";

  return (
    <OrgContext.Provider value={{ orgId, orgName, orgs, ready, select: setSelected }}>
      {children}
    </OrgContext.Provider>
  );
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const builder = useMemo(() => buildConnectionBuilder(), []);
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <SpacetimeDBProvider connectionBuilder={builder as any}>
      <OrgProvider>{children}</OrgProvider>
    </SpacetimeDBProvider>
  );
}
