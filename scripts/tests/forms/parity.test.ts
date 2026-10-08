// Client ⇄ module parity for Forms: lib/forms/{limits,period,schema,answers}.ts against the module mirror
// spacetimedb/src/forms/{limits,logic,answers}.ts. Both run on the same fixtures and must agree exactly — same
// issues, same normalized values, same bytes — because the reducer is the boundary and the client only predicts it.

import { describe, expect, test } from "bun:test";
import * as client from "@/lib/forms/schema";
import { FORM_KINDS, FORM_AUDIENCES, FORM_STATUSES, PER_MEMBER_RULES, QUESTION_TYPES, RESPONSE_SOURCES, REVIEW_STATUSES } from "@/lib/forms/types";
import * as server from "../../../spacetimedb/src/forms/logic";

const Q = (n: number) => `q_${n.toString(36).padStart(12, "0")}`;
const O = (n: number) => `o_${n.toString(36).padStart(8, "0")}`;
const ITEM = (n: number) => `0a1b2c3d-0000-4000-8000-${String(n).padStart(12, "0")}`;

const base = (questions: unknown[], extra: Record<string, unknown> = {}) => ({
  v: 1, title: "Opening", description: "", questions, settings: { confirmation: "" }, ...extra,
});

const FULL = base([
  { id: Q(1), type: "section", title: "Start", required: true, junk: 1 },
  { id: Q(2), type: "short_text", title: "Name", required: true, help: "Your name" },
  { id: Q(3), type: "long_text", title: "Notes", required: false },
  { id: Q(4), type: "single_choice", title: "Color", required: true, options: [{ id: O(1), label: "Red", x: 1 }, { id: O(2), label: "Blue" }] },
  { id: Q(5), type: "multi_choice", title: "Tags", required: false, min: 1, max: 2, options: [{ id: O(3), label: "A" }, { id: O(4), label: "B" }, { id: O(5), label: "C" }] },
  { id: Q(6), type: "dropdown", title: "Pick", required: false, options: [{ id: O(6), label: "One" }] },
  { id: Q(7), type: "yes_no", title: "OK?", required: false },
  { id: Q(8), type: "number", title: "Temp", required: false, min: -10, max: 10.5 },
  { id: Q(9), type: "date", title: "Day", required: false },
  { id: Q(10), type: "time", title: "At", required: false },
  { id: Q(11), type: "rating", title: "Stars", required: false },
  { id: Q(12), type: "scale", title: "Scale", required: false, min: 0, max: 10, minLabel: "Bad", maxLabel: "Good 😀" },
  { id: Q(13), type: "checklist_item", title: "Mopped", required: true },
  { id: Q(14), type: "photo", title: "Photo", required: false, maxFiles: 3, accept: "ignored" },
  { id: Q(15), type: "file", title: "File", required: true, accept: ".pdf, image/*" },
  { id: Q(16), type: "short_text", title: "Old", required: true, archived: true },
]);

const long = (n: number) => "x".repeat(n);

/** Definitions that must validate identically, valid and invalid. */
const DEFINITIONS: Array<[string, unknown]> = [
  ["full", FULL],
  ["not an object", "nope"],
  ["wrong version", { ...FULL, v: 2 }],
  ["questions not an array", { ...FULL, questions: {} }],
  ["blank title", { ...FULL, title: " " }],
  ["long title", { ...FULL, title: long(141) }],
  ["emoji title at the limit", { ...FULL, title: "😀".repeat(140) }],
  ["long description", { ...FULL, description: long(2001) }],
  ["bad settings", { ...FULL, settings: 5 }],
  ["long confirmation", { ...FULL, settings: { confirmation: long(501) } }],
  ["no questions", base([])],
  ["only archived and sections", base([{ id: Q(1), type: "section", title: "S" }, { id: Q(2), type: "yes_no", title: "Y", archived: true }])],
  ["too many questions", base(Array.from({ length: 101 }, (_, i) => ({ id: Q(i + 1), type: "yes_no", title: "Y" })))],
  ["bad ids and types", base([7, { id: "q_1", type: "yes_no", title: "Y" }, { id: Q(1), type: "html", title: "H" }, { id: Q(2), type: "yes_no", title: "Y" }])],
  ["duplicate ids", base([{ id: Q(1), type: "yes_no", title: "A" }, { id: Q(1), type: "yes_no", title: "B" }])],
  ["question title and help", base([{ id: Q(1), type: "yes_no", title: "" }, { id: Q(2), type: "yes_no", title: long(301), help: long(501) }, { id: Q(3), type: "yes_no", title: "Z", help: 3, required: "y", archived: 1 }])],
  ["options", base([
    { id: Q(1), type: "single_choice", title: "A", options: [] },
    { id: Q(2), type: "dropdown", title: "B", options: Array.from({ length: 51 }, (_, i) => ({ id: O(i + 1), label: "L" })) },
    { id: Q(3), type: "single_choice", title: "C", options: [{ id: "bad", label: "x" }, { id: O(1), label: "" }, { id: O(2), label: long(201) }, { id: O(2), label: "dup" }] },
  ])],
  ["ranges", base([
    { id: Q(1), type: "multi_choice", title: "A", min: 3, max: 1, options: [{ id: O(1), label: "x" }, { id: O(2), label: "y" }] },
    { id: Q(2), type: "number", title: "B", min: 5, max: 1 },
    { id: Q(3), type: "number", title: "C", min: Number.NaN },
    { id: Q(4), type: "scale", title: "D", min: 2, max: 11, minLabel: long(61), maxLabel: 4 },
  ])],
  ["files", base([
    { id: Q(1), type: "photo", title: "A", maxFiles: 0 },
    { id: Q(2), type: "file", title: "B", maxFiles: 11, accept: "<script>" },
    { id: Q(3), type: "file", title: "C", accept: "" },
  ])],
  ["too large", base(Array.from({ length: 100 }, (_, i) => ({
    id: Q(i + 1), type: "multi_choice", title: long(300), help: long(500),
    options: Array.from({ length: 5 }, (_, j) => ({ id: O(j + 1), label: long(200) })),
  })))],
];

describe("definition validation parity", () => {
  for (const [name, input] of DEFINITIONS) {
    test(name, () => {
      const c = client.validateDefinition(input);
      const s = server.validateDefinition(input);
      expect(s).toEqual(c as unknown as typeof s);
      if (c.ok && s.ok) {
        expect(server.serializeDefinition(s.value)).toBe(client.serializeDefinition(c.value));
        expect(server.definitionBytes(s.value)).toBe(client.definitionBytes(c.value));
        expect(server.hasFileQuestions(s.value)).toBe(client.hasFileQuestions(c.value));
        expect(server.isPublicSafe(s.value)).toBe(client.isPublicSafe(c.value));
        expect(server.answerableQuestions(s.value).map((q) => q.id)).toEqual(client.answerableQuestions(c.value).map((q) => q.id));
      }
      const json = typeof input === "string" ? input : JSON.stringify(input);
      expect(server.parseDefinitionJson(json)).toEqual(client.parseDefinitionJson(json) as unknown as ReturnType<typeof server.parseDefinitionJson>);
    });
  }

  test("the fixtures cover every question type and both outcomes", () => {
    const full = server.validateDefinition(FULL);
    expect(full.ok).toBe(true);
    if (full.ok) expect(new Set(full.value.questions.map((q) => q.type))).toEqual(new Set(server.QUESTION_TYPES));
    expect(DEFINITIONS.filter(([, d]) => !server.validateDefinition(d).ok).length).toBeGreaterThan(10);
    expect(server.validateDefinition(DEFINITIONS.at(-1)![1])).toEqual({ ok: false, issues: [{ code: "definition_too_large" }] });
  });

  test("malformed and oversized JSON", () => {
    for (const json of ["{", "", "null", long(64 * 1024 + 1)]) {
      expect(server.parseDefinitionJson(json)).toEqual(client.parseDefinitionJson(json) as unknown as ReturnType<typeof server.parseDefinitionJson>);
    }
  });
});

/** The two definition types are structurally the same JSON; the module's is a looser union. */
const asClientDef = (d: server.FormDefinitionV1) => d as unknown as Parameters<typeof client.validateAnswers>[0];

const FULL_DEF = (() => {
  const r = server.validateDefinition(FULL);
  if (!r.ok) throw new Error("FULL fixture must be valid");
  return r.value;
})();

const GOOD_ANSWERS = {
  [Q(2)]: "Ana", [Q(3)]: "", [Q(4)]: O(2), [Q(5)]: [O(5), O(3), O(5)], [Q(6)]: O(6), [Q(7)]: false,
  [Q(8)]: 10.5, [Q(9)]: "2026-02-28", [Q(10)]: "23:59", [Q(11)]: 5, [Q(12)]: 0, [Q(13)]: true,
  [Q(14)]: { driveItemIds: [ITEM(1), ITEM(1), ITEM(2)] }, [Q(15)]: { driveItemIds: [ITEM(3)] }, [Q(1)]: null,
};

/** Submissions that must validate identically against FULL, with files allowed and refused. */
const ANSWERS: Array<[string, unknown]> = [
  ["good", GOOD_ANSWERS],
  ["not an object", [1]],
  ["null", null],
  ["empty", {}],
  ["unknown and archived and section", { ...GOOD_ANSWERS, [Q(16)]: "old", [Q(1)]: "s", [Q(99)]: 1 }],
  ["wrong shapes", { ...GOOD_ANSWERS, [Q(2)]: 4, [Q(4)]: [O(1)], [Q(5)]: "x", [Q(7)]: "yes", [Q(8)]: "1", [Q(11)]: 2.5, [Q(12)]: "3", [Q(14)]: ["x"] }],
  ["text limits", { ...GOOD_ANSWERS, [Q(2)]: long(301), [Q(3)]: "😀".repeat(4000) }],
  ["long text over", { ...GOOD_ANSWERS, [Q(3)]: long(4001) }],
  ["dates and times", { ...GOOD_ANSWERS, [Q(9)]: "2026-02-30", [Q(10)]: "24:00" }],
  ["options", { ...GOOD_ANSWERS, [Q(4)]: O(9), [Q(5)]: [O(3), O(9)] }],
  ["selection counts", { ...GOOD_ANSWERS, [Q(5)]: [O(3), O(4), O(5)] }],
  ["ranges", { ...GOOD_ANSWERS, [Q(8)]: 11, [Q(11)]: 0, [Q(12)]: 11 }],
  ["infinite number", { ...GOOD_ANSWERS, [Q(8)]: Number.POSITIVE_INFINITY }],
  ["files", { ...GOOD_ANSWERS, [Q(14)]: { driveItemIds: [ITEM(1), ITEM(2), ITEM(3), ITEM(4)] }, [Q(15)]: { driveItemIds: ["data:image/png;base64,AA"] } }],
  ["required missing", { [Q(2)]: " ", [Q(13)]: false, [Q(15)]: { driveItemIds: [] } }],
  ["too large", { ...GOOD_ANSWERS, [Q(3)]: "😀".repeat(4000), [Q(2)]: "😀".repeat(300) }],
];

describe("answer validation parity", () => {
  for (const allowFiles of [true, false]) {
    for (const [name, input] of ANSWERS) {
      test(`${name} (files ${allowFiles ? "allowed" : "refused"})`, () => {
        const c = client.validateAnswers(asClientDef(FULL_DEF), input, { allowFiles });
        const s = server.validateAnswers(FULL_DEF, input, { allowFiles });
        expect(s).toEqual(c as unknown as typeof s);
        if (c.ok && s.ok) expect(server.answerFileItemIds(s.value)).toEqual(client.answerFileItemIds(c.value));
        const json = JSON.stringify(input);
        expect(server.parseAnswersJson(FULL_DEF, json, { allowFiles })).toEqual(
          client.validateAnswers(asClientDef(FULL_DEF), JSON.parse(json), { allowFiles }) as unknown as typeof s,
        );
      });
    }
  }

  test("the good submission passes with files and normalizes", () => {
    const s = server.validateAnswers(FULL_DEF, GOOD_ANSWERS, { allowFiles: true });
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.value[Q(5)]).toEqual([O(3), O(5)]);
      expect(server.answerFileItemIds(s.value)).toEqual([ITEM(1), ITEM(2), ITEM(3)]);
    }
  });

  test("more than ten files in one response", () => {
    const many = base([1, 2, 3].map((n) => ({ id: Q(n), type: "file", title: "F", maxFiles: 4 })));
    const d = server.validateDefinition(many);
    if (!d.ok) throw new Error("fixture");
    const input = Object.fromEntries([1, 2, 3].map((n) => [Q(n), { driveItemIds: [1, 2, 3, 4].map((i) => ITEM(n * 10 + i)) }]));
    const s = server.validateAnswers(d.value, input, { allowFiles: true });
    expect(s).toEqual({ ok: false, issues: [{ code: "too_many_files" }] });
    expect(s).toEqual(client.validateAnswers(asClientDef(d.value), input, { allowFiles: true }) as unknown as typeof s);
  });

  test("oversized and malformed answersJson are refused before parsing", () => {
    expect(server.parseAnswersJson(FULL_DEF, long(32 * 1024 + 1), { allowFiles: true })).toEqual({ ok: false, issues: [{ code: "answers_too_large" }] });
    expect(server.parseAnswersJson(FULL_DEF, "{", { allowFiles: true })).toEqual({ ok: false, issues: [{ code: "invalid_answers" }] });
  });
});

describe("edit rules parity", () => {
  const edited = (mutate: (qs: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) => {
    const qs = (FULL.questions as Array<Record<string, unknown>>).map((q) => ({ ...q }));
    const r = server.validateDefinition({ ...FULL, questions: mutate(qs) });
    if (!r.ok) throw new Error(`edit fixture invalid: ${JSON.stringify(r.issues)}`);
    return r.value;
  };
  const EDITS: Array<[string, server.FormDefinitionV1]> = [
    ["unchanged", FULL_DEF],
    ["section removed, question reordered, relabeled", edited((qs) => qs.filter((q) => q.type !== "section").reverse().map((q) => ({ ...q, title: `${String(q.title)}!` })))],
    ["question removed", edited((qs) => qs.filter((q) => q.id !== Q(2)))],
    ["type changed", edited((qs) => qs.map((q) => (q.id === Q(7) ? { ...q, type: "checklist_item" } : q)))],
    ["option removed", edited((qs) => qs.map((q) => (q.id === Q(5) ? { ...q, min: undefined, max: undefined, options: [{ id: O(3), label: "A" }] } : q)))],
    ["archived instead", edited((qs) => qs.map((q) => (q.id === Q(2) ? { ...q, archived: true } : q)))],
  ];
  for (const [name, next] of EDITS) {
    test(name, () => {
      for (const hasResponses of [true, false]) {
        expect(server.checkDefinitionEdit(FULL_DEF, next, hasResponses)).toEqual(
          client.checkDefinitionEdit(asClientDef(FULL_DEF), asClientDef(next), hasResponses),
        );
      }
    });
  }
  test("the type lock fires on the module side", () => {
    expect(server.checkDefinitionEdit(FULL_DEF, EDITS[2][1], true)).toEqual([{ code: "question_removed", questionId: Q(2) }]);
    expect(server.checkDefinitionEdit(FULL_DEF, EDITS[2][1], false)).toEqual([]);
  });
});

describe("periods and primitives parity", () => {
  const DAYS = ["2026-01-01", "2026-12-28", "2026-12-31", "2027-01-03", "2027-01-04", "2020-12-31", "2021-01-03", "2024-02-29", "2015-12-31", "2016-01-01"];
  const BAD_DAYS = ["2026-02-30", "2026-13-01", "2026-00-10", "26-01-01", "2026-1-1", 20260101, null];
  test("isoWeekKey and formPeriodForDateKey", () => {
    for (const day of DAYS) {
      expect(server.isoWeekKey(day)).toBe(client.isoWeekKey(day));
      for (const rule of PER_MEMBER_RULES) expect(server.formPeriodForDateKey(rule, day)).toBe(client.formPeriodForDateKey(rule, day));
    }
    expect(server.isoWeekKey("2027-01-03")).toBe("2026-W53");
    for (const day of BAD_DAYS) {
      expect(server.isValidDateKey(day)).toBe(client.isValidDateKey(day));
      if (typeof day === "string") expect(() => server.isoWeekKey(day)).toThrow(RangeError);
    }
  });
  test("isValidPeriod", () => {
    const periods = ["", "once", "2026-02-28", "2026-02-30", "2026-W01", "2026-W53", "2020-W53", "2026-W00", "2026-W54", "2026-w01", "x"];
    for (const rule of PER_MEMBER_RULES) {
      for (const p of periods) expect(server.isValidPeriod(rule, p)).toBe(client.isValidPeriod(rule, p));
    }
  });
  test("utf8ByteLength, textLength, time, accept and ids", () => {
    for (const s of ["", "abc", "é", "中文", "😀", "\ud800", "a\udc00b", "😀\ud83d", long(10)]) {
      expect(server.utf8ByteLength(s)).toBe(client.utf8ByteLength(s));
      expect(server.utf8ByteLength(s)).toBe(new TextEncoder().encode(s).length);
      expect(server.textLength(s)).toBe(client.textLength(s));
    }
    for (const t of ["00:00", "23:59", "24:00", "9:00", "12:60", 1200]) expect(server.isValidTime(t)).toBe(client.isValidTime(t));
    for (const a of [".pdf, image/*", "<x>", long(201), "", 4]) expect(server.isValidAccept(a)).toBe(client.isValidAccept(a));
    for (const id of [Q(1), "q_ABCDEFGHIJKL", O(1), "o_1", 5]) {
      expect(server.isQuestionId(id)).toBe(client.isQuestionId(id));
      expect(server.isOptionId(id)).toBe(client.isOptionId(id));
    }
    expect(server.DRIVE_ITEM_ID_RE.source).toBe(client.DRIVE_ITEM_ID_RE.source);
  });
  test("isDateKeyNear: only days some real timezone (UTC−12 … UTC+14) is in right now", () => {
    const at = (h: number) => BigInt(Date.UTC(2026, 9, 6, h)) * 1000n;
    expect(server.utcDayKeyOfMicros(at(12))).toBe("2026-10-06");
    // 11:00 UTC: UTC−12 is at 10-05 23:00 and UTC+14 at 10-07 01:00 → three days.
    for (const day of ["2026-10-05", "2026-10-06", "2026-10-07"]) expect(server.isDateKeyNear(day, at(11))).toBe(true);
    // 23:00 UTC (the review's case): UTC−12 is at 10-06 11:00 → 10-05 is nobody's day any more.
    expect(server.isDateKeyNear("2026-10-05", at(23))).toBe(false);
    for (const day of ["2026-10-06", "2026-10-07"]) expect(server.isDateKeyNear(day, at(23))).toBe(true);
    // 05:00 UTC: UTC+14 is at 10-06 19:00 → 10-07 is nobody's day yet.
    expect(server.isDateKeyNear("2026-10-07", at(5))).toBe(false);
    for (const day of ["2026-10-05", "2026-10-06"]) expect(server.isDateKeyNear(day, at(5))).toBe(true);
    for (const day of ["2026-10-04", "2026-10-08", "2026-10-32", ""]) expect(server.isDateKeyNear(day, at(12))).toBe(false);
  });
});

describe("limits and enums parity", () => {
  test("every client limit has the same value in the module", () => {
    const names = Object.keys(client).filter((k) => /^FORM_(MAX|DEFAULT|RATING|SCALE|PUBLIC_MAX)_/.test(k));
    expect(names.length).toBeGreaterThan(20);
    const s = server as unknown as Record<string, unknown>;
    const c = client as unknown as Record<string, unknown>;
    for (const name of names) expect([name, s[name]]).toEqual([name, c[name]]);
    expect(Number(server.FORM_PUBLIC_WINDOW_MICROS / 1000n)).toBe(client.FORM_PUBLIC_WINDOW_MS);
  });
  test("row enums match", () => {
    expect([...server.QUESTION_TYPES]).toEqual([...QUESTION_TYPES]);
    expect([...server.FORM_KINDS]).toEqual([...FORM_KINDS]);
    expect([...server.FORM_STATUSES]).toEqual([...FORM_STATUSES]);
    expect([...server.FORM_AUDIENCES]).toEqual([...FORM_AUDIENCES]);
    expect([...server.PER_MEMBER_RULES]).toEqual([...PER_MEMBER_RULES]);
    expect([...server.RESPONSE_SOURCES]).toEqual([...RESPONSE_SOURCES]);
    expect([...server.REVIEW_STATUSES]).toEqual([...REVIEW_STATUSES]);
  });
});

describe("module-only helpers", () => {
  test("formMemberVisible", () => {
    for (const status of server.FORM_STATUSES) {
      for (const audience of server.FORM_AUDIENCES) {
        expect(server.formMemberVisible(status, audience)).toBe((status === "open" || status === "closed") && audience !== "private");
      }
    }
  });
  test("public tokens are 64 lowercase hex", () => {
    expect(server.isFormPublicToken("ab".repeat(32))).toBe(true);
    for (const t of ["AB".repeat(32), "ab".repeat(31), `${"ab".repeat(32)}'`, "", 5]) expect(server.isFormPublicToken(t)).toBe(false);
  });
  test("nextPublicWindow: at most FORM_PUBLIC_MAX_PER_HOUR in any rolling hour", () => {
    const MAX = server.FORM_PUBLIC_MAX_PER_HOUR;
    const W = server.FORM_PUBLIC_WINDOW_MICROS;
    const t0 = 1_000_000_000_000n;
    expect(server.nextPublicWindow(0n, 0, 0, t0)).toEqual({ windowStart: t0, windowCount: 1, prevWindowCount: 0 });
    expect(server.nextPublicWindow(t0, 5, 0, t0 + 1n)).toEqual({ windowStart: t0, windowCount: 6, prevWindowCount: 0 });
    expect(server.nextPublicWindow(t0, MAX, 0, t0 + 1n)).toBeNull();
    // The review's burst: MAX at the end of the first hour; just past it the previous bucket still counts in full.
    expect(server.nextPublicWindow(t0, MAX, 0, t0 + W)).toBeNull();
    expect(server.nextPublicWindow(t0, MAX, 0, t0 + W + 60_000_000n)).toBeNull();
    // Half and half: the sum of the two buckets is what counts.
    expect(server.nextPublicWindow(t0, MAX / 2, 0, t0 + W + 1n)).toEqual({ windowStart: t0 + W, windowCount: 1, prevWindowCount: MAX / 2 });
    expect(server.nextPublicWindow(t0 + W, MAX / 2, MAX / 2, t0 + W + 2n)).toBeNull();
    // Two quiet hours later everything is forgotten; a clock step back starts over.
    expect(server.nextPublicWindow(t0, MAX, MAX, t0 + 2n * W)).toEqual({ windowStart: t0 + 2n * W, windowCount: 1, prevWindowCount: 0 });
    expect(server.nextPublicWindow(t0, MAX, MAX, t0 - 1n)).toEqual({ windowStart: t0 - 1n, windowCount: 1, prevWindowCount: 0 });
  });
  test("simulated traffic never exceeds the cap in any rolling hour", () => {
    const MAX = server.FORM_PUBLIC_MAX_PER_HOUR;
    const W = server.FORM_PUBLIC_WINDOW_MICROS;
    let state = { windowStart: 0n, windowCount: 0, prevWindowCount: 0 };
    const accepted: bigint[] = [];
    const step = 15_000_000n; // a request every 15 s for 5 hours
    for (let now = 1_000_000_000_000n; now < 1_000_000_000_000n + 5n * W; now += step) {
      const next = server.nextPublicWindow(state.windowStart, state.windowCount, state.prevWindowCount, now);
      if (next) { state = next; accepted.push(now); }
    }
    for (const start of accepted) expect(accepted.filter((t) => t >= start && t < start + W).length).toBeLessThanOrEqual(MAX);
    expect(accepted.length).toBeGreaterThan(2 * MAX);
  });
  test("formIssueError", () => {
    expect(server.formIssueError([{ code: "required", questionId: Q(2) }])).toBe(`[forms.required] ${Q(2)}`);
    expect(server.formIssueError([{ code: "no_questions" }])).toBe("[forms.no_questions]");
  });
});
