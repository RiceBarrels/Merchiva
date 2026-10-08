/**
 * Pure edits the form builder applies to its local draft (`FormDefinitionV1`): add, retype, move, remove/archive
 * questions and edit their options. No React; every function returns a new definition and never mutates its input.
 *
 * Once a form has responses the module refuses removed questions, changed types and removed options
 * (`checkDefinitionEdit`), so `removeQuestion` archives instead and the editor hides the type picker.
 */
import { newOptionId, newQuestionId } from "@/lib/forms/limits";
import type { FormDefinitionV1, FormOption, Question, QuestionType } from "@/lib/forms/types";

/** Copy for new questions and options, resolved by the caller's `t()` (so the draft stays in the creator's locale). */
export interface DraftCopy {
  question: string;
  section: string;
  option: (n: number) => string;
}

const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set(["single_choice", "multi_choice", "dropdown"]);

export function isChoiceType(type: QuestionType): type is "single_choice" | "multi_choice" | "dropdown" {
  return CHOICE_TYPES.has(type);
}

function defaultOptions(copy: DraftCopy): FormOption[] {
  return [1, 2].map((n) => ({ id: newOptionId(), label: copy.option(n) }));
}

/** A fresh question of `type` with the fields its type needs to validate. */
export function newQuestion(type: QuestionType, copy: DraftCopy): Question {
  const base = { id: newQuestionId(), title: type === "section" ? copy.section : copy.question, required: false };
  switch (type) {
    case "single_choice":
    case "multi_choice":
    case "dropdown":
      return { ...base, type, options: defaultOptions(copy) };
    case "scale":
      return { ...base, type, min: 1, max: 5 };
    case "photo":
    case "file":
      return { ...base, type, maxFiles: 1 };
    default:
      return { ...base, type };
  }
}

/**
 * `q` as another type, keeping id, title, help, required and archived; choice options carry over between choice
 * types. Only offered before the form has responses.
 */
export function retypeQuestion(q: Question, type: QuestionType, copy: DraftCopy): Question {
  if (q.type === type) return q;
  const fresh = newQuestion(type, copy);
  const keep = {
    id: q.id,
    title: q.title,
    ...(q.help ? { help: q.help } : {}),
    required: type === "section" ? false : q.required,
    ...(q.archived ? { archived: true } : {}),
  };
  if ("options" in q && "options" in fresh) return { ...fresh, ...keep, options: q.options } as Question;
  return { ...fresh, ...keep } as Question;
}

export function updateQuestion(def: FormDefinitionV1, id: string, patch: (q: Question) => Question): FormDefinitionV1 {
  return { ...def, questions: def.questions.map((q) => (q.id === id ? patch(q) : q)) };
}

/** Insert `q` after `afterId` (at the end when absent). */
export function insertQuestion(def: FormDefinitionV1, q: Question, afterId?: string | null): FormDefinitionV1 {
  const at = afterId ? def.questions.findIndex((x) => x.id === afterId) : -1;
  const questions = [...def.questions];
  questions.splice(at < 0 ? questions.length : at + 1, 0, q);
  return { ...def, questions };
}

/** Swap question `id` with its neighbour (`-1` up, `1` down); a no-op at either end. */
export function moveQuestion(def: FormDefinitionV1, id: string, delta: -1 | 1): FormDefinitionV1 {
  const i = def.questions.findIndex((q) => q.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= def.questions.length) return def;
  const questions = [...def.questions];
  [questions[i], questions[j]] = [questions[j], questions[i]];
  return { ...def, questions };
}

/**
 * Remove question `id`. With responses an input question is archived instead (its answers keep their column);
 * a section heading holds no answers, so it is always removed.
 */
export function removeQuestion(def: FormDefinitionV1, id: string, hasResponses: boolean): FormDefinitionV1 {
  const q = def.questions.find((x) => x.id === id);
  if (!q) return def;
  if (hasResponses && q.type !== "section") return updateQuestion(def, id, (x) => ({ ...x, archived: true }));
  return { ...def, questions: def.questions.filter((x) => x.id !== id) };
}

/** A copy of question `id` with fresh ids, inserted right after it. */
export function duplicateQuestion(def: FormDefinitionV1, id: string): FormDefinitionV1 {
  const q = def.questions.find((x) => x.id === id);
  if (!q) return def;
  const copy: Question = { ...q, id: newQuestionId() };
  delete copy.archived;
  if ("options" in copy) copy.options = copy.options.map((o) => ({ id: newOptionId(), label: o.label }));
  return insertQuestion(def, copy, id);
}

export function addOption(q: Question, copy: DraftCopy): Question {
  if (!("options" in q)) return q;
  return { ...q, options: [...q.options, { id: newOptionId(), label: copy.option(q.options.length + 1) }] };
}

export function renameOption(q: Question, optionId: string, label: string): Question {
  if (!("options" in q)) return q;
  return { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, label } : o)) };
}

/** Remove an option; multi-choice min/max that no longer fit are dropped. */
export function removeOption(q: Question, optionId: string): Question {
  if (!("options" in q)) return q;
  const options = q.options.filter((o) => o.id !== optionId);
  if (q.type !== "multi_choice") return { ...q, options };
  const next = { ...q, options };
  if (next.min !== undefined && next.min > options.length) delete next.min;
  if (next.max !== undefined && next.max > options.length) delete next.max;
  return next;
}

export function moveOption(q: Question, optionId: string, delta: -1 | 1): Question {
  if (!("options" in q)) return q;
  const i = q.options.findIndex((o) => o.id === optionId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= q.options.length) return q;
  const options = [...q.options];
  [options[i], options[j]] = [options[j], options[i]];
  return { ...q, options };
}

/** Option ids a saved definition already has: removing one of these is refused once the form has responses. */
export function savedOptionIds(def: FormDefinitionV1 | null, questionId: string): ReadonlySet<string> {
  const q = def?.questions.find((x) => x.id === questionId);
  return new Set(q && "options" in q ? q.options.map((o) => o.id) : []);
}

/** Ids of questions the saved definition already has (their type is locked once the form has responses). */
export function savedQuestionIds(def: FormDefinitionV1 | null): ReadonlySet<string> {
  return new Set(def?.questions.map((q) => q.id) ?? []);
}
