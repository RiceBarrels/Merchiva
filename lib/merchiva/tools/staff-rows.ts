/**
 * Staffing rows as lib/scheduler.ts takes them — the same mapping
 * lib/spacetimedb/hooks/useStaffing.ts applies on the client (uuid ids via
 * `toString()`, identities as hex, JSON columns parsed with a safe fallback).
 */

import type { OrgMember, ShiftPreset, StaffAvailability, StaffRole, TimeOffRequest } from "@/lib/types";
import { idHex, opt, uuidText, type Row } from "@/lib/merchiva/tools/rows";

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toOrgMember(r: Row): OrgMember {
  return {
    id: uuidText(r?.id),
    organizationId: String(r?.organizationId ?? ""),
    userId: idHex(r?.userId),
    role: String(r?.role ?? "staff") as OrgMember["role"],
    displayName: String(r?.displayName ?? ""),
    email: String(r?.email ?? ""),
    permissions: parseJson(r?.permissions, {} as OrgMember["permissions"]),
    status: String(r?.status ?? "") as OrgMember["status"],
  };
}

export function toAvailability(r: Row): StaffAvailability {
  return {
    id: uuidText(r?.id),
    userId: idHex(r?.userId),
    organizationId: String(r?.organizationId ?? ""),
    type: String(r?.type ?? "permanent") as StaffAvailability["type"],
    startDate: opt(r?.startDate),
    endDate: opt(r?.endDate),
    days: parseJson(r?.days, [false, false, false, false, false, false, false]),
    dayTimes: parseJson(r?.dayTimes, []),
    status: String(r?.status ?? ""),
    fullDay: !!r?.fullDay,
    startTime: opt(r?.startTime),
    endTime: opt(r?.endTime),
    comments: String(r?.comments ?? ""),
  };
}

export function toTimeOff(r: Row): TimeOffRequest {
  return {
    id: uuidText(r?.id),
    userId: idHex(r?.userId),
    organizationId: String(r?.organizationId ?? ""),
    startDate: String(r?.startDate ?? ""),
    endDate: String(r?.endDate ?? ""),
    fullDays: !!r?.fullDays,
    startTime: opt(r?.startTime),
    endTime: opt(r?.endTime),
    comments: String(r?.comments ?? ""),
    status: String(r?.status ?? "") as TimeOffRequest["status"],
    reviewedBy: opt(r?.reviewedBy),
    reviewedAt: null,
  };
}

export function toPreset(r: Row): ShiftPreset {
  return {
    id: uuidText(r?.id),
    organizationId: String(r?.organizationId ?? ""),
    name: String(r?.name ?? ""),
    startTime: String(r?.startTime ?? ""),
    endTime: String(r?.endTime ?? ""),
    color: String(r?.color ?? ""),
    sortOrder: Number(r?.sortOrder ?? 0) || 0,
  };
}

export function toRole(r: Row): StaffRole {
  return {
    id: uuidText(r?.id),
    name: String(r?.name ?? ""),
    color: String(r?.color ?? ""),
    icon: String(r?.icon ?? ""),
    description: String(r?.description ?? ""),
    permissions: parseJson(r?.permissions, {} as StaffRole["permissions"]),
  };
}
