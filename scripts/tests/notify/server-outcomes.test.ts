// The pure decisions of a cron run (lib/notifications/server/outcomes.ts):
// finish-call chunking, one email per recipient, the idempotency key, and what
// each Resend answer means.

import { describe, expect, test } from "bun:test";
import {
  NOTIFY_FINISH_LIST_MAX, notifyEmailGroups, notifyEmailVerdict, notifyFinishCalls, notifyIdempotencyKey,
} from "@/lib/notifications/server/outcomes";
import { notifyClaimedRows } from "@/lib/notifications/server/rows";
import { NOW, sqlRow } from "./server-fixture";

const ids = (n: number, prefix = "n") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("notifyFinishCalls", () => {
  test("nothing to report → no call; a small report → one call", () => {
    expect(notifyFinishCalls({})).toEqual([]);
    expect(notifyFinishCalls({ pushed: [], emailed: [] })).toEqual([]);
    expect(notifyFinishCalls({ pushed: ["a"], expired: [["a", "e1"]] })).toEqual([{ pushed: ["a"], expired: [["a", "e1"]] }]);
  });

  test("every list ≤ 500 a call; expired never comes after the push it belongs to", () => {
    const expired = ids(1200).map((id): [string, string] => [id, `https://fcm.googleapis.com/${id}`]);
    const calls = notifyFinishCalls({ pushed: ids(700), expired, emailRetry: ids(10, "r") });
    for (const call of calls) {
      for (const list of Object.values(call)) expect((list as unknown[]).length).toBeLessThanOrEqual(NOTIFY_FINISH_LIST_MAX);
    }
    expect(calls.map((c) => Object.keys(c).sort().join("+"))).toEqual([
      "expired", "expired", "emailRetry+expired+pushed", "pushed",
    ]);
    expect(calls.flatMap((c) => c.expired ?? [])).toHaveLength(1200);
    expect(calls.flatMap((c) => c.pushed ?? [])).toEqual(ids(700));
    expect(calls.flatMap((c) => c.emailRetry ?? [])).toEqual(ids(10, "r"));
  });
});

describe("notifyEmailGroups", () => {
  test("one group per recipient (identity + subject + issuer + locale); push-only rows are not grouped", () => {
    const rows = notifyClaimedRows([
      sqlRow({ id: "a1", target: 1, createdAtMs: NOW - 1000 }),
      sqlRow({ id: "b1", target: 2, createdAtMs: NOW - 9000 }),
      sqlRow({ id: "a2", target: 1, createdAtMs: NOW - 5000 }),
      sqlRow({ id: "p1", target: 3, claimed: "p" }),
      sqlRow({ id: "a3", target: 1, locale: "fr", createdAtMs: NOW }),
    ]);
    const groups = notifyEmailGroups(rows);
    expect(groups.map((g) => g.rows.map((r) => r.notificationId))).toEqual([["b1"], ["a1", "a2"], ["a3"]]);
    expect(groups[1]).toMatchObject({ subject: "user_1", locale: "" });
  });

  test("a recipient with an emergency comes first", () => {
    const rows = notifyClaimedRows([
      sqlRow({ id: "old", target: 1, createdAtMs: NOW - 60_000 }),
      sqlRow({ id: "sos", target: 2, template: "alert.emergency", createdAtMs: NOW }),
    ]);
    expect(notifyEmailGroups(rows).map((g) => g.rows[0].notificationId)).toEqual(["sos", "old"]);
  });
});

describe("notifyIdempotencyKey", () => {
  test("the same rows in any order give the same key; other rows another", () => {
    const key = notifyIdempotencyKey(["b", "a", "c"]);
    expect(key).toMatch(/^notify\/[0-9a-f]{64}$/);
    expect(notifyIdempotencyKey(["c", "a", "b", "a"])).toBe(key);
    expect(notifyIdempotencyKey(["a", "b"])).not.toBe(key);
  });
});

describe("notifyEmailVerdict", () => {
  const e = (name: string, statusCode: number | null) => ({ name, statusCode, message: "x" });
  test("Resend answers", () => {
    expect(notifyEmailVerdict(null)).toBe("sent");
    expect(notifyEmailVerdict(e("invalid_idempotent_request", 409))).toBe("sent");
    expect(notifyEmailVerdict(e("concurrent_idempotent_requests", 409))).toBe("retry");
    expect(notifyEmailVerdict(e("rate_limit_exceeded", 429))).toBe("retryStop");
    expect(notifyEmailVerdict(e("daily_quota_exceeded", 429))).toBe("retryStop");
    expect(notifyEmailVerdict(e("monthly_quota_exceeded", 429))).toBe("retryStop");
    expect(notifyEmailVerdict(e("internal_server_error", 500))).toBe("retryStop");
    expect(notifyEmailVerdict(e("application_error", null))).toBe("retryStop");
    expect(notifyEmailVerdict(e("invalid_api_key", 403))).toBe("retryStop");
    expect(notifyEmailVerdict(e("validation_error", 403))).toBe("retryStop");
    expect(notifyEmailVerdict(e("invalid_from_address", 422))).toBe("retryStop");
    expect(notifyEmailVerdict(e("validation_error", 422))).toBe("dropped");
    expect(notifyEmailVerdict(e("invalid_attachment", 422))).toBe("failed");
    expect(notifyEmailVerdict(e("something_new", 418))).toBe("failed");
  });
});
