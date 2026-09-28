// Client-side Drive access (UI gating only — reducers stay authoritative).
// MUST match spacetimedb/src/drive/logic.ts (driveAccessOf, driveItemRole,
// spaceMoveAllowed) and drive/context.ts actorRights;
// scripts/tests/drive/parity.test.ts runs both over the same matrix.
//
//   Drive admin power ("everyone's files"): fails the Docs gate → none;
//   owner / manager → view + edit; permissions.drive.edit → view + edit;
//   permissions.drive.view → view.
//
//   Item role: fails the gate, or another organization's item → none;
//   org owner / manager, or the item's owner → manager; drive.edit → editor;
//   a Store item → contributor; drive.view → viewer; else none.
//
// Never read the power through `can("drive", …)`: the manager layout merges
// role defaults into a manager's permissions. Pass the member's own permissions.
//
// On /store the account signed in on the tablet may act for a PIN operator; the
// module then grants the lower of both roles. storeDeviceIsStoreOnly says when
// that leaves the tablet with the Store space only.

import { docsGateAllows, type DocsGatePermissions } from "@/lib/docs/access";
import type { OrgRole } from "@/lib/types";
import type { DriveAdminAccess, DriveItem, DriveItemAccess, DriveItemRole } from "./types";

/** The `permissions` shape the gate and the Drive power read; the full `Permissions` object fits. */
export type DriveGatePermissions = DocsGatePermissions;

/** = DRIVE_ROLE_RANK in spacetimedb/src/drive/logic.ts (parity-tested). */
export const DRIVE_ROLE_RANK: Readonly<Record<DriveItemRole, number>> = { none: 0, viewer: 1, contributor: 2, editor: 3, manager: 4 };

/** Owners and managers ("org admins"): manager on every item and document of their org. */
export function isOrgAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/** The Drive "everyone's files" power, with the Docs gate applied (the module's docMemberGate && driveAccessOf). */
export function driveAdminAccess(
  role: OrgRole | null | undefined,
  permissions: DriveGatePermissions | null | undefined,
): DriveAdminAccess {
  if (!docsGateAllows(role, permissions)) return { view: false, edit: false };
  if (isOrgAdminRole(role)) return { view: true, edit: true };
  const edit = permissions?.drive?.edit === true;
  return { view: edit || permissions?.drive?.view === true, edit };
}

/** driveAdminAccess under drive-ui's names. */
export function driveAdminFlags(
  role: OrgRole | null | undefined,
  permissions: DriveGatePermissions | null | undefined,
): { canViewAll: boolean; canEditAll: boolean } {
  const access = driveAdminAccess(role, permissions);
  return { canViewAll: access.view, canEditAll: access.edit };
}

/** Who the UI evaluates Drive rights for. `gate` = docsGateAllows(role, permissions); the flags = driveAdminFlags. */
export interface DriveClientActor {
  organizationId: string | null;
  memberId: string | null;
  role: OrgRole | null;
  gate: boolean;
  canViewAll: boolean;
  canEditAll: boolean;
}

/** Role of `actor` on `item`. MUST match spacetimedb/src/drive/logic.ts driveItemRole. */
export function driveItemRole(item: Pick<DriveItem, "organizationId" | "ownerMemberId" | "space">, actor: DriveClientActor): DriveItemRole {
  if (!actor.gate || actor.organizationId === null || item.organizationId !== actor.organizationId) return "none";
  if (isOrgAdminRole(actor.role) || (!!actor.memberId && item.ownerMemberId === actor.memberId)) return "manager";
  if (actor.canEditAll) return "editor";
  if (item.space === "store") return "contributor";
  if (actor.canViewAll) return "viewer";
  return "none";
}

/**
 * Capability flags. canAddChildren also needs a ready, untrashed folder; the rest follow the role alone (the
 * module rejects renames and moves of trashed or pending rows on its own, and the UI checks those states).
 */
export function resolveDriveItemAccess(
  item: Pick<DriveItem, "organizationId" | "ownerMemberId" | "space" | "trashed" | "status" | "kind">,
  actor: DriveClientActor,
): DriveItemAccess {
  const role = driveItemRole(item, actor);
  const rank = DRIVE_ROLE_RANK[role];
  return {
    role,
    canView: rank >= DRIVE_ROLE_RANK.viewer,
    canAddChildren: rank >= DRIVE_ROLE_RANK.contributor && item.kind === "folder" && !item.trashed && item.status === "ready",
    canEdit: rank >= DRIVE_ROLE_RANK.editor,
    canManage: rank >= DRIVE_ROLE_RANK.manager,
  };
}

/**
 * Whether content may move between containers; role checks still apply. Same space (and, in `my`, same owner):
 * always. Into `my` of O: every moved row is already O's, and the actor is O or an org admin. `my` of O → `store`
 * publishes O's private files: only O, or an org admin rescuing a departed O's. `actorOrgAdmin` = the tablet
 * account AND the acting operator are owners/managers. MUST match spacetimedb/src/drive/logic.ts spaceMoveAllowed.
 */
export function spaceMoveAllowed(input: {
  fromSpace: string; fromOwner: string; toSpace: string; toOwner: string; subtreeOwners: readonly string[];
  actorMemberId: string; actorOrgAdmin: boolean; fromOwnerActive: boolean;
}): boolean {
  const { fromSpace, fromOwner, toSpace, toOwner, subtreeOwners, actorMemberId, actorOrgAdmin, fromOwnerActive } = input;
  const isSpace = (s: string) => s === "my" || s === "store";
  if (!isSpace(fromSpace) || !isSpace(toSpace)) return false;
  if (fromSpace === toSpace && (toSpace === "store" || fromOwner === toOwner)) return true;
  if (toSpace === "my") {
    if (toOwner === "") return false;
    return subtreeOwners.every((owner) => owner === toOwner) && (actorMemberId === toOwner || actorOrgAdmin);
  }
  return (fromOwner !== "" && actorMemberId === fromOwner) || (actorOrgAdmin && !fromOwnerActive);
}

/**
 * Whether Drive on a store tablet shows the Store space only: the tablet ACCOUNT (not the PIN operator) is not an
 * owner or manager, so every My-files write would fail with `[drive.device_scope]` (the module intersects both roles).
 */
export function storeDeviceIsStoreOnly(accountRole: OrgRole | null | undefined): boolean {
  return !isOrgAdminRole(accountRole);
}
