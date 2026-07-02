import { uuid } from "@/lib/utils";
// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { Shift, ShiftType, StaffRole, OrgMember, RoleTask } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJsonField<T>(value: string | T, fallback: T): T {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value ?? fallback;
}

function rowKey(value: unknown): string {
  if (value && typeof (value as { toHexString?: () => string }).toHexString === "function") {
    return (value as { toHexString: () => string }).toHexString();
  }
  return String(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function avatarMapFromConnection(c: any): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const user of c.db.user.iter()) {
    const avatarUrl = user.avatarUrl ?? null;
    map.set(user.identity.toString(), avatarUrl);
    if (typeof user.identity?.toHexString === "function") {
      map.set(user.identity.toHexString(), avatarUrl);
    }
  }
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shiftFromRow(row: any): Shift {
  // staffRoles is stored as JSON string in SpacetimeDB
  const staffRoles: string[] = typeof row.staffRoles === "string"
    ? (() => { try { return JSON.parse(row.staffRoles); } catch { return []; } })()
    : Array.isArray(row.staffRoles) ? row.staffRoles : [];
  return {
    id: row.id,
    memberId: row.memberId ?? null,
    staffName: row.staffName,
    staffRole: staffRoles[0] ?? (row.staffRole ?? null),
    staffRoles,
    date: row.date,
    shiftType: row.shiftType,
    startTime: row.startTime,
    endTime: row.endTime,
    predictedDemand: row.predictedDemand ?? "medium",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function roleFromRow(row: any): StaffRole {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? "#44403c",
    icon: row.icon ?? "user",
    description: row.description ?? "",
    permissions: parseJsonField(row.permissions, {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function roleTaskFromRow(row: any): RoleTask {
  return {
    id: row.id,
    roleId: row.roleId,
    organizationId: row.organizationId ?? null,
    title: row.title,
    description: row.description ?? "",
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    sortOrder: row.sortOrder ?? 0,
    requiresEvidence: row.requiresEvidence ?? false,
    notifyChats: parseJsonField(row.notifyChats, []),
  };
}

// ─── Team Members (from org_members) ──────────────────────────────────────────

export async function getTeamForScheduling(
  organizationId: string
): Promise<OrgMember[]> {
  const c = getConnection();
  if (!c) return [];
  const avatars = avatarMapFromConnection(c);
  const rows = (c as any).db.orgMember.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId && r.status === "active")
    .map((row: any) => ({
      id: row.id,
      organizationId: row.organizationId,
      userId: rowKey(row.userId),
      role: row.role,
      displayName: row.displayName ?? "",
      email: row.email ?? "",
      avatarUrl: avatars.get(rowKey(row.userId)) ?? null,
      permissions: parseJsonField(row.permissions, {}),
      status: row.status,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ─── Shifts ────────────────────────────────────────────────────────────────────

export async function getShifts(weeksAhead = 2): Promise<Shift[]> {
  const c = getConnection();
  if (!c) return [];
  const today = new Date().toISOString().split("T")[0];
  const future = new Date();
  future.setDate(future.getDate() + weeksAhead * 7);
  const futureStr = future.toISOString().split("T")[0];
  const orgId = getActiveOrgId();
  const rows = (c as any).db.shift.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === orgId && r.date >= today && r.date <= futureStr)
    .map(shiftFromRow)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export async function addShift(
  shift: Omit<Shift, "id">,
  userId: string,
  organizationId?: string
): Promise<Shift> {
  console.warn("[staffing] addShift: writes go through SpacetimeDB actions.ts");
  // Return a stub so callers don't crash
  return {
    id: uuid(),
    ...shift,
  };
}

export async function updateShift(
  id: string,
  updates: {
    memberId?: string;
    staffName?: string;
    staffRole?: string | null;
    staffRoles?: string[];
    date?: string;
    shiftType?: ShiftType;
    startTime?: string;
    endTime?: string;
  }
): Promise<Shift> {
  console.warn("[staffing] updateShift: writes go through SpacetimeDB actions.ts");
  return { id, staffName: "", staffRole: null, staffRoles: [], date: "", shiftType: "morning" as ShiftType, startTime: "", endTime: "", predictedDemand: "medium", memberId: null, ...updates } as Shift;
}

export async function deleteShift(id: string): Promise<void> {
  console.warn("[staffing] deleteShift: writes go through SpacetimeDB actions.ts");
}

// ─── Staff Roles ──────────────────────────────────────────────────────────────

export async function getStaffRoles(): Promise<StaffRole[]> {
  const c = getConnection();
  if (!c) return [];
  const orgId = getActiveOrgId();
  const rows = (c as any).db.staffRole.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === orgId)
    .map(roleFromRow)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addStaffRole(
  role: Omit<StaffRole, "id">,
  userId: string,
  organizationId?: string | null
): Promise<StaffRole> {
  console.warn("[staffing] addStaffRole: writes go through SpacetimeDB actions.ts");
  return { id: uuid(), ...role };
}

export async function updateStaffRole(
  id: string,
  updates: Partial<Omit<StaffRole, "id">>
): Promise<void> {
  console.warn("[staffing] updateStaffRole: writes go through SpacetimeDB actions.ts");
}

export async function deleteStaffRole(id: string): Promise<void> {
  console.warn("[staffing] deleteStaffRole: writes go through SpacetimeDB actions.ts");
}

// ─── Role Tasks ───────────────────────────────────────────────────────────────

export async function getRoleTasks(roleId: string): Promise<RoleTask[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.roleTask.iter();
  return Array.from(rows)
    .filter((r: any) => r.roleId === roleId)
    .map(roleTaskFromRow)
    .sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
}

export async function addRoleTask(
  task: Omit<RoleTask, "id">,
): Promise<RoleTask> {
  console.warn("[staffing] addRoleTask: writes go through SpacetimeDB actions.ts");
  return { id: uuid(), ...task };
}

export async function updateRoleTask(
  id: string,
  updates: Partial<Pick<RoleTask, "title" | "description" | "startTime" | "endTime" | "sortOrder" | "requiresEvidence" | "notifyChats">>
): Promise<void> {
  console.warn("[staffing] updateRoleTask: writes go through SpacetimeDB actions.ts");
}

export async function deleteRoleTask(id: string): Promise<void> {
  console.warn("[staffing] deleteRoleTask: writes go through SpacetimeDB actions.ts");
}
