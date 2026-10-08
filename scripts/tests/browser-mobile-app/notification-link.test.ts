import { describe, expect, test } from "bun:test";
import { notificationTarget } from "@/lib/browser-shell/mobile-app/notification-link";

const BASE = "https://app.merchiva.test/manager/inventory";

describe("notification links from the phone drawer", () => {
  test("a page of the app opens in the shell", () => {
    expect(notificationTarget("/manager/personnel/schedule", BASE)).toEqual({ kind: "page", url: "/manager/personnel/schedule" });
    expect(notificationTarget("https://app.merchiva.test/manager/docs", BASE)).toEqual({ kind: "page", url: "/manager/docs" });
  });

  test("another http(s) URL loads in the window", () => {
    expect(notificationTarget("https://example.com/a?b=1", BASE)).toEqual({ kind: "window", href: "https://example.com/a?b=1" });
    expect(notificationTarget("/login", BASE)).toEqual({ kind: "window", href: "https://app.merchiva.test/login" });
  });

  test("script and data URLs, and garbage, go nowhere", () => {
    expect(notificationTarget("javascript:alert(1)", BASE)).toBeNull();
    expect(notificationTarget(" JavaScript:alert(1)", BASE)).toBeNull();
    expect(notificationTarget("data:text/html,<script>alert(1)</script>", BASE)).toBeNull();
    expect(notificationTarget("http://[bad", BASE)).toBeNull();
  });
});
