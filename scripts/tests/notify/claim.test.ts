// deliver(), the cron's claim / finish state machine and send-time
// revalidation (spacetimedb/src/notify/{deliver,claim}.ts), run for real
// over the fake database.

import { describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { NOTIFY_KEEP_MICROS } from "@/spacetimedb/src/notify/logic";
import { DRIVE_FAKE_TABLES, NOTIFY_FAKE_TABLES } from "../drive/fake-db";
import {
  FakeTimestamp, FakeUuid, MIN, R, S, claim, createdAt, delivery, document, errorOf, finish, pref, send, subscribe,
  world, type FakeMember, type World,
} from "./world";

const H = 60n * MIN;
const DAY = 24n * H;

describe("deliver", () => {
  test("a chat message to someone with no preference and no push subscription: the notification row only", () => {
    const w = world();
    const id = send(w, w.staff, { type: "team", title: "Olive", body: "hi", link: "/manager/channel?c=c1", template: "chat.message", email: false });
    expect(w.db.find("notification", id)).toMatchObject({ type: "team", title: "Olive", body: "hi", link: "/manager/channel?c=c1", read: false });
    expect(delivery(w, id)).toBeNull();
  });

  test("a localized in-app row owes nothing and is kept 7 days; params carry the store's name", () => {
    const w = world();
    const id = send(w, w.staff, { template: "team.joined", params: { actor: "Ann" }, email: false });
    const row = delivery(w, id)!;
    expect(row).toMatchObject({ email: false, push: false, runId: "", template: "team.joined", scope: "service" });
    expect(row.dueAtMicros).toBe(createdAt(w, id) + NOTIFY_KEEP_MICROS);
    expect(JSON.parse(String(row.params))).toEqual({ actor: "Ann", store: "Corner Bakery" });
  });

  test("an email is due after 60 s; a push subscription makes a push due after 20 s", () => {
    const w = world();
    const mail = send(w, w.staff);
    expect(delivery(w, mail)).toMatchObject({ email: true, push: false, dueAtMicros: createdAt(w, mail) + 60n * S });
    subscribe(w, w.manager);
    const both = send(w, w.manager);
    expect(delivery(w, both)).toMatchObject({ email: true, push: true, dueAtMicros: createdAt(w, both) + 20n * S });
  });

  test("a browser saved under another store still gets this store's pushes: a subscription is the person's", () => {
    const w = world();
    const phone = subscribe(w, w.manager, "https://web.push.apple.com/phone", "another-org");
    const id = send(w, w.manager, { email: false });
    expect(delivery(w, id)?.push).toBe(true);
    claim(w, createdAt(w, id) + 21n * S);
    expect(JSON.parse(String(delivery(w, id)?.pushTargets)).map((s: { endpoint: string }) => s.endpoint)).toEqual([phone]);
  });

  test("push targets are the newest subscriptions first, so stale endpoints never crowd a live one out", () => {
    const w = world();
    const endpoints: string[] = [];
    for (let i = 0; i < 14; i++) {
      w.db.advance(S);
      endpoints.push(subscribe(w, w.manager, `https://web.push.apple.com/${i}`, i % 2 ? w.org : "another-org"));
    }
    const id = send(w, w.manager, { email: false });
    claim(w, createdAt(w, id) + 21n * S);
    const targets = JSON.parse(String(delivery(w, id)?.pushTargets)).map((s: { endpoint: string }) => s.endpoint);
    expect(targets).toEqual(endpoints.slice().reverse().slice(0, 10));
  });

  test("in-app only: no delivery row even with a push subscription", () => {
    const w = world();
    subscribe(w, w.staff);
    const id = send(w, w.staff, { inAppOnly: true, template: "custom", type: "general" });
    expect(w.db.find("notification", id)).not.toBeNull();
    expect(delivery(w, id)).toBeNull();
  });

  test("the notification row keeps the link as given; the delivery row only a safe app path; copy is clamped", () => {
    const w = world();
    const id = send(w, w.staff, { link: "/store", title: "t".repeat(300), body: "b".repeat(900) });
    expect(w.db.find("notification", id)).toMatchObject({ link: "/store" });
    expect(String(w.db.find("notification", id)?.title)).toHaveLength(140);
    expect(String(w.db.find("notification", id)?.body)).toHaveLength(500);
    expect(delivery(w, id)?.link).toBe("");
    expect(delivery(w, send(w, w.staff, { link: "/manager/x?y=\"z" }))?.link).toBe("/manager/x?y=%22z");
    expect(w.db.find("notification", send(w, w.staff, { link: "" }))?.link).toBeUndefined();
  });

  test("never throws: without the delivery table the notification row still goes in", () => {
    const w = world(DRIVE_FAKE_TABLES.filter((t) => !NOTIFY_FAKE_TABLES.includes(t)));
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    const id = send(w, w.staff);
    quiet.mockRestore();
    expect(w.db.find("notification", id)).not.toBeNull();
  });
});

describe("claim / finish", () => {
  test("push at 20 s, email at 60 s, each leased to a run and released by its finish; the done row is kept 7 days, then collected", () => {
    const w = world();
    pref(w, w.staff);
    const endpoint = subscribe(w, w.staff);
    const id = send(w, w.staff);
    const t0 = createdAt(w, id);
    claim(w, t0 + 10n * S);
    expect(delivery(w, id)?.runId).toBe("");
    const a = claim(w, t0 + 21n * S);
    expect(delivery(w, id)).toMatchObject({ runId: a, claimed: "p", attempts: 0, subject: "user_staff", locale: "fr", dueAtMicros: t0 + 21n * S + 5n * MIN });
    expect(JSON.parse(String(delivery(w, id)?.pushTargets))).toEqual([{ endpoint, p256dh: "p256", auth: "auth" }]);
    finish(w, a, { pushed: [id] }, t0 + 22n * S);
    expect(delivery(w, id)).toMatchObject({ push: false, email: true, runId: "", claimed: "", pushTargets: "", dueAtMicros: t0 + 60n * S });
    const b = claim(w, t0 + 61n * S);
    expect(delivery(w, id)).toMatchObject({ runId: b, claimed: "e", attempts: 1, pushTargets: "" });
    finish(w, b, { emailed: [id] }, t0 + 62n * S);
    expect(delivery(w, id)).toMatchObject({ email: false, push: false, runId: "", dueAtMicros: t0 + NOTIFY_KEEP_MICROS });
    expect(w.db.find("notificationEmailState", w.staff.identity)).toMatchObject({ lastEmailAtMicros: t0 + 62n * S, dayCount: 1 });
    claim(w, t0 + NOTIFY_KEEP_MICROS + S);
    expect(delivery(w, id)).toBeNull();
  });

  test("a done chat message is deleted at once; a row with both channels may finish them in separate calls", () => {
    const w = world();
    pref(w, w.staff);
    subscribe(w, w.staff);
    const id = send(w, w.staff, { template: "chat.mention", email: true });
    const chat = send(w, w.staff, { template: "chat.message", email: false });
    const run = claim(w, createdAt(w, id) + 61n * S);
    expect(delivery(w, id)?.claimed).toBe("pe");
    finish(w, run, { pushed: [id, chat] });
    expect(delivery(w, chat)).toBeNull();
    expect(delivery(w, id)).toMatchObject({ runId: run, claimed: "e", pushTargets: "", push: false });
    finish(w, run, { emailed: [id] });
    expect(delivery(w, id)).toMatchObject({ runId: "", claimed: "", email: false });
  });

  test("an expired lease: the push is not sent again, the email attempt stays counted", () => {
    const w = world();
    pref(w, w.staff);
    subscribe(w, w.staff);
    const id = send(w, w.staff);
    const t0 = createdAt(w, id);
    const a = claim(w, t0 + 61n * S);
    expect(delivery(w, id)).toMatchObject({ claimed: "pe", attempts: 1 });
    claim(w, t0 + 61n * S + 4n * MIN);
    expect(delivery(w, id)?.runId).toBe(a);
    const b = claim(w, t0 + 61n * S + 5n * MIN);
    expect(delivery(w, id)).toMatchObject({ runId: b, claimed: "e", push: false, attempts: 2 });
    // The lost run's late report changes nothing.
    finish(w, a, { emailed: [id] });
    expect(delivery(w, id)).toMatchObject({ runId: b, email: true });
  });

  test("an expired push-only lease of a localized row: the done rule keeps it 7 days (the in-app alert still localizes)", () => {
    const w = world();
    subscribe(w, w.staff);
    const id = send(w, w.staff, { template: "inventory.low", type: "inventory_low", email: false, params: { item: "Milk" } });
    const t0 = createdAt(w, id);
    const lost = claim(w, t0 + 21n * S);
    expect(delivery(w, id)).toMatchObject({ runId: lost, claimed: "p" });
    claim(w, t0 + 21n * S + 5n * MIN);
    expect(delivery(w, id)).toMatchObject({ push: false, email: false, runId: "", claimed: "", pushTargets: "", dueAtMicros: t0 + NOTIFY_KEEP_MICROS });
    // An unlocalized row in the same state goes.
    const chat = send(w, w.staff, { template: "chat.message", type: "team", email: false });
    claim(w, createdAt(w, chat) + 21n * S);
    claim(w, createdAt(w, chat) + 21n * S + 5n * MIN);
    expect(delivery(w, chat)).toBeNull();
  });

  test("finish skips rows that are gone or held by another run, and never throws for them", () => {
    const w = world();
    pref(w, w.staff);
    const id = send(w, w.staff);
    const run = claim(w, createdAt(w, id) + 61n * S);
    expect(errorOf(() => finish(w, randomUUID(), { emailed: [id] }))).toBeNull();
    expect(errorOf(() => finish(w, run, { emailed: [randomUUID()], emailDropped: ["not-an-id"] }))).toBeNull();
    expect(delivery(w, id)).toMatchObject({ runId: run, email: true });
  });

  test("emailRetry is not counted and returns in 2 minutes; emailFailed backs off 2, then 10 minutes and gives up at the third attempt", () => {
    const w = world();
    pref(w, w.staff);
    const id = send(w, w.staff);
    let now = createdAt(w, id) + 61n * S;
    let run = claim(w, now);
    finish(w, run, { emailRetry: [id] }, now);
    expect(delivery(w, id)).toMatchObject({ attempts: 0, email: true, runId: "", dueAtMicros: now + 2n * MIN });
    for (const [attempt, backoff] of [[1, 2n * MIN], [2, 10n * MIN]] as const) {
      now = BigInt(delivery(w, id)?.dueAtMicros as bigint);
      run = claim(w, now);
      expect(delivery(w, id)?.attempts).toBe(attempt);
      finish(w, run, { emailFailed: [id] }, now);
      expect(delivery(w, id)).toMatchObject({ email: true, dueAtMicros: now + backoff });
    }
    now = BigInt(delivery(w, id)?.dueAtMicros as bigint);
    run = claim(w, now);
    finish(w, run, { emailFailed: [id] }, now);
    expect(delivery(w, id)).toMatchObject({ attempts: 3, email: false, runId: "" });
  });

  test("emailDropped ends the email; expired endpoints lose the target's subscriptions", () => {
    const w = world();
    pref(w, w.staff);
    const endpoint = subscribe(w, w.staff);
    const id = send(w, w.staff);
    const run = claim(w, createdAt(w, id) + 61n * S);
    finish(w, run, { pushed: [id], emailDropped: [id], expired: [[id, endpoint]] });
    expect(delivery(w, id)).toMatchObject({ email: false, push: false });
    expect(w.db.rows("pushSubscription")).toHaveLength(0);
  });

  test("read, dismissed or deleted before it was sent: no email, and the row goes", () => {
    const w = world();
    pref(w, w.staff);
    const read = send(w, w.staff);
    const dismissed = send(w, w.staff);
    const deleted = send(w, w.staff);
    const flagged = send(w, w.staff);
    w.db.run(R.markNotificationRead, w.staff, { notificationId: read });
    w.db.run(R.dismissNotification, w.staff, { notificationId: dismissed });
    expect(delivery(w, read)).toBeNull();
    expect(delivery(w, dismissed)).toBeNull();
    w.db.transact((db) => (db.notification as { id: { delete(k: unknown): void } }).id.delete(deleted));
    w.db.patch("notification", flagged, { read: true });
    claim(w, createdAt(w, flagged) + 61n * S);
    expect(delivery(w, deleted)).toBeNull();
    expect(delivery(w, flagged)).toBeNull();
  });

  test("no WorkOS user id or email turned off: no email; the emergency ignores the switch, not a missing id", () => {
    const w = world();
    pref(w, w.manager, { emailEnabled: false });
    pref(w, w.staff, { subject: "" });
    const off = send(w, w.manager);
    const sos = send(w, w.manager, { template: "alert.emergency", type: "emergency" });
    const noSubject = send(w, w.staff);
    const run = claim(w, createdAt(w, noSubject) + 61n * S);
    expect(delivery(w, off)).toMatchObject({ email: false, runId: "" });
    expect(delivery(w, sos)).toMatchObject({ runId: run, claimed: "e" });
    expect(delivery(w, noSubject)?.email).toBe(false);
    // The emergency is for owners and managers only.
    pref(w, w.owner, {});
    const toStaff = send(w, w.staff, { template: "alert.emergency", type: "emergency" });
    claim(w, createdAt(w, toStaff));
    expect(delivery(w, toStaff)).toMatchObject({ email: false, runId: "" });
  });

  test("pacing: one email per recipient per 10 minutes and 30 a day; the emergency goes at once past both", () => {
    const w = world();
    pref(w, w.staff);
    const id = send(w, w.staff);
    const t0 = createdAt(w, id);
    const dayKey = new Date(Number((t0 + 61n * S) / 1000n)).toISOString().slice(0, 10);
    w.db.insert("notificationEmailState", { targetId: w.staff.identity, lastEmailAtMicros: t0, dayKey, dayCount: 1 });
    claim(w, t0 + 61n * S);
    expect(delivery(w, id)).toMatchObject({ runId: "", dueAtMicros: t0 + 10n * MIN });
    w.db.patch("notificationEmailState", w.staff.identity, { lastEmailAtMicros: t0 - H, dayCount: 30 });
    claim(w, t0 + 10n * MIN);
    expect(delivery(w, id)?.dueAtMicros).toBe(((t0 + 10n * MIN) / DAY + 1n) * DAY);
    pref(w, w.manager);
    w.db.insert("notificationEmailState", { targetId: w.manager.identity, lastEmailAtMicros: t0 + 10n * MIN, dayKey, dayCount: 30 });
    const sos = send(w, w.manager, { template: "alert.emergency", type: "emergency" });
    const run = claim(w, createdAt(w, sos));
    expect(delivery(w, sos)).toMatchObject({ runId: run, claimed: "e" });
  });

  test("an SOS email does not use up the recipient's gap or daily count", () => {
    const w = world();
    pref(w, w.manager);
    const sos = send(w, w.manager, { template: "alert.emergency", type: "emergency" });
    const t0 = createdAt(w, sos);
    finish(w, claim(w, t0), { emailed: [sos] }, t0 + S);
    expect(w.db.find("notificationEmailState", w.manager.identity)).toBeNull();
    // An ordinary email right after it is not held back by the gap, and is counted.
    const shared = send(w, w.manager, {}, { atMicros: t0 + 2n * S });
    const t1 = createdAt(w, shared) + 61n * S;
    const run = claim(w, t1);
    expect(delivery(w, shared)).toMatchObject({ runId: run, claimed: "e" });
    finish(w, run, { emailed: [shared] }, t1);
    expect(w.db.find("notificationEmailState", w.manager.identity)).toMatchObject({ lastEmailAtMicros: t1, dayCount: 1 });
    // Another SOS goes at once and leaves the pacing alone.
    const sos2 = send(w, w.manager, { template: "alert.emergency", type: "emergency" }, { atMicros: t1 + S });
    finish(w, claim(w, createdAt(w, sos2)), { emailed: [sos2] }, t1 + 2n * S);
    expect(w.db.find("notificationEmailState", w.manager.identity)).toMatchObject({ lastEmailAtMicros: t1, dayCount: 1 });
  });

  test("at most 20 rows per recipient per run, at most `limit` rows, and no more than 2 × limit looked at", () => {
    const w = world();
    pref(w, w.staff);
    pref(w, w.manager);
    const ids = Array.from({ length: 25 }, () => send(w, w.staff));
    const later = send(w, w.manager);
    const now = createdAt(w, later) + 61n * S;
    const run = claim(w, now, { limit: 30 });
    const held = ids.filter((id) => delivery(w, id)?.runId === run);
    expect(held).toHaveLength(20);
    for (const id of ids.filter((x) => !held.includes(x))) expect(delivery(w, id)?.dueAtMicros).toBe(now + MIN);
    expect(delivery(w, later)?.runId).toBe(run);
    const w2 = world();
    pref(w2, w2.staff);
    const many = Array.from({ length: 6 }, () => send(w2, w2.staff));
    const r2 = claim(w2, createdAt(w2, many[5]) + 61n * S, { limit: 2 });
    expect(many.filter((id) => delivery(w2, id)?.runId === r2)).toHaveLength(2);
  });

  test("a channel the run cannot serve waits a minute; a push older than an hour is dropped", () => {
    const w = world();
    subscribe(w, w.staff);
    const id = send(w, w.staff, { email: false });
    const t0 = createdAt(w, id);
    claim(w, t0 + 21n * S, { channels: "e" });
    expect(delivery(w, id)).toMatchObject({ push: true, runId: "", dueAtMicros: t0 + 21n * S + MIN });
    claim(w, t0 + H + S, { channels: "e" });
    expect(delivery(w, id)).toMatchObject({ push: false, dueAtMicros: t0 + NOTIFY_KEEP_MICROS });
  });

  test("service identity only, a uuid run id, channels ⊆ 'pe'; a claim registers the service reader", () => {
    const w = world();
    const args = { runId: randomUUID(), channels: "pe", limit: 5 };
    expect(errorOf(() => w.db.run(R.serviceClaimNotificationDeliveries, w.owner, args))).toBe("Service identity required");
    expect(errorOf(() => w.db.run(R.serviceFinishNotificationDeliveries, w.owner, { runId: args.runId, resultJson: "{}" }))).toBe("Service identity required");
    expect(errorOf(() => claim(w, w.db.nowMicros, { runId: "x'; DROP" }))).toBe("Invalid run id");
    expect(errorOf(() => claim(w, w.db.nowMicros, { channels: "sms" }))).toBe("Invalid channels");
    expect(errorOf(() => w.db.run(R.serviceFinishNotificationDeliveries, w.db.rows("serviceIdentity")[0].identity as never, { runId: args.runId, resultJson: "{" }))).toBe("Invalid result");
    claim(w, w.db.nowMicros);
    expect(w.db.rows("driveServiceReader")).toHaveLength(1);
  });
});

describe("a shared queue no store can hold up", () => {
  const SOS = { template: "alert.emergency" as const, type: "emergency", sourceKind: "device" as const, link: "" };

  /** `n` copies of delivery row `id`, each with its own unread notification row, to `to` (default: the same target). */
  function backlog(w: World, id: string, n: number, to?: FakeMember): string[] {
    const note = w.db.find("notification", id)!;
    const row = delivery(w, id)!;
    return Array.from({ length: n }, () => {
      const copy = new FakeUuid();
      const target = to?.identity ?? row.targetId;
      w.db.insert("notification", { ...note, id: copy, targetId: target });
      w.db.insert("notificationDelivery", { ...row, notificationId: copy.toString(), targetId: target });
      return copy.toString();
    });
  }

  test("an SOS is claimed in the next run behind a backlog of 1000 older due rows, and leaves the lane once done", () => {
    const w = world();
    pref(w, w.staff);
    pref(w, w.manager);
    subscribe(w, w.manager);
    const base = send(w, w.staff);
    backlog(w, base, 1000);
    const t = createdAt(w, base) + 2n * MIN;
    const sos = send(w, w.manager, SOS, { atMicros: t });
    expect(w.db.rows("notificationUrgent").map((r) => r.notificationId)).toEqual([sos]);
    const run = claim(w, t, { limit: 200 });
    expect(delivery(w, sos)).toMatchObject({ runId: run, claimed: "pe" });
    finish(w, run, { pushed: [sos], emailed: [sos] }, t + S);
    expect(w.db.rows("notificationUrgent")).toHaveLength(1);
    claim(w, t + MIN);
    expect(w.db.rows("notificationUrgent")).toHaveLength(0);
  });

  test("an SOS neither waits for nor uses up its recipient's 20 rows per run", () => {
    const w = world();
    pref(w, w.manager);
    const first = send(w, w.manager);
    const rows = [first, ...backlog(w, first, 24)];
    const t = createdAt(w, first) + 2n * MIN;
    const sos = send(w, w.manager, SOS, { atMicros: t });
    const run = claim(w, t, { limit: 100 });
    expect(delivery(w, sos)).toMatchObject({ runId: run, claimed: "e" });
    expect(rows.filter((id) => delivery(w, id)?.runId === run)).toHaveLength(20);
  });

  test("done rows past their keep time are deleted without taking a claim slot", () => {
    const w = world();
    pref(w, w.staff);
    const kept = Array.from({ length: 5 }, () => send(w, w.staff, { template: "team.joined", params: { actor: "Ann" }, email: false }));
    const t0 = createdAt(w, kept[0]);
    const late = send(w, w.staff, {}, { atMicros: t0 + NOTIFY_KEEP_MICROS - 30n * S });
    const run = claim(w, t0 + NOTIFY_KEEP_MICROS + 2n * MIN, { limit: 1 });
    for (const id of kept) expect(delivery(w, id)).toBeNull();
    expect(delivery(w, late)?.runId).toBe(run);
  });

  test("quotas: a store queues 120 rows a minute, a recipient is owed 20 pushes a minute and 60 emails an hour; never the SOS or a PIN alert", () => {
    const w = world();
    const t = (w.db.nowMicros / H + 1n) * H;
    subscribe(w, w.staff);
    const pushes = Array.from({ length: 21 }, (_, i) => send(w, w.staff, { email: false }, { atMicros: t + BigInt(i) }));
    expect(pushes.map((id) => delivery(w, id)?.push)).toEqual([...Array<boolean>(20).fill(true), false]);
    // Past it the row still localizes the in-app text.
    expect(delivery(w, pushes[20])).toMatchObject({ email: false, dueAtMicros: createdAt(w, pushes[20]) + NOTIFY_KEEP_MICROS });

    const mails = Array.from({ length: 61 }, (_, i) => send(w, w.manager, {}, { atMicros: t + MIN + BigInt(i) }));
    expect(mails.filter((id) => delivery(w, id)?.email === true)).toHaveLength(60);
    expect(delivery(w, mails[60])).toMatchObject({ email: false, push: false });
    expect(delivery(w, send(w, w.manager, {}, { atMicros: t + H }))?.email).toBe(true);

    const minute = t + 2n * MIN;
    const flood = Array.from({ length: 121 }, (_, i) => send(w, w.owner, { email: false }, { atMicros: minute + BigInt(i) }));
    expect(flood.filter((id) => delivery(w, id) != null)).toHaveLength(120);
    expect(w.db.find("notification", flood[120])).toMatchObject({ read: false });
    expect(delivery(w, flood[120])).toBeNull();
    const sos = send(w, w.manager, SOS, { atMicros: minute + 200n });
    expect(delivery(w, sos)).toMatchObject({ email: true, template: "alert.emergency" });
    expect(delivery(w, send(w, w.manager, { template: "security.pinLocked", type: "security" }, { atMicros: minute + 201n }))?.email).toBe(true);
    expect(delivery(w, send(w, w.owner, { email: false }, { atMicros: minute + MIN }))).not.toBeNull();
  });
});

describe("send-time revalidation", () => {
  function chat(w: World) {
    const conversationId = randomUUID();
    w.db.insert("chatConversation", { id: new FakeUuid(conversationId), organizationId: w.org });
    for (const m of [w.owner, w.staff]) {
      w.db.insert("chatMember", { id: new FakeUuid(), conversationId, userId: m.identity });
    }
    const messageId = randomUUID();
    w.db.insert("chatMessage", { id: new FakeUuid(messageId), conversationId, senderId: w.owner.identity, content: "@Sam count the flour", attachmentUrl: undefined });
    const id = send(w, w.staff, {
      template: "chat.mention", params: { actor: "Olive", preview: "@Sam count the flour", conversation: "floor" },
      sourceKind: "chat_message", sourceId: messageId, contextId: conversationId, link: `/manager/channel?c=${conversationId}`,
    });
    return { conversationId, messageId, id, due: createdAt(w, id) + 61n * S };
  }

  test("a chat message: re-reads the preview; nothing goes once the message is deleted or the target left", () => {
    const w = world();
    pref(w, w.staff);
    const edited = chat(w);
    w.db.patch("chatMessage", edited.messageId, { content: "@Sam count the sugar" });
    claim(w, edited.due);
    expect(JSON.parse(String(delivery(w, edited.id)?.params)).preview).toBe("@Sam count the sugar");
    expect(delivery(w, edited.id)?.claimed).toBe("e");

    const deleted = chat(w);
    w.db.insert("chatMessageExt", { messageId: deleted.messageId, conversationId: deleted.conversationId, threadParentId: "", editedAt: undefined, pinnedBy: "", pinnedAt: undefined, deletedAt: new FakeTimestamp(w.db.nowMicros) });
    const left = chat(w);
    const membership = w.db.rows("chatMember").find((m) => m.conversationId === left.conversationId && m.userId === w.staff.identity)!;
    w.db.transact((db) => (db.chatMember as { delete(r: unknown): void }).delete(membership));
    claim(w, left.due);
    expect(delivery(w, deleted.id)).toMatchObject({ email: false, push: false, runId: "" });
    expect(delivery(w, left.id)).toMatchObject({ email: false, runId: "" });
  });

  test("a departed member, a demoted manager, a revoked document or a deleted comment gets nothing", () => {
    const w = world();
    for (const m of [w.staff, w.manager]) pref(w, m);
    const doc = document(w);
    const grant = new FakeUuid();
    w.db.insert("documentAccess", { id: grant, documentId: doc, organizationId: w.org, memberId: w.staff.memberId, role: "viewer" });
    const shared = send(w, w.staff, { sourceKind: "doc", sourceId: doc, contextId: doc });
    const commentId = new FakeUuid();
    w.db.insert("documentComment", { id: commentId, documentId: doc, organizationId: w.org });
    const comment = send(w, w.manager, { template: "doc.comment", sourceKind: "doc_comment", sourceId: commentId.toString(), contextId: doc });
    const security = send(w, w.manager, { template: "security.pinLocked", type: "security" });
    const kept = send(w, w.manager, { template: "supplier.order", type: "order" });
    w.db.transact((db) => (db.documentAccess as { id: { delete(k: unknown): void } }).id.delete(grant));
    w.db.transact((db) => (db.documentComment as { id: { delete(k: unknown): void } }).id.delete(commentId));
    const run = claim(w, createdAt(w, kept) + 61n * S);
    expect(delivery(w, shared)).toMatchObject({ email: false, runId: "" });
    expect(delivery(w, comment)).toMatchObject({ email: false, runId: "" });
    expect(delivery(w, kept)?.runId).toBe(run);
    w.db.patch("orgMember", w.manager.memberId, { role: "staff" });
    const later = send(w, w.manager, { template: "supplier.order", type: "order" });
    claim(w, createdAt(w, later) + 61n * S);
    expect(delivery(w, later)).toMatchObject({ email: false, runId: "" });
    expect(delivery(w, security)).toMatchObject({ runId: run });
    w.db.patch("orgMember", w.staff.memberId, { status: "removed" });
    const gone = send(w, w.staff, { template: "team.joined" });
    claim(w, createdAt(w, gone) + 61n * S);
    expect(delivery(w, gone)).toMatchObject({ email: false, runId: "" });
  });

  test("a document comment edited before the email: the email carries the edited text", () => {
    const w = world();
    pref(w, w.manager);
    const doc = document(w, "store");
    const commentId = new FakeUuid();
    w.db.insert("documentComment", { id: commentId, documentId: doc, organizationId: w.org, body: "Door code is 4821" });
    const id = send(w, w.manager, {
      template: "doc.comment", type: "doc_comment", params: { actor: "Olive", doc: "Menu", preview: "Door code is 4821" },
      sourceKind: "doc_comment", sourceId: commentId.toString(), contextId: doc,
    });
    w.db.patch("documentComment", commentId.toString(), { body: "Ask me for the door code" });
    claim(w, createdAt(w, id) + 61n * S);
    expect(delivery(w, id)?.claimed).toBe("e");
    expect(JSON.parse(String(delivery(w, id)?.params))).toEqual({ actor: "Olive", doc: "Menu", preview: "Ask me for the door code", store: "Corner Bakery" });
  });

  test("low stock emails only owners and managers; everyone else keeps the push", () => {
    const w = world();
    for (const m of [w.staff, w.manager]) {
      pref(w, m);
      subscribe(w, m);
    }
    const input = { template: "inventory.low" as const, type: "inventory_low", sourceKind: "inventory" as const, email: true };
    const toStaff = send(w, w.staff, input);
    const toManager = send(w, w.manager, input);
    claim(w, createdAt(w, toManager) + 61n * S);
    expect(delivery(w, toStaff)).toMatchObject({ email: false, claimed: "p" });
    expect(delivery(w, toManager)?.claimed).toBe("pe");
  });
});
