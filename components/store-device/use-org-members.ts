"use client";

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import type { Permissions } from "@/lib/types";

/** Minimal org_member projection used across the store-device panes. */
export interface StoreMember {
  id: string;
  userIdHex: string;
  /** Raw SpacetimeDB Identity — needed when calling reducers that take one. */
  userIdentity: unknown;
  organizationId: string;
  displayName: string;
  role: string;
  status: string;
  punchInCode: string | null;
  /** Parsed org_member.permissions merged onto the role default (same rule
   *  as the manager layout) — used to gate apps by the OPERATOR, not by the
   *  account the tablet happens to be signed in with. */
  permissions: Permissions;
}

interface RawMemberRow {
  id: { toString(): string };
  userId: { toString(): string; toHexString?: () => string };
  organizationId: string;
  displayName?: string;
  role?: string;
  status: string;
  punchInCode?: string | null;
  permissions?: string;
}

function parsePermissions(role: string, raw: string | undefined): Permissions {
  const fallback = role === "owner" ? ownerPermissions() : defaultPermissions();
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<Permissions>) } as Permissions;
  } catch {
    return fallback;
  }
}

export function useOrgMembers(organizationId: string | null): { members: StoreMember[]; ready: boolean } {
  const [rows, ready] = useTable(tables.orgMember);
  const members = useMemo<StoreMember[]>(() => {
    if (!organizationId) return [];
    return (rows as unknown as RawMemberRow[])
      .filter((r) => r.organizationId === organizationId && r.status === "active")
      .map((r) => ({
        id: r.id.toString(),
        userIdHex: typeof r.userId.toHexString === "function" ? r.userId.toHexString() : r.userId.toString(),
        userIdentity: r.userId,
        organizationId: r.organizationId,
        displayName: r.displayName?.trim() || "",
        role: r.role ?? "staff",
        status: r.status,
        punchInCode: typeof r.punchInCode === "string" && r.punchInCode.length > 0 ? r.punchInCode : null,
        permissions: parsePermissions(r.role ?? "staff", r.permissions),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [rows, organizationId]);
  return { members, ready };
}

export function isManagerRole(role: string): boolean {
  return role === "owner" || role === "manager";
}

/** Member whose punch-in code equals `pin`, or null. */
export function findMemberByPin(members: StoreMember[], pin: string): StoreMember | null {
  return members.find((m) => m.punchInCode === pin) ?? null;
}

/** Owner/manager whose punch-in code equals `pin`, or null. */
export function findManagerByPin(members: StoreMember[], pin: string): StoreMember | null {
  return members.find((m) => isManagerRole(m.role) && m.punchInCode === pin) ?? null;
}
