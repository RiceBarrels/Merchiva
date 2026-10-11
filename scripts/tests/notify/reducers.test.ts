// The notification reducers (spacetimedb/src/notify/reducers.ts): read and
// delivered acknowledgements, preferences and identity capture, follows, the
// store SOS and push subscriptions, run for real over the fake database.

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { notifyReadConversation, type NotifyCtx } from "@/spacetimedb/src/notify/deliver";
import { NOTIFY_SOS_EMAIL_DAILY_CAP } from "@/spacetimedb/src/notify/sos";
import {
  FakeIdentity, FakeTimestamp, FakeUuid, MIN, R, S, claim, createdAt, delivery, deps, errorOf, pref, send, subscribe, world,
  type FakeMember, type World,
} from "./world";

const ids = (...list: string[]) => ({ idsJson: JSON.stringify(list) });

describe("read and delivered", () => {
  test("markNotificationsRead marks the caller's own rows read and drops their delivery rows; others' and missing ids are skipped", () => {
    const w = world();
    const mine = send(w, w.staff);
    const theirs = send(w, w.manager);
    w.db.run(R.markNotificationsRead, w.staff, ids(mine, theirs, randomUUID(), "garbage"));
    expect(w.db.find("notification", mine)?.read).toBe(true);
    expect(delivery(w, mine)).toBeNull();
    expect(w.db.find("notification", theirs)?.read).toBe(false);
    expect(delivery(w, theirs)).not.toBeNull();
    expect(errorOf(() => w.db.run(R.markNotificationsRead, w.staff, { idsJson: "{" }))).toBe("Invalid notification id list");
  });

  test("markAllNotificationsRead drops the delivery rows of that organization only", () => {
    const w = world();
    const here = send(w, w.staff);
    const elsewhere = randomUUID();
    w.db.addMember({ organizationId: elsewhere, identity: w.staff.identity, role: "staff" });
    const there = send(w, w.staff, { organizationId: elsewhere });
    w.db.run(R.markAllNotificationsRead, w.staff, { organizationId: w.org });
    expect(delivery(w, here)).toBeNull();
    expect(delivery(w, there)).not.toBeNull();
  });

  test("markNotificationsDelivered ends the push (done rule applied), never for the emergency", () => {
    const w = world();
    subscribe(w, w.manager);
    const chat = send(w, w.manager, { template: "chat.message", email: false });
    const shared = send(w, w.manager);
    const sos = send(w, w.manager, { template: "alert.emergency", type: "emergency" });
    w.db.run(R.markNotificationsDelivered, w.manager, ids(chat, shared, sos));
    expect(delivery(w, chat)).toBeNull();
    expect(delivery(w, shared)).toMatchObject({ push: false, email: true });
    expect(delivery(w, sos)?.push).toBe(true);
    expect(w.db.find("notification", shared)?.read).toBe(false);
  });

  test("reading a conversation marks its rows read and drops their delivery rows", () => {
    const w = world();
    const link = "/manager/channel?c=c1";
    const inChannel = send(w, w.staff, { template: "chat.mention", link });
    const other = send(w, w.staff, { template: "chat.mention", link: "/manager/channel?c=c2" });
    const theirs = send(w, w.manager, { template: "chat.mention", link });
    w.db.run((ctx: NotifyCtx) => notifyReadConversation(ctx, deps, "c1"), w.staff);
    expect(w.db.find("notification", inChannel)?.read).toBe(true);
    expect(delivery(w, inChannel)).toBeNull();
    expect(delivery(w, other)).not.toBeNull();
    expect(w.db.find("notification", theirs)?.read).toBe(false);
  });

  test("the unread index: what deliver() adds, reading removes; older rows join it once, then nothing is scanned", () => {
    const w = world();
    const read = (who: FakeMember, c: string) => w.db.run((ctx: NotifyCtx) => notifyReadConversation(ctx, deps, c), who);
    const legacy = (c: string) => {
      const id = new FakeUuid();
      w.db.insert("notification", {
        id, organizationId: w.org, targetId: w.staff.identity, type: "team", title: "Olive", body: "hi",
        link: `/manager/channel?c=${c}`, read: false, createdAt: new FakeTimestamp(w.db.nowMicros),
      });
      return id.toString();
    };
    const before = legacy("c1");
    const elsewhere = legacy("c2");
    const indexed = send(w, w.staff, { template: "chat.message", email: false, link: "/manager/channel?c=c1" });
    send(w, w.staff, { link: "/manager/docs/edit?id=d1" });
    expect(w.db.rows("chatNoticeUnread").map((r) => r.readerKey)).toEqual([`c1:${w.staff.identity.hex}`]);
    read(w.staff, "c1");
    expect([before, indexed].map((id) => w.db.find("notification", id)?.read)).toEqual([true, true]);
    expect(w.db.rows("chatNoticeUnread").map((r) => r.readerKey).sort()).toEqual([`backfill:${w.staff.identity.hex}`, `c2:${w.staff.identity.hex}`]);
    // A row written behind deliver()'s back after the backfill is not found: markChatRead reads the index alone.
    const missed = legacy("c1");
    read(w.staff, "c1");
    expect(w.db.find("notification", missed)?.read).toBe(false);
    // Read another way, a row leaves the index.
    w.db.run(R.markNotificationRead, w.staff, { notificationId: elsewhere });
    expect(w.db.rows("chatNoticeUnread")).toHaveLength(1);
  });
});

describe("preference and identity", () => {
  const issuer = "https://api.workos.com/user_management/client_1";
  const sync = (w: World, m: FakeMember, senderAuth: unknown) =>
    w.db.transact(() => (R.syncNotificationIdentity as (ctx: unknown, a: unknown) => void)({ ...w.db.ctx(m.identity), senderAuth }, {}));

  test("syncNotificationIdentity records the token's WorkOS user id and issuer; anything else changes nothing", () => {
    const w = world();
    sync(w, w.staff, { hasJWT: false, jwt: null });
    sync(w, w.staff, { hasJWT: true, jwt: { subject: "not-a-user", issuer } });
    expect(w.db.find("notificationPref", w.staff.identity)).toBeNull();
    w.db.run(R.setNotificationLocale, w.staff, { locale: "zh_TW" });
    w.db.run(R.setNotificationEmail, w.staff, { enabled: false });
    sync(w, w.staff, { hasJWT: true, jwt: { subject: "user_01H", issuer } });
    expect(w.db.find("notificationPref", w.staff.identity)).toMatchObject({ subject: "user_01H", issuer, locale: "zh-tw", emailEnabled: false });
    sync(w, w.staff, { hasJWT: true, get jwt() { throw new Error("bad"); } });
    expect(w.db.find("notificationPref", w.staff.identity)?.subject).toBe("user_01H");
  });

  test("setNotificationLocale keeps the 8 app locales only", () => {
    const w = world();
    w.db.run(R.setNotificationLocale, w.staff, { locale: "de" });
    expect(w.db.find("notificationPref", w.staff.identity)).toMatchObject({ locale: "", emailEnabled: true, subject: "" });
  });

  test("turning email off cancels the email owed on queued rows, except the emergency's", () => {
    const w = world();
    subscribe(w, w.manager);
    const shared = send(w, w.manager);
    const chat = send(w, w.manager, { template: "chat.message", email: true });
    const sos = send(w, w.manager, { template: "alert.emergency", type: "emergency" });
    w.db.run(R.setNotificationEmail, w.manager, { enabled: false });
    expect(delivery(w, shared)).toMatchObject({ email: false, push: true });
    expect(delivery(w, chat)).toMatchObject({ email: false, push: true });
    expect(delivery(w, sos)?.email).toBe(true);
    w.db.run(R.setNotificationEmail, w.manager, { enabled: true });
    expect(delivery(w, shared)?.email).toBe(false);
  });
});

describe("setChatFollow", () => {
  test("follow, again, unfollow; stored by lowercase hex", () => {
    const w = world();
    const args = { organizationId: w.org, targetHex: w.owner.identity.hex.toUpperCase(), followed: true };
    w.db.run(R.setChatFollow, w.staff, args);
    w.db.run(R.setChatFollow, w.staff, args);
    const rows = w.db.rows("chatFollow");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: `${w.org}:${w.staff.identity.hex}:${w.owner.identity.hex}`, targetHex: w.owner.identity.hex, organizationId: w.org });
    w.db.run(R.setChatFollow, w.staff, { ...args, followed: false });
    expect(w.db.rows("chatFollow")).toHaveLength(0);
  });

  test("not yourself, not a stranger, not from outside, not a malformed identity", () => {
    const w = world();
    const follow = (who: FakeMember | FakeIdentity, targetHex: string) =>
      errorOf(() => w.db.run(R.setChatFollow, who, { organizationId: w.org, targetHex, followed: true }));
    expect(follow(w.staff, w.staff.identity.hex)).toBe("You cannot follow yourself");
    expect(follow(w.staff, FakeIdentity.random().hex)).toBe("Not a member of this organization");
    expect(follow(FakeIdentity.random(), w.owner.identity.hex)).toBe("Not an active member of this organization");
    expect(follow(w.staff, "zz")).toBe("Invalid member");
  });
});

describe("sendStoreSos", () => {
  function device(w: World, enabled = true): string {
    const deviceId = randomUUID();
    w.db.insert("storeDevice", {
      id: new FakeUuid(), organizationId: w.org, deviceId, name: "Front counter", enabled,
      lastSeenAt: new FakeTimestamp(w.db.nowMicros), registeredBy: w.owner.identity, createdAt: new FakeTimestamp(w.db.nowMicros),
    });
    return deviceId;
  }

  test("every active owner and manager, the caller's own account included, gets an emergency that emails and pushes at once", () => {
    const w = world();
    subscribe(w, w.manager);
    const deviceId = device(w);
    w.db.run(R.sendStoreSos, w.manager, { organizationId: w.org, deviceId });
    const rows = w.db.rows("notification");
    expect(rows.map((n) => (n.targetId as FakeIdentity).hex).sort()).toEqual([w.owner.identity.hex, w.manager.identity.hex].sort());
    expect(rows[0]).toMatchObject({ type: "emergency", title: "Emergency at Front counter", link: undefined });
    const managerRow = rows.find((n) => (n.targetId as FakeIdentity).hex === w.manager.identity.hex)!;
    const d = delivery(w, String(managerRow.id))!;
    expect(d).toMatchObject({ template: "alert.emergency", email: true, push: true, sourceKind: "device", link: "" });
    expect(d.dueAtMicros).toBe(createdAt(w, String(managerRow.id)));
    expect(JSON.parse(String(d.params))).toEqual({ device: "Front counter", store: "Corner Bakery" });
  });

  test("one per store per 2 minutes; registered, enabled devices of the store only; members only", () => {
    const w = world();
    const deviceId = device(w);
    const sos = (who: FakeMember | FakeIdentity, id = deviceId, atMicros?: bigint) =>
      errorOf(() => w.db.run(R.sendStoreSos, who, { organizationId: w.org, deviceId: id }, { atMicros }));
    const start = w.db.nowMicros + S;
    expect(sos(w.staff, deviceId, start)).toBeNull();
    expect(sos(w.staff, deviceId, start + MIN)).toBe("An SOS was sent from this store less than 2 minutes ago");
    expect(sos(w.staff, deviceId, start + 2n * MIN)).toBeNull();
    expect(sos(w.staff, "unknown")).toBe("This store device is not registered or is turned off");
    expect(sos(w.staff, device(w, false))).toBe("This store device is not registered or is turned off");
    expect(sos(FakeIdentity.random())).toBe("Not an active member of this organization");
  });

  test(`after ${NOTIFY_SOS_EMAIL_DAILY_CAP} SOS in a UTC day, an SOS still alerts and pushes but is not emailed`, () => {
    const w = world();
    subscribe(w, w.manager);
    const deviceId = device(w);
    const day = 24n * 60n * MIN;
    const start = (w.db.nowMicros / day + 1n) * day;
    const sosAt = (i: number) => {
      w.db.run(R.sendStoreSos, w.staff, { organizationId: w.org, deviceId }, { atMicros: start + BigInt(i) * 2n * MIN });
      const latest = w.db.rows("notification").filter((n) => (n.targetId as FakeIdentity).hex === w.manager.identity.hex).at(-1)!;
      return delivery(w, String(latest.id))!;
    };
    for (let i = 0; i < NOTIFY_SOS_EMAIL_DAILY_CAP; i++) expect(sosAt(i).email).toBe(true);
    expect(sosAt(NOTIFY_SOS_EMAIL_DAILY_CAP)).toMatchObject({ email: false, push: true, template: "alert.emergency" });
    w.db.run(R.sendStoreSos, w.staff, { organizationId: w.org, deviceId }, { atMicros: start + day });
    const nextDay = w.db.rows("notification").filter((n) => (n.targetId as FakeIdentity).hex === w.manager.identity.hex).at(-1)!;
    expect(delivery(w, String(nextDay.id))?.email).toBe(true);
  });
});

describe("push subscriptions", () => {
  const save = (w: World, who: FakeMember, endpoint: string, organizationId = w.org) =>
    errorOf(() => w.db.run(R.savePushSubscription, who, { organizationId, endpoint, p256dh: "k", auth: "a", userAgent: undefined }));

  test("https only; the last account to subscribe in a browser owns its endpoint", () => {
    const w = world();
    expect(save(w, w.staff, "http://push.example/1")).toBe("Push endpoint must be an https URL of at most 1000 characters");
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    const elsewhere = randomUUID();
    w.db.addMember({ organizationId: elsewhere, identity: w.staff.identity, role: "staff" });
    expect(save(w, w.staff, endpoint)).toBeNull();
    expect(save(w, w.staff, endpoint, elsewhere)).toBeNull();
    expect(save(w, w.staff, endpoint)).toBeNull();
    expect(w.db.rows("pushSubscription")).toHaveLength(2);
    expect(save(w, w.manager, endpoint)).toBeNull();
    const rows = w.db.rows("pushSubscription");
    expect(rows).toHaveLength(1);
    expect((rows[0].targetId as FakeIdentity).hex).toBe(w.manager.identity.hex);
    w.db.run(R.deletePushSubscription, w.manager, { organizationId: w.org, endpoint });
    expect(w.db.rows("pushSubscription")).toHaveLength(0);
  });

  test("deleting a browser's endpoint removes the caller's rows for it in every organization, and nobody else's", () => {
    const w = world();
    const endpoint = "https://fcm.googleapis.com/fcm/send/shared";
    const elsewhere = randomUUID();
    w.db.addMember({ organizationId: elsewhere, identity: w.staff.identity, role: "staff" });
    subscribe(w, w.staff, endpoint);
    subscribe(w, w.staff, endpoint, elsewhere);
    const kept = subscribe(w, w.staff);
    subscribe(w, w.manager, endpoint);
    // Signed out of an organization the member has since left: still cleaned up.
    w.db.patch("orgMember", w.staff.memberId, { status: "left" });
    expect(errorOf(() => w.db.run(R.deletePushSubscription, w.staff, { organizationId: w.org, endpoint }))).toBeNull();
    const left = w.db.rows("pushSubscription").map((r) => [(r.targetId as FakeIdentity).hex, r.endpoint]);
    expect(left.sort()).toEqual([[w.staff.identity.hex, kept], [w.manager.identity.hex, endpoint]].sort());
  });

  test("a push queued before the subscription moved goes nowhere: the claim finds no target", () => {
    const w = world();
    const endpoint = subscribe(w, w.staff);
    const id = send(w, w.staff, { email: false });
    expect(save(w, w.manager, endpoint)).toBeNull();
    claim(w, createdAt(w, id) + 21n * S);
    expect(delivery(w, id)).toMatchObject({ push: false, runId: "" });
  });
});

describe("dismiss and single read keep their shipped errors", () => {
  test("someone else's id is not found", () => {
    const w = world();
    pref(w, w.staff);
    const id = send(w, w.staff);
    expect(errorOf(() => w.db.run(R.markNotificationRead, w.manager, { notificationId: id }))).toBe("Notification not found");
    expect(errorOf(() => w.db.run(R.dismissNotification, w.manager, { notificationId: id }))).toBe("Notification not found");
    expect(delivery(w, id)).not.toBeNull();
  });
});
