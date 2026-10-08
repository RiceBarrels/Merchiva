import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILDER_FILTERS, BUILDER_VIEWS, RESPONDENT_FILTERS } from "@/components/forms/list/status";
import { formTemplateKeys } from "@/lib/forms/templates";
import {
  FORM_AUDIENCES, FORM_KINDS, FORM_STATUSES, PER_MEMBER_RULES, QUESTION_TYPES, REVIEW_STATUSES,
} from "@/lib/forms/types";

const ROOT = join(import.meta.dir, "..", "..", "..");
// The merged Forms i18n fragment (English): every forms key the units drafted.
const FORMS_EN = join(ROOT, "scripts", "i18n", "drive", "forms", "en.json");

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === "string") out.set(prefix + k, v);
    else flatten(v, `${prefix}${k}.`, out);
  }
  return out;
}

const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Tree;
const draft = flatten(read(FORMS_EN));
const known = new Map([
  ...flatten(read(join(ROOT, "messages", "en.json"))),
  ...flatten(read(FORMS_EN)),
  ...draft,
]);

const MANAGER_FILES = [
  "components/forms/edit-shell.tsx",
  "components/forms/builder/index.tsx",
  "components/forms/builder/question-list.tsx",
  "components/forms/builder/question-editor.tsx",
  "components/forms/builder/type-fields.tsx",
  "components/forms/builder/settings-panel.tsx",
  "components/forms/list/forms-home.tsx",
  "components/forms/list/respondent-list.tsx",
  "components/forms/list/new-form-dialog.tsx",
  "components/forms/list/toolbar.tsx",
  "components/forms/share/share-panel.tsx",
  "components/forms/share/assignees.tsx",
  "components/forms/share/public-link.tsx",
];

describe("Forms manager (list, builder, share) i18n", () => {
  test("every literal key the screens use is defined", () => {
    const missing: string[] = [];
    for (const file of MANAGER_FILES) {
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const m of src.matchAll(/"((?:forms|nav|common)\.[A-Za-z0-9_.]+)"/g)) {
        if (!known.has(m[1])) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("every key built from a value is defined", () => {
    const families: string[] = [
      "nav.forms",
      ...FORM_STATUSES.map((s) => `forms.status.${s}`),
      ...FORM_KINDS.map((k) => `forms.kind.${k}`),
      ...PER_MEMBER_RULES.map((r) => `forms.perMember.${r}`),
      ...REVIEW_STATUSES.map((r) => `forms.reviewStatus.${r}`),
      ...QUESTION_TYPES.map((q) => `forms.types.${q}`),
      ...FORM_AUDIENCES.flatMap((a) => [`forms.share.audience.${a}`, `forms.share.audienceDesc.${a}`]),
      ...BUILDER_FILTERS.flatMap((f) => [`forms.list.filter.${f}`, `forms.list.empty.${f}`, `forms.list.empty.${f}Desc`]),
      ...RESPONDENT_FILTERS.flatMap((f) => [`forms.list.filter.${f}`, `forms.list.empty.${f}`, `forms.list.empty.${f}Desc`]),
      ...BUILDER_VIEWS.map((v) => `forms.edit.view.${v}`),
      ...["draft", "open", "closed"].map((s) => `forms.edit.action.${s}`),
      ...FORM_STATUSES.map((s) => `forms.edit.statusChanged.${s}`),
      ...["saved", "pending", "saving", "invalid", "error"].map((s) => `forms.builder.status.${s}`),
      ...["owner", "manager", "staff"].map((r) => `forms.share.role.${r}`),
      ...formTemplateKeys(),
    ];
    expect(families.filter((key) => !known.has(key))).toEqual([]);
  });

  test("draft values are non-empty English with balanced placeholders", () => {
    for (const [key, value] of draft) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect((value.match(/\{/g) ?? []).length, key).toBe((value.match(/\}/g) ?? []).length);
    }
  });

  test("no third-party product names in the copy", () => {
    const banned = /\b(SurveyJS|Survey\.js|Google|Excel|PowerPoint|Univer)\b/i;
    expect([...draft].filter(([, v]) => banned.test(v))).toEqual([]);
  });
});
