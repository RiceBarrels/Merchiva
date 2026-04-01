import { createClient } from "@/lib/supabase/client";
import type { StaffMember, Shift } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function staffFromDb(row: any): StaffMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    hourlyRate: Number(row.hourly_rate),
    availability: row.availability ?? [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shiftFromDb(row: any): Shift {
  return {
    id: row.id,
    staffId: row.staff_id ?? "",
    staffName: row.staff_name,
    date: row.date,
    shiftType: row.shift_type,
    startTime: row.start_time,
    endTime: row.end_time,
    predictedDemand: row.predicted_demand ?? "medium",
  };
}

// ─── Staff Members ─────────────────────────────────────────────────────────────

export async function getStaffMembers(): Promise<StaffMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff_members")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []).map(staffFromDb);
}

export async function addStaffMember(
  member: Omit<StaffMember, "id">,
  userId: string
): Promise<StaffMember> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff_members")
    .insert({
      user_id: userId,
      name: member.name,
      role: member.role,
      hourly_rate: member.hourlyRate,
      availability: member.availability,
    })
    .select()
    .single();
  if (error) throw error;
  return staffFromDb(data);
}

export async function updateStaffMember(
  id: string,
  updates: Partial<StaffMember>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.hourlyRate !== undefined) payload.hourly_rate = updates.hourlyRate;
  if (updates.availability !== undefined) payload.availability = updates.availability;
  const { error } = await supabase.from("staff_members").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteStaffMember(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("staff_members").delete().eq("id", id);
  if (error) throw error;
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
      staff_id: shift.staffId || null,
      staff_name: shift.staffName,
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
