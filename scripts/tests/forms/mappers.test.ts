// lib/forms/mappers.ts — Forms rows → views, read defensively.
import { describe, expect, test } from "bun:test";
import {
  mapForm, mapFormAssignment, mapFormCompletion, mapFormMeta, mapFormResponse, mapFormResponseReview,
  parseAnswersRow, parseIdList,
} from "@/lib/forms/mappers";

const FORM_ID = "0b6f8c5e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const ITEM_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ts = (ms: number) => ({ toDate: () => new Date(ms) });
const DEFINITION = {
  v: 1, title: "Opening", description: "", settings: { confirmation: "" },
  questions: [{ id: "q_aaaaaaaaaaaa", type: "short_text", title: "Name", required: true }],
};

function formRow(patch: Record<string, unknown> = {}) {
  return {
    id: FORM_ID.toUpperCase(), organizationId: "org", adminScope: "scope", ownerMemberId: "m1", title: "Opening",
    kind: "checklist", status: "open", audience: "members", memberVisible: true,
    definitionJson: JSON.stringify(DEFINITION), definitionBytes: 120, version: 3, perMember: "daily",
    responseLimit: 1000, closesAt: 0n, publicEnabled: false, hasFileQuestions: false, trackCompletion: true,
    notifyOwner: true, createdByMemberId: "m1", updatedByMemberId: "m2", createdAt: ts(1000), updatedAt: ts(2000),
    ...patch,
  };
}

describe("mapForm", () => {
  test("maps a stored form and validates its definition", () => {
    const form = mapForm(formRow());
    expect(form.id).toBe(FORM_ID);
    expect(form.kind).toBe("checklist");
    expect(form.status).toBe("open");
    expect(form.perMember).toBe("daily");
    expect(form.definition?.questions.map((q) => q.id)).toEqual(["q_aaaaaaaaaaaa"]);
    expect(form.closesAt).toBeNull();
    expect(form.createdAt.getTime()).toBe(1000);
    expect(form.updatedAt.getTime()).toBe(2000);
  });

  test("closesAt is microseconds since the epoch", () => {
    expect(mapForm(formRow({ closesAt: 1_700_000_000_000_000n })).closesAt?.getTime()).toBe(1_700_000_000_000);
  });

  test("a definition that does not validate is null, never a guess", () => {
    expect(mapForm(formRow({ definitionJson: "{nope" })).definition).toBeNull();
    expect(mapForm(formRow({ definitionJson: JSON.stringify({ ...DEFINITION, questions: [] }) })).definition).toBeNull();
    expect(mapForm(formRow({ definitionJson: undefined })).definition).toBeNull();
  });

  test("unknown enums degrade to the most restrictive reading", () => {
    const form = mapForm(formRow({ kind: "poll", status: "live", audience: "world", perMember: "hourly", memberVisible: "yes" }));
    expect(form.kind).toBe("form");
    expect(form.status).toBe("archived");
    expect(form.audience).toBe("private");
    expect(form.perMember).toBe("once");
    expect(form.memberVisible).toBe(false);
  });
});

describe("mapFormMeta", () => {
  test("counters and micro timestamps", () => {
    const meta = mapFormMeta({
      formId: FORM_ID, organizationId: "org", adminScope: "s", ownerMemberId: "m1", publicToken: "",
      responseCount: 4, answerBytes: 900n, fileBytes: 5000n, fileCount: 2, lastResponseAt: 2_000_000n,
      publicWindowStart: 0n, publicWindowCount: 0, updatedAt: ts(5), publicResponseCount: 1,
      publicAnswerBytes: 100n, publicPrevWindowCount: -3,
    });
    expect(meta.responseCount).toBe(4);
    expect(meta.answerBytes).toBe(900);
    expect(meta.fileBytes).toBe(5000);
    expect(meta.lastResponseAt?.getTime()).toBe(2000);
    expect(meta.publicWindowStart).toBeNull();
    expect(meta.publicPrevWindowCount).toBe(0);
  });
});

describe("mapFormResponse", () => {
  const row = (patch: Record<string, unknown> = {}) => ({
    id: "R-1", organizationId: "org", formId: FORM_ID, adminScope: "s", formOwnerMemberId: "m1",
    respondentMemberId: "m2", respondentName: "Ana", formTitle: "Opening", formVersion: 3, source: "store",
    submittedByIdentity: { toHexString: () => "abc" }, answersJson: JSON.stringify({ q_aaaaaaaaaaaa: "Hi" }),
    answerBytes: 40, fileItemIds: "[]", fileBytes: 0n, period: "2026-10-06", date: "2026-10-06",
    reviewStatus: "reviewed", createdAt: ts(10), updatedAt: ts(20), ...patch,
  });

  test("parses answers and file ids", () => {
    const r = mapFormResponse(row({
      answersJson: JSON.stringify({ q_a: "x", q_b: ["o_1"], q_c: 3, q_d: true, q_e: { driveItemIds: [ITEM_ID.toUpperCase()] } }),
      fileItemIds: JSON.stringify([ITEM_ID.toUpperCase()]),
    }));
    expect(r.id).toBe("r-1");
    expect(r.source).toBe("store");
    expect(r.submittedByIdentity).toBe("abc");
    expect(r.answers).toEqual({ q_a: "x", q_b: ["o_1"], q_c: 3, q_d: true, q_e: { driveItemIds: [ITEM_ID] } });
    expect(r.fileItemIds).toEqual([ITEM_ID]);
    expect(r.reviewStatus).toBe("reviewed");
  });

  test("malformed JSON and unknown enums never throw", () => {
    const r = mapFormResponse(row({ answersJson: "nope", fileItemIds: "{", source: "fax", reviewStatus: "done" }));
    expect(r.answers).toEqual({});
    expect(r.fileItemIds).toEqual([]);
    expect(r.source).toBe("public");
    expect(r.reviewStatus).toBe("new");
  });

  test("answer values of an unknown shape are dropped", () => {
    expect(parseAnswersRow(JSON.stringify({ a: null, b: [1, 2], c: { url: "x" }, d: "ok" }))).toEqual({ d: "ok" });
    expect(parseAnswersRow(JSON.stringify(["x"]))).toEqual({});
    expect(parseIdList(JSON.stringify(["A", 1, "b"]))).toEqual(["a", "b"]);
  });
});

describe("side tables", () => {
  test("review, assignment and completion rows", () => {
    expect(mapFormResponseReview({
      responseId: "R", organizationId: "o", formId: FORM_ID, adminScope: "s", reviewNote: "fine",
      reviewedByName: "Bo", noteBytes: 4, updatedAt: ts(1),
    })).toMatchObject({ responseId: "r", reviewNote: "fine", reviewedByName: "Bo", noteBytes: 4 });
    expect(mapFormAssignment({
      id: `${FORM_ID}:m2`, organizationId: "o", formId: FORM_ID, memberId: "m2", dueDate: "", createdByMemberId: "m1",
      createdAt: ts(1),
    })).toMatchObject({ formId: FORM_ID, memberId: "m2", dueDate: "" });
    expect(mapFormCompletion({
      id: "c", organizationId: "o", formId: FORM_ID, memberId: "m2", memberName: "Ana", period: "2026-10-06",
      date: "2026-10-06", completedAt: ts(7),
    })).toMatchObject({ memberName: "Ana", date: "2026-10-06" });
  });
});
