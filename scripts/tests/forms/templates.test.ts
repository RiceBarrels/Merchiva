// lib/forms/templates.ts: every template validates, resolves copy only through t() under forms.templates.*,
// and its public-safety flag matches the built definition.

import { describe, expect, test } from "bun:test";
import { isPublicSafe, validateDefinition } from "@/lib/forms/schema";
import { FORM_KINDS } from "@/lib/forms/types";
import {
  buildBlankForm,
  FORM_TEMPLATES,
  FORM_TEMPLATE_IDS,
  buildFormTemplate,
  formTemplateKeys,
  isFormTemplateId,
} from "@/lib/forms/templates";

/** Echoes the key and records it, so every visible string is traceable to a key. */
function recordingT() {
  const used = new Set<string>();
  const t = (key: string) => {
    used.add(key);
    return `«${key}»`;
  };
  return { t, used };
}

function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

describe("form templates", () => {
  test("ids and metadata", () => {
    expect(FORM_TEMPLATE_IDS[0]).toBe("blank");
    expect(FORM_TEMPLATES.map((m) => m.id)).toEqual([...FORM_TEMPLATE_IDS]);
    expect(isFormTemplateId("incidentReport")).toBe(true);
    expect(isFormTemplateId("nope")).toBe(false);
    expect(isFormTemplateId(null)).toBe(false);
  });

  for (const id of FORM_TEMPLATE_IDS) {
    test(`${id}: validates, uses only its own keys, and lists every key it uses`, () => {
      const { t, used } = recordingT();
      const built = buildFormTemplate(id, t, { random: seeded() });
      const r = validateDefinition(built.definition);
      expect(r.ok ? [] : r.issues).toEqual([]);
      for (const key of used) expect(key.startsWith(`forms.templates.${id}.`)).toBe(true);
      const listed = new Set(formTemplateKeys(id));
      for (const key of used) expect(listed.has(key)).toBe(true);
      // Every listed key except the tile copy is used by the definition.
      for (const key of listed) {
        if (key.endsWith(".title") || key.endsWith(".description")) continue;
        expect(used.has(key)).toBe(true);
      }
      // No literal user-facing text: every string field came from t().
      const json = JSON.stringify(built.definition);
      for (const m of json.matchAll(/"(?:title|help|label|minLabel|maxLabel|confirmation|description)":"([^"]*)"/g)) {
        expect(m[1] === "" || /^«forms\.templates\.[A-Za-z.]+»$/.test(m[1])).toBe(true);
      }
      const meta = FORM_TEMPLATES.find((m) => m.id === id);
      expect(meta?.publicSafe).toBe(isPublicSafe(built.definition));
      expect(meta?.kind).toBe(built.kind);
    });
  }

  test("ids are fresh per build and unique within a form", () => {
    const { t } = recordingT();
    const a = buildFormTemplate("incidentReport", t);
    const b = buildFormTemplate("incidentReport", t);
    const ids = a.definition.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toEqual(b.definition.questions.map((q) => q.id));
  });

  test("blank starts as an untitled form with one question", () => {
    const { t } = recordingT();
    const blank = buildFormTemplate("blank", t).definition;
    expect(blank.title).toBe("«forms.templates.blank.untitled»");
    expect(blank.questions).toHaveLength(1);
  });

  test("a blank form can start as any kind; a blank checklist repeats daily and tracks completion", () => {
    const { t } = recordingT();
    for (const kind of FORM_KINDS) {
      const built = buildBlankForm(kind, t);
      expect(built.kind).toBe(kind);
      expect(built.definition.title).toBe("«forms.templates.blank.untitled»");
      expect(built.definition.questions).toHaveLength(1);
      expect(built.trackCompletion).toBe(kind === "checklist");
      expect(built.perMember).toBe(kind === "checklist" ? "daily" : "unlimited");
    }
  });

  test("customer feedback is public-safe; incident report is not (photos)", () => {
    expect(FORM_TEMPLATES.find((m) => m.id === "customerFeedback")?.publicSafe).toBe(true);
    expect(FORM_TEMPLATES.find((m) => m.id === "incidentReport")?.publicSafe).toBe(false);
  });

  test("every key is under forms.templates and unique", () => {
    const all = formTemplateKeys();
    expect(new Set(all).size).toBe(all.length);
    for (const key of all) expect(key).toMatch(/^forms\.templates\.[a-zA-Z]+\.[a-zA-Z.]+$/);
  });
});
