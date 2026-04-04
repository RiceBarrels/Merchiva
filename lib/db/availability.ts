import { createClient } from "@/lib/supabase/client";
import type { StaffAvailability, DayTime, TimeOffRequest, ShiftTrade } from "@/lib/types";

const DEFAULT_DAY_TIME: DayTime = { enabled: false, fullDay: true, startTime: "09:00", endTime: "17:00" };
export function defaultDayTimes(): DayTime[] {
  // Sun(0)–Sat(6), Mon–Fri enabled by default
  return [false, true, true, true, true, true, false].map((on) => ({ ...DEFAULT_DAY_TIME, enabled: on }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function availFromDb(row: any): StaffAvailability {
  const days: boolean[] = row.days ?? [false, true, true, true, true, true, false];
  // Migrate: if dayTimes missing, build from legacy fields
  let dayTimes: DayTime[] = row.day_times;
  if (!dayTimes || dayTimes.length !== 7) {
    dayTimes = days.map((on) => ({
      enabled: on,
      fullDay: row.full_day ?? true,
      startTime: row.start_time ?? "09:00",
      endTime: row.end_time ?? "17:00",
    }));
  }
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    type: row.type ?? "permanent",
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    days,
    dayTimes,
    status: row.status ?? "available",
    fullDay: row.full_day ?? true,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    comments: row.comments ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function timeOffFromDb(row: any): TimeOffRequest {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    startDate: row.start_date,
    endDate: row.end_date,
    fullDays: row.full_days ?? true,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    comments: row.comments ?? "",
    status: row.status ?? "pending",
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tradeFromDb(row: any): ShiftTrade {
  return {
    id: row.id,
    organizationId: row.organization_id,
    shiftId: row.shift_id,
    requesterId: row.requester_id,
    targetId: row.target_id,
    targetShiftId: row.target_shift_id ?? null,
    type: row.type,
    status: row.status ?? "pending",
    managerApproved: row.manager_approved ?? false,
    managerId: row.manager_id ?? null,
    comments: row.comments ?? "",
  };
}

// ─── Staff Availability ───────────────────────────────────────────────────────

export async function getMyAvailability(
  userId: string,
  organizationId: string
): Promise<StaffAvailability | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("staff_availability")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? availFromDb(data) : null;
}

export async function upsertAvailability(
  avail: Omit<StaffAvailability, "id"> & { id?: string }
): Promise<StaffAvailability> {
  const supabase = createClient();
  // Derive legacy fields from dayTimes for backward compat
  const days = avail.dayTimes.map((dt) => dt.enabled);
  const allFullDay = avail.dayTimes.every((dt) => dt.fullDay || !dt.enabled);
  const payload = {
    user_id: avail.userId,
    organization_id: avail.organizationId,
    type: avail.type,
    start_date: avail.startDate || null,
    end_date: avail.endDate || null,
    days,
    day_times: avail.dayTimes,
    status: avail.status,
    full_day: allFullDay,
    start_time: null as string | null,
    end_time: null as string | null,
    comments: avail.comments,
  };
  if (avail.id) {
    const { data, error } = await supabase
      .from("staff_availability")
      .update(payload)
      .eq("id", avail.id)
      .select()
      .single();
    if (error) throw error;
    return availFromDb(data);
  }
  const { data, error } = await supabase
    .from("staff_availability")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return availFromDb(data);
}

export async function deleteAvailability(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("staff_availability").delete().eq("id", id);
  if (error) throw error;
}

// ─── Time Off Requests ────────────────────────────────────────────────────────

export async function getTimeOffRequests(
  userId: string,
  organizationId: string
): Promise<TimeOffRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("time_off_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(timeOffFromDb);
}

export async function getOrgTimeOffRequests(
  organizationId: string
): Promise<TimeOffRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("time_off_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(timeOffFromDb);
}

export async function createTimeOffRequest(params: {
  userId: string;
  organizationId: string;
  startDate: string;
  endDate: string;
  fullDays: boolean;
  startTime: string | null;
  endTime: string | null;
  comments: string;
}): Promise<TimeOffRequest> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("time_off_requests")
    .insert({
      user_id: params.userId,
      organization_id: params.organizationId,
      start_date: params.startDate,
      end_date: params.endDate,
      full_days: params.fullDays,
      start_time: params.fullDays ? null : params.startTime,
      end_time: params.fullDays ? null : params.endTime,
      comments: params.comments,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return timeOffFromDb(data);
}

export async function updateTimeOffStatus(
  id: string,
  status: "approved" | "denied",
  reviewerId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("time_off_requests")
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ─── Shift Trades ─────────────────────────────────────────────────────────────

export async function getShiftTrades(
  memberId: string,
  organizationId: string
): Promise<ShiftTrade[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shift_trades")
    .select("*")
    .eq("organization_id", organizationId)
    .or(`requester_id.eq.${memberId},target_id.eq.${memberId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(tradeFromDb);
}

export async function getOrgShiftTrades(
  organizationId: string
): Promise<ShiftTrade[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shift_trades")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(tradeFromDb);
}

export async function createShiftTrade(params: {
  organizationId: string;
  shiftId: string;
  requesterId: string;
  targetId: string;
  targetShiftId: string | null;
  type: "trade" | "cover";
  comments: string;
}): Promise<ShiftTrade> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shift_trades")
    .insert({
      organization_id: params.organizationId,
      shift_id: params.shiftId,
      requester_id: params.requesterId,
      target_id: params.targetId,
      target_shift_id: params.targetShiftId,
      type: params.type,
      status: "pending",
      manager_approved: false,
      comments: params.comments,
    })
    .select()
    .single();
  if (error) throw error;
  return tradeFromDb(data);
}

export async function updateTradeStatus(
  id: string,
  status: "accepted" | "denied" | "cancelled",
  managerId?: string
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = { status };
  if (managerId) {
    payload.manager_approved = status === "accepted";
    payload.manager_id = managerId;
  }
  const { error } = await supabase.from("shift_trades").update(payload).eq("id", id);
  if (error) throw error;
}

export async function getCoworkersWithShifts(
  organizationId: string,
  excludeMemberId: string
): Promise<{ memberId: string; name: string; shifts: { id: string; date: string; startTime: string; endTime: string }[] }[]> {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const future = new Date();
  future.setDate(future.getDate() + 28);
  const futureStr = future.toISOString().split("T")[0];

  const { data: members } = await supabase
    .from("org_members")
    .select("id, display_name, user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  const { data: shiftData } = await supabase
    .from("shifts")
    .select("id, member_id, date, start_time, end_time")
    .gte("date", today)
    .lte("date", futureStr)
    .order("date")
    .order("start_time");

  if (!members || !shiftData) return [];

  return members
    .filter((m) => m.id !== excludeMemberId)
    .map((m) => ({
      memberId: m.id,
      name: m.display_name ?? "",
      shifts: shiftData
        .filter((s) => s.member_id === m.id)
        .map((s) => ({
          id: s.id,
          date: s.date,
          startTime: s.start_time,
          endTime: s.end_time,
        })),
    }))
    .filter((m) => m.shifts.length > 0);
}
