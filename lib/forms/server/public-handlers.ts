// The anyone-with-the-link Forms endpoint behind app/api/forms/public/[token]
// and the server-rendered app/f/[token] page. Every dependency is injected
// (public-deps.ts builds the real ones), so the tests run without a server.
//
// GET  → the public-safe copy of the form (form_public, read over /sql with the
//        service token) plus a signed render stamp while it is open.
// POST → honeypot (a fake success), stamp age and size checks, then
//        serviceSubmitPublicFormResponse; the module re-validates everything.

import { parseDefinitionJson, isPublicSafe } from "@/lib/forms/schema";
import type { FormDefinitionV1 } from "@/lib/forms/types";
import { sqlNumber, sqlString, type SqlRow } from "@/lib/drive/server/sql-rows";
import {
  PUBLIC_MAX_BODY_BYTES,
  isPublicFormToken,
  mapPublicReducerError,
  parsePublicSubmission,
  publicStatusFor,
  readCappedText,
  signPublicStamp,
  verifyPublicStamp,
  type PublicErrorBody,
  type PublicFormErrorCode,
  type PublicFormsConfig,
} from "./public";

export interface PublicSubmitArgs {
  token: string;
  responseId: string;
  answersJson: string;
  date: string;
}

export interface PublicFormDeps {
  config(): PublicFormsConfig | null;
  now(): number;
  /** One SELECT over /sql as the service identity. */
  sql(query: string, serviceToken: string): Promise<SqlRow[]>;
  /** service_ensure_drive_reader: makes form_public (and the Drive service tables) readable by the service identity. */
  ensureReader(serviceToken: string): Promise<void>;
  submit(serviceToken: string, args: PublicSubmitArgs): Promise<void>;
  log(level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>): void;
}

/** What the page and GET receive. `definition` and `stamp` are present only while the form is open. */
export interface PublicFormPayload {
  storeName: string;
  title: string;
  open: boolean;
  definition: FormDefinitionV1 | null;
  stamp: string | null;
}

export type PublicFormResult<T> = { status: number; body: T | PublicErrorBody };

function fail(code: PublicFormErrorCode, questionId?: string): { status: number; body: PublicErrorBody } {
  return { status: publicStatusFor(code), body: questionId ? { error: code, questionId } : { error: code } };
}

export interface PublicFormHandlers {
  load(token: string): Promise<PublicFormResult<PublicFormPayload>>;
  submit(token: string, req: Request): Promise<PublicFormResult<{ ok: true }>>;
}

export function createPublicFormHandlers(deps: PublicFormDeps): PublicFormHandlers {
  // A fresh service identity is not yet in drive_service_reader, so its first read sees no rows. Ask the module to
  // add it once per process, never once per request: a stream of made-up tokens must not become reducer calls.
  let readerEnsured = false;

  async function selectRow(token: string, serviceToken: string): Promise<SqlRow | null> {
    // The token passed PUBLIC_FORM_TOKEN_RE (64 hex), so it is safe inside the literal.
    const query = `SELECT * FROM form_public WHERE token = '${token}'`;
    let rows = await deps.sql(query, serviceToken);
    if (rows.length === 0 && !readerEnsured) {
      // Set only once the call succeeds: a failed attempt (module not yet published, a network blip) must be
      // retried by a later request, or this instance answers not_found for every real link until it restarts.
      await deps.ensureReader(serviceToken);
      readerEnsured = true;
      rows = await deps.sql(query, serviceToken);
    }
    return rows[0] ?? null;
  }

  async function load(token: string): Promise<PublicFormResult<PublicFormPayload>> {
    if (!isPublicFormToken(token)) return fail("not_found");
    const config = deps.config();
    if (!config) return fail("not_configured");
    let row: SqlRow | null;
    try {
      row = await selectRow(token, config.serviceToken);
    } catch (err) {
      deps.log("error", "forms.public.read_failed", { message: err instanceof Error ? err.message.slice(0, 200) : "" });
      return fail("unavailable");
    }
    if (!row) return fail("not_found");
    const parsed = parseDefinitionJson(sqlString(row, "definition_json"));
    if (!parsed.ok || !isPublicSafe(parsed.value)) return fail("not_found");
    const now = deps.now();
    const closesAtMicros = sqlNumber(row, "closes_at");
    const open = sqlString(row, "status") === "open" && (closesAtMicros === 0 || now * 1000 < closesAtMicros);
    return {
      status: 200,
      body: {
        storeName: sqlString(row, "store_name"),
        title: sqlString(row, "title"),
        open,
        definition: open ? parsed.value : null,
        stamp: open ? signPublicStamp(config.secret, token, now) : null,
      },
    };
  }

  async function submit(token: string, req: Request): Promise<PublicFormResult<{ ok: true }>> {
    if (!isPublicFormToken(token)) return fail("not_found");
    const config = deps.config();
    if (!config) return fail("not_configured");
    const text = await readCappedText(req, PUBLIC_MAX_BODY_BYTES).catch(() => null);
    if (text === null) return fail("too_large");
    const parsed = parsePublicSubmission(text);
    if (!parsed.ok) {
      // A bot that learns which check caught it adapts, so the honeypot answers like a success and drops the body.
      if (parsed.code === "honeypot") {
        deps.log("info", "forms.public.honeypot");
        return { status: 200, body: { ok: true } };
      }
      return fail(parsed.code);
    }
    const stamp = verifyPublicStamp(config.secret, token, parsed.value.stamp, deps.now());
    if (stamp === "too_fast") {
      // Same reason: an early submit reads as a generic `invalid`. The page waits out the minimum itself.
      deps.log("info", "forms.public.too_fast");
      return fail("invalid");
    }
    if (stamp !== "ok") return fail(stamp);
    const { responseId, answersJson, date } = parsed.value;
    try {
      await deps.submit(config.serviceToken, { token, responseId, answersJson, date });
    } catch (err) {
      const mapped = mapPublicReducerError(err);
      if (mapped) return fail(mapped.error, mapped.questionId);
      deps.log("error", "forms.public.submit_failed", { message: err instanceof Error ? err.message.slice(0, 200) : "" });
      return fail("unavailable");
    }
    return { status: 200, body: { ok: true } };
  }

  return { load, submit };
}
