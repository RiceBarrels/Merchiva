/**
 * Forms responses summary: per-question aggregates for the Responses → Summary view. Counts per option,
 * yes/no tallies, average/min/max (plus a per-value distribution for rating and scale), the most recent text
 * answers, and file counts.
 *
 * Pure. Answers that do not fit their question's current type (stale or hand-made rows) are skipped, never
 * thrown on; option ids no longer in the definition are counted as `otherCount`, never shown raw.
 */
import { FORM_RATING_MAX } from "./limits";
import type {
  AnswerValue,
  BooleanQuestionType,
  ChoiceQuestionType,
  FileAnswer,
  FormDefinitionV1,
  FormResponseView,
  InputQuestion,
} from "./types";

export const FORM_SUMMARY_RECENT_LIMIT = 5;

/** The response fields the summary reads. */
export type SummaryResponse = Pick<FormResponseView, "answers" | "respondentName" | "createdAt">;

export interface ChoiceCount {
  optionId: string;
  label: string;
  count: number;
}

export interface RecentAnswer {
  value: string;
  respondentName: string;
  createdAt: Date;
}

interface SummaryBase {
  questionId: string;
  title: string;
  archived: boolean;
  /** Responses with a usable answer to this question. */
  answered: number;
}

export type QuestionSummary =
  | (SummaryBase & { kind: "choice"; type: ChoiceQuestionType; counts: ChoiceCount[]; otherCount: number })
  | (SummaryBase & { kind: "boolean"; type: BooleanQuestionType; yes: number; no: number })
  | (SummaryBase & {
      kind: "numeric";
      type: "number" | "rating" | "scale";
      average: number | null;
      min: number | null;
      max: number | null;
      /** rating and scale: one entry per integer value, low to high (zeros included); [] for number. */
      distribution: { value: number; count: number }[];
    })
  | (SummaryBase & { kind: "text"; type: "short_text" | "long_text" | "date" | "time"; recent: RecentAnswer[] })
  | (SummaryBase & { kind: "files"; type: "photo" | "file"; fileCount: number });

export interface FormSummary {
  total: number;
  firstAt: Date | null;
  lastAt: Date | null;
  questions: QuestionSummary[];
}

export interface SummarizeOptions {
  /** Text answers kept per question, newest first. Default FORM_SUMMARY_RECENT_LIMIT. */
  recentLimit?: number;
  /** Include archived questions (default true: their old answers still count). */
  includeArchived?: boolean;
}

function isFileAnswer(value: AnswerValue | undefined): value is FileAnswer {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Array.isArray(value.driveItemIds);
}

function isNumber(value: AnswerValue | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function summarizeQuestion(q: InputQuestion, newestFirst: readonly SummaryResponse[], recentLimit: number): QuestionSummary {
  const base = { questionId: q.id, title: q.title, archived: q.archived === true };
  const values = newestFirst.map((r) => r.answers[q.id]);
  switch (q.type) {
    case "single_choice":
    case "dropdown":
    case "multi_choice": {
      const counts = new Map<string, number>(q.options.map((o) => [o.id, 0]));
      let answered = 0;
      let otherCount = 0;
      for (const v of values) {
        const picked = typeof v === "string" ? [v] : Array.isArray(v) ? v : null;
        if (!picked || picked.length === 0) continue;
        answered++;
        for (const id of new Set(picked)) {
          const n = counts.get(id);
          if (n === undefined) otherCount++;
          else counts.set(id, n + 1);
        }
      }
      return {
        ...base,
        kind: "choice",
        type: q.type,
        answered,
        otherCount,
        counts: q.options.map((o) => ({ optionId: o.id, label: o.label, count: counts.get(o.id) ?? 0 })),
      };
    }
    case "yes_no":
    case "checklist_item": {
      const yes = values.filter((v) => v === true).length;
      const no = values.filter((v) => v === false).length;
      return { ...base, kind: "boolean", type: q.type, answered: yes + no, yes, no };
    }
    case "number":
    case "rating":
    case "scale": {
      const nums = values.filter(isNumber);
      const [low, high] = q.type === "rating" ? [1, FORM_RATING_MAX] : q.type === "scale" ? [q.min, q.max] : [0, -1];
      const distribution: { value: number; count: number }[] = [];
      for (let value = low; value <= high; value++) {
        distribution.push({ value, count: nums.filter((n) => n === value).length });
      }
      return {
        ...base,
        kind: "numeric",
        type: q.type,
        answered: nums.length,
        average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
        distribution,
      };
    }
    case "short_text":
    case "long_text":
    case "date":
    case "time": {
      const recent: RecentAnswer[] = [];
      let answered = 0;
      newestFirst.forEach((r, i) => {
        const v = values[i];
        if (typeof v !== "string" || v.trim() === "") return;
        answered++;
        if (recent.length < recentLimit) recent.push({ value: v, respondentName: r.respondentName, createdAt: r.createdAt });
      });
      return { ...base, kind: "text", type: q.type, answered, recent };
    }
    case "photo":
    case "file": {
      const files = values.filter(isFileAnswer).filter((v) => v.driveItemIds.length > 0);
      const fileCount = files.reduce((n, v) => n + v.driveItemIds.length, 0);
      return { ...base, kind: "files", type: q.type, answered: files.length, fileCount };
    }
  }
}

/** Aggregate `responses` per input question of `def`, in definition order. */
export function summarizeResponses(
  def: FormDefinitionV1,
  responses: readonly SummaryResponse[],
  options: SummarizeOptions = {},
): FormSummary {
  const recentLimit = Math.max(0, options.recentLimit ?? FORM_SUMMARY_RECENT_LIMIT);
  const includeArchived = options.includeArchived ?? true;
  const newestFirst = [...responses].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const questions = def.questions
    .filter((q): q is InputQuestion => q.type !== "section" && (includeArchived || !q.archived))
    .map((q) => summarizeQuestion(q, newestFirst, recentLimit));
  return {
    total: responses.length,
    firstAt: newestFirst.length ? newestFirst[newestFirst.length - 1].createdAt : null,
    lastAt: newestFirst.length ? newestFirst[0].createdAt : null,
    questions,
  };
}
