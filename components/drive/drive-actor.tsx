"use client";

// Who Drive acts for, and with which rights.
//
// /manager: the signed-in member, acting for themself (`actingMemberId` '').
// /personal and /store: the lite app mounts DriveActorProvider with the panel's member — the
// signed-in employee on /personal, the PIN / QR operator on /store. The provider also mounts
// lib/drive/actor-context.ts, so the Docs and Drive hooks (useCurrentMemberId, useDrive,
// useDocuments, useDriveUrl) evaluate access and stars for that person, and on /store every
// write and signed-URL request names the operator (`actingMemberId`).
//
// On /store the SpacetimeDB identity is the tablet ACCOUNT. The module grants the lower of the
// account's and the operator's rights (spacetimedb/src/drive/context.ts itemRoleOf, docRoleOf,
// adminOf), so when the account is not an owner or manager, `ceiling` carries the account's own
// rights and the Drive UI ANDs every flag with it (components/drive/model/entries.ts). The
// account's permissions are read from its raw org_member JSON the way the module reads them.
// Client-side scoping is presentation only; the reducers and /api/drive/url decide.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { LiteMember } from "@/components/device/apps/types";
import { usePermissions } from "@/lib/context/permissions";
import { docsGateAllows, resolveDocAccess, type DocsGatePermissions } from "@/lib/docs/access";
import { mapGrant } from "@/lib/docs/mappers";
import type { DocAccessGrant, DocumentMeta } from "@/lib/docs/types";
import { driveAdminAccess, isOrgAdminRole, resolveDriveItemAccess, type DriveClientActor } from "@/lib/drive/access";
import { DriveActorOverrideContext, type DriveActorOverride } from "@/lib/drive/actor-context";
import type { DriveAdminAccess, DriveItem, DriveSpace, DriveSurface } from "@/lib/drive/types";
import { useDocumentAccessRows, useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useDocsBackendStatus, useSignedInMember } from "@/lib/spacetimedb/hooks/useDocs";
import type { OrgRole } from "@/lib/types";
import type { AccessCeiling } from "./model/types";

export interface DriveActor {
  /**
   * org_member id of the person using Drive (the operator on /store); null until known. Always the module's
   * reference form (canonicalMemberId: lowercase, hyphenated), whatever form the source hook returned.
   */
  memberId: string | null;
  /** Passed to every Drive write: the operator's id on /store, '' elsewhere. */
  actingMemberId: string;
  /** actingMemberId !== ''. */
  acting: boolean;
  role: OrgRole | null;
  surface: DriveSurface;
  /** The "everyone's files" view power (on /store: the operator's AND the tablet account's). */
  canViewAll: boolean;
  /** The "everyone's files" edit power (same intersection). */
  canEditAll: boolean;
  /** Non-null only on /store when the tablet account is not an owner / manager and is not the operator. */
  ceiling: AccessCeiling | null;
  ready: boolean;
}

interface ActorScope {
  memberId: string | null;
  surface: "store" | "personal";
}

const DriveActorScopeContext = createContext<ActorScope | null>(null);
DriveActorScopeContext.displayName = "DriveActorScopeContext";

const NO_ADMIN: DriveAdminAccess = Object.freeze({ view: false, edit: false });
const NO_GRANTS: readonly DocAccessGrant[] = Object.freeze([]);
const ORG_ROLES: readonly string[] = ["owner", "manager", "staff"] satisfies readonly OrgRole[];

/**
 * A member id as the module stores it in references (lowercase, hyphenated uuid); '' → null. A 32-hex id — a
 * Uuid read through toHexString, as lib/docs/mappers idString does — gets its dashes back.
 */
export function canonicalMemberId(id: string | null | undefined): string | null {
  const clean = String(id ?? "").trim().toLowerCase();
  if (clean === "") return null;
  const hex = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/.exec(clean);
  return hex ? `${hex[1]}-${hex[2]}-${hex[3]}-${hex[4]}-${hex[5]}` : clean;
}

/** A uuid column's canonical text: Uuid.toString() is the hyphenated form the module stores in every reference. */
function rowIdText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Member ids compare case- and dash-insensitively (an id read through toHexString has no dashes). */
function sameMember(a: string | null, b: string | null): boolean {
  const norm = (id: string | null) => (id ?? "").replace(/-/g, "");
  return norm(a) !== "" && norm(a) === norm(b);
}

type TableResult = readonly [readonly unknown[], boolean];

/**
 * Whether a scoped table result (lib/spacetimedb/hooks useScopedDocTable) has applied for `scope`; a null scope
 * never has. On the render where `scope` changes, spacetimedb/react's useTable still returns the snapshot cached
 * under the previous query (`[[], true]` after a disabled one) and replaces it only after the commit: its
 * getSnapshot reads a ref that an effect clears. So the snapshot seen when the scope changed never counts.
 */
export function useScopedTableReady(scope: string | null, result: TableResult): boolean {
  const [start, setStart] = useState(() => ({ scope, result }));
  if (start.scope !== scope) setStart({ scope, result });
  return scope !== null && result[1] && start.scope === scope && start.result !== result;
}

/**
 * An org_member's raw permissions JSON read the way the module does: docMemberGate passes
 * unreadable JSON or a missing `dashboard` key (the role defaults grant it), and driveAccessOf
 * grants no Drive power from unreadable JSON.
 */
export function memberGatePermissions(raw: string): DocsGatePermissions {
  let stored: unknown;
  try {
    stored = JSON.parse(raw || "{}");
  } catch {
    return { dashboard: { view: true }, drive: { view: false, edit: false } };
  }
  const object = stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : null;
  const flag = (section: unknown, key: string) =>
    section !== null && typeof section === "object" && (section as Record<string, unknown>)[key] === true;
  return {
    dashboard: { view: !object || !("dashboard" in object) || flag(object.dashboard, "view") },
    drive: { view: flag(object?.drive, "view"), edit: flag(object?.drive, "edit") },
  };
}

export function DriveActorProvider({ member, surface, children }: { member: LiteMember; surface: "store" | "personal"; children: ReactNode }) {
  const memberId = canonicalMemberId(member.id);
  const scope = useMemo((): ActorScope => ({ memberId, surface }), [memberId, surface]);
  const override = useMemo(
    (): DriveActorOverride => ({ memberId, actingMemberId: surface === "store" && memberId ? memberId : "" }),
    [memberId, surface],
  );
  return (
    <DriveActorScopeContext.Provider value={scope}>
      <DriveActorOverrideContext.Provider value={override}>{children}</DriveActorOverrideContext.Provider>
    </DriveActorScopeContext.Provider>
  );
}

export interface DriveActorIds {
  memberId: string | null;
  actingMemberId: string;
  surface: DriveSurface;
  /** In a panel: the member is known. On /manager: the membership rows have loaded (memberId may stay null). */
  ready: boolean;
}

/** The cheap part of useDriveActor (no rights): who acts, where. Used by the notice gates. */
export function useDriveActorIds(): DriveActorIds {
  const scope = useContext(DriveActorScopeContext);
  const signedIn = useSignedInMember();
  const memberId = scope ? scope.memberId : canonicalMemberId(signedIn.memberId);
  const surface: DriveSurface = scope ? scope.surface : "manager";
  const actingMemberId = scope?.surface === "store" && scope.memberId ? scope.memberId : "";
  const ready = scope ? scope.memberId !== null : signedIn.ready;
  return useMemo(() => ({ memberId, actingMemberId, surface, ready }), [memberId, actingMemberId, surface, ready]);
}

interface TabletAccount {
  id: string;
  role: OrgRole | null;
  permissions: DocsGatePermissions;
}

/** No provider → the manager actor (the signed-in member, acting for themself). */
export function useDriveActor(): DriveActor {
  const ids = useDriveActorIds();
  const { role, permissions, organizationId } = usePermissions();
  const signedIn = useSignedInMember();
  const [memberRows] = useOrgMembers();
  const docsStatus = useDocsBackendStatus();
  const onStore = ids.surface === "store";

  // The tablet account's own row (the signed-in identity; never the operator).
  const tablet = useMemo((): TabletAccount | null => {
    if (!onStore || !signedIn.memberId || !organizationId) return null;
    const row = memberRows.find(
      (m) => m.organizationId === organizationId && m.status === "active" && sameMember(rowIdText(m.id), signedIn.memberId),
    );
    if (!row) return null;
    return {
      id: rowIdText(row.id),
      role: ORG_ROLES.includes(row.role) ? (row.role as OrgRole) : null,
      permissions: memberGatePermissions(row.permissions),
    };
  }, [onStore, signedIn.memberId, organizationId, memberRows]);

  const tabletKnown = !onStore || signedIn.ready;
  const tabletIsOperator = tablet !== null && sameMember(tablet.id, ids.memberId);
  const needsCeiling = onStore && tabletKnown && ids.memberId !== null && !tabletIsOperator && !isOrgAdminRole(tablet?.role);

  // The tablet account's own grants: the module intersects document roles too (docRoleOf).
  const grantsOrgId = needsCeiling && tablet && docsStatus === "ready" ? organizationId : null;
  const accessResult: TableResult = useDocumentAccessRows(grantsOrgId);
  const accessRows = accessResult[0];
  const accessRowsReady = useScopedTableReady(grantsOrgId, accessResult);
  const grantsReady = !needsCeiling || !tablet || docsStatus === "not_published" || accessRowsReady;
  const tabletGrants = useMemo(() => {
    const byDoc = new Map<string, DocAccessGrant[]>();
    if (!tablet || grantsOrgId === null) return byDoc;
    for (const row of accessRows) {
      const grant = mapGrant(row);
      if (!grant || !sameMember(grant.memberId, tablet.id)) continue;
      const list = byDoc.get(grant.documentId);
      if (list) list.push(grant);
      else byDoc.set(grant.documentId, [grant]);
    }
    return byDoc;
  }, [accessRows, tablet, grantsOrgId]);

  const ceiling = useMemo((): AccessCeiling | null => {
    if (!needsCeiling) return null;
    // A tablet account that is no active member here has no rights at all (role and gate fail).
    const admin = tablet ? driveAdminAccess(tablet.role, tablet.permissions) : NO_ADMIN;
    const account: DriveClientActor = {
      organizationId,
      memberId: tablet?.id ?? null,
      role: tablet?.role ?? null,
      gate: tablet ? docsGateAllows(tablet.role, tablet.permissions) : false,
      canViewAll: admin.view,
      canEditAll: admin.edit,
    };
    return {
      item: (item: DriveItem) => resolveDriveItemAccess(item, account),
      doc: (doc: DocumentMeta) =>
        resolveDocAccess({
          doc,
          memberId: account.memberId,
          orgRole: account.role,
          permissions: tablet?.permissions ?? null,
          grants: tabletGrants.get(doc.id) ?? NO_GRANTS,
        }),
    };
  }, [needsCeiling, organizationId, tablet, tabletGrants]);

  // What the operator holds (usePermissions is re-scoped to them on /store), ANDed with the account when acting.
  const own = driveAdminAccess(role, permissions);
  const accountAdmin = !onStore || tabletIsOperator ? own : tablet ? driveAdminAccess(tablet.role, tablet.permissions) : NO_ADMIN;
  const canViewAll = tabletKnown && own.view && accountAdmin.view;
  const canEditAll = tabletKnown && own.edit && accountAdmin.edit;
  const ready = ids.ready && tabletKnown && grantsReady;

  return useMemo(
    (): DriveActor => ({
      memberId: ids.memberId,
      actingMemberId: ids.actingMemberId,
      acting: ids.actingMemberId !== "",
      role: role ?? null,
      surface: ids.surface,
      canViewAll,
      canEditAll,
      ceiling,
      ready,
    }),
    [ids.memberId, ids.actingMemberId, ids.surface, role, canViewAll, canEditAll, ceiling, ready],
  );
}

/**
 * Where a Doc created in a device panel goes: on /store the Store space root, owned and attributed
 * to the operator (Docs' default visibility org_edit is the Store space). null on /manager and
 * /personal, where Docs keeps its own createDocument.
 */
export function useDocCreatePlacement(): { space: DriveSpace; folderId: string; actingMemberId: string } | null {
  const scope = useContext(DriveActorScopeContext);
  const actingMemberId = scope?.surface === "store" && scope.memberId ? scope.memberId : "";
  return useMemo(() => (actingMemberId ? { space: "store" as const, folderId: "", actingMemberId } : null), [actingMemberId]);
}
