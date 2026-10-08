// lib/spacetimedb/actions/forms.ts — reducer wrappers (argument shapes match the generated bindings) and the
// error → i18n key mapping, with parity against the module's FormErrorCode and the client's FormIssueCode.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DriveClientError } from "@/lib/drive/errors";
import {
  FORM_ISSUE_CODES, FORM_SERVER_ERROR_CODES, FormsClientError, assignForm, closesAtMicros, createForm, deleteForm,
  deleteFormResponse, formsErrorCode, formsErrorKey, formsErrorQuestionId, reviewFormResponse, setFormPublicLink,
  setFormStatus, submitFormResponse, transferForm, unassignForm, updateFormDefinition, updateFormSettings,
} from "@/lib/spacetimedb/actions/forms";
import { clearConnection, setConnection } from "@/lib/spacetimedb/client";
import { emptyDefinition } from "@/lib/forms/schema";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const ORG = "4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const FORM = "0b6f8c5e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";

/** The `|`-separated string literals of a type union declared in `source`. */
function unionLiterals(source: string, typeName: string): string[] {
  const match = new RegExp(`export type ${typeName} =([\\s\\S]*?);`).exec(source);
  if (!match) throw new Error(`${typeName} not found`);
  return [...match[1].matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]);
}

interface Call { name: string; args: Record<string, unknown> }
let calls: Call[] = [];
let fail: unknown = null;

function fakeConnection(): void {
  const reducers = new Proxy({}, {
    get: (_t, name: string) => async (args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (fail) throw fail;
    },
  });
  setConnection({ reducers } as never);
}

/** Argument names of a generated reducer (lib/spacetimedb/generated/<snake>_reducer.ts). */
function generatedArgs(name: string): string[] {
  const snake = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  const body = /export default \{([\s\S]*?)\};/.exec(read(`lib/spacetimedb/generated/${snake}_reducer.ts`))?.[1] ?? "";
  return [...body.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
}

afterEach(() => {
  calls = [];
  fail = null;
  clearConnection();
});

describe("forms reducer wrappers", () => {
  test("every wrapper sends exactly the generated argument names", async () => {
    fakeConnection();
    const def = emptyDefinition("Opening");
    const formId = await createForm({ kind: "checklist", definition: def, organizationId: ORG });
    await updateFormDefinition(FORM, def, 2);
    await updateFormSettings(FORM, {
      audience: "assigned", perMember: "daily", responseLimit: 50, closesAt: new Date(1_700_000_000_000),
      trackCompletion: true, notifyOwner: false,
    });
    await setFormStatus(FORM, "open");
    await setFormPublicLink(FORM, true, true);
    await transferForm(FORM, "m2");
    await assignForm(FORM, "m2", "2026-10-07");
    await unassignForm(FORM, "m2");
    const responseId = await submitFormResponse({
      formId: FORM.toUpperCase(), answers: { q_aaaaaaaaaaaa: "x" }, surface: "store", actingMemberId: " m3 ",
      organizationId: ORG, date: "2026-10-06",
    });
    await reviewFormResponse(responseId, "reviewed", "ok");
    await deleteFormResponse(responseId);
    await deleteForm(FORM);

    for (const call of calls) expect(Object.keys(call.args).sort()).toEqual(generatedArgs(call.name));
    expect(calls.map((c) => c.name)).toEqual([
      "createForm", "updateFormDefinition", "updateFormSettings", "setFormStatus", "setFormPublicLink", "transferForm",
      "assignForm", "unassignForm", "submitFormResponse", "reviewFormResponse", "deleteFormResponse", "deleteForm",
    ]);
    expect(formId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(calls[0].args).toMatchObject({ organizationId: ORG, formId, kind: "checklist" });
    expect(JSON.parse(String(calls[0].args.definitionJson)).title).toBe("Opening");
    expect(calls[2].args.closesAt).toBe(1_700_000_000_000_000n);
    expect(calls[8].args).toEqual({
      organizationId: ORG, formId: FORM, responseId, answersJson: '{"q_aaaaaaaaaaaa":"x"}', date: "2026-10-06",
      surface: "store", actingMemberId: "m3",
    });
  });

  test("closesAt null or 0 means never", () => {
    expect(closesAtMicros(null)).toBe(0n);
    expect(closesAtMicros(0)).toBe(0n);
    expect(closesAtMicros(1500)).toBe(1_500_000n);
  });

  test("no connection or no reducer is a FormsClientError", async () => {
    await expect(setFormStatus(FORM, "open")).rejects.toMatchObject({ code: "not_connected" });
    setConnection({ reducers: {} } as never);
    const err = await setFormStatus(FORM, "open").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FormsClientError);
    expect(formsErrorKey(err)).toBe("forms.errors.not_published");
  });

  test("a module failure rejects with its message", async () => {
    fakeConnection();
    fail = new Error("[forms.conflict] Someone else saved this form");
    const err = await updateFormDefinition(FORM, emptyDefinition("x"), 1).catch((e: unknown) => e);
    expect(formsErrorKey(err)).toBe("forms.errors.conflict");
  });
});

describe("formsErrorKey", () => {
  test("forms codes, issue codes with a question, and unknown codes", () => {
    expect(formsErrorKey(new Error("[forms.already_submitted] You already answered"))).toBe("forms.errors.already_submitted");
    const issue = new Error("[forms.required] q_abcdefghijkl");
    expect(formsErrorKey(issue)).toBe("forms.errors.required");
    expect(formsErrorQuestionId(issue)).toBe("q_abcdefghijkl");
    expect(formsErrorKey(new Error("[forms.brand_new] later module"))).toBe("forms.errors.generic");
    expect(formsErrorCode(new Error("boom"))).toBeNull();
  });

  test("Drive failures keep the Drive copy", () => {
    expect(formsErrorKey(new Error("[drive.quota_exceeded] Storage is full"))).toBe("drive.errors.quotaExceeded");
    expect(formsErrorKey(new DriveClientError("too_large"))).toBe("drive.errors.tooLarge");
  });

  test("a caller who left the store, and anything else", () => {
    expect(formsErrorKey(new Error("Not an active member of this organization"))).toBe("forms.errors.forbidden");
    expect(formsErrorKey(new Error("boom"))).toBe("forms.errors.generic");
    expect(formsErrorKey(null)).toBe("forms.errors.generic");
  });
});

describe("parity and copy", () => {
  test("FORM_SERVER_ERROR_CODES = FormErrorCode of the module", () => {
    expect([...FORM_SERVER_ERROR_CODES].sort()).toEqual(unionLiterals(read("spacetimedb/src/forms/access.ts"), "FormErrorCode").sort());
  });

  test("FORM_ISSUE_CODES = FormIssueCode of lib/forms/schema.ts", () => {
    expect([...FORM_ISSUE_CODES].sort()).toEqual(unionLiterals(read("lib/forms/schema.ts"), "FormIssueCode").sort());
  });

  test("every code has an English draft string", () => {
    const draft = JSON.parse(read("scripts/i18n/drive/forms/en.json")) as { forms: { errors: Record<string, string> } };
    const codes = [...FORM_SERVER_ERROR_CODES, ...FORM_ISSUE_CODES, "not_connected", "not_published", "network", "generic"];
    expect(codes.filter((c) => !draft.forms.errors[c])).toEqual([]);
  });
});
