// Notification dots on the device surfaces (/store, /personal): when the walkie
// counts as on screen, what a device may clear (never a row no device entry
// shows), the retired Notifications app, and the store SOS. The rendered
// placements and the clearing hooks run in a child process
// (./notification-dots.isolated.tsx), because they mock the dot context.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEVICE_PAGER, isDeviceDotTile, latestConversationRowId, looseChatRowIds, walkieOnScreen } from "@/components/device/device-dots";
import { APP_CATALOG } from "@/components/device/app-catalog";
import { APP_ICONS } from "@/components/device/app-icons";
import { sosErrorKey } from "@/components/store-device/sos";
import {
  REQUIRED_DEVICE_APPS,
  RETIRED_DEVICE_APPS,
  deviceAppsFromSettingsRow,
  isDeviceAppInstalled,
  parseDeviceApps,
} from "@/lib/device-apps";
import { buildDotState, idsForQuery, type DotRow } from "@/lib/notifications/dots";
import type { DeviceSurface } from "@/lib/notifications/device-tiles";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const NOW = 1_800_000_000_000;
const ME = "aa".repeat(32);
const ORG = "org-1";
const CONV = "c0ffee00-0000-4000-8000-000000000001";
const CONV2 = "c0ffee00-0000-4000-8000-000000000002";

let seq = 0;
function row(type: string, link: string | null): DotRow {
  seq += 1;
  return { id: `n${seq}`, organizationId: ORG, targetHex: ME, type, link, read: false, createdAtMs: NOW - seq * 1000 };
}

function deviceState(rows: DotRow[], surface: DeviceSurface) {
  return buildDotState({
    rows,
    nowMs: NOW,
    organizationId: ORG,
    selfHex: ME,
    surface,
    canViewTeam: true,
    sections: [],
    deviceTileVisible: () => true,
    merchivaRail: false,
  });
}

describe("walkie on screen", () => {
  const base = { phone: false, page: DEVICE_PAGER.apps, appOpen: false, locked: false, idle: false };

  test("tablet: beside the apps, whatever page the (absent) pager is on", () => {
    expect(walkieOnScreen(base)).toBe(true);
  });

  test("phone: only on the channel page", () => {
    expect(walkieOnScreen({ ...base, phone: true, page: DEVICE_PAGER.channel })).toBe(true);
    expect(walkieOnScreen({ ...base, phone: true, page: DEVICE_PAGER.apps })).toBe(false);
  });

  test("never under an open app, the lock screen or the idle dimmer", () => {
    for (const phone of [false, true]) {
      const on = { ...base, phone, page: DEVICE_PAGER.channel };
      expect(walkieOnScreen({ ...on, appOpen: true })).toBe(false);
      expect(walkieOnScreen({ ...on, locked: true })).toBe(false);
      expect(walkieOnScreen({ ...on, idle: true })).toBe(false);
    }
  });
});

describe("what a device clears", () => {
  test("only Drive, Inventory and Directory are tiles a notification lights", () => {
    for (const id of ["drive", "inventory", "directory"]) expect(isDeviceDotTile(id)).toBe(true);
    for (const id of ["channel", "schedule", "forms", "requests", "merchiva", "settings", "bugs", "", null, undefined, "constructor", "__proto__"]) {
      expect(isDeviceDotTile(id)).toBe(false);
    }
  });

  for (const surface of ["store", "personal"] as const) {
    test(`${surface}: rows no device entry shows are never cleared there`, () => {
      const hidden = [
        row("security", "/manager/personnel/team"),
        row("form_response", "/manager/forms/edit?id=f1&view=responses"),
        row("time_off", "/manager/personnel"),
        row("shift_trade", "/manager/personnel"),
        row("general", "/manager/dashboard?mvsession=s-1"),
        row("order", "/manager/suppliers"),
      ];
      const shown = [
        row("doc_share", "/manager/docs/edit?id=d1"),
        row("inventory_low", "/manager/inventory"),
        row("team", "/manager/personnel/team"),
        row("team", `/manager/channel?c=${CONV}`),
      ];
      const s = deviceState([...hidden, ...shown], surface);
      const hiddenIds = new Set(hidden.map((r) => r.id));
      const cleared = [
        ...["drive", "inventory", "directory", "channel"].flatMap((app) => idsForQuery(s, { app })),
        ...[CONV, CONV2].flatMap((c) => idsForQuery(s, { conversationId: c })),
        latestConversationRowId(s, CONV),
        ...looseChatRowIds(s),
      ];
      expect(cleared.filter((id) => id !== null && hiddenIds.has(id))).toEqual([]);
      // …and each shown row has the entry that clears it.
      expect(idsForQuery(s, { app: "drive" })).toEqual([shown[0].id]);
      expect(idsForQuery(s, { app: "inventory" })).toEqual([shown[1].id]);
      expect(idsForQuery(s, { app: "directory" })).toEqual([shown[2].id]);
      expect(latestConversationRowId(s, CONV)).toBe(shown[3].id);
    });
  }

  test("the walkie's conversation: its newest row, and rows that name no conversation", () => {
    const older = row("team", `/manager/channel?c=${CONV}`);
    const other = row("team", `/manager/channel?c=${CONV2}`);
    const loose = row("team", "/manager/channel");
    const newer = { ...row("team", `/manager/channel?c=${CONV}`), createdAtMs: NOW };
    const s = deviceState([older, other, loose, newer], "personal");
    expect(latestConversationRowId(s, CONV)).toBe(newer.id);
    expect(latestConversationRowId(s, CONV2)).toBe(other.id);
    expect(latestConversationRowId(s, "c0ffee00-0000-4000-8000-00000000ffff")).toBeNull();
    expect(latestConversationRowId(s, null)).toBeNull();
    expect(looseChatRowIds(s)).toEqual([loose.id]);
  });

  test("uncounted rows (a tile this person cannot see) are not the walkie's", () => {
    const s = buildDotState({
      rows: [row("team", `/manager/channel?c=${CONV}`)],
      nowMs: NOW,
      organizationId: ORG,
      selfHex: ME,
      surface: "store",
      canViewTeam: true,
      sections: [],
      deviceTileVisible: (target) => target.kind !== "channel",
      merchivaRail: false,
    });
    expect(latestConversationRowId(s, CONV)).toBeNull();
  });
});

describe("the Notifications app is retired", () => {
  test("no tile, catalog entry, icon mapping, store category or lite app", () => {
    expect(APP_CATALOG.some((app) => app.id === "notifications")).toBe(false);
    expect(APP_CATALOG.some((app) => app.route.startsWith("/manager/notifications"))).toBe(false);
    expect("notifications" in APP_ICONS).toBe(false);
    expect((REQUIRED_DEVICE_APPS as readonly string[]).includes("notifications")).toBe(false);
    expect(read("lib/plugin-store.ts")).not.toMatch(/\bnotifications:/);
    expect(existsSync(join(ROOT, "components/device/apps/notifications.tsx"))).toBe(false);
  });

  test("a stored legacy id is dropped on the read and the write path", () => {
    expect(RETIRED_DEVICE_APPS).toContain("notifications");
    const raw = JSON.stringify(["notifications", "sales", "notifications"]);
    expect(deviceAppsFromSettingsRow({ organizationId: ORG, deviceApps: raw })).toEqual(["sales"]);
    expect(parseDeviceApps(raw)).toEqual(["sales"]);
    // The Drive legacy rule still applies next to it.
    expect(deviceAppsFromSettingsRow({ organizationId: ORG, deviceApps: JSON.stringify(["notifications", "drive"]) })).toEqual(["sheets", "slides"]);
    expect(isDeviceAppInstalled("notifications", deviceAppsFromSettingsRow({ organizationId: ORG, deviceApps: raw }))).toBe(false);
  });
});

describe("store SOS", () => {
  test("the module's refusals map to copy a person can act on", () => {
    expect(sosErrorKey(new Error("An SOS was sent from this store less than 2 minutes ago"))).toBe("storeDevice.sosCooldown");
    expect(sosErrorKey(new Error("This store device is not registered or is turned off"))).toBe("storeDevice.sosUnregistered");
    expect(sosErrorKey(new Error("Not an active member of this organization"))).toBe("storeDevice.sosFailed");
    expect(sosErrorKey(new Error("Not connected"))).toBe("storeDevice.sosFailed");
    expect(sosErrorKey("An SOS was sent from this store less than 2 minutes ago")).toBe("storeDevice.sosCooldown");
    expect(sosErrorKey(undefined)).toBe("storeDevice.sosFailed");
  });

  test("the log-in pane sends it through sendStoreSos with this tablet's device id, never per-manager rows", () => {
    const pane = read("components/store-device/login-pane.tsx");
    expect(pane).toContain("sendStoreSos(deviceId, organizationId)");
    expect(pane).not.toContain("createNotification");
    expect(pane).not.toContain("getConnection");
    expect(pane).toContain("t(sosErrorKey(err))");
  });
});

describe("channel menu rows", () => {
  test("the dot goes before the name and the active-channel marker stays at the end", () => {
    const header = read("components/device/channel-header.tsx");
    const start = header.indexOf("function ChannelMenuRow");
    expect(start).toBeGreaterThan(-1);
    const body = header.slice(start, header.indexOf("\n}\n", start));
    expect(header).toContain("dot={!!dots?.conversations.has(c.id)}");
    const dot = body.indexOf("<NotificationDot show={dot} inline");
    const name = body.indexOf("{channel.name}");
    const marker = body.indexOf('rounded-full bg-foreground" />');
    expect(dot).toBeGreaterThan(-1);
    expect(name).toBeGreaterThan(dot);
    expect(marker).toBeGreaterThan(name);
  });
});

describe("layering", () => {
  test("the device primitives draw dots from props and never read the dot context", () => {
    for (const file of ["apps-grid.tsx", "channel-header.tsx", "pages-track.tsx"]) {
      expect(read(`components/device/${file}`)).not.toContain("@/lib/notifications/dots-context");
    }
  });
});

describe("store mode", () => {
  test("the store screen releases this browser's push subscription", () => {
    expect(read("components/store-device/store-device-screen.tsx")).toContain("useReleaseStorePush(organizationId)");
    expect(read("components/store-device/use-release-push.ts")).toContain("releaseBrowserPush()");
  });

  test("the store settings panel has no email switch and no push prompt", () => {
    const panel = read("components/store-device/device-settings-panel.tsx");
    expect(panel).not.toMatch(/setNotificationEmail|PushNotificationPrompt|usePushNotifications/);
  });
});

test(
  "placements and clearing render as specified (isolated)",
  () => {
    const proc = Bun.spawnSync([process.execPath, "test", "./scripts/tests/device/notification-dots.isolated.tsx"], {
      cwd: ROOT,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
    if (proc.exitCode !== 0) console.error(output);
    expect(proc.exitCode).toBe(0);
    expect(output).toContain(" 0 fail");
    expect(output).toMatch(/\b17 pass\b/);
  },
  60_000,
);
