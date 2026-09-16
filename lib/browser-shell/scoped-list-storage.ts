/**
 * Internal helper for small per-user/per-org lists kept in localStorage
 * (bookmarks, browsing history). Snapshots are cached by raw string so
 * `useSyncExternalStore` gets a stable array identity; every storage access is
 * wrapped because localStorage can throw (Safari private mode, quota, blocked
 * site data). When a write fails the new list is kept in memory for the session.
 */
export interface ScopedListStorage<T> {
  readonly empty: readonly T[];
  read(key: string): readonly T[];
  write(key: string, items: readonly T[]): void;
  subscribe(onChange: () => void): () => void;
}

export function createScopedListStorage<T>(
  changeEvent: string,
  isItem: (value: unknown) => value is T,
): ScopedListStorage<T> {
  const empty: readonly T[] = Object.freeze([]);
  const cache = new Map<string, { raw: string | null; items: readonly T[] }>();

  function rawOf(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function read(key: string): readonly T[] {
    if (typeof window === "undefined") return empty;
    const raw = rawOf(key);
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.items;
    let items = empty;
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid: T[] = [];
          for (const value of parsed as unknown[]) if (isItem(value)) valid.push(value);
          if (valid.length > 0) items = Object.freeze(valid);
        }
      } catch {
        items = empty;
      }
    }
    cache.set(key, { raw, items });
    return items;
  }

  function write(key: string, items: readonly T[]): void {
    if (typeof window === "undefined") return;
    const next: readonly T[] = items.length > 0 ? Object.freeze(items.slice()) : empty;
    const text = JSON.stringify(next);
    try {
      window.localStorage.setItem(key, text);
      cache.set(key, { raw: text, items: next });
    } catch {
      cache.set(key, { raw: rawOf(key), items: next });
    }
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: { key } }));
  }

  function subscribe(onChange: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const handler = () => onChange();
    window.addEventListener("storage", handler);
    window.addEventListener(changeEvent, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(changeEvent, handler);
    };
  }

  return { empty, read, write, subscribe };
}
