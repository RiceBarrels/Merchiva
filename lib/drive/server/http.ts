// HTTP plumbing shared by the Drive route handlers: error codes → statuses,
// the caller check, upstream failure parsing, JSON bodies. Pure.
//
// Every error body is `{ error: string; code: DriveHttpCode }`. Clients read the
// code (lib/drive/errors.ts maps it to copy); `error` is developer text.

import { DRIVE_ERROR_I18N_KEYS, type DriveClientErrorCode } from "@/lib/drive/errors";
import type { DriveServerDeps } from "./handlers/types";

/** A client code, or "upstream" for a Blob / SpacetimeDB failure the client cannot act on. */
export type DriveHttpCode = DriveClientErrorCode | "upstream";

export class DriveHttpError extends Error {
  readonly code: DriveHttpCode;
  readonly status: number;
  constructor(code: DriveHttpCode, status: number, message?: string) {
    super(message ?? `[drive.${code}]`);
    this.name = "DriveHttpError";
    this.code = code;
    this.status = status;
  }
}

const STATUS_BY_CODE: Readonly<Partial<Record<DriveHttpCode, number>>> = {
  not_found: 404,
  forbidden: 403, operator: 403, subtree_forbidden: 403, device_scope: 403,
  invalid: 422, invalid_name: 422, cycle: 422, too_deep: 422, space_mismatch: 422, batch_too_large: 422,
  trashed: 409, expired: 409, conflict: 409, not_uploaded: 409,
  too_large: 413,
  blocked_type: 415,
  too_many_pending: 429, too_many_attempts: 429, too_many_items: 429,
  quota_exceeded: 507,
  not_configured: 503, not_published: 503,
  unauthenticated: 401,
  orphan_brake: 502, unknown: 502, upstream: 502,
};

/** HTTP status of a code (CONTRACTS §2.6). Client-only codes the server never sends answer 500. */
export function driveStatusFor(code: DriveHttpCode): number {
  return STATUS_BY_CODE[code] ?? 500;
}

/** `new DriveHttpError(code, driveStatusFor(code), message)`. */
export function driveHttpError(code: DriveHttpCode, message?: string): DriveHttpError {
  return new DriveHttpError(code, driveStatusFor(code), message);
}

/** The token of an `Authorization: Bearer <token>` header, else null. */
export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authHeader.trim());
  return match ? match[1] : null;
}

/** The verified caller and their token (also their SpacetimeDB token); 401 `unauthenticated` otherwise. */
export async function requireCaller(deps: DriveServerDeps, req: Request): Promise<{ userId: string; token: string }> {
  const header = req.headers.get("authorization");
  const token = bearerToken(header);
  if (!token) throw driveHttpError("unauthenticated", "Sign in to use Drive");
  const userId = await deps.verifyUser(`Bearer ${token}`);
  if (!userId) throw driveHttpError("unauthenticated", "Sign in to use Drive");
  return { userId, token };
}

// callReducer (lib/spacetimedb/server-rpc.ts) and spacetimeSql (lib/spacetimedb/sql.ts) throw exactly these.
const UPSTREAM_RE = /^SpacetimeDB (?:reducer \S+|SQL) failed \((\d{3})\): ([\s\S]*)$/;

/** The HTTP status and body of a failed SpacetimeDB call; status null for anything else (network errors, bugs). */
export function parseUpstreamFailure(err: unknown): { status: number | null; body: string } {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const match = UPSTREAM_RE.exec(message);
  if (!match) return { status: null, body: message };
  return { status: Number(match[1]), body: match[2] };
}

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.keys(DRIVE_ERROR_I18N_KEYS));
const DRIVE_CODE_RE = /\[drive\.([a-z_]+)\]\s*([^\n]*)/;
const NOT_MEMBER_RE = /Not an active member/i;
const NOT_PUBLISHED_RE = /No such (?:procedure|reducer)|no such table/i;

/**
 * A SpacetimeDB failure as an HTTP error:
 *   a `[drive.<code>]` the client knows → that code (the reducer's text is the message);
 *   "Not an active member" → forbidden;
 *   404, "No such procedure/reducer", or SQL "no such table" (an older module) → not_published;
 *   401 / 403 → unauthenticated;
 *   anything else → upstream.
 * A DriveHttpError passes through unchanged.
 */
export function reducerFailure(err: unknown): DriveHttpError {
  if (err instanceof DriveHttpError) return err;
  const { status, body } = parseUpstreamFailure(err);
  const drive = DRIVE_CODE_RE.exec(body);
  if (drive && KNOWN_CODES.has(drive[1])) {
    const code = drive[1] as DriveClientErrorCode;
    return driveHttpError(code, `[drive.${code}] ${drive[2]}`.trim());
  }
  if (NOT_MEMBER_RE.test(body)) return driveHttpError("forbidden", "Not an active member of this store");
  if (status === 404 || NOT_PUBLISHED_RE.test(body)) return driveHttpError("not_published", "Drive is not available on this server yet");
  if (status === 401 || status === 403) return driveHttpError("unauthenticated", "Sign in again");
  return driveHttpError("upstream", "The storage service failed");
}

// @vercel/blob's handleUploadPresigned: "Vercel Blob: Missing callback signature" / "…Invalid callback signature".
const CALLBACK_SIGNATURE_RE = /callback signature/i;

/** True for the SDK's refusal of an unsigned or forged upload-completed callback. */
export function isCallbackSignatureError(err: unknown): boolean {
  return err instanceof Error && CALLBACK_SIGNATURE_RE.test(err.message);
}

/**
 * The error response for anything a handler threw: a DriveHttpError keeps its status and code, a refused callback
 * signature is 401 `unauthenticated`, everything else is 502 `upstream`. Logs the route and code only.
 */
export function errorResponse(deps: DriveServerDeps, req: Request, err: unknown): Response {
  const failure = err instanceof DriveHttpError ? err
    : isCallbackSignatureError(err) ? driveHttpError("unauthenticated", "Invalid callback signature")
    : driveHttpError("upstream", "The storage service failed");
  const upstream = parseUpstreamFailure(err).status;
  deps.log(failure.status >= 500 ? "error" : "warn", "drive.route_error", {
    route: routeOf(req),
    code: failure.code,
    ...(upstream !== null ? { upstreamStatus: upstream } : {}),
  });
  return deps.json(req, { error: failure.message, code: failure.code }, { status: failure.status });
}

/** The request path, for logs (never the query string). */
export function routeOf(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "";
  }
}

/** The JSON body, at most `maxBytes` long; 400 `invalid` when it is larger or does not parse. */
export async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new DriveHttpError("invalid", 400, "Request body is too large");
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new DriveHttpError("invalid", 400, "Unreadable request body");
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new DriveHttpError("invalid", 400, "Request body is too large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DriveHttpError("invalid", 400, "Request body is not JSON");
  }
}

/** A plain JSON object (not an array or null). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
