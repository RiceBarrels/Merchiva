// The person-facing notification settings: the "Email me" switch (Settings →
// Notifications on /manager, the /personal settings panel) and special follow
// (特别关注) on the channel's members list, the DM header and the /personal
// directory. Pure rules, the rendered controls, and the wiring that only shows in
// the source: no follow or email switch where the writes would be a shared store
// account's, and the over-cap pages edited on the same lines only.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { followHex, followToggleFor, type FollowToggleInput } from "@/components/channel/follow-rules";
import { FollowButton, type FollowControl } from "@/components/channel/follow";
import { ChannelWorkspaceProvider, type ChannelWorkspaceValue } from "@/components/channel/context";
import { NotificationEmailExplainer, notificationEmailMeta } from "@/components/settings/notification-email";
import type { Person } from "@/lib/chat/model";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const lines = (path: string) => read(path).split("\n").length;

const ME = "a".repeat(64);
const MACHINE = "b".repeat(64);
const PEER = "c".repeat(64);

const base: FollowToggleInput = { targetHex: PEER, selfHexes: [ME], activeMember: true, following: false, enabled: true };

describe("followToggleFor", () => {
  test("an active colleague can be followed, a followed one unfollowed", () => {
    expect(followToggleFor(base)).toBe("follow");
    expect(followToggleFor({ ...base, following: true })).toBe("unfollow");
  });

  test("never yourself, nor the account a store machine writes as", () => {
    expect(followToggleFor({ ...base, targetHex: ME })).toBe("hidden");
    expect(followToggleFor({ ...base, targetHex: MACHINE, selfHexes: [ME, MACHINE] })).toBe("hidden");
    expect(followToggleFor({ ...base, targetHex: `0x${ME.toUpperCase()}`, following: true })).toBe("hidden");
  });

  test("someone who left can only be unfollowed (the module refuses a new follow)", () => {
    expect(followToggleFor({ ...base, activeMember: false })).toBe("hidden");
    expect(followToggleFor({ ...base, activeMember: false, following: true })).toBe("unfollow");
  });

  test("nothing where follows cannot be set, or for a row without an identity", () => {
    expect(followToggleFor({ ...base, enabled: false })).toBe("hidden");
    expect(followToggleFor({ ...base, enabled: false, following: true })).toBe("hidden");
    expect(followToggleFor({ ...base, targetHex: "" })).toBe("hidden");
    expect(followToggleFor({ ...base, targetHex: null })).toBe("hidden");
    expect(followToggleFor({ ...base, selfHexes: [null, undefined, ""] })).toBe("follow");
  });

  test("followHex is the stored form: lowercase, no 0x", () => {
    expect(followHex(` 0X${PEER.toUpperCase()} `)).toBe(PEER);
    expect(followHex(undefined)).toBe("");
  });
});

describe("FollowButton (manager channel)", () => {
  const people = new Map<string, Person>([[PEER, { hex: PEER, name: "Priya", role: "staff", avatarUrl: null }]]);
  const control = (following: boolean, busy = false): FollowControl => ({
    available: true,
    toggleFor: (hex, activeMember, selfHexes) => followToggleFor({ targetHex: hex, selfHexes, activeMember, following, enabled: true }),
    busy: () => busy,
    toggle: () => {},
  });
  const render = (follow: FollowControl | null, hex: string, extra: Record<string, string> = {}) => {
    const value = { people, meHex: ME, accountHex: ME, follow } as unknown as ChannelWorkspaceValue;
    const child: ReactNode = createElement(FollowButton, { hex, name: "Priya", ...extra });
    return renderToStaticMarkup(createElement(ChannelWorkspaceProvider, { value }, child));
  };

  test("hidden for a store machine's operator (no follow control) and for yourself", () => {
    expect(render(null, PEER)).toBe("");
    expect(render(control(false), ME)).toBe("");
  });

  test("a pressed toggle while following, never hidden on hover then", () => {
    const off = render(control(false), PEER, { idleClassName: "opacity-0" });
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain("opacity-0");
    expect(off).toContain("lucide-bell-plus");
    const on = render(control(true), PEER, { idleClassName: "opacity-0" });
    expect(on).toContain('aria-pressed="true"');
    expect(on).not.toContain("opacity-0");
    expect(on).toContain("lucide-bell-ring");
  });

  test("disabled while its write is in flight", () => {
    expect(render(control(false, true), PEER)).toContain("disabled");
  });
});

describe("Email me", () => {
  const t = (key: string) => `<${key}>`;

  test("the meta says where email goes, or that alerts stay in the app", () => {
    expect(notificationEmailMeta(true, "ann@example.com", t)).toBe("<notify.settings.emailTo>");
    expect(notificationEmailMeta(true, "  ", t)).toBe("<notify.settings.emailOn>");
    expect(notificationEmailMeta(true, null, t)).toBe("<notify.settings.emailOn>");
    expect(notificationEmailMeta(false, "ann@example.com", t)).toBe("<notify.settings.emailOff>");
    const fill = (key: string) => (key === "notify.settings.emailTo" ? "Sent to {email}" : key);
    expect(notificationEmailMeta(true, "ann@example.com", fill)).toBe("Sent to ann@example.com");
  });

  test("the explainer adds the owner / manager line only for them", () => {
    const items = (manager: boolean) =>
      renderToStaticMarkup(createElement(NotificationEmailExplainer, { manager })).match(/<li>/g)?.length ?? 0;
    expect(items(false)).toBe(4);
    expect(items(true)).toBe(5);
  });
});

describe("wiring", () => {
  test("Settings → Notifications: email + this device's alerts; the placeholder toggles are gone", () => {
    const panel = read("components/settings/panels/notifications.tsx");
    for (const gone of ["shiftReminders", "lowStockAlerts", "weeklySummary", "beforeShift", "belowThreshold", "performanceDigest"]) {
      expect(panel).not.toContain(gone);
    }
    expect(panel).toContain("useNotificationEmailSwitch()");
    expect(panel).toContain("viewer.shared ?");
    expect(panel).toContain("viewer.personalDevice &&");
    const email = read("components/settings/notification-email.tsx");
    expect(email).toContain("setNotificationEmail(next)");
    expect(email).toContain(".catch(");
    expect(email).toContain(".finally(");
  });

  test("the /personal panel has the switch; the store tablet's settings never do", () => {
    expect(read("components/personal-device/settings-panel.tsx")).toContain("useNotificationEmailSwitch()");
    const store = read("components/store-device/device-settings-panel.tsx");
    expect(store).not.toContain("notification-email");
    expect(store).not.toContain("setNotificationEmail");
  });

  test("the channel offers follows only when there is no store-machine operator", () => {
    const page = (read("components/channel/index.tsx") + read("components/channel/workspace.tsx"));
    expect(page).toContain("useFollowControl(organizationId ?? null, me.operatorRole == null)");
    expect(page).toContain("follow: follow.available ? follow : null");
    expect(read("components/channel/info-panels.tsx")).toContain("<FollowButton");
    expect(read("components/channel/header.tsx")).toMatch(/!isGroup && channel\.peerHex && <FollowButton/);
  });

  test("the open conversation is read when only its notification dot says so (pins, thread replies)", () => {
    const page = (read("components/channel/index.tsx") + read("components/channel/workspace.tsx"));
    expect(page).toContain("useConversationDot(activeId)");
    expect(page).toContain("(unreadHere === 0 && !dotHere) || !attended");
  });

  test("the /personal directory offers follows, never to yourself", () => {
    const dir = read("components/personal-device/directory-panel.tsx");
    expect(dir).toContain("useFollowControl(");
    expect(dir).toContain("id === myMemberId ? hex : null");
  });

  test("over-cap pages only changed in place", () => {
    expect(lines("app/manager/settings/page.tsx")).toBeLessThanOrEqual(2329);
    expect(lines("components/personnel/staffing-full.tsx")).toBeLessThanOrEqual(4718);
    expect(read("app/manager/settings/page.tsx")).toContain('meta={t("settings.notificationsMeta")}');
    const staffing = read("components/personnel/staffing-full.tsx");
    expect(staffing).not.toContain('mobileTitle="Notifications"');
    expect(staffing).toContain('<DynamicUIElementTitle mobileTitle={t("staffing.requests.title")}>');
    expect(staffing).toContain("{ icon: <Inbox ");
    expect(staffing).not.toContain("{ icon: <Bell ");
  });
});
