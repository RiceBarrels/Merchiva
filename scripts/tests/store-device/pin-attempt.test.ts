// The client half of the punch-PIN limiter (lib/pin-attempt.ts): turning the
// caller's pin_attempt_result row into an answer, waiting for it without
// spinning forever, and wording a refusal.

import { describe, expect, test } from "bun:test";
import {
  ownCodeNotice, pinAnswerFromRow, pinErrorKey, pinMinutesLeft, pinNotice, runPinAttempt, waitForPinAnswer,
  type PinAttemptRowLike,
} from "@/lib/pin-attempt";

const NOW = 1_760_000_000_000;
const row = (requestId: string, outcome: string, lockedUntilMs = 0): PinAttemptRowLike => ({
  requestId, outcome, lockedUntilMicros: BigInt(lockedUntilMs) * 1000n,
});
const noSleep = () => Promise.resolve();

describe("pinAnswerFromRow", () => {
  test("answers only for its own request id", () => {
    expect(pinAnswerFromRow(row("a", "ok"), "b")).toBeNull();
    expect(pinAnswerFromRow(null, "a")).toBeNull();
    expect(pinAnswerFromRow(row("a", "ok"), "a")).toEqual({ outcome: "ok" });
  });

  test("carries the lock time in milliseconds", () => {
    expect(pinAnswerFromRow(row("a", "wrong"), "a")).toEqual({ outcome: "wrong", lockedUntilMs: null });
    expect(pinAnswerFromRow(row("a", "wrong", NOW + 60_000), "a")).toEqual({ outcome: "wrong", lockedUntilMs: NOW + 60_000 });
    expect(pinAnswerFromRow(row("a", "locked", NOW + 1), "a")).toEqual({ outcome: "locked", lockedUntilMs: NOW + 1 });
    expect(pinAnswerFromRow(row("a", "in_use"), "a")).toEqual({ outcome: "in_use" });
  });
});

describe("waitForPinAnswer", () => {
  test("returns as soon as the row for the request shows up", async () => {
    let reads = 0;
    const answer = await waitForPinAnswer(() => (++reads >= 3 ? row("r", "ok") : row("older", "wrong")), "r", { sleep: noSleep });
    expect(answer).toEqual({ outcome: "ok" });
    expect(reads).toBe(3);
  });

  test("gives up with a timeout instead of waiting forever", async () => {
    let reads = 0;
    const answer = await waitForPinAnswer(() => { reads++; return null; }, "r", { timeoutMs: 500, intervalMs: 100, sleep: noSleep });
    expect(answer).toEqual({ outcome: "timeout" });
    expect(reads).toBe(6);
  });
});

describe("wording", () => {
  test("minutes left round up and never show 0", () => {
    expect(pinMinutesLeft(NOW + 61_000, NOW)).toBe(2);
    expect(pinMinutesLeft(NOW + 1, NOW)).toBe(1);
    expect(pinMinutesLeft(NOW - 5_000, NOW)).toBe(1);
  });

  test("pinNotice: a pause with its minutes, no answer, or nothing for a plain miss", () => {
    expect(pinNotice({ outcome: "ok" }, NOW)).toBeNull();
    expect(pinNotice({ outcome: "wrong", lockedUntilMs: null }, NOW)).toBeNull();
    expect(pinNotice({ outcome: "wrong", lockedUntilMs: NOW + 120_000 }, NOW)).toEqual({ key: "pinLimit.locked", vars: { minutes: 2 } });
    // A "locked" answer is shown even when this device's clock runs ahead.
    expect(pinNotice({ outcome: "locked", lockedUntilMs: NOW - 1 }, NOW)).toEqual({ key: "pinLimit.locked", vars: { minutes: 1 } });
    expect(pinNotice({ outcome: "timeout" }, NOW)?.key).toBe("pinLimit.noAnswer");
    expect(pinNotice({ outcome: "error", message: "x" }, NOW)?.key).toBe("pinLimit.noAnswer");
  });

  test("ownCodeNotice: null only when the code was set", () => {
    expect(ownCodeNotice({ outcome: "ok" }, NOW)).toBeNull();
    expect(ownCodeNotice({ outcome: "in_use" }, NOW)?.key).toBe("pinLimit.codeInUse");
    expect(ownCodeNotice({ outcome: "locked", lockedUntilMs: NOW + 60_000 }, NOW)?.key).toBe("pinLimit.locked");
    expect(ownCodeNotice({ outcome: "wrong", lockedUntilMs: null }, NOW)?.key).toBe("pinLimit.noAnswer");
  });
});

describe("runPinAttempt: one deadline for the call and the answer", () => {
  const never = () => new Promise<never>(() => {});
  const opts = { timeoutMs: 60, intervalMs: 5 };

  test("a call that never settles (dropped socket, queued call) times out instead of hanging", async () => {
    const started = Date.now();
    expect(await runPinAttempt(never, () => null, "r1", opts)).toEqual({ outcome: "timeout" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("an answer row that landed although the call never settled is still read", async () => {
    expect(await runPinAttempt(never, () => row("r1", "ok"), "r1", opts)).toEqual({ outcome: "ok" });
  });

  test("a settled call polls for the row until the same deadline", async () => {
    let reads = 0;
    const read = () => (++reads >= 3 ? row("r1", "wrong") : null);
    expect(await runPinAttempt(() => Promise.resolve(), read, "r1", opts)).toEqual({ outcome: "wrong", lockedUntilMs: null });
    expect(await runPinAttempt(() => Promise.resolve(), () => row("other", "ok"), "r2", opts)).toEqual({ outcome: "timeout" });
  });

  test("a rejected call, or one that throws before sending, is an error with its message", async () => {
    expect(await runPinAttempt(() => Promise.reject(new Error("Not an active member")), () => null, "r", opts))
      .toEqual({ outcome: "error", message: "Not an active member" });
    expect(await runPinAttempt(() => { throw new Error("not connected"); }, () => null, "r", opts))
      .toEqual({ outcome: "error", message: "not connected" });
  });
});

describe("pinErrorKey", () => {
  test("names the reducer error codes and leaves any other message alone", () => {
    expect(pinErrorKey("NO_OPERATOR_SESSION")).toBe("pinLimit.noOperator");
    expect(pinErrorKey("SenderError: PIN_LOCKED")).toBe("pinLimit.lockedNow");
    expect(pinErrorKey("Already punched in")).toBeNull();
  });
});
