/**
 * Forms: the stored definition format (`FormDefinitionV1`), answers, and the row view types the client maps
 * SpacetimeDB rows into.
 *
 * The stored format is ours, never a renderer's: the module mirrors these shapes in
 * `spacetimedb/src/forms/logic.ts` and re-validates every definition and every submission. Validation and
 * limits live in `lib/forms/schema.ts`.
 *
 * Pure types: this module imports nothing.
 */

/* ─── Definition ─────────────────────────────────────────────────────────── */

export const FORM_DEFINITION_VERSION = 1 as const;

/** Every question type, in builder palette order. `section` is a heading/page break, not an input. */
export const QUESTION_TYPES = [
  "section",
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "dropdown",
  "yes_no",
  "number",
  "date",
  "time",
  "rating",
  "scale",
  "checklist_item",
  "photo",
  "file",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
/** Types that collect an answer (everything but `section`). */
export type InputQuestionType = Exclude<QuestionType, "section">;
export type TextQuestionType = "short_text" | "long_text";
export type ChoiceQuestionType = "single_choice" | "multi_choice" | "dropdown";
export type BooleanQuestionType = "yes_no" | "checklist_item";
export type FileQuestionType = "photo" | "file";

/** A choice. `id` is `o_<8 base36>` and maps to the renderer's choice value; `label` is shown. */
export interface FormOption {
  id: string;
  label: string;
}

interface QuestionBase {
  /** `q_<12 base36>`; stable for the life of the form (answers are keyed by it). */
  id: string;
  title: string;
  help?: string;
  required: boolean;
  /** Hidden from new respondents but kept so old answers still have a column. */
  archived?: boolean;
}

export interface SectionQuestion extends QuestionBase {
  type: "section";
}

export interface TextQuestion extends QuestionBase {
  type: TextQuestionType;
}

export interface ChoiceQuestion extends QuestionBase {
  type: ChoiceQuestionType;
  options: FormOption[];
  /** `multi_choice` only: minimum / maximum number of selections. */
  min?: number;
  max?: number;
}

export interface BooleanQuestion extends QuestionBase {
  type: BooleanQuestionType;
}

export interface NumberQuestion extends QuestionBase {
  type: "number";
  min?: number;
  max?: number;
}

export interface DateQuestion extends QuestionBase {
  type: "date";
}

export interface TimeQuestion extends QuestionBase {
  type: "time";
}

/** Stars, always 1..FORM_RATING_MAX. */
export interface RatingQuestion extends QuestionBase {
  type: "rating";
}

/** Integer scale `min..max` with optional end labels. */
export interface ScaleQuestion extends QuestionBase {
  type: "scale";
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface FileQuestion extends QuestionBase {
  type: FileQuestionType;
  /** Files this question accepts per response (1..FORM_MAX_FILES_PER_RESPONSE). Default 1. */
  maxFiles?: number;
  /** `file` only: comma-separated extensions / MIME patterns (`.pdf,image/*`). `photo` is always `image/*`. */
  accept?: string;
}

export type Question =
  | SectionQuestion
  | TextQuestion
  | ChoiceQuestion
  | BooleanQuestion
  | NumberQuestion
  | DateQuestion
  | TimeQuestion
  | RatingQuestion
  | ScaleQuestion
  | FileQuestion;

export type InputQuestion = Exclude<Question, SectionQuestion>;

export interface FormSettings {
  /** Shown after a submission; '' means the default localized thank-you. Plain text, never HTML. */
  confirmation: string;
}

export interface FormDefinitionV1 {
  v: typeof FORM_DEFINITION_VERSION;
  title: string;
  description: string;
  questions: Question[];
  settings: FormSettings;
}

/* ─── Answers ────────────────────────────────────────────────────────────── */

/** A file/photo answer: Drive items in the respondent's My files. Bytes never live in the form tables. */
export interface FileAnswer {
  driveItemIds: string[];
}

/**
 * One answer by question type:
 * - short_text, long_text, date (`YYYY-MM-DD`), time (`HH:MM`), single_choice, dropdown → string (option id for choices)
 * - multi_choice → string[] (option ids)
 * - yes_no, checklist_item → boolean
 * - number, rating, scale → number
 * - photo, file → FileAnswer
 */
export type AnswerValue = string | string[] | number | boolean | FileAnswer;

/** Keyed by question id. A missing key means unanswered. */
export type Answers = Record<string, AnswerValue>;

/* ─── Row enums ──────────────────────────────────────────────────────────── */

export const FORM_KINDS = ["form", "checklist", "report", "survey"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export const FORM_STATUSES = ["draft", "open", "closed", "archived"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const FORM_AUDIENCES = ["members", "assigned", "private"] as const;
export type FormAudience = (typeof FORM_AUDIENCES)[number];

/** How often one member may respond. */
export const PER_MEMBER_RULES = ["unlimited", "once", "daily", "weekly"] as const;
export type PerMemberRule = (typeof PER_MEMBER_RULES)[number];

export const RESPONSE_SOURCES = ["manager", "store", "personal", "public"] as const;
export type ResponseSource = (typeof RESPONSE_SOURCES)[number];

export const REVIEW_STATUSES = ["new", "reviewed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/* ─── Row views (what the mappers return) ────────────────────────────────── */

/** `form`. `definition` is null when `definitionJson` does not parse/validate (shown as a broken form). */
export interface FormView {
  id: string;
  organizationId: string;
  adminScope: string;
  ownerMemberId: string;
  title: string;
  kind: FormKind;
  status: FormStatus;
  audience: FormAudience;
  memberVisible: boolean;
  definition: FormDefinitionV1 | null;
  definitionBytes: number;
  version: number;
  perMember: PerMemberRule;
  responseLimit: number;
  /** null = never closes. */
  closesAt: Date | null;
  publicEnabled: boolean;
  hasFileQuestions: boolean;
  trackCompletion: boolean;
  notifyOwner: boolean;
  createdByMemberId: string;
  updatedByMemberId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** `form_meta`: counters and the public token; readable by Drive admins only. */
export interface FormMetaView {
  formId: string;
  organizationId: string;
  adminScope: string;
  ownerMemberId: string;
  /** '' = public link off. */
  publicToken: string;
  responseCount: number;
  answerBytes: number;
  fileBytes: number;
  fileCount: number;
  lastResponseAt: Date | null;
  publicWindowStart: Date | null;
  publicWindowCount: number;
  updatedAt: Date;
  /** The public link's share of `responseCount` / `answerBytes`. */
  publicResponseCount: number;
  publicAnswerBytes: number;
  publicPrevWindowCount: number;
}

/** `form_response`. `answers` is parsed from `answersJson` ({} when it does not parse). */
export interface FormResponseView {
  id: string;
  organizationId: string;
  formId: string;
  adminScope: string;
  formOwnerMemberId: string;
  /** '' for a public response. */
  respondentMemberId: string;
  respondentName: string;
  formTitle: string;
  formVersion: number;
  source: ResponseSource;
  submittedByIdentity: string;
  answers: Answers;
  answerBytes: number;
  fileItemIds: string[];
  fileBytes: number;
  /** '' | 'once' | YYYY-MM-DD | YYYY-Www (see `formPeriod`). */
  period: string;
  /** Store-local YYYY-MM-DD. */
  date: string;
  reviewStatus: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** `form_response_review`: a reviewer's note on one response; Drive admins only, never the respondent. */
export interface FormResponseReviewView {
  responseId: string;
  organizationId: string;
  formId: string;
  adminScope: string;
  reviewNote: string;
  reviewedByName: string;
  noteBytes: number;
  updatedAt: Date;
}

/** `form_assignment`: id = `${formId}:${memberId}`. */
export interface FormAssignmentView {
  id: string;
  organizationId: string;
  formId: string;
  memberId: string;
  /** YYYY-MM-DD or ''. */
  dueDate: string;
  createdByMemberId: string;
  createdAt: Date;
}

/** `form_completion`: id = `${formId}:${period}:${memberId}`. Answers are never on this row. */
export interface FormCompletionView {
  id: string;
  organizationId: string;
  formId: string;
  memberId: string;
  memberName: string;
  period: string;
  date: string;
  completedAt: Date;
}

/** `form_public`: the public-safe copy behind an anyone-with-the-link token. */
export interface FormPublicView {
  token: string;
  formId: string;
  organizationId: string;
  storeName: string;
  title: string;
  definition: FormDefinitionV1 | null;
  version: number;
  status: FormStatus;
  closesAt: Date | null;
  updatedAt: Date;
}
