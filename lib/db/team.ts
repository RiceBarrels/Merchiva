import { createClient } from "@/lib/supabase/client";
import type { OrgMember, OrgInvitation, OrgSummary, UserProfile, Permissions } from "@/lib/types";

// ─── Mappers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function memberFromDb(row: any): OrgMember {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name ?? "",
    email: row.email ?? "",
    permissions: row.permissions ?? defaultPermissions(),
    status: row.status,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invitationFromDb(row: any): OrgInvitation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    permissions: row.permissions ?? defaultPermissions(),
    token: row.token,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
  };
}

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
  };
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, avatar_url, last_active_org_id")
    .eq("user_id", userId)
    .single();
  if (!data) return null;
  return {
    userId: data.user_id,
    displayName: data.display_name ?? null,
    avatarUrl: data.avatar_url ?? null,
    lastActiveOrgId: data.last_active_org_id ?? null,
  };
}

export async function upsertUserProfile(
  userId: string,
  displayName: string,
  lastActiveOrgId?: string
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = { user_id: userId, display_name: displayName };
  if (lastActiveOrgId !== undefined) payload.last_active_org_id = lastActiveOrgId;
  const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function getUserOrganizations(userId: string): Promise<OrgSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("organization_id, organizations(id, name)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.organization_id as string,
    name: row.organizations?.name ?? "Unknown",
  }));
}

export async function switchActiveOrg(userId: string, orgId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: userId, last_active_org_id: orgId }, { onConflict: "user_id" });
  if (error) throw error;
}

// ─── Organization ─────────────────────────────────────────────────────────────

export async function createOrganization(
  userId: string,
  name: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert({ owner_id: userId, name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getOrganizationId(userId: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("org_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .single();
  return data?.organization_id ?? null;
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getMyOrgMember(userId: string): Promise<OrgMember | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("org_members")
    .select("*, auth_users:user_id(email)")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .single();
  if (!data) return null;
  return memberFromDb({
    ...data,
    email: (data as any).auth_users?.email ?? "",
  });
}

export async function getTeamMembers(organizationId: string): Promise<OrgMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("*")
    .eq("organization_id", organizationId)
    .order("role", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(memberFromDb);
}

export async function addOwnerMember(
  userId: string,
  organizationId: string,
  displayName: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("org_members").insert({
    organization_id: organizationId,
    user_id: userId,
    role: "owner",
    display_name: displayName,
    permissions: ownerPermissions(),
    status: "active",
  });
  if (error) throw error;
}

export async function updateMember(
  memberId: string,
  updates: { role?: OrgMember["role"]; permissions?: Permissions; status?: OrgMember["status"]; displayName?: string }
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.permissions !== undefined) payload.permissions = updates.permissions;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.displayName !== undefined) payload.display_name = updates.displayName;
  const { error } = await supabase.from("org_members").update(payload).eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("org_members")
    .update({ status: "disabled" })
    .eq("id", memberId);
  if (error) throw error;
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function getInvitations(organizationId: string): Promise<OrgInvitation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("org_invitations")
    .select("*")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(invitationFromDb);
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("org_invitations")
    .delete()
    .eq("id", invitationId);
  if (error) throw error;
}

export async function getInvitationByToken(token: string): Promise<OrgInvitation | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("org_invitations")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .single();
  if (!data) return null;
  return invitationFromDb(data);
}

export async function acceptInvitation(
  token: string,
  userId: string,
  displayName: string
): Promise<void> {
  const supabase = createClient();
  const invitation = await getInvitationByToken(token);
  if (!invitation) throw new Error("Invitation not found or already accepted");

  const now = new Date().toISOString();
  if (new Date(invitation.expiresAt) < new Date()) {
    throw new Error("Invitation has expired");
  }

  // Check already a member
  const { data: existing } = await supabase
    .from("org_members")
    .select("id")
    .eq("organization_id", invitation.organizationId)
    .eq("user_id", userId)
    .single();

  if (existing) throw new Error("Already a member of this organization");

  const { error: memberError } = await supabase.from("org_members").insert({
    organization_id: invitation.organizationId,
    user_id: userId,
    role: invitation.role,
    display_name: displayName,
    permissions: invitation.permissions,
    status: "active",
  });
  if (memberError) throw memberError;

  const { error: invErr } = await supabase
    .from("org_invitations")
    .update({ accepted_at: now })
    .eq("id", invitation.id);
  if (invErr) throw invErr;
}

export async function getPendingInvitationForEmail(email: string): Promise<OrgInvitation | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("org_invitations")
    .select("*")
    .eq("email", email.toLowerCase())
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .single();
  if (!data) return null;
  return invitationFromDb(data);
}
