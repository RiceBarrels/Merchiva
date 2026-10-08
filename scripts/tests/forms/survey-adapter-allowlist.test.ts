// lib/forms/survey-adapter.ts: every question type maps per the design table (B.1), the output is built only from
// the allowlist (a property test over random definitions), the real renderer model accepts every key, answers
// round-trip through the renderer's data, and public mode refuses file/photo questions instead of dropping them.

import { describe, expect, test } from "bun:test";
import { Model } from "survey-core";
import { validateAnswers } from "@/lib/forms/schema";
import {
  SURVEY_ADAPTER_KEY,
  SURVEY_ALLOWED_KEYS,
  SURVEY_ELEMENT_TYPES,
  SURVEY_FORBIDDEN_KEYS,
  SurveyAdapterError,
  assertSurveyAllowlisted,
  confirmationText,
  fromSurveyData,
  toSurveyJson,
  type SurveyElementJson,
  type SurveyJson,
  type ToSurveyJsonOptions,
} from "@/lib/forms/survey-adapter";
import type { Answers, FormDefinitionV1, Question } from "@/lib/forms/types";

const t = (key: string) => `T(${key})`;
const FILL: ToSurveyJsonOptions = { locale: "en", mode: "fill", t };

const qid = (n: number) => `q_${n.toString(36).padStart(12, "0")}`;
const oid = (n: number) => `o_${n.toString(36).padStart(8, "0")}`;
const DRIVE_A = "0a1b2c3d-0000-4000-8000-00000000000a";
const DRIVE_B = "0a1b2c3d-0000-4000-8000-00000000000b";

/** One question of every type, in palette order (the section opens a second page). */
const ALL: Question[] = [
  { id: qid(1), type: "short_text", title: "Name", required: true, help: "Your full name" },
  { id: qid(2), type: "long_text", title: "Notes", required: false },
  { id: qid(3), type: "single_choice", title: "Shift", required: false, options: [{ id: oid(1), label: "AM" }, { id: oid(2), label: "PM" }] },
  { id: qid(4), type: "multi_choice", title: "Tasks", required: false, min: 1, max: 2, options: [{ id: oid(3), label: "Mop" }, { id: oid(4), label: "Till" }, { id: oid(5), label: "Bins" }] },
  { id: qid(5), type: "dropdown", title: "Area", required: false, options: [{ id: oid(6), label: "Front" }, { id: oid(7), label: "Back" }] },
  { id: qid(6), type: "section", title: "Checks", required: false, help: "Closing checks" },
  { id: qid(7), type: "yes_no", title: "Clean?", required: true },
  { id: qid(8), type: "number", title: "Temp", required: false, min: -5, max: 8 },
  { id: qid(9), type: "date", title: "Day", required: false },
  { id: qid(10), type: "time", title: "At", required: false },
  { id: qid(11), type: "rating", title: "Mood", required: false },
  { id: qid(12), type: "scale", title: "Busy", required: false, min: 0, max: 10, minLabel: "Quiet", maxLabel: "Packed" },
  { id: qid(13), type: "checklist_item", title: "Alarm set", required: true },
  { id: qid(14), type: "photo", title: "Fridge photo", required: false, maxFiles: 3 },
  { id: qid(15), type: "file", title: "Invoice", required: false, accept: ".pdf,image/*" },
];

const def = (questions: Question[], extra: Partial<FormDefinitionV1> = {}): FormDefinitionV1 => ({
  v: 1,
  title: "Closing",
  description: "End of day",
  questions,
  settings: { confirmation: "" },
  ...extra,
});

function elements(json: SurveyJson): SurveyElementJson[] {
  const out: SurveyElementJson[] = [];
  const walk = (els: SurveyElementJson[]) => {
    for (const el of els) {
      out.push(el);
      if (el.elements) walk(el.elements);
    }
  };
  for (const page of json.pages) walk(page.elements);
  return out;
}

const byName = (json: SurveyJson, name: string) => elements(json).find((e) => e.name === name);

function model(json: SurveyJson): Model {
  const m = new Model(json);
  expect(m.jsonErrors ?? []).toEqual([]);
  return m;
}

describe("mapping table (design B.1)", () => {
  const json = toSurveyJson(def(ALL), FILL);

  test("survey level: hardened settings, our locale, no completion page", () => {
    expect(json).toMatchObject({
      locale: "en",
      title: "Closing",
      description: "End of day",
      showQuestionNumbers: "off",
      showCompletePage: false,
    });
  });

  test("each type maps to its renderer element", () => {
    const expected: Record<string, Partial<SurveyElementJson>> = {
      [qid(1)]: { type: "text", isRequired: true, description: "Your full name", maxLength: 300 },
      [qid(2)]: { type: "comment", maxLength: 4000 },
      [qid(3)]: { type: "radiogroup", choices: [{ value: oid(1), text: "AM" }, { value: oid(2), text: "PM" }] },
      [qid(4)]: { type: "checkbox", minSelectedChoices: 1, maxSelectedChoices: 2 },
      [qid(5)]: { type: "dropdown", choices: [{ value: oid(6), text: "Front" }, { value: oid(7), text: "Back" }] },
      [qid(7)]: { type: "boolean", isRequired: true },
      [qid(8)]: { type: "text", inputType: "number", min: -5, max: 8 },
      [qid(9)]: { type: "text", inputType: "date" },
      [qid(10)]: { type: "text", inputType: "time" },
      [qid(11)]: { type: "rating", rateType: "stars", rateMin: 1, rateMax: 5, rateCount: 5 },
      [qid(12)]: { type: "rating", rateType: "labels", rateMin: 0, rateMax: 10, rateCount: 11, minRateDescription: "Quiet", maxRateDescription: "Packed" },
      [qid(13)]: { type: "boolean", renderAs: "checkbox", isRequired: true },
      [qid(14)]: { type: "file", acceptedTypes: "image/*", sourceType: "file-camera", storeDataAsText: false, allowMultiple: true, maxFiles: 3 },
      [qid(15)]: { type: "file", acceptedTypes: ".pdf,image/*", sourceType: "file", storeDataAsText: false, allowMultiple: false, maxFiles: 1 },
    };
    for (const [name, shape] of Object.entries(expected)) expect(byName(json, name)).toMatchObject(shape);
  });

  test("sections become wizard pages", () => {
    expect(json.pages.map((p) => p.name)).toEqual(["page_1", qid(6)]);
    expect(json.pages[1]).toMatchObject({ title: "Checks", description: "Closing checks" });
    expect(json.pages[1].elements.map((e) => e.name)).toEqual(ALL.slice(6).map((q) => q.id));
  });

  test("single layout: one page, one panel per section", () => {
    const single = toSurveyJson(def(ALL), { ...FILL, layout: "single" });
    expect(single.pages).toHaveLength(1);
    const panel = single.pages[0].elements.find((e) => e.type === "panel");
    expect(panel).toMatchObject({ name: qid(6), title: "Checks" });
    expect(panel?.elements?.map((e) => e.name)).toEqual(ALL.slice(6).map((q) => q.id));
    model(single);
  });

  test("a required checklist item must be checked", () => {
    expect(byName(json, qid(13))?.validators).toEqual([
      { type: "expression", expression: `{${qid(13)}} = true`, text: `T(${SURVEY_ADAPTER_KEY.checklistRequired})` },
    ]);
    const m = model(json);
    m.setValue(qid(13), false);
    expect(m.getQuestionByName(qid(13)).validate()).toBe(false);
    m.setValue(qid(13), true);
    expect(m.getQuestionByName(qid(13)).validate()).toBe(true);
  });

  test("the renderer model accepts every key and builds the same element types", () => {
    const m = model(json);
    for (const el of elements(json)) {
      if (el.type === "panel") continue;
      expect(m.getQuestionByName(el.name)?.getType()).toBe(el.type);
    }
    expect(m.getQuestionByName(qid(12)).visibleRateValues.map((v: { value: number }) => v.value)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  });

  test("archived questions and empty sections are left out", () => {
    const qs: Question[] = [
      { id: qid(1), type: "short_text", title: "A", required: false },
      { id: qid(2), type: "short_text", title: "Old", required: true, archived: true },
      { id: qid(3), type: "section", title: "Empty", required: false },
      { id: qid(4), type: "section", title: "Kept", required: false },
      { id: qid(5), type: "yes_no", title: "B", required: false },
    ];
    const out = toSurveyJson(def(qs), FILL);
    expect(out.pages.map((p) => p.name)).toEqual(["page_1", qid(4)]);
    expect(byName(out, qid(2))).toBeUndefined();
  });

  test("blank title/description/help are omitted, never emitted empty", () => {
    const out = toSurveyJson(def([{ id: qid(1), type: "yes_no", title: "A", required: false, help: "  " }], { title: " ", description: "" }), FILL);
    expect("title" in out).toBe(false);
    expect("description" in out).toBe(false);
    expect("description" in (byName(out, qid(1)) ?? {})).toBe(false);
  });

  test("confirmation is plain text with a localized default", () => {
    expect(confirmationText(def(ALL), t)).toBe(`T(${SURVEY_ADAPTER_KEY.defaultConfirmation})`);
    expect(confirmationText(def(ALL, { settings: { confirmation: "<b>Thanks</b>" } }), t)).toBe("<b>Thanks</b>");
  });
});

describe("modes", () => {
  const photo = ALL[13];
  const file = ALL[14];

  test("public mode refuses file and photo questions, archived ones included", () => {
    for (const q of [photo, file, { ...photo, archived: true }]) {
      const run = () => toSurveyJson(def([ALL[0], q]), { ...FILL, mode: "public" });
      expect(run).toThrow(SurveyAdapterError);
      try {
        run();
      } catch (e) {
        expect((e as SurveyAdapterError).code).toBe("not_public_safe");
      }
    }
  });

  test("public mode renders a public-safe definition in full", () => {
    const safe = ALL.filter((q) => q.type !== "photo" && q.type !== "file");
    const out = toSurveyJson(def(safe), { ...FILL, mode: "public", locale: "ar" });
    expect(out.locale).toBe("ar");
    expect(elements(out).filter((e) => e.type !== "panel").map((e) => e.name)).toEqual(
      safe.filter((q) => q.type !== "section").map((q) => q.id),
    );
  });

  test("preview never uploads: file questions are read-only and optional, with a note", () => {
    const out = toSurveyJson(def([{ ...photo, required: true }]), { ...FILL, mode: "preview" });
    expect(byName(out, photo.id)).toMatchObject({
      readOnly: true,
      isRequired: false,
      description: `T(${SURVEY_ADAPTER_KEY.previewNoUpload})`,
    });
  });

  test("a store tablet (allowFiles false) shows file questions read-only and optional, with the reason", () => {
    const out = toSurveyJson(def([{ ...file, required: true, help: "Scan it" }]), { ...FILL, allowFiles: false });
    expect(byName(out, file.id)).toMatchObject({
      readOnly: true,
      isRequired: false,
      description: `Scan it\n\nT(${SURVEY_ADAPTER_KEY.filesUnavailableHere})`,
    });
  });

  test("malformed input throws instead of emitting something", () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as SurveyAdapterError).code;
      }
      return "no error";
    };
    expect(code(() => toSurveyJson({ ...def(ALL), v: 2 } as unknown as FormDefinitionV1, FILL))).toBe("invalid_definition");
    expect(code(() => toSurveyJson(def(ALL), { ...FILL, locale: "de" as "en" }))).toBe("invalid_locale");
    const html = { id: qid(1), type: "html", title: "<script>", required: false } as unknown as Question;
    expect(code(() => toSurveyJson(def([html]), FILL))).toBe("invalid_definition");
    const badId = { ...ALL[0], id: "x} = 1 or {y" };
    expect(code(() => toSurveyJson(def([badId]), FILL))).toBe("invalid_definition");
  });
});

describe("round trip through the renderer's data", () => {
  // Each answer as the renderer holds it, and as `Answers` stores it.
  const cases: [Question, unknown, Answers[string]][] = [
    [ALL[0], "Ana", "Ana"],
    [ALL[1], "line 1\nline 2", "line 1\nline 2"],
    [ALL[2], oid(2), oid(2)],
    [ALL[3], [oid(3), oid(5)], [oid(3), oid(5)]],
    [ALL[4], oid(6), oid(6)],
    [ALL[6], false, false],
    [ALL[7], 4.5, 4.5],
    [ALL[8], "2026-10-06", "2026-10-06"],
    [ALL[9], "21:30", "21:30"],
    [ALL[10], 4, 4],
    [ALL[11], 0, 0],
    [ALL[12], true, true],
    [ALL[13], [{ name: "a.jpg", type: "image/jpeg", content: DRIVE_A }, { name: "b.jpg", type: "image/jpeg", content: DRIVE_B }], { driveItemIds: [DRIVE_A, DRIVE_B] }],
    [ALL[14], [{ name: "inv.pdf", type: "application/pdf", content: DRIVE_A }], { driveItemIds: [DRIVE_A] }],
  ];

  for (const [q, surveyValue, answer] of cases) {
    test(q.type, () => {
      const d = def(ALL);
      const m = model(toSurveyJson(d, FILL));
      m.setValue(q.id, surveyValue);
      const answers = fromSurveyData(d, m.data);
      expect(answers).toEqual({ [q.id]: answer });
    });
  }

  test("a full submission validates", () => {
    const d = def(ALL);
    const m = model(toSurveyJson(d, FILL));
    for (const [q, surveyValue] of cases) m.setValue(q.id, surveyValue);
    const answers = fromSurveyData(d, m.data);
    expect(Object.keys(answers)).toHaveLength(cases.length);
    expect(validateAnswers(d, answers, { allowFiles: true })).toEqual({ ok: true, value: answers });
  });

  test("numbers typed as strings and times with seconds are normalized", () => {
    const d = def(ALL);
    expect(fromSurveyData(d, { [qid(8)]: "7", [qid(10)]: "06:05:59" })).toEqual({ [qid(8)]: 7, [qid(10)]: "06:05" });
  });

  test("unknown keys, archived and section ids, empty and malformed values are dropped", () => {
    const archived = { ...ALL[0], id: qid(99), archived: true };
    const d = def([...ALL, archived]);
    const data = {
      [qid(99)]: "old",
      [qid(6)]: "section",
      [`${qid(2)}-Comment`]: "other",
      q_zzzzzzzzzzzz: "unknown",
      [qid(1)]: "",
      [qid(3)]: 7,
      [qid(4)]: [],
      [qid(7)]: "yes",
      [qid(8)]: "abc",
      [qid(9)]: "2026-02-30",
      [qid(11)]: Number.NaN,
      [qid(14)]: [{ name: "x.png", type: "image/png", content: "data:image/png;base64,AAAA" }],
      [qid(15)]: "not a list",
    };
    expect(fromSurveyData(d, data)).toEqual({});
    expect(fromSurveyData(d, null)).toEqual({});
    expect(fromSurveyData(d, [1, 2])).toEqual({});
  });
});

describe("allowlist property test", () => {
  // Deterministic PRNG (mulberry32) so a failure reproduces.
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const NASTY = [
    "", " ", "Plain", "<img src=x onerror=alert(1)>", "<script>alert(1)</script>", "completedHtml", "choicesByUrl",
    "{q_000000000001}", "javascript:alert(1)", "https://example.com/x.png", "__proto__", "مرحبا", "你好 👋🏽", "**md**",
  ];
  // Smuggled keys a forged definition might carry; none may reach the output.
  const SMUGGLED: Record<string, unknown> = {
    html: "<b>x</b>",
    completedHtml: "<b>x</b>",
    choicesByUrl: { url: "https://smuggled.invalid" },
    navigateToUrl: "https://smuggled.invalid",
    visibleIf: "{a} = 1",
    imageLink: "https://smuggled.invalid/i.png",
    surveyId: "abc",
    triggers: [{ type: "complete" }],
    renderAs: "custom-widget",
  };
  const INPUT_TYPES = ALL.map((q) => q.type).filter((x) => x !== "section");

  function randomDefinition(r: () => number, n: number): FormDefinitionV1 {
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    const str = () => pick(NASTY);
    const questions: Question[] = [];
    const count = 1 + Math.floor(r() * 25);
    for (let i = 0; i < count; i++) {
      const type = r() < 0.15 ? "section" : pick(INPUT_TYPES);
      const base: Record<string, unknown> = { id: qid(n * 100 + i + 1), type, title: str(), required: r() < 0.5 };
      if (r() < 0.5) base.help = str();
      if (r() < 0.1) base.archived = true;
      if (type === "single_choice" || type === "multi_choice" || type === "dropdown") {
        base.options = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, k) => ({ id: oid(i * 10 + k), label: str() }));
        if (type === "multi_choice" && r() < 0.5) base.max = 1 + Math.floor(r() * 3);
      }
      if (type === "number" && r() < 0.5) base.min = Math.floor(r() * 10) - 5;
      if (type === "scale") Object.assign(base, { min: r() < 0.5 ? 0 : 1, max: 2 + Math.floor(r() * 9), minLabel: str() });
      if (type === "file" && r() < 0.5) base.accept = pick([".pdf", "image/*", ".pdf,image/*", "javascript:x"]);
      if (type === "photo" || type === "file") base.maxFiles = Math.floor(r() * 12);
      if (r() < 0.3) Object.assign(base, SMUGGLED);
      questions.push(base as unknown as Question);
    }
    const d = def(questions, { title: str(), description: str(), settings: { confirmation: str() } });
    return (r() < 0.3 ? { ...d, ...SMUGGLED } : d) as FormDefinitionV1;
  }

  function collect(value: unknown, keys: Set<string>, types: Set<unknown>, path: string) {
    if (Array.isArray(value)) {
      for (const v of value) collect(v, keys, types, path);
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        keys.add(k);
        if (k === "type" && path === "elements") types.add(v);
        collect(v, keys, types, k);
      }
    }
  }

  test("the allowlist and the forbidden list are disjoint", () => {
    for (const key of SURVEY_FORBIDDEN_KEYS) expect(SURVEY_ALLOWED_KEYS.has(key)).toBe(false);
  });

  test("no forbidden or unknown key ever appears, for 400 random definitions in every mode", () => {
    const r = rng(20261006);
    let rendered = 0;
    for (let n = 0; n < 400; n++) {
      const d = randomDefinition(r, n);
      for (const mode of ["fill", "preview", "public"] as const) {
        for (const layout of ["wizard", "single"] as const) {
          let json: SurveyJson;
          try {
            json = toSurveyJson(d, { locale: "zh-hk", mode, t, layout, allowFiles: r() < 0.7 });
          } catch (e) {
            // The only refusal a well-formed definition can get: public mode with a file/photo question.
            expect((e as SurveyAdapterError).code).toBe("not_public_safe");
            expect(mode).toBe("public");
            continue;
          }
          rendered++;
          const keys = new Set<string>();
          const types = new Set<unknown>();
          collect(json, keys, types, "");
          expect(json.locale).toBe("zh-hk");
          for (const key of keys) expect(SURVEY_ALLOWED_KEYS.has(key)).toBe(true);
          for (const key of SURVEY_FORBIDDEN_KEYS) expect(keys.has(key)).toBe(false);
          for (const type of types) expect((SURVEY_ELEMENT_TYPES as readonly unknown[]).includes(type)).toBe(true);
          for (const marker of ["smuggled.invalid", "custom-widget", "{a} = 1"]) expect(JSON.stringify(json)).not.toContain(marker);
          if (mode === "public") expect(types.has("file")).toBe(false);
          if (n % 20 === 0) model(json);
        }
      }
    }
    expect(rendered).toBeGreaterThan(1000);
  });

  test("assertSurveyAllowlisted rejects a smuggled key or element type", () => {
    const json = toSurveyJson(def(ALL), FILL);
    expect(() => assertSurveyAllowlisted({ ...json, completedHtml: "<b>" })).toThrow(SurveyAdapterError);
    const page = { ...json.pages[0], elements: [{ type: "html", name: "x", html: "<b>" }] };
    expect(() => assertSurveyAllowlisted({ ...json, pages: [page] })).toThrow(SurveyAdapterError);
    expect(() => assertSurveyAllowlisted(json)).not.toThrow();
  });
});
