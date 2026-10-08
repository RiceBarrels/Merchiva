// Forms write wrappers (design B.4/B.5): the form lifecycle, assignments,
// submissions and reviews.
//
// A sibling of lib/spacetimedb/actions.ts, which stays untouched: import these
// from "@/lib/spacetimedb/actions/forms". Like the Drive area file, calls go
// straight to the reducers and never through `mutationQueue` — a replayed
// submission long after its screen is gone would surprise the respondent.
// Reducers cannot return values, so new form and response ids are made here and
// returned (lowercase uuid v4, the shape the module checks).
//
// Failures reject with the module's `[forms.<code>] …` message (or
// `[drive.<code>] …` on a full store), or with a FormsClientError for what the
// client knows first: `not_connected` (no connection or no active store) and
// `not_published` (the connected bindings lack the reducer). Screens turn any of
// them into copy with formsErrorKey.

import { todayKey } from "@/lib/date-key";
import { newDocumentId } from "@/lib/docs/ids";
import { driveErrorCode, driveErrorKey } from "@/lib/drive/errors";
import { serializeDefinition, type FormIssueCode } from "@/lib/forms/schema";
import type {
  Answers, FormAudience, FormDefinitionV1, FormKind, FormStatus, PerMemberRule, ReviewStatus,
} from "@/lib/forms/types";
import { getActiveOrgId, getConnection } from "@/lib/spacetimedb/client";

// ── Errors ──────────────────────────────────────────────────────────────────

/** `[forms.<code>]` codes a forms reducer raises outside the issue list (= FormErrorCode in spacetimedb/src/forms/access.ts; parity-tested). */
export const FORM_SERVER_ERROR_CODES = [
  "forbidden", "not_found", "invalid", "exists", "conflict", "operator", "not_open", "closed",
  "not_assigned", "invalid_date", "already_submitted", "response_limit", "too_many_forms",
  "org_storage_full", "file_not_found", "files_not_allowed", "public_unsafe", "rate_limited",
  "invalid_settings", "invalid_status",
] as const;
export type FormServerErrorCode = (typeof FORM_SERVER_ERROR_CODES)[number];

/** Definition and answer issue codes (= FormIssueCode in lib/forms/schema.ts; parity-tested). */
export const FORM_ISSUE_CODES = [
  "invalid_definition", "definition_too_large", "title_required", "title_too_long", "description_too_long",
  "confirmation_too_long", "no_questions", "too_many_questions", "invalid_question", "invalid_question_id",
  "duplicate_question_id", "invalid_question_type", "question_title_required", "question_title_too_long",
  "help_too_long", "options_required", "too_many_options", "invalid_option_id", "duplicate_option_id",
  "option_label_required", "option_label_too_long", "invalid_range", "scale_label_too_long", "invalid_max_files",
  "invalid_accept", "question_removed", "question_type_changed", "option_removed", "invalid_answers",
  "answers_too_large", "unknown_question", "required", "invalid_answer", "text_too_long", "unknown_option",
  "out_of_range", "too_many_selections", "too_few_selections", "too_many_files", "files_not_allowed",
] as const satisfies readonly FormIssueCode[];

export type FormsClientErrorCode = "not_connected" | "not_published" | "network" | "generic";

export class FormsClientError extends Error {
  readonly code: FormsClientErrorCode;
  constructor(code: FormsClientErrorCode, message?: string) {
    super(message ?? `[forms.${code}]`);
    this.name = "FormsClientError";
    this.code = code;
  }
}

export const FORMS_GENERIC_ERROR_KEY = "forms.errors.generic";

const KNOWN_FORM_CODES: ReadonlySet<string> = new Set<string>([
  ...FORM_SERVER_ERROR_CODES, ...FORM_ISSUE_CODES, "not_connected", "not_published", "network", "generic",
]);
const FORMS_CODE_RE = /\[forms\.([a-z_]+)\]/;
const DRIVE_CODE_RE = /\[drive\.[a-z_]+\]/;
const NOT_MEMBER_RE = /Not an active member/i;

function rawMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/** The `forms` code of a failure (a known `[forms.<code>]`, a FormsClientError), or null. */
export function formsErrorCode(err: unknown): string | null {
  if (err instanceof FormsClientError) return err.code;
  const match = FORMS_CODE_RE.exec(rawMessage(err));
  if (match) return KNOWN_FORM_CODES.has(match[1]) ? match[1] : "generic";
  return null;
}

/** The question a `[forms.<issue>] q_xxxxxxxxxxxx` failure names, or null. */
export function formsErrorQuestionId(err: unknown): string | null {
  const match = /\[forms\.[a-z_]+\]\s+(q_[0-9a-z]{12})\b/.exec(rawMessage(err));
  return match ? match[1] : null;
}

/**
 * The i18n key for any failure a Forms screen shows: `forms.errors.<code>` for a forms code, the Drive key for a
 * Drive failure (a full store on submit, a refused or failed file upload), `forms.errors.forbidden` when the caller
 * left the store, `forms.errors.network` while offline, else `forms.errors.generic`.
 */
export function formsErrorKey(err: unknown): string {
  const code = formsErrorCode(err);
  if (code) return `forms.errors.${code}`;
  const message = rawMessage(err);
  if (NOT_MEMBER_RE.test(message)) return "forms.errors.forbidden";
  const drive = driveErrorCode(err);
  if (DRIVE_CODE_RE.test(message) || (drive !== null && drive !== "network")) return driveErrorKey(err);
  if (err != null && typeof navigator !== "undefined" && navigator.onLine === false) return "forms.errors.network";
  return FORMS_GENERIC_ERROR_KEY;
}

// ── Plumbing ────────────────────────────────────────────────────────────────

type ReducerCall = (args: Record<string, unknown>) => Promise<void>;
type ReducerFn = (this: unknown, args: Record<string, unknown>) => unknown;

/** The live connection's reducer `name`, or a FormsClientError. */
function formsReducer(name: string): ReducerCall {
  const connection = getConnection();
  if (!connection) throw new FormsClientError("not_connected");
  const reducers = connection.reducers as unknown as Record<string, unknown> | undefined;
  const reducer = reducers?.[name];
  if (typeof reducer !== "function") {
    throw new FormsClientError(
      "not_published",
      `[forms.not_published] Reducer "${name}" is not available. Publish the module and run \`spacetime generate\` to enable Forms.`,
    );
  }
  return async (args) => {
    await (reducer as ReducerFn).call(reducers, args);
  };
}

async function call(name: string, args: Record<string, unknown>): Promise<void> {
  await formsReducer(name)(args);
}

function organizationOf(explicit: string | undefined): string {
  const id = explicit?.trim();
  if (id) return id;
  try {
    return getActiveOrgId();
  } catch {
    throw new FormsClientError("not_connected", "[forms.not_connected] No active store");
  }
}

/** Ids are lowercase uuids on the server. */
function idKey(id: string): string {
  return String(id ?? "").trim().toLowerCase();
}

/** A Date (or ms) → the module's u64 microseconds; null / 0 = never. */
export function closesAtMicros(value: Date | number | null | undefined): bigint {
  const ms = value instanceof Date ? value.getTime() : Number(value ?? 0);
  return Number.isFinite(ms) && ms > 0 ? BigInt(Math.trunc(ms)) * BigInt(1000) : BigInt(0);
}

// ── Forms ───────────────────────────────────────────────────────────────────

export interface CreateFormInput {
  kind: FormKind;
  definition: FormDefinitionV1;
  /** Default: the active store. */
  organizationId?: string;
  /** Default: a new uuid. */
  formId?: string;
}

/** Creates a draft form owned by the caller (an owner or manager); resolves with its id. */
export async function createForm(input: CreateFormInput): Promise<string> {
  const formId = idKey(input.formId ?? newDocumentId());
  await call("createForm", {
    organizationId: organizationOf(input.organizationId),
    formId,
    kind: input.kind,
    definitionJson: serializeDefinition(input.definition),
  });
  return formId;
}

/** Replaces the definition; `[forms.conflict]` when `expectedVersion` is stale (someone saved in between). */
export async function updateFormDefinition(formId: string, definition: FormDefinitionV1, expectedVersion: number): Promise<void> {
  await call("updateFormDefinition", {
    formId: idKey(formId),
    definitionJson: serializeDefinition(definition),
    expectedVersion: Math.max(0, Math.trunc(expectedVersion)),
  });
}

export interface FormSettingsInput {
  audience: FormAudience;
  perMember: PerMemberRule;
  responseLimit: number;
  /** null = never closes. */
  closesAt: Date | null;
  trackCompletion: boolean;
  notifyOwner: boolean;
}

export async function updateFormSettings(formId: string, settings: FormSettingsInput): Promise<void> {
  await call("updateFormSettings", {
    formId: idKey(formId),
    audience: settings.audience,
    perMember: settings.perMember,
    responseLimit: Math.max(0, Math.trunc(settings.responseLimit)),
    closesAt: closesAtMicros(settings.closesAt),
    trackCompletion: settings.trackCompletion,
    notifyOwner: settings.notifyOwner,
  });
}

/** Opening needs at least one answerable question (`[forms.no_questions]`). */
export async function setFormStatus(formId: string, status: FormStatus): Promise<void> {
  await call("setFormStatus", { formId: idKey(formId), status });
}

/** Turns the anyone-with-the-link URL on or off; `rotate` issues a new token. Enabling and rotating are owner-only. */
export async function setFormPublicLink(formId: string, enabled: boolean, rotate = false): Promise<void> {
  await call("setFormPublicLink", { formId: idKey(formId), enabled, rotate });
}

export async function transferForm(formId: string, newOwnerMemberId: string): Promise<void> {
  await call("transferForm", { formId: idKey(formId), newOwnerMemberId: String(newOwnerMemberId ?? "").trim() });
}

/** Deletes the form with its responses; file answers stay in the respondents' My files. */
export async function deleteForm(formId: string): Promise<void> {
  await call("deleteForm", { formId: idKey(formId) });
}

/** `dueDate`: a store-local YYYY-MM-DD, or '' for none. */
export async function assignForm(formId: string, memberId: string, dueDate = ""): Promise<void> {
  await call("assignForm", { formId: idKey(formId), memberId: String(memberId ?? "").trim(), dueDate });
}

export async function unassignForm(formId: string, memberId: string): Promise<void> {
  await call("unassignForm", { formId: idKey(formId), memberId: String(memberId ?? "").trim() });
}

// ── Responses ───────────────────────────────────────────────────────────────

export type FormSubmitSurface = "manager" | "store" | "personal";

export interface SubmitFormResponseInput {
  formId: string;
  answers: Answers;
  surface: FormSubmitSurface;
  /** The PIN operator on /store ('' or absent = the caller). */
  actingMemberId?: string | null;
  /** Store-local YYYY-MM-DD (lib/date-key.ts); default today. */
  date?: string;
  /** Default: the active store. */
  organizationId?: string;
  /** Default: a new uuid. Re-sending the same id after a dropped connection is a no-op on the server. */
  responseId?: string;
}

/** Submits one response; resolves with its id. File answers carry Drive item ids from lib/forms/uploads.ts. */
export async function submitFormResponse(input: SubmitFormResponseInput): Promise<string> {
  const responseId = idKey(input.responseId ?? newDocumentId());
  await call("submitFormResponse", {
    organizationId: organizationOf(input.organizationId),
    formId: idKey(input.formId),
    responseId,
    answersJson: JSON.stringify(input.answers),
    date: input.date ?? todayKey(),
    surface: input.surface,
    actingMemberId: String(input.actingMemberId ?? "").trim(),
  });
  return responseId;
}

/** Marks a response new / reviewed with an optional note (only Drive admins read the note). */
export async function reviewFormResponse(responseId: string, reviewStatus: ReviewStatus, reviewNote = ""): Promise<void> {
  await call("reviewFormResponse", { responseId: idKey(responseId), reviewStatus, reviewNote });
}

export async function deleteFormResponse(responseId: string): Promise<void> {
  await call("deleteFormResponse", { responseId: idKey(responseId) });
}
