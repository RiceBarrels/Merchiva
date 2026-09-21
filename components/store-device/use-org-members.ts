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
        permissions: parsePermissions(r.role ?? "staff", r.permissions),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [rows, organizationId]);
  return { members, ready };
}

export function isManagerRole(role: string): boolean {
  return role === "owner" || role === "manager";
}

// There is deliberately no `findMemberByPin` here any more. Punch-in codes live
// in `member_punch_code`, which RLS scopes to `userId = :sender`, so this
// device cannot read a colleague's code — and `org_member.punchInCode`, which
// these helpers used to read, is drained on every write. Matching a PIN is done
// by the `resolveDeviceOperator` (see use-pin-operator.ts) and
// `verifyManagerPin` reducers, inside the database.
