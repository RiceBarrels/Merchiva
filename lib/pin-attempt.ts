// The client half of the punch-PIN attempt limiter (spacetimedb/src/device/pin-guard.ts).
//
// A limited PIN reducer cannot throw on a wrong PIN — the throw would roll back
// the miss it counts — so it answers in `pin_attempt_result`, one row per
// identity (RLS: `identity = :sender`), tagged with the request id the client
// sent. This file waits for that row under one deadline (runPinAttempt), turns
// it into an answer and words it; lib/spacetimedb/actions/pin.ts sends the
// calls. No React, no connection: Bun tests load it directly.

export type PinAttemptOutcome = "ok" | "wrong" | "locked" | "in_use";

export type PinAnswer =
  | { outcome: "ok" }
  /** `lockedUntilMs` set when this miss paused PIN entry. */
  | { outcome: "wrong"; lockedUntilMs: number | null }
  | { outcome: "locked"; lockedUntilMs: number }
  | { outcome: "in_use" }
  /** The answer never arrived within the deadline (offline, a dead socket, or a module without the reducer). */
  | { outcome: "timeout" }
  | { outcome: "error"; message: string };

export interface PinAttemptRowLike {
  requestId: string;
  outcome: string;
  lockedUntilMicros: bigint;
}

/** The answer a result row gives for `requestId`, or null when the row is someone else's attempt (or none). */
export function pinAnswerFromRow(row: PinAttemptRowLike | null | undefined, requestId: string): PinAnswer | null {
  if (!row || row.requestId !== requestId) return null;
  const until = row.lockedUntilMicros > 0n ? Number(row.lockedUntilMicros / 1000n) : null;
  switch (row.outcome) {
    case "ok": return { outcome: "ok" };
    case "in_use": return { outcome: "in_use" };
    case "locked": return { outcome: "locked", lockedUntilMs: until ?? Date.now() };
    case "wrong": return { outcome: "wrong", lockedUntilMs: until };
    default: return { outcome: "error", message: row.outcome };
  }
}

/** Whole minutes until `lockedUntilMs`, at least 1. */
export function pinMinutesLeft(lockedUntilMs: number, nowMs: number = Date.now()): number {
  return Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 60_000));
}

/** Until when PIN entry is paused after this answer, or null when it is not. */
export function pinLockedUntilMs(answer: PinAnswer): number | null {
  if (answer.outcome === "locked") return answer.lockedUntilMs;
  if (answer.outcome === "wrong") return answer.lockedUntilMs;
  return null;
}

/**
 * The i18n key + vars that explain a refused attempt: PIN entry paused (with the
 * minutes left), or no answer. Null for "ok", "in_use" and a plain wrong PIN,
 * which each caller words (or shakes) itself.
 */
export function pinNotice(answer: PinAnswer, nowMs: number = Date.now()): { key: string; vars: { minutes: number } } | null {
  const until = pinLockedUntilMs(answer);
  // A "locked" answer is shown even when the device clock runs ahead of the server's.
  if (until !== null && (until > nowMs || answer.outcome === "locked")) return { key: "pinLimit.locked", vars: { minutes: pinMinutesLeft(until, nowMs) } };
  if (answer.outcome === "timeout" || answer.outcome === "error") return { key: "pinLimit.noAnswer", vars: { minutes: 0 } };
  return null;
}

/** Why setting your own punch code did not take (setOwnPunchInCode), or null when it did. */
export function ownCodeNotice(answer: PinAnswer, nowMs: number = Date.now()): { key: string; vars: { minutes: number } } | null {
  if (answer.outcome === "ok") return null;
  if (answer.outcome === "in_use") return { key: "pinLimit.codeInUse", vars: { minutes: 0 } };
  return pinNotice(answer, nowMs) ?? { key: "pinLimit.noAnswer", vars: { minutes: 0 } };
}

/**
 * Poll `read()` until it yields the answer for `requestId`, or `timeoutMs` passes.
 * The SDK usually applies the caller's own row before the reducer promise settles,
 * so the first read normally answers; polling covers the rest.
 */
export async function waitForPinAnswer(
  read: () => PinAttemptRowLike | null | undefined,
  requestId: string,
  opts: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<PinAnswer> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const intervalMs = opts.intervalMs ?? 100;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let waited = 0; ; waited += intervalMs) {
    const answer = pinAnswerFromRow(read(), requestId);
    if (answer) return answer;
    if (waited >= timeoutMs) return { outcome: "timeout" };
    await sleep(intervalMs);
  }
}

/**
 * Send one PIN attempt and wait for its answer, all within `timeoutMs`. The
 * reducer call itself is raced against the deadline: the SDK never rejects a
 * pending call when the socket drops (and queues calls made while it is down),
 * so awaiting it alone could wait forever. The answer row may land before the
 * call settles, so it is read either way.
 */
export async function runPinAttempt(
  send: () => Promise<unknown>,
  read: () => PinAttemptRowLike | null | undefined,
  requestId: string,
  opts: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<PinAnswer> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const intervalMs = opts.intervalMs ?? 100;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let late = false;
  const deadline = sleep(timeoutMs).then(() => { late = true; return "late" as const; });
  let call: Promise<"sent" | { error: unknown }>;
  try {
    call = send().then(() => "sent" as const, (error: unknown) => ({ error }));
  } catch (error) {
    call = Promise.resolve({ error });
  }
  const settled = await Promise.race([call, deadline]);
  if (typeof settled === "object") {
    const { error } = settled;
    return { outcome: "error", message: error instanceof Error ? error.message : String(error) };
  }
  for (;;) {
    const answer = pinAnswerFromRow(read(), requestId);
    if (answer) return answer;
    if (late) return { outcome: "timeout" };
    await Promise.race([sleep(intervalMs), deadline]);
  }
}

/**
 * The i18n key for an error code a punch or PIN reducer throws (NO_OPERATOR_SESSION,
 * PIN_LOCKED), or null for any other message, which callers show as it is.
 */
export function pinErrorKey(message: string): string | null {
  if (message.includes("NO_OPERATOR_SESSION")) return "pinLimit.noOperator";
  if (message.includes("PIN_LOCKED")) return "pinLimit.lockedNow";
  return null;
}
