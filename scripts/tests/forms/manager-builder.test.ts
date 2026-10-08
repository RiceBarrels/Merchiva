import { describe, expect, test } from "bun:test";
import {
  addOption, duplicateQuestion, insertQuestion, moveQuestion, newQuestion, removeOption, removeQuestion, retypeQuestion,
  type DraftCopy,
} from "@/components/forms/builder/draft";
import {
  formEditHref, formFillHref, isAcceptingAt, isDoneThisPeriod, isFormForMember,
} from "@/components/forms/list/status";
import { formPeriod } from "@/lib/forms/period";
import { QUESTION_TYPES, type FormAssignmentView, type FormResponseView, type FormView } from "@/lib/forms/types";
import { checkDefinitionEdit, emptyDefinition, validateDefinition } from "@/lib/forms/schema";
import { committableDateKey } from "@/components/forms/share/date-commit-input";
import { responseFileHref } from "@/components/forms/responses/detail-dialog";

const copy: DraftCopy = { question: "Question", section: "Section", option: (n) => `Option ${n}` };

describe("builder draft edits", () => {
  test("every new question type validates in a definition", () => {
    for (const type of QUESTION_TYPES) {
      const def = { ...emptyDefinition("T"), questions: [newQuestion("short_text", copy), newQuestion(type, copy)] };
      expect(validateDefinition(def).ok).toBe(true);
    }
  });

  test("retype keeps id, title and choice options between choice types", () => {
    const q = { ...newQuestion("single_choice", copy), title: "Pick" };
    const next = retypeQuestion(q, "dropdown", copy);
    expect(next.id).toBe(q.id);
    expect(next.title).toBe("Pick");
    expect("options" in next && "options" in q && next.options).toEqual("options" in q ? q.options : []);
    const section = retypeQuestion({ ...q, required: true }, "section", copy);
    expect(section.required).toBe(false);
    expect("options" in section).toBe(false);
  });

  test("insert after the selected question, move, duplicate", () => {
    const a = newQuestion("short_text", copy);
    const b = newQuestion("long_text", copy);
    let def = { ...emptyDefinition("T"), questions: [a] };
    def = insertQuestion(def, b, null);
    expect(def.questions.map((q) => q.id)).toEqual([a.id, b.id]);
    const c = newQuestion("number", copy);
    def = insertQuestion(def, c, a.id);
    expect(def.questions.map((q) => q.id)).toEqual([a.id, c.id, b.id]);
    def = moveQuestion(def, b.id, -1);
    expect(def.questions.map((q) => q.id)).toEqual([a.id, b.id, c.id]);
    expect(moveQuestion(def, a.id, -1)).toBe(def);
    def = duplicateQuestion(def, a.id);
    expect(def.questions).toHaveLength(4);
    expect(def.questions[1].id).not.toBe(a.id);
    expect(validateDefinition(def).ok).toBe(true);
  });

  test("removal archives once the form has responses, so the module's type lock passes", () => {
    const a = newQuestion("short_text", copy);
    const b = newQuestion("multi_choice", copy);
    const saved = { ...emptyDefinition("T"), questions: [a, b] };
    const archived = removeQuestion(saved, b.id, true);
    expect(archived.questions).toHaveLength(2);
    expect(archived.questions[1].archived).toBe(true);
    expect(checkDefinitionEdit(saved, archived, true)).toEqual([]);
    const removed = removeQuestion(saved, b.id, false);
    expect(removed.questions).toHaveLength(1);
    expect(checkDefinitionEdit(saved, removed, true).map((i) => i.code)).toEqual(["question_removed"]);
  });

  test("option edits drop multi-choice limits that no longer fit", () => {
    let q = addOption(newQuestion("multi_choice", copy), copy);
    if (q.type !== "multi_choice") throw new Error("type");
    q = { ...q, min: 3, max: 3 };
    const next = removeOption(q, q.options[0].id);
    expect("options" in next && next.options).toHaveLength(2);
    expect(next.type === "multi_choice" && next.min).toBeFalsy();
    expect(next.type === "multi_choice" && next.max).toBeFalsy();
  });
});

function form(over: Partial<FormView> = {}): FormView {
  const now = new Date();
  return {
    id: "f1", organizationId: "o", adminScope: "s", ownerMemberId: "m0", title: "F", kind: "form", status: "open",
    audience: "members", memberVisible: true, definition: null, definitionBytes: 0, version: 1, perMember: "daily",
    responseLimit: 1000, closesAt: null, publicEnabled: false, hasFileQuestions: false, trackCompletion: false,
    notifyOwner: true, createdByMemberId: "m0", updatedByMemberId: "m0", createdAt: now, updatedAt: now, ...over,
  };
}

describe("list status helpers", () => {
  const now = new Date(2026, 9, 6, 12);

  test("accepting means open and not past the close time", () => {
    expect(isAcceptingAt(form(), now)).toBe(true);
    expect(isAcceptingAt(form({ status: "closed" }), now)).toBe(false);
    expect(isAcceptingAt(form({ closesAt: new Date(2026, 9, 6, 11) }), now)).toBe(false);
  });

  test("assigned forms reach only their assignees", () => {
    const assignment = { formId: "f1", memberId: "M1" } as FormAssignmentView;
    expect(isFormForMember(form({ audience: "assigned" }), [assignment], "m1")).toBe(true);
    expect(isFormForMember(form({ audience: "assigned" }), [assignment], "m2")).toBe(false);
    expect(isFormForMember(form({ memberVisible: false }), [], "m1")).toBe(false);
  });

  test("done this period follows the per-member rule", () => {
    const mine = [{ formId: "f1", period: formPeriod("daily", now) } as FormResponseView];
    expect(isDoneThisPeriod(form(), mine, now)).toBe(true);
    expect(isDoneThisPeriod(form({ perMember: "unlimited" }), mine, now)).toBe(false);
    expect(isDoneThisPeriod(form(), mine, new Date(2026, 9, 7, 12))).toBe(false);
  });

  test("hrefs are a static path plus query", () => {
    expect(formEditHref("f1", "share")).toBe("/manager/forms/edit?id=f1&view=share");
    expect(formFillHref("f1")).toBe("/manager/forms/fill?id=f1");
  });
});

describe("share date fields", () => {
  test("only a finished, plausible date (or '') is saved", () => {
    expect(committableDateKey("")).toBe("");
    expect(committableDateKey("2026-10-05")).toBe("2026-10-05");
    // A keyboard entry part-way through the year: "10/05/2" is already the value 0002-10-05.
    for (const partial of ["0002-10-05", "0020-10-05", "0202-10-05", "1999-12-31", "3000-01-01", "2026-02-30", "2026-1"]) {
      expect(committableDateKey(partial)).toBeNull();
    }
  });
});

describe("response file links", () => {
  const ITEM = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
  const ANA = "0b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
  test("the respondent opens their own My files; anyone else the Members view", () => {
    expect(responseFileHref(ANA, ANA.toUpperCase(), ITEM)).toBe(`/manager/drive?preview=item%3A${ITEM}`);
    expect(responseFileHref(ANA, "someone-else", ITEM)).toBe(`/manager/drive?space=members&member=${ANA}&preview=item%3A${ITEM}`);
    expect(responseFileHref(ANA, null, ITEM)).toContain("space=members");
  });
});
