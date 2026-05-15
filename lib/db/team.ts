// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { OrgMember, OrgInvitation, OrgSummary, UserProfile, Permissions } from "@/lib/types";

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultPermissions(): Permissions {
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

export function ownerPermissions(): Permissions {
  return {
    dashboard: { view: true },
    inventory: { view: true, edit: true },
    sales: { view: true },
    staffing: { view: true, edit: true },
    products: { view: true, edit: true },
    settings: { view: true },
    pos: { view: true, edit: true },
    team: { view: true, invite: true, edit: true },
    website: { view: true, edit: true },
    training_grading: { view: true, edit: true },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePermissions(raw: unknown): Permissions {
  const base = defaultPermissions();
  if (!raw) return base;
  let parsed: Partial<Permissions> = {};
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw) as Partial<Permissions>; } catch { return base; }
  } else {
    parsed = raw as Partial<Permissions>;
  }
  // Merge parsed onto base so new permission keys added after the JSON was saved
  // still have defaults rather than being undefined.
  return { ...base, ...parsed } as Permissions;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function memberFromRow(r: any): OrgMember {
  return {
    id: r.id.toString(),
    organizationId: r.organizationId,
    userId: String(r.userId),
    role: r.role,
    displayName: r.displayName ?? "",
    email: r.email ?? "",
    permissions: parsePermissions(r.permissions),
    status: r.status,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invitationFromRow(r: any): OrgInvitation {
  return {
    id: r.id.toString(),
    organizationId: r.organizationId,
    email: r.email,
    role: r.role,
    permissions: parsePermissions(r.permissions),
    token: r.token,
    expiresAt: r.expiresAt ? String(r.expiresAt) : "",
    acceptedAt: r.acceptedAt ? String(r.acceptedAt) : null,
  };
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.user.iter();
  for (const r of rows) {
    if (String(r.identity) === userId) {
      return {
        userId: String(r.identity),
        displayName: r.displayName ?? null,
        avatarUrl: r.avatarUrl ?? null,
        lastActiveOrgId: r.lastActiveOrgId ?? null,
      };
    }
  }
  return null;
}

export async function upsertUserProfile(
  userId: string,
  displayName: string,
  lastActiveOrgId?: string
): Promise<void> {
  console.warn("[team] upsertUserProfile: writes not yet supported via SpacetimeDB client");
}

export async function getUserOrganizations(userId: string): Promise<OrgSummary[]> {
  const c = getConnection();
  if (!c) return [];
  const memberRows = (c as any).db.orgMember.iter();
  const orgIds: string[] = [];
  for (const r of memberRows) {
    if (String(r.userId) === userId && r.status === "active") {
      orgIds.push(r.organizationId);
    }
  }
  if (orgIds.length === 0) return [];

  const orgRows = (c as any).db.organization.iter();
  const orgMap = new Map<string, string>();
  for (const o of orgRows) {
    orgMap.set(o.id, o.name);
  }

  return orgIds.map((id) => ({
    id,
    name: orgMap.get(id) ?? "Unknown",
  }));
}

export async function switchActiveOrg(userId: string, orgId: string): Promise<void> {
  console.warn("[team] switchActiveOrg: writes not yet supported via SpacetimeDB client");
}

// ─── Organization ─────────────────────────────────────────────────────────────

export async function createOrganization(
  userId: string,
  name: string
): Promise<string> {
  console.warn("[team] createOrganization: writes not yet supported via SpacetimeDB client");
  return "";
}

export async function getOrganizationId(userId: string): Promise<string | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.orgMember.iter();
  for (const r of rows) {
    if (String(r.userId) === userId && r.status === "active") {
      return r.organizationId;
    }
  }
  return null;
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getMyOrgMember(userId: string): Promise<OrgMember | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.orgMember.iter();
  for (const r of rows) {
    if (String(r.userId) === userId && r.status === "active") {
      return memberFromRow(r);
    }
  }
  return null;
}

export async function getTeamMembers(organizationId: string): Promise<OrgMember[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.orgMember.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId)
    .map(memberFromRow);
}

export async function addOwnerMember(
  userId: string,
  organizationId: string,
  displayName: string
): Promise<void> {
  console.warn("[team] addOwnerMember: writes not yet supported via SpacetimeDB client");
}

export async function updateMember(
  memberId: string,
  updates: { role?: OrgMember["role"]; permissions?: Permissions; status?: OrgMember["status"]; displayName?: string }
): Promise<void> {
  console.warn("[team] updateMember: writes not yet supported via SpacetimeDB client");
}

export async function removeMember(memberId: string): Promise<void> {
  console.warn("[team] removeMember: writes not yet supported via SpacetimeDB client");
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function getInvitations(organizationId: string): Promise<OrgInvitation[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.orgInvitation.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId && !r.acceptedAt)
    .map(invitationFromRow);
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  console.warn("[team] cancelInvitation: writes not yet supported via SpacetimeDB client");
}

export async function getInvitationByToken(token: string): Promise<OrgInvitation | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.orgInvitation.iter();
  for (const r of rows) {
    if (r.token === token && !r.acceptedAt) {
      return invitationFromRow(r);
    }
  }
  return null;
}

export async function acceptInvitation(
  token: string,
  userId: string,
  displayName: string
): Promise<void> {
  console.warn("[team] acceptInvitation: writes not yet supported via SpacetimeDB client");
}

export async function getPendingInvitationForEmail(email: string): Promise<OrgInvitation | null> {
  const c = getConnection();
  if (!c) return null;
  const now = new Date();
  const rows = (c as any).db.orgInvitation.iter();
  for (const r of rows) {
    if (
      r.email === email.toLowerCase() &&
      !r.acceptedAt &&
      new Date(String(r.expiresAt)) > now
    ) {
      return invitationFromRow(r);
    }
  }
  return null;
}
