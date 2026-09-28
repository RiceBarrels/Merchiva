// Signed GET URLs for private Drive blobs, batched and cached. No React.
//
// Every request made in the same tick (a grid of thumbnails mounting) goes out
// as one POST /api/drive/url per DRIVE_URL_BATCH_MAX items. A signed URL is
// reused until `refreshMarginMs` before it expires; a null answer (not ready,
// hidden, no thumbnail) and a failure are never cached, so the next call asks
// again. Concurrent calls for the same item, variant and purpose share one
// request.
//
// A loader signs for one acting member: '' is the caller's own view, a member
// id (the PIN operator on a store tablet) narrows it to what that member may
// read. sharedDriveUrlLoader keeps one per acting member for the tab.

import { isDocumentId } from "@/lib/docs/ids";
import { postDriveUrls, type DriveSignedUrl, type DriveUrlPurpose, type DriveUrlRequest, type DriveUrlVariant } from "@/lib/drive/api";
import { DRIVE_URL_BATCH_MAX } from "@/lib/drive/rules";

/** A cached URL is refreshed this long before it expires. */
export const DRIVE_URL_REFRESH_MARGIN_MS = 60_000;
/** Above this many cached URLs, a flush also drops the expired ones. */
const CACHE_PRUNE_THRESHOLD = 1_000;

export interface DriveUrlLoader {
  /** Batched with every other call made in the same tick; cached until `expiresAt − refreshMarginMs`. */
  get(req: DriveUrlRequest): Promise<DriveSignedUrl | null>;
  getMany(reqs: readonly DriveUrlRequest[]): Promise<Array<DriveSignedUrl | null>>;
  /** The cached URL when it is still fresh, else null. Never requests. */
  peek(req: DriveUrlRequest): DriveSignedUrl | null;
  /** Forgets the item's URLs (every variant and purpose); a request in flight is not cached when it lands. */
  invalidate(itemId: string): void;
}

export interface DriveUrlLoaderOptions {
  actingMemberId?: string | null;
  fetchUrls?: typeof postDriveUrls;
  now?: () => number;
  /** How long requests collect before a batch goes out (default 0: the end of the current task). */
  batchWindowMs?: number;
  refreshMarginMs?: number;
}

interface Waiter {
  req: DriveUrlRequest;
  key: string;
  generation: number;
  promise: Promise<DriveSignedUrl | null>;
  resolve: (value: DriveSignedUrl | null) => void;
  reject: (reason: unknown) => void;
}

const VARIANTS: ReadonlySet<string> = new Set<DriveUrlVariant>(["original", "thumb"]);
const PURPOSES: ReadonlySet<string> = new Set<DriveUrlPurpose>(["view", "stream", "download"]);

function normalizeActing(actingMemberId: string | null | undefined): string {
  return String(actingMemberId ?? "").trim().toLowerCase();
}

/** A lowercase item id with a known variant and purpose, else null (the route would refuse the whole batch). */
function normalizeRequest(req: DriveUrlRequest): DriveUrlRequest | null {
  const id = typeof req?.id === "string" ? req.id.trim().toLowerCase() : "";
  if (!isDocumentId(id) || !VARIANTS.has(req.variant) || !PURPOSES.has(req.purpose)) return null;
  return { id, variant: req.variant, purpose: req.purpose };
}

function cacheKey(req: DriveUrlRequest): string {
  return `${req.id}|${req.variant}|${req.purpose}`;
}

export function createDriveUrlLoader(opts: DriveUrlLoaderOptions = {}): DriveUrlLoader {
  const acting = normalizeActing(opts.actingMemberId);
  const fetchUrls = opts.fetchUrls ?? postDriveUrls;
  const now = opts.now ?? Date.now;
  const windowMs = Math.max(0, opts.batchWindowMs ?? 0);
  const margin = Math.max(0, opts.refreshMarginMs ?? DRIVE_URL_REFRESH_MARGIN_MS);

  const cache = new Map<string, DriveSignedUrl>();
  const inflight = new Map<string, Waiter>();
  const generations = new Map<string, number>();
  let queue: Waiter[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const generationOf = (itemId: string) => generations.get(itemId) ?? 0;

  function fresh(key: string): DriveSignedUrl | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt - margin > now()) return hit;
    cache.delete(key);
    return null;
  }

  function prune(): void {
    if (cache.size <= CACHE_PRUNE_THRESHOLD) return;
    const at = now();
    for (const [key, hit] of cache) if (hit.expiresAt - margin <= at) cache.delete(key);
  }

  function settle(waiter: Waiter): void {
    if (inflight.get(waiter.key) === waiter) inflight.delete(waiter.key);
  }

  function send(chunk: Waiter[]): void {
    Promise.resolve()
      .then(() => fetchUrls(chunk.map((waiter) => waiter.req), acting === "" ? null : acting))
      .then(
        (results) => {
          chunk.forEach((waiter, index) => {
            const signed = results[index] ?? null;
            if (signed && generationOf(waiter.req.id) === waiter.generation) cache.set(waiter.key, signed);
            settle(waiter);
            waiter.resolve(signed);
          });
        },
        (err: unknown) => {
          for (const waiter of chunk) {
            settle(waiter);
            waiter.reject(err);
          }
        },
      );
  }

  function flush(): void {
    timer = null;
    const batch = queue;
    queue = [];
    prune();
    for (let i = 0; i < batch.length; i += DRIVE_URL_BATCH_MAX) send(batch.slice(i, i + DRIVE_URL_BATCH_MAX));
  }

  function get(raw: DriveUrlRequest): Promise<DriveSignedUrl | null> {
    const req = normalizeRequest(raw);
    if (!req) return Promise.resolve(null);
    const key = cacheKey(req);
    const hit = fresh(key);
    if (hit) return Promise.resolve(hit);
    const pending = inflight.get(key);
    if (pending) return pending.promise;

    let resolve!: Waiter["resolve"];
    let reject!: Waiter["reject"];
    const promise = new Promise<DriveSignedUrl | null>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const waiter: Waiter = { req, key, generation: generationOf(req.id), promise, resolve, reject };
    inflight.set(key, waiter);
    queue.push(waiter);
    if (timer === null) timer = setTimeout(flush, windowMs);
    return promise;
  }

  return {
    get,
    getMany: (reqs) => Promise.all(reqs.map((req) => get(req))),
    peek(raw) {
      const req = normalizeRequest(raw);
      return req ? fresh(cacheKey(req)) : null;
    },
    invalidate(itemId) {
      const id = String(itemId ?? "").trim().toLowerCase();
      if (id === "") return;
      generations.set(id, generationOf(id) + 1);
      const prefix = `${id}|`;
      for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
      for (const key of [...inflight.keys()]) if (key.startsWith(prefix)) inflight.delete(key);
    },
  };
}

const shared = new Map<string, DriveUrlLoader>();

/** The tab's loader for one acting member ('' / null = the caller's own view). */
export function sharedDriveUrlLoader(actingMemberId?: string | null): DriveUrlLoader {
  const acting = normalizeActing(actingMemberId);
  let loader = shared.get(acting);
  if (!loader) {
    loader = createDriveUrlLoader({ actingMemberId: acting });
    shared.set(acting, loader);
  }
  return loader;
}

/** Drops cached URLs of these items from every shared loader (after a delete, a replace or a failed load). */
export function invalidateSharedDriveUrls(itemIds: Iterable<string>): void {
  for (const loader of shared.values()) for (const id of itemIds) loader.invalidate(id);
}
