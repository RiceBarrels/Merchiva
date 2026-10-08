// The punch-PIN attempt limiter: pure arithmetic over one counter bucket.
//
// Every reducer that compares a punch PIN (resolveDeviceOperator*,
// verifyManagerPinAttempt, recordPunch, setPunchInCode and set*PunchInCode for
// anyone but an owner) checks one bucket per (caller membership, org) plus one
// org-wide bucket before it compares anything, and records each miss in both.
// PINs are 4 digits and unique per store, and a guess is tested against every
// code in use, so a per-target count would mean nothing: the key is the caller.
// It is the caller's org_member id, not its identity: loginWithPassword moves a
// membership to a fresh identity on demand, which would start an empty bucket.
//
// A miss must be COMMITTED to count, and a reducer that throws rolls back, so
// a limited reducer records the miss and returns normally; only a refusal
// while locked (nothing to save) may throw. ./pin-guard.ts does the writes.
//
// Runtime imports: none, so Bun tests load it directly.

const SECOND = 1_000_000n;

/** Misses are counted in a 24 h window that starts at the first miss. */
export const PIN_WINDOW_MICROS = 24n * 3600n * SECOND;
/** Misses before the first lock; miss f ≥ this locks for 60 s × 2^(f − this). */
export const PIN_FREE_FAILURES = 10;
export const PIN_BASE_LOCK_MICROS = 60n * SECOND;
export const PIN_MAX_LOCK_MICROS = PIN_WINDOW_MICROS;
/** Org-wide: managers are told at this many misses in a window… */
export const PIN_ORG_NOTIFY_FAILURES = 20;
/** …and every PIN entry in the store pauses for an hour from this many. */
export const PIN_ORG_LOCK_FAILURES = 50;
export const PIN_ORG_LOCK_MICROS = 3600n * SECOND;

/** The only PIN shape there is (setPunchInCode). Anything else is refused without counting: it tests no code. */
export const PIN_PATTERN = /^[0-9]{4}$/;

export interface PinBucket {
  failures: number;
  windowStartMicros: bigint;
  lockedUntilMicros: bigint;
  /** windowStartMicros of the window managers were last told about (0 = never). */
  notifiedAt: bigint;
}

export const EMPTY_PIN_BUCKET: PinBucket = { failures: 0, windowStartMicros: 0n, lockedUntilMicros: 0n, notifiedAt: 0n };

/** The bucket key of one caller (its org_member id) in one org; the org-wide bucket is `<orgId>:*`. */
export function pinBucketKey(organizationId: string, callerMemberId: string): string {
  return `${organizationId}:${callerMemberId}`;
}
export function pinOrgBucketKey(organizationId: string): string {
  return `${organizationId}:*`;
}

/** Whether the bucket's window is over (its misses no longer count). */
export function pinWindowExpired(bucket: PinBucket, nowMicros: bigint): boolean {
  return bucket.failures === 0 || nowMicros - bucket.windowStartMicros >= PIN_WINDOW_MICROS;
}

/** How long miss number `failures` locks a caller: 0 below the free allowance, then 1, 2, 4… minutes, at most 24 h. */
export function pinLockMicros(failures: number): bigint {
  if (failures < PIN_FREE_FAILURES) return 0n;
  const steps = failures - PIN_FREE_FAILURES;
  if (steps >= 20) return PIN_MAX_LOCK_MICROS;
  const lock = PIN_BASE_LOCK_MICROS * (1n << BigInt(steps));
  return lock > PIN_MAX_LOCK_MICROS ? PIN_MAX_LOCK_MICROS : lock;
}

/** The caller's bucket after one more miss at `nowMicros`. */
export function afterPinFailure(bucket: PinBucket, nowMicros: bigint): PinBucket {
  const fresh = pinWindowExpired(bucket, nowMicros);
  const failures = (fresh ? 0 : bucket.failures) + 1;
  const windowStartMicros = fresh ? nowMicros : bucket.windowStartMicros;
  const lock = pinLockMicros(failures);
  const lockedUntilMicros = lock > 0n ? nowMicros + lock : bucket.lockedUntilMicros;
  return { failures, windowStartMicros, lockedUntilMicros, notifiedAt: bucket.notifiedAt };
}

/** The org-wide bucket after one more miss by anyone: an hour's pause from PIN_ORG_LOCK_FAILURES on. */
export function afterOrgPinFailure(bucket: PinBucket, nowMicros: bigint): PinBucket {
  const fresh = pinWindowExpired(bucket, nowMicros);
  const failures = (fresh ? 0 : bucket.failures) + 1;
  const windowStartMicros = fresh ? nowMicros : bucket.windowStartMicros;
  const lockedUntilMicros = failures >= PIN_ORG_LOCK_FAILURES ? nowMicros + PIN_ORG_LOCK_MICROS : bucket.lockedUntilMicros;
  return { failures, windowStartMicros, lockedUntilMicros, notifiedAt: bucket.notifiedAt };
}

/** Whether managers should hear about this bucket now (once per window), and the bucket that remembers it. */
export function pinNotifyDue(bucket: PinBucket, threshold: number): boolean {
  return bucket.failures >= threshold && bucket.notifiedAt !== bucket.windowStartMicros;
}

/** The later of the two buckets' locks, or 0n when neither is locked at `nowMicros`. */
export function pinLockedUntil(caller: PinBucket, org: PinBucket, nowMicros: bigint): bigint {
  const until = caller.lockedUntilMicros > org.lockedUntilMicros ? caller.lockedUntilMicros : org.lockedUntilMicros;
  return until > nowMicros ? until : 0n;
}

/** A bucket row nobody needs any more: its window is over and it holds no lock. */
export function pinBucketStale(bucket: PinBucket, nowMicros: bigint): boolean {
  return pinWindowExpired(bucket, nowMicros) && bucket.lockedUntilMicros <= nowMicros;
}
