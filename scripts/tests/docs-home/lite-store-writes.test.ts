// What DocsLite's writes on /store send, end to end: lib/docs/create.ts → lib/spacetimedb/actions/drive.ts (captured
// from a fake connection) → the REAL Drive document reducers (spacetimedb/src/drive/documents.ts over the fake db).
// A new document belongs to the PIN operator, not the tablet account, and so does a rename made at the tablet
// (renameDocumentFor, used by the docs home and the editor).
import { afterAll, expect, test } from "bun:test";

import { createBlankDocument, createDocumentFromTemplate, renameDocumentFor, type DocPlacement } from "@/lib/docs/create";
import { setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";
import * as fake from "../drive/fake-db";
import { defineDriveDocumentReducers } from "@/spacetimedb/src/drive/documents";

type Reducer = (ctx: unknown, args: Record<string, unknown>) => void;
type Reducers = { createDriveDocument: Reducer; renameDriveDocument: Reducer };

const deps = fake.loadModule(["driveDeps"], { Timestamp: fake.FakeTimestamp }).driveDeps;
const stdb = fake.moduleStubs().spacetimedb;
const R = defineDriveDocumentReducers(stdb as never, deps as never) as unknown as Reducers;

/** The last reducer call the client made, by name. */
const calls = new Map<string, Record<string, unknown>>();
const capture = (name: string) => async (args: Record<string, unknown>) => void calls.set(name, args);
setConnection({
  reducers: { createDriveDocument: capture("createDriveDocument"), renameDriveDocument: capture("renameDriveDocument") },
} as never);

afterAll(() => {
  setConnection(null as never);
  setActiveOrgId("");
});

function sent(name: string): Record<string, unknown> {
  const args = calls.get(name);
  if (!args) throw new Error(`${name} was not called`);
  calls.delete(name);
  return args;
}

function session(db: fake.FakeDb, tablet: fake.FakeMember, operator: fake.FakeMember): void {
  db.insert("deviceOperatorSession", {
    identity: tablet.identity,
    organizationId: operator.organizationId,
    memberId: operator.memberId,
    memberName: "Operator",
    role: operator.role,
    resolvedAt: new fake.FakeTimestamp(db.nowMicros),
  });
}

function refusal(run: () => void): string {
  try {
    run();
  } catch (err) {
    return String((err as Error).message);
  }
  return "(no error)";
}

for (const account of ["owner", "staff"] as const) {
  test(`/store DocsLite on a ${account}-account tablet: documents are created for and renamed by the operator`, async () => {
    const { db, orgA } = fake.createDriveWorld();
    const tablet = account === "owner" ? orgA.owner : db.addMember({ organizationId: orgA.organizationId, role: "staff", displayName: "Tablet" });
    const operator = orgA.staff;
    setActiveOrgId(orgA.organizationId);
    const placement: DocPlacement = { space: "store", folderId: "", actingMemberId: operator.memberId };

    // A staff-account tablet without an operator session: acting is refused (an owner account needs none).
    if (account === "staff") {
      const refusedId = await createBlankDocument(placement);
      const args = sent("createDriveDocument");
      expect(refusal(() => db.run(R.createDriveDocument as never, tablet as never, args as never))).toContain("[drive.operator]");
      expect(db.find("document", refusedId)).toBeNull();
    }

    session(db, tablet, operator);
    const made = [
      () => createBlankDocument(placement),
      () => createDocumentFromTemplate("shiftHandover", { t: (k: string) => k, locale: "en", storeName: "A", authorName: "Op", placement }),
    ];
    for (const make of made) {
      const id = await make();
      db.run(R.createDriveDocument as never, tablet as never, sent("createDriveDocument") as never);
      expect(fake.documentWithFile(db, id)).toMatchObject({
        ownerMemberId: operator.memberId,
        lastEditorMemberId: operator.memberId,
        visibility: "org_edit",
        fileType: "doc",
        folderId: "",
      });
      expect(db.find("documentFile", id)).toMatchObject({ fileType: "doc", folderId: "" }); // a Drive document always has its row
    }

    // A rename at the tablet names the operator; the tablet account is never recorded as the editor.
    const id = await createBlankDocument(placement);
    db.run(R.createDriveDocument as never, tablet as never, sent("createDriveDocument") as never);
    db.advance(1_000_000n);
    await renameDocumentFor(id, "  Closing checklist  ", placement);
    const rename = sent("renameDriveDocument");
    expect(rename).toEqual({ documentId: id, title: "  Closing checklist  ", actingMemberId: operator.memberId });
    db.run(R.renameDriveDocument as never, tablet as never, rename as never);
    expect(db.find("document", id)).toMatchObject({ title: "Closing checklist", lastEditorMemberId: operator.memberId });
    expect(db.find("document", id)?.lastEditorMemberId).not.toBe(tablet.memberId);
  });
}

test("without a placement a rename goes through the Docs reducer, not Drive", async () => {
  const docsCalls: unknown[][] = [];
  setConnection({
    reducers: {
      renameDocument: async (args: unknown) => void docsCalls.push([args]),
      renameDriveDocument: capture("renameDriveDocument"),
    },
  } as never);
  await renameDocumentFor("1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11", "Notes", null);
  expect(calls.has("renameDriveDocument")).toBe(false);
  expect(docsCalls).toHaveLength(1);
});
