/**
 * Forms → vendor renderer adapter.
 *
 * `toSurveyJson` builds the renderer's JSON from a `FormDefinitionV1` through an allowlist: every key it writes is
 * listed in `SURVEY_ALLOWED_KEYS` and every element type in `SURVEY_ELEMENT_TYPES`, and `assertSurveyAllowlisted`
 * re-checks the finished object before it is returned. Raw renderer JSON is never stored or accepted, so the output
 * never carries an `html` element, `completedHtml` / `completedBeforeHtml` / `loadingHtml`, `choicesByUrl` (the
 * library's only network code), `navigateToUrl`, image URLs, `surveyId` / `surveyPostId`, triggers or custom
 * widgets. Markdown stays off because the host never registers an `onTextMarkdown` handler.
 *
 * `fromSurveyData` maps the renderer's `survey.data` back to our `Answers`. The reducer re-validates everything;
 * nothing here is a security boundary on its own.
 *
 * File and photo questions use `storeDataAsText: false`, so the renderer never puts base64 into answers. The host's
 * `onUploadFiles` uploads each file into the respondent's My files and calls back with
 * `{ file, content: driveItemId }`; `fromSurveyData` keeps only `content` values that are Drive item ids. Previews
 * go through the host's `onDownloadFile`, since `content` is an id, not a URL.
 *
 * Pure: no DOM, no renderer import. The confirmation is plain text shown by the host (`showCompletePage: false`).
 */
import { DRIVE_MAX_FILE_BYTES } from "@/lib/drive/rules";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import {
  DRIVE_ITEM_ID_RE,
  FORM_MAX_FILES_PER_RESPONSE,
  FORM_MAX_LONG_TEXT_LENGTH,
  FORM_MAX_SHORT_TEXT_LENGTH,
  FORM_RATING_MAX,
  isPublicSafe,
  isQuestionId,
  isValidAccept,
  isValidDateKey,
  isValidTime,
} from "./schema";
import {
  FORM_DEFINITION_VERSION,
  type AnswerValue,
  type Answers,
  type FormDefinitionV1,
  type InputQuestion,
  type Question,
  type SectionQuestion,
} from "./types";
import {
  assertSurveyAllowlisted,
  SurveyAdapterError,
  type SurveyElementJson,
  type SurveyJson,
  type SurveyPageJson,
} from "./survey-json";

export * from "./survey-json";

/* ─── Options, errors, keys ──────────────────────────────────────────────── */

/**
 * - `fill`: a member answers (manager page, personal phone, store tablet).
 * - `preview`: the builder's preview. Nothing is submitted, and file questions are read-only so a preview never
 *   uploads into Drive.
 * - `public`: an anyone-with-the-link response. Requires a public-safe definition (no file/photo question, archived
 *   ones included); anything else throws `not_public_safe` instead of dropping questions.
 */
export type SurveyAdapterMode = "fill" | "preview" | "public";

/** One page per section (wizard), or one page with a panel per section. */
export type SurveyAdapterLayout = "wizard" | "single";

export interface ToSurveyJsonOptions {
  locale: Locale;
  mode: SurveyAdapterMode;
  t: (key: string) => string;
  /** Default `wizard`. */
  layout?: SurveyAdapterLayout;
  /**
   * Default true. False on a staff-account store tablet: file/photo questions render read-only and optional with
   * an explanation (the reducer refuses file answers there and does not count them as required).
   */
  allowFiles?: boolean;
}

/** i18n keys this adapter reads (`forms.runtime.*`), routed through a map so every key is listed in one place. */
export const SURVEY_ADAPTER_KEY = {
  filesUnavailableHere: "forms.runtime.filesUnavailableHere",
  previewNoUpload: "forms.runtime.previewNoUpload",
  checklistRequired: "forms.runtime.checklistRequired",
  defaultConfirmation: "forms.runtime.defaultConfirmation",
} as const;

export const SURVEY_ADAPTER_KEYS: readonly string[] = Object.values(SURVEY_ADAPTER_KEY);

/* ─── Definition → renderer JSON ─────────────────────────────────────────── */

/** Plain text or nothing: blank strings are left out so the renderer shows no empty title or description. */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Author text shown by the renderer stays literal. The renderer replaces `{name}` with answers and built-ins
 * (`{locale}`, `{pageno}`) and has no escape, so a word joiner (U+2060, rendered as nothing) after each `{` keeps
 * every brace pair from naming anything.
 */
function plain(value: string): string {
  return value.replaceAll("{", "{\u2060");
}

function label(value: unknown): string | undefined {
  const kept = text(value);
  return kept === undefined ? undefined : plain(kept);
}

function int(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Copy only defined values, so the output never carries `undefined` keys. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

interface BuildContext {
  mode: SurveyAdapterMode;
  allowFiles: boolean;
  t: (key: string) => string;
}

function joinText(...parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((p): p is string => p !== undefined);
  return kept.length > 0 ? kept.join("\n\n") : undefined;
}

function fileElement(q: Extract<InputQuestion, { type: "photo" | "file" }>, ctx: BuildContext): SurveyElementJson {
  if (ctx.mode === "public") throw new SurveyAdapterError("not_public_safe", q.id);
  const maxFiles = Math.min(Math.max(int(q.maxFiles) ?? 1, 1), FORM_MAX_FILES_PER_RESPONSE);
  const blocked = !ctx.allowFiles ? SURVEY_ADAPTER_KEY.filesUnavailableHere
    : ctx.mode === "preview" ? SURVEY_ADAPTER_KEY.previewNoUpload : undefined;
  const accept = q.type === "photo" ? "image/*" : isValidAccept(q.accept) && q.accept !== "" ? q.accept : undefined;
  return compact<SurveyElementJson>({
    type: "file",
    name: q.id,
    title: plain(String(q.title)),
    description: joinText(label(q.help), blocked ? ctx.t(blocked) : undefined),
    // A file question that cannot be answered here never blocks the submission (the reducer agrees).
    isRequired: blocked === undefined && q.required,
    readOnly: blocked !== undefined ? true : undefined,
    storeDataAsText: false,
    waitForUpload: true,
    allowMultiple: maxFiles > 1,
    maxFiles,
    maxSize: DRIVE_MAX_FILE_BYTES,
    acceptedTypes: accept,
    sourceType: q.type === "photo" ? "file-camera" : "file",
  });
}

function questionElement(q: InputQuestion, ctx: BuildContext): SurveyElementJson {
  if (!isQuestionId(q.id)) throw new SurveyAdapterError("invalid_definition", "question id");
  const base = { name: q.id, title: plain(String(q.title)), description: label(q.help), isRequired: q.required === true };
  switch (q.type) {
    case "short_text":
      return compact<SurveyElementJson>({ type: "text", ...base, maxLength: FORM_MAX_SHORT_TEXT_LENGTH });
    case "long_text":
      return compact<SurveyElementJson>({ type: "comment", ...base, maxLength: FORM_MAX_LONG_TEXT_LENGTH, autoGrow: true });
    case "single_choice":
    case "multi_choice":
    case "dropdown": {
      const choices = q.options.map((o) => ({ value: String(o.id), text: plain(String(o.label)) }));
      if (q.type === "single_choice") return compact<SurveyElementJson>({ type: "radiogroup", ...base, choices });
      if (q.type === "dropdown") return compact<SurveyElementJson>({ type: "dropdown", ...base, choices });
      return compact<SurveyElementJson>({
        type: "checkbox",
        ...base,
        choices,
        minSelectedChoices: int(q.min),
        maxSelectedChoices: int(q.max),
      });
    }
    case "yes_no":
      return compact<SurveyElementJson>({ type: "boolean", ...base });
    case "checklist_item":
      return compact<SurveyElementJson>({
        type: "boolean",
        ...base,
        renderAs: "checkbox",
        // A required checklist item must be checked, not merely answered (as `validateAnswers` requires).
        validators: base.isRequired
          ? [{ type: "expression", expression: `{${q.id}} = true`, text: ctx.t(SURVEY_ADAPTER_KEY.checklistRequired) }]
          : undefined,
      });
    case "number":
      return compact<SurveyElementJson>({ type: "text", ...base, inputType: "number", min: finite(q.min), max: finite(q.max) });
    case "date":
      return compact<SurveyElementJson>({ type: "text", ...base, inputType: "date" });
    case "time":
      return compact<SurveyElementJson>({ type: "text", ...base, inputType: "time" });
    case "rating":
      return compact<SurveyElementJson>({
        type: "rating",
        ...base,
        rateType: "stars",
        autoGenerate: true,
        rateMin: 1,
        rateMax: FORM_RATING_MAX,
        rateStep: 1,
        rateCount: FORM_RATING_MAX,
      });
    case "scale": {
      const min = int(q.min);
      const max = int(q.max);
      if (min === undefined || max === undefined || max <= min) throw new SurveyAdapterError("invalid_definition", "scale");
      return compact<SurveyElementJson>({
        type: "rating",
        ...base,
        rateType: "labels",
        autoGenerate: true,
        rateMin: min,
        rateMax: max,
        rateStep: 1,
        rateCount: max - min + 1,
        minRateDescription: label(q.minLabel),
        maxRateDescription: label(q.maxLabel),
        displayRateDescriptionsAsExtremeItems: false,
      });
    }
    case "photo":
    case "file":
      return fileElement(q, ctx);
    default:
      throw new SurveyAdapterError("invalid_definition", `question type ${String((q as { type?: unknown }).type)}`);
  }
}

interface Group {
  section: SectionQuestion | null;
  elements: SurveyElementJson[];
}

/** Split the questions at each section; archived questions are left out (respondents never see them). */
function groups(def: FormDefinitionV1, ctx: BuildContext): Group[] {
  const out: Group[] = [{ section: null, elements: [] }];
  for (const q of def.questions as Question[]) {
    if (q.type === "section") {
      if (!isQuestionId(q.id)) throw new SurveyAdapterError("invalid_definition", "section id");
      if (!q.archived) out.push({ section: q, elements: [] });
      continue;
    }
    if (q.archived) continue;
    out[out.length - 1].elements.push(questionElement(q, ctx));
  }
  // A section with nothing to answer would be an empty page; the renderer would skip it anyway.
  const kept = out.filter((g) => g.elements.length > 0);
  return kept.length > 0 ? kept : [{ section: null, elements: [] }];
}

function pages(def: FormDefinitionV1, layout: SurveyAdapterLayout, ctx: BuildContext): SurveyPageJson[] {
  const parts = groups(def, ctx);
  if (layout === "wizard") {
    return parts.map((g, i) =>
      compact<SurveyPageJson>({
        name: g.section?.id ?? `page_${i + 1}`,
        title: g.section ? label(g.section.title) : undefined,
        description: g.section ? label(g.section.help) : undefined,
        elements: g.elements,
      }),
    );
  }
  const elements: SurveyElementJson[] = [];
  for (const g of parts) {
    if (!g.section) elements.push(...g.elements);
    else {
      elements.push(
        compact<SurveyElementJson>({
          type: "panel",
          name: g.section.id,
          title: label(g.section.title),
          description: label(g.section.help),
          elements: g.elements,
        }),
      );
    }
  }
  return [{ name: "page_1", elements }];
}

/**
 * Build the renderer JSON for `def`. Throws `SurveyAdapterError`:
 * - `not_public_safe` in `public` mode when the definition has any file/photo question (archived included);
 * - `invalid_definition` for a wrong version, a malformed id, an unknown question type or a bad scale;
 * - `invalid_locale` for a locale outside `LOCALES`.
 */
export function toSurveyJson(def: FormDefinitionV1, opts: ToSurveyJsonOptions): SurveyJson {
  if (def.v !== FORM_DEFINITION_VERSION || !Array.isArray(def.questions)) {
    throw new SurveyAdapterError("invalid_definition", "version");
  }
  if (!(LOCALES as readonly string[]).includes(opts.locale)) throw new SurveyAdapterError("invalid_locale");
  if (opts.mode === "public" && !isPublicSafe(def)) throw new SurveyAdapterError("not_public_safe");
  const ctx: BuildContext = { mode: opts.mode, allowFiles: opts.mode !== "public" && opts.allowFiles !== false, t: opts.t };
  const json = compact<SurveyJson>({
    // Our locale code verbatim: the host registers `forms.runtime.*` strings under it (zh-hk included).
    locale: opts.locale,
    title: label(def.title),
    description: label(def.description),
    pages: pages(def, opts.layout ?? "wizard", ctx),
    showQuestionNumbers: "off",
    showCompletePage: false,
    questionsOnPageMode: "standard",
    checkErrorsMode: "onNextPage",
    widthMode: "responsive",
    maxTextLength: FORM_MAX_SHORT_TEXT_LENGTH,
    maxCommentLength: FORM_MAX_LONG_TEXT_LENGTH,
  });
  assertSurveyAllowlisted(json);
  return json;
}

/** The plain-text confirmation the host shows after a submission (never `completedHtml`). */
export function confirmationText(def: FormDefinitionV1, t: (key: string) => string): string {
  return text(def.settings?.confirmation) ?? t(SURVEY_ADAPTER_KEY.defaultConfirmation);
}

/* ─── Renderer data → Answers ────────────────────────────────────────────── */

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Drive item ids from the renderer's file value (`[{ name, type, content }]`); anything else is dropped. */
function fileItemIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value as unknown[]) {
    const content = typeof entry === "object" && entry !== null ? (entry as { content?: unknown }).content : undefined;
    if (typeof content === "string" && DRIVE_ITEM_ID_RE.test(content) && !ids.includes(content)) ids.push(content);
  }
  return ids;
}

function answerFor(q: InputQuestion, value: unknown): AnswerValue | undefined {
  switch (q.type) {
    case "short_text":
    case "long_text":
    case "single_choice":
    case "dropdown":
      return typeof value === "string" && value !== "" ? value : undefined;
    case "date":
      return isValidDateKey(value) ? value : undefined;
    case "time": {
      // Some browsers report seconds (`HH:MM:SS`); answers store `HH:MM`.
      const hm = typeof value === "string" ? value.slice(0, 5) : undefined;
      return isValidTime(hm) ? hm : undefined;
    }
    case "multi_choice": {
      if (!Array.isArray(value)) return undefined;
      const ids = (value as unknown[]).filter((v): v is string => typeof v === "string");
      return ids.length > 0 ? [...new Set(ids)] : undefined;
    }
    case "yes_no":
    case "checklist_item":
      return typeof value === "boolean" ? value : undefined;
    case "number":
    case "rating":
    case "scale":
      return asNumber(value);
    case "photo":
    case "file": {
      const ids = fileItemIds(value);
      return ids.length > 0 ? { driveItemIds: ids } : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Map the renderer's `survey.data` to our `Answers`. Only answerable questions of `def` are read (by id); every
 * other key, empty values and values of the wrong shape are dropped. Choice ids, ranges and lengths are left for
 * `validateAnswers` and the reducer, which report them instead of silently fixing them.
 */
export function fromSurveyData(def: FormDefinitionV1, data: unknown): Answers {
  const out: Answers = {};
  if (typeof data !== "object" || data === null || Array.isArray(data)) return out;
  const raw = data as Record<string, unknown>;
  for (const q of def.questions as Question[]) {
    if (q.type === "section" || q.archived || !Object.prototype.hasOwnProperty.call(raw, q.id)) continue;
    const answer = answerFor(q, raw[q.id]);
    if (answer !== undefined) out[q.id] = answer;
  }
  return out;
}
