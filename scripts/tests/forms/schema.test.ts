// lib/forms/schema.ts: limits, id formats, definition + answer validation, edit (type-lock) rules, periods and
// the public-safety check. The module mirror (spacetimedb/src/forms/logic.ts) is parity-tested separately.

import { describe, expect, test } from "bun:test";
import {
  FORM_MAX_ANSWERS_BYTES,
  FORM_MAX_DEFINITION_BYTES,
  FORM_MAX_LONG_TEXT_LENGTH,
  FORM_MAX_OPTIONS,
  FORM_MAX_QUESTIONS,
  FORM_MAX_SHORT_TEXT_LENGTH,
  answerFileItemIds,
  checkDefinitionEdit,
  definitionBytes,
  emptyDefinition,
  formPeriod,
  formPeriodForDateKey,
  hasFileQuestions,
  isPublicSafe,
  isQuestionId,
  isValidDateKey,
  isValidPeriod,
  isValidTime,
  isoWeekKey,
  newOptionId,
  newQuestionId,
  parseDefinitionJson,
  textLength,
  utf8ByteLength,
  validateAnswers,
  validateDefinition,
} from "@/lib/forms/schema";
import type { FormDefinitionV1, Question } from "@/lib/forms/types";

const Q = {
  name: "q_000000000001",
  notes: "q_000000000002",
  color: "q_000000000003",
  tags: "q_000000000004",
  ok: "q_000000000005",
  temp: "q_000000000006",
  day: "q_000000000007",
  at: "q_000000000008",
  stars: "q_000000000009",
  scale: "q_00000000000a",
  check: "q_00000000000b",
  photo: "q_00000000000c",
  sec: "q_00000000000d",
} as const;
const O = { red: "o_0000000r", blue: "o_0000000b", a: "o_0000000a", b: "o_0000000c" } as const;
const ITEM = "0a1b2c3d-0000-4000-8000-000000000001";
const ITEM2 = "0a1b2c3d-0000-4000-8000-000000000002";

function def(questions: Question[]): FormDefinitionV1 {
  return { v: 1, title: "Opening", description: "", questions, settings: { confirmation: "" } };
}

const FULL = def([
  { id: Q.sec, type: "section", title: "Start", required: false },
  { id: Q.name, type: "short_text", title: "Name", required: true },
  { id: Q.notes, type: "long_text", title: "Notes", required: false },
  { id: Q.color, type: "single_choice", title: "Color", required: false, options: [{ id: O.red, label: "Red" }, { id: O.blue, label: "Blue" }] },
  { id: Q.tags, type: "multi_choice", title: "Tags", required: false, options: [{ id: O.a, label: "A" }, { id: O.b, label: "B" }], max: 1 },
  { id: Q.ok, type: "yes_no", title: "OK?", required: true },
  { id: Q.temp, type: "number", title: "Temp", required: false, min: -30, max: 10 },
  { id: Q.day, type: "date", title: "Day", required: false },
  { id: Q.at, type: "time", title: "At", required: false },
  { id: Q.stars, type: "rating", title: "Stars", required: false },
  { id: Q.scale, type: "scale", title: "Scale", required: false, min: 0, max: 10 },
  { id: Q.check, type: "checklist_item", title: "Lights on", required: true },
  { id: Q.photo, type: "photo", title: "Photo", required: true, maxFiles: 2 },
]);

const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map((i) => i.code));

describe("primitives", () => {
  test("utf8ByteLength matches TextEncoder, including astral and lone surrogates", () => {
    for (const s of ["", "abc", "é", "店", "😀", "a\uD800b", "\uDC00", "混合 text 😀é"]) {
      expect(utf8ByteLength(s)).toBe(new TextEncoder().encode(s).length);
    }
  });

  test("textLength counts code points", () => {
    expect(textLength("😀😀")).toBe(2);
    expect(textLength("店a")).toBe(2);
    for (const s of ["", "a\uD800b", "\uDC00x", "😀a😀"]) expect(textLength(s)).toBe([...s].length);
  });

  test("question ids are q_ + 12 lowercase base36", () => {
    expect(isQuestionId("q_abcdefghij12")).toBe(true);
    expect(isQuestionId("q_ABCDEFGHIJ12")).toBe(false);
    expect(isQuestionId("q_abc")).toBe(false);
    expect(isQuestionId("x_abcdefghij12")).toBe(false);
    for (let i = 0; i < 50; i++) expect(isQuestionId(newQuestionId())).toBe(true);
    expect(newOptionId()).toMatch(/^o_[0-9a-z]{8}$/);
    expect(newQuestionId(() => 0)).toBe("q_000000000000");
    expect(newQuestionId(() => 0.9999999)).toBe("q_zzzzzzzzzzzz");
  });

  test("date and time formats", () => {
    expect(isValidDateKey("2026-02-28")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("2026-1-01")).toBe(false);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("7:00")).toBe(false);
  });
});

describe("periods", () => {
  test("ISO weeks across year boundaries", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01"); // Thursday
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53"); // Friday of 2026's week 53
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01"); // Monday
    expect(isoWeekKey("2026-10-05")).toBe("2026-W41");
    expect(isoWeekKey("2026-10-11")).toBe("2026-W41"); // Sunday ends the week
    expect(isoWeekKey("2026-10-12")).toBe("2026-W42");
  });

  test("formPeriodForDateKey per rule", () => {
    expect(formPeriodForDateKey("unlimited", "2026-10-06")).toBe("");
    expect(formPeriodForDateKey("once", "2026-10-06")).toBe("once");
    expect(formPeriodForDateKey("daily", "2026-10-06")).toBe("2026-10-06");
    expect(formPeriodForDateKey("weekly", "2026-10-06")).toBe("2026-W41");
    expect(() => formPeriodForDateKey("daily", "2026-10-32")).toThrow();
  });

  test("formPeriod uses the local calendar day, not the UTC day", () => {
    const lateEvening = new Date(2026, 9, 6, 23, 30); // local 2026-10-06 23:30
    expect(formPeriod("daily", lateEvening)).toBe("2026-10-06");
    const earlyMorning = new Date(2026, 9, 6, 0, 30);
    expect(formPeriod("daily", earlyMorning)).toBe("2026-10-06");
  });

  test("isValidPeriod", () => {
    expect(isValidPeriod("unlimited", "")).toBe(true);
    expect(isValidPeriod("once", "once")).toBe(true);
    expect(isValidPeriod("daily", "2026-10-06")).toBe(true);
    expect(isValidPeriod("daily", "once")).toBe(false);
    expect(isValidPeriod("weekly", "2026-W53")).toBe(true);
    expect(isValidPeriod("weekly", "2025-W53")).toBe(false);
    expect(isValidPeriod("weekly", "2026-W00")).toBe(false);
  });
});

describe("validateDefinition", () => {
  test("accepts a full definition and round-trips through JSON", () => {
    const r = validateDefinition(FULL);
    expect(codes(r)).toEqual([]);
    if (r.ok) expect(r.value).toEqual(FULL);
    const parsed = parseDefinitionJson(JSON.stringify(FULL));
    expect(parsed.ok).toBe(true);
    expect(definitionBytes(FULL)).toBe(utf8ByteLength(JSON.stringify(FULL)));
  });

  test("drops unknown and renderer fields (allowlist normalization)", () => {
    const dirty = {
      ...FULL,
      completedHtml: "<img onerror=alert(1)>",
      questions: [
        { id: Q.name, type: "short_text", title: "Name", required: true, html: "<b>x</b>", choicesByUrl: { url: "http://x" } },
        { id: Q.notes, type: "long_text", title: "Notes", required: false, options: [{ id: O.a, label: "A" }], maxFiles: 3 },
      ],
      settings: { confirmation: "Thanks", navigateToUrl: "http://evil" },
    };
    const r = validateDefinition(dirty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const json = JSON.stringify(r.value);
    for (const banned of ["completedHtml", "html", "choicesByUrl", "navigateToUrl", "options", "maxFiles"]) {
      expect(json).not.toContain(banned);
    }
    expect(r.value.settings).toEqual({ confirmation: "Thanks" });
  });

  test("section questions are never required", () => {
    const r = validateDefinition(def([
      { id: Q.sec, type: "section", title: "S", required: true },
      { id: Q.name, type: "short_text", title: "Name", required: false },
    ]));
    expect(r.ok && r.value.questions[0].required).toBe(false);
  });

  test("rejects bad shapes with issue codes", () => {
    expect(codes(validateDefinition(null))).toEqual(["invalid_definition"]);
    expect(codes(validateDefinition({ ...FULL, v: 2 }))).toEqual(["invalid_definition"]);
    expect(codes(validateDefinition({ ...FULL, title: "  " }))).toContain("title_required");
    expect(codes(validateDefinition({ ...FULL, title: "x".repeat(141) }))).toContain("title_too_long");
    expect(codes(validateDefinition(def([])))).toEqual(["no_questions"]);
    expect(codes(validateDefinition(def([{ id: Q.sec, type: "section", title: "S", required: false }])))).toEqual(["no_questions"]);
    expect(codes(validateDefinition(def([{ id: "q_bad", type: "short_text", title: "x", required: false } as Question])))).toContain("invalid_question_id");
    const dup = def([
      { id: Q.name, type: "short_text", title: "a", required: false },
      { id: Q.name, type: "long_text", title: "b", required: false },
    ]);
    expect(codes(validateDefinition(dup))).toContain("duplicate_question_id");
    const badType = { ...FULL, questions: [{ id: Q.name, type: "html", title: "x", required: false }] };
    expect(codes(validateDefinition(badType))).toContain("invalid_question_type");
    const noOptions = def([{ id: Q.color, type: "dropdown", title: "c", required: false, options: [] }]);
    expect(codes(validateDefinition(noOptions))).toContain("options_required");
    const badScale = def([{ id: Q.scale, type: "scale", title: "s", required: false, min: 3, max: 20 }]);
    expect(codes(validateDefinition(badScale))).toContain("invalid_range");
    const badNumber = def([{ id: Q.temp, type: "number", title: "n", required: false, min: 5, max: 1 }]);
    expect(codes(validateDefinition(badNumber))).toContain("invalid_range");
    const badFiles = def([{ id: Q.photo, type: "photo", title: "p", required: false, maxFiles: 11 }]);
    expect(codes(validateDefinition(badFiles))).toContain("invalid_max_files");
    const badAccept = def([{ id: Q.photo, type: "file", title: "f", required: false, accept: "<script>" }]);
    expect(codes(validateDefinition(badAccept))).toContain("invalid_accept");
  });

  test("question, option and text limits", () => {
    const many = def(Array.from({ length: FORM_MAX_QUESTIONS + 1 }, (_, i) => ({
      id: `q_${String(i).padStart(12, "0")}`, type: "short_text" as const, title: "x", required: false,
    })));
    expect(codes(validateDefinition(many))).toContain("too_many_questions");
    const options = Array.from({ length: FORM_MAX_OPTIONS + 1 }, (_, i) => ({ id: `o_${String(i).padStart(8, "0")}`, label: "x" }));
    expect(codes(validateDefinition(def([{ id: Q.color, type: "dropdown", title: "c", required: false, options }])))).toContain("too_many_options");
    const longTitle = def([{ id: Q.name, type: "short_text", title: "x".repeat(301), required: false }]);
    expect(codes(validateDefinition(longTitle))).toContain("question_title_too_long");
    const longHelp = def([{ id: Q.name, type: "short_text", title: "x", help: "h".repeat(501), required: false }]);
    expect(codes(validateDefinition(longHelp))).toContain("help_too_long");
  });

  test("the whole definition is capped at 64 KiB", () => {
    const options = Array.from({ length: 50 }, (_, i) => ({ id: `o_${String(i).padStart(8, "0")}`, label: "店".repeat(190) }));
    const big = def(Array.from({ length: 4 }, (_, i) => ({
      id: `q_${String(i).padStart(12, "0")}`, type: "dropdown" as const, title: "x", required: false, options,
    })));
    expect(definitionBytes(big)).toBeGreaterThan(FORM_MAX_DEFINITION_BYTES);
    expect(codes(validateDefinition(big))).toEqual(["definition_too_large"]);
    expect(codes(parseDefinitionJson("{"))).toEqual(["invalid_definition"]);
    expect(codes(parseDefinitionJson(" ".repeat(FORM_MAX_DEFINITION_BYTES + 1)))).toEqual(["definition_too_large"]);
  });

  test("emptyDefinition has no questions, so it does not validate until one is added", () => {
    expect(codes(validateDefinition(emptyDefinition("New form")))).toEqual(["no_questions"]);
  });
});

const BASE_ANSWERS = { [Q.name]: "Ana", [Q.ok]: true, [Q.check]: true, [Q.photo]: { driveItemIds: [ITEM] } };

describe("validateAnswers", () => {
  test("accepts every type and normalizes", () => {
    const r = validateAnswers(FULL, {
      ...BASE_ANSWERS,
      [Q.notes]: "",
      [Q.color]: O.blue,
      [Q.tags]: [O.a, O.a],
      [Q.temp]: -18.5,
      [Q.day]: "2026-10-06",
      [Q.at]: "07:45",
      [Q.stars]: 5,
      [Q.scale]: 0,
    }, { allowFiles: true });
    expect(codes(r)).toEqual([]);
    if (!r.ok) return;
    expect(r.value[Q.notes]).toBeUndefined(); // empty dropped
    expect(r.value[Q.tags]).toEqual([O.a]); // deduplicated
    expect(answerFileItemIds(r.value)).toEqual([ITEM]);
  });

  test("required questions, including a checklist item that must be checked", () => {
    expect(codes(validateAnswers(FULL, {}, { allowFiles: true })).sort()).toEqual(["required", "required", "required", "required"]);
    const unchecked = validateAnswers(FULL, { ...BASE_ANSWERS, [Q.check]: false }, { allowFiles: true });
    expect(unchecked.ok ? [] : unchecked.issues).toEqual([{ code: "required", questionId: Q.check }]);
    const blank = validateAnswers(FULL, { ...BASE_ANSWERS, [Q.name]: "   " }, { allowFiles: true });
    expect(codes(blank)).toEqual(["required"]);
  });

  test("rejects wrong types, unknown ids, out-of-range and over-long values", () => {
    const bad = (extra: Record<string, unknown>) => codes(validateAnswers(FULL, { ...BASE_ANSWERS, ...extra }, { allowFiles: true }));
    expect(bad({ q_zzzzzzzzzzzz: "x" })).toEqual(["unknown_question"]);
    expect(bad({ [Q.sec]: "x" })).toEqual(["unknown_question"]);
    expect(bad({ [Q.name]: 5 })).toEqual(["invalid_answer"]);
    expect(bad({ [Q.name]: "x".repeat(FORM_MAX_SHORT_TEXT_LENGTH + 1) })).toEqual(["text_too_long"]);
    expect(bad({ [Q.notes]: "x".repeat(FORM_MAX_LONG_TEXT_LENGTH) })).toEqual([]);
    expect(bad({ [Q.notes]: "x".repeat(FORM_MAX_LONG_TEXT_LENGTH + 1) })).toEqual(["text_too_long"]);
    expect(bad({ [Q.color]: "o_zzzzzzzz" })).toEqual(["unknown_option"]);
    expect(bad({ [Q.tags]: [O.a, O.b] })).toEqual(["too_many_selections"]);
    expect(bad({ [Q.temp]: 11 })).toEqual(["out_of_range"]);
    expect(bad({ [Q.temp]: Number.NaN })).toEqual(["invalid_answer"]);
    expect(bad({ [Q.stars]: 6 })).toEqual(["out_of_range"]);
    expect(bad({ [Q.stars]: 2.5 })).toEqual(["invalid_answer"]);
    expect(bad({ [Q.scale]: 11 })).toEqual(["out_of_range"]);
    expect(bad({ [Q.day]: "2026-02-30" })).toEqual(["invalid_answer"]);
    expect(bad({ [Q.at]: "25:00" })).toEqual(["invalid_answer"]);
    expect(bad({ [Q.ok]: "yes" })).toEqual(["invalid_answer"]);
    expect(bad({ [Q.photo]: { driveItemIds: ["../etc"] } })).toEqual(["invalid_answer"]);
    expect(bad({ [Q.photo]: { driveItemIds: [ITEM, ITEM2, "0a1b2c3d-0000-4000-8000-000000000003"] } })).toEqual(["too_many_files"]);
    expect(codes(validateAnswers(FULL, [], { allowFiles: true }))).toEqual(["invalid_answers"]);
  });

  test("archived questions take no new answers and are not required", () => {
    const archived = def(FULL.questions.map((q) => (q.id === Q.name ? { ...q, archived: true } : q)));
    expect(codes(validateAnswers(archived, { ...BASE_ANSWERS, [Q.name]: undefined }, { allowFiles: true }))).toEqual([]);
    expect(codes(validateAnswers(archived, BASE_ANSWERS, { allowFiles: true }))).toEqual(["unknown_question"]);
  });

  test("allowFiles false refuses file answers and skips required file questions", () => {
    const noPhoto = { ...BASE_ANSWERS, [Q.photo]: undefined };
    expect(codes(validateAnswers(FULL, noPhoto, { allowFiles: false }))).toEqual([]);
    expect(codes(validateAnswers(FULL, BASE_ANSWERS, { allowFiles: false }))).toEqual(["files_not_allowed"]);
  });

  test("answers JSON is capped at 32 KiB", () => {
    const longs = def(Array.from({ length: 10 }, (_, i) => ({
      id: `q_${String(i).padStart(12, "0")}`, type: "long_text" as const, title: "x", required: false,
    })));
    const answers = Object.fromEntries(longs.questions.map((q) => [q.id, "店".repeat(FORM_MAX_LONG_TEXT_LENGTH)]));
    expect(utf8ByteLength(JSON.stringify(answers))).toBeGreaterThan(FORM_MAX_ANSWERS_BYTES);
    expect(codes(validateAnswers(longs, answers, { allowFiles: true }))).toEqual(["answers_too_large"]);
  });
});

describe("edits after responses (type lock)", () => {
  const edited = (fn: (qs: Question[]) => Question[]) => def(fn(FULL.questions.map((q) => ({ ...q }))));

  test("anything goes before the first response", () => {
    expect(checkDefinitionEdit(FULL, def([{ id: Q.name, type: "number", title: "n", required: false }]), false)).toEqual([]);
  });

  test("relabel, reorder, archive, add and drop a section are allowed", () => {
    const next = edited((qs) => [
      ...qs.filter((q) => q.id !== Q.sec).reverse().map((q) => (q.id === Q.notes ? { ...q, archived: true, title: "Old notes" } : q)),
      { id: "q_zzzzzzzzzzzz", type: "short_text", title: "New", required: false },
    ]);
    expect(checkDefinitionEdit(FULL, next, true)).toEqual([]);
  });

  test("removing a question, changing its type or removing an option is refused", () => {
    expect(checkDefinitionEdit(FULL, edited((qs) => qs.filter((q) => q.id !== Q.name)), true))
      .toEqual([{ code: "question_removed", questionId: Q.name }]);
    expect(checkDefinitionEdit(FULL, edited((qs) => qs.map((q) => (q.id === Q.notes ? { ...q, type: "short_text" } : q))), true))
      .toEqual([{ code: "question_type_changed", questionId: Q.notes }]);
    const dropBlue = edited((qs) => qs.map((q) => (q.id === Q.color && "options" in q ? { ...q, options: q.options.slice(0, 1) } : q)));
    expect(checkDefinitionEdit(FULL, dropBlue, true)).toEqual([{ code: "option_removed", questionId: Q.color, optionId: O.blue }]);
  });
});

describe("public safety", () => {
  test("public-safe iff no photo/file question, archived ones included", () => {
    expect(hasFileQuestions(FULL)).toBe(true);
    expect(isPublicSafe(FULL)).toBe(false);
    const noFiles = def(FULL.questions.filter((q) => q.type !== "photo"));
    expect(isPublicSafe(noFiles)).toBe(true);
    const archivedFile = def([...noFiles.questions, { id: Q.photo, type: "file", title: "f", required: false, archived: true }]);
    expect(isPublicSafe(archivedFile)).toBe(false);
  });
});
