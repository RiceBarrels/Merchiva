// Isolated fixture for scripts/tests/plugins/install.test.ts — NOT auto-discovered by `bun test`. It replaces the Drive
// reducer wrapper with mock.module, so it runs in its own process.
//
// Covers createDriveDocFromTemplate (lib/drive/editors.ts): a store template is built in the creator's language with
// the store and author names, seeded through the real Docs seed, and created through createDriveDocument for the
// target and the actor (never the Docs createDocument); the title is the target's, else the template's; the create
// is marked (beforeCreate) right before it goes out; and a reducer failure comes back as itself.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { DriveDocTarget } from "@/lib/drive/types";

interface Call { name: string; args: unknown[] }
const calls: Call[] = [];
const named = (name: string) => calls.filter((c) => c.name === name).map((c) => c.args);
let failWith: unknown = null;
const NEW_ID = "00000000-0000-4000-8000-000000000100";

mock.module("@/lib/spacetimedb/actions/drive", () => ({
  createDriveDocument: async (...args: unknown[]) => {
    calls.push({ name: "createDriveDocument", args });
    if (failWith) throw failWith;
    return NEW_ID;
  },
}));
mock.module("@/lib/spacetimedb/actions", () => ({
  createDocument: async (...args: unknown[]) => {
    calls.push({ name: "createDocument", args });
    return "never";
  },
}));

const { createDriveDocFromTemplate } = await import("@/lib/drive/editors");
const { driveErrorKey } = await import("@/lib/drive/errors");

// Headings and labels come back as their key, so the seeded text shows which ones the template used.
const t = (key: string) => (key === "docs.templates.meetingNotes.title" ? "Meeting notes" : key);
const ORG = "0a0a0a0a-0000-4000-8000-000000000001";
const ME = "1b1b1b1b-0000-4000-8000-000000000001";
const FOLDER = "00000000-0000-4000-8000-000000000001";
const TARGET: DriveDocTarget = { organizationId: ORG, space: "store", folderId: FOLDER, actingMemberId: "op-1" };
const ctx = { t, locale: "en", storeName: "Downtown Deli", authorName: "Ana Ruiz" };

beforeEach(() => {
  calls.length = 0;
  failWith = null;
});

describe("createDriveDocFromTemplate", () => {
  test("seeds the template and creates it through createDriveDocument, for the target and the actor", async () => {
    expect(await createDriveDocFromTemplate("meetingNotes", TARGET, ctx)).toBe(NEW_ID);
    expect(named("createDocument")).toEqual([]);
    const [[input]] = named("createDriveDocument") as [[Record<string, unknown>]];
    expect(input).toMatchObject({
      organizationId: ORG, space: "store", folderId: FOLDER, ownerMemberId: "", actingMemberId: "op-1",
      fileType: "doc", title: "Meeting notes", templateId: "meetingNotes",
    });
    expect(input).not.toHaveProperty("visibility");
    expect(input.initialState).toBeInstanceOf(Uint8Array);
    expect((input.initialState as Uint8Array).byteLength).toBeGreaterThan(0);
    // The store name (and, where a template has one, the author) is written into the document once, at creation.
    expect(String(input.plainText)).toContain("Downtown Deli");
    expect(Number(input.wordCount)).toBeGreaterThan(0);
    await createDriveDocFromTemplate("storeSop", TARGET, ctx);
    const [, [sop]] = named("createDriveDocument") as [[unknown], [Record<string, unknown>]];
    expect(String(sop.plainText)).toContain("Ana Ruiz");
  });

  test("every store template seeds a valid document; a title on the target wins (trimmed), a blank one does not", async () => {
    for (const id of ["shiftHandover", "storeSop", "incidentReport", "weeklyChecklist"] as const) {
      await createDriveDocFromTemplate(id, { ...TARGET, ownerMemberId: ME, space: "my" }, ctx);
    }
    await createDriveDocFromTemplate("meetingNotes", { ...TARGET, title: "  Monday huddle " }, ctx);
    await createDriveDocFromTemplate("meetingNotes", { ...TARGET, title: "   " }, { ...ctx, storeName: null, authorName: null });
    const inputs = named("createDriveDocument").map(([input]) => input as Record<string, unknown>);
    expect(inputs.map((i) => i.templateId)).toEqual([
      "shiftHandover", "storeSop", "incidentReport", "weeklyChecklist", "meetingNotes", "meetingNotes",
    ]);
    expect(inputs.slice(0, 4).map((i) => [i.space, i.ownerMemberId])).toEqual(Array(4).fill(["my", ME]));
    expect(inputs.slice(0, 4).map((i) => i.title)).toEqual([
      "docs.templates.shiftHandover.title", "docs.templates.storeSop.title", "docs.templates.incidentReport.title",
      "docs.templates.weeklyChecklist.title",
    ]);
    expect(inputs[4].title).toBe("Monday huddle");
    expect(inputs[5].title).toBe("Meeting notes");
    expect(String(inputs[5].plainText)).not.toContain("Downtown Deli");
  });

  test("beforeCreate marks the create once, after the seed is built and right before it goes out", async () => {
    const marked = { ...ctx, beforeCreate: (withinMs?: number) => void calls.push({ name: "beforeCreate", args: withinMs === undefined ? [] : [withinMs] }) };
    await createDriveDocFromTemplate("storeSop", TARGET, marked);
    expect(calls.map((c) => c.name)).toEqual(["beforeCreate", "createDriveDocument"]);
    expect(calls[0].args).toEqual([]);
  });

  test("a reducer failure comes back as itself, so driveErrorKey has its copy", async () => {
    failWith = new Error("[drive.quota_exceeded] Storage is full");
    let caught: unknown = null;
    try {
      await createDriveDocFromTemplate("incidentReport", TARGET, ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failWith);
    expect(driveErrorKey(caught)).toBe("drive.errors.quotaExceeded");
  });
});
