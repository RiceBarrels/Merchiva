"use client";

import { useMemo } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";

export interface MemberRow {
  id: { toString(): string };
  organizationId: string;
  userId: { toHexString?: () => string; toString(): string };
  role: string;
  status: string;
  displayName: string;
  punchInCode?: string;
}

export function identityHex(id: { toHexString?: () => string; toString(): string }): string {
  return typeof id.toHexString === "function" ? id.toHexString() : id.toString();
}

/** The signed-in employee on this phone: org, member row, identity hex. */
export function useMe() {
  const stdb = useSpacetimeDB();
  const { organizationId: orgIdOrNull, role, currentOrg } = usePermissions();
  const organizationId = orgIdOrNull ?? "";
  const [memberRows, membersReady] = useTable(tables.orgMember);
  const meUserId = stdb?.identity ? identityHex(stdb.identity) : null;

  const members = memberRows as unknown as MemberRow[];

  const myMember = useMemo(() => {
    if (!meUserId || !organizationId) return null;
    return (
      members.find(
        (m) =>
          identityHex(m.userId) === meUserId &&
          m.organizationId === organizationId &&
          m.status === "active",
      ) ?? null
    );
  }, [members, meUserId, organizationId]);

  const orgMembers = useMemo(
    () => members.filter((m) => m.organizationId === organizationId && m.status === "active"),
    [members, organizationId],
  );

  const myCode =
    typeof myMember?.punchInCode === "string" && myMember.punchInCode.length > 0 ? myMember.punchInCode : null;

  return {
    organizationId,
    orgName: currentOrg?.name ?? "",
    role,
    isManager: role === "owner" || role === "manager",
    meUserId,
    myMember,
    myMemberId: myMember?.id.toString() ?? null,
    myName: myMember?.displayName ?? "",
    myCode,
    orgMembers,
    ready: membersReady && !!organizationId,
  };
}
