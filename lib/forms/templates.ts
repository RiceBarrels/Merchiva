/**
 * Forms templates: ids, metadata and the `FormDefinitionV1` each template seeds a new form with.
 *
 * Like `lib/docs/templates.ts`, templates are structure plus i18n keys, resolved once at creation with the
 * creator's `t()`; after that they are ordinary form text. Every key lives under `forms.templates.<id>.*`:
 * `title`, `description` (tile copy; also the new form's title and description, except blank's `untitled`),
 * `q.<question>`, `h.<question>` (help), `o.<option>`, `l.<question>Low|High` (scale
 * end labels) and `confirmation`. `formTemplateKeys()` lists them all for the i18n script and tests.
 *
 * Pure: imports no React and no renderer.
 */
import { FORM_DEFINITION_VERSION, type FormDefinitionV1, type FormKind, type PerMemberRule, type Question, type QuestionType } from "./types";
import { newOptionId, newQuestionId } from "./limits";

export type FormTemplateId =
  | "blank"
  | "openingChecklist"
  | "closingChecklist"
  | "incidentReport"
  | "customerFeedback"
  | "equipmentCheck";

/** Display order: blank first. */
export const FORM_TEMPLATE_IDS: readonly FormTemplateId[] = [
  "blank",
  "openingChecklist",
  "closingChecklist",
  "incidentReport",
  "customerFeedback",
  "equipmentCheck",
];

export function isFormTemplateId(value: string | null | undefined): value is FormTemplateId {
  return !!value && (FORM_TEMPLATE_IDS as readonly string[]).includes(value);
}

type QuestionSpec = {
  key: string;
  type: QuestionType;
  required?: boolean;
  /** Option keys (`o.<key>`). */
  options?: readonly string[];
  min?: number;
  max?: number;
  maxFiles?: number;
  /** Has a help key (`h.<key>`). */
  help?: boolean;
  /** Scale end labels (`l.<key>Low` / `l.<key>High`). */
  labels?: boolean;
};

interface TemplateSpec {
  kind: FormKind;
  perMember: PerMemberRule;
  trackCompletion: boolean;
  /** Has a `confirmation` key. */
  confirmation?: boolean;
  questions: readonly QuestionSpec[];
}

const check = (key: string): QuestionSpec => ({ key, type: "checklist_item", required: true });
const NOTES: QuestionSpec = { key: "notes", type: "long_text" };

const SPECS: Record<FormTemplateId, TemplateSpec> = {
  blank: {
    kind: "form",
    perMember: "unlimited",
    trackCompletion: false,
    questions: [{ key: "first", type: "short_text" }],
  },
  openingChecklist: {
    kind: "checklist",
    perMember: "daily",
    trackCompletion: true,
    questions: [
      check("alarmOff"),
      check("lightsOn"),
      { key: "cashFloat", type: "number", required: true, min: 0, help: true },
      check("fridgesOk"),
      check("floorClean"),
      check("shelvesStocked"),
      NOTES,
    ],
  },
  closingChecklist: {
    kind: "checklist",
    perMember: "daily",
    trackCompletion: true,
    questions: [
      { key: "cashCounted", type: "number", required: true, min: 0, help: true },
      check("equipmentOff"),
      check("trashOut"),
      check("doorsLocked"),
      check("alarmSet"),
      NOTES,
    ],
  },
  incidentReport: {
    kind: "report",
    perMember: "unlimited",
    trackCompletion: false,
    confirmation: true,
    questions: [
      { key: "details", type: "section" },
      { key: "date", type: "date", required: true },
      { key: "time", type: "time" },
      { key: "category", type: "single_choice", required: true, options: ["injury", "theft", "damage", "customer", "other"] },
      { key: "what", type: "long_text", required: true, help: true },
      { key: "injured", type: "yes_no", required: true },
      { key: "followUp", type: "section" },
      { key: "actions", type: "long_text" },
      { key: "photos", type: "photo", maxFiles: 3 },
    ],
  },
  customerFeedback: {
    kind: "survey",
    perMember: "unlimited",
    trackCompletion: false,
    confirmation: true,
    questions: [
      { key: "overall", type: "rating", required: true },
      { key: "recommend", type: "scale", min: 0, max: 10, labels: true },
      { key: "liked", type: "multi_choice", options: ["service", "speed", "quality", "price", "cleanliness"] },
      { key: "comments", type: "long_text" },
      { key: "contact", type: "short_text", help: true },
    ],
  },
  equipmentCheck: {
    kind: "checklist",
    perMember: "unlimited",
    trackCompletion: true,
    questions: [
      { key: "fridgeTemp", type: "number", required: true, help: true },
      { key: "freezerTemp", type: "number", required: true, help: true },
      { key: "equipmentOk", type: "yes_no", required: true },
      { key: "issue", type: "long_text" },
      { key: "photo", type: "photo", maxFiles: 1 },
    ],
  },
};

export interface FormTemplateMeta {
  readonly id: FormTemplateId;
  readonly kind: FormKind;
  readonly perMember: PerMemberRule;
  readonly trackCompletion: boolean;
  /** `forms.templates.<id>.title`. */
  readonly titleKey: string;
  /** `forms.templates.<id>.description`. */
  readonly descriptionKey: string;
  /** No photo/file question, so it may be offered on a public link. */
  readonly publicSafe: boolean;
}

const prefix = (id: FormTemplateId): string => `forms.templates.${id}`;

export const FORM_TEMPLATES: readonly FormTemplateMeta[] = FORM_TEMPLATE_IDS.map((id) => ({
  id,
  kind: SPECS[id].kind,
  perMember: SPECS[id].perMember,
  trackCompletion: SPECS[id].trackCompletion,
  titleKey: `${prefix(id)}.title`,
  descriptionKey: `${prefix(id)}.description`,
  publicSafe: !SPECS[id].questions.some((q) => q.type === "photo" || q.type === "file"),
}));

/** Every i18n key a template references, in a stable order. All templates when `id` is omitted. */
export function formTemplateKeys(id?: FormTemplateId): string[] {
  if (!id) return FORM_TEMPLATE_IDS.flatMap((each) => formTemplateKeys(each));
  const p = prefix(id);
  const spec = SPECS[id];
  const keys = [`${p}.title`, `${p}.description`];
  if (id === "blank") keys.push(`${p}.untitled`);
  if (spec.confirmation) keys.push(`${p}.confirmation`);
  for (const q of spec.questions) {
    keys.push(`${p}.q.${q.key}`);
    if (q.help) keys.push(`${p}.h.${q.key}`);
    if (q.labels) keys.push(`${p}.l.${q.key}Low`, `${p}.l.${q.key}High`);
    for (const o of q.options ?? []) keys.push(`${p}.o.${o}`);
  }
  return [...new Set(keys)];
}

export interface FormTemplateResult {
  kind: FormKind;
  perMember: PerMemberRule;
  trackCompletion: boolean;
  definition: FormDefinitionV1;
}

export interface BuildFormTemplateOptions {
  /** Random source for question/option ids, [0, 1). Defaults to crypto; pass a seeded one in tests. */
  random?: () => number;
}

function buildQuestion(id: FormTemplateId, spec: QuestionSpec, t: (key: string) => string, random?: () => number): Question {
  const p = prefix(id);
  const base = {
    id: newQuestionId(random),
    title: t(`${p}.q.${spec.key}`),
    ...(spec.help ? { help: t(`${p}.h.${spec.key}`) } : {}),
    required: spec.type !== "section" && spec.required === true,
  };
  switch (spec.type) {
    case "single_choice":
    case "multi_choice":
    case "dropdown":
      return {
        ...base,
        type: spec.type,
        options: (spec.options ?? []).map((o) => ({ id: newOptionId(random), label: t(`${p}.o.${o}`) })),
      };
    case "number":
      return {
        ...base,
        type: "number",
        ...(spec.min !== undefined ? { min: spec.min } : {}),
        ...(spec.max !== undefined ? { max: spec.max } : {}),
      };
    case "scale":
      return {
        ...base,
        type: "scale",
        min: spec.min ?? 1,
        max: spec.max ?? 5,
        ...(spec.labels ? { minLabel: t(`${p}.l.${spec.key}Low`), maxLabel: t(`${p}.l.${spec.key}High`) } : {}),
      };
    case "photo":
    case "file":
      return { ...base, type: spec.type, ...(spec.maxFiles !== undefined ? { maxFiles: spec.maxFiles } : {}) };
    default:
      return { ...base, type: spec.type };
  }
}

/** A new form's settings and definition from template `id`, with copy resolved through `t`. */
export function buildFormTemplate(
  id: FormTemplateId,
  t: (key: string) => string,
  options: BuildFormTemplateOptions = {},
): FormTemplateResult {
  const spec = SPECS[id];
  const p = prefix(id);
  return {
    kind: spec.kind,
    perMember: spec.perMember,
    trackCompletion: spec.trackCompletion,
    definition: {
      v: FORM_DEFINITION_VERSION,
      // Blank's tile says "Blank form"; the form itself starts as "Untitled form".
      title: t(id === "blank" ? `${p}.untitled` : `${p}.title`),
      description: id === "blank" ? "" : t(`${p}.description`),
      questions: spec.questions.map((q) => buildQuestion(id, q, t, options.random)),
      settings: { confirmation: spec.confirmation ? t(`${p}.confirmation`) : "" },
    },
  };
}

/**
 * A blank form built as `kind`. The kind is fixed at creation (createForm takes it; updateFormSettings does not), and
 * it decides where the form shows on the store tablet: a checklist under Today, a report under Report something.
 * A blank checklist repeats daily and tracks completion, like the checklist templates.
 */
export function buildBlankForm(kind: FormKind, t: (key: string) => string): FormTemplateResult {
  const blank = buildFormTemplate("blank", t);
  return kind === "checklist"
    ? { ...blank, kind, perMember: "daily", trackCompletion: true }
    : { ...blank, kind, perMember: "unlimited", trackCompletion: false };
}
