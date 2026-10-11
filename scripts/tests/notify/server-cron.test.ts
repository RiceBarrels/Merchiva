// GET /api/cron/notifications with injected deps
// (lib/notifications/server/handler.ts): fails closed, gates on config, claims
// then reads the run's rows, pushes first (once, to allowed endpoints, one
// recipient per endpoint), then emails one digest per recipient — issuer
// checked, WorkOS address, ≤ 60 a run, reported right after each send — and
// reports everything left as emailRetry. A provider outage stops email. A full
// batch is followed by another claim (≤ NOTIFY_CLAIMS_PER_RUN), under a new run
// id, for the channels the run can still serve.

import { describe, expect, test } from "bun:test";
import { NOTIFY_EMAIL_FROM } from "@/lib/notifications/server/email";
import {
  NOTIFY_CLAIMS_PER_RUN, NOTIFY_CLAIM_LIMIT, NOTIFY_EMAILS_PER_RUN, createNotifyCronHandler,
} from "@/lib/notifications/server/handler";
import { notifyIdempotencyKey } from "@/lib/notifications/server/outcomes";
import { notifyClaimedQuery, notifyClaimedRows } from "@/lib/notifications/server/rows";
import { notifyRowText, notifyTranslator } from "@/lib/notifications/server/text";
import {
  ISSUER, NOW, RUN_ID, cronRequest, endpointOf, makeDeps, readJson, reported, runIdOf, sqlRow, sub, testConfig,
  type FakeOptions,
} from "./server-fixture";

async function run(opts: FakeOptions, handlerOpts: { budgetMs?: number; pushBudgetMs?: number } = {}) {
  const fake = makeDeps(opts);
  const res = await createNotifyCronHandler(fake.deps, handlerOpts)(cronRequest());
  return { fake, res, body: await readJson(res) };
}

describe("gate", () => {
  test("fails closed: no CRON_SECRET → 503, a wrong or missing bearer → 401, and nothing runs", async () => {
    for (const [config, secret, status, code] of [
      [testConfig({ cronSecret: null }), "cron-secret-0123456789", 503, "not_configured"],
      [testConfig(), "nope", 401, "unauthenticated"],
      [testConfig(), null, 401, "unauthenticated"],
    ] as const) {
      const fake = makeDeps({ config });
      const res = await createNotifyCronHandler(fake.deps)(cronRequest(secret));
      expect(res.status).toBe(status);
      expect((await readJson(res)).code).toBe(code);
      expect(fake.timeline).toEqual([]);
    }
  });

  test("503 without SpacetimeDB service access, or with neither channel; nothing is claimed", async () => {
    for (const opts of [
      { config: testConfig({ stdbConfigured: false }) },
      { config: testConfig({ emailConfigured: false }), pushReady: false },
    ]) {
      const { fake, res, body } = await run(opts);
      expect(res.status).toBe(503);
      expect(body.code).toBe("not_configured");
      expect(fake.timeline).toEqual([]);
    }
  });

  test("claims for the channels this deployment serves, then reads the run's rows", async () => {
    const both = await run({});
    expect(both.fake.claims).toEqual([[RUN_ID, "pe", NOTIFY_CLAIM_LIMIT]]);
    expect(both.fake.sqls).toEqual([notifyClaimedQuery(RUN_ID)]);
    expect(both.fake.timeline).toEqual(["claim", "sql"]);
    expect((await run({ pushReady: false })).fake.claims[0][1]).toBe("e");
    expect((await run({ config: testConfig({ emailConfigured: false }) })).fake.claims[0][1]).toBe("p");
  });

  test("a failed claim or read is a 502", async () => {
    const claim = await run({ onClaim: () => { throw new Error("SpacetimeDB reducer x failed (500): boom"); } });
    expect(claim.res.status).toBe(502);
    expect(claim.fake.sqls).toEqual([]);
    const read = await run({ onSql: () => { throw new Error("SpacetimeDB SQL failed (500): boom"); } });
    expect(read.res.status).toBe(502);
    expect(read.fake.finishes).toEqual([]);
  });
});

describe("push", () => {
  test("each leased push once, in the recipient's language, tag = notification id, safe link only", async () => {
    const rows = [
      sqlRow({ id: "n1", target: 1, claimed: "p", pushTargets: [sub(1), sub(2)], locale: "zh-cn" }),
      sqlRow({ id: "n2", target: 2, claimed: "p", template: "chat.merchiva", link: "https://evil.com", pushTargets: [sub(3)] }),
      sqlRow({ id: "n3", target: 3, claimed: "p", template: "custom", title: "Restock <now>", body: "b", pushTargets: [sub(4)] }),
    ];
    const { fake, body } = await run({ rows });
    expect(fake.pushes.map((p) => p.subs)).toEqual([[sub(1), sub(2)], [sub(3)], [sub(4)]]);
    const [first, merchiva, custom] = fake.pushes.map((p) => p.payload);
    const text = notifyRowText(notifyTranslator("zh-cn"), notifyClaimedRows([rows[0]])[0]);
    expect(first).toEqual({ title: text.title, body: text.body, link: "/manager/channel?c=c1", type: "chat.mention", id: "n1" });
    expect(merchiva.type).toBe("merchiva_reply");
    expect(merchiva.link).toBeNull();
    expect(custom).toMatchObject({ title: "Restock <now>", type: "custom", id: "n3" });
    expect(fake.finishes).toEqual([{ runId: RUN_ID, lists: { pushed: ["n1", "n2", "n3"] } }]);
    expect(body).toMatchObject({ claimed: 3, pushed: 3, pushSent: 4, pushExpired: 0 });
  });

  test("an endpoint carries one recipient's pushes per run; a gone endpoint is reported once", async () => {
    const rows = [
      sqlRow({ id: "a1", target: 1, claimed: "p", pushTargets: [sub(1), sub(9)] }),
      sqlRow({ id: "b1", target: 2, claimed: "p", pushTargets: [sub(1), sub(2)] }),
      sqlRow({ id: "a2", target: 1, claimed: "p", pushTargets: [sub(1), sub(9)] }),
    ];
    const { fake } = await run({
      rows,
      push: (subs) => ({ sent: subs.length - (subs.some((s) => s.endpoint === endpointOf(9)) ? 1 : 0), failed: 0,
        expired: subs.some((s) => s.endpoint === endpointOf(9)) ? [endpointOf(9)] : [] }),
    });
    const sent = fake.pushes.map((p) => p.subs.map((s) => s.endpoint));
    // Target 2 never gets endpoint 1, which target 1's rows hold first.
    expect(sent).toEqual([[endpointOf(1), endpointOf(9)], [endpointOf(2)], [endpointOf(1), endpointOf(9)]]);
    expect(fake.finishes[0].lists.expired).toEqual([["a1", endpointOf(9)]]);
    expect(fake.finishes[0].lists.pushed).toEqual(["a1", "b1", "a2"]);
    expect(fake.logs.some((l) => l.event === "notify.push.shared_endpoint")).toBe(true);
  });

  test("past the push budget the rest are reported pushed (one-shot) without being sent", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => sqlRow({ id: `n${i}`, target: i + 1, claimed: "p", pushTargets: [sub(i + 1)] }));
    const { fake, body } = await run({ rows, tick: { push: 1_000 } }, { pushBudgetMs: 10_000 });
    expect(fake.pushes.length).toBeLessThan(40);
    expect(reported(fake, "pushed")).toHaveLength(40);
    expect(body.stoppedEarly).toBe(true);
  });
});

describe("email", () => {
  test("one digest per recipient, to the WorkOS address, keyed by its rows, reported right after the send", async () => {
    const rows = [
      sqlRow({ id: "a1", target: 1, createdAtMs: NOW - 3000 }),
      sqlRow({ id: "b1", target: 2, createdAtMs: NOW - 2000 }),
      sqlRow({ id: "a2", target: 1, template: "doc.comment", createdAtMs: NOW - 1000 }),
    ];
    const { fake, body } = await run({ rows });
    expect(fake.timeline).toEqual([
      "claim", "sql", "lookup", "lookup", "email", "finish:emailed", "email", "finish:emailed",
    ]);
    expect(fake.lookups).toEqual(["user_1", "user_2"]);
    expect(fake.emails.map((e) => [e.message.to, e.key])).toEqual([
      ["user_1@example.com", notifyIdempotencyKey(["a1", "a2"])],
      ["user_2@example.com", notifyIdempotencyKey(["b1"])],
    ]);
    expect(fake.emails[0].message.from).toBe(NOTIFY_EMAIL_FROM);
    expect(fake.emails[0].message.text.length).toBeGreaterThan(0);
    expect(fake.finishes.map((f) => f.lists)).toEqual([{ emailed: ["a1", "a2"] }, { emailed: ["b1"] }]);
    expect(body).toMatchObject({ claimed: 3, emails: 2, emailed: 3, emailRetry: 0 });
  });

  test("a row whose issuer is not this deployment's WorkOS issuer is dropped, logged once, never looked up", async () => {
    const rows = [
      sqlRow({ id: "x1", target: 1, issuer: "https://evil.example.com" }),
      sqlRow({ id: "x2", target: 2, issuer: "https://other.example.com" }),
      sqlRow({ id: "ok", target: 3, issuer: ISSUER }),
      sqlRow({ id: "ns", target: 4, subject: "" }),
    ];
    const { fake } = await run({ rows });
    expect(fake.lookups).toEqual(["user_3"]);
    expect(reported(fake, "emailDropped").sort()).toEqual(["ns", "x1", "x2"]);
    expect(reported(fake, "emailed")).toEqual(["ok"]);
    const mismatches = fake.logs.filter((l) => l.event === "notify.email.issuer_mismatch");
    expect(mismatches).toEqual([{ level: "error", event: "notify.email.issuer_mismatch", fields: { seen: "https://evil.example.com", expected: ISSUER } }]);
    expect(fake.logs.find((l) => l.event === "notify.email.dropped")?.level).toBe("error");
  });

  test("no expected issuer (no WorkOS client id) means nobody is emailed", async () => {
    const { fake } = await run({ rows: [sqlRow({ id: "a" })], config: testConfig({ expectedIssuer: "" }) });
    expect(fake.emails).toEqual([]);
    expect(reported(fake, "emailDropped")).toEqual(["a"]);
  });

  test("WorkOS: an unknown user is dropped; a failure is retried and stops further lookups", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => sqlRow({ id: `n${i}`, target: i + 1, createdAtMs: NOW - 100_000 + i }));
    const { fake } = await run({
      rows,
      recipients: {
        user_1: { kind: "drop", reason: "not_found" },
        user_2: { kind: "retry", reason: "status_503" },
      },
    });
    expect(fake.lookups).toHaveLength(8);
    expect(reported(fake, "emailDropped")).toEqual(["n0"]);
    expect(reported(fake, "emailed")).toEqual(["n2", "n3", "n4", "n5", "n6", "n7"]);
    expect(reported(fake, "emailRetry")).toEqual(["n1", "n8", "n9", "n10", "n11"]);
  });

  test(`at most ${NOTIFY_EMAILS_PER_RUN} emails a run; the rest wait as emailRetry`, async () => {
    const rows = Array.from({ length: NOTIFY_EMAILS_PER_RUN + 3 }, (_, i) => sqlRow({ id: `n${i}`, target: i + 1, createdAtMs: NOW - 100_000 + i }));
    const { fake, body } = await run({ rows });
    expect(fake.emails).toHaveLength(NOTIFY_EMAILS_PER_RUN);
    expect(fake.lookups).toHaveLength(NOTIFY_EMAILS_PER_RUN);
    expect(reported(fake, "emailRetry")).toEqual(["n60", "n61", "n62"]);
    expect(body.emails).toBe(NOTIFY_EMAILS_PER_RUN);
  });

  test("a provider outage (429 / quota / 5xx / no answer) stops email for the rest of the run", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => sqlRow({ id: `n${i}`, target: i + 1, createdAtMs: NOW - 10_000 + i }));
    const { fake } = await run({
      rows,
      sendResult: (n) => (n === 2 ? { name: "rate_limit_exceeded", statusCode: 429, message: "slow down" } : null),
    });
    expect(fake.emails).toHaveLength(2);
    expect(reported(fake, "emailed")).toEqual(["n0"]);
    expect(reported(fake, "emailRetry")).toEqual(["n1", "n2", "n3"]);
    expect(fake.logs.find((l) => l.event === "notify.email.provider_unavailable")?.level).toBe("error");
  });

  test("validation_error → emailDropped; an unknown error → emailFailed (an error log at the last attempt)", async () => {
    const rows = [
      sqlRow({ id: "v", target: 1, createdAtMs: NOW - 3000 }),
      sqlRow({ id: "u", target: 2, createdAtMs: NOW - 2000, attempts: 3 }),
      sqlRow({ id: "ok", target: 3, createdAtMs: NOW - 1000 }),
    ];
    const { fake, body } = await run({
      rows,
      sendResult: (n) => (n === 1 ? { name: "validation_error", statusCode: 422, message: "bad to" }
        : n === 2 ? { name: "something_new", statusCode: 418, message: "?" } : null),
    });
    expect(reported(fake, "emailDropped")).toEqual(["v"]);
    expect(reported(fake, "emailFailed")).toEqual(["u"]);
    expect(reported(fake, "emailed")).toEqual(["ok"]);
    expect(fake.logs.find((l) => l.event === "notify.email.failed")).toMatchObject({ level: "error", fields: { lastTry: 1 } });
    expect(body).toMatchObject({ emailDropped: 1, emailFailed: 1, emailed: 1 });
  });

  test("past the budget no new email starts; what is left is emailRetry", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => sqlRow({ id: `n${i}`, target: i + 1, createdAtMs: NOW - 10_000 + i }));
    const { fake, body } = await run({ rows, tick: { email: 30_000 } }, { budgetMs: 45_000 });
    expect(fake.emails).toHaveLength(2);
    expect(reported(fake, "emailRetry")).toEqual(["n2", "n3"]);
    expect(body.stoppedEarly).toBe(true);
  });

  test("a sent email whose report fails is retried, then carried to the final report — never as a retry", async () => {
    const rows = [sqlRow({ id: "a", target: 1, createdAtMs: NOW - 2000 }), sqlRow({ id: "b", target: 2, createdAtMs: NOW - 1000 })];
    const { fake } = await run({
      rows,
      onFinish: (n) => { if (n <= 2) throw new Error("SpacetimeDB reducer x failed (503): busy"); },
    });
    expect(fake.finishes.map((f) => f.lists)).toEqual([{ emailed: ["b"] }, { emailed: ["a"] }]);
    expect(reported(fake, "emailRetry")).toEqual([]);
    expect(fake.logs.filter((l) => l.event === "notify.finish_failed")).toHaveLength(1);
  });

  test("a row leased for both channels is pushed, then emailed", async () => {
    const { fake } = await run({ rows: [sqlRow({ id: "both", claimed: "pe", pushTargets: [sub(1)] })] });
    expect(fake.timeline).toEqual(["claim", "sql", "push", "finish:pushed", "lookup", "email", "finish:emailed"]);
  });
});

describe("batches", () => {
  /** `count` rows for claim `n`, each its own recipient and endpoint. */
  const batch = (n: number, count: number, claimed: string) =>
    Array.from({ length: count }, (_, i) => {
      const who = n * 1000 + i;
      return sqlRow({ id: `b${n}-${i}`, target: who, claimed, pushTargets: [sub(who)], createdAtMs: NOW - 100_000 + i });
    });

  test("a full batch is followed by another claim under a new run id, at most NOTIFY_CLAIMS_PER_RUN a run", async () => {
    const { fake, body } = await run({ rows: (n) => batch(n, NOTIFY_CLAIM_LIMIT, "p") });
    expect(fake.claims).toEqual(
      Array.from({ length: NOTIFY_CLAIMS_PER_RUN }, (_, i) => [runIdOf(i + 1), "pe", NOTIFY_CLAIM_LIMIT]),
    );
    expect(fake.sqls).toEqual(Array.from({ length: NOTIFY_CLAIMS_PER_RUN }, (_, i) => notifyClaimedQuery(runIdOf(i + 1))));
    // Each batch is reported under its own run id.
    expect(fake.finishes.map((f) => [f.runId, (f.lists.pushed as string[]).length])).toEqual(
      Array.from({ length: NOTIFY_CLAIMS_PER_RUN }, (_, i) => [runIdOf(i + 1), NOTIFY_CLAIM_LIMIT]),
    );
    expect(body).toMatchObject({
      claimed: NOTIFY_CLAIMS_PER_RUN * NOTIFY_CLAIM_LIMIT, pushed: NOTIFY_CLAIMS_PER_RUN * NOTIFY_CLAIM_LIMIT,
    });
    expect(fake.logs.find((l) => l.event === "notify.done")?.fields.claims).toBe(NOTIFY_CLAIMS_PER_RUN);
  });

  test("a short batch ends the run", async () => {
    const { fake, body } = await run({ rows: (n) => batch(n, n === 1 ? NOTIFY_CLAIM_LIMIT : 5, "p") });
    expect(fake.claims.map((c) => c[0])).toEqual([runIdOf(1), runIdOf(2)]);
    expect(body.claimed).toBe(NOTIFY_CLAIM_LIMIT + 5);
    const short = await run({ rows: (n) => batch(n, NOTIFY_CLAIM_LIMIT - 1, "p") });
    expect(short.fake.claims).toHaveLength(1);
  });

  test("no further claim once the budget is spent", async () => {
    const { fake, body } = await run({ rows: (n) => batch(n, NOTIFY_CLAIM_LIMIT, "p"), tick: { push: 50 } }, { budgetMs: 5_000 });
    expect(fake.claims).toHaveLength(1);
    expect(body.stoppedEarly).toBe(false);
  });

  test("the email cap and an email outage last the whole run: the next claim is push only", async () => {
    const capped = await run({ rows: (n) => (n === 1 ? batch(1, NOTIFY_CLAIM_LIMIT, "e") : []) });
    expect(capped.fake.emails).toHaveLength(NOTIFY_EMAILS_PER_RUN);
    expect(capped.fake.claims.map((c) => c[1])).toEqual(["pe", "p"]);

    const down = await run({
      rows: (n) => (n === 1 ? batch(1, NOTIFY_CLAIM_LIMIT, "e") : []),
      sendResult: () => ({ name: "rate_limit_exceeded", statusCode: 429, message: "slow down" }),
    });
    expect(down.fake.emails).toHaveLength(1);
    expect(down.fake.claims.map((c) => c[1])).toEqual(["pe", "p"]);

    const lookups = await run({
      rows: (n) => (n === 1 ? batch(1, NOTIFY_CLAIM_LIMIT, "e") : []),
      recipients: { user_1000: { kind: "retry", reason: "status_503" } },
    });
    expect(lookups.fake.claims.map((c) => c[1])).toEqual(["pe", "p"]);
  });

  test("push is claimed again only if pushes as slow as the last batch's still start within the push budget", async () => {
    // 200 pushes × 60 ms = 12 s; 12 s in + 12 s more passes the 20 s push budget.
    const slow = await run({ rows: (n) => (n === 1 ? batch(1, NOTIFY_CLAIM_LIMIT, "p") : []), tick: { push: 60 } });
    expect(reported(slow.fake, "pushed")).toHaveLength(NOTIFY_CLAIM_LIMIT);
    expect(slow.fake.pushes).toHaveLength(NOTIFY_CLAIM_LIMIT);
    expect(slow.fake.claims.map((c) => c[1])).toEqual(["pe", "e"]);
    // With nothing left to serve the run ends, full batch or not.
    const pushOnly = await run({
      rows: (n) => batch(n, NOTIFY_CLAIM_LIMIT, "p"), tick: { push: 60 }, config: testConfig({ emailConfigured: false }),
    });
    expect(pushOnly.fake.claims.map((c) => c[1])).toEqual(["p"]);
  });

  test("an endpoint carries one recipient's pushes across the run's batches", async () => {
    const { fake } = await run({
      rows: (n) => (n === 1
        ? [sqlRow({ id: "a1", target: 1, claimed: "p", pushTargets: [sub(1)] }), ...batch(1, NOTIFY_CLAIM_LIMIT - 1, "p")]
        : [sqlRow({ id: "b1", target: 2, claimed: "p", pushTargets: [sub(1), sub(2)] })]),
    });
    expect(fake.claims).toHaveLength(2);
    expect(fake.pushes.at(-1)?.subs).toEqual([sub(2)]);
  });

  test("a later claim or read failing ends the run with what was delivered", async () => {
    const claim = await run({
      rows: (n) => batch(n, NOTIFY_CLAIM_LIMIT, "p"),
      onClaim: (n) => { if (n === 2) throw new Error("SpacetimeDB reducer x failed (500): boom"); },
    });
    expect(claim.res.status).toBe(200);
    expect(claim.body).toMatchObject({ claimed: NOTIFY_CLAIM_LIMIT, pushed: NOTIFY_CLAIM_LIMIT });
    expect(claim.fake.sqls).toHaveLength(1);
    expect(claim.fake.logs.find((l) => l.event === "notify.claim_failed")?.level).toBe("error");

    let reads = 0;
    const read = await run({
      rows: (n) => batch(n, NOTIFY_CLAIM_LIMIT, "p"),
      onSql: () => { if (++reads === 2) throw new Error("SpacetimeDB SQL failed (500): boom"); },
    });
    expect(read.res.status).toBe(200);
    expect(read.body.claimed).toBe(NOTIFY_CLAIM_LIMIT);
    expect(read.fake.finishes.map((f) => f.runId)).toEqual([runIdOf(1)]);
  });
});
