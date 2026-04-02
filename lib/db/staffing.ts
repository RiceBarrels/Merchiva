import { createClient } from "@/lib/supabase/client";
import type { Shift, StaffRole, OrgMember } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shiftFromDb(row: any): Shift {
  return {
    id: row.id,
    memberId: row.member_id ?? null,
    staffName: row.staff_name,
    staffRole: row.staff_role ?? null,
    date: row.date,
    shiftType: row.shift_type,
    startTime: row.start_time,
    endTime: row.end_time,
    predictedDemand: row.predicted_demand ?? "medium",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function roleFromDb(row: any): StaffRole {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? "#44403c",
    permissions: row.permissions ?? {},
  };
}

// ─── Team Members (from org_members) ──────────────────────────────────────────

export async function getTeamForScheduling(
  organizationId: string
): Promise<OrgMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("display_name");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name ?? "",
    email: "",
    permissions: row.permissions ?? {},
    status: row.status,
  }));
}

// ─── Shifts ────────────────────────────────────────────────────────────────────

export async function getShifts(weeksAhead = 2): Promise<Shift[]> {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const future = new Date();
  future.setDate(future.getDate() + weeksAhead * 7);
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .gte("date", today)
    .lte("date", future.toISOString().split("T")[0])
    .order("date")
    .order("start_time");
  if (error) throw error;
  return (data ?? []).map(shiftFromDb);
}

export async function addShift(
  shift: Omit<Shift, "id">,
  userId: string
): Promise<Shift> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shifts")
    .insert({
      user_id: userId,
      member_id: shift.memberId || null,
      staff_name: shift.staffName,
      staff_role: shift.staffRole || null,
      date: shift.date,
      shift_type: shift.shiftType,
      start_time: shift.startTime,
      end_time: shift.endTime,
      predicted_demand: shift.predictedDemand,
    })
    .select()
    .single();
  if (error) throw error;
  return shiftFromDb(data);
}

export async function deleteShift(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) throw error;
}

// ─── Staff Roles ──────────────────────────────────────────────────────────────

export async function getStaffRoles(): Promise<StaffRole[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff_roles")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []).map(roleFromDb);
}

export async function addStaffRole(
  role: Omit<StaffRole, "id">,
  userId: string
): Promise<StaffRole> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff_roles")
    .insert({
      user_id: userId,
      name: role.name,
      color: role.color,
      permissions: role.permissions,
    })
    .select()
    .single();
  if (error) throw error;
  return roleFromDb(data);
}

export async function updateStaffRole(
  id: string,
  updates: Partial<Omit<StaffRole, "id">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.color !== undefined) payload.color = updates.color;
  if (updates.permissions !== undefined) payload.permissions = updates.permissions;
  const { error } = await supabase.from("staff_roles").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteStaffRole(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("staff_roles").delete().eq("id", id);
  if (error) throw error;
}
