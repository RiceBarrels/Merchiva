// The punch-PIN limiter's arithmetic (spacetimedb/src/device/pin-limit.ts).

import { describe, expect, test } from "bun:test";
import {
  EMPTY_PIN_BUCKET, PIN_BASE_LOCK_MICROS, PIN_FREE_FAILURES, PIN_MAX_LOCK_MICROS, PIN_ORG_LOCK_FAILURES,
  PIN_ORG_LOCK_MICROS, PIN_WINDOW_MICROS, afterOrgPinFailure, afterPinFailure, pinBucketStale, pinLockMicros,
  pinLockedUntil, pinNotifyDue, type PinBucket,
} from "@/spacetimedb/src/device/pin-limit";

const T0 = 1_760_000_000_000_000n;
const MIN = 60_000_000n;

function misses(n: number, from: PinBucket = EMPTY_PIN_BUCKET, at = T0): PinBucket {
  let b = from;
  for (let i = 0; i < n; i++) b = afterPinFailure(b, at);
  return b;
}

describe("pinLockMicros", () => {
  test("the first misses are free, then 1, 2, 4… minutes, capped at 24 h", () => {
    expect(PIN_FREE_FAILURES).toBe(10);
    for (let f = 1; f < PIN_FREE_FAILURES; f++) expect(pinLockMicros(f)).toBe(0n);
    expect(pinLockMicros(PIN_FREE_FAILURES)).toBe(PIN_BASE_LOCK_MICROS);
    expect(pinLockMicros(PIN_FREE_FAILURES + 1)).toBe(2n * MIN);
    expect(pinLockMicros(PIN_FREE_FAILURES + 5)).toBe(32n * MIN);
    expect(pinLockMicros(PIN_FREE_FAILURES + 11)).toBe(PIN_MAX_LOCK_MICROS);
    expect(pinLockMicros(1000)).toBe(PIN_MAX_LOCK_MICROS);
  });

  test("only about ten locked guesses fit in a day after the free ones, even when every lock is waited out", () => {
    let b = EMPTY_PIN_BUCKET;
    let now = T0;
    let guesses = 0;
    while (now < T0 + PIN_WINDOW_MICROS) {
      b = afterPinFailure(b, now);
      guesses++;
      now = b.lockedUntilMicros > now ? b.lockedUntilMicros : now + 1n;
    }
    expect(guesses).toBeGreaterThanOrEqual(PIN_FREE_FAILURES + 9);
    expect(guesses).toBeLessThanOrEqual(PIN_FREE_FAILURES + 11);
  });
});

describe("afterPinFailure", () => {
  test("locks from the PIN_FREE_FAILURES-th miss, and a new window starts after 24 h", () => {
    expect(misses(PIN_FREE_FAILURES - 1).lockedUntilMicros).toBe(0n);
    const first = misses(PIN_FREE_FAILURES);
    expect(first.failures).toBe(PIN_FREE_FAILURES);
    expect(first.lockedUntilMicros).toBe(T0 + MIN);
    const later = afterPinFailure(first, T0 + PIN_WINDOW_MICROS);
    expect(later).toMatchObject({ failures: 1, windowStartMicros: T0 + PIN_WINDOW_MICROS });
  });

  test("the org bucket pauses everyone for an hour from PIN_ORG_LOCK_FAILURES", () => {
    let org = EMPTY_PIN_BUCKET;
    for (let i = 1; i < PIN_ORG_LOCK_FAILURES; i++) org = afterOrgPinFailure(org, T0);
    expect(org.lockedUntilMicros).toBe(0n);
    org = afterOrgPinFailure(org, T0);
    expect(org.lockedUntilMicros).toBe(T0 + PIN_ORG_LOCK_MICROS);
  });
});

describe("lock state, notifications and pruning", () => {
  test("pinLockedUntil is the later live lock of the caller and the store", () => {
    const caller = { ...EMPTY_PIN_BUCKET, failures: 5, lockedUntilMicros: T0 + MIN };
    const org = { ...EMPTY_PIN_BUCKET, failures: 50, lockedUntilMicros: T0 + 2n * MIN };
    expect(pinLockedUntil(caller, EMPTY_PIN_BUCKET, T0)).toBe(T0 + MIN);
    expect(pinLockedUntil(caller, org, T0)).toBe(T0 + 2n * MIN);
    expect(pinLockedUntil(caller, org, T0 + 3n * MIN)).toBe(0n);
  });

  test("managers hear once per window", () => {
    const b = { ...EMPTY_PIN_BUCKET, failures: 20, windowStartMicros: T0 };
    expect(pinNotifyDue(b, 20)).toBe(true);
    expect(pinNotifyDue({ ...b, notifiedAt: T0 }, 20)).toBe(false);
    expect(pinNotifyDue({ ...b, failures: 19 }, 20)).toBe(false);
  });

  test("a row is stale only when its window is over and it holds no lock", () => {
    const five = misses(5);
    expect(pinBucketStale(five, T0)).toBe(false);
    expect(pinBucketStale(five, T0 + PIN_WINDOW_MICROS)).toBe(true);
    expect(pinBucketStale({ ...five, lockedUntilMicros: T0 + 2n * PIN_WINDOW_MICROS }, T0 + PIN_WINDOW_MICROS)).toBe(false);
  });
});
