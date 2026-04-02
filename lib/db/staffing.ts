import { createClient } from "@/lib/supabase/client";
import type { Shift, ShiftType, StaffRole, OrgMember, RoleTask } from "@/lib/types";

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
    icon: row.icon ?? "user",
    description: row.description ?? "",
    permissions: row.permissions ?? {},
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function roleTaskFromDb(row: any): RoleTask {
  return {
    id: row.id,
    roleId: row.role_id,
    organizationId: row.organization_id ?? null,
    title: row.title,
    description: row.description ?? "",
    startTime: row.start_time,
    endTime: row.end_time,
    sortOrder: row.sort_order ?? 0,
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

export async function updateShift(
  id: string,
  updates: {
    memberId?: string;
    staffName?: string;
    staffRole?: string | null;
    date?: string;
    shiftType?: ShiftType;
    startTime?: string;
    endTime?: string;
  }
): Promise<Shift> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (updates.memberId   !== undefined) patch.member_id   = updates.memberId || null;
  if (updates.staffName  !== undefined) patch.staff_name  = updates.staffName;
  if (updates.staffRole  !== undefined) patch.staff_role  = updates.staffRole || null;
  if (updates.date       !== undefined) patch.date        = updates.date;
  if (updates.shiftType  !== undefined) patch.shift_type  = updates.shiftType;
  if (updates.startTime  !== undefined) patch.start_time  = updates.startTime;
  if (updates.endTime    !== undefined) patch.end_time    = updates.endTime;
  const { data, error } = await supabase
    .from("shifts").update(patch).eq("id", id).select().single();
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
  userId: string,
  organizationId?: string | null
): Promise<StaffRole> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff_roles")
    .insert({
      user_id: userId,
      organization_id: organizationId ?? null,
      name: role.name,
      color: role.color,
      icon: role.icon,
      description: role.description,
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
  if (updates.icon !== undefined) payload.icon = updates.icon;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.permissions !== undefined) payload.permissions = updates.permissions;
  const { error } = await supabase.from("staff_roles").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteStaffRole(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("staff_roles").delete().eq("id", id);
  if (error) throw error;
}

// ─── Role Tasks ───────────────────────────────────────────────────────────────

export async function getRoleTasks(roleId: string): Promise<RoleTask[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("role_tasks")
    .select("*")
    .eq("role_id", roleId)
    .order("start_time");
  if (error) throw error;
  return (data ?? []).map(roleTaskFromDb);
}

export async function addRoleTask(
  task: Omit<RoleTask, "id">,
): Promise<RoleTask> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("role_tasks")
    .insert({
      role_id: task.roleId,
      organization_id: task.organizationId ?? null,
      title: task.title,
      description: task.description,
      start_time: task.startTime,
      end_time: task.endTime,
      sort_order: task.sortOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return roleTaskFromDb(data);
}

export async function updateRoleTask(
  id: string,
  updates: Partial<Pick<RoleTask, "title" | "description" | "startTime" | "endTime" | "sortOrder">>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.startTime !== undefined) payload.start_time = updates.startTime;
  if (updates.endTime !== undefined) payload.end_time = updates.endTime;
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
  const { error } = await supabase.from("role_tasks").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteRoleTask(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("role_tasks").delete().eq("id", id);
  if (error) throw error;
}
