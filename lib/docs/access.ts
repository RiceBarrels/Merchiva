// Client-side document access (UI gating only — reducers stay authoritative).
// MUST match `docRoleFor` in spacetimedb/src/index.ts, i.e. the matrix in the
// plan §B4.5; scripts/tests/docs/access.test.ts enumerates it.
//
//   Org owner                                         → manager
//   Fails the Docs gate (no permissions.dashboard.view === true) → none
//   Org manager, or the document's owner              → manager
//   Anyone else → max(visibility role, explicit grant role)
//                 org_edit → editor, org_view → viewer, private → none
//
// The gate mirrors `can("dashboard", "view")` (lib/context/permissions.tsx) and
// the `<PermissionGuard section="dashboard">` on the docs routes.

import type { OrgRole } from "@/lib/types";
import type { DocAccess, DocAccessGrant, DocGrantRole, DocRole, DocVisibility, DocumentMeta } from "./types";

export const DOC_VISIBILITIES: readonly DocVisibility[] = ["org_edit", "org_view", "private"];
export const DOC_GRANT_ROLES: readonly DocGrantRole[] = ["viewer", "commenter", "editor"];
export const DOC_ROLE_RANK: Readonly<Record<DocRole, number>> = { none: 0, viewer: 1, commenter: 2, editor: 3, manager: 4 };

export const NO_DOC_ACCESS: DocAccess = Object.freeze({
  role: "none",
  canView: false,
  canComment: false,
  canEdit: false,
  canManage: false,
});

export function isDocVisibility(value: unknown): value is DocVisibility {
  return typeof value === "string" && (DOC_VISIBILITIES as readonly string[]).includes(value);
}

export function isDocGrantRole(value: unknown): value is DocGrantRole {
  return typeof value === "string" && (DOC_GRANT_ROLES as readonly string[]).includes(value);
}

/** The `permissions` shape the gate reads; the full `Permissions` object fits. */
export interface DocsGatePermissions { readonly dashboard?: { readonly view?: boolean } | null }

/** Whether the member may use Docs at all (same rule as `can("dashboard", "view")`). */
export function docsGateAllows(orgRole: OrgRole | null | undefined, permissions: DocsGatePermissions | null | undefined): boolean {
  return orgRole === "owner" || permissions?.dashboard?.view === true;
}

export interface ResolveDocAccessInput {
  doc: Pick<DocumentMeta, "id" | "ownerMemberId" | "visibility" | "trashedAt">;
  /** The caller's org_member id in the document's org; null while unknown. */
  memberId: string | null;
  orgRole: OrgRole | null | undefined;
  permissions: DocsGatePermissions | null | undefined;
  /** Grants for this document (org-wide lists are fine — other documents are ignored). */
  grants: readonly Pick<DocAccessGrant, "documentId" | "memberId" | "role">[];
}

/** The caller's role on one document. */
export function docRoleFor(input: ResolveDocAccessInput): DocRole {
  const { doc, memberId, orgRole, permissions, grants } = input;
  if (orgRole === "owner") return "manager";
  if (!docsGateAllows(orgRole, permissions)) return "none";
  if (orgRole === "manager" || (!!memberId && doc.ownerMemberId === memberId)) return "manager";
  let role: DocRole = doc.visibility === "org_edit" ? "editor" : doc.visibility === "org_view" ? "viewer" : "none";
  if (!memberId) return role;
  for (const grant of grants) {
    if (grant.documentId !== doc.id || grant.memberId !== memberId || !isDocGrantRole(grant.role)) continue;
    if (DOC_ROLE_RANK[grant.role] > DOC_ROLE_RANK[role]) role = grant.role;
  }
  return role;
}

/**
 * Capability flags for a role. A trashed document can still be viewed (and
 * managed: restore, delete forever), but the server rejects every other write
 * on it, so editing and commenting are both off.
 */
export function docAccessFromRole(role: DocRole, trashed: boolean): DocAccess {
  const rank = DOC_ROLE_RANK[role];
  return {
    role,
    canView: rank >= DOC_ROLE_RANK.viewer,
    canComment: rank >= DOC_ROLE_RANK.commenter && !trashed,
    canEdit: rank >= DOC_ROLE_RANK.editor && !trashed,
    canManage: role === "manager",
  };
}

export function resolveDocAccess(input: ResolveDocAccessInput): DocAccess {
  return docAccessFromRole(docRoleFor(input), !!input.doc.trashedAt);
}
