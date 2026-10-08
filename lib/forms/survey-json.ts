/**
 * Forms: the vendor renderer's JSON, as far as `lib/forms/survey-adapter.ts` writes it, and the allowlist that
 * output is checked against. Import through `survey-adapter.ts`.
 *
 * Pure types and data: no DOM, no renderer import.
 */

export type SurveyAdapterErrorCode = "invalid_definition" | "invalid_locale" | "not_public_safe";

export class SurveyAdapterError extends Error {
  readonly code: SurveyAdapterErrorCode;
  constructor(code: SurveyAdapterErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SurveyAdapterError";
    this.code = code;
  }
}

/* ─── Output shape and allowlist ─────────────────────────────────────────── */

export interface SurveyChoiceJson {
  value: string;
  text: string;
}

export interface SurveyValidatorJson {
  type: "expression";
  expression: string;
  text: string;
}

/** One element: a question or (single-page layout) a section panel. Only the keys this adapter writes. */
export interface SurveyElementJson {
  type: SurveyElementType;
  name: string;
  title?: string;
  description?: string;
  isRequired?: boolean;
  readOnly?: boolean;
  elements?: SurveyElementJson[];
  inputType?: "number" | "date" | "time";
  min?: number;
  max?: number;
  maxLength?: number;
  autoGrow?: boolean;
  choices?: SurveyChoiceJson[];
  minSelectedChoices?: number;
  maxSelectedChoices?: number;
  renderAs?: "checkbox";
  validators?: SurveyValidatorJson[];
  rateType?: "stars" | "labels";
  rateMin?: number;
  rateMax?: number;
  rateStep?: number;
  rateCount?: number;
  autoGenerate?: boolean;
  minRateDescription?: string;
  maxRateDescription?: string;
  displayRateDescriptionsAsExtremeItems?: boolean;
  storeDataAsText?: false;
  waitForUpload?: boolean;
  allowMultiple?: boolean;
  maxFiles?: number;
  maxSize?: number;
  acceptedTypes?: string;
  sourceType?: "file" | "file-camera";
}

export interface SurveyPageJson {
  name: string;
  title?: string;
  description?: string;
  elements: SurveyElementJson[];
}

export interface SurveyJson {
  locale: string;
  title?: string;
  description?: string;
  pages: SurveyPageJson[];
  showQuestionNumbers: "off";
  showCompletePage: false;
  questionsOnPageMode: "standard";
  checkErrorsMode: "onNextPage";
  widthMode: "responsive";
  maxTextLength: number;
  maxCommentLength: number;
}

export const SURVEY_ELEMENT_TYPES = [
  "panel",
  "text",
  "comment",
  "radiogroup",
  "checkbox",
  "dropdown",
  "boolean",
  "rating",
  "file",
] as const;
export type SurveyElementType = (typeof SURVEY_ELEMENT_TYPES)[number];

export const SURVEY_VALIDATOR_TYPES = ["expression"] as const;

/** Every key the adapter may write, at any depth. Anything else in the output is a bug and throws. */
export const SURVEY_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  // survey
  "locale", "title", "description", "pages", "showQuestionNumbers", "showCompletePage", "questionsOnPageMode",
  "checkErrorsMode", "widthMode", "maxTextLength", "maxCommentLength",
  // page / panel / question
  "name", "elements", "type", "isRequired", "readOnly", "inputType", "min", "max", "maxLength", "autoGrow",
  "choices", "value", "text", "minSelectedChoices", "maxSelectedChoices", "renderAs", "validators", "expression",
  "rateType", "rateMin", "rateMax", "rateStep", "rateCount", "autoGenerate", "minRateDescription",
  "maxRateDescription", "displayRateDescriptionsAsExtremeItems",
  // file
  "storeDataAsText", "waitForUpload", "allowMultiple", "maxFiles", "maxSize", "acceptedTypes", "sourceType",
]);

/**
 * Keys that must never appear: rendered as HTML, fetch or navigate, load images, post to the vendor's service, or
 * run logic we do not mirror. Not used to build the output (the allowlist does that); kept for tests and review.
 */
export const SURVEY_FORBIDDEN_KEYS: readonly string[] = [
  "html", "completedHtml", "completedBeforeHtml", "completedHtmlOnCondition", "loadingHtml", "choicesByUrl",
  "navigateToUrl", "navigateToUrlOnCondition", "surveyId", "surveyPostId", "imageLink", "imageLinks", "logo",
  "backgroundImage", "triggers", "calculatedValues", "cookieName", "partialSendEnabled", "surveyShowDataSaving",
  "visibleIf", "enableIf", "requiredIf", "defaultValueExpression", "setValueExpression", "choicesFromQuestion",
  "showOtherItem", "storeOthersAsComment", "widget", "customWidget",
];

function fail(path: string): never {
  throw new SurveyAdapterError("invalid_definition", `not allowlisted: ${path}`);
}

/** Throw unless every key in `json` is allowlisted and every element / validator type is known. */
export function assertSurveyAllowlisted(json: unknown, path = "$"): void {
  if (Array.isArray(json)) {
    json.forEach((v, i) => assertSurveyAllowlisted(v, `${path}[${i}]`));
    return;
  }
  if (typeof json !== "object" || json === null) return;
  for (const [key, value] of Object.entries(json)) {
    if (!SURVEY_ALLOWED_KEYS.has(key)) fail(`${path}.${key}`);
    if (key === "elements" && Array.isArray(value)) {
      for (const el of value as unknown[]) {
        const type = (el as { type?: unknown } | null)?.type;
        if (!(SURVEY_ELEMENT_TYPES as readonly unknown[]).includes(type)) fail(`${path}.elements.type=${String(type)}`);
      }
    }
    if (key === "validators" && Array.isArray(value)) {
      for (const v of value as unknown[]) {
        const type = (v as { type?: unknown } | null)?.type;
        if (!(SURVEY_VALIDATOR_TYPES as readonly unknown[]).includes(type)) fail(`${path}.validators.type`);
      }
    }
    assertSurveyAllowlisted(value, `${path}.${key}`);
  }
}
