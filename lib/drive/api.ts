// Client side of the Drive API routes (app/api/drive/*): commit an upload, sign
// URLs for private blobs, read whether storage is configured. No React.
//
// Every call carries the caller's WorkOS token as `Authorization: Bearer`. That
// token lives only inside useAuth() (lib/auth/context.tsx), so a React root
// registers its getter here (useDriveTokenBridge in use-drive-token.ts) and
// event handlers, the upload queue and the URL loader read it back with
// getDriveToken().
//
// A failure rejects with a DriveClientError whose code is the route's
// `{ code }` (lib/drive/errors.ts turns it into copy), `unauthenticated` when
// no token can be had, `network` when the API is unreachable, `aborted` when
// the caller's signal fired; anything else is a plain Error (generic copy).

import { apiUrl } from "@/lib/api-client";
import { DRIVE_ERROR_I18N_KEYS, DriveClientError, type DriveClientErrorCode } from "@/lib/drive/errors";
import { DRIVE_URL_BATCH_MAX } from "@/lib/drive/rules";

export type DriveTokenGetter = () => Promise<string | null>;
export type DriveUrlVariant = "original" | "thumb";
export type DriveUrlPurpose = "view" | "stream" | "download";
export interface DriveUrlRequest { id: string; variant: DriveUrlVariant; purpose: DriveUrlPurpose }
export interface DriveSignedUrl { url: string; expiresAt: number }
export interface DriveCommitInput { itemId: string; blobKey: string; thumbKey?: string }
export interface DriveCommitResult { outcome: "committed" | "rejected_oversize"; sizeBytes: number }
export interface DriveStorageStatus {
  configured: boolean;
  paused: boolean;
  maxFileBytes: number;
  multipartThresholdBytes: number;
  thumbMaxBytes: number;
}

// ── Token bridge ─────────────────────────────────────────────────────────────

interface TokenRegistration { getter: DriveTokenGetter }

const registrations: TokenRegistration[] = [];
/**
 * The getter registered last, kept after it unregisters: an upload the queue started on the Drive page keeps
 * running after the user leaves it. The getter reads the signed-in session, so after a sign-out it yields null.
 */
let lastGetter: DriveTokenGetter | null = null;

/** Registers the WorkOS token getter; the newest registration wins. Returns its unregister. */
export function registerDriveTokenGetter(getter: DriveTokenGetter): () => void {
  const registration: TokenRegistration = { getter };
  registrations.push(registration);
  lastGetter = getter;
  return () => {
    const index = registrations.indexOf(registration);
    if (index >= 0) registrations.splice(index, 1);
  };
}

/** The caller's token, or null when no getter was ever registered or it has none. */
export async function getDriveToken(): Promise<string | null> {
  const getter = registrations[registrations.length - 1]?.getter ?? lastGetter;
  if (!getter) return null;
  try {
    const token = await getter();
    return typeof token === "string" && token !== "" ? token : null;
  } catch {
    return null;
  }
}

// ── Requests ─────────────────────────────────────────────────────────────────

export interface DriveRequestInit { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal }
interface DriveResponse { status: number; ok: boolean; body: unknown }

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.keys(DRIVE_ERROR_I18N_KEYS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

async function requireToken(getToken: DriveTokenGetter): Promise<string> {
  let token: string | null = null;
  try {
    token = await getToken();
  } catch {
    token = null;
  }
  if (typeof token !== "string" || token === "") throw new DriveClientError("unauthenticated", "[drive.unauthenticated] Sign in again");
  return token;
}

async function send(path: string, init: DriveRequestInit, token: string): Promise<DriveResponse> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (init.signal?.aborted || isAbortError(err)) throw new DriveClientError("aborted");
    throw new DriveClientError("network", "[drive.network] Drive API unreachable");
  }
  let body: unknown = null;
  try {
    const text = await res.text();
    body = text === "" ? null : JSON.parse(text);
  } catch (err) {
    if (init.signal?.aborted || isAbortError(err)) throw new DriveClientError("aborted");
    body = null;
  }
  return { status: res.status, ok: res.ok, body };
}

/** One request; a 401 is retried once with a token read again (it may have been refreshed meanwhile). */
async function driveFetch(path: string, init: DriveRequestInit, getToken: DriveTokenGetter): Promise<DriveResponse> {
  const first = await send(path, init, await requireToken(getToken));
  if (first.status !== 401) return first;
  return send(path, init, await requireToken(getToken));
}

/** The error a non-2xx response stands for: the route's code when the client knows it, else a plain Error. */
function responseError(res: DriveResponse): Error {
  const body = isRecord(res.body) ? res.body : null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (KNOWN_CODES.has(code)) {
    const detail = typeof body?.error === "string" ? ` ${body.error}` : "";
    return new DriveClientError(code as DriveClientErrorCode, `[drive.${code}]${detail}`);
  }
  if (res.status === 401) return new DriveClientError("unauthenticated", "[drive.unauthenticated] Sign in again");
  return new Error(`Drive request failed (${res.status})`);
}

/**
 * `apiUrl(path)` with the caller's Bearer token and a JSON body; one retry after a 401. Resolves the parsed JSON of a
 * 2xx response. Rejects with DriveClientError(body.code) when the route names a code the client knows, else Error.
 */
export async function driveRequest<T>(path: string, init: DriveRequestInit, getToken: DriveTokenGetter = getDriveToken): Promise<T> {
  const res = await driveFetch(path, init, getToken);
  if (!res.ok) throw responseError(res);
  return res.body as T;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * POST /api/drive/commit. `rejected_oversize` (413) is an outcome, not a failure: the stored file was empty or larger
 * than declared, and the module dropped the row.
 */
export async function postDriveCommit(input: DriveCommitInput, signal?: AbortSignal): Promise<DriveCommitResult> {
  const body: DriveCommitInput = { itemId: input.itemId, blobKey: input.blobKey };
  if (input.thumbKey) body.thumbKey = input.thumbKey;
  const res = await driveFetch("/api/drive/commit", { method: "POST", body, signal }, getDriveToken);
  const payload = isRecord(res.body) ? res.body : null;
  if (res.status === 413 && payload?.outcome === "rejected_oversize") {
    return { outcome: "rejected_oversize", sizeBytes: nonNegativeNumber(payload.sizeBytes) ?? 0 };
  }
  if (!res.ok) throw responseError(res);
  const sizeBytes = nonNegativeNumber(payload?.sizeBytes);
  if (payload?.outcome !== "committed" || sizeBytes === null) throw new Error("Drive commit returned an unexpected response");
  return { outcome: "committed", sizeBytes };
}

const SIGNED_URL_RE = /^https?:\/\//i;

/**
 * POST /api/drive/url for at most DRIVE_URL_BATCH_MAX requests (the URL loader chunks larger sets). One result per
 * request, in order: null when the item is missing, not ready, has no thumbnail, or is hidden from the caller.
 * `actingMemberId` (the PIN operator on a store tablet) narrows what is signed to what that member may read.
 */
export async function postDriveUrls(
  requests: readonly DriveUrlRequest[],
  actingMemberId?: string | null,
  signal?: AbortSignal,
): Promise<Array<DriveSignedUrl | null>> {
  if (requests.length === 0) return [];
  if (requests.length > DRIVE_URL_BATCH_MAX) throw new DriveClientError("batch_too_large");
  const items = requests.map((req) => ({ id: req.id.trim().toLowerCase(), variant: req.variant, purpose: req.purpose }));
  const acting = String(actingMemberId ?? "").trim().toLowerCase();
  const body: { items: typeof items; actingMemberId?: string } = acting === "" ? { items } : { items, actingMemberId: acting };
  const payload = await driveRequest<unknown>("/api/drive/url", { method: "POST", body, signal });
  const results = isRecord(payload) && Array.isArray(payload.results) ? payload.results : null;
  if (!results) throw new Error("Drive URL request returned an unexpected response");
  return items.map((item, index): DriveSignedUrl | null => {
    const result: unknown = results[index];
    if (!isRecord(result) || result.id !== item.id) return null;
    const { url, expiresAt } = result;
    if (typeof url !== "string" || !SIGNED_URL_RE.test(url)) return null;
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
    return { url, expiresAt };
  });
}

/** GET /api/drive/status: whether uploads can work right now, and the limits the server applies. */
export async function getDriveStorageStatus(signal?: AbortSignal): Promise<DriveStorageStatus> {
  const payload = await driveRequest<unknown>("/api/drive/status", { method: "GET", signal });
  if (!isRecord(payload) || typeof payload.configured !== "boolean" || typeof payload.paused !== "boolean") {
    throw new Error("Drive status returned an unexpected response");
  }
  const maxFileBytes = nonNegativeNumber(payload.maxFileBytes);
  const multipartThresholdBytes = nonNegativeNumber(payload.multipartThresholdBytes);
  const thumbMaxBytes = nonNegativeNumber(payload.thumbMaxBytes);
  if (maxFileBytes === null || multipartThresholdBytes === null || thumbMaxBytes === null) {
    throw new Error("Drive status returned an unexpected response");
  }
  return { configured: payload.configured, paused: payload.paused, maxFileBytes, multipartThresholdBytes, thumbMaxBytes };
}
