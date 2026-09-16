// Docs reducers fail with `SenderError("[doc.<code>] Human text")`. The SDK
// rejects the reducer promise with that message verbatim; the client adds
// `not_published` when the bindings or reducers are missing (actions.ts).

import type { DocErrorCode } from "./types";

const DOC_ERROR_CODES: ReadonlySet<string> = new Set<DocErrorCode>([
  "not_found",
  "forbidden",
  "trashed",
  "too_large",
  "invalid",
  "not_published",
]);

// Optional "SenderError: " prefix covers errors that were stringified on the way.
const DOC_CODE_RE = /^\s*(?:[A-Za-z]*Error:\s*)?\[doc\.([a-z_]+)\]\s*/;
// findActiveMember's message (spacetimedb/src/index.ts) — the caller left the org
// or was disabled, so the document is no longer theirs to touch.
const NOT_MEMBER_RE = /Not an active member/i;

/** i18n key for each code (`docs.errors.*`, owned by the docs editor package). */
export const DOC_ERROR_I18N_KEYS: Readonly<Record<DocErrorCode, string>> = {
  not_found: "docs.errors.notFound",
  forbidden: "docs.errors.forbidden",
  trashed: "docs.errors.trashed",
  too_large: "docs.errors.tooLarge",
  invalid: "docs.errors.invalid",
  not_published: "docs.errors.notPublished",
};

function rawMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/** The stable `[doc.<code>]` code of a docs reducer failure, or null for anything else. */
export function docErrorCode(err: unknown): DocErrorCode | null {
  const message = rawMessage(err);
  if (!message) return null;
  const match = DOC_CODE_RE.exec(message);
  if (match) return DOC_ERROR_CODES.has(match[1]) ? (match[1] as DocErrorCode) : null;
  if (NOT_MEMBER_RE.test(message)) return "forbidden";
  return null;
}

/** The human part of an error message, without the `[doc.<code>]` prefix. */
export function docErrorMessage(err: unknown): string {
  return rawMessage(err).replace(DOC_CODE_RE, "").trim();
}
