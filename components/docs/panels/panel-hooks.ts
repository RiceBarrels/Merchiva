"use client";

/** Small hooks shared by the docs side panels (comments, version history). */
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useT } from "@/lib/i18n/context";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";

/** Resolves an `org_member` id to a display name; unknown or removed members get `docs.comments.unknownAuthor`. */
export function useMemberNameResolver(): (memberId: string | null | undefined) => string {
  const t = useT();
  const [members] = useOrgMembers();
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      const name = member.displayName?.trim() || member.email?.trim() || "";
      if (name) map.set(member.id.toString(), name);
    }
    return map;
  }, [members]);
  const unknown = t("docs.comments.unknownAuthor");
  return useCallback((memberId) => (memberId ? names.get(memberId) : undefined) ?? unknown, [names, unknown]);
}

// ── Minute clock (relative times such as "5 minutes ago") ────────────────────

const CLOCK_INTERVAL_MS = 60_000;
let clockNow = Date.now();
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

function notifyClock(): void {
  for (const listener of [...clockListeners]) listener();
}

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockNow = Date.now();
    queueMicrotask(notifyClock);
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      notifyClock();
    }, CLOCK_INTERVAL_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

const readClock = () => clockNow;

/** Current time, refreshed once a minute while any subscriber is mounted. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribeClock, readClock, readClock);
}
