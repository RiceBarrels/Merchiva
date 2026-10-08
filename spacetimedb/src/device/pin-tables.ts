// Tables of the punch-PIN attempt limiter (./pin-limit.ts, ./pin-guard.ts).
//
// Definitions only: registered in schema({...}) in ../index.ts, which also
// lists pin_attempt_result in RLS_SELF_SCOPED (the other two are private). Every filtered column is a
// plain, non-option type (see "DIALECT LIMITS" in ../index.ts).

import { t, table } from 'spacetimedb/server';

/**
 * Misses and locks of one caller in one org (`<orgId>:<callerMemberId>`), plus one
 * org-wide row (`<orgId>:*`). Private: no client reads it, so it needs no RLS
 * rule. Rows whose window is over and that hold no lock are pruned on write.
 */
export const pinAttemptCounterTable = table(
  {
    name: 'pin_attempt_counter',
    public: false,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    key: t.string().primaryKey(),
    organizationId: t.string(),
    failures: t.u32(),
    windowStartMicros: t.i64(),
    lockedUntilMicros: t.i64(),
    /** windowStartMicros of the window managers were last told about (0 = never). */
    notifiedAt: t.i64(),
    updatedAt: t.timestamp(),
  }
);

/**
 * The answer to the caller's latest PIN attempt. Reducers cannot return a
 * value, and a limited reducer may not throw on a wrong PIN (that would roll
 * back the miss it just counted), so the outcome comes back as this row.
 * RLS: `identity = :sender`. It never says whose PIN a wrong guess was near.
 *
 * kind:    'operator' | 'manager_pin' | 'set_code'
 * outcome: 'ok' | 'wrong' | 'locked' | 'in_use'
 */
export const pinAttemptResultTable = table(
  {
    name: 'pin_attempt_result',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    identity: t.identity().primaryKey(),
    organizationId: t.string(),
    requestId: t.string(),
    kind: t.string(),
    outcome: t.string(),
    /** When `locked`: until when, in microseconds since the epoch; 0 otherwise. */
    lockedUntilMicros: t.i64(),
    at: t.timestamp(),
  }
);

/**
 * Who one store-tablet log-in made the operator, so recordOperatorPunch punches
 * that person and nobody else. device_operator_session has one row per
 * identity, and every tablet signed in with the store account shares that
 * identity: one tablet's log-in, log-out or wrong PIN would change whom another
 * tablet punches. A grant is per log-in instead, keyed `<identityHex>:<grantId>`,
 * where grantId is the request id of the PIN attempt (resolveDeviceOperatorAttempt)
 * or the QR log-in request (consumeDeviceLogin) only that tablet holds.
 * Private: only reducers read it, so it needs no RLS rule. Grants older than
 * DRIVE_OPERATOR_SESSION_TTL_MICROS are refused and pruned on the next write.
 */
export const deviceOperatorGrantTable = table(
  {
    name: 'device_operator_grant',
    public: false,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    key: t.string().primaryKey(),
    organizationId: t.string(),
    memberId: t.string(),
    resolvedAt: t.timestamp(),
  }
);
