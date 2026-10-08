// The Forms device app (components/device/apps/forms.tsx + forms-fill.tsx): which forms a person may open, what
// counts as done this period, the fill steps and per-question checks, the copy every key resolves to, and each
// render state, run as child processes of lite-render.isolated.tsx (it replaces modules with mock.module).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { byDueDate, currentCompletions, formIsFillable, lastCompletion, periodDone } from "@/components/device/apps/forms";
import { fillSteps, fillsOnOneScreen, questionIssue } from "@/components/device/apps/forms-fill";
import type { FormCompletionView, InputQuestion } from "@/lib/forms/types";
import { INCIDENT, OPENING, PRIYA, SURVEY, fid, formView, keysIn, qid, translator } from "./lite-fixture";

const ROOT = join(import.meta.dir, "..", "..", "..");
const NOW = new Date("2026-10-06T12:00:00");
const TODAY = "2026-10-06";

describe("formIsFillable", () => {
  const none = new Set<string>();
  test("open, member-visible forms with questions", () => {
    expect(formIsFillable(formView(fid(1), OPENING), NOW, none)).toBe(true);
  });
  test("drafts, closed, archived, broken and question-less forms are not", () => {
    for (const status of ["draft", "closed", "archived"] as const) {
      expect(formIsFillable(formView(fid(1), OPENING, { status }), NOW, none)).toBe(false);
    }
    expect(formIsFillable(formView(fid(1), null), NOW, none)).toBe(false);
    const empty = { ...OPENING, questions: [OPENING.questions[0], { ...OPENING.questions[1], archived: true }] };
    expect(formIsFillable(formView(fid(1), empty), NOW, none)).toBe(false);
  });
  test("a passed close date shuts it; a future one does not", () => {
    expect(formIsFillable(formView(fid(1), OPENING, { closesAt: new Date("2026-10-06T11:59:59") }), NOW, none)).toBe(false);
    expect(formIsFillable(formView(fid(1), OPENING, { closesAt: new Date("2026-10-07T00:00:00") }), NOW, none)).toBe(true);
  });
  test("private forms never show on a device; assigned ones only for the assignee", () => {
    expect(formIsFillable(formView(fid(1), OPENING, { audience: "private" }), NOW, new Set([fid(1)]))).toBe(false);
    expect(formIsFillable(formView(fid(1), OPENING, { audience: "assigned" }), NOW, none)).toBe(false);
    expect(formIsFillable(formView(fid(1), OPENING, { audience: "assigned" }), NOW, new Set([fid(1)]))).toBe(true);
  });
});

describe("periodDone", () => {
  const completion = (over: Partial<FormCompletionView>): FormCompletionView => ({
    id: "c", organizationId: "o", formId: fid(1), memberId: PRIYA, memberName: "Priya", period: TODAY, date: TODAY,
    completedAt: new Date("2026-10-06T08:00:00"), ...over,
  });
  test("unlimited forms are never done", () => {
    const f = formView(fid(1), OPENING, { perMember: "unlimited" });
    expect(periodDone(f, TODAY, PRIYA, [{ formId: fid(1), period: "" }], [completion({ period: TODAY })])).toBe(false);
  });
  test("daily: today's own response or completion; not yesterday's, not a colleague's", () => {
    const f = formView(fid(1), OPENING, { perMember: "daily" });
    expect(periodDone(f, TODAY, PRIYA, [{ formId: fid(1), period: TODAY }], [])).toBe(true);
    expect(periodDone(f, TODAY, PRIYA, [], [completion({})])).toBe(true);
    expect(periodDone(f, TODAY, PRIYA.toUpperCase(), [], [completion({})])).toBe(true);
    expect(periodDone(f, TODAY, PRIYA, [{ formId: fid(1), period: "2026-10-05" }], [])).toBe(false);
    expect(periodDone(f, TODAY, PRIYA, [], [completion({ memberId: fid(9) })])).toBe(false);
    expect(periodDone(f, TODAY, PRIYA, [{ formId: fid(2), period: TODAY }], [])).toBe(false);
  });
  test("weekly and once use their own period keys", () => {
    expect(periodDone(formView(fid(1), SURVEY, { perMember: "weekly" }), TODAY, PRIYA, [{ formId: fid(1), period: "2026-W41" }], [])).toBe(true);
    expect(periodDone(formView(fid(1), SURVEY, { perMember: "once" }), TODAY, PRIYA, [{ formId: fid(1), period: "once" }], [])).toBe(true);
  });
});

describe("currentCompletions (store home)", () => {
  const completion = (over: Partial<FormCompletionView>): FormCompletionView => ({
    id: "c", organizationId: "o", formId: fid(1), memberId: PRIYA, memberName: "Priya", period: TODAY, date: TODAY,
    completedAt: new Date("2026-10-06T08:00:00"), ...over,
  });
  // TODAY (2026-10-06) is a Tuesday in ISO week 2026-W41; Monday's weekly completion still counts.
  const monday = completion({ period: "2026-W41", date: "2026-10-05" });
  const lastWeek = completion({ period: "2026-W40", date: "2026-10-01" });
  test("a weekly form done earlier this week is done on the tablet", () => {
    const weekly = formView(fid(1), OPENING, { perMember: "weekly", kind: "checklist", trackCompletion: true });
    expect(currentCompletions(weekly, TODAY, [], [monday, lastWeek])).toEqual([monday]);
    expect(periodDone(weekly, TODAY, PRIYA, [], [monday])).toBe(true);
    expect(periodDone(weekly, TODAY, PRIYA, [], [lastWeek])).toBe(false);
  });
  test("a daily form only counts today's", () => {
    const daily = formView(fid(1), OPENING, { perMember: "daily" });
    const today = completion({});
    expect(currentCompletions(daily, TODAY, [today], [today, completion({ period: "2026-10-05", date: "2026-10-05" })])).toEqual([today]);
  });
  test("a once form counts any live completion", () => {
    const once = formView(fid(1), OPENING, { perMember: "once" });
    const done = completion({ period: "once", date: "2026-10-02" });
    expect(currentCompletions(once, TODAY, [], [done])).toEqual([done]);
  });
});

test("lastCompletion picks the latest of a form", () => {
  const rows = [
    { formId: fid(1), completedAt: new Date("2026-10-06T08:00:00"), memberName: "A" },
    { formId: fid(1), completedAt: new Date("2026-10-06T09:00:00"), memberName: "B" },
    { formId: fid(2), completedAt: new Date("2026-10-06T10:00:00"), memberName: "C" },
  ];
  expect(lastCompletion(fid(1), rows)?.memberName).toBe("B");
  expect(lastCompletion(fid(3), rows)).toBeNull();
});

test("byDueDate: earliest due first, no due date last, then by title", () => {
  const due = new Map([[fid(1), "2026-10-09"], [fid(2), "2026-10-01"], [fid(3), ""], [fid(4), ""]]);
  const forms = [formView(fid(3), SURVEY, { title: "Zed" }), formView(fid(1), SURVEY), formView(fid(4), SURVEY, { title: "Alpha" }), formView(fid(2), SURVEY)];
  expect(forms.sort(byDueDate((id) => due.get(id) ?? "")).map((f) => f.id)).toEqual([fid(2), fid(1), fid(4), fid(3)]);
});

describe("fill flow", () => {
  test("steps skip sections and archived questions and carry their section title", () => {
    const def = { ...OPENING, questions: [...OPENING.questions, { id: qid(5), type: "short_text" as const, title: "Old", required: false, archived: true }] };
    expect(fillSteps(def).map((s) => [s.question.id, s.section])).toEqual([[qid(2), "Front"], [qid(3), "Front"], [qid(4), "Front"]]);
    expect(fillSteps(SURVEY).every((s) => s.section === null)).toBe(true);
  });
  test("checklists fill on one screen; other kinds one question at a time", () => {
    expect(fillsOnOneScreen({ kind: "checklist" })).toBe(true);
    for (const kind of ["form", "report", "survey"] as const) expect(fillsOnOneScreen({ kind })).toBe(false);
  });
  test("questionIssue: required, valid, and files off on a staff tablet", () => {
    const text = INCIDENT.questions[0] as InputQuestion;
    const photo = INCIDENT.questions[1] as InputQuestion;
    expect(questionIssue(INCIDENT, text, undefined, true)?.code).toBe("required");
    expect(questionIssue(INCIDENT, text, "Broken shelf", true)).toBeNull();
    const item = OPENING.questions[1] as InputQuestion;
    expect(questionIssue(OPENING, item, undefined, true)?.code).toBe("required");
    expect(questionIssue(OPENING, item, true, true)).toBeNull();
    expect(questionIssue(INCIDENT, photo, undefined, false)).toBeNull();
    expect(questionIssue(INCIDENT, photo, { driveItemIds: [fid(7)] }, false)?.code).toBe("files_not_allowed");
  });
});

describe("copy", () => {
  const t = translator();
  for (const path of ["components/device/apps/forms.tsx", "components/device/apps/forms-fill.tsx"]) {
    test(`every key in ${path} has English copy`, () => {
      const missing = keysIn(path).filter((key) => t(key) === key);
      expect(missing).toEqual([]);
    });
  }
  test("no vendor or third-party product names in the device copy", () => {
    const draft = readFileSync(join(ROOT, "scripts/i18n/drive/forms/en.json"), "utf8");
    expect(draft).not.toMatch(/SurveyJS|Google|Excel|Typeform|Jotform/i);
  });
});

describe("lite renders each state", () => {
  const SCENARIOS = ["store", "personal", "loading", "not-published", "fill-checklist", "fill-steps", "fill-staff-tablet", "fill-owner-tablet"] as const;
  for (const scenario of SCENARIOS) {
    test(scenario, () => {
      const proc = Bun.spawnSync([process.execPath, "test", "./scripts/tests/forms/lite-render.isolated.tsx"], {
        cwd: ROOT, env: { ...process.env, FORMS_LITE_SCENARIO: scenario }, stdout: "pipe", stderr: "pipe",
      });
      const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
      if (proc.exitCode !== 0) console.error(output);
      expect(proc.exitCode).toBe(0);
      expect(output).toMatch(/\b[1-9]\d* pass\b/);
      expect(output).toContain(" 0 fail");
    }, 60_000);
  }
});
