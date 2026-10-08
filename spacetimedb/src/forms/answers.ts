// Forms answer validation: checks a submission against its definition and
// returns a normalized copy. PURE: type imports from ./logic and values from
// ./limits only. Re-exported by ./logic.ts.
//
// Client mirror: lib/forms/answers.ts (parity-tested in scripts/tests/forms/parity.test.ts).

import {
  DRIVE_ITEM_ID_RE,
  FORM_MAX_ANSWERS_BYTES,
  FORM_MAX_FILES_PER_RESPONSE,
  FORM_MAX_LONG_TEXT_LENGTH,
  FORM_MAX_SHORT_TEXT_LENGTH,
  FORM_RATING_MAX,
  isValidDateKey,
  isValidTime,
  textLength,
  utf8ByteLength,
} from './limits';
import type {
  AnswerValue, Answers, FileAnswer, FormDefinitionV1, FormIssue, FormIssueCode, FormValidation, InputQuestion,
} from './logic';

/* ─── Answer validation ────────────────────────────────────────────────────── */

export interface ValidateAnswersOptions {
  /** False on public links and staff-account store tablets: a file answer is an issue, a required one is waived. */
  allowFiles: boolean;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function isFileAnswer(value: unknown): value is FileAnswer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const ids = (value as { driveItemIds?: unknown }).driveItemIds;
  return Array.isArray(ids) && ids.every((id) => typeof id === 'string');
}

function isFileQuestion(q: InputQuestion): boolean {
  return q.type === 'photo' || q.type === 'file';
}

/** Check one answer; returns the normalized value or an issue. */
function checkAnswer(q: InputQuestion, value: unknown): AnswerValue | FormIssue {
  const issue = (code: FormIssueCode, optionId?: string): FormIssue =>
    optionId ? { code, questionId: q.id, optionId } : { code, questionId: q.id };
  switch (q.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof value !== 'string') return issue('invalid_answer');
      const max = q.type === 'short_text' ? FORM_MAX_SHORT_TEXT_LENGTH : FORM_MAX_LONG_TEXT_LENGTH;
      return textLength(value) > max ? issue('text_too_long') : value;
    }
    case 'date':
      return isValidDateKey(value) ? value : issue('invalid_answer');
    case 'time':
      return isValidTime(value) ? value : issue('invalid_answer');
    case 'single_choice':
    case 'dropdown':
      if (typeof value !== 'string') return issue('invalid_answer');
      return q.options.some((o) => o.id === value) ? value : issue('unknown_option', value);
    case 'multi_choice': {
      if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) return issue('invalid_answer');
      const picked = [...new Set(value)];
      const unknown = picked.find((id) => !q.options.some((o) => o.id === id));
      if (unknown !== undefined) return issue('unknown_option', unknown);
      if (q.max !== undefined && picked.length > q.max) return issue('too_many_selections');
      if (q.min !== undefined && picked.length < q.min) return issue('too_few_selections');
      // Stored in option order, so equal answers serialize equally.
      return q.options.filter((o) => picked.includes(o.id)).map((o) => o.id);
    }
    case 'yes_no':
    case 'checklist_item':
      return typeof value === 'boolean' ? value : issue('invalid_answer');
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return issue('invalid_answer');
      if ((q.min !== undefined && value < q.min) || (q.max !== undefined && value > q.max)) return issue('out_of_range');
      return value;
    case 'rating':
      if (typeof value !== 'number' || !Number.isInteger(value)) return issue('invalid_answer');
      return value < 1 || value > FORM_RATING_MAX ? issue('out_of_range') : value;
    case 'scale':
      if (typeof value !== 'number' || !Number.isInteger(value)) return issue('invalid_answer');
      return value < q.min || value > q.max ? issue('out_of_range') : value;
    case 'photo':
    case 'file': {
      if (!isFileAnswer(value)) return issue('invalid_answer');
      const ids = [...new Set(value.driveItemIds)];
      if (!ids.every((id) => DRIVE_ITEM_ID_RE.test(id))) return issue('invalid_answer');
      return ids.length > (q.maxFiles ?? 1) ? issue('too_many_files') : { driveItemIds: ids };
    }
  }
}

function isIssue(value: AnswerValue | FormIssue): value is FormIssue {
  return typeof value === 'object' && value !== null && 'code' in value;
}

/** A required question counts as answered when it has a value; a required checklist item must be checked. */
function satisfiesRequired(q: InputQuestion, value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (q.type === 'checklist_item') return value === true;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (isFileAnswer(value)) return value.driveItemIds.length > 0;
  return true;
}

/**
 * Validate an untrusted submission against `def`. Empty values (`""`, `[]`, null, no files) are dropped, whatever
 * the key; a non-empty answer to an archived question, a section or an unknown id is an issue.
 * On success `value` holds only valid answers.
 */
export function validateAnswers(
  def: FormDefinitionV1,
  input: unknown,
  options: ValidateAnswersOptions,
): FormValidation<Answers> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ code: 'invalid_answers' }] };
  }
  const raw = input as Record<string, unknown>;
  const issues: FormIssue[] = [];
  const out: Answers = {};
  const byId = new Map<string, InputQuestion>();
  for (const q of def.questions) if (q.type !== 'section' && !q.archived) byId.set(q.id, q);

  for (const [id, value] of Object.entries(raw)) {
    if (isEmpty(value) || (isFileAnswer(value) && value.driveItemIds.length === 0)) continue;
    const q = byId.get(id);
    if (!q) {
      issues.push({ code: 'unknown_question', questionId: id });
      continue;
    }
    if (isFileQuestion(q) && !options.allowFiles) {
      issues.push({ code: 'files_not_allowed', questionId: id });
      continue;
    }
    const checked = checkAnswer(q, value);
    if (isIssue(checked)) issues.push(checked);
    else out[id] = checked;
  }

  for (const q of byId.values()) {
    if (!q.required || issues.some((i) => i.questionId === q.id)) continue;
    if (isFileQuestion(q) && !options.allowFiles) continue;
    if (!satisfiesRequired(q, out[q.id])) issues.push({ code: 'required', questionId: q.id });
  }

  if (answerFileItemIds(out).length > FORM_MAX_FILES_PER_RESPONSE) issues.push({ code: 'too_many_files' });
  if (issues.length === 0 && utf8ByteLength(JSON.stringify(out)) > FORM_MAX_ANSWERS_BYTES) {
    issues.push({ code: 'answers_too_large' });
  }
  return issues.length === 0 ? { ok: true, value: out } : { ok: false, issues };
}

/** Parse and validate submitted `answersJson`. Oversized input is rejected before parsing. */
export function parseAnswersJson(
  def: FormDefinitionV1,
  json: string,
  options: ValidateAnswersOptions,
): FormValidation<Answers> {
  if (utf8ByteLength(json) > FORM_MAX_ANSWERS_BYTES) return { ok: false, issues: [{ code: 'answers_too_large' }] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, issues: [{ code: 'invalid_answers' }] };
  }
  return validateAnswers(def, parsed, options);
}

/** Every Drive item id referenced by file/photo answers, deduplicated, in answer order. */
export function answerFileItemIds(answers: Answers): string[] {
  const ids = new Set<string>();
  for (const value of Object.values(answers)) {
    if (isFileAnswer(value)) for (const id of value.driveItemIds) ids.add(id);
  }
  return [...ids];
}
