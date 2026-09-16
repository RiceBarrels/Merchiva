import { describe, expect, test } from "bun:test";
import {
  MERCHIVA_CHANNEL_URL,
  merchivaLaunchMode,
  merchivaShortcutLabel,
} from "@/components/browser-shell/desktop/merchiva-launch";
import { getRouteAccess } from "@/lib/browser-shell/access";
import type { AccessContext } from "@/lib/browser-shell/types";
import type { Permissions } from "@/lib/types";

function ctx(view: readonly (keyof Permissions)[], isOwner = false): AccessContext {
  const allowed = new Set(view);
  return {
    isOwner,
    can: (section) => isOwner || allowed.has(section),
    installedApps: new Set<string>(),
    appsReady: false,
    appMode: "admin",
    personalMode: false,
    isCapacitor: false,
  };
}

function launchFor(native: boolean, access: AccessContext) {
  return merchivaLaunchMode(native, getRouteAccess(MERCHIVA_CHANNEL_URL, access));
}

describe("merchivaLaunchMode", () => {
  test("web always uses the in-page quick dialog (only merchiva.view is needed)", () => {
    expect(launchFor(false, ctx(["merchiva"]))).toBe("dialog");
    expect(launchFor(false, ctx(["merchiva", "staffing"]))).toBe("dialog");
  });

  test("Tauri opens the Channel page when the user may open it", () => {
    expect(launchFor(true, ctx(["merchiva", "staffing"]))).toBe("channel");
    expect(launchFor(true, ctx([], true))).toBe("channel");
  });

  test("Tauri without Channel access (merchiva.view but no staffing) never opens a forbidden tab", () => {
    expect(getRouteAccess(MERCHIVA_CHANNEL_URL, ctx(["merchiva"]))).toBe("forbidden");
    expect(launchFor(true, ctx(["merchiva"]))).toBe("shortcut");
  });

  test("Tauri with the Channel app turned off falls back to the shortcut hint too", () => {
    expect(merchivaLaunchMode(true, "featureOff")).toBe("shortcut");
  });

  test("shortcut label matches the OS-global overlay binding", () => {
    expect(merchivaShortcutLabel(true)).toBe("⌘⇧M");
    expect(merchivaShortcutLabel(false)).toBe("Ctrl+Shift+M");
  });
});
