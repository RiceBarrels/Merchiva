"use client";

// Resolving a 4-digit PIN to the person standing at the store tablet.
//
// The tablet cannot do this itself. `member_punch_code` is RLS'd to
// `userId = :sender`, so a device only ever sees the code of the account it is
// signed in with, never a colleague's — deliberately, because the same 4 digits
// identify that person everywhere on the tablet. The match happens in the database.
//
// Reducers cannot return a value, and the PIN check is rate limited: a wrong PIN
// is counted, so the reducer must not throw on it (a throw would roll the count
// back). `resolveDeviceOperatorAttempt` therefore answers in
// `pin_attempt_result` under a request id (lib/spacetimedb/actions/pin.ts waits
// for it), and on "ok" it has written `device_operator_session` in the same
// transaction, so the session row is in the cache by the time the answer is.

import { useCallback } from "react";
import { getConnection } from "@/lib/spacetimedb/client";
import { attemptOperatorPin } from "@/lib/spacetimedb/actions/pin";
import type { PinAnswer } from "@/lib/pin-attempt";

export interface ResolvedOperator {
  memberId: string;
  memberName: string;
  role: string;
}

export interface PinOperatorResult {
  answer: PinAnswer;
  /** Set only when `answer.outcome` is "ok". */
  operator: ResolvedOperator | null;
}

interface SessionRow {
  organizationId: string;
  memberId: string;
  memberName: string;
  role: string;
}

/** This device's device_operator_session row for the org, from the connection cache. */
function sessionFor(organizationId: string): SessionRow | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SpacetimeDB row reads
  const rows = (getConnection()?.db as any)?.deviceOperatorSession?.iter?.() as Iterable<SessionRow> | undefined;
  if (!rows) return null;
  for (const row of rows) if (row.organizationId === organizationId) return row;
  return null;
}

/**
 * Returns `resolve(pin)`: the database's answer (ok / wrong / locked / timeout /
 * error) and, on "ok", the operator that PIN belongs to.
 */
export function usePinOperator(organizationId: string | null) {
  return useCallback(
    async (pin: string): Promise<PinOperatorResult> => {
      if (!organizationId) return { answer: { outcome: "error", message: "no organization" }, operator: null };
      const answer = await attemptOperatorPin(pin);
      if (answer.outcome !== "ok") return { answer, operator: null };
      const row = sessionFor(organizationId);
      if (!row) return { answer: { outcome: "timeout" }, operator: null };
      return { answer, operator: { memberId: row.memberId, memberName: row.memberName, role: row.role } };
    },
    [organizationId],
  );
}
