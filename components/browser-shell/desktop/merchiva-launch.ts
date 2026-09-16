import type { RouteAccess } from "@/lib/browser-shell/types";

/*
 * Where the Mr. Merchiva toolbar button and the omnibox "Ask Mr. Merchiva" action lead
 * (desktop spec §6.1, plan D31). Pure so it is testable without the React tree.
 *
 *   dialog    web: the in-page quick dialog (needs only merchiva.view)
 *   channel   Tauri: the Channel page in a new foreground tab (the in-page dialog ignores the
 *             event there; the OS-global overlay owns the shortcut)
 *   shortcut  Tauri without access to the Channel page (it is gated by `staffing`, or its app is
 *             off): nothing to open in a tab, so the button only points to the OS-global shortcut
 */

export const MERCHIVA_CHANNEL_URL = "/manager/channel";

export type MerchivaLaunch = "dialog" | "channel" | "shortcut";

export function merchivaLaunchMode(native: boolean, channelAccess: RouteAccess): MerchivaLaunch {
  if (!native) return "dialog";
  return channelAccess === "allowed" ? "channel" : "shortcut";
}

export function merchivaShortcutLabel(isMac: boolean): string {
  return isMac ? "⌘⇧M" : "Ctrl+Shift+M";
}
