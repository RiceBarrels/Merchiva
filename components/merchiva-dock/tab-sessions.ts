"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTabsSnapshot } from "@/lib/browser-shell";

/*
 * Every browser-shell tab has its own Mr. Merchiva: one ai_chat_session per tab, so one tab can
 * plan the schedule while the next does something else entirely. The tab → session binding is
 * kept per user and store in localStorage, next to the persisted tabs themselves (tab ids survive
 * reloads, and reopening a closed tab usually restores its id), so a tab gets its conversation
 * back after a reload. Outside the browser shell (the legacy shell has no tabs) there is one
 * Merchiva, on the user's most recent session when it opens, as before; it then stays there, since
 * every save (from any device or tab) moves some session to the top.
 *
 * A tab asks for a session only when its first message goes out, so tabs where Merchiva was merely
 * looked at leave no empty rows behind. `createAiChatSession` cannot return the new row's id, so
 * the tab records which sessions already existed, asks for one, and claims the first new row that
 * shows up.
 */

export interface SessionRef {
  readonly id: string;
  readonly archived: boolean;
  /** Microseconds; orders new rows between tabs that asked at the same time. */
  readonly createdAt: number;
}

export type TabSessionMap = Readonly<Record<string, string>>;

export type SessionDecision =
  | { readonly kind: "use"; readonly id: string; readonly bind: boolean }
  | { readonly kind: "create" };

/**
 * Which session a Merchiva shows. `sessions` is the user's sessions in this store, most recently
 * updated first; `tabId` is null outside the browser shell, where `current` (the session it shows
 * now) is kept until it is archived: following the latest would pull the chat into another device's
 * or tab's conversation, and have both overwrite it.
 */
export function resolveSession(
  tabId: string | null,
  sessions: readonly SessionRef[],
  map: TabSessionMap,
  current: string | null = null,
): SessionDecision {
  const latest = sessions.find((s) => !s.archived) ?? sessions[0];
  if (tabId === null) {
    const kept = current ? sessions.find((s) => s.id === current && !s.archived) : undefined;
    const shown = kept ?? latest;
    return shown ? { kind: "use", id: shown.id, bind: false } : { kind: "create" };
  }
  const bound = map[tabId];
  if (bound && sessions.some((s) => s.id === bound)) return { kind: "use", id: bound, bind: false };
  // The first tab to open Merchiva after per-tab sessions shipped adopts the conversation the user
  // already had; every tab after that starts fresh.
  if (latest && Object.keys(map).length === 0) return { kind: "use", id: latest.id, bind: true };
  return { kind: "create" };
}

export interface PendingSession {
  readonly tabId: string;
  /** Session ids that existed when the tab asked for its own. */
  readonly known: ReadonlySet<string>;
}

/** Hands new sessions to the tabs waiting for one, oldest request first. */
export function claimNewSessions(
  pending: readonly PendingSession[],
  sessions: readonly SessionRef[],
  map: TabSessionMap,
): Array<{ tabId: string; sessionId: string }> {
  const taken = new Set(Object.values(map));
  const byAge = [...sessions].sort((a, b) => a.createdAt - b.createdAt);
  const claims: Array<{ tabId: string; sessionId: string }> = [];
  for (const request of pending) {
    const fresh = byAge.find((s) => !request.known.has(s.id) && !taken.has(s.id));
    if (!fresh) break;
    taken.add(fresh.id);
    claims.push({ tabId: request.tabId, sessionId: fresh.id });
  }
  return claims;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "merchiva_tab_sessions:v1:";
/** Bindings kept per user and store; the oldest go first. */
const MAX_BINDINGS = 100;

/** tabId → [sessionId, bound at ms] */
type Bindings = Record<string, [string, number]>;

const listeners = new Set<() => void>();
const EMPTY_MAP: TabSessionMap = Object.freeze({});
/** Loaded once per scope from localStorage; this page's writes land here first. */
const bindingsByScope = new Map<string, Bindings>();
const mapsByScope = new Map<string, TabSessionMap>();

function storageKey(scopeKey: string): string {
  return STORAGE_PREFIX + scopeKey;
}

function loadBindings(scopeKey: string): Bindings {
  const cached = bindingsByScope.get(scopeKey);
  if (cached) return cached;
  let bindings: Bindings = {};
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(scopeKey)) ?? "null") as { v?: number; b?: unknown } | null;
    if (value?.v === 1 && value.b && typeof value.b === "object") {
      for (const [tabId, entry] of Object.entries(value.b as Record<string, unknown>)) {
        if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number") {
          bindings[tabId] = [entry[0], entry[1]];
        }
      }
    }
  } catch {
    bindings = {};
  }
  bindingsByScope.set(scopeKey, bindings);
  return bindings;
}

function readMap(scopeKey: string | null): TabSessionMap {
  if (!scopeKey) return EMPTY_MAP;
  const cached = mapsByScope.get(scopeKey);
  if (cached) return cached;
  const map: Record<string, string> = {};
  for (const [tabId, [sessionId]] of Object.entries(loadBindings(scopeKey))) map[tabId] = sessionId;
  const frozen = Object.freeze(map);
  mapsByScope.set(scopeKey, frozen);
  return frozen;
}

function bindTabSession(scopeKey: string, tabId: string, sessionId: string): void {
  const bindings = { ...loadBindings(scopeKey), [tabId]: [sessionId, Date.now()] as [string, number] };
  const kept: Bindings = Object.fromEntries(
    Object.entries(bindings).sort((a, b) => b[1][1] - a[1][1]).slice(0, MAX_BINDINGS),
  );
  bindingsByScope.set(scopeKey, kept);
  mapsByScope.delete(scopeKey);
  try {
    window.localStorage.setItem(storageKey(scopeKey), JSON.stringify({ v: 1, b: kept }));
  } catch {
    // Storage blocked: the binding holds for this page only.
  }
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/** Tabs waiting for a session, per `scopeKey`, in request order. */
const pendingByScope = new Map<string, PendingSession[]>();
/** Tabs whose request failed this page load — no retry loop against a missing reducer. */
const failed = new Set<string>();
/** The tab-less Merchiva asks for a session once per page load. */
let windowSessionRequested = false;

/**
 * The session this Merchiva shows, or null while there is none yet. Until then the chat still
 * works: its first message streams without the background path, and is saved once the session
 * it asked for (`needed`) arrives.
 */
export function useTabChatSession(opts: {
  tabId: string | null;
  sessions: readonly SessionRef[];
  ready: boolean;
  /** The conversation has something to save — ask for a session if there is none. */
  needed: boolean;
  create: () => Promise<void>;
}): string | null {
  const { sessions, ready, needed, create } = opts;
  const snapshot = useTabsSnapshot();
  const scopeKey = snapshot.scope ? `${snapshot.scope.userId}:${snapshot.scope.organizationId}` : null;
  const tabId = scopeKey ? opts.tabId : null;
  const map = useSyncExternalStore(subscribe, () => readMap(scopeKey), () => EMPTY_MAP);
  // The session this Merchiva resolved to last, so the tab-less one stays on it.
  const [shown, setShown] = useState<string | null>(null);
  const decision = ready ? resolveSession(tabId, sessions, map, shown) : null;

  const kind = decision?.kind ?? null;
  const decidedId = decision?.kind === "use" ? decision.id : null;
  const bind = decision?.kind === "use" && decision.bind;
  if (decidedId && decidedId !== shown) setShown(decidedId);

  useEffect(() => {
    if (!scopeKey || !tabId || !bind || !decidedId) return;
    bindTabSession(scopeKey, tabId, decidedId);
  }, [scopeKey, tabId, bind, decidedId]);

  useEffect(() => {
    if (kind !== "create" || !needed) return;
    if (!scopeKey || !tabId) {
      if (windowSessionRequested) return;
      windowSessionRequested = true;
      create().catch(() => {});
      return;
    }
    const pending = pendingByScope.get(scopeKey) ?? [];
    const failKey = `${scopeKey}|${tabId}`;
    if (failed.has(failKey) || pending.some((p) => p.tabId === tabId)) return;
    pendingByScope.set(scopeKey, [...pending, { tabId, known: new Set(sessions.map((s) => s.id)) }]);
    create().catch(() => {
      failed.add(failKey);
      pendingByScope.set(scopeKey, (pendingByScope.get(scopeKey) ?? []).filter((p) => p.tabId !== tabId));
    });
  }, [kind, needed, scopeKey, tabId, sessions, create]);

  // Any mounted Merchiva may hand a new row to whichever tab asked for it.
  useEffect(() => {
    if (!scopeKey) return;
    const pending = pendingByScope.get(scopeKey);
    if (!pending?.length) return;
    const claims = claimNewSessions(pending, sessions, readMap(scopeKey));
    if (claims.length === 0) return;
    const claimed = new Set(claims.map((c) => c.tabId));
    pendingByScope.set(scopeKey, pending.filter((p) => !claimed.has(p.tabId)));
    for (const claim of claims) bindTabSession(scopeKey, claim.tabId, claim.sessionId);
  }, [scopeKey, sessions]);

  return decidedId;
}
