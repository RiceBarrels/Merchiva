// Pure notification rules (spacetimedb/src/notify/logic.ts): the safe link
// policy, template params, previews, locales, identity claims, the delivery
// schedule, the queue quotas and the list arguments of the reducers.

import { describe, expect, test } from "bun:test";
import {
  NOTIFY_EMAIL_DAILY_CAP, NOTIFY_EMAIL_DELAY_MICROS, NOTIFY_EMAIL_GAP_MICROS, NOTIFY_EMERGENCY_TEMPLATE,
  NOTIFY_IDS_JSON_MAX_CHARS, NOTIFY_KEEP_MICROS, NOTIFY_LIST_MAX, NOTIFY_PUSH_DELAY_MICROS, NOTIFY_PUSH_TARGETS_MAX,
  NOTIFY_QUOTAS, NOTIFY_SOURCE_KINDS, NOTIFY_TEMPLATES, NOTIFY_TEMPLATE_PARAMS, notifyClaimedWithout, notifyDoneKeepUntil,
  notifyEmailAt, notifyEmailBackoffMicros, notifyEmailNeedsManager, notifyFirstDueAt, notifyIdentityClaims,
  notifyIsLocalized, notifyIsManagerTemplate, notifyIsUrgent, notifyNextDueAt, notifyNormalizeLocale, notifyPacingAfterEmail,
  notifyParamsJson, notifyParseChannels, notifyParseFinish, notifyParseIdList, notifyParseParams, notifyPreview,
  notifyPushAt, notifyPushEndpointOk, notifyPushTargetsJson, notifyQuotaAfter, notifySafeAppPath, notifyUtcDayKey,
} from "@/spacetimedb/src/notify/logic";

const S = 1_000_000n;
const MIN = 60n * S;
const DAY = 24n * 60n * MIN;
/** 2026-10-08T12:00:00Z */
const NOON = 1_791_460_800_000_000n;

describe("notifySafeAppPath", () => {
  test("the spec's cases", () => {
    expect(notifySafeAppPath("//evil.com")).toBeNull();
    expect(notifySafeAppPath("/\\evil.com")).toBeNull();
    expect(notifySafeAppPath("javascript:alert(1)")).toBeNull();
    expect(notifySafeAppPath("https://evil.com")).toBeNull();
    expect(notifySafeAppPath("/store")).toBeNull();
    expect(notifySafeAppPath('/manager/x?y="z')).toBe("/manager/x?y=%22z");
  });

  test("only /manager paths, never a lookalike, a protocol-relative path, a control character or a dot segment", () => {
    expect(notifySafeAppPath("/manager")).toBe("/manager");
    expect(notifySafeAppPath("/manager/channel?c=abc")).toBe("/manager/channel?c=abc");
    expect(notifySafeAppPath("/managerx")).toBeNull();
    expect(notifySafeAppPath("/manager.evil.com")).toBeNull();
    expect(notifySafeAppPath("/manager//evil.com")).toBeNull();
    expect(notifySafeAppPath("/manager/a\nb")).toBeNull();
    expect(notifySafeAppPath("/manager/../store")).toBeNull();
    expect(notifySafeAppPath("/manager/%2e%2e/store")).toBeNull();
    expect(notifySafeAppPath("/manager#x")).toBeNull();
    expect(notifySafeAppPath("")).toBeNull();
    expect(notifySafeAppPath(undefined)).toBeNull();
    expect(notifySafeAppPath("/manager/" + "a".repeat(3000))).toBeNull();
    expect(notifySafeAppPath("/manager/\ud800")).toBeNull();
  });

  test("drops the hash, and encodes exactly as a URL parser would (pathname + search)", () => {
    const viaUrl = (link: string) => {
      const u = new URL(link, "https://www.merchiva.com");
      return u.origin === "https://www.merchiva.com" ? u.pathname + u.search : null;
    };
    const cases = [
      "/manager/docs/edit?id=1&comment=2#frag", "/manager/a b`{}<>\"^|[]~!$&()*+,;=:@", "/manager/é?q=é ü",
      "/manager/x?a=^|[]`{}<>' ", "/manager?", "/manager/channel?c=8f1d", "/manager/a%2Fb?x=%20",
      "/manager/drive/sheet?id=abc&view=responses",
    ];
    for (const link of cases) expect(notifySafeAppPath(link)).toBe(viaUrl(link));
  });
});

describe("templates", () => {
  test("the module's list is the spec's, each with its params, and `custom` alone uses none", () => {
    expect([...NOTIFY_TEMPLATES].sort()).toEqual([
      "alert.emergency", "chat.follow", "chat.mention", "chat.merchiva", "chat.message", "chat.pin", "custom",
      "doc.comment", "doc.reply", "doc.shared", "form.response", "inventory.low", "inventory.waste",
      "security.manyWrongPins", "security.pinLocked", "security.pinUnlocked", "shift.open", "shift.requested",
      "supplier.issue", "supplier.order", "team.joined", "timeOff.approved", "timeOff.denied", "timeOff.requested",
      "timeOff.updated",
    ]);
    for (const template of NOTIFY_TEMPLATES) {
      const params = NOTIFY_TEMPLATE_PARAMS[template];
      for (const p of params) expect(p).toMatch(/^[A-Za-z]\w*$/);
      expect(params).not.toContain("store");
      if (template !== "custom") expect(params.length).toBeGreaterThan(0);
    }
    expect(NOTIFY_TEMPLATE_PARAMS.custom).toEqual([]);
  });

  test("only chat.message, chat.merchiva and custom need no localization", () => {
    expect(NOTIFY_TEMPLATES.filter((t) => !notifyIsLocalized(t))).toEqual(["chat.message", "chat.merchiva", "custom"]);
  });

  test("manager-only templates, and the low-stock email rule", () => {
    const managerOnly = NOTIFY_TEMPLATES.filter(notifyIsManagerTemplate);
    expect(managerOnly).toEqual([
      "timeOff.requested", "supplier.order", "supplier.issue", "security.pinLocked", "security.manyWrongPins",
      "security.pinUnlocked", "alert.emergency",
    ]);
    expect(notifyEmailNeedsManager("inventory.low", "inventory")).toBe(true);
    expect(notifyEmailNeedsManager("custom", "inventory")).toBe(true);
    expect(notifyEmailNeedsManager("doc.shared", "doc")).toBe(false);
    expect(NOTIFY_SOURCE_KINDS).toContain("chat_pin");
  });
});

describe("params and previews", () => {
  test("plain strings under fmt keys, clamped, with store always the org's name", () => {
    const json = notifyParamsJson({ actor: "Ann", store: "spoofed", __proto__x: "x", "bad key": "y", n: 5 as unknown as string, long: "z".repeat(900) }, "Bakery");
    const parsed = JSON.parse(json);
    expect(parsed.actor).toBe("Ann");
    expect(parsed.store).toBe("Bakery");
    expect(parsed["bad key"]).toBeUndefined();
    expect(parsed.n).toBeUndefined();
    expect(parsed.long).toHaveLength(500);
    expect(notifyParseParams(json)).toEqual(parsed);
    expect(notifyParseParams("not json")).toEqual({});
    expect(notifyParseParams("[1]")).toEqual({});
  });

  test("previews keep 140 chars; a file without text is [attachment]", () => {
    expect(notifyPreview("x".repeat(200), false)).toBe("x".repeat(137) + "...");
    expect(notifyPreview("hi", true)).toBe("hi");
    expect(notifyPreview("", true)).toBe("[attachment]");
  });
});

describe("preferences", () => {
  test("locales: the 8 app locales, case and _ forgiven, else ''", () => {
    expect(notifyNormalizeLocale("zh_CN")).toBe("zh-cn");
    expect(notifyNormalizeLocale(" ar ")).toBe("ar");
    expect(notifyNormalizeLocale("de")).toBe("");
    expect(notifyNormalizeLocale(42)).toBe("");
  });

  test("identity claims come only from a JWT with a WorkOS user id and a printable issuer", () => {
    const auth = (jwt: unknown, hasJWT = true) => () => ({ hasJWT, jwt });
    const iss = "https://api.workos.com/user_management/client_123";
    expect(notifyIdentityClaims(auth({ subject: "user_01ABC", issuer: iss }))).toEqual({ subject: "user_01ABC", issuer: iss });
    expect(notifyIdentityClaims(auth({ subject: "user_01ABC", issuer: iss }, false))).toBeNull();
    expect(notifyIdentityClaims(auth({ subject: "admin", issuer: iss }))).toBeNull();
    expect(notifyIdentityClaims(auth({ subject: "user_" + "a".repeat(80), issuer: iss }))).toBeNull();
    expect(notifyIdentityClaims(auth({ subject: "user_1", issuer: "with space" }))).toBeNull();
    expect(notifyIdentityClaims(auth({ subject: "user_1", issuer: 7 }))).toBeNull();
    expect(notifyIdentityClaims(auth(null))).toBeNull();
    expect(notifyIdentityClaims(() => { throw new Error("no auth"); })).toBeNull();
    const throwing = { hasJWT: true, get jwt() { throw new Error("bad token"); } };
    expect(notifyIdentityClaims(() => throwing)).toBeNull();
  });
});

describe("push targets", () => {
  test("https endpoints only, distinct, at most 10; '' when none", () => {
    expect(notifyPushEndpointOk("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(notifyPushEndpointOk("http://fcm.googleapis.com/x")).toBe(false);
    expect(notifyPushEndpointOk("https://a b")).toBe(false);
    expect(notifyPushEndpointOk("https://" + "a".repeat(1000))).toBe(false);
    const sub = (i: number) => ({ endpoint: `https://push.example/${i}`, p256dh: "k", auth: "a" });
    const many = [...Array.from({ length: 12 }, (_, i) => sub(i)), sub(0), { endpoint: "http://x", p256dh: "", auth: "" }];
    expect(JSON.parse(notifyPushTargetsJson(many))).toHaveLength(NOTIFY_PUSH_TARGETS_MAX);
    expect(notifyPushTargetsJson([{ endpoint: "http://x", p256dh: "", auth: "" }])).toBe("");
  });
});

describe("schedule", () => {
  test("push after 20 s, email after 60 s; the emergency at once", () => {
    expect(notifyPushAt("chat.message", NOON)).toBe(NOON + NOTIFY_PUSH_DELAY_MICROS);
    expect(notifyEmailAt("doc.shared", NOON, null, NOON)).toBe(NOON + NOTIFY_EMAIL_DELAY_MICROS);
    expect(notifyFirstDueAt("doc.shared", NOON, true)).toBe(NOON + 20n * S);
    expect(notifyFirstDueAt("doc.shared", NOON, false)).toBe(NOON + 60n * S);
    expect(notifyPushAt(NOTIFY_EMERGENCY_TEMPLATE, NOON)).toBe(NOON);
    expect(notifyFirstDueAt(NOTIFY_EMERGENCY_TEMPLATE, NOON, false)).toBe(NOON);
  });

  test("the email gap and the daily cap; the emergency ignores both", () => {
    const recent = { lastEmailAtMicros: NOON, dayKey: notifyUtcDayKey(NOON), dayCount: 3 };
    expect(notifyEmailAt("doc.shared", NOON, recent, NOON + MIN)).toBe(NOON + NOTIFY_EMAIL_GAP_MICROS);
    const capped = { ...recent, dayCount: NOTIFY_EMAIL_DAILY_CAP };
    const midnight = (NOON / DAY + 1n) * DAY;
    expect(notifyEmailAt("doc.shared", NOON, capped, NOON + MIN)).toBe(midnight);
    // Yesterday's count does not cap today.
    expect(notifyEmailAt("doc.shared", NOON, { ...capped, lastEmailAtMicros: NOON - DAY, dayKey: notifyUtcDayKey(NOON - DAY) }, NOON)).toBe(NOON + 60n * S);
    expect(notifyEmailAt(NOTIFY_EMERGENCY_TEMPLATE, NOON, capped, NOON + MIN)).toBe(NOON);
  });

  test("pacing counts per UTC day", () => {
    expect(notifyUtcDayKey(NOON)).toBe("2026-10-08");
    const first = notifyPacingAfterEmail(null, NOON);
    expect(first).toEqual({ lastEmailAtMicros: NOON, dayKey: "2026-10-08", dayCount: 1 });
    expect(notifyPacingAfterEmail(first, NOON + MIN).dayCount).toBe(2);
    expect(notifyPacingAfterEmail(first, NOON + DAY).dayCount).toBe(1);
  });

  test("backoff 2 / 10 / 30 minutes", () => {
    expect(notifyEmailBackoffMicros(1)).toBe(2n * MIN);
    expect(notifyEmailBackoffMicros(2)).toBe(10n * MIN);
    expect(notifyEmailBackoffMicros(3)).toBe(30n * MIN);
    expect(notifyEmailBackoffMicros(9)).toBe(30n * MIN);
  });

  test("next due: the earliest owed channel; one the run cannot serve comes back in a minute; always after now", () => {
    const row = { template: "doc.shared", createdAtMicros: NOON, push: true, email: true };
    const both = { push: true, email: true };
    expect(notifyNextDueAt(row, null, NOON, both)).toBe(NOON + 20n * S);
    expect(notifyNextDueAt({ ...row, push: false }, null, NOON, both)).toBe(NOON + 60n * S);
    expect(notifyNextDueAt({ ...row, push: false }, null, NOON, { push: true, email: false })).toBe(NOON + 60n * S);
    expect(notifyNextDueAt(row, null, NOON + DAY, both)).toBe(NOON + DAY + 1n);
  });

  test("the done rule: unlocalized templates go, localized ones stay 7 days from creation", () => {
    expect(notifyDoneKeepUntil("chat.message", NOON, NOON)).toBeNull();
    expect(notifyDoneKeepUntil("custom", NOON, NOON)).toBeNull();
    expect(notifyDoneKeepUntil("doc.shared", NOON, NOON + MIN)).toBe(NOON + NOTIFY_KEEP_MICROS);
    expect(notifyDoneKeepUntil("doc.shared", NOON, NOON + NOTIFY_KEEP_MICROS)).toBeNull();
  });
});

describe("queue quotas", () => {
  test("a window allows `max` uses, then refuses; the next window starts again", () => {
    let q = notifyQuotaAfter("org", null, NOON);
    expect(q).toEqual({ windowKey: NOON / MIN, count: 1 });
    for (let i = 1; i < NOTIFY_QUOTAS.org.max; i++) q = notifyQuotaAfter("org", q, NOON + BigInt(i));
    expect(q?.count).toBe(120);
    expect(notifyQuotaAfter("org", q, NOON + 59n * S)).toBeNull();
    expect(notifyQuotaAfter("org", q, NOON + MIN)).toEqual({ windowKey: NOON / MIN + 1n, count: 1 });
    expect(notifyQuotaAfter("push", { windowKey: NOON / MIN, count: 20 }, NOON)).toBeNull();
    expect(notifyQuotaAfter("email", { windowKey: NOON / (60n * MIN), count: 59 }, NOON + 30n * MIN)?.count).toBe(60);
  });

  test("the SOS is urgent: the new template, or an older tablet's device emergency", () => {
    expect(notifyIsUrgent(NOTIFY_EMERGENCY_TEMPLATE, "emergency", "device")).toBe(true);
    expect(notifyIsUrgent("custom", "emergency", "device")).toBe(true);
    expect(notifyIsUrgent("custom", "emergency", "")).toBe(false);
    expect(notifyIsUrgent("security.pinLocked", "security", "device")).toBe(false);
  });
});

describe("arguments", () => {
  test("channels ⊆ 'pe'", () => {
    expect(notifyParseChannels("pe")).toEqual({ push: true, email: true });
    expect(notifyParseChannels("e")).toEqual({ push: false, email: true });
    expect(notifyParseChannels("")).toEqual({ push: false, email: false });
    expect(notifyParseChannels("px")).toBeNull();
    expect(notifyParseChannels("pp")).toBeNull();
  });

  test("id lists: length checked before parsing, ≤ 500 ids, non-strings skipped, duplicates merged", () => {
    expect(notifyParseIdList('["a","a",3,"b"]')).toEqual(["a", "b"]);
    expect(notifyParseIdList("{")).toBeNull();
    expect(notifyParseIdList('{"a":1}')).toBeNull();
    expect(notifyParseIdList(JSON.stringify(Array.from({ length: NOTIFY_LIST_MAX + 1 }, (_, i) => `${i}`)))).toBeNull();
    expect(notifyParseIdList("[" + " ".repeat(NOTIFY_IDS_JSON_MAX_CHARS) + "]")).toBeNull();
  });

  test("finish results: every list optional, malformed lists refused, expired pairs filtered", () => {
    expect(notifyParseFinish("{}")).toEqual({ pushed: [], emailed: [], emailRetry: [], emailFailed: [], emailDropped: [], expired: [] });
    const r = notifyParseFinish(JSON.stringify({ pushed: ["a", 1, "a"], expired: [["a", "https://x"], ["b"], "c"] }));
    expect(r?.pushed).toEqual(["a"]);
    expect(r?.expired).toEqual([["a", "https://x"]]);
    expect(notifyParseFinish(JSON.stringify({ emailed: "a" }))).toBeNull();
    expect(notifyParseFinish("[]")).toBeNull();
    expect(notifyParseFinish(JSON.stringify({ emailed: Array.from({ length: 501 }, () => "x") }))).toBeNull();
  });

  test("claimed without a channel", () => {
    expect(notifyClaimedWithout("pe", "p")).toBe("e");
    expect(notifyClaimedWithout("pe", "e")).toBe("p");
    expect(notifyClaimedWithout("e", "e")).toBe("");
  });
});
