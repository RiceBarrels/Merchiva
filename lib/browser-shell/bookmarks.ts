import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth/context";
import { usePermissions } from "@/lib/context/permissions";
import { createScopedListStorage } from "./scoped-list-storage";
import { canonicalizeUrl } from "./url";
import type { ShellBookmark } from "./types";

/** Dispatched on `window` after every local write (the `storage` event covers other windows). */
export const BOOKMARKS_CHANGE_EVENT = "merchiva:bookmarks-change";
export const MAX_BOOKMARKS = 500;
const MAX_TITLE_LEN = 200;

/** User id is part of the key so people sharing a store device never see each other's bookmarks. */
export function bookmarksStorageKey(userId: string, organizationId: string): string {
  return `merchiva_bookmarks:v1:${userId}:${organizationId}`;
}

function isShellBookmark(value: unknown): value is ShellBookmark {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.url === "string" &&
    typeof v.title === "string" &&
    typeof v.createdAt === "number" &&
    Number.isFinite(v.createdAt)
  );
}

const storage = createScopedListStorage<ShellBookmark>(BOOKMARKS_CHANGE_EVENT, isShellBookmark);

function newBookmarkId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "b_";
  const bytes = new Uint8Array(10);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

function urlKey(url: string): string | null {
  return canonicalizeUrl(url)?.key ?? null;
}

function cleanTitle(title: string, fallback: string): string {
  return (title.replace(/\s+/g, " ").trim() || fallback).slice(0, MAX_TITLE_LEN);
}

function getServerBookmarks(): readonly ShellBookmark[] {
  return storage.empty;
}

/**
 * Per user + org bookmarks. Outside an authenticated org (no user or org id) the list
 * is empty and mutators do not persist anything.
 */
export function useBookmarks(): {
  items: readonly ShellBookmark[];
  find(url: string): ShellBookmark | undefined;
  add(url: string, title: string): ShellBookmark;
  update(id: string, patch: Partial<Pick<ShellBookmark, "title" | "url">>): void;
  remove(id: string): void;
  toggle(url: string, title: string): boolean;
} {
  const { user } = useAuth();
  const { organizationId } = usePermissions();
  const key = user?.id && organizationId ? bookmarksStorageKey(user.id, organizationId) : null;

  const getSnapshot = useCallback(() => (key ? storage.read(key) : storage.empty), [key]);
  const items = useSyncExternalStore(storage.subscribe, getSnapshot, getServerBookmarks);

  const find = useCallback(
    (url: string): ShellBookmark | undefined => {
      const target = urlKey(url);
      if (!target) return undefined;
      return items.find((bookmark) => urlKey(bookmark.url) === target);
    },
    [items],
  );

  const add = useCallback(
    (url: string, title: string): ShellBookmark => {
      const canonical = canonicalizeUrl(url);
      const bookmarkUrl = canonical ? canonical.url : url.trim();
      const bookmark: ShellBookmark = {
        id: newBookmarkId(),
        url: bookmarkUrl,
        title: cleanTitle(title, bookmarkUrl),
        createdAt: Date.now(),
      };
      // Only in-app tab URLs are stored; anything else is returned unsaved.
      if (!key || !canonical || !canonical.tabbable) return bookmark;
      const current = storage.read(key);
      const existing = current.find((b) => urlKey(b.url) === canonical.key);
      if (existing) return existing;
      storage.write(key, [...current, bookmark].slice(-MAX_BOOKMARKS));
      return bookmark;
    },
    [key],
  );

  const update = useCallback(
    (id: string, patch: Partial<Pick<ShellBookmark, "title" | "url">>): void => {
      if (!key) return;
      const current = storage.read(key);
      const index = current.findIndex((b) => b.id === id);
      if (index < 0) return;
      const prev = current[index];
      let nextUrl = prev.url;
      if (patch.url !== undefined) {
        const canonical = canonicalizeUrl(patch.url);
        if (!canonical || !canonical.tabbable) return;
        nextUrl = canonical.url;
      }
      const nextTitle = patch.title !== undefined ? cleanTitle(patch.title, nextUrl) : prev.title;
      if (nextUrl === prev.url && nextTitle === prev.title) return;
      const next = current.slice();
      next[index] = { ...prev, url: nextUrl, title: nextTitle };
      storage.write(key, next);
    },
    [key],
  );

  const remove = useCallback(
    (id: string): void => {
      if (!key) return;
      const current = storage.read(key);
      if (!current.some((b) => b.id === id)) return;
      storage.write(key, current.filter((b) => b.id !== id));
    },
    [key],
  );

  const toggle = useCallback(
    (url: string, title: string): boolean => {
      if (!key) return false;
      const target = urlKey(url);
      const existing = target ? storage.read(key).find((b) => urlKey(b.url) === target) : undefined;
      if (existing) {
        remove(existing.id);
        return false;
      }
      const created = add(url, title);
      return storage.read(key).some((b) => b.id === created.id);
    },
    [key, add, remove],
  );

  return useMemo(() => ({ items, find, add, update, remove, toggle }), [items, find, add, update, remove, toggle]);
}
