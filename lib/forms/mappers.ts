/* eslint-disable @typescript-eslint/no-explicit-any */
// Row mappers: SpacetimeDB Forms rows → lib/forms/types views.
//
// Rows arrive as generated shapes, so this is the one Forms file where `any` is
// allowed. Every field is coerced defensively, like lib/drive/mappers.ts: a
// malformed or newer row degrades to the most restrictive reading instead of
// throwing inside a render. `definitionJson` is re-validated with the client
// mirror of the module's rules; a definition that does not validate maps to null
// (a broken form, never a guess). `answersJson` is only shape-checked: the
// module validated it against the form version it was written for.

import { idString, toDate } from "@/lib/docs/mappers";
import { parseDefinitionJson } from "./schema";
import {
  FORM_AUDIENCES, FORM_KINDS, FORM_STATUSES, PER_MEMBER_RULES, RESPONSE_SOURCES,
  type AnswerValue, type Answers, type FormAssignmentView, type FormCompletionView, type FormDefinitionV1,
  type FormMetaView, type FormResponseReviewView, type FormResponseView, type FormView,
} from "./types";

function str(value: any): string {
  return value == null ? "" : String(value);
}

/** Lowercased id-like string ('' when missing). */
function lowerId(value: any): string {
  return idString(value).toLowerCase();
}

/** u64 / u32 column → a non-negative safe integer; anything else → 0. */
function count(value: any): number {
  const n = typeof value === "bigint" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), Number.MAX_SAFE_INTEGER) : 0;
}

/** A u64 microseconds-since-epoch column → Date; 0 (or anything unusable) → null. */
function microsDate(value: any): Date | null {
  const micros = count(value);
  return micros > 0 ? new Date(Math.floor(micros / 1000)) : null;
}

function dateOrEpoch(value: any): Date {
  return toDate(value) ?? new Date(0);
}

function oneOf<T extends string>(list: readonly T[], value: any, fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** The stored definition, validated; null when it does not parse or validate. */
export function parseFormDefinition(json: unknown): FormDefinitionV1 | null {
  if (typeof json !== "string" || json === "") return null;
  const parsed = parseDefinitionJson(json);
  return parsed.ok ? parsed.value : null;
}

function answerValue(value: unknown): AnswerValue | undefined {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.every((v) => typeof v === "string") ? (value as string[]) : undefined;
  if (value && typeof value === "object") {
    const ids = (value as { driveItemIds?: unknown }).driveItemIds;
    if (Array.isArray(ids) && ids.every((v) => typeof v === "string")) return { driveItemIds: ids.map((id) => id.toLowerCase()) };
  }
  return undefined;
}

/** `answersJson` → Answers; {} when it does not parse; values of an unknown shape are dropped. */
export function parseAnswersRow(json: unknown): Answers {
  if (typeof json !== "string" || json === "") return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Answers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const mapped = answerValue(value);
    if (mapped !== undefined) out[key] = mapped;
  }
  return out;
}

/** `fileItemIds` (a JSON array of drive item ids) → lowercase ids; [] when it does not parse. */
export function parseIdList(json: unknown): string[] {
  if (typeof json !== "string" || json === "") return [];
  try {
    const raw: unknown = JSON.parse(json);
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase()) : [];
  } catch {
    return [];
  }
}

/** Unknown status → "archived" (hidden from respondents); unknown audience → "private"; unknown kind → "form". */
export function mapForm(row: any): FormView {
  return {
    id: lowerId(row.id),
    organizationId: str(row.organizationId),
    adminScope: str(row.adminScope),
    ownerMemberId: str(row.ownerMemberId),
    title: str(row.title),
    kind: oneOf(FORM_KINDS, row.kind, "form"),
    status: oneOf(FORM_STATUSES, row.status, "archived"),
    audience: oneOf(FORM_AUDIENCES, row.audience, "private"),
    memberVisible: row.memberVisible === true,
    definition: parseFormDefinition(row.definitionJson),
    definitionBytes: count(row.definitionBytes),
    version: count(row.version),
    perMember: oneOf(PER_MEMBER_RULES, row.perMember, "once"),
    responseLimit: count(row.responseLimit),
    closesAt: microsDate(row.closesAt),
    publicEnabled: row.publicEnabled === true,
    hasFileQuestions: row.hasFileQuestions === true,
    trackCompletion: row.trackCompletion === true,
    notifyOwner: row.notifyOwner === true,
    createdByMemberId: str(row.createdByMemberId),
    updatedByMemberId: str(row.updatedByMemberId),
    createdAt: dateOrEpoch(row.createdAt),
    updatedAt: dateOrEpoch(row.updatedAt),
  };
}

export function mapFormMeta(row: any): FormMetaView {
  return {
    formId: lowerId(row.formId),
    organizationId: str(row.organizationId),
    adminScope: str(row.adminScope),
    ownerMemberId: str(row.ownerMemberId),
    publicToken: str(row.publicToken),
    responseCount: count(row.responseCount),
    answerBytes: count(row.answerBytes),
    fileBytes: count(row.fileBytes),
    fileCount: count(row.fileCount),
    lastResponseAt: microsDate(row.lastResponseAt),
    publicWindowStart: microsDate(row.publicWindowStart),
    publicWindowCount: count(row.publicWindowCount),
    updatedAt: dateOrEpoch(row.updatedAt),
    publicResponseCount: count(row.publicResponseCount),
    publicAnswerBytes: count(row.publicAnswerBytes),
    publicPrevWindowCount: count(row.publicPrevWindowCount),
  };
}

/** Unknown source → "public" (no member behind it); unknown review status → "new". */
export function mapFormResponse(row: any): FormResponseView {
  return {
    id: lowerId(row.id),
    organizationId: str(row.organizationId),
    formId: lowerId(row.formId),
    adminScope: str(row.adminScope),
    formOwnerMemberId: str(row.formOwnerMemberId),
    respondentMemberId: str(row.respondentMemberId),
    respondentName: str(row.respondentName),
    formTitle: str(row.formTitle),
    formVersion: count(row.formVersion),
    source: oneOf(RESPONSE_SOURCES, row.source, "public"),
    submittedByIdentity: idString(row.submittedByIdentity),
    answers: parseAnswersRow(row.answersJson),
    answerBytes: count(row.answerBytes),
    fileItemIds: parseIdList(row.fileItemIds),
    fileBytes: count(row.fileBytes),
    period: str(row.period),
    date: str(row.date),
    reviewStatus: row.reviewStatus === "reviewed" ? "reviewed" : "new",
    createdAt: dateOrEpoch(row.createdAt),
    updatedAt: dateOrEpoch(row.updatedAt),
  };
}

export function mapFormResponseReview(row: any): FormResponseReviewView {
  return {
    responseId: lowerId(row.responseId),
    organizationId: str(row.organizationId),
    formId: lowerId(row.formId),
    adminScope: str(row.adminScope),
    reviewNote: str(row.reviewNote),
    reviewedByName: str(row.reviewedByName),
    noteBytes: count(row.noteBytes),
    updatedAt: dateOrEpoch(row.updatedAt),
  };
}

export function mapFormAssignment(row: any): FormAssignmentView {
  return {
    id: str(row.id),
    organizationId: str(row.organizationId),
    formId: lowerId(row.formId),
    memberId: str(row.memberId),
    dueDate: str(row.dueDate),
    createdByMemberId: str(row.createdByMemberId),
    createdAt: dateOrEpoch(row.createdAt),
  };
}

export function mapFormCompletion(row: any): FormCompletionView {
  return {
    id: str(row.id),
    organizationId: str(row.organizationId),
    formId: lowerId(row.formId),
    memberId: str(row.memberId),
    memberName: str(row.memberName),
    period: str(row.period),
    date: str(row.date),
    completedAt: dateOrEpoch(row.completedAt),
  };
}
