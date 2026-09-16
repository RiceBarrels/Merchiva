"use client";

// "Last opened" timestamps for the recent-documents lists. Per device, per
// user, per org — kept in localStorage (sign-out clears it) and never synced.

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth/context";
import { usePermissions } from "@/lib/context/permissions";

export interface DocsOpenedScope { userId: string; organizationId: string }

export const DOCS_OPENED_EVENT = "merchiva:docs-opened";
const DOCS_OPENED_CAP = 200;
const EMPTY_OPENED: ReadonlyMap<string, number> = new Map();

export function docsOpenedStorageKey(scope: DocsOpenedScope): string {
  return `merchiva_docs_opened:v1:${scope.userId}:${scope.organizationId}`;
}

function parseOpened(raw: string | null): Array<[string, number]> {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const out: Array<[string, number]> = [];
    for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) out.push([id, at]);
    }
    return out;
  } catch {
    return [];
  }
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Record that the current user opened `documentId` (called once the editor has loaded it). */
export function markDocumentOpened(scope: DocsOpenedScope, documentId: string): void {
  if (typeof window === "undefined" || !scope.userId || !scope.organizationId || !documentId) return;
  const key = docsOpenedStorageKey(scope);
  const entries = parseOpened(readRaw(key)).filter(([id]) => id !== documentId.toLowerCase());
  entries.push([documentId.toLowerCase(), Date.now()]);
  entries.sort((a, b) => b[1] - a[1]);
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries.slice(0, DOCS_OPENED_CAP))));
  } catch {
    // Quota exceeded or storage blocked — recents simply fall back to updatedAt.
    return;
  }
  window.dispatchEvent(new CustomEvent(DOCS_OPENED_EVENT, { detail: { key } }));
}

// getSnapshot must return the same object while storage is unchanged.
const snapshotCache = new Map<string, { raw: string | null; map: ReadonlyMap<string, number> }>();

function readOpenedSnapshot(key: string): ReadonlyMap<string, number> {
  const raw = readRaw(key);
  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.map;
  const map: ReadonlyMap<string, number> = raw ? new Map(parseOpened(raw)) : EMPTY_OPENED;
  snapshotCache.set(key, { raw, map });
  return map;
}

function subscribeOpened(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(DOCS_OPENED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DOCS_OPENED_EVENT, onChange);
  };
}

const getServerOpened = (): ReadonlyMap<string, number> => EMPTY_OPENED;

/** documentId → last-opened epoch ms for the signed-in user in the active org. */
export function useLastOpenedMap(): ReadonlyMap<string, number> {
  const { user } = useAuth();
  const { organizationId } = usePermissions();
  const key = user?.id && organizationId ? docsOpenedStorageKey({ userId: user.id, organizationId }) : null;
  const getSnapshot = useCallback(() => (key ? readOpenedSnapshot(key) : EMPTY_OPENED), [key]);
  return useSyncExternalStore(subscribeOpened, getSnapshot, getServerOpened);
}
