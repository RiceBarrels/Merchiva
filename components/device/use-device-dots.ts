"use client";

// Notification dots on the device surfaces (/store, /personal): which tiles,
// conversations and pager pages have one, and clearing. Whether a dot shows
// comes from lib/notifications/dots-context.tsx; the screens pass it down to
// the primitives that draw it (./apps-grid.tsx, ./channel-header.tsx,
// ./pages-track.tsx), which never read the dot context themselves.
//
// A device clears two kinds of rows, and only while someone is at the page
// (lib/notifications/attention.ts):
//   - a tile's (Drive, Inventory, Directory) when its mini app opens, on the
//     landing view that lists them. A row that lands while the app is open keeps
//     its dot, alert and email until the tile is opened again;
//   - a conversation's while the walkie shows it: useMarkConversationRead
//     (markChatRead, which also marks that conversation's notification rows read
//     in the module).
// Rows no device entry shows (security, forms, schedule, Mr. Merchiva) are never
// cleared here: they stay unread for /manager. On a store tablet whose PIN
// operator is not its account nothing clears and no dot shows.

import { useEffect, useMemo, useRef } from "react";
import { DOT_FILTERS } from "@/lib/notifications/dots";
import { useAnyDot, useDocumentAttended, useMarkConversationRead, useMarkDotRead, useNotificationDots } from "@/lib/notifications/dots-context";
import type { ChannelDots } from "./channel-header";
import { DEVICE_PAGER, isDeviceDotTile, latestConversationRowId, looseChatRowIds } from "./device-dots";

/** App ids whose tile has something new (AppsGrid `dots`): Drive, Inventory, Directory. */
export function useDeviceTileDots(): ReadonlySet<string> {
  const { state } = useNotificationDots();
  return useMemo(() => {
    const ids = new Set<string>();
    for (const entry of state.entries) {
      if (entry.counted && DOT_FILTERS.deviceTiles(entry) && entry.app) ids.add(entry.app);
    }
    return ids;
  }, [state]);
}

/** The channel chip's and menu rows' dots (ChannelHeader `dots`). */
export function useDeviceChatDots(): ChannelDots {
  const { state } = useNotificationDots();
  return useMemo(() => {
    const conversations = new Set<string>();
    let any = false;
    for (const entry of state.entries) {
      if (!entry.counted || !DOT_FILTERS.chat(entry)) continue;
      any = true;
      if (entry.feature.conversationId) conversations.add(entry.feature.conversationId);
    }
    return { any, conversations };
  }, [state]);
}

/** Per pager page (PagesTrack `dots`): whether it has something new — the walkie's chats, the apps' tiles. */
export function useDevicePagerDots(): readonly boolean[] {
  const chat = useAnyDot(DOT_FILTERS.chat);
  const tiles = useAnyDot(DOT_FILTERS.deviceTiles);
  return useMemo(() => {
    const dots = [false, false];
    dots[DEVICE_PAGER.channel] = chat;
    dots[DEVICE_PAGER.apps] = tiles;
    return dots;
  }, [chat, tiles]);
}

/**
 * Marks the open mini app's rows read, once per open: it opens on its landing view,
 * which lists them. A row that lands while it is open stays unread (the app may be on
 * one file by then), so it keeps its alert, email and tile dot. Only tiles a
 * notification can light count; any other app (and none) does nothing.
 */
export function useOpenAppDotClearing(appId: string | null): void {
  const tile = isDeviceDotTile(appId) ? appId : null;
  const markDotRead = useMarkDotRead();
  const attended = useDocumentAttended();
  // The tile this open has read; someone coming back to the page does not read it again.
  const cleared = useRef<string | null>(null);
  useEffect(() => {
    if (!tile) cleared.current = null;
    if (!tile || !attended || cleared.current === tile) return;
    cleared.current = tile;
    markDotRead({ app: tile });
  }, [tile, attended, markDotRead]);
}

/**
 * Marks the walkie's active conversation read while it is on screen (see
 * walkieOnScreen) and someone is at the page, whenever a new row for it lands.
 * Chat rows that name no conversation are read with it.
 */
export function useWalkieChatRead(conversationId: string | null, onScreen: boolean): void {
  const { state, viewer, markRead } = useNotificationDots();
  const markConversationRead = useMarkConversationRead();
  const attended = useDocumentAttended();
  // markChatRead acts as the connection identity: only where the dots are this person's.
  const active = viewer.dotsVisible && onScreen && attended;
  const latest = useMemo(() => latestConversationRowId(state, conversationId), [state, conversationId]);
  const loose = useMemo(() => looseChatRowIds(state), [state]);

  useEffect(() => {
    if (active && conversationId && latest) markConversationRead(conversationId);
  }, [active, conversationId, latest, markConversationRead]);

  useEffect(() => {
    if (active && loose.length > 0) markRead(loose);
  }, [active, loose, markRead]);
}
