import { uuid } from "@/lib/utils";
// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { StaffAvailability, DayTime, TimeOffRequest, ShiftTrade } from "@/lib/types";

const DEFAULT_DAY_TIME: DayTime = { enabled: false, fullDay: true, startTime: "09:00", endTime: "17:00" };
export function defaultDayTimes(): DayTime[] {
  // Sun(0)–Sat(6), Mon–Fri enabled by default
  return [false, true, true, true, true, true, false].map((on) => ({ ...DEFAULT_DAY_TIME, enabled: on }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJsonField<T>(value: string | T, fallback: T): T {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value ?? fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function availFromRow(row: any): StaffAvailability {
  const days: boolean[] = parseJsonField(row.days, [false, true, true, true, true, true, false]);
  let dayTimes: DayTime[] = parseJsonField(row.dayTimes, []);
  if (!dayTimes || dayTimes.length !== 7) {
    dayTimes = days.map((on) => ({
      enabled: on,
      fullDay: row.fullDay ?? true,
      startTime: row.startTime ?? "09:00",
      endTime: row.endTime ?? "17:00",
    }));
  }
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    type: row.type ?? "permanent",
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    days,
    dayTimes,
    status: row.status ?? "available",
    fullDay: row.fullDay ?? true,
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    comments: row.comments ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function timeOffFromRow(row: any): TimeOffRequest {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    startDate: row.startDate,
    endDate: row.endDate,
    fullDays: row.fullDays ?? true,
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    comments: row.comments ?? "",
    status: row.status ?? "pending",
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tradeFromRow(row: any): ShiftTrade {
  return {
    id: row.id,
    organizationId: row.organizationId,
    shiftId: row.shiftId,
    requesterId: row.requesterId,
    targetId: row.targetId,
    targetShiftId: row.targetShiftId ?? null,
    type: row.type,
    status: row.status ?? "pending",
    managerApproved: row.managerApproved ?? false,
    managerId: row.managerId ?? null,
    comments: row.comments ?? "",
    broadcastToAll: row.broadcastToAll ?? false,
    acceptedById: row.acceptedById ?? null,
    createdAt: row.createdAt ?? new Date().toISOString(),
  };
}

// ─── Staff Availability ───────────────────────────────────────────────────────

export async function getMyAvailability(
  userId: string,
  organizationId: string
): Promise<StaffAvailability | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.staffAvailability.iter();
  const matches = Array.from(rows)
    .filter((r: any) => String(r.userId) === String(userId) && r.organizationId === organizationId)
    .sort((a: any, b: any) => {
      const ta = a.createdAt?.getTime?.() ?? 0;
      const tb = b.createdAt?.getTime?.() ?? 0;
      return tb - ta; // descending
    });
  return matches.length > 0 ? availFromRow(matches[0]) : null;
}

export async function upsertAvailability(
  avail: Omit<StaffAvailability, "id"> & { id?: string }
): Promise<StaffAvailability> {
  console.warn("[availability] upsertAvailability: writes go through SpacetimeDB actions.ts");
  return { id: avail.id ?? uuid(), ...avail } as StaffAvailability;
}

export async function deleteAvailability(id: string): Promise<void> {
  console.warn("[availability] deleteAvailability: writes go through SpacetimeDB actions.ts");
}

// ─── Time Off Requests ────────────────────────────────────────────────────────

export async function getTimeOffRequests(
  userId: string,
  organizationId: string
): Promise<TimeOffRequest[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.timeOffRequest.iter();
  return Array.from(rows)
    .filter((r: any) => String(r.userId) === String(userId) && r.organizationId === organizationId)
    .map(timeOffFromRow)
    .sort((a, b) => {
      // newest first
      return b.startDate.localeCompare(a.startDate);
    });
}

export async function getOrgTimeOffRequests(
  organizationId: string
): Promise<TimeOffRequest[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.timeOffRequest.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId && r.status === "pending")
    .map(timeOffFromRow)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
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
  console.warn("[availability] createTimeOffRequest: writes go through SpacetimeDB actions.ts");
  return {
    id: uuid(),
    userId: params.userId,
    organizationId: params.organizationId,
    startDate: params.startDate,
    endDate: params.endDate,
    fullDays: params.fullDays,
    startTime: params.fullDays ? null : params.startTime,
    endTime: params.fullDays ? null : params.endTime,
    comments: params.comments,
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
  };
}

export async function updateTimeOffStatus(
  id: string,
  status: "approved" | "denied",
  reviewerId: string
): Promise<void> {
  console.warn("[availability] updateTimeOffStatus: writes go through SpacetimeDB actions.ts");
}

// ─── Shift Trades ─────────────────────────────────────────────────────────────

export async function getShiftTrades(
  memberId: string,
  organizationId: string
): Promise<ShiftTrade[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.shiftTrade.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId && (r.requesterId === memberId || r.targetId === memberId))
    .map(tradeFromRow)
    .sort((a, b) => {
      const ta = (a as any).createdAt?.getTime?.() ?? 0;
      const tb = (b as any).createdAt?.getTime?.() ?? 0;
      return tb - ta;
    });
}

export async function getOrgShiftTrades(
  organizationId: string
): Promise<ShiftTrade[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.shiftTrade.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId && r.status === "pending")
    .map(tradeFromRow);
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
  console.warn("[availability] createShiftTrade: writes go through SpacetimeDB actions.ts");
  return {
    id: uuid(),
    organizationId: params.organizationId,
    shiftId: params.shiftId,
    requesterId: params.requesterId,
    targetId: params.targetId,
    targetShiftId: params.targetShiftId,
    type: params.type,
    status: "pending",
    managerApproved: false,
    managerId: null,
    comments: params.comments,
    broadcastToAll: false,
    acceptedById: null,
    createdAt: new Date().toISOString(),
  };
}

export async function updateTradeStatus(
  id: string,
  status: "accepted" | "denied" | "cancelled",
  managerId?: string
): Promise<void> {
  console.warn("[availability] updateTradeStatus: writes go through SpacetimeDB actions.ts");
}

export async function getCoworkersWithShifts(
  organizationId: string,
  excludeMemberId: string
): Promise<{ memberId: string; name: string; shifts: { id: string; date: string; startTime: string; endTime: string }[] }[]> {
  const c = getConnection();
  if (!c) return [];

  const today = new Date().toISOString().split("T")[0];
  const future = new Date();
  future.setDate(future.getDate() + 28);
  const futureStr = future.toISOString().split("T")[0];

  // Get active org members
  const members = Array.from((c as any).db.orgMember.iter())
    .filter((r: any) => r.organizationId === organizationId && r.status === "active");

  // Get shifts in range
  const shiftData = Array.from((c as any).db.shift.iter())
    .filter((r: any) => r.organizationId === organizationId && r.date >= today && r.date <= futureStr)
    .sort((a: any, b: any) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  return members
    .filter((m: any) => m.id !== excludeMemberId)
    .map((m: any) => ({
      memberId: m.id,
      name: m.displayName ?? "",
      shifts: shiftData
        .filter((s: any) => s.memberId === m.id)
        .map((s: any) => ({
          id: s.id,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
    }))
    .filter((m) => m.shifts.length > 0);
}
