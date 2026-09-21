"use client";

// The signed-in user's own punch-in code.
//
// Codes live in `member_punch_code`, whose RLS rule is `userId = :sender`: a
// client may read its OWN code and nobody else's, because the same 4 digits
// also unlock the shared store tablet. `org_member.punchInCode` is a drained
// legacy column — `setPunchInCode` clears it on every write, and
// `migrateSecurityV1` emptied the history — so nothing may read it any more.
//
// Matching somebody ELSE's PIN is never done in the browser: `/store` resolves
// an operator with the `resolveDeviceOperator` reducer and gates manager
// actions with `verifyManagerPin`.

import { useMemo } from "react";
import { usePermissions } from "@/lib/context/permissions";
import { useMyPunchCode as useMyPunchCodeRows, useSpacetimeDB } from "@/lib/spacetimedb/hooks";

interface PunchCodeRow {
  memberId: string;
  organizationId: string;
  userId: { toString(): string };
  code: string;
}

export interface PunchCodeState {
  /** The signed-in user's 4-digit code for the active org, or null when unset. */
  code: string | null;
  /** True once the subscription has delivered its first snapshot. */
  isReady: boolean;
}

export function usePunchCode(): PunchCodeState {
  const { organizationId } = usePermissions();
  const stdb = useSpacetimeDB();
  const [rows, isReady] = useMyPunchCodeRows();
  const identity = stdb?.identity?.toString() ?? null;

  const code = useMemo(() => {
    if (!identity || !organizationId) return null;
    const mine = (rows as unknown as PunchCodeRow[]).find(
      (r) => r.userId.toString() === identity && r.organizationId === organizationId,
    );
    return typeof mine?.code === "string" && mine.code.length > 0 ? mine.code : null;
  }, [rows, identity, organizationId]);

  return { code, isReady };
}
