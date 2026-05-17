// Offline support utilities: IndexedDB caching, mutation queue, connectivity detection.
// Uses raw IndexedDB API — no external dependencies.

const DB_NAME = "merchiva_offline";
const DB_VERSION = 2; // v2 adds mutation_queue store
const STORES = ["shifts", "inventory", "todos", "notifications", "waste_logs"] as const;
const MUTATION_STORE = "mutation_queue";
const ORG_STORE = "org_snapshots";

type StoreName = (typeof STORES)[number];

// ─── OrgSnapshot ────────────────────────────────────────────────────────────

export interface OrgSnapshot {
  orgId: string;
  cachedAt: string; // ISO timestamp
  shifts: Record<string, unknown>[];
  inventoryItems: Record<string, unknown>[];
  todos: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  wasteLogs: Record<string, unknown>[];
  products: Record<string, unknown>[];
  staffMembers: Record<string, unknown>[];
  salesRecords: Record<string, unknown>[];
  chatConversations: Record<string, unknown>[];
  chatMessages: Record<string, unknown>[];
}

// ─── QueuedMutation ─────────────────────────────────────────────────────────

export interface QueuedMutation {
  id: string;
  action: string; // reducer name
  args: Record<string, unknown>;
  timestamp: string;
  // Number of failed replay attempts. Mutations are dropped after MAX_REPLAY_ATTEMPTS
  // so a single broken queued reducer (e.g. stale args after a schema change)
  // doesn't keep re-failing on every reconnection.
  attempts?: number;
}

const MAX_REPLAY_ATTEMPTS = 3;

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create data stores
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }

      // Create mutation queue store (auto-incrementing key for ordering)
      if (!db.objectStoreNames.contains(MUTATION_STORE)) {
        db.createObjectStore(MUTATION_STORE, { keyPath: "id" });
      }

      // Create org snapshots store
      if (!db.objectStoreNames.contains(ORG_STORE)) {
        db.createObjectStore(ORG_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);

        request.onsuccess = () => {
          resolve(request.result);
          db.close();
        };
        request.onerror = () => {
          reject(request.error);
          db.close();
        };
        tx.onerror = () => {
          reject(tx.error);
          db.close();
        };
      })
  );
}

function withStoreGetAll<T>(storeName: string): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result as T[]);
          db.close();
        };
        request.onerror = () => {
          reject(request.error);
          db.close();
        };
      })
  );
}

// ─── offlineCache ───────────────────────────────────────────────────────────

export const offlineCache = {
  async set(store: StoreName, key: string, value: unknown): Promise<void> {
    try {
      await withStore(store, "readwrite", (s) => s.put(value, key));
    } catch (err) {
      console.warn("[offlineCache] set failed:", err);
    }
  },

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    try {
      const result = await withStore<T | undefined>(store, "readonly", (s) =>
        s.get(key) as IDBRequest<T | undefined>
      );
      return result;
    } catch (err) {
      console.warn("[offlineCache] get failed:", err);
      return undefined;
    }
  },

  async getAll<T>(store: StoreName): Promise<T[]> {
    try {
      return await withStoreGetAll<T>(store);
    } catch (err) {
      console.warn("[offlineCache] getAll failed:", err);
      return [];
    }
  },

  async delete(store: StoreName, key: string): Promise<void> {
    try {
      await withStore(store, "readwrite", (s) =>
        s.delete(key) as IDBRequest<undefined>
      );
    } catch (err) {
      console.warn("[offlineCache] delete failed:", err);
    }
  },

  async clear(store: StoreName): Promise<void> {
    try {
      await withStore(store, "readwrite", (s) =>
        s.clear() as IDBRequest<undefined>
      );
    } catch (err) {
      console.warn("[offlineCache] clear failed:", err);
    }
  },

  async cacheOrgData(orgId: string, data: OrgSnapshot): Promise<void> {
    try {
      await withStore(ORG_STORE, "readwrite", (s) =>
        s.put(data, orgId)
      );
    } catch (err) {
      console.warn("[offlineCache] cacheOrgData failed:", err);
    }
  },

  async getOrgData(orgId: string): Promise<OrgSnapshot | null> {
    try {
      const result = await withStore<OrgSnapshot | undefined>(
        ORG_STORE,
        "readonly",
        (s) => s.get(orgId) as IDBRequest<OrgSnapshot | undefined>
      );
      return result ?? null;
    } catch (err) {
      console.warn("[offlineCache] getOrgData failed:", err);
      return null;
    }
  },
};

// ─── mutationQueue ──────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const mutationQueue = {
  async enqueue(action: string, args: Record<string, unknown>): Promise<void> {
    const mutation: QueuedMutation = {
      id: generateId(),
      action,
      args,
      timestamp: new Date().toISOString(),
    };
    try {
      await withStore(MUTATION_STORE, "readwrite", (s) => s.add(mutation));
    } catch (err) {
      console.warn("[mutationQueue] enqueue failed:", err);
    }
  },

  async dequeue(): Promise<QueuedMutation | undefined> {
    try {
      const all = await withStoreGetAll<QueuedMutation>(MUTATION_STORE);
      if (all.length === 0) return undefined;

      // Sort by timestamp to ensure FIFO
      all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const first = all[0];

      // Remove it from the store
      await withStore(MUTATION_STORE, "readwrite", (s) =>
        s.delete(first.id) as IDBRequest<undefined>
      );

      return first;
    } catch (err) {
      console.warn("[mutationQueue] dequeue failed:", err);
      return undefined;
    }
  },

  async getAll(): Promise<QueuedMutation[]> {
    try {
      const all = await withStoreGetAll<QueuedMutation>(MUTATION_STORE);
      all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      return all;
    } catch (err) {
      console.warn("[mutationQueue] getAll failed:", err);
      return [];
    }
  },

  async clear(): Promise<void> {
    try {
      await withStore(MUTATION_STORE, "readwrite", (s) =>
        s.clear() as IDBRequest<undefined>
      );
    } catch (err) {
      console.warn("[mutationQueue] clear failed:", err);
    }
  },

  /**
   * Replay queued mutations in order by calling `conn.reducers[action](args)`.
   * Returns counts of successes and failures.
   */
  async flush(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn: any
  ): Promise<{ success: number; failed: number }> {
    const mutations = await this.getAll();
    let success = 0;
    let failed = 0;

    for (const mutation of mutations) {
      try {
        const reducerFn = conn?.reducers?.[mutation.action];
        if (typeof reducerFn !== "function") {
          console.warn(
            `[mutationQueue] Unknown reducer "${mutation.action}", skipping`
          );
          failed++;
          continue;
        }
        await reducerFn(mutation.args);
        success++;

        // Remove the successfully replayed mutation
        await withStore(MUTATION_STORE, "readwrite", (s) =>
          s.delete(mutation.id) as IDBRequest<undefined>
        );
      } catch (err) {
        const attempts = (mutation.attempts ?? 0) + 1;
        console.error(
          `[mutationQueue] Failed to replay "${mutation.action}" (attempt ${attempts}/${MAX_REPLAY_ATTEMPTS}):`,
          err
        );
        failed++;
        if (attempts >= MAX_REPLAY_ATTEMPTS) {
          // Permanently drop the broken mutation so a single bad row doesn't
          // wedge the queue forever (e.g. stale args after a schema change).
          console.warn(
            `[mutationQueue] Dropping "${mutation.action}" after ${attempts} failed attempts`
          );
          await withStore(MUTATION_STORE, "readwrite", (s) =>
            s.delete(mutation.id) as IDBRequest<undefined>
          );
        } else {
          // Bump the attempts counter and leave it in the queue for the next reconnect.
          await withStore(MUTATION_STORE, "readwrite", (s) =>
            s.put({ ...mutation, attempts }) as IDBRequest<IDBValidKey>
          );
        }
      }
    }

    return { success, failed };
  },
};

// ─── Online / Offline detection ─────────────────────────────────────────────

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Subscribe to connectivity changes. Returns an unsubscribe function.
 * Calls `cb(true)` when going online, `cb(false)` when going offline.
 */
export function onConnectivityChange(
  cb: (online: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => cb(true);
  const handleOffline = () => cb(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
