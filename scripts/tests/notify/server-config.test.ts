// The notifications cron's gate (lib/notifications/server/config.ts): it fails
// closed on CRON_SECRET, then on SpacetimeDB service access, then when neither
// channel is configured; the expected WorkOS issuer; and the shared
// constant-time secret compare (lib/cron-auth.ts) the Drive crons use too.

import { describe, expect, test } from "bun:test";
import { sameSecret } from "@/lib/cron-auth";
import {
  NotifyCronError, notifyCronChannels, parseNotifyCronConfig, requireNotifyCron,
} from "@/lib/notifications/server/config";
import { SECRET, cronRequest, testConfig } from "./server-fixture";

const FULL_ENV = {
  CRON_SECRET: SECRET,
  SPACETIMEDB_SERVICE_TOKEN: "service-token",
  NEXT_PUBLIC_SPACETIMEDB_URI: "wss://maincloud.spacetimedb.com",
  NEXT_PUBLIC_SPACETIMEDB_MODULE: "merchiva",
  RESEND_API_KEY: "re_test",
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_01TEST",
};

function statusOf(fn: () => unknown): number {
  try {
    fn();
    return 200;
  } catch (err) {
    return err instanceof NotifyCronError ? err.status : -1;
  }
}

describe("parseNotifyCronConfig", () => {
  test("everything set", () => {
    expect(parseNotifyCronConfig(FULL_ENV)).toEqual({
      cronSecret: SECRET,
      stdbConfigured: true,
      emailConfigured: true,
      expectedIssuer: "https://api.workos.com/user_management/client_01TEST",
    });
  });

  test("each missing piece turns its part off; blanks count as missing", () => {
    expect(parseNotifyCronConfig({ ...FULL_ENV, CRON_SECRET: "  " }).cronSecret).toBeNull();
    for (const name of ["SPACETIMEDB_SERVICE_TOKEN", "NEXT_PUBLIC_SPACETIMEDB_URI", "NEXT_PUBLIC_SPACETIMEDB_MODULE"]) {
      expect(parseNotifyCronConfig({ ...FULL_ENV, [name]: undefined }).stdbConfigured).toBe(false);
    }
    for (const name of ["RESEND_API_KEY", "WORKOS_API_KEY", "WORKOS_CLIENT_ID"]) {
      expect(parseNotifyCronConfig({ ...FULL_ENV, [name]: "" }).emailConfigured).toBe(false);
    }
  });

  test("WORKOS_ISSUER wins; no client id and no issuer means nobody can be emailed", () => {
    expect(parseNotifyCronConfig({ ...FULL_ENV, WORKOS_ISSUER: "https://auth.example.com" }).expectedIssuer)
      .toBe("https://auth.example.com");
    expect(parseNotifyCronConfig({ ...FULL_ENV, WORKOS_CLIENT_ID: undefined }).expectedIssuer).toBe("");
  });
});

describe("requireNotifyCron", () => {
  test("503 without CRON_SECRET, 401 for a missing or wrong bearer, through for the right one", () => {
    expect(statusOf(() => requireNotifyCron(cronRequest(SECRET), null))).toBe(503);
    expect(statusOf(() => requireNotifyCron(cronRequest(null), SECRET))).toBe(401);
    expect(statusOf(() => requireNotifyCron(cronRequest("wrong"), SECRET))).toBe(401);
    expect(statusOf(() => requireNotifyCron(cronRequest(`${SECRET}x`), SECRET))).toBe(401);
    expect(statusOf(() => requireNotifyCron(cronRequest(SECRET.slice(0, -1)), SECRET))).toBe(401);
    expect(statusOf(() => requireNotifyCron(cronRequest(SECRET), SECRET))).toBe(200);
  });
});

describe("notifyCronChannels", () => {
  test("push with VAPID, email with Resend + WorkOS, both, or 503", () => {
    expect(notifyCronChannels(testConfig(), true)).toBe("pe");
    expect(notifyCronChannels(testConfig(), false)).toBe("e");
    expect(notifyCronChannels(testConfig({ emailConfigured: false }), true)).toBe("p");
    expect(statusOf(() => notifyCronChannels(testConfig({ emailConfigured: false }), false))).toBe(503);
    expect(statusOf(() => notifyCronChannels(testConfig({ stdbConfigured: false }), true))).toBe(503);
  });
});

describe("sameSecret", () => {
  test("equal only for the identical string", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abd", "abc")).toBe(false);
    expect(sameSecret("ab", "abc")).toBe(false);
    expect(sameSecret("abcd", "abc")).toBe(false);
    expect(sameSecret("", "abc")).toBe(false);
    expect(sameSecret("é", "é")).toBe(true);
  });
});
