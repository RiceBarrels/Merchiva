"use client";

// The caller's own notification settings: the "Email me" switch (notification_pref)
// and the people they follow (特别关注, chat_follow). Both tables are RLS
// self-scoped, so every row here is the caller's. Writes:
// lib/spacetimedb/actions/notifications.ts (setNotificationEmail, setChatFollow).
//
// `available` is false until the module's notification tables answer (a module that
// predates them never does): hide or disable the switches then, they would only fail.

import { useMemo } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { useChatFollows, useNotificationPrefs } from "@/lib/spacetimedb/hooks";

export interface NotificationPrefState {
  /** Email is on unless the person turned it off (no row = on). */
  readonly emailEnabled: boolean;
  /** The language emails are written in, '' = English (kept in sync with the UI by the app). */
  readonly locale: string;
  readonly available: boolean;
}

export function useNotificationPref(): NotificationPrefState {
  const stdb = useSpacetimeDB();
  const [rows, ready] = useNotificationPrefs();
  const me = stdb?.identity ? stdb.identity.toHexString() : null;
  return useMemo(() => {
    const row = me ? rows.find((r) => r.userId.toHexString() === me) : undefined;
    return { emailEnabled: row ? row.emailEnabled : true, locale: row?.locale ?? "", available: ready && me !== null };
  }, [rows, ready, me]);
}

export interface ChatFollowState {
  /** Identity hexes (lowercase) the caller follows in this store. */
  readonly following: ReadonlySet<string>;
  readonly isFollowing: (targetHex: string) => boolean;
  readonly available: boolean;
}

/** Who the caller follows in `organizationId`. */
export function useChatFollowSet(organizationId: string | null): ChatFollowState {
  const [rows, ready] = useChatFollows();
  return useMemo(() => {
    const following = new Set(
      rows.filter((r) => r.organizationId === organizationId).map((r) => r.targetHex.toLowerCase()),
    );
    const isFollowing = (targetHex: string) => following.has(targetHex.replace(/^0x/i, "").toLowerCase());
    return { following, isFollowing, available: ready && !!organizationId };
  }, [rows, ready, organizationId]);
}
