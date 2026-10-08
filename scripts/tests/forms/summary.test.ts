// lib/forms/summary.ts: per-question aggregates for the responses summary.

import { describe, expect, test } from "bun:test";
import { summarizeResponses, type QuestionSummary, type SummaryResponse } from "@/lib/forms/summary";
import type { Answers, FormDefinitionV1 } from "@/lib/forms/types";

const Q = {
  sec: "q_000000000000",
  color: "q_000000000001",
  tags: "q_000000000002",
  ok: "q_000000000003",
  temp: "q_000000000004",
  stars: "q_000000000005",
  scale: "q_000000000006",
  notes: "q_000000000007",
  photo: "q_000000000008",
  old: "q_000000000009",
} as const;

const DEF: FormDefinitionV1 = {
  v: 1,
  title: "Feedback",
  description: "",
  settings: { confirmation: "" },
  questions: [
    { id: Q.sec, type: "section", title: "S", required: false },
    { id: Q.color, type: "single_choice", title: "Color", required: false, options: [{ id: "o_0000000r", label: "Red" }, { id: "o_0000000b", label: "Blue" }] },
    { id: Q.tags, type: "multi_choice", title: "Tags", required: false, options: [{ id: "o_0000000a", label: "A" }, { id: "o_0000000c", label: "C" }] },
    { id: Q.ok, type: "yes_no", title: "OK", required: false },
    { id: Q.temp, type: "number", title: "Temp", required: false },
    { id: Q.stars, type: "rating", title: "Stars", required: false },
    { id: Q.scale, type: "scale", title: "Scale", required: false, min: 0, max: 3 },
    { id: Q.notes, type: "long_text", title: "Notes", required: false },
    { id: Q.photo, type: "photo", title: "Photo", required: false, maxFiles: 3 },
    { id: Q.old, type: "short_text", title: "Old", required: false, archived: true },
  ],
};

const ITEM = (n: number) => `0a1b2c3d-0000-4000-8000-00000000000${n}`;

function resp(minute: number, name: string, answers: Answers): SummaryResponse {
  return { answers, respondentName: name, createdAt: new Date(Date.UTC(2026, 9, 6, 8, minute)) };
}

const RESPONSES: SummaryResponse[] = [
  resp(1, "Ana", { [Q.color]: "o_0000000r", [Q.tags]: ["o_0000000a", "o_0000000c"], [Q.ok]: true, [Q.temp]: 3.5, [Q.stars]: 5, [Q.scale]: 3, [Q.notes]: "first", [Q.photo]: { driveItemIds: [ITEM(1), ITEM(2)] }, [Q.old]: "legacy" }),
  resp(2, "Bo", { [Q.color]: "o_0000000b", [Q.tags]: ["o_0000000a"], [Q.ok]: false, [Q.temp]: -1, [Q.stars]: 3, [Q.notes]: "  " }),
  resp(3, "Cy", { [Q.color]: "o_zzzzzzzz", [Q.ok]: true, [Q.stars]: 4, [Q.scale]: 0, [Q.notes]: "third", [Q.photo]: { driveItemIds: [ITEM(3)] } }),
  resp(4, "Di", { [Q.color]: 7, [Q.temp]: "hot", [Q.stars]: "five" } as unknown as Answers),
];

function q<K extends QuestionSummary["kind"]>(s: QuestionSummary[], id: string, kind: K): Extract<QuestionSummary, { kind: K }> {
  const found = s.find((x) => x.questionId === id);
  if (!found || found.kind !== kind) throw new Error(`no ${kind} summary for ${id}`);
  return found as Extract<QuestionSummary, { kind: K }>;
}

describe("summarizeResponses", () => {
  const summary = summarizeResponses(DEF, RESPONSES);

  test("totals and time span; sections skipped", () => {
    expect(summary.total).toBe(4);
    expect(summary.firstAt?.getUTCMinutes()).toBe(1);
    expect(summary.lastAt?.getUTCMinutes()).toBe(4);
    expect(summary.questions.map((x) => x.questionId)).not.toContain(Q.sec);
  });

  test("choice counts, multi-choice, and unknown options as otherCount", () => {
    const color = q(summary.questions, Q.color, "choice");
    expect(color.counts).toEqual([
      { optionId: "o_0000000r", label: "Red", count: 1 },
      { optionId: "o_0000000b", label: "Blue", count: 1 },
    ]);
    expect(color.otherCount).toBe(1);
    expect(color.answered).toBe(3); // the numeric 7 is skipped
    const tags = q(summary.questions, Q.tags, "choice");
    expect(tags.counts.map((c) => c.count)).toEqual([2, 1]);
    expect(tags.answered).toBe(2);
  });

  test("booleans", () => {
    expect(q(summary.questions, Q.ok, "boolean")).toMatchObject({ yes: 2, no: 1, answered: 3 });
  });

  test("numeric averages, min/max and distributions", () => {
    const temp = q(summary.questions, Q.temp, "numeric");
    expect(temp).toMatchObject({ answered: 2, average: 1.25, min: -1, max: 3.5, distribution: [] });
    const stars = q(summary.questions, Q.stars, "numeric");
    expect(stars.average).toBe(4);
    expect(stars.distribution).toEqual([1, 2, 3, 4, 5].map((value) => ({ value, count: value >= 3 ? 1 : 0 })));
    const scale = q(summary.questions, Q.scale, "numeric");
    expect(scale.distribution).toEqual([{ value: 0, count: 1 }, { value: 1, count: 0 }, { value: 2, count: 0 }, { value: 3, count: 1 }]);
    expect(scale.average).toBe(1.5);
  });

  test("recent text answers, newest first, blanks skipped, limited", () => {
    const notes = q(summary.questions, Q.notes, "text");
    expect(notes.answered).toBe(2);
    expect(notes.recent.map((r) => [r.value, r.respondentName])).toEqual([["third", "Cy"], ["first", "Ana"]]);
    const one = summarizeResponses(DEF, RESPONSES, { recentLimit: 1 });
    expect(q(one.questions, Q.notes, "text").recent).toHaveLength(1);
  });

  test("files count answers and files", () => {
    expect(q(summary.questions, Q.photo, "files")).toMatchObject({ answered: 2, fileCount: 3 });
  });

  test("archived questions are included by default and can be left out", () => {
    const old = q(summary.questions, Q.old, "text");
    expect(old.archived).toBe(true);
    expect(old.answered).toBe(1);
    const active = summarizeResponses(DEF, RESPONSES, { includeArchived: false });
    expect(active.questions.some((x) => x.questionId === Q.old)).toBe(false);
  });

  test("no responses", () => {
    const empty = summarizeResponses(DEF, []);
    expect(empty).toMatchObject({ total: 0, firstAt: null, lastAt: null });
    expect(q(empty.questions, Q.temp, "numeric")).toMatchObject({ average: null, min: null, max: null });
  });
});
