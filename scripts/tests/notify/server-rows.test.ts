// Reading a cron run's leased rows back from `/sql`
// (lib/notifications/server/rows.ts): the run-id query, column decoding, the
// claimed channels, and which push endpoints the cron will ever call.

import { describe, expect, test } from "bun:test";
import {
  notifyClaimedQuery, notifyClaimedRows, notifyIdentityKey, notifyPushEndpointAllowed, notifyPushTargets,
  notifyTimestampMs,
} from "@/lib/notifications/server/rows";
import { NOW, RUN_ID, hexOf, sqlRow, sub } from "./server-fixture";

describe("notifyClaimedQuery", () => {
  test("selects the run's rows by run_id", () => {
    expect(notifyClaimedQuery(RUN_ID)).toBe(`SELECT * FROM notification_delivery WHERE run_id = '${RUN_ID}'`);
  });

  test("refuses anything but a lowercase uuid (it goes into SQL)", () => {
    for (const bad of ["", "x' OR '1'='1", RUN_ID.toUpperCase(), `${RUN_ID}'`, "0f8fad5b-d9cb-469f-a165-70867728950"]) {
      expect(() => notifyClaimedQuery(bad)).toThrow();
    }
  });
});

describe("notifyClaimedRows", () => {
  test("decodes the columns", () => {
    const [row] = notifyClaimedRows([sqlRow({
      id: "n1", target: 7, claimed: "pe", template: "doc.comment", params: { actor: "Ana", doc: "Plan", store: "Shop" },
      pushTargets: [sub(1)], subject: "user_7", locale: "zh-tw", attempts: 2, createdAtMs: NOW - 5000,
    })]);
    expect(row).toEqual({
      notificationId: "n1",
      organizationId: "org-1",
      target: hexOf(7),
      push: true,
      email: true,
      template: "doc.comment",
      paramsJson: JSON.stringify({ actor: "Ana", doc: "Plan", store: "Shop" }),
      params: { actor: "Ana", doc: "Plan", store: "Shop" },
      title: "Ana",
      body: "Hi there",
      link: "/manager/channel?c=c1",
      pushTargets: [sub(1)],
      subject: "user_7",
      issuer: "https://api.workos.com/user_management/client_01TEST",
      locale: "zh-tw",
      attempts: 2,
      createdAtMs: NOW - 5000,
    });
  });

  test("one row per notification id; rows holding no channel are skipped", () => {
    const rows = notifyClaimedRows([sqlRow({ id: "a" }), sqlRow({ id: "a" }), sqlRow({ id: "b", claimed: "" })]);
    expect(rows.map((r) => r.notificationId)).toEqual(["a"]);
  });

  test("a push-only row carries no subject or issuer; an email-only row no push targets", () => {
    const [pushOnly] = notifyClaimedRows([sqlRow({ id: "a", claimed: "p", pushTargets: [sub(1)] })]);
    expect(pushOnly.subject).toBe("");
    expect(pushOnly.issuer).toBe("");
    const [emailOnly] = notifyClaimedRows([sqlRow({ id: "b", claimed: "e", pushTargets: [sub(1)] })]);
    expect(emailOnly.pushTargets).toEqual([]);
  });

  test("unreadable params and push targets read as empty", () => {
    const [row] = notifyClaimedRows([{ ...sqlRow({ id: "a", claimed: "pe" }), params: "{oops", push_targets: "nope" }]);
    expect(row.params).toEqual({});
    expect(row.pushTargets).toEqual([]);
  });
});

describe("column decoders", () => {
  test("identity: array, string or object form, as lowercase hex", () => {
    const hex = "AB".repeat(32);
    expect(notifyIdentityKey([`0x${hex}`])).toBe(hex.toLowerCase());
    expect(notifyIdentityKey(`0x${hex}`)).toBe(hex.toLowerCase());
    expect(notifyIdentityKey({ __identity__: `0x${hex}` })).toBe(hex.toLowerCase());
    expect(notifyIdentityKey(hex)).toBe(hex.toLowerCase());
    expect(notifyIdentityKey([12])).toBe("[12]");
  });

  test("timestamp: [micros], the object form or a number", () => {
    expect(notifyTimestampMs([NOW * 1000])).toBe(NOW);
    expect(notifyTimestampMs({ __timestamp_micros_since_unix_epoch__: NOW * 1000 })).toBe(NOW);
    expect(notifyTimestampMs(NOW * 1000)).toBe(NOW);
    expect(notifyTimestampMs("garbage")).toBe(0);
  });
});

describe("push endpoints", () => {
  test("only browser push services over https", () => {
    expect(notifyPushEndpointAllowed("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(notifyPushEndpointAllowed("https://web.push.apple.com/QGx")).toBe(true);
    expect(notifyPushEndpointAllowed("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(notifyPushEndpointAllowed("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(notifyPushEndpointAllowed("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(notifyPushEndpointAllowed("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(notifyPushEndpointAllowed("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(notifyPushEndpointAllowed("https://evil.com/fcm.googleapis.com")).toBe(false);
    expect(notifyPushEndpointAllowed("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(notifyPushEndpointAllowed("https://push.services.mozilla.com.evil.com/x")).toBe(false);
    expect(notifyPushEndpointAllowed("https://evilpush.services.mozilla.com/x")).toBe(false);
    expect(notifyPushEndpointAllowed("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(notifyPushEndpointAllowed(`https://fcm.googleapis.com/${"x".repeat(1000)}`)).toBe(false);
    expect(notifyPushEndpointAllowed("not a url")).toBe(false);
  });

  test("the push_targets column keeps allowed, complete subscriptions once each", () => {
    const json = JSON.stringify([
      sub(1), sub(1), sub(2, "evil.example.com"), { endpoint: sub(3).endpoint, p256dh: "", auth: "a" },
      { endpoint: 5 }, null, sub(4, "web.push.apple.com"),
    ]);
    expect(notifyPushTargets(json)).toEqual([sub(1), sub(4, "web.push.apple.com")]);
    expect(notifyPushTargets("")).toEqual([]);
    expect(notifyPushTargets("{}")).toEqual([]);
  });
});
