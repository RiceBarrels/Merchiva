// Forms rules shared by every forms reducer: the stored definition format
// (FormDefinitionV1), definition and answer validation, the edit rules once a
// form has responses, and the row enums. PURE: imports only ./limits and
// ./answers (no other module code), so Bun tests import it directly.
//
// Client mirror (same names and issue codes): lib/forms/{types,schema,answers}.ts.
// scripts/tests/forms/parity.test.ts runs both on the same fixtures: change both.
// The client is never trusted; every reducer re-validates with this file.

import {
  FORM_MAX_CONFIRMATION_LENGTH,
  FORM_MAX_DEFINITION_BYTES,
  FORM_MAX_DESCRIPTION_LENGTH,
  FORM_MAX_FILES_PER_RESPONSE,
  FORM_MAX_HELP_LENGTH,
  FORM_MAX_OPTION_LABEL_LENGTH,
  FORM_MAX_OPTIONS,
  FORM_MAX_QUESTION_TITLE_LENGTH,
  FORM_MAX_QUESTIONS,
  FORM_MAX_SCALE_LABEL_LENGTH,
  FORM_MAX_TITLE_LENGTH,
  FORM_SCALE_MAX_HIGH,
  FORM_SCALE_MAX_LOW,
  FORM_SCALE_MIN_HIGH,
  FORM_SCALE_MIN_LOW,
  isOptionId,
  isQuestionId,
  isValidAccept,
  textLength,
  utf8ByteLength,
} from './limits';

export * from './limits';
export * from './answers';

/* ─── Row enums ────────────────────────────────────────────────────────────── */

export const FORM_DEFINITION_VERSION = 1 as const;

export const QUESTION_TYPES = [
  'section', 'short_text', 'long_text', 'single_choice', 'multi_choice', 'dropdown', 'yes_no',
  'number', 'date', 'time', 'rating', 'scale', 'checklist_item', 'photo', 'file',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const FORM_KINDS = ['form', 'checklist', 'report', 'survey'] as const;
export type FormKind = (typeof FORM_KINDS)[number];
export const FORM_STATUSES = ['draft', 'open', 'closed', 'archived'] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];
export const FORM_AUDIENCES = ['members', 'assigned', 'private'] as const;
export type FormAudience = (typeof FORM_AUDIENCES)[number];
export const RESPONSE_SOURCES = ['manager', 'store', 'personal', 'public'] as const;
export type ResponseSource = (typeof RESPONSE_SOURCES)[number];
export const REVIEW_STATUSES = ['new', 'reviewed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** form.memberVisible — the column the member RLS rule filters on (design B.2). */
export function formMemberVisible(status: string, audience: string): boolean {
  return (status === 'open' || status === 'closed') && audience !== 'private';
}

/* ─── Definition types ─────────────────────────────────────────────────────── */

export interface FormOption {
  id: string;
  label: string;
}

interface QuestionBase {
  id: string;
  title: string;
  help?: string;
  required: boolean;
  archived?: boolean;
}

export type Question = QuestionBase & (
  | { type: 'section' }
  | { type: 'short_text' | 'long_text' | 'yes_no' | 'checklist_item' | 'date' | 'time' | 'rating' }
  | { type: 'single_choice' | 'dropdown'; options: FormOption[] }
  | { type: 'multi_choice'; options: FormOption[]; min?: number; max?: number }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'scale'; min: number; max: number; minLabel?: string; maxLabel?: string }
  | { type: 'photo' | 'file'; maxFiles?: number; accept?: string }
);
export type InputQuestion = Exclude<Question, { type: 'section' }>;

export interface FormDefinitionV1 {
  v: typeof FORM_DEFINITION_VERSION;
  title: string;
  description: string;
  questions: Question[];
  settings: { confirmation: string };
}

export interface FileAnswer {
  driveItemIds: string[];
}
export type AnswerValue = string | string[] | number | boolean | FileAnswer;
export type Answers = Record<string, AnswerValue>;

/* ─── Issues ───────────────────────────────────────────────────────────────── */

export type FormIssueCode =
  | 'invalid_definition' | 'definition_too_large' | 'title_required' | 'title_too_long'
  | 'description_too_long' | 'confirmation_too_long' | 'no_questions' | 'too_many_questions'
  | 'invalid_question' | 'invalid_question_id' | 'duplicate_question_id' | 'invalid_question_type'
  | 'question_title_required' | 'question_title_too_long' | 'help_too_long' | 'options_required'
  | 'too_many_options' | 'invalid_option_id' | 'duplicate_option_id' | 'option_label_required'
  | 'option_label_too_long' | 'invalid_range' | 'scale_label_too_long' | 'invalid_max_files'
  | 'invalid_accept' | 'question_removed' | 'question_type_changed' | 'option_removed'
  | 'invalid_answers' | 'answers_too_large' | 'unknown_question' | 'required' | 'invalid_answer'
  | 'text_too_long' | 'unknown_option' | 'out_of_range' | 'too_many_selections'
  | 'too_few_selections' | 'too_many_files' | 'files_not_allowed';

export interface FormIssue {
  code: FormIssueCode;
  questionId?: string;
  optionId?: string;
}

export type FormValidation<T> = { ok: true; value: T } | { ok: false; issues: FormIssue[] };

/* ─── Question helpers ─────────────────────────────────────────────────────── */

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value);
}

export function isInputQuestion(q: Question): q is InputQuestion {
  return q.type !== 'section';
}

/** Questions a new respondent sees and may answer: inputs that are not archived. */
export function answerableQuestions(def: FormDefinitionV1): InputQuestion[] {
  return def.questions.filter((q): q is InputQuestion => isInputQuestion(q) && !q.archived);
}

export function hasFileQuestions(def: FormDefinitionV1): boolean {
  return def.questions.some((q) => q.type === 'photo' || q.type === 'file');
}

/** A definition may be offered on a public link iff it has no photo/file question (archived ones included). */
export function isPublicSafe(def: FormDefinitionV1): boolean {
  return !hasFileQuestions(def);
}

export function serializeDefinition(def: FormDefinitionV1): string {
  return JSON.stringify(def);
}

export function definitionBytes(def: FormDefinitionV1): number {
  return utf8ByteLength(serializeDefinition(def));
}

/* ─── Definition validation ────────────────────────────────────────────────── */

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function optionalText(value: unknown): string | null {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : null;
}

function validateOptions(raw: unknown, qid: string, issues: FormIssue[]): FormOption[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push({ code: 'options_required', questionId: qid });
    return [];
  }
  if (raw.length > FORM_MAX_OPTIONS) issues.push({ code: 'too_many_options', questionId: qid });
  const seen = new Set<string>();
  const out: FormOption[] = [];
  for (const o of raw) {
    const id = isRec(o) ? o.id : undefined;
    const label = isRec(o) ? o.label : undefined;
    if (!isOptionId(id)) {
      issues.push({ code: 'invalid_option_id', questionId: qid });
      continue;
    }
    if (seen.has(id)) issues.push({ code: 'duplicate_option_id', questionId: qid, optionId: id });
    seen.add(id);
    if (typeof label !== 'string' || label.trim() === '') {
      issues.push({ code: 'option_label_required', questionId: qid, optionId: id });
      continue;
    }
    if (textLength(label) > FORM_MAX_OPTION_LABEL_LENGTH) {
      issues.push({ code: 'option_label_too_long', questionId: qid, optionId: id });
    }
    out.push({ id, label });
  }
  return out;
}

/** Validate one question; returns the normalized question (unknown fields dropped) or null. */
function validateQuestion(raw: unknown, issues: FormIssue[]): Question | null {
  if (!isRec(raw)) {
    issues.push({ code: 'invalid_question' });
    return null;
  }
  const id = raw.id;
  if (!isQuestionId(id)) {
    issues.push({ code: 'invalid_question_id' });
    return null;
  }
  const type = raw.type;
  if (!isQuestionType(type)) {
    issues.push({ code: 'invalid_question_type', questionId: id });
    return null;
  }
  const title = raw.title;
  if (typeof title !== 'string' || title.trim() === '') issues.push({ code: 'question_title_required', questionId: id });
  else if (textLength(title) > FORM_MAX_QUESTION_TITLE_LENGTH) issues.push({ code: 'question_title_too_long', questionId: id });
  const help = optionalText(raw.help);
  if (help === null || textLength(help) > FORM_MAX_HELP_LENGTH) issues.push({ code: 'help_too_long', questionId: id });
  if (raw.required !== undefined && typeof raw.required !== 'boolean') issues.push({ code: 'invalid_question', questionId: id });
  if (raw.archived !== undefined && typeof raw.archived !== 'boolean') issues.push({ code: 'invalid_question', questionId: id });

  // Key order matches the client's normalized copy, so both serialize to the same bytes.
  const base: QuestionBase = {
    id,
    title: typeof title === 'string' ? title : '',
    ...(help ? { help } : {}),
    required: type !== 'section' && raw.required === true,
    ...(raw.archived === true ? { archived: true } : {}),
  };
  return withTypeFields(type, base, raw, issues);
}

function withTypeFields(type: QuestionType, base: QuestionBase, raw: Rec, issues: FormIssue[]): Question {
  const qid = base.id;
  switch (type) {
    case 'section':
    case 'short_text':
    case 'long_text':
    case 'yes_no':
    case 'checklist_item':
    case 'date':
    case 'time':
    case 'rating':
      return { ...base, type };
    case 'single_choice':
    case 'dropdown':
      return { ...base, type, options: validateOptions(raw.options, qid, issues) };
    case 'multi_choice': {
      const options = validateOptions(raw.options, qid, issues);
      const min = raw.min;
      const max = raw.max;
      const badMin = min !== undefined && (!isInt(min) || min < 0 || min > options.length);
      const badMax = max !== undefined && (!isInt(max) || max < 1 || max > options.length);
      const crossed = isInt(min) && isInt(max) && min > max;
      if (badMin || badMax || crossed) issues.push({ code: 'invalid_range', questionId: qid });
      return { ...base, type, options, ...(isInt(min) ? { min } : {}), ...(isInt(max) ? { max } : {}) };
    }
    case 'number': {
      const min = raw.min;
      const max = raw.max;
      const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
      const bad = (min !== undefined && !finite(min)) || (max !== undefined && !finite(max));
      if (bad || (finite(min) && finite(max) && min > max)) issues.push({ code: 'invalid_range', questionId: qid });
      return { ...base, type, ...(finite(min) ? { min } : {}), ...(finite(max) ? { max } : {}) };
    }
    case 'scale': {
      const min = raw.min;
      const max = raw.max;
      const okMin = isInt(min) && min >= FORM_SCALE_MIN_LOW && min <= FORM_SCALE_MIN_HIGH;
      const okMax = isInt(max) && max >= FORM_SCALE_MAX_LOW && max <= FORM_SCALE_MAX_HIGH;
      if (!okMin || !okMax) issues.push({ code: 'invalid_range', questionId: qid });
      const minLabel = optionalText(raw.minLabel);
      const maxLabel = optionalText(raw.maxLabel);
      for (const label of [minLabel, maxLabel]) {
        if (label === null || textLength(label) > FORM_MAX_SCALE_LABEL_LENGTH) {
          issues.push({ code: 'scale_label_too_long', questionId: qid });
        }
      }
      return {
        ...base,
        type,
        min: okMin ? min : FORM_SCALE_MIN_HIGH,
        max: okMax ? max : 5,
        ...(minLabel ? { minLabel } : {}),
        ...(maxLabel ? { maxLabel } : {}),
      };
    }
    case 'photo':
    case 'file': {
      const maxFiles = raw.maxFiles;
      if (maxFiles !== undefined && (!isInt(maxFiles) || maxFiles < 1 || maxFiles > FORM_MAX_FILES_PER_RESPONSE)) {
        issues.push({ code: 'invalid_max_files', questionId: qid });
      }
      const accept = type === 'file' ? raw.accept : undefined;
      if (accept !== undefined && !isValidAccept(accept)) issues.push({ code: 'invalid_accept', questionId: qid });
      return {
        ...base,
        type,
        ...(isInt(maxFiles) ? { maxFiles } : {}),
        ...(typeof accept === 'string' && accept !== '' ? { accept } : {}),
      };
    }
  }
}

/**
 * Validate an untrusted definition. On success `value` is a normalized copy holding only known fields, so a
 * stored definition never carries anything a renderer could interpret beyond this schema.
 */
export function validateDefinition(input: unknown): FormValidation<FormDefinitionV1> {
  if (!isRec(input) || input.v !== FORM_DEFINITION_VERSION || !Array.isArray(input.questions)) {
    return { ok: false, issues: [{ code: 'invalid_definition' }] };
  }
  const issues: FormIssue[] = [];
  const title = input.title;
  if (typeof title !== 'string' || title.trim() === '') issues.push({ code: 'title_required' });
  else if (textLength(title) > FORM_MAX_TITLE_LENGTH) issues.push({ code: 'title_too_long' });
  const description = optionalText(input.description);
  if (description === null || textLength(description) > FORM_MAX_DESCRIPTION_LENGTH) {
    issues.push({ code: 'description_too_long' });
  }
  const confirmation = optionalText(isRec(input.settings) ? input.settings.confirmation : undefined);
  if (input.settings !== undefined && !isRec(input.settings)) issues.push({ code: 'invalid_definition' });
  if (confirmation === null || textLength(confirmation) > FORM_MAX_CONFIRMATION_LENGTH) {
    issues.push({ code: 'confirmation_too_long' });
  }

  const rawQuestions: unknown[] = input.questions;
  if (rawQuestions.length > FORM_MAX_QUESTIONS) issues.push({ code: 'too_many_questions' });
  const questions: Question[] = [];
  const seen = new Set<string>();
  for (const raw of rawQuestions) {
    const q = validateQuestion(raw, issues);
    if (!q) continue;
    if (seen.has(q.id)) issues.push({ code: 'duplicate_question_id', questionId: q.id });
    seen.add(q.id);
    questions.push(q);
  }
  if (!questions.some((q) => isInputQuestion(q) && !q.archived)) issues.push({ code: 'no_questions' });

  const value: FormDefinitionV1 = {
    v: FORM_DEFINITION_VERSION,
    title: typeof title === 'string' ? title : '',
    description: description ?? '',
    questions,
    settings: { confirmation: confirmation ?? '' },
  };
  if (issues.length === 0 && definitionBytes(value) > FORM_MAX_DEFINITION_BYTES) {
    issues.push({ code: 'definition_too_large' });
  }
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

/** Parse and validate stored `definitionJson`. Oversized input is rejected before parsing. */
export function parseDefinitionJson(json: string): FormValidation<FormDefinitionV1> {
  if (utf8ByteLength(json) > FORM_MAX_DEFINITION_BYTES) return { ok: false, issues: [{ code: 'definition_too_large' }] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, issues: [{ code: 'invalid_definition' }] };
  }
  return validateDefinition(parsed);
}

/* ─── Edits after responses exist (type lock) ──────────────────────────────── */

/**
 * Rules for replacing `prev` with `next` once the form has responses, so every stored answer keeps its meaning:
 * a question is never removed (archive it), its type never changes, and a choice option is never removed.
 * Before any response, every edit is allowed.
 */
export function checkDefinitionEdit(prev: FormDefinitionV1, next: FormDefinitionV1, hasResponses: boolean): FormIssue[] {
  if (!hasResponses) return [];
  const issues: FormIssue[] = [];
  const nextById = new Map(next.questions.map((q) => [q.id, q] as const));
  for (const before of prev.questions) {
    const after = nextById.get(before.id);
    if (!after) {
      if (before.type !== 'section') issues.push({ code: 'question_removed', questionId: before.id });
      continue;
    }
    if (after.type !== before.type) {
      issues.push({ code: 'question_type_changed', questionId: before.id });
      continue;
    }
    if ('options' in before && 'options' in after) {
      const kept = new Set(after.options.map((o) => o.id));
      for (const o of before.options) {
        if (!kept.has(o.id)) issues.push({ code: 'option_removed', questionId: before.id, optionId: o.id });
      }
    }
  }
  return issues;
}

/** `[forms.<code>]` text of the first issue, for a reducer's thrown error. */
export function formIssueError(issues: FormIssue[]): string {
  const first = issues[0];
  if (!first) return '[forms.invalid_definition]';
  return `[forms.${first.code}]${first.questionId ? ` ${first.questionId}` : ''}`;
}
