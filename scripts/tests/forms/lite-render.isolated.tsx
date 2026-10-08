// Isolated fixture for scripts/tests/forms/lite.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces modules with mock.module, so it runs in its own process, once per scenario
// (FORMS_LITE_SCENARIO). Server-renders the real Forms device app with its data hooks mocked.
import { expect, mock, test } from "bun:test";
import { createElement as h } from "react";
import type { FormAssignmentView, FormCompletionView, FormView } from "@/lib/forms/types";
import { BEN, INCIDENT, OPENING, ORG, PRIYA, SURVEY, definition, fid, formView, qid, responseView, translator } from "./lite-fixture";

type Scenario =
  | "store" | "personal" | "loading" | "not-published"
  | "fill-checklist" | "fill-steps" | "fill-staff-tablet" | "fill-owner-tablet";
const SCENARIO = (process.env.FORMS_LITE_SCENARIO ?? "store") as Scenario;
const NOW = new Date("2026-10-06T12:00:00");
const tr = translator();
const noop = () => {};

const closing = formView(fid(2), definition("Closing checklist", OPENING.questions), { kind: "checklist", trackCompletion: true });
const forms: FormView[] = [
  formView(fid(1), OPENING, { kind: "checklist", trackCompletion: true, perMember: "daily" }),
  closing,
  formView(fid(3), INCIDENT, { kind: "report" }),
  formView(fid(4), definition("Private survey", SURVEY.questions), { audience: "private" }),
  formView(fid(5), definition("Ben's task", SURVEY.questions), { audience: "assigned" }),
  formView(fid(6), definition("Draft form", SURVEY.questions), { status: "draft" }),
  formView(fid(7), definition("Stock count", SURVEY.questions), { audience: "assigned" }),
  formView(fid(8), definition("Uniform check", SURVEY.questions), { audience: "assigned" }),
  formView(fid(9), SURVEY, { kind: "survey", perMember: "daily" }),
];
const assignment = (formId: string, memberId: string, dueDate: string): FormAssignmentView => ({
  id: `${formId}:${memberId}`, organizationId: ORG, formId, memberId, dueDate, createdByMemberId: BEN, createdAt: NOW,
});
const assignments = [assignment(fid(5), BEN, ""), assignment(fid(7), PRIYA, "2026-10-01"), assignment(fid(8), PRIYA, "2026-10-09")];
const completions: FormCompletionView[] = [{
  id: "c1", organizationId: ORG, formId: fid(1), memberId: BEN, memberName: "Ben", period: "2026-10-06", date: "2026-10-06",
  completedAt: new Date("2026-10-06T08:05:00"),
}];
const myResponses = [
  responseView(fid(31), forms[8], { period: "2026-10-06", date: "2026-10-06" }),
  responseView(fid(32), forms[2], { reviewStatus: "reviewed", answers: { [qid(11)]: "Broken shelf", [qid(13)]: "o_00000002" } }),
];
const ready = SCENARIO !== "loading";
const notPublished = SCENARIO === "not-published";
const tabletRole = SCENARIO === "fill-staff-tablet" ? "staff" : "owner";
let myResponsesRead = 0;

mock.module("@/lib/i18n/context", () => ({ useT: () => tr, useI18n: () => ({ locale: "en", dir: "ltr", setLocale: noop, t: tr }) }));
mock.module("@/lib/haptics", () => ({ hapticLight: noop, hapticMedium: noop, hapticHeavy: noop, hapticSuccess: noop, hapticError: noop, hapticWarning: noop }));
mock.module("@/lib/use-now", () => ({ useNow: () => NOW }));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({ useSignedInMember: () => ({ memberId: BEN, role: tabletRole, settingsEdit: false, ready: true }) }));
mock.module("@/lib/spacetimedb/actions/forms", () => ({ submitFormResponse: () => Promise.resolve("x"), formsErrorKey: () => "forms.errors.generic" }));
mock.module("@/lib/spacetimedb/hooks/useForms", () => ({
  useForms: () => ({ forms: notPublished ? [] : forms.map((form) => ({ form, meta: null })), canManage: false, isReady: ready, notPublished }),
  useFormAssignments: (forMemberId?: string) => ({
    assignments, mine: assignments.filter((a) => a.memberId === forMemberId), isReady: ready, notPublished,
  }),
  useFormCompletions: () => ({ completions, recent: completions, isReady: ready, notPublished }),
  useMyFormResponses: () => { myResponsesRead++; return { responses: myResponses, failed: false, isReady: ready, notPublished }; },
  useFormUploadDevice: () => ({ deviceAccountRole: tabletRole, holdsStoreSession: false }),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { FormsLite } = await import("@/components/device/apps/forms");
const { FormFill } = await import("@/components/device/apps/forms-fill");

const priya = { id: PRIYA, displayName: "Priya", role: "staff", userIdHex: null, punchInCode: null };
const surface = SCENARIO === "personal" || SCENARIO === "fill-steps" ? "personal" : "store";
const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function home(): string {
  return visible(renderToStaticMarkup(h(FormsLite, { surface, organizationId: ORG, member: priya, isManager: false })));
}

function fill(form: FormView): string {
  if (!form.definition) throw new Error("fixture form has no definition");
  return renderToStaticMarkup(h(FormFill, {
    form, definition: form.definition, surface, organizationId: ORG, member: priya, deviceAccountRole: tabletRole, onClose: noop,
  }));
}

const PHOTO_CHECK = formView(fid(40), definition("Shelf check", [
  { id: qid(41), type: "checklist_item", title: "Shelves full", required: true },
  { id: qid(42), type: "photo", title: "Photo of the shelf", required: false },
]), { kind: "checklist" });

test(`forms lite: ${SCENARIO}`, () => {
  switch (SCENARIO) {
    case "store": {
      const text = home();
      expect(text).toContain(tr("device.lite.forms.checklistsLeft"));
      // One of the two tracked checklists is done (by Ben, 08:05); the other is left.
      expect(text).toMatch(/Checklists left today 1\b/);
      expect(text).toContain("Done · Ben 8:05");
      expect(text).toContain(tr("device.lite.forms.notDone"));
      expect(text).toContain(tr("device.lite.forms.report"));
      expect(text).toContain("Incident report");
      for (const hidden of ["Private survey", "Ben's task", "Draft form"]) expect(text).not.toContain(hidden);
      // The tablet never reads anyone's answers.
      expect(text).not.toContain(tr("device.lite.forms.mySubmissions"));
      expect(myResponsesRead).toBe(0);
      break;
    }
    case "personal": {
      const text = home();
      expect(text).toMatch(/To fill 2\b/);
      expect(text).toContain("Stock count");
      expect(text).toContain("Late · was due Oct 1");
      expect(text).toContain("Due Oct 9");
      expect(text.indexOf("Stock count")).toBeLessThan(text.indexOf("Uniform check"));
      expect(text).toContain(tr("device.lite.forms.openToAll"));
      expect(text).toContain(tr("device.lite.forms.doneForNow"));
      expect(text).toContain(tr("device.lite.forms.mySubmissions"));
      expect(text).toContain(tr("device.lite.forms.status.reviewed"));
      expect(text).toContain(tr("forms.disclosure.respondentNote"));
      for (const hidden of ["Private survey", "Ben's task", "Draft form"]) expect(text).not.toContain(hidden);
      break;
    }
    case "loading":
      expect(home()).not.toContain(tr("device.lite.forms.checklistsLeft"));
      break;
    case "not-published":
      expect(home()).toContain(tr("forms.errors.not_published"));
      break;
    case "fill-checklist": {
      const text = visible(fill(forms[0]));
      for (const s of ["Opening checklist", "Front", "Lights on", "Till counted", "Fridge temperature", tr("device.lite.forms.send")]) {
        expect(text).toContain(s);
      }
      expect(text).not.toMatch(/\b1\/3\b/);
      expect(text).not.toContain(tr("drive.disclosure.sharedDeviceNote"));
      break;
    }
    case "fill-steps": {
      const html = fill(forms[2]);
      const text = visible(html);
      // The answer field is named by the question title, and says it is required, for screen readers.
      const titleId = /<div id="([^"]+-title)"[^>]*>What happened\?/.exec(html)?.[1];
      expect(titleId).toBeTruthy();
      expect(html).toContain(`aria-labelledby="${titleId}"`);
      expect(html).toContain('aria-required="true"');
      expect(html).toContain('<span class="sr-only">Required</span>');
      expect(text).toContain("1/3");
      expect(text).toContain("What happened?");
      expect(text).toContain("Tell us about anything that went wrong.");
      expect(text).not.toContain("How bad?");
      expect(text).toContain(tr("common.next"));
      expect(text).not.toContain(tr("drive.disclosure.sharedDeviceNote"));
      break;
    }
    case "fill-staff-tablet": {
      const html = fill(PHOTO_CHECK);
      expect(visible(html)).toContain(tr("drive.disclosure.sharedDeviceNote"));
      expect(visible(html)).toContain(tr("device.lite.forms.filesOffTablet"));
      expect(html).not.toContain('type="file"');
      break;
    }
    case "fill-owner-tablet": {
      const html = fill(PHOTO_CHECK);
      expect(visible(html)).toContain(tr("drive.disclosure.sharedDeviceNote"));
      expect(visible(html)).not.toContain(tr("device.lite.forms.filesOffTablet"));
      expect(html).toContain('type="file"');
      expect(html).toContain('capture="environment"');
      break;
    }
  }
});
