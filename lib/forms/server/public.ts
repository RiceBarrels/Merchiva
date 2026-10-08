// The pure parts of the anyone-with-the-link Forms endpoint
// (app/api/forms/public/[token], app/f/[token]): the token check, the signed
// render stamp, request validation and reducer-error mapping. No env reads, no
// fetch: public-handlers.ts wires these to SpacetimeDB, public-deps.ts to the
// real environment.
//
// Anti-abuse (design B.10): a honeypot field that must stay empty, an
// HMAC-signed render timestamp (FORMS_PUBLIC_SECRET) that must be at least
// PUBLIC_STAMP_MIN_AGE_MS old and at most PUBLIC_STAMP_MAX_AGE_MS, a body size
// cap, and the module's per-form hourly cap behind it all. The first two never
// name themselves to the sender: a filled honeypot gets a fake success and is
// dropped, an early submit gets the generic `invalid`.

import { createHmac, timingSafeEqual } from "node:crypto";
import { DRIVE_ITEM_ID_RE, FORM_MAX_ANSWERS_BYTES, isValidDateKey, utf8ByteLength } from "@/lib/forms/limits";
import type { FormIssueCode } from "@/lib/forms/schema";
import type { Answers } from "@/lib/forms/types";

/** A public token: 64 lowercase hex (two uuid v4s without dashes, set by setFormPublicLink). */
export const PUBLIC_FORM_TOKEN_RE = /^[0-9a-f]{64}$/;
/** A submission earlier than this after the page was rendered is refused (bots fill instantly). */
export const PUBLIC_STAMP_MIN_AGE_MS = 3_000;
/** A page older than this must fetch a fresh stamp (GET) before it can submit. */
export const PUBLIC_STAMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Clock skew tolerated for a stamp from the future (several server instances). */
export const PUBLIC_STAMP_FUTURE_SKEW_MS = 5_000;
/** The POST body cap: the answers cap plus room for the envelope and JSON escaping. */
export const PUBLIC_MAX_BODY_BYTES = FORM_MAX_ANSWERS_BYTES + 8 * 1024;
/** The honeypot field: rendered off-screen, never filled by a person. */
export const PUBLIC_HONEYPOT_FIELD = "website";
/** FORMS_PUBLIC_SECRET shorter than this is treated as unset. */
export const PUBLIC_SECRET_MIN_LENGTH = 32;

export function isPublicFormToken(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_FORM_TOKEN_RE.test(value);
}

/* ─── Config ─────────────────────────────────────────────────────────────── */

export interface PublicFormsConfig {
  secret: string;
  serviceToken: string;
}

/** The endpoint's config, or null (→ 503 `not_configured`) unless both server-only values are set. */
export function parsePublicFormsConfig(env: Readonly<Record<string, string | undefined>>): PublicFormsConfig | null {
  const secret = (env.FORMS_PUBLIC_SECRET ?? "").trim();
  const serviceToken = (env.SPACETIMEDB_SERVICE_TOKEN ?? "").trim();
  if (secret.length < PUBLIC_SECRET_MIN_LENGTH || serviceToken === "") return null;
  return { secret, serviceToken };
}

/* ─── Render stamp ───────────────────────────────────────────────────────── */

function stampMac(secret: string, token: string, issuedAtMs: number): string {
  return createHmac("sha256", secret).update(`forms-public:v1:${token}:${issuedAtMs}`).digest("hex");
}

/** `<issuedAtMs>.<hmac hex>`, bound to one form token. */
export function signPublicStamp(secret: string, token: string, issuedAtMs: number): string {
  return `${issuedAtMs}.${stampMac(secret, token, issuedAtMs)}`;
}

export type StampCheck = "ok" | "invalid" | "too_fast" | "expired";

/** Checks the signature in constant time, then the age: ≥ PUBLIC_STAMP_MIN_AGE_MS and ≤ PUBLIC_STAMP_MAX_AGE_MS. */
export function verifyPublicStamp(secret: string, token: string, stamp: unknown, nowMs: number): StampCheck {
  if (typeof stamp !== "string") return "invalid";
  const match = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(stamp);
  if (!match) return "invalid";
  const issuedAtMs = Number(match[1]);
  const given = Buffer.from(match[2], "hex");
  const expected = Buffer.from(stampMac(secret, token, issuedAtMs), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";
  if (issuedAtMs > nowMs + PUBLIC_STAMP_FUTURE_SKEW_MS) return "invalid";
  const age = nowMs - issuedAtMs;
  if (age < PUBLIC_STAMP_MIN_AGE_MS) return "too_fast";
  if (age > PUBLIC_STAMP_MAX_AGE_MS) return "expired";
  return "ok";
}

/* ─── Request body ───────────────────────────────────────────────────────── */

/** The body as text, or null once it passes `maxBytes` (Content-Length first, then while streaming). */
export async function readCappedText(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

export interface PublicSubmission {
  responseId: string;
  answersJson: string;
  date: string;
  stamp: string;
}

export type PublicBodyCheck =
  | { ok: true; value: PublicSubmission }
  | { ok: false; code: "invalid" | "honeypot" | "answers_too_large" };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The deepest an answers object can nest: answers → a file answer → its `driveItemIds` array. Anything deeper is
 * refused before JSON.stringify, which throws a RangeError (stack overflow) on a body nested thousands deep. The
 * recursion itself stops one level past the cap, so it is bounded too.
 */
const ANSWERS_MAX_DEPTH = 3;

function nestsWithin(value: unknown, depth: number): boolean {
  if (typeof value !== "object" || value === null) return true;
  if (depth > ANSWERS_MAX_DEPTH) return false;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.every((child) => nestsWithin(child, depth + 1));
}

/**
 * `{ responseId, answers, date, stamp, website }` → the reducer's arguments. The honeypot must be absent or ''.
 * Answers are re-serialized (never forwarded verbatim) and capped at FORM_MAX_ANSWERS_BYTES; the reducer validates
 * them against the form.
 */
export function parsePublicSubmission(text: string): PublicBodyCheck {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid" };
  }
  if (!isPlainObject(body)) return { ok: false, code: "invalid" };
  const honeypot = body[PUBLIC_HONEYPOT_FIELD];
  if (honeypot !== undefined && honeypot !== "") return { ok: false, code: "honeypot" };
  const { responseId, answers, date, stamp } = body;
  if (typeof responseId !== "string" || !DRIVE_ITEM_ID_RE.test(responseId)) return { ok: false, code: "invalid" };
  if (!isValidDateKey(date) || typeof stamp !== "string" || !isPlainObject(answers)) return { ok: false, code: "invalid" };
  if (!nestsWithin(answers, 1)) return { ok: false, code: "invalid" };
  let answersJson: string;
  try {
    answersJson = JSON.stringify(answers as Answers);
  } catch {
    return { ok: false, code: "invalid" };
  }
  if (utf8ByteLength(answersJson) > FORM_MAX_ANSWERS_BYTES) return { ok: false, code: "answers_too_large" };
  return { ok: true, value: { responseId, answersJson, date, stamp } };
}

/* ─── Errors ─────────────────────────────────────────────────────────────── */

/**
 * Every code this endpoint sends. The page turns `forms.errors.<code>` (or `forms.public.errors.<code>` for the
 * endpoint's own codes) into copy; internals (reducer names, upstream text) never reach the response.
 */
export type PublicFormErrorCode =
  | "not_configured" | "unavailable" | "not_found" | "invalid" | "too_large" | "expired"
  | "not_open" | "closed" | "public_unsafe" | "response_limit" | "rate_limited" | "org_storage_full" | "invalid_date"
  | PublicAnswerIssueCode;

/** The answer issues a public submit can raise (a subset of FormIssueCode); each names its question. */
export const PUBLIC_ANSWER_ISSUE_CODES = [
  "invalid_answers", "answers_too_large", "unknown_question", "required", "invalid_answer", "text_too_long",
  "unknown_option", "out_of_range", "too_many_selections", "too_few_selections", "too_many_files", "files_not_allowed",
] as const satisfies readonly FormIssueCode[];
export type PublicAnswerIssueCode = (typeof PUBLIC_ANSWER_ISSUE_CODES)[number];

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  not_configured: 503, unavailable: 503,
  not_found: 404,
  invalid: 400,
  too_large: 413,
  expired: 409, not_open: 409, closed: 409, public_unsafe: 409, response_limit: 409,
  rate_limited: 429,
  org_storage_full: 507,
  invalid_date: 422,
};

export function publicStatusFor(code: PublicFormErrorCode): number {
  return STATUS_BY_CODE[code] ?? 422;
}

export interface PublicErrorBody {
  error: PublicFormErrorCode;
  questionId?: string;
}

const MAPPED_REDUCER_CODES: ReadonlySet<string> = new Set([
  "not_found", "not_open", "closed", "public_unsafe", "response_limit", "rate_limited", "org_storage_full",
  "invalid_date", "invalid", ...PUBLIC_ANSWER_ISSUE_CODES,
]);

/**
 * A failed `serviceSubmitPublicFormResponse` call → the public error body, or null when the failure is ours (a
 * forbidden service token, an unpublished module, a network error), which answers 503 `unavailable` and is logged.
 */
export function mapPublicReducerError(err: unknown): PublicErrorBody | null {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const match = /\[forms\.([a-z_]{1,40})\](?:\s+(q_[0-9a-z]{12})\b)?/.exec(message);
  if (!match || !MAPPED_REDUCER_CODES.has(match[1])) return null;
  const body: PublicErrorBody = { error: match[1] as PublicFormErrorCode };
  if (match[2]) body.questionId = match[2];
  return body;
}
