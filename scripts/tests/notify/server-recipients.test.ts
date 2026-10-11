// Where a notification email goes (lib/notifications/server/recipients.ts):
// WorkOS's verified address, or a drop / retry by what WorkOS answered, cached
// for 10 minutes except for answers that may change on the next try.

import { describe, expect, test } from "bun:test";
import {
  NOTIFY_RECIPIENT_TTL_MS, createNotifyRecipientLookup, notifyAddressOk, notifyRecipientFailure, notifyRecipientOf,
} from "@/lib/notifications/server/recipients";
import type { NotifyWorkosUser } from "@/lib/notifications/server/types";

class RequestError extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

describe("answers", () => {
  test("a verified, well-formed address is used; anything else is dropped", () => {
    expect(notifyRecipientOf({ email: "ana@example.com", emailVerified: true })).toEqual({ kind: "ok", email: "ana@example.com" });
    expect(notifyRecipientOf({ email: " ana@example.com ", emailVerified: true })).toEqual({ kind: "ok", email: "ana@example.com" });
    expect(notifyRecipientOf({ email: "", emailVerified: true })).toEqual({ kind: "drop", reason: "no_email" });
    expect(notifyRecipientOf({ email: null })).toEqual({ kind: "drop", reason: "no_email" });
    expect(notifyRecipientOf({ email: "ana@example.com", emailVerified: false })).toEqual({ kind: "drop", reason: "unverified" });
    expect(notifyRecipientOf({ email: "ana@example.com\r\nBcc: x@y.z", emailVerified: true })).toEqual({ kind: "drop", reason: "invalid" });
    expect(notifyRecipientOf({ email: "Ana <ana@example.com>", emailVerified: true })).toEqual({ kind: "drop", reason: "invalid" });
  });

  test("WorkOS failures: unknown or malformed user → drop; everything else → retry", () => {
    expect(notifyRecipientFailure(new RequestError(404))).toEqual({ kind: "drop", reason: "not_found" });
    expect(notifyRecipientFailure(new RequestError(400))).toEqual({ kind: "drop", reason: "invalid" });
    expect(notifyRecipientFailure(new RequestError(422))).toEqual({ kind: "drop", reason: "invalid" });
    expect(notifyRecipientFailure(new RequestError(500))).toEqual({ kind: "retry", reason: "status_500" });
    expect(notifyRecipientFailure(new RequestError(429))).toEqual({ kind: "retry", reason: "status_429" });
    expect(notifyRecipientFailure(new RequestError(401))).toEqual({ kind: "retry", reason: "status_401" });
    expect(notifyRecipientFailure(new TypeError("fetch failed"))).toEqual({ kind: "retry", reason: "network" });
  });

  test("address shape", () => {
    expect(notifyAddressOk("a.b+c@shop.example.co")).toBe(true);
    expect(notifyAddressOk("a@b")).toBe(false);
    expect(notifyAddressOk("a b@c.d")).toBe(false);
    expect(notifyAddressOk(`${"a".repeat(250)}@b.cd`)).toBe(false);
  });
});

describe("createNotifyRecipientLookup", () => {
  function setup(answer: (subject: string, n: number) => Promise<NotifyWorkosUser>, timeoutMs = 50) {
    const clock = { now: 1_000_000 };
    const calls: string[] = [];
    const resolve = createNotifyRecipientLookup({
      getUser: (subject) => {
        calls.push(subject);
        return answer(subject, calls.length);
      },
      now: () => clock.now,
      timeoutMs,
    });
    return { clock, calls, resolve };
  }

  test("answers are cached for 10 minutes", async () => {
    const s = setup(async (subject) => ({ email: `${subject}@example.com`, emailVerified: true }));
    expect(await s.resolve("user_1")).toEqual({ kind: "ok", email: "user_1@example.com" });
    s.clock.now += NOTIFY_RECIPIENT_TTL_MS - 1;
    await s.resolve("user_1");
    expect(s.calls).toEqual(["user_1"]);
    s.clock.now += 1;
    await s.resolve("user_1");
    expect(s.calls).toEqual(["user_1", "user_1"]);
  });

  test("a drop is cached too; a retry is not", async () => {
    const s = setup(async (_subject, n) => {
      if (n === 1) throw new RequestError(503);
      if (n === 2) throw new RequestError(404);
      return { email: "late@example.com", emailVerified: true };
    });
    expect((await s.resolve("user_1")).kind).toBe("retry");
    expect(await s.resolve("user_1")).toEqual({ kind: "drop", reason: "not_found" });
    expect(await s.resolve("user_1")).toEqual({ kind: "drop", reason: "not_found" });
    expect(s.calls).toHaveLength(2);
  });

  test("a lookup that hangs is a retry after the timeout", async () => {
    const s = setup(() => new Promise<NotifyWorkosUser>(() => {}), 20);
    expect(await s.resolve("user_1")).toEqual({ kind: "retry", reason: "network" });
  });
});
