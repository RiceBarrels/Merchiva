// safeAppPath (lib/notifications/safe-link.ts): the one rule for following a
// notification link on the client, and its parity with the module's
// notifySafeAppPath (spacetimedb/src/notify/logic.ts), which applies the same
// rule before a link reaches a push or an email.

import { describe, expect, test } from "bun:test";
import { NOTIFY_DEFAULT_ORIGIN, SAFE_LINK_MAX, notifyAppOrigin, safeAppPath } from "@/lib/notifications/safe-link";
import { notifySafeAppPath } from "../../../spacetimedb/src/notify/logic";

const REFUSED = [
  "//evil.com",
  "/\\evil.com",
  "javascript:alert(1)",
  "https://evil.com",
  "https://www.merchiva.com/manager",
  "/store",
  "/personal",
  "/managerx",
  "manager/channel",
  "/manager//evil.com",
  "/manager/../store",
  "/manager/%2e%2e/store",
  "/manager/./x",
  "/manager/x\u0000",
  "/manager/x\ny",
  "/manager/x\u007f",
  "",
  `/manager/${"a".repeat(SAFE_LINK_MAX)}`,
];

const KEPT: Array<[string, string]> = [
  ["/manager", "/manager"],
  ["/manager/", "/manager/"],
  ["/manager?x=1", "/manager?x=1"],
  ["/manager/channel?c=abc", "/manager/channel?c=abc"],
  ['/manager/x?y="z', "/manager/x?y=%22z"],
  ["/manager/x#frag", "/manager/x"],
  ["/manager/x?", "/manager/x"],
  ["/manager/forms/edit?id=f1&view=responses", "/manager/forms/edit?id=f1&view=responses"],
  ["/manager/docs/edit?id=d1&comment=t1", "/manager/docs/edit?id=d1&comment=t1"],
  ["/manager/dashboard?mvsession=s%201", "/manager/dashboard?mvsession=s%201"],
  ["/manager/a b", "/manager/a%20b"],
  ["/manager/über", "/manager/%C3%BCber"],
  ["/manager/x   ", "/manager/x"],
];

describe("safeAppPath", () => {
  test("refuses anything that is not an in-app /manager path", () => {
    for (const link of REFUSED) expect([link, safeAppPath(link)]).toEqual([link, null]);
  });

  test("refuses non-strings", () => {
    for (const link of [null, undefined, 42, {}, ["/manager"]]) expect(safeAppPath(link)).toBeNull();
  });

  test("keeps /manager paths as pathname + search, hash dropped, encoded like a URL parser", () => {
    for (const [link, want] of KEPT) expect([link, safeAppPath(link)]).toEqual([link, want]);
  });

  test("matches the module's notifySafeAppPath on every case", () => {
    for (const link of [...REFUSED, ...KEPT.map(([l]) => l)]) {
      expect([link, safeAppPath(link)]).toEqual([link, notifySafeAppPath(link)]);
    }
  });

  test("resolves against the production origin unless NEXT_PUBLIC_APP_URL says otherwise", () => {
    const saved = process.env.NEXT_PUBLIC_APP_URL;
    try {
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(notifyAppOrigin()).toBe(NOTIFY_DEFAULT_ORIGIN);
      process.env.NEXT_PUBLIC_APP_URL = "https://staging.example.com/some/path";
      expect(notifyAppOrigin()).toBe("https://staging.example.com");
      expect(safeAppPath("/manager/inventory")).toBe("/manager/inventory");
      process.env.NEXT_PUBLIC_APP_URL = "not a url";
      expect(notifyAppOrigin()).toBe(NOTIFY_DEFAULT_ORIGIN);
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = saved;
    }
  });
});
