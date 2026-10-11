// Notification dots on the device surfaces (/store, /personal), the pure part:
// when the walkie counts as on screen, and which rows the walkie or an open tile
// stands for. The hooks are in ./use-device-dots.ts; the dot state itself is
// lib/notifications/dots.ts.

import { DEVICE_DOT_TILE_PERMISSION, type DeviceDotTile } from "@/lib/notifications/device-tiles";
import type { DotState } from "@/lib/notifications/dots";

/** The pager's pages, in PagesTrack order on both surfaces: the walkie, then the apps. */
export const DEVICE_PAGER = { channel: 0, apps: 1 } as const;

export interface WalkieScreen {
  /** Phone layout: the walkie and the apps are pages of one pager. */
  readonly phone: boolean;
  /** The pager page on screen (phone only). */
  readonly page: number;
  /** A mini app covers the whole screen. */
  readonly appOpen: boolean;
  /** The lock screen is up. */
  readonly locked: boolean;
  /** The idle dimmer is running down to a lock or a log-out. */
  readonly idle: boolean;
}

/** Whether the walkie's active conversation is on screen (the page being visible is checked apart). */
export function walkieOnScreen(screen: WalkieScreen): boolean {
  if (screen.locked || screen.idle || screen.appOpen) return false;
  return !screen.phone || screen.page === DEVICE_PAGER.channel;
}

/** Whether `appId` is a tile a notification can light (Drive, Inventory, Directory). */
export function isDeviceDotTile(appId: string | null | undefined): appId is DeviceDotTile {
  return typeof appId === "string" && Object.prototype.hasOwnProperty.call(DEVICE_DOT_TILE_PERMISSION, appId);
}

/**
 * The newest counted row of one conversation, or null. The walkie marks the
 * conversation read again whenever this changes, so a message that lands while
 * an earlier mark is still on its way is not left behind.
 */
export function latestConversationRowId(state: DotState, conversationId: string | null | undefined): string | null {
  if (!conversationId) return null;
  const entry = state.entries.find(
    (e) => e.counted && e.feature.kind === "chat" && e.feature.conversationId === conversationId,
  );
  return entry ? entry.id : null;
}

/**
 * Counted chat rows that name no conversation (a link to the bare channel page).
 * No conversation's mark-read reaches them, so the walkie being on screen reads them.
 */
export function looseChatRowIds(state: DotState): string[] {
  return state.entries
    .filter((e) => e.counted && e.feature.kind === "chat" && !e.feature.conversationId)
    .map((e) => e.id);
}
