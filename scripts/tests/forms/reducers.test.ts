// Forms reducers (spacetimedb/src/forms/{access,reducers,responses}.ts), design B.4: the real factories with the
// real `driveDeps` wiring of spacetimedb/src/index.ts, over the two-org fake database of the Drive tests.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DriveDeps } from "../../../spacetimedb/src/drive/context";
import { recomputeOrgStorage } from "../../../spacetimedb/src/drive/storage";
import type { DriveCtx, DriveSchema } from "../../../spacetimedb/src/drive/types";
import { defineFormReducers } from "../../../spacetimedb/src/forms/reducers";
import { formEditHref } from "@/components/forms/list/status";
import {
  FORM_MAX_ORG_ANSWER_BYTES, FORM_MAX_ORG_PUBLIC_ANSWER_BYTES, FORM_PUBLIC_MAX_PER_HOUR, FORM_PUBLIC_WINDOW_MICROS,
  FORM_RESPONSE_ROW_OVERHEAD_BYTES, utcDayKeyOfMicros, utf8ByteLength,
} from "../../../spacetimedb/src/forms/logic";
import {
  FakeTimestamp, SERVICE_IDENTITY, createDriveWorld, loadModule, moduleStubs, registerServiceIdentity,
  type FakeDb, type FakeIdentity, type FakeMember, type Row,
} from "../drive/fake-db";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const R = defineFormReducers(stdb, deps);
const uuid = (): string => crypto.randomUUID();
const DAY_MICROS = 86_400_000_000n;

const Q = (n: number) => `q_${n.toString(36).padStart(12, "0")}`;
const O = (n: number) => `o_${n.toString(36).padStart(8, "0")}`;
const def = (questions: unknown[], title = "Opening") =>
  JSON.stringify({ v: 1, title, description: "", questions, settings: { confirmation: "" } });
const TEXT_DEF = def([
  { id: Q(1), type: "short_text", title: "Name", required: true },
  { id: Q(2), type: "single_choice", title: "Shift", required: false, options: [{ id: O(1), label: "AM" }, { id: O(2), label: "PM" }] },
]);
const FILE_DEF = def([
  { id: Q(1), type: "short_text", title: "Name", required: false },
  { id: Q(3), type: "photo", title: "Photo", required: false },
  { id: Q(4), type: "file", title: "File", required: false },
]);

function errorOf(fn: () => void): string {
  try { fn(); } catch (error) { return String((error as Error).message); }
  return "(no error)";
}
function row(db: FakeDb, table: string, id: string): Row {
  const found = db.find(table, id);
  if (!found) throw new Error(`no ${table} ${id}`);
  return found;
}
/** The fake clock's UTC day (the client's store-local day in these tests). */
function today(db: FakeDb, offsetDays = 0): string {
  return utcDayKeyOfMicros(db.nowMicros + BigInt(offsetDays) * DAY_MICROS);
}
function create(db: FakeDb, by: FakeMember, o: { definitionJson?: string; kind?: string; formId?: string } = {}): string {
  const formId = o.formId ?? uuid();
  db.run(R.createForm, by, { organizationId: by.organizationId, formId, kind: o.kind ?? "form", definitionJson: o.definitionJson ?? TEXT_DEF });
  return formId;
}
function settings(db: FakeDb, by: FakeMember, formId: string, o: Record<string, unknown> = {}): void {
  db.run(R.updateFormSettings, by, {
    formId, audience: "members", perMember: "unlimited", responseLimit: 1000, closesAt: 0n, trackCompletion: false,
    notifyOwner: true, ...o,
  });
}
function openForm(db: FakeDb, by: FakeMember, o: { definitionJson?: string; kind?: string; settings?: Record<string, unknown> } = {}): string {
  const formId = create(db, by, o);
  if (o.settings) settings(db, by, formId, o.settings);
  db.run(R.setFormStatus, by, { formId, status: "open" });
  return formId;
}
function submit(
  db: FakeDb, by: FakeMember | FakeIdentity, formId: string,
  o: { answers?: unknown; responseId?: string; date?: string; surface?: string; actingMemberId?: string; org?: string } = {},
): string {
  const responseId = o.responseId ?? uuid();
  const organizationId = o.org ?? (row(db, "form", formId).organizationId as string);
  db.run(R.submitFormResponse, by, {
    organizationId, formId, responseId, answersJson: JSON.stringify(o.answers ?? { [Q(1)]: "Ana" }),
    date: o.date ?? today(db), surface: o.surface ?? "personal", actingMemberId: o.actingMemberId ?? "",
  });
  return responseId;
}
/** A ready file in `owner`'s My files (or as patched). */
function driveFile(db: FakeDb, owner: FakeMember, o: Record<string, unknown> = {}): string {
  const id = uuid();
  const now = new FakeTimestamp(db.nowMicros);
  db.insert("driveItem", {
    id, organizationId: owner.organizationId, adminScope: "scope", space: "my", parentId: "", kind: "file",
    name: "a.jpg", mimeType: "image/jpeg", sizeBytes: 1234n, blobKey: `org/${owner.organizationId}/${id}/b/a.jpg`,
    thumbKey: "", thumbBytes: 0n, etag: "e", ownerMemberId: owner.memberId, createdByMemberId: owner.memberId,
    uploaderIdentity: owner.identity, status: "ready", uploadExpiresAt: now, uploadAttempts: 0, trashed: false,
    trashRootId: "", trashedAt: undefined, trashedByMemberId: "", createdAt: now, updatedAt: now,
    lastEditorMemberId: owner.memberId, trashRootAt: 0n, ...o,
  });
  return id;
}
function operatorSession(db: FakeDb, tablet: FakeMember, operator: FakeMember): void {
  db.insert("deviceOperatorSession", {
    identity: tablet.identity, organizationId: operator.organizationId, memberId: operator.memberId,
    memberName: "Operator", role: operator.role, resolvedAt: new FakeTimestamp(db.nowMicros),
  });
}
const docBytes = (db: FakeDb, organizationId: string): bigint =>
  (db.find("orgStorageUsage", organizationId)?.docBytes as bigint | undefined) ?? 0n;

describe("createForm", () => {
  test("owners and managers create a draft with its meta row; the text counts in the store's docBytes", () => {
    const { db, orgA } = createDriveWorld();
    const formId = create(db, orgA.manager, { kind: "checklist" });
    const form = row(db, "form", formId);
    expect(form).toMatchObject({
      organizationId: orgA.organizationId, ownerMemberId: orgA.manager.memberId, status: "draft", audience: "members",
      memberVisible: false, version: 1, kind: "checklist", trackCompletion: true, publicEnabled: false, hasFileQuestions: false,
      title: "Opening", perMember: "unlimited", responseLimit: 1000, closesAt: 0n, notifyOwner: true,
    });
    expect(form.adminScope).not.toBe("");
    expect(form.definitionBytes).toBe(utf8ByteLength(form.definitionJson as string));
    expect(row(db, "formMeta", formId)).toMatchObject({ publicToken: "", responseCount: 0, adminScope: form.adminScope });
    expect(docBytes(db, orgA.organizationId)).toBe(BigInt(form.definitionBytes as number));
    // the caller's drive_admin_index row was self-healed (the admin read rules join it)
    expect(db.rows("driveAdminIndex").some((r) => r.adminScope === form.adminScope)).toBe(true);
  });

  test("staff, outsiders, bad ids, kinds and definitions are refused", () => {
    const { db, orgA, orgB } = createDriveWorld();
    expect(errorOf(() => create(db, orgA.staff))).toStartWith("[forms.forbidden]");
    const formId = uuid();
    expect(errorOf(() => db.run(R.createForm, orgB.owner, { organizationId: orgA.organizationId, formId, kind: "form", definitionJson: TEXT_DEF })))
      .toStartWith("[forms.forbidden]");
    expect(errorOf(() => create(db, orgA.owner, { formId: "NOT-A-UUID" }))).toStartWith("[forms.invalid]");
    expect(errorOf(() => create(db, orgA.owner, { kind: "poll" }))).toStartWith("[forms.invalid_settings]");
    expect(errorOf(() => create(db, orgA.owner, { definitionJson: def([]) }))).toStartWith("[forms.no_questions]");
    expect(errorOf(() => create(db, orgA.owner, { definitionJson: "{" }))).toStartWith("[forms.invalid_definition]");
    create(db, orgA.owner, { formId });
    expect(errorOf(() => create(db, orgA.owner, { formId }))).toStartWith("[forms.exists]");
    expect(db.rows("form")).toHaveLength(1);
  });
});

describe("updateFormDefinition", () => {
  test("bumps the version, refuses a stale one, and moves docBytes by the size difference", () => {
    const { db, orgA } = createDriveWorld();
    const formId = create(db, orgA.owner);
    const next = def([{ id: Q(1), type: "short_text", title: "Full name please", required: true }], "Renamed");
    db.run(R.updateFormDefinition, orgA.manager, { formId, definitionJson: next, expectedVersion: 1 });
    const form = row(db, "form", formId);
    expect(form).toMatchObject({ version: 2, title: "Renamed", updatedByMemberId: orgA.manager.memberId });
    expect(docBytes(db, orgA.organizationId)).toBe(BigInt(form.definitionBytes as number));
    expect(errorOf(() => db.run(R.updateFormDefinition, orgA.owner, { formId, definitionJson: next, expectedVersion: 1 })))
      .toStartWith("[forms.conflict]");
  });

  test("after a response a question keeps its type and is archived rather than removed", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner);
    submit(db, orgA.staff, formId);
    const retyped = def([
      { id: Q(1), type: "long_text", title: "Name", required: true },
      { id: Q(2), type: "single_choice", title: "Shift", required: false, options: [{ id: O(1), label: "AM" }, { id: O(2), label: "PM" }] },
    ]);
    expect(errorOf(() => db.run(R.updateFormDefinition, orgA.owner, { formId, definitionJson: retyped, expectedVersion: 1 })))
      .toBe(`[forms.question_type_changed] ${Q(1)}`);
    const removed = def([{ id: Q(1), type: "short_text", title: "Name", required: true }]);
    expect(errorOf(() => db.run(R.updateFormDefinition, orgA.owner, { formId, definitionJson: removed, expectedVersion: 1 })))
      .toBe(`[forms.question_removed] ${Q(2)}`);
    const archived = def([
      { id: Q(1), type: "short_text", title: "Name", required: true },
      { id: Q(2), type: "single_choice", title: "Shift", required: false, archived: true, options: [{ id: O(1), label: "AM" }, { id: O(2), label: "PM" }] },
    ]);
    db.run(R.updateFormDefinition, orgA.owner, { formId, definitionJson: archived, expectedVersion: 1 });
    expect(row(db, "form", formId).version).toBe(2);
  });

  test("staff get forbidden, another store's members get not_found", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const formId = create(db, orgA.owner);
    expect(errorOf(() => db.run(R.updateFormDefinition, orgA.staff, { formId, definitionJson: TEXT_DEF, expectedVersion: 1 })))
      .toStartWith("[forms.forbidden]");
    expect(errorOf(() => db.run(R.updateFormDefinition, orgB.owner, { formId, definitionJson: TEXT_DEF, expectedVersion: 1 })))
      .toStartWith("[forms.not_found]");
  });
});

describe("settings, status, public link, transfer, delete, assignments", () => {
  test("memberVisible follows status and audience", () => {
    const { db, orgA } = createDriveWorld();
    const formId = create(db, orgA.owner);
    db.run(R.setFormStatus, orgA.owner, { formId, status: "open" });
    expect(row(db, "form", formId).memberVisible).toBe(true);
    settings(db, orgA.owner, formId, { audience: "private" });
    expect(row(db, "form", formId).memberVisible).toBe(false);
    settings(db, orgA.owner, formId, { audience: "assigned", perMember: "weekly", responseLimit: 5, closesAt: 9n });
    expect(row(db, "form", formId)).toMatchObject({ memberVisible: true, perMember: "weekly", responseLimit: 5, closesAt: 9n });
    db.run(R.setFormStatus, orgA.owner, { formId, status: "archived" });
    expect(row(db, "form", formId).memberVisible).toBe(false);
    expect(errorOf(() => settings(db, orgA.owner, formId, { audience: "everyone" }))).toStartWith("[forms.invalid_settings]");
    expect(errorOf(() => settings(db, orgA.owner, formId, { responseLimit: 5001 }))).toStartWith("[forms.invalid_settings]");
    expect(errorOf(() => db.run(R.setFormStatus, orgA.owner, { formId, status: "live" }))).toStartWith("[forms.invalid_status]");
  });

  test("only an owner turns the public link on; it copies the form into form_public and follows edits", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.manager);
    expect(errorOf(() => db.run(R.setFormPublicLink, orgA.manager, { formId, enabled: true, rotate: false })))
      .toStartWith("[forms.forbidden]");
    db.run(R.setFormPublicLink, orgA.owner, { formId, enabled: true, rotate: false });
    const token = row(db, "formMeta", formId).publicToken as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(row(db, "formPublic", token)).toMatchObject({ scope: "service", formId, organizationId: orgA.organizationId, storeName: "Org A", status: "open", version: 1 });
    expect(row(db, "form", formId).publicEnabled).toBe(true);
    const next = def([{ id: Q(1), type: "short_text", title: "Name", required: true }, { id: Q(2), type: "single_choice", title: "Shift", required: false, options: [{ id: O(1), label: "AM" }, { id: O(2), label: "PM" }] }], "Public title");
    db.run(R.updateFormDefinition, orgA.owner, { formId, definitionJson: next, expectedVersion: 1 });
    expect(row(db, "formPublic", token)).toMatchObject({ title: "Public title", version: 2 });
    // a photo question cannot be added while the link is on
    expect(errorOf(() => db.run(R.updateFormDefinition, orgA.owner, { formId, definitionJson: FILE_DEF, expectedVersion: 2 })))
      .toStartWith("[forms.public_unsafe]");
    db.run(R.setFormPublicLink, orgA.owner, { formId, enabled: true, rotate: true });
    const rotated = row(db, "formMeta", formId).publicToken as string;
    expect(rotated).not.toBe(token);
    expect(db.find("formPublic", token)).toBeNull();
    expect(db.rows("formPublic")).toHaveLength(1);
    // a manager may turn it off
    db.run(R.setFormPublicLink, orgA.manager, { formId, enabled: false, rotate: false });
    expect(db.rows("formPublic")).toHaveLength(0);
    expect(row(db, "formMeta", formId).publicToken).toBe("");
    expect(row(db, "form", formId).publicEnabled).toBe(false);
  });

  test("a form with photo or file questions never goes public", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner, { definitionJson: FILE_DEF });
    expect(errorOf(() => db.run(R.setFormPublicLink, orgA.owner, { formId, enabled: true, rotate: false })))
      .toStartWith("[forms.public_unsafe]");
    expect(db.rows("formPublic")).toHaveLength(0);
  });

  test("transferForm moves ownership to another manager and rewrites every response", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner);
    const responseId = submit(db, orgA.staff, formId);
    expect(errorOf(() => db.run(R.transferForm, orgA.owner, { formId, newOwnerMemberId: orgA.staff.memberId })))
      .toStartWith("[forms.invalid]");
    db.run(R.transferForm, orgA.owner, { formId, newOwnerMemberId: orgA.manager.memberId });
    expect(row(db, "form", formId).ownerMemberId).toBe(orgA.manager.memberId);
    expect(row(db, "formMeta", formId).ownerMemberId).toBe(orgA.manager.memberId);
    expect(row(db, "formResponse", responseId).formOwnerMemberId).toBe(orgA.manager.memberId);
  });

  test("deleteForm cascades every row and gives the bytes back; Drive files stay", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner, { definitionJson: FILE_DEF, kind: "checklist" });
    const fileId = driveFile(db, orgA.staff);
    db.run(R.assignForm, orgA.owner, { formId, memberId: orgA.staff.memberId, dueDate: "" });
    submit(db, orgA.staff, formId, { answers: { [Q(3)]: { driveItemIds: [fileId] } } });
    expect(db.rows("formCompletion")).toHaveLength(1);
    db.run(R.deleteForm, orgA.manager, { formId });
    for (const t of ["form", "formMeta", "formResponse", "formAssignment", "formCompletion", "formPublic"]) {
      expect(db.rows(t)).toHaveLength(0);
    }
    expect(docBytes(db, orgA.organizationId)).toBe(0n);
    expect(db.find("driveItem", fileId)).not.toBeNull();
  });

  test("assignForm upserts one row per member; unassignForm removes it", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const formId = create(db, orgA.owner);
    db.run(R.assignForm, orgA.manager, { formId, memberId: orgA.staff.memberId, dueDate: "" });
    db.run(R.assignForm, orgA.manager, { formId, memberId: orgA.staff.memberId, dueDate: "2025-10-12" });
    expect(db.rows("formAssignment")).toEqual([expect.objectContaining({ id: `${formId}:${orgA.staff.memberId}`, dueDate: "2025-10-12" })]);
    expect(errorOf(() => db.run(R.assignForm, orgA.owner, { formId, memberId: orgB.staff.memberId, dueDate: "" })))
      .toStartWith("[forms.invalid]");
    expect(errorOf(() => db.run(R.assignForm, orgA.owner, { formId, memberId: orgA.staff.memberId, dueDate: "12/10" })))
      .toStartWith("[forms.invalid]");
    expect(errorOf(() => db.run(R.assignForm, orgA.staff, { formId, memberId: orgA.staff.memberId, dueDate: "" })))
      .toStartWith("[forms.forbidden]");
    db.run(R.unassignForm, orgA.owner, { formId, memberId: orgA.staff.memberId });
    expect(db.rows("formAssignment")).toHaveLength(0);
  });
});

describe("submitFormResponse", () => {
  test("a member's response: the row, the counters, the store's bytes and the owner's notification", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.manager);
    const before = docBytes(db, orgA.organizationId);
    const responseId = submit(db, orgA.staff, formId, { answers: { [Q(1)]: "Ana", [Q(2)]: O(2), unknownEmpty: "" } });
    const r = row(db, "formResponse", responseId);
    expect(r).toMatchObject({
      organizationId: orgA.organizationId, formId, formOwnerMemberId: orgA.manager.memberId, respondentMemberId: orgA.staff.memberId,
      respondentName: "Org A staff", formTitle: "Opening", formVersion: 1, source: "personal", fileItemIds: "[]", fileBytes: 0n,
      period: "", date: today(db), reviewStatus: "new",
    });
    expect((r.submittedByIdentity as FakeIdentity).hex).toBe(orgA.staff.identity.hex);
    expect(JSON.parse(r.answersJson as string)).toEqual({ [Q(1)]: "Ana", [Q(2)]: O(2) });
    expect(r.answerBytes).toBe(utf8ByteLength(r.answersJson as string) + FORM_RESPONSE_ROW_OVERHEAD_BYTES);
    expect(row(db, "formMeta", formId)).toMatchObject({ responseCount: 1, answerBytes: BigInt(r.answerBytes as number) });
    expect(docBytes(db, orgA.organizationId)).toBe(before + BigInt(r.answerBytes as number));
    const notes = db.rows("notification").filter((n) => n.type === "form_response");
    expect(notes).toHaveLength(1);
    expect((notes[0].targetId as FakeIdentity).hex).toBe(orgA.manager.identity.hex);
    // The edit page reads `view`; the link must be the one formEditHref builds, or it opens on Build.
    expect(notes[0].link).toBe(formEditHref(formId, "responses"));
  });

  test("a replay of the same id by the same sender is a no-op; by anyone else it is refused", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner);
    const responseId = submit(db, orgA.staff, formId);
    submit(db, orgA.staff, formId, { responseId });
    expect(row(db, "formMeta", formId).responseCount).toBe(1);
    expect(errorOf(() => submit(db, orgA.manager, formId, { responseId }))).toStartWith("[forms.exists]");
  });

  test("checks 2–5: open and not closed, audience, date within a day, once per period", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const draft = create(db, orgA.owner);
    expect(errorOf(() => submit(db, orgA.staff, draft))).toStartWith("[forms.not_open]");
    const closing = openForm(db, orgA.owner, { settings: { closesAt: db.nowMicros + 10n } });
    db.advance(100n);
    expect(errorOf(() => submit(db, orgA.staff, closing))).toStartWith("[forms.closed]");
    const assigned = openForm(db, orgA.owner, { settings: { audience: "assigned" } });
    expect(errorOf(() => submit(db, orgA.staff, assigned))).toStartWith("[forms.not_assigned]");
    db.run(R.assignForm, orgA.owner, { formId: assigned, memberId: orgA.staff.memberId, dueDate: "" });
    submit(db, orgA.staff, assigned);
    const privateForm = openForm(db, orgA.owner, { settings: { audience: "private" } });
    expect(errorOf(() => submit(db, orgA.staff, privateForm))).toStartWith("[forms.forbidden]");
    submit(db, orgA.manager, privateForm);
    const daily = openForm(db, orgA.owner, { settings: { perMember: "daily" } });
    expect(errorOf(() => submit(db, orgA.staff, daily, { date: today(db, 3) }))).toStartWith("[forms.invalid_date]");
    // The fake clock is 08:53 UTC: UTC+14 is still on today, so tomorrow is nobody's day yet.
    expect(errorOf(() => submit(db, orgA.staff, daily, { date: today(db, 1) }))).toStartWith("[forms.invalid_date]");
    submit(db, orgA.staff, daily, { date: today(db, -1) });
    submit(db, orgA.staff, daily);
    expect(errorOf(() => submit(db, orgA.staff, daily))).toStartWith("[forms.already_submitted]");
    const once = openForm(db, orgA.owner, { settings: { perMember: "once" } });
    submit(db, orgA.staff, once);
    expect(errorOf(() => submit(db, orgA.staff, once, { date: today(db, -1) }))).toStartWith("[forms.already_submitted]");
    // another store's member, or the right form under the wrong organization
    expect(errorOf(() => submit(db, orgB.staff, once))).toStartWith("[forms.forbidden]");
    expect(errorOf(() => submit(db, orgB.staff, once, { org: orgB.organizationId }))).toStartWith("[forms.not_found]");
  });

  test("check 6: answers against the definition and the response cap", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner, { settings: { responseLimit: 1 } });
    expect(errorOf(() => submit(db, orgA.staff, formId, { answers: { [Q(2)]: O(1) } }))).toBe(`[forms.required] ${Q(1)}`);
    expect(errorOf(() => submit(db, orgA.staff, formId, { answers: { [Q(1)]: "A", [Q(2)]: O(9) } }))).toBe(`[forms.unknown_option] ${Q(2)}`);
    expect(errorOf(() => submit(db, orgA.staff, formId, { answers: { [Q(1)]: "A", [Q(9)]: "x" } }))).toBe(`[forms.unknown_question] ${Q(9)}`);
    submit(db, orgA.staff, formId);
    expect(errorOf(() => submit(db, orgA.manager, formId))).toStartWith("[forms.response_limit]");
  });
});

describe("file answers and store tablets", () => {
  test("check 7: only ready, untrashed files in the respondent's own My files; sizes come from the rows", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner, { definitionJson: FILE_DEF });
    const photo = driveFile(db, orgA.staff);
    const pdf = driveFile(db, orgA.staff, { name: "a.pdf", mimeType: "application/pdf", sizeBytes: 100n });
    const responseId = submit(db, orgA.staff, formId, { answers: { [Q(3)]: { driveItemIds: [photo] }, [Q(4)]: { driveItemIds: [pdf] } } });
    expect(row(db, "formResponse", responseId)).toMatchObject({ fileItemIds: JSON.stringify([photo, pdf]), fileBytes: 1334n });
    expect(row(db, "formMeta", formId)).toMatchObject({ fileBytes: 1334n, fileCount: 2 });
    const refused: Array<[string, string]> = [
      ["someone else's file", driveFile(db, orgA.manager)],
      ["a trashed file", driveFile(db, orgA.staff, { trashed: true })],
      ["a pending upload", driveFile(db, orgA.staff, { status: "pending" })],
      ["a Store-space file", driveFile(db, orgA.staff, { space: "store" })],
      ["a missing file", uuid()],
    ];
    for (const [, id] of refused) {
      expect(errorOf(() => submit(db, orgA.staff, formId, { answers: { [Q(4)]: { driveItemIds: [id] } } }))).toStartWith("[forms.file_not_found]");
    }
    // a photo answer must be an image
    expect(errorOf(() => submit(db, orgA.staff, formId, { answers: { [Q(3)]: { driveItemIds: [pdf] } } }))).toStartWith("[forms.file_not_found]");
    expect(row(db, "formMeta", formId).responseCount).toBe(1);
  });

  test("a staff-account store tablet may not attach files, acting or not", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner, { definitionJson: FILE_DEF });
    const own = driveFile(db, orgA.staff);
    expect(errorOf(() => submit(db, orgA.staff, formId, { surface: "store", answers: { [Q(3)]: { driveItemIds: [own] } } })))
      .toBe(`[forms.files_not_allowed] ${Q(3)}`);
    const operator = db.addMember({ organizationId: orgA.organizationId, displayName: "Bo" });
    operatorSession(db, orgA.staff, operator);
    const opFile = driveFile(db, operator);
    expect(errorOf(() => submit(db, orgA.staff, formId, { surface: "personal", actingMemberId: operator.memberId, answers: { [Q(3)]: { driveItemIds: [opFile] } } })))
      .toBe(`[forms.files_not_allowed] ${Q(3)}`);    // Claiming the phone surface for itself does not help: the tablet's own operator session gives it away.
    expect(errorOf(() => submit(db, orgA.staff, formId, { surface: "personal", actingMemberId: "", answers: { [Q(3)]: { driveItemIds: [own] } } })))
      .toBe(`[forms.files_not_allowed] ${Q(3)}`);
  });

  test("check 1: a tablet answers for its operator with a fresh PIN session; a manager-account tablet without one", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const formId = openForm(db, orgA.owner, { definitionJson: FILE_DEF });
    const operator = db.addMember({ organizationId: orgA.organizationId, displayName: "Bo" });
    expect(errorOf(() => submit(db, orgA.staff, formId, { surface: "store", actingMemberId: operator.memberId })))
      .toStartWith("[forms.operator]");
    operatorSession(db, orgA.staff, operator);
    const viaStaff = submit(db, orgA.staff, formId, { surface: "store", actingMemberId: operator.memberId });
    expect(row(db, "formResponse", viaStaff)).toMatchObject({ respondentMemberId: operator.memberId, respondentName: "Bo", source: "store" });
    expect((row(db, "formResponse", viaStaff).submittedByIdentity as FakeIdentity).hex).toBe(orgA.staff.identity.hex);
    const opFile = driveFile(db, operator);
    const viaManager = submit(db, orgA.manager, formId, { surface: "store", actingMemberId: operator.memberId, answers: { [Q(3)]: { driveItemIds: [opFile] } } });
    expect(row(db, "formResponse", viaManager).fileBytes).toBe(1234n);
    expect(errorOf(() => submit(db, orgA.manager, formId, { actingMemberId: orgB.staff.memberId }))).toStartWith("[forms.operator]");
  });
});

describe("completions, review and deleting a response", () => {
  test("trackCompletion writes one completion per period; deleting the response removes it and the counters", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner, { kind: "checklist", settings: { trackCompletion: true, perMember: "daily" } });
    const responseId = submit(db, orgA.staff, formId);
    const key = `${formId}:${today(db)}:${orgA.staff.memberId}`;
    expect(row(db, "formCompletion", key)).toMatchObject({ memberName: "Org A staff", period: today(db), date: today(db) });
    const before = docBytes(db, orgA.organizationId);
    const bytes = BigInt(row(db, "formResponse", responseId).answerBytes as number);
    expect(errorOf(() => db.run(R.deleteFormResponse, orgA.staff, { responseId }))).toStartWith("[forms.forbidden]");
    db.run(R.deleteFormResponse, orgA.owner, { responseId });
    expect(db.find("formCompletion", key)).toBeNull();
    expect(row(db, "formMeta", formId)).toMatchObject({ responseCount: 0, answerBytes: 0n });
    expect(docBytes(db, orgA.organizationId)).toBe(before - bytes);
    submit(db, orgA.staff, formId);
  });

  test("reviewFormResponse: the form owner or a manager; staff and other stores cannot", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const formId = openForm(db, orgA.owner);
    const responseId = submit(db, orgA.staff, formId);
    db.run(R.reviewFormResponse, orgA.manager, { responseId, reviewStatus: "reviewed", reviewNote: "  Thanks " });
    const r = row(db, "formResponse", responseId);
    expect(r.reviewStatus).toBe("reviewed");
    expect("reviewNote" in r || "reviewedByName" in r).toBe(false);
    expect(row(db, "formResponseReview", responseId)).toMatchObject({
      reviewNote: "Thanks", reviewedByName: "Org A manager", noteBytes: 6, formId, adminScope: r.adminScope,
    });
    expect(errorOf(() => db.run(R.reviewFormResponse, orgA.staff, { responseId, reviewStatus: "new", reviewNote: "" }))).toStartWith("[forms.forbidden]");
    expect(errorOf(() => db.run(R.reviewFormResponse, orgB.owner, { responseId, reviewStatus: "new", reviewNote: "" }))).toStartWith("[forms.not_found]");
    expect(errorOf(() => db.run(R.reviewFormResponse, orgA.owner, { responseId, reviewStatus: "done", reviewNote: "" }))).toStartWith("[forms.invalid]");
    expect(errorOf(() => db.run(R.reviewFormResponse, orgA.owner, { responseId, reviewStatus: "new", reviewNote: "x".repeat(2001) }))).toStartWith("[forms.invalid]");
  });
});

describe("serviceSubmitPublicFormResponse", () => {
  function publicForm(db: FakeDb, owner: FakeMember): { formId: string; token: string } {
    const formId = openForm(db, owner);
    db.run(R.setFormPublicLink, owner, { formId, enabled: true, rotate: false });
    return { formId, token: row(db, "formMeta", formId).publicToken as string };
  }
  const publicSubmit = (db: FakeDb, sender: FakeIdentity | FakeMember, token: string, o: { responseId?: string; date?: string } = {}): string => {
    const responseId = o.responseId ?? uuid();
    db.run(R.serviceSubmitPublicFormResponse, sender, {
      token, responseId, answersJson: JSON.stringify({ [Q(1)]: "Guest" }), date: o.date ?? today(db),
    });
    return responseId;
  };

  test("only the service identity, only with the live token; stored with no member and no files", () => {
    const { db, orgA } = createDriveWorld();
    const { formId, token } = publicForm(db, orgA.owner);
    expect(errorOf(() => publicSubmit(db, orgA.owner, token))).toStartWith("[forms.forbidden]");
    expect(errorOf(() => publicSubmit(db, SERVICE_IDENTITY, token))).toStartWith("[forms.forbidden]");
    registerServiceIdentity(db);
    const responseId = publicSubmit(db, SERVICE_IDENTITY, token);
    expect(row(db, "formResponse", responseId)).toMatchObject({
      formId, respondentMemberId: "", respondentName: "", source: "public", period: "", fileItemIds: "[]",
      formOwnerMemberId: orgA.owner.memberId,
    });
    publicSubmit(db, SERVICE_IDENTITY, token, { responseId });
    expect(row(db, "formMeta", formId)).toMatchObject({ responseCount: 1, publicWindowCount: 1 });
    expect(errorOf(() => publicSubmit(db, SERVICE_IDENTITY, "f".repeat(64)))).toStartWith("[forms.not_found]");
    expect(errorOf(() => publicSubmit(db, SERVICE_IDENTITY, "x"))).toStartWith("[forms.not_found]");
    expect(errorOf(() => publicSubmit(db, SERVICE_IDENTITY, token, { date: today(db, -2) }))).toStartWith("[forms.invalid_date]");
    db.run(R.setFormStatus, orgA.owner, { formId, status: "closed" });
    expect(errorOf(() => publicSubmit(db, SERVICE_IDENTITY, token))).toStartWith("[forms.not_open]");
    db.run(R.setFormStatus, orgA.owner, { formId, status: "open" });
    db.run(R.setFormPublicLink, orgA.owner, { formId, enabled: false, rotate: false });
    expect(errorOf(() => publicSubmit(db, SERVICE_IDENTITY, token))).toStartWith("[forms.not_found]");
  });

  test("the hourly cap per form, and a fresh window after an hour", () => {
    const { db, orgA } = createDriveWorld();
    registerServiceIdentity(db);
    const { formId, token } = publicForm(db, orgA.owner);
    for (let i = 0; i < FORM_PUBLIC_MAX_PER_HOUR; i++) publicSubmit(db, SERVICE_IDENTITY, token);
    expect(errorOf(() => publicSubmit(db, SERVICE_IDENTITY, token))).toStartWith("[forms.rate_limited]");
    expect(row(db, "formMeta", formId).responseCount).toBe(FORM_PUBLIC_MAX_PER_HOUR);
    // The next hour still counts the last one in full: no burst of 2× across the boundary.
    db.advance(FORM_PUBLIC_WINDOW_MICROS);
    expect(errorOf(() => publicSubmit(db, SERVICE_IDENTITY, token))).toStartWith("[forms.rate_limited]");
    db.advance(FORM_PUBLIC_WINDOW_MICROS);
    publicSubmit(db, SERVICE_IDENTITY, token);
    expect(row(db, "formMeta", formId)).toMatchObject({
      publicWindowCount: 1, publicPrevWindowCount: 0, responseCount: FORM_PUBLIC_MAX_PER_HOUR + 1,
      publicResponseCount: FORM_PUBLIC_MAX_PER_HOUR + 1,
    });
  });
});

describe("budgets, ownership by role and per-period marks", () => {
  function publicLink(db: FakeDb, owner: FakeMember, o: { settings?: Record<string, unknown> } = {}): { formId: string; token: string } {
    const formId = openForm(db, owner, o);
    db.run(R.setFormPublicLink, owner, { formId, enabled: true, rotate: false });
    return { formId, token: row(db, "formMeta", formId).publicToken as string };
  }
  const anonymous = (db: FakeDb, token: string): void =>
    db.run(R.serviceSubmitPublicFormResponse, SERVICE_IDENTITY, {
      token, responseId: uuid(), answersJson: JSON.stringify({ [Q(1)]: "Guest" }), date: today(db),
    });

  test("public responses use their own byte budget and never take the members' response limit", () => {
    const { db, orgA } = createDriveWorld();
    registerServiceIdentity(db);
    const { formId, token } = publicLink(db, orgA.owner, { settings: { responseLimit: 2 } });
    anonymous(db, token);
    anonymous(db, token);
    expect(errorOf(() => anonymous(db, token))).toStartWith("[forms.response_limit]");
    // Members still have their two.
    submit(db, orgA.staff, formId);
    submit(db, orgA.manager, formId);
    expect(errorOf(() => submit(db, orgA.owner, formId))).toStartWith("[forms.response_limit]");
    expect(row(db, "formMeta", formId)).toMatchObject({ responseCount: 4, publicResponseCount: 2 });
    // The public budget is full: anonymous traffic is refused, members are not.
    const other = publicLink(db, orgA.owner);
    db.patch("formMeta", formId, { publicAnswerBytes: BigInt(FORM_MAX_ORG_PUBLIC_ANSWER_BYTES), answerBytes: BigInt(FORM_MAX_ORG_PUBLIC_ANSWER_BYTES) + 4096n });
    expect(errorOf(() => anonymous(db, other.token))).toStartWith("[forms.org_storage_full]");
    submit(db, orgA.staff, other.formId);
    // The members' budget full: members are refused, the public link is not affected by it.
    db.patch("formMeta", formId, { publicAnswerBytes: 0n, answerBytes: BigInt(FORM_MAX_ORG_ANSWER_BYTES) });
    expect(errorOf(() => submit(db, orgA.manager, other.formId))).toStartWith("[forms.org_storage_full]");
    anonymous(db, other.token);
  });

  test("the public link never pushes the store over its Drive quota", () => {
    const { db, orgA } = createDriveWorld();
    registerServiceIdentity(db);
    const { token } = publicLink(db, orgA.owner);
    db.patch("orgStorageUsage", orgA.organizationId, { docBytes: 10n * 1024n * 1024n * 1024n });
    expect(errorOf(() => anonymous(db, token))).toStartWith("[drive.quota_exceeded]");
  });

  test("a form owner demoted to staff can no longer review or delete its responses, nor is notified", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.manager);
    const responseId = submit(db, orgA.staff, formId);
    db.patch("orgMember", orgA.manager.memberId, { role: "staff" });
    expect(errorOf(() => db.run(R.reviewFormResponse, orgA.manager, { responseId, reviewStatus: "reviewed", reviewNote: "" })))
      .toStartWith("[forms.forbidden]");
    expect(errorOf(() => db.run(R.deleteFormResponse, orgA.manager, { responseId }))).toStartWith("[forms.forbidden]");
    const notified = db.rows("notification").filter((n) => n.type === "form_response").length;
    submit(db, orgA.owner, formId);
    expect(db.rows("notification").filter((n) => n.type === "form_response")).toHaveLength(notified);
    db.run(R.deleteFormResponse, orgA.owner, { responseId });
  });

  test("a review note is charged to the store and removed with its response", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner);
    const responseId = submit(db, orgA.staff, formId);
    const before = docBytes(db, orgA.organizationId);
    const meta = row(db, "formMeta", formId).answerBytes as bigint;
    db.run(R.reviewFormResponse, orgA.owner, { responseId, reviewStatus: "reviewed", reviewNote: "été" });
    expect(row(db, "formMeta", formId).answerBytes).toBe(meta + 5n);
    expect(docBytes(db, orgA.organizationId)).toBe(before + 5n);
    db.run(R.reviewFormResponse, orgA.owner, { responseId, reviewStatus: "reviewed", reviewNote: "" });
    expect(db.find("formResponseReview", responseId)).toBeNull();
    expect(row(db, "formMeta", formId).answerBytes).toBe(meta);
    db.run(R.reviewFormResponse, orgA.owner, { responseId, reviewStatus: "reviewed", reviewNote: "ok" });
    db.run(R.deleteFormResponse, orgA.owner, { responseId });
    expect(db.find("formResponseReview", responseId)).toBeNull();
    expect(row(db, "formMeta", formId).answerBytes).toBe(0n);
    expect(docBytes(db, orgA.organizationId)).toBe(before - meta);
  });

  test("an empty response still costs its row overhead", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner, { definitionJson: def([{ id: Q(1), type: "short_text", title: "Note", required: false }]) });
    const responseId = submit(db, orgA.staff, formId, { answers: {} });
    expect(row(db, "formResponse", responseId).answerBytes).toBe(2 + FORM_RESPONSE_ROW_OVERHEAD_BYTES);
  });

  test("the once/daily check is a per-(form, period, member) mark, written without trackCompletion and freed on delete", () => {
    const { db, orgA } = createDriveWorld();
    const daily = openForm(db, orgA.owner, { settings: { perMember: "daily" } });
    const other = openForm(db, orgA.owner);
    for (let i = 0; i < 5; i++) submit(db, orgA.staff, other);
    const first = submit(db, orgA.staff, daily);
    const key = `${daily}:${today(db)}:${orgA.staff.memberId}`;
    expect(row(db, "formPeriodMark", key)).toMatchObject({ formId: daily, memberId: orgA.staff.memberId, count: 1 });
    expect(db.find("formCompletion", key)).toBeNull();
    expect(errorOf(() => submit(db, orgA.staff, daily))).toStartWith("[forms.already_submitted]");
    db.run(R.deleteFormResponse, orgA.owner, { responseId: first });
    expect(db.find("formPeriodMark", key)).toBeNull();
    submit(db, orgA.staff, daily);
    // An unlimited form counts several per day; its completion goes only with the last of them.
    const tracked = openForm(db, orgA.owner, { settings: { trackCompletion: true } });
    const a = submit(db, orgA.staff, tracked);
    const b = submit(db, orgA.staff, tracked);
    const tkey = `${tracked}:${today(db)}:${orgA.staff.memberId}`;
    expect(row(db, "formPeriodMark", tkey).count).toBe(2);
    db.run(R.deleteFormResponse, orgA.owner, { responseId: a });
    expect(db.find("formCompletion", tkey)).not.toBeNull();
    db.run(R.deleteFormResponse, orgA.owner, { responseId: b });
    expect(db.find("formCompletion", tkey)).toBeNull();
    expect(db.find("formPeriodMark", tkey)).toBeNull();
    // deleteForm takes its marks and reviews along.
    db.run(R.deleteForm, orgA.owner, { formId: daily });
    expect(db.rows("formPeriodMark").filter((m) => m.formId === daily)).toHaveLength(0);
  });
});

describe("storage and wiring", () => {
  test("recomputeOrgStorage counts form definitions and answers in docBytes, as the reducers do", () => {
    const { db, orgA } = createDriveWorld();
    const formId = openForm(db, orgA.owner);
    submit(db, orgA.staff, formId);
    const live = docBytes(db, orgA.organizationId);
    expect(live).toBeGreaterThan(0n);
    db.patch("orgStorageUsage", orgA.organizationId, { docBytes: 0n });
    db.transact(() => recomputeOrgStorage(db.ctx(orgA.owner.identity) as unknown as DriveCtx, orgA.organizationId));
    expect(docBytes(db, orgA.organizationId)).toBe(live);
    expect(db.find("orgStorageUsage", orgA.organizationId)?.docCount).toBe(0);
  });

  test("index.ts exports every forms reducer from defineFormReducers", () => {
    const src = readFileSync(join(import.meta.dir, "../../../spacetimedb/src/index.ts"), "utf8");
    const wired = /export const \{([^}]*)\} = defineFormReducers\(spacetimedb, driveDeps\);/.exec(src);
    expect(wired).not.toBeNull();
    const names = (wired?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean).sort();
    expect(names).toEqual(Object.keys(R).sort());
  });
});
