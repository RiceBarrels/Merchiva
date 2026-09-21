"use client";

// Resolving a 4-digit PIN to the person standing at the store tablet.
//
// The tablet cannot do this itself. `member_punch_code` is RLS'd to
// `userId = :sender`, so a device only ever sees the code of the account it is
// signed in with, never a colleague's — deliberately, because the same 4 digits
// also take the device out of kiosk mode. The match happens in the database.
//
// Reducers cannot return a value, so it is a two-step handshake:
//
//   1. `resolveDeviceOperator(pin)` — the module matches the PIN and writes the
//      answer to `device_operator_session`, whose RLS rule is
//      `identity = :sender`, so only this device sees its own result.
//   2. The row streams back over the subscription and settles the promise.
//      Awaiting the reducer is not enough: it resolves when the write commits,
//      before the row has reached the client cache.
//
// A stale row from an earlier unlock would otherwise settle step 2 instantly
// with the wrong person, so the wait is keyed on `resolvedAt` changing rather
// than on a row merely existing.

import { useCallback, useEffect, useRef } from "react";
import { resolveDeviceOperator } from "@/lib/spacetimedb/actions";
import { useDeviceOperatorSession } from "@/lib/spacetimedb/hooks";

export interface ResolvedOperator {
  memberId: string;
  memberName: string;
  role: string;
}

interface SessionRow {
  organizationId: string;
  memberId: string;
  memberName: string;
  role: string;
  resolvedAt?: { microsSinceUnixEpoch?: bigint } | null;
}

/** Give up on a PIN the database never answers for, rather than hanging. */
const RESOLVE_TIMEOUT_MS = 6000;

/** Comparable form of a row's `resolvedAt`; "" when there is no row. */
function stamp(row: SessionRow | undefined): string {
  const at = row?.resolvedAt;
  if (at && typeof at.microsSinceUnixEpoch === "bigint") return at.microsSinceUnixEpoch.toString();
  return at ? String(at) : "";
}

/**
 * Returns `resolve(pin)`, which answers with the operator that PIN belongs to,
 * or null when the database rejects it (wrong PIN, inactive member, timeout).
 */
export function usePinOperator(organizationId: string | null) {
  const [rows] = useDeviceOperatorSession();
  const pending = useRef<{ before: string; settle: (op: ResolvedOperator | null) => void } | null>(null);

  const session = useCallback(
    () => (rows as unknown as SessionRow[]).find((r) => r.organizationId === organizationId),
    [rows, organizationId],
  );

  // Step 2 — a newer row for this org arrived.
  useEffect(() => {
    const waiting = pending.current;
    if (!waiting) return;
    const row = session();
    if (!row || stamp(row) === waiting.before) return;
    pending.current = null;
    waiting.settle({ memberId: row.memberId, memberName: row.memberName, role: row.role });
  }, [session]);

  return useCallback(
    async (pin: string): Promise<ResolvedOperator | null> => {
      if (!organizationId) return null;
      const before = stamp(session());
      const answer = new Promise<ResolvedOperator | null>((settle) => {
        pending.current = { before, settle };
        setTimeout(() => {
          if (pending.current?.settle !== settle) return;
          pending.current = null;
          settle(null);
        }, RESOLVE_TIMEOUT_MS);
      });
      try {
        // Step 1 — throws PIN_NOT_RECOGNIZED for anything the module rejects.
        await resolveDeviceOperator(pin);
      } catch {
        pending.current = null;
        return null;
      }
      return answer;
    },
    [organizationId, session],
  );
}
