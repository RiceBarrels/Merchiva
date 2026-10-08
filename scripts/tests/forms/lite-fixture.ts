// Shared fixture for the Forms device-app tests (lite.test.ts, lite-render.isolated.tsx): form views, a few
// definitions, and an English translator that reads messages/en.json plus the Forms drafts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FormDefinitionV1, FormResponseView, FormView, Question } from "@/lib/forms/types";

const ROOT = join(import.meta.dir, "..", "..", "..");

export const ORG = "00000000-0000-4000-8000-0000000000a1";
export const PRIYA = "00000000-0000-4000-8000-0000000000b1";
export const BEN = "00000000-0000-4000-8000-0000000000b2";
export const fid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const qid = (n: number) => `q_${String(n).padStart(12, "0")}`;
export const oid = (n: number) => `o_${String(n).padStart(8, "0")}`;

export function definition(title: string, questions: Question[], description = ""): FormDefinitionV1 {
  return { v: 1, title, description, questions, settings: { confirmation: "" } };
}

export const OPENING: FormDefinitionV1 = definition("Opening checklist", [
  { id: qid(1), type: "section", title: "Front", required: false },
  { id: qid(2), type: "checklist_item", title: "Lights on", required: true },
  { id: qid(3), type: "checklist_item", title: "Till counted", required: true },
  { id: qid(4), type: "number", title: "Fridge temperature", required: false },
]);

export const INCIDENT: FormDefinitionV1 = definition("Incident report", [
  { id: qid(11), type: "short_text", title: "What happened?", required: true },
  { id: qid(12), type: "photo", title: "Photo of the damage", required: false },
  { id: qid(13), type: "single_choice", title: "How bad?", required: true, options: [{ id: oid(1), label: "Minor" }, { id: oid(2), label: "Serious" }] },
], "Tell us about anything that went wrong.");

export const SURVEY: FormDefinitionV1 = definition("Team survey", [
  { id: qid(21), type: "rating", title: "How was your week?", required: true },
  { id: qid(22), type: "yes_no", title: "Would you recommend us?", required: false },
]);

export function formView(id: string, def: FormDefinitionV1 | null, over: Partial<FormView> = {}): FormView {
  const at = new Date("2026-10-01T09:00:00Z");
  return {
    id, organizationId: ORG, adminScope: "scope", ownerMemberId: BEN, title: def?.title ?? "Broken", kind: "form",
    status: "open", audience: "members", memberVisible: true, definition: def, definitionBytes: 100, version: 1,
    perMember: "unlimited", responseLimit: 1000, closesAt: null, publicEnabled: false,
    hasFileQuestions: def ? def.questions.some((q) => q.type === "photo" || q.type === "file") : false,
    trackCompletion: false, notifyOwner: false, createdByMemberId: BEN, updatedByMemberId: BEN, createdAt: at, updatedAt: at,
    ...over,
  };
}

export function responseView(id: string, form: FormView, over: Partial<FormResponseView> = {}): FormResponseView {
  const at = new Date("2026-10-02T10:30:00Z");
  return {
    id, organizationId: ORG, formId: form.id, adminScope: "scope", formOwnerMemberId: BEN, respondentMemberId: PRIYA,
    respondentName: "Priya", formTitle: form.title, formVersion: 1, source: "personal", submittedByIdentity: "",
    answers: {}, answerBytes: 2, fileItemIds: [], fileBytes: 0, period: "", date: "2026-10-02", reviewStatus: "new",
    createdAt: at, updatedAt: at, ...over,
  };
}

function flatten(node: unknown, prefix: string, out: Map<string, string>): void {
  if (typeof node === "string") out.set(prefix, node);
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

/** English copy: messages/en.json, overlaid with the Forms i18n fragment; unknown keys come back as the key. */
export function translator(): (key: string) => string {
  const strings = new Map<string, string>();
  flatten(JSON.parse(readFileSync(join(ROOT, "messages", "en.json"), "utf8")), "", strings);
  flatten(JSON.parse(readFileSync(join(ROOT, "scripts", "i18n", "drive", "forms", "en.json"), "utf8")), "", strings);
  return (key: string) => strings.get(key) ?? key;
}

/** Every `t("…")` / quoted `device.lite.forms.*` key a source file uses. */
export function keysIn(path: string): string[] {
  const text = readFileSync(join(ROOT, path), "utf8");
  const keys = new Set<string>();
  for (const m of text.matchAll(/\bt\("([a-zA-Z0-9_.]+)"\)/g)) keys.add(m[1]);
  for (const m of text.matchAll(/"((?:device\.lite\.forms|forms\.disclosure)\.[a-zA-Z0-9_.]+)"/g)) keys.add(m[1]);
  return [...keys].sort();
}
